// server/repository.mjs — Repository Pattern + Unit of Work فوق store المتزامن.
// لا يغيّر مسلك المزامنة الحالي: لا يزال store هو الوسيط، والدمج يحترم _mtime وشواهد الحذف.

import { mergeById, mtimeOf } from './mergeCore.mjs';
import { COLLECTION_KEYS } from './core.mjs';

const TOMB_KEY = 'rcerp_deleted_ids';

// ---------------------------------------------------------------------------
// Repository عام لأي مجموعة (collection): يلتف حول store.getKV/setKV مع
// الحفاظ على دلالات المزامنة (الدمج بالمعرّف + شواهد الحذف + _mtime).
// ---------------------------------------------------------------------------
export class CollectionRepository {
  constructor(store, key, options = {}) {
    this.store = store;
    this.key = key;
    this.tombKey = options.tombKey || TOMB_KEY;
    this.stamp = options.stamp !== false; // يضيف _mtime إن غابت
  }

  read() {
    const arr = this.store.getKV(this.key);
    return Array.isArray(arr) ? arr : [];
  }

  all() {
    return this.read();
  }

  count() {
    return this.read().length;
  }

  byId(id) {
    const entries = this.read();
    return entries.find((r) => r && r.id === id) || null;
  }

  find(predicate) {
    return this.read().filter(predicate);
  }

  cached() {
    return this.read().map((r) => ({ ...r }));
  }

  tombstones() {
    const arr = this.store.getKV(this.tombKey);
    return new Set(Array.isArray(arr) ? arr : []);
  }

  stampIfNeeded(record) {
    if (record && this.stamp && !mtimeOf(record)) return { ...record, _mtime: Date.now() };
    return record;
  }

  // دمج سجل (سجلات) بعد التحقق من شواهد الحذف ثم كتابة المجموعة بأحدثية صحيحة.
  upsert(record, options = {}) {
    if (!record || record.id === undefined) return null;
    if (this.tombstones().has(record.id)) return null; // محذوف نهائياً — لا يعود
    const stamped = this.stampIfNeeded(record);
    const current = this.cached();
    const merged = mergeById(current, [stamped], this.tombstones());
    this.store.setKV(this.key, merged);
    return options.return && stamped;
  }

  upsertMany(records, options = {}) {
    const allowed = (records || [])
      .filter((r) => r && r.id !== undefined && !this.tombstones().has(r.id))
      .map((r) => this.stampIfNeeded(r));
    if (allowed.length === 0) return null;
    const current = this.cached();
    const merged = mergeById(current, allowed, this.tombstones());
    this.store.setKV(this.key, merged);
    return options.return && allowed;
  }

  // حذف نهائي: يسجّل شاهد الحذف ويُخرج السجل من كل مجموعات المشاهدات.
  remove(id) {
    if (id === undefined) return;
    const tombstones = this.tombstones();
    if (!tombstones.has(id)) {
      tombstones.add(id);
      this.store.setKV(this.tombKey, Array.from(tombstones));
    }
    // شاهد الحذف مشترك لكل المجموعات: أي سجل بهذا المعرّف يُطهر من كل مكان.
    for (const ck of COLLECTION_KEYS) {
      if (ck === this.tombKey) continue;
      const arr = this.store.getKV(ck);
      if (!Array.isArray(arr)) continue;
      const next = arr.filter((r) => !(r && r.id !== undefined && r.id === id));
      if (next.length !== arr.length) this.store.setKV(ck, next);
    }
  }

  removeMany(ids) {
    for (const id of ids || []) this.remove(id);
  }

  // استبدال كامل (يدوي عمدي — لا يُستخدم في مسارات المزامنة).
  replaceAll(records) {
    const arr = Array.isArray(records) ? records : [];
    this.store.setKV(this.key, arr.map((r) => this.stampIfNeeded(r)));
    return arr.length;
  }
}

// ---------------------------------------------------------------------------
// Unit of Work: يجمّع قُراءات/كتابات عدة مجموعات في "أمر واحد" —
// - القُراءات بين `begin` و `commit` تمس الكاش المرحلي فيشاهد المستدعي نفس النتيجة.
// - commit يكتب كل المجموعات المتغيّرة دفعة واحدة (rev +1 فقط لكل دفعة عبر setKVMany).
// - rollback يلغي كل شيء دون لمس القاعدة.
// تبقى الأوامر المتزامنة المرسلة للـ PostgreSQL عبر setKVMany مشغّلة داخل معاملة
// واحدة (prisma.$transaction / SQLite BEGIN…COMMIT) فليس هناك حالة نصف مكتوبة.
// ---------------------------------------------------------------------------
export class UnitOfWork {
  constructor(store) {
    this.store = store;
    this.staged = new Map(); // key -> سجل المجموعة المرحلية (نسخة كاملة)
    this.touched = new Set();
    this.open = false;
  }

  // يفتح الدفعة؛ القراءات خلالها تمس staging أولاً إن وُجد.
  begin() {
    if (this.open) throw new Error('UnitOfWork already open');
    this.open = true;
    this.staged.clear();
    this.touched.clear();
    return this;
  }

  stagedStore() {
    const proxy = {
      getKV: (key) => {
        if (this.staged.has(key)) return this.staged.get(key);
        const v = this.store.getKV(key);
        this.staged.set(key, v === undefined ? null : v);
        return this.staged.get(key);
      },
      setKV: (key, value) => {
        this.staged.set(key, value);
        this.touched.add(key);
      },
    };
    return proxy;
  }

  repository(key, options) {
    return new CollectionRepository(this.stagedStore(), key, options);
  }

  // يكتب التغييرات المجمعة؛ يُعاد التراجع تلقائياً عند أي خطأ.
  commit() {
    if (!this.open) throw new Error('UnitOfWork not open');
    try {
      if (this.touched.size > 0) {
        const batch = new Map();
        for (const key of this.touched) batch.set(key, this.staged.get(key));
        this.store.setKVMany(batch);
      }
      this.open = false;
      this.staged.clear();
      this.touched.clear();
      return true;
    } catch (err) {
      this.open = false;
      this.staged.clear();
      this.touched.clear();
      throw err;
    }
  }

  rollback() {
    if (!this.open) throw new Error('UnitOfWork not open');
    this.open = false;
    this.staged.clear();
    this.touched.clear();
  }
}