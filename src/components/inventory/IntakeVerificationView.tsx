import React, { useState } from 'react';
import { Inbox, ShieldCheck, ArrowUpCircle, XCircle, Eye, Sparkles, Loader2, Send, CheckCircle2, AlertTriangle, Building2, Package, Link2, Wand2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card, PageHeader, Btn, Modal } from '../ui';
import { runAISummary, getAIModels, getActiveAIModelId } from '../../utils/ai';
import { AIModelPicker } from '../ai/AIModelPicker';
import type { IntakeInboxEntry } from '../../types';

const CONF_META: Record<string, { label: string; cls: string }> = {
  exact: { label: '✓ مطابق 100%', cls: 'bg-emerald-100 text-emerald-700' },
  alias: { label: '✓ مرادف', cls: 'bg-sky-100 text-sky-700' },
  fuzzy: { label: '≈ قريب', cls: 'bg-amber-100 text-amber-700' },
  none: { label: '؟ بلا تطابق', cls: 'bg-rose-100 text-rose-600' },
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'بانتظار المراجعة',
  raised: 'رُفعت للنظام',
  rejected: 'مرفوضة',
};

const ConfBadge: React.FC<{ confidence?: string; source?: string }> = ({ confidence = 'none', source }) => {
  const meta = CONF_META[confidence] || CONF_META.none;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] whitespace-nowrap ${meta.cls}`} title={source ? `الورد: ${source}` : undefined}>
      {meta.label}
    </span>
  );
};

export const IntakeVerificationView: React.FC = () => {
  const { intakeInbox, raiseInboxItem, rejectInboxItem, raiseAllMatchedInbox, bindAndRaiseInboxItem, branches, rawMaterials, can } = useApp();

  const [filterStatus, setFilterStatus] = useState<'pending' | 'all'>('pending');
  const [viewEntry, setViewEntry] = useState<IntakeInboxEntry | null>(null);
  const [aiBusyId, setAiBusyId] = useState<string | null>(null);
  const [aiNote, setAiNote] = useState<string>('');
  const [modelPick, setModelPick] = useState<string>(() => getActiveAIModelId());
  const [bindBusy, setBindBusy] = useState(false);
  const [bindItemId, setBindItemId] = useState<string>('');
  const [bindFromId, setBindFromId] = useState<string>('');
  const [bindTargets, setBindTargets] = useState<Record<number, string>>({});

  const branchName = (id: string) => branches.find((b) => b.id === id)?.nameAr || id;
  const itemName = (d: { itemName?: string; rawMaterialId?: string }) => d.itemName || (d.rawMaterialId ? rawMaterials.find((r) => r.id === d.rawMaterialId)?.nameAr || d.rawMaterialId : '');

  const pending = intakeInbox.filter((e) => e.status === 'pending');
  const filtered = filterStatus === 'pending' ? pending : intakeInbox;

  const unmatchedCount = pending.filter((e) => (e.quality?.score ?? 0) < 100).length;
  const fullyMatchedCount = pending.filter((e) => e.quality?.score === 100).length;

  const doRaise = async (e: IntakeInboxEntry) => {
    if (!window.confirm(`رفع «${itemName(e.draft)}» من ${branchName(e.draft.fromBranchId)} إلى النظام؟ ستنشئ ${e.draft.rows.length} تحويل مخزني (مسودة).`)) return;
    await raiseInboxItem(e.id);
    setViewEntry(null);
  };

  const doReject = async (e: IntakeInboxEntry) => {
    if (!window.confirm('رفض هذه الرسالة نهائياً من الصندوق؟')) return;
    await rejectInboxItem(e.id);
    setViewEntry(null);
  };

  const doBindAndRaise = async (e: IntakeInboxEntry) => {
    const body: { itemId?: string; fromId?: string; targets?: { index: number; toBranchId: string }[] } = {};
    if (bindItemId) body.itemId = bindItemId;
    if (bindFromId) body.fromId = bindFromId;
    const targets = Object.entries(bindTargets).map(([k, v]) => ({ index: Number(k), toBranchId: v }));
    if (targets.length) body.targets = targets;
    if (!body.itemId && !body.fromId && !body.targets) { doRaise(e); return; }
    setBindBusy(true);
    const j = await bindAndRaiseInboxItem(e.id, body);
    setBindBusy(false);
    if (j?.ok) { setViewEntry(null); setBindItemId(''); setBindFromId(''); setBindTargets({}); }
  };

  // مساعد ذكاء اصطناعي: يحلّل الأسماء غير المتطابقة (fuzzy/none) ويقترح المطابقة الصحيحة
  const runAIAssist = async (e: IntakeInboxEntry) => {
    const sel = getAIModels().find((m) => m.id === modelPick);
    const ready = !!(sel && (sel.provider === 'local' || !!sel.apiKey || !!sel.hasKey || (sel.provider === 'custom' && !!sel.baseURL)));
    if (!ready) { setAiNote('فعّل الذكاء الاصطناعي وأدخل مفتاح API لهذا النموذج من إعدادات النظام.'); return; }
    setAiBusyId(e.id);
    setAiNote('');
    try {
      const catalog = [
        `الأصناف: ${rawMaterials.map((m) => m.nameAr).join('، ')}`,
        `الفروع: ${branches.map((b) => b.nameAr).join('، ')}`,
      ].join('\n');
      const fuzzyParts: string[] = [];
      const d = e.draft;
      if (!d.matchInfo?.item || d.matchInfo?.item.confidence === 'fuzzy' || d.matchInfo?.item.confidence === 'none') fuzzyParts.push(`الصنف المُرسل: «${d.matchInfo?.item?.source || itemName(d)}»`);
      if (!d.matchInfo?.from || d.matchInfo?.from.confidence === 'fuzzy' || d.matchInfo?.from.confidence === 'none') fuzzyParts.push(`فرع المصدر المُرسل: «${d.matchInfo?.from?.source || ''}»`);
      (d.rows || []).forEach((r) => { if (r._match?.confidence === 'fuzzy' || r._match?.confidence === 'none') fuzzyParts.push(`الفرع المستهدف الموجود: «${r.toBranchName}»`); });
      if (!fuzzyParts.length) { setAiNote('لا توجد أسماء تحتاج مساعدة الذكاء الاصطناعي — كل التطابقات مكتملة.'); setAiBusyId(null); return; }

      const out = await runAISummary(
        'أنت مساعد مطابقة أسماء عربي لعمل منظومة توزيع مخزون. أعطِ للمسميات المُرسلة الاسم المطابق الصحيح فقط من المرجعية، وأرجع سطراً لكل مسمّى بصيغة: المسمّى المُرسل => الاسم الصحيح. إن كان المسمّى غير موجود بالمرجعية أكتب: ?',
        `المسميات التي تحتاج مطابقة:\n${fuzzyParts.join('\n')}\n\nالمرجعية:\n${catalog}`,
        modelPick
      );
      setAiNote(out ? `${out}\n\nإذا قبلت التحديث، اطابقها يدوياً عبر «تعديل المطابقة» إن أُضيفت لاحقاً.` : 'تعذر توليد اقتراح — تحقق من المفتاح أو الاتصال.');
    } finally {
      setAiBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="صندوق التحقق قبل الرفع"
        subtitle="رسائل التوزيع التي لم تُطابق 100% — راجع التطابق (الشارات الملونة) ثم ارفعها للنظام أو ارفضها"
        icon={<Inbox className="w-6 h-6" />}
        actions={<div className="flex items-center gap-2 text-sm text-slate-500"><ShieldCheck className="w-4 h-4" /> عند تطابق 100% يُرفع تلقائياً</div>}
      />

      <div className="flex flex-wrap items-center gap-2">
        <select className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as 'pending' | 'all')}>
          <option value="pending">المعلقة فقط ({pending.length})</option>
          <option value="all">الكل ({intakeInbox.length})</option>
        </select>
        <AIModelPicker value={modelPick} onChange={setModelPick} />
        <Btn tone="ghost" disabled={fullyMatchedCount === 0} onClick={async () => await raiseAllMatchedInbox()}>
          <Send className="w-4 h-4" />رفع المتطابقة تلقائياً ({fullyMatchedCount})
        </Btn>
      </div>

      {pending.length > 0 && (
        <div className="flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-amber-800 text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span><b>{unmatchedCount}</b> رسالة بانتظار المراجعة و<b>{fullyMatchedCount}</b> جاهزة للرفع التلقائي.</span>
        </div>
      )}

      {aiNote && <div className="rounded-xl bg-violet-50 border border-violet-200 px-4 py-3 text-violet-800 text-sm whitespace-pre-wrap">{aiNote}</div>}

      {filtered.length === 0 ? (
        <Card className="text-center py-16 text-slate-400">
          <Inbox className="w-10 h-10 mx-auto mb-2 opacity-40" />
          لا توجد رسائل في الصندوق — كل ما يصل ويُطابق 100% يُرفع تلقائياً، والباقي يظهر هنا.
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs">
              <tr>
                <th className="text-right px-4 py-3 font-semibold">المرجع</th>
                <th className="text-right px-4 py-3 font-semibold">الواصل</th>
                <th className="text-right px-4 py-3 font-semibold">الصنف</th>
                <th className="text-right px-4 py-3 font-semibold">المصدر (من)</th>
                <th className="text-right px-4 py-3 font-semibold">التطابق</th>
                <th className="text-right px-4 py-3 font-semibold">الحالة</th>
                <th className="text-right px-4 py-3 font-semibold">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((e) => {
                const d = e.draft;
                const score = e.quality?.score ?? 0;
                const isRaised = e.status === 'raised';
                return (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{e.id.replace('inb-', '')}</td>
                    <td className="px-4 py-3">
                      <div className="text-xs text-slate-400">{e.senderName || '—'}</div>
                      <div className="text-[10px] text-slate-400">{e.receivedAt ? new Date(e.receivedAt).toLocaleString('ar', { dateStyle: 'short', timeStyle: 'short' }) : ''}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5"><Package className="w-3.5 h-3.5 text-slate-400" /><span>{itemName(d)}</span><ConfBadge {...d.matchInfo?.item} /></div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5 text-slate-400" /><span>{branchName(d.fromBranchId) || (d.matchInfo?.from?.source || '—')}</span><ConfBadge {...d.matchInfo?.from} /></div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${score >= 100 ? 'bg-emerald-100 text-emerald-700' : score >= 70 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-600'}`}>
                        {score}%
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${e.status === 'pending' ? 'bg-amber-100 text-amber-700' : e.status === 'raised' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-600'}`}>
                        {STATUS_LABELS[e.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Btn tone="ghost" className="!px-2 !py-1" onClick={() => setViewEntry(e)}><Eye className="w-4 h-4" />عرض</Btn>
                        {e.status === 'pending' && can('manage_inventory') && (
                          <>
                            <Btn tone="ghost" className="!px-2 !py-1" disabled={!!aiBusyId} onClick={() => runAIAssist(e)}>
                              {aiBusyId === e.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} AI
                            </Btn>
                            <Btn className="!px-2 !py-1" disabled={isRaised} onClick={() => doRaise(e)}><ArrowUpCircle className="w-4 h-4" />رفع</Btn>
                            <Btn tone="danger" className="!px-2 !py-1" onClick={() => doReject(e)}><XCircle className="w-4 h-4" /></Btn>
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

      <Modal open={!!viewEntry} onClose={() => setViewEntry(null)} title={`تحقق من الرسالة — ${viewEntry ? itemName(viewEntry.draft) : ''}`} xl>
        {viewEntry && (() => {
          const d = viewEntry.draft;
          const missing = !d.matchInfo?.item?.matchedId ? 'الصنف' : null;
          const fromMissing = !d.fromBranchId ? 'فرع المصدر' : null;
          return (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-400 mb-1">الصنف</div><div className="flex items-center gap-1.5"><span>{itemName(d)}</span><ConfBadge {...d.matchInfo?.item} /></div></div>
                <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-400 mb-1">من (المصدر)</div><div className="flex items-center gap-1.5"><span>{branchName(d.fromBranchId) || '—'}</span><ConfBadge {...d.matchInfo?.from} /></div></div>
                <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-400">السعر</div><div className="font-medium">{(d.unitCost || 0).toFixed(3)}</div></div>
                <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-400">نسبة التطابق</div><div className="font-bold">{viewEntry.quality?.score ?? 0}%</div></div>
              </div>

              {(missing || fromMissing) && (
                <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-rose-700 text-sm">
                  لم يُحدد بعد: {[missing, fromMissing].filter(Boolean).join('، ')} — حددها من شاشة «توزيعات واردة للمراجعة» بعد رفع مسودة، أو ارفض.
                </div>
              )}

              {d.warnings && d.warnings.length > 0 && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-amber-800 text-sm space-y-1">
                  {d.warnings.map((w, i) => <div key={i} className="flex items-start gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><span>{w}</span></div>)}
                </div>
              )}

              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-xs">
                    <tr><th className="text-right px-3 py-2 font-semibold">#</th><th className="text-right px-3 py-2 font-semibold">الفرع المستهدف</th><th className="text-right px-3 py-2 font-semibold">التطابق</th><th className="text-right px-3 py-2 font-semibold">كمية</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(d.rows || []).map((r, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                        <td className="px-3 py-2">{r.toBranchName || branchName(r.toBranchId)}</td>
                        <td className="px-3 py-2"><ConfBadge {...r._match} /></td>
                        <td className="px-3 py-2 tabular-nums">{r.qty} {d.purchaseUnit}</td>
                      </tr>
                    ))}
                    {(d.unknownTargets || []).length > 0 && <tr><td colSpan={4} className="px-3 py-2 text-rose-600 text-xs">أهداف غير معروفة: {(d.unknownTargets || []).join('، ')}</td></tr>}
                  </tbody>
                </table>
              </div>

              {viewEntry.quality?.targetConfs?.some((c) => c === 'fuzzy' || c === 'none') && (
                <div className="flex items-center gap-2">
                  <Btn tone="ghost" disabled={aiBusyId === viewEntry.id} onClick={() => runAIAssist(viewEntry)}>
                    {aiBusyId === viewEntry.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} مساعدة الذكاء الاصطناعي في المطابقة
                  </Btn>
                  {!getAIModels().find((m) => m.id === modelPick)?.enabled && <span className="text-[11px] text-slate-400">فعّل AI من الإعدادات لإظهار الاقتراحات</span>}
                </div>
              )}

              {(viewEntry.quality?.itemConf === 'fuzzy' || viewEntry.quality?.itemConf === 'none' || viewEntry.quality?.fromConf === 'fuzzy' || viewEntry.quality?.fromConf === 'none' || viewEntry.quality?.targetConfs?.some((c) => c === 'fuzzy' || c === 'none')) && (
                <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-3 space-y-3">
                  <div className="flex items-center gap-2 text-violet-700 text-sm font-semibold"><Link2 className="w-4 h-4" /> ربط يدوي ثم رفع (يُسجَّل المرادف للنظام)</div>
                  {(viewEntry.quality?.itemConf === 'fuzzy' || viewEntry.quality?.itemConf === 'none') && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-slate-500 text-xs w-24">الصنف الصحيح</span>
                      <select className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm" value={bindItemId} onChange={(e) => setBindItemId(e.target.value)}>
                        <option value="">— اختر الصنف —</option>
                        {rawMaterials.map((m) => <option key={m.id} value={m.id}>{m.nameAr}</option>)}
                      </select>
                    </div>
                  )}
                  {(viewEntry.quality?.fromConf === 'fuzzy' || viewEntry.quality?.fromConf === 'none') && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-slate-500 text-xs w-24">فرع المصدر</span>
                      <select className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm" value={bindFromId} onChange={(e) => setBindFromId(e.target.value)}>
                        <option value="">— اختر الفرع —</option>
                        {branches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
                      </select>
                    </div>
                  )}
                  {(d.rows || []).map((r, i) => {
                    const conf = r._match?.confidence;
                    if (conf !== 'fuzzy' && conf !== 'none') return null;
                    return (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <span className="text-slate-500 text-xs w-24 truncate">هدف #{i + 1} «{r.toBranchName}»</span>
                        <select className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm" value={bindTargets[i] ?? ''} onChange={(e) => setBindTargets((p) => ({ ...p, [i]: e.target.value }))}>
                          <option value="">— اختر الفرع —</option>
                          {branches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
                        </select>
                      </div>
                    );
                  })}
                  <div className="flex items-center gap-2">
                    <Btn disabled={bindBusy} onClick={() => doBindAndRaise(viewEntry)}>
                      {bindBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />} ربط ورفع
                    </Btn>
                    <span className="text-[11px] text-slate-400">اختر الصحيح ثم اضغط ربط ورفع — يتعلّم الاسم ويرفع التوزيعة + تحويلات</span>
                  </div>
                </div>
              )}

              {viewEntry.rawText && (
                <div className="rounded-lg bg-slate-900 text-slate-100 text-xs p-3 whitespace-pre-wrap font-mono">{viewEntry.rawText}</div>
              )}

              {viewEntry.raisedDistId && (
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-emerald-700 text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />رُفعت إلى النظام: {viewEntry.raisedDistId}
                </div>
              )}

              <div className="flex justify-end gap-2 flex-wrap">
                {viewEntry.status === 'pending' && can('manage_inventory') && (
                  <>
                    <Btn tone="ghost" onClick={() => runAIAssist(viewEntry)}><Sparkles className="w-4 h-4" />AI</Btn>
                    <Btn tone="danger" onClick={() => doReject(viewEntry)}><XCircle className="w-4 h-4" />رفض</Btn>
                    <Btn onClick={() => doRaise(viewEntry)}><ArrowUpCircle className="w-4 h-4" />رفع إلى النظام كمسودة</Btn>
                  </>
                )}
                <Btn tone="ghost" onClick={() => setViewEntry(null)}>إغلاق</Btn>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
};