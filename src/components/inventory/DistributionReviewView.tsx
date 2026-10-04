import React, { useMemo, useState } from 'react';
import { Inbox, CheckCircle2, XCircle, Eye, RefreshCw, AlertTriangle, PenLine, Save, Building2, Package } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Modal, inputCls } from '../ui';
import { fmt, fmtMoney } from '../../utils/helpers';
import type { Distribution, DistributionRow } from '../../types';

const DIST_STATUS_LABELS: Record<string, string> = {
  pending: 'بانتظار المراجعة',
  approved: 'تم تحويلها',
  rejected: 'مرفوضة',
};

const CONF_META: Record<string, { label: string; cls: string }> = {
  exact: { label: '✓ مطابق', cls: 'bg-emerald-100 text-emerald-700' },
  alias: { label: 'مرادف محفوظ', cls: 'bg-sky-100 text-sky-700' },
  fuzzy: { label: '≈ قريب', cls: 'bg-amber-100 text-amber-700' },
  none: { label: '؟ بلا تطابق', cls: 'bg-rose-100 text-rose-600' },
};

const roundQty = (x: number) => Math.round((x + Number.EPSILON) * 1000) / 1000;

export const DistributionReviewView: React.FC = () => {
  const {
    distributions, approveDistribution, rejectDistribution, updateDistribution, branches, can,
    rawMaterials, getLastPurchaseCost,
  } = useApp();

  const [filterStatus, setFilterStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [viewDist, setViewDist] = useState<Distribution | null>(null);
  const [edit, setEdit] = useState<Distribution | null>(null);
  const [editOriginal, setEditOriginal] = useState<Distribution | null>(null);

  const branchName = (id: string) => (id === 'b-ck' ? 'المطبخ المركزي' : branches.find((b) => b.id === id)?.nameAr || id);

  const itemName = (d: Distribution) => d.itemName || (d.rawMaterialId ? rawMaterials.find((r) => r.id === d.rawMaterialId)?.nameAr || d.rawMaterialId : '');

  const filtered = useMemo(() => distributions.filter((d) => {
    if (filterStatus !== 'all' && d.status !== filterStatus) return false;
    if (search.trim()) {
      const q = search.trim();
      const hay = `${branchName(d.fromBranchId)} ${itemName(d)} ${d.rows.map((r) => r.toBranchName).join(' ')} ${DIST_STATUS_LABELS[d.status] || ''}`;
      if (!hay.includes(q)) return false;
    }
    return true;
  }), [distributions, filterStatus, search, branches, rawMaterials]);

  const pendingCount = distributions.filter((d) => d.status === 'pending').length;
  const sumQty = (d: Distribution) => d.rows.reduce((s, r) => s + (r.qty || 0), 0);

  const doApprove = (d: Distribution) => {
    if (!window.confirm(`اعتماد توزيع «${itemName(d)}» من ${branchName(d.fromBranchId)}؟ سينشئ ${d.rows.length} تحويل مخزني (مسودة) — ستراجعها وتعتمدها من شاشة التحويلات.`)) return;
    approveDistribution(d.id);
  };

  const doReject = (d: Distribution) => {
    if (!window.confirm('رفض هذا التوزيع نهائياً؟')) return;
    rejectDistribution(d.id);
  };

  const openEdit = (d: Distribution) => {
    setEditOriginal(d);
    setEdit({
      ...d,
      rows: d.rows.map((r) => ({ ...r })),
    });
  };

  const matFor = (d: Distribution) => rawMaterials.find((m) => m.id === d.rawMaterialId || m.nameAr === d.itemName);

  const saveEdit = () => {
    if (!edit) return;
    const original = editOriginal || edit;
    const mat = rawMaterials.find((m) => m.id === edit.rawMaterialId);
    const conv = mat && mat.purchaseUnitConversion && mat.purchaseUnitConversion > 0 ? mat.purchaseUnitConversion : 1;
    const purchaseUnit = mat ? (mat.purchaseUnit && mat.purchaseUnit.trim() ? mat.purchaseUnit : mat.unit) : '';
    // السعر الفعلي = آخر سعر شراء للصنف في الفرع المرسل (أحدث استلام معتمد)؛
    // الدالة تعود للسعر القياسي تلقائياً عند غياب حركة شراء لهذا الصنف.
    const unitCost = mat ? getLastPurchaseCost(edit.fromBranchId, mat.id) : 0;
    const rows: DistributionRow[] = edit.rows
      .map((r) => ({
        ...r,
        purchaseUnit,
        conversion: conv,
        unit: mat ? mat.unit : r.unit,
        unitCost,
        inventoryQty: roundQty((r.qty || 0) * conv),
        _match: r._match,
      }))
      .filter((r) => r.toBranchId);
    const fromBranch = branches.find((b) => b.id === edit.fromBranchId);
    updateDistribution(edit.id, {
      fromBranchId: edit.fromBranchId,
      fromBranchName: fromBranch ? fromBranch.nameAr : (edit.fromBranchName || ''),
      rawMaterialId: edit.rawMaterialId,
      itemName: mat ? mat.nameAr : (edit.itemName || ''),
      unit: mat ? mat.unit : (edit.unit || ''),
      purchaseUnit,
      conversion: conv,
      unitCost,
      rows,
      total: rows.reduce((s, r) => s + (r.qty || 0), 0),
      inventoryTotal: rows.reduce((s, r) => s + (r.inventoryQty || 0), 0),
      warnings: rows.some((r) => !r.toBranchId) ? [...(edit.warnings || []).filter((w) => !w.includes('الهدف'))] : (edit.warnings || []).filter((w) => !w.includes('الهدف')),
      multiSource: undefined,
    });
    learnFromEdit(original, edit, mat);
    setEditOriginal(null);
    setEdit(null);
  };

  // تعلّم المرادفات مما اختاره الموظف، ليتعرف البوت عليه مستقبلاً
  const learnFromEdit = (original: Distribution, edited: Distribution, mat?: ReturnType<typeof matFor>) => {
    const token = localStorage.getItem('rcerp_token');
    const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
    const src = original.matchInfo?.item?.source;
    if (src && src.trim() && edited.rawMaterialId && mat && original.matchInfo?.item?.matchedId !== edited.rawMaterialId && original.matchInfo?.item?.confidence !== 'exact') {
      fetch('/api/telegram/alias', { method: 'POST', headers, body: JSON.stringify({ kind: 'item', alias: src.trim(), id: edited.rawMaterialId }) }).catch(() => {});
    }
    const srcBranch = original.matchInfo?.from?.source;
    if (srcBranch && srcBranch.trim() && edited.fromBranchId && original.matchInfo?.from?.matchedId !== edited.fromBranchId && original.matchInfo?.from?.confidence !== 'exact') {
      fetch('/api/telegram/alias', { method: 'POST', headers, body: JSON.stringify({ kind: 'branch', alias: srcBranch.trim(), id: edited.fromBranchId }) }).catch(() => {});
    }
  };

  const ConfBadge: React.FC<{ confidence?: string; source?: string; matchedName?: string | null }> = ({ confidence = 'none', source, matchedName }) => {
    const meta = CONF_META[confidence] || CONF_META.none;
    return (
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] whitespace-nowrap ${meta.cls}`} title={source ? `الورد: ${source}` : undefined}>
        {meta.label}
        {confidence === 'fuzzy' && matchedName && <span className="opacity-70">({matchedName})</span>}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="توزيعات واردة للمراجعة"
        subtitle="توزيعات مخزنية وردت من البوت/الواتس — راجعها وعدّلها قبل تحويلها لتحويلات مخزنية"
        icon={<Inbox className="w-6 h-6" />}
        actions={<div className="flex items-center gap-2 text-sm text-slate-500"><RefreshCw className="w-4 h-4" /> آلياً من البوت</div>}
      />

      {pendingCount > 0 && (
        <div className="flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-amber-800 text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span><b>{pendingCount}</b> توزيع بانتظار المراجعة — تحقّق من تطابق الصنف والمصدر (الشارات الملونة) قبل الاعتماد.</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative grow max-w-xs">
          <input
            className={inputCls}
            placeholder="بحث: صنف، فرع، حالة…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className={`${inputCls} !w-52`} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="all">الكل</option>
          <option value="pending">بانتظار المراجعة</option>
          <option value="approved">تم تحويلها</option>
          <option value="rejected">مرفوضة</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <Card className="text-center py-16 text-slate-400">
          <Inbox className="w-10 h-10 mx-auto mb-2 opacity-40" />
          لا توجد توزيعات واردة — أرسل رسالة «من مخزن … إلى …» إلى البوت لتظهر هنا.
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs">
              <tr>
                <th className="text-right px-4 py-3 font-semibold">المرجع</th>
                <th className="text-right px-4 py-3 font-semibold">التاريخ</th>
                <th className="text-right px-4 py-3 font-semibold">من</th>
                <th className="text-right px-4 py-3 font-semibold">الصنف</th>
                <th className="text-right px-4 py-3 font-semibold">الأهداف</th>
                <th className="text-right px-4 py-3 font-semibold">كمية (شراء)</th>
                <th className="text-right px-4 py-3 font-semibold">كمية (مخزون)</th>
                <th className="text-right px-4 py-3 font-semibold">القيمة</th>
                <th className="text-right px-4 py-3 font-semibold">الحالة</th>
                <th className="text-right px-4 py-3 font-semibold">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((d) => {
                const qSum = sumQty(d);
                const invSum = d.rows.reduce((s, r) => s + (r.inventoryQty || r.qty || 0), 0);
                const val = d.rows.reduce((s, r) => s + (r.inventoryQty ?? (r.qty || 0)) * (r.unitCost || 0), 0);
                const hasWarn = (d.warnings && d.warnings.length > 0) || (d.unknownTargets && d.unknownTargets.length > 0) || (d.multiSource && d.multiSource.length >= 2);
                return (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="tnum text-left px-4 py-3 text-xs text-slate-500">{d.id.replace('dist-', '')}</td>
                    <td className="px-4 py-3 text-slate-600">{d.date || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center flex-wrap gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-medium">{branchName(d.fromBranchId)}</span>
                        <ConfBadge {...d.matchInfo?.from} />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center flex-wrap gap-1.5">
                        <Package className="w-3.5 h-3.5 text-slate-400" />
                        <span>{itemName(d)}</span>
                        <ConfBadge {...d.matchInfo?.item} />
                      </div>
                      {hasWarn && <AlertTriangle className="w-4 h-4 text-amber-500 mt-1" />}
                    </td>
                    <td className="px-4 py-3">{d.rows.length} فرع</td>
                    <td className="px-4 py-3 tabular-nums">{fmt(qSum)} {qSum !== (d.parsedTotal ?? qSum) && d.parsedTotal ? <span className="text-amber-600 text-xs">من {fmt(d.parsedTotal)}</span> : null}</td>
                    <td className="px-4 py-3 tabular-nums font-medium">{fmt(invSum)} {d.unit}</td>
                    <td className="px-4 py-3 tabular-nums">{fmtMoney(val)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${d.status === 'pending' ? 'bg-amber-100 text-amber-700' : d.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-600'}`}>
                        {DIST_STATUS_LABELS[d.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Btn tone="ghost" className="!px-2 !py-1" onClick={() => setViewDist(d)}><Eye className="w-4 h-4" />عرض</Btn>
                        {d.status === 'pending' && can('manage_inventory') && (
                          <>
                            <Btn tone="ghost" className="!px-2 !py-1" onClick={() => openEdit(d)}><PenLine className="w-4 h-4" />تعديل</Btn>
                            <Btn className="!px-2 !py-1" onClick={() => doApprove(d)}><CheckCircle2 className="w-4 h-4" />اعتماد</Btn>
                            <Btn tone="danger" className="!px-2 !py-1" onClick={() => doReject(d)}><XCircle className="w-4 h-4" /></Btn>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!viewDist} onClose={() => setViewDist(null)} title={`تفاصيل التوزيع — ${viewDist ? itemName(viewDist) : ''}`} xl>
        {viewDist && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-xs text-slate-400 mb-1">من</div>
                <div className="flex items-center gap-1.5"><span className="font-medium">{branchName(viewDist.fromBranchId)}</span><ConfBadge {...viewDist.matchInfo?.from} /></div>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-xs text-slate-400 mb-1">الصنف</div>
                <div className="flex items-center gap-1.5"><span className="font-medium">{itemName(viewDist)} ({viewDist.unit})</span><ConfBadge {...viewDist.matchInfo?.item} /></div>
              </div>
              <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-400">التحويل</div><div className="font-medium">{viewDist.rows[0]?.conversion ? `1 ${viewDist.purchaseUnit} = ${viewDist.rows[0].conversion} ${viewDist.unit}` : '—'}</div></div>
              <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-400">التاريخ</div><div className="font-medium">{viewDist.date || '—'}</div></div>
              <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-400">الحالة</div><div className="font-medium">{DIST_STATUS_LABELS[viewDist.status]}</div></div>
            </div>

            {viewDist.warnings && viewDist.warnings.length > 0 && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-amber-800 text-sm space-y-1">
                {viewDist.warnings.map((w, i) => <div key={i} className="flex items-start gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><span>{w}</span></div>)}
              </div>
            )}

            {viewDist.notes && viewDist.notes.length > 0 && (
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-slate-600 text-sm space-y-1">
                {viewDist.notes.map((n, i) => <div key={i}>{n}</div>)}
              </div>
            )}

            {viewDist.unknownTargets && viewDist.unknownTargets.length > 0 && (
              <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-rose-700 text-sm">
                لم تُعرف الأهداف: {viewDist.unknownTargets.join(', ')} — عدّلها من «تعديل» قبل الاعتماد.
              </div>
            )}

            {viewDist.multiSource && viewDist.multiSource.length >= 2 && (
              <div className="rounded-lg bg-violet-50 border border-violet-200 px-3 py-2 text-violet-700 text-sm">
                توزيع من مصادر متعددة: {viewDist.multiSource.map((s) => `${s.branchName}${s.qty != null ? ` (${s.qty})` : ''}`).join(' + ')} — أنشئ التحويلات يدوياً من شاشة التحويلات.
              </div>
            )}

            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs">
                  <tr><th className="text-right px-3 py-2 font-semibold">#</th><th className="text-right px-3 py-2 font-semibold">الفرع المستهدف</th><th className="text-right px-3 py-2 font-semibold">كمية (شراء)</th><th className="text-right px-3 py-2 font-semibold">كمية (مخزون)</th><th className="text-right px-3 py-2 font-semibold">تكلفة/وحدة مخزون</th><th className="text-right px-3 py-2 font-semibold">الإجمالي</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {viewDist.rows.map((r, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-1.5">
                          <span>{r.toBranchName || branchName(r.toBranchId)}</span>
                          {r._match && <ConfBadge {...r._match} {...{ confidence: r._match.confidence }} />}
                        </span>
                      </td>
                      <td className="px-3 py-2 tabular-nums">{fmt(r.qty)}{r.purchaseUnit ? ` ${r.purchaseUnit}` : ''}</td>
                      <td className="px-3 py-2 tabular-nums font-medium">{fmt(r.inventoryQty)} {r.unit}</td>
                      <td className="px-3 py-2 tabular-nums">{fmtMoney(r.unitCost)}</td>
                      <td className="px-3 py-2 tabular-nums">{fmtMoney(r.inventoryQty * r.unitCost)}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 font-medium">
                    <td className="px-3 py-2"></td><td className="px-3 py-2">الإجمالي</td>
                    <td className="px-3 py-2 tabular-nums">{fmt(sumQty(viewDist))}{viewDist.purchaseUnit ? ` ${viewDist.purchaseUnit}` : ''}</td>
                    <td className="px-3 py-2 tabular-nums">{fmt(viewDist.rows.reduce((s, r) => s + r.inventoryQty, 0))} {viewDist.unit}</td>
                    <td className="px-3 py-2"></td>
                    <td className="px-3 py-2 tabular-nums">{fmtMoney(viewDist.rows.reduce((s, r) => s + r.inventoryQty * r.unitCost, 0))}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {viewDist.rawText && (
              <div className="rounded-lg bg-slate-900 text-slate-100 text-xs p-3 whitespace-pre-wrap font-mono">{viewDist.rawText}</div>
            )}

            <div className="flex justify-end gap-2 flex-wrap">
              {viewDist.status === 'pending' && can('manage_inventory') && (
                <>
                  <Btn tone="ghost" onClick={() => { openEdit(viewDist); setViewDist(null); }}><PenLine className="w-4 h-4" />تعديل</Btn>
                  <Btn tone="danger" onClick={() => { doReject(viewDist); setViewDist(null); }}><XCircle className="w-4 h-4" />رفض</Btn>
                  <Btn onClick={() => { doApprove(viewDist); setViewDist(null); }}><CheckCircle2 className="w-4 h-4" />اعتماد وتحويلها لتحويلات</Btn>
                </>
              )}
              <Btn tone="ghost" onClick={() => setViewDist(null)}>إغلاق</Btn>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={`تعديل التوزيع — ${edit ? (edit.id.replace('dist-', '') || '') : ''}`} xl>
        {edit && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">الصنف</label>
                <select className={inputCls} value={edit.rawMaterialId} onChange={(e) => setEdit({ ...edit, rawMaterialId: e.target.value })}>
                  <option value="">— اختر —</option>
                  {rawMaterials.map((m) => <option key={m.id} value={m.id}>{m.nameAr}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">فرع المصدر (من)</label>
                <select className={inputCls} value={edit.fromBranchId} onChange={(e) => setEdit({ ...edit, fromBranchId: e.target.value })}>
                  <option value="">— اختر —</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs">
                  <tr><th className="text-right px-3 py-2 font-semibold">#</th><th className="text-right px-3 py-2 font-semibold">الفرع المستهدف</th><th className="text-right px-3 py-2 font-semibold">الكمية (الوارد «كما كتب»)</th><th className="text-right px-3 py-2 font-semibold">إزالة</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(edit.rows || []).map((r, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                      <td className="px-3 py-2">
                        <select className={inputCls} value={r.toBranchId} onChange={(ev) => {
                          const nb = branches.find((b) => b.id === ev.target.value);
                          const rows = [...(edit.rows || [])];
                          rows[i] = { ...rows[i], toBranchId: ev.target.value, toBranchName: nb ? nb.nameAr : rows[i].toBranchName };
                          setEdit({ ...edit, rows });
                        }}>
                          <option value="">— اختر فرعاً —</option>
                          {branches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          className={inputCls + ' !w-28'}
                          value={r.qty ?? ''}
                          placeholder="الكمية"
                          onChange={(ev) => {
                            const rows = [...(edit.rows || [])];
                            rows[i] = { ...rows[i], qty: Number(ev.target.value) || 0 };
                            setEdit({ ...edit, rows });
                          }}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Btn tone="danger" className="!px-2 !py-1" onClick={() => { setEdit({ ...edit, rows: (edit.rows || []).filter((_, j) => j !== i) }); }}><XCircle className="w-4 h-4" /></Btn>
                      </td>
                    </tr>
                  ))}
                  {(edit.rows || []).length === 0 && (
                    <tr><td colSpan={4} className="px-3 py-4 text-center text-slate-400 text-sm">لا يوجد أهداف — أضف صفاً من الأسفل</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2">
              <Btn tone="ghost" className="!px-3 !py-1.5 text-xs" onClick={() => {
                const rows = [...(edit.rows || [])];
                rows.push({ toBranchId: '', toBranchName: '', qty: 1, purchaseUnit: '', conversion: 1, unit: '', inventoryQty: 1, unitCost: 0 });
                setEdit({ ...edit, rows });
              }}>+ إضافة هدف</Btn>
              {edit.unknownTargets && edit.unknownTargets.length > 0 && (
                <Btn tone="ghost" className="!px-3 !py-1.5 text-xs" onClick={() => {
                  const rows = [...(edit.rows || [])];
                  (edit.unknownTargets || []).forEach((u) => {
                    const cleaned = u.replace(/\s*\(→.*\)$/, '').trim();
                    rows.push({ toBranchId: '', toBranchName: cleaned, qty: 1, purchaseUnit: '', conversion: 1, unit: '', inventoryQty: 1, unitCost: 0 });
                  });
                  setEdit({ ...edit, rows, unknownTargets: [] });
                }}>إضافة الأهداف المجهولة ({edit.unknownTargets.length})</Btn>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Btn tone="ghost" onClick={() => setEdit(null)}>إلغاء</Btn>
              <Btn onClick={() => saveEdit()}><Save className="w-4 h-4" />حفظ التعديلات</Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};