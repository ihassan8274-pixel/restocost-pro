import React from 'react';
import { AutocompleteSelect } from '../ui/AutocompleteSelect';
import { inputCls } from '../ui';
import { XCircle } from 'lucide-react';
import { fmt, fmtMoney, navOnEnter } from '../../utils/helpers';
import { GoodsReceiptItem, RawMaterial } from '../../types';

const fmtPrice = (n: number) => fmt(n, 4);

// ═══ جدول أصناف إشعار الاستلام (نمط ERP الموحّد — docs/design/04-grn-entry.html) ═══
//
// كان مبنياً بـ grid-cols-12 بـ div لكل خانة، ومكرراً مرتين في GoodsReceivingView:
//   - مرة في نموذج الإدخال الجديد
//   - مرة في نموذج التعديل (قسم "Section 2")
// فأي تحسين كان يُطبَّق على واحد ويُنسى الآخر — مثل عمود «انتهاء» المكرر الذي
// كان يعرض تاريخ الانتهاء مرتين في نفس الصف.
//
// الحل: جدول واحد <table> حقيقي، حقل في كل خانة، ترويسة داخل <th> تثبت مع
// البيانات. كل حقول الإدخال (كمية/سعر/إجمالي) تبقى قابلة للتحرير مع تحويل
// الوحدة في الكمية والاختصار.tab for التنقل.

export interface ItemsTableProps {
  items: GoodsReceiptItem[];
  /** يعرض مفتاح الصف (مطلوب بعد حذف/تعديل) — ينشئه الأب مرة لكل صف. */
  rowKeys: string[];
  rawMaterials: RawMaterial[];
  /** معامل التحويل للوحدة: { conv, pu } أو null. */
  convOf: (rawMaterialId: string) => { conv: number; pu: string } | null;
  /** سعر مسبق للوحدة عند اختيار الصنف. */
  prefillPrice: (mat: RawMaterial | undefined, branchId: string) => number;
  branchId: string;
  updateItem: (idx: number, patch: Partial<GoodsReceiptItem>) => void;
  onQty: (idx: number, v: string) => void;
  onPrice: (idx: number, v: string) => void;
  onLineTotal: (idx: number, v: string) => void;
  onRemove: (idx: number) => void;
  qtyKey: (k: string) => string;
  priceKey: (k: string) => string;
  totalKey: (k: string) => string;
  draftVal: (k: string, fallback: string | number) => string;
  clearDraft: (k: string) => void;}

const head = 'px-2 py-2.5 text-[10px] font-bold text-slate-500';
const cell = 'px-2 py-1';

export const GrnItemsTable: React.FC<ItemsTableProps> = ({
  items, rowKeys, rawMaterials, convOf, prefillPrice, branchId,
  updateItem, onQty, onPrice, onLineTotal, onRemove,
  qtyKey, priceKey, totalKey, draftVal, clearDraft,
}) => {
  const keyOf = (i: number) => rowKeys[i] ?? String(i);

  return (
    <div className="border border-line rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-line">
        <span className="text-xs font-bold text-slate-700">
          الأصناف المستلمة <span className="mono text-slate-500">({items.length})</span>
        </span>
        <span className="text-[11px] text-slate-500">الكمية بوحدة التخزين</span>
      </div>

      {/* ── سطح المكتب: جدول حقيقي ── */}
      <div className="overflow-x-auto hidden lg:block">
        <table className="w-full">
          <thead>
            <tr>
              <th className={head + ' w-9'}>#</th>
              <th className={head + ' text-right'} style={{ minWidth: 190 }}>الصنف</th>
              <th className={head + ' text-center w-16'}>الوحدة</th>
              <th className={head + ' text-center w-24'}>الكمية<br /><span className="font-normal text-amber-600">(وحدة التخزين)</span></th>
              <th className={head + ' text-center w-24'}>سعر الوحدة</th>
              <th className={head + ' text-left w-24'}>الإجمالي</th>
              <th className={head + ' text-center w-28'}>تاريخ الانتهاء</th>
              <th className={head + ' text-center w-20'}>الدفعة</th>
              <th className={head + ' text-center w-14'}>جودة</th>
              <th className={head + ' text-center w-9'} />
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const mat = rawMaterials.find((m) => m.id === item.rawMaterialId);
              const conv = convOf(item.rawMaterialId);
              const k = keyOf(idx);
              return (
                <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                  <td className={`${cell} text-center mono text-slate-400 text-xs`}>{idx + 1}</td>
                  <td className={cell}>
                    <AutocompleteSelect
                      value={item.rawMaterialId}
                      onChange={(val: string) => {
                        updateItem(idx, { rawMaterialId: val, unitPrice: prefillPrice(rawMaterials.find((x) => x.id === val), branchId) });
                      }}
                      options={rawMaterials.map((m) => ({ value: m.id, label: m.nameAr, code: m.code }))}
                      getOptionLabel={(opt) => `${opt.code} - ${opt.label}`}
                      placeholder="— اختر صنف —"
                      className="w-full"
                    />
                    {mat && <p className="text-[10px] text-slate-400 mt-0.5 truncate px-1 mono">{mat.code}</p>}
                  </td>
                  <td className={`${cell} text-center text-xs text-slate-600`}>{mat?.unit || '—'}</td>
                  <td className={cell}>
                    <input
                      type="text" inputMode="decimal" data-nav autoComplete="off"
                      value={draftVal(qtyKey(k), item.quantityReceived || '')}
                      onInput={(e: React.FormEvent<HTMLInputElement>) => onQty(idx, e.currentTarget.value)}
                      onBlur={() => clearDraft(qtyKey(k))}
                      onKeyDown={navOnEnter}
                      className={inputCls + ' text-center font-mono'}
                      placeholder="الكمية"
                    />
                    {conv && (
                      <div
                        className="text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-0.5 mt-1 text-center whitespace-nowrap"
                        title="تحويل وحدة التخزين إلى وحدة الشراء"
                      >
                        {item.quantityReceived > 0
                          ? `= ${(item.quantityReceived / conv.conv).toFixed(2)} ${conv.pu}`
                          : `${mat?.unit || '—'} → ${conv.pu} (×${conv.conv})`}
                      </div>
                    )}
                  </td>
                  <td className={cell}>
                    <input
                      type="text" inputMode="decimal" data-nav autoComplete="off"
                      value={draftVal(priceKey(k), item.unitPrice ? fmtPrice(item.unitPrice) : '')}
                      onInput={(e: React.FormEvent<HTMLInputElement>) => onPrice(idx, e.currentTarget.value)}
                      onBlur={() => clearDraft(priceKey(k))}
                      onKeyDown={navOnEnter}
                      className={inputCls + ' text-center font-mono'}
                      placeholder="السعر"
                    />
                  </td>
                  <td className={cell}>
                    <input
                      type="text" inputMode="decimal" data-nav autoComplete="off"
                      value={draftVal(totalKey(k), item.lineTotal && item.lineTotal > 0 ? fmtPrice(item.lineTotal) : '')}
                      onInput={(e: React.FormEvent<HTMLInputElement>) => onLineTotal(idx, e.currentTarget.value)}
                      onBlur={() => clearDraft(totalKey(k))}
                      onKeyDown={navOnEnter}
                      className={inputCls + ' text-center font-mono text-emerald-700 bg-emerald-50 font-bold'}
                      placeholder="الإجمالي"
                    />
                  </td>
                  <td className={cell}>
                    <input
                      type="date"
                      value={item.expiryDate}
                      onChange={(e) => updateItem(idx, { expiryDate: e.target.value })}
                      className={inputCls + ' text-center'}
                    />
                  </td>
                  <td className={cell}>
                    <input
                      type="text"
                      value={item.batchNumber}
                      onChange={(e) => updateItem(idx, { batchNumber: e.target.value })}
                      className={inputCls + ' text-center'}
                      placeholder="الدفعة"
                    />
                  </td>
                  <td className={`${cell} text-center`}>
                    <input
                      type="checkbox" checked={item.qualityPassed}
                      onChange={(e) => updateItem(idx, { qualityPassed: e.target.checked })}
                      className="w-4 h-4 accent-emerald-600" title="جودة"
                    />
                  </td>
                  <td className={`${cell} text-center`}>
                    <button
                      type="button" onClick={() => onRemove(idx)}
                      className="text-rose-500 hover:text-rose-700 p-1.5 rounded-lg hover:bg-rose-50 transition-colors"
                      title="حذف الصنف"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-slate-400 text-xs font-bold">
                  لم تُضف أصناف بعد — اضغط «إضافة صنف»
                </td>
              </tr>
            )}
          </tbody>
          {items.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={3} className="px-3 py-2.5 text-right font-bold text-slate-600 text-xs bg-slate-50 border-t-2 border-line">الإجمالي</td>
                <td className="px-2 py-2.5 text-left tnum font-bold text-xs bg-slate-50 border-t-2 border-line">
                  {items.reduce((s, i) => s + (Number(i.quantityReceived) || 0), 0).toFixed(3)}
                </td>
                <td className="bg-slate-50 border-t-2 border-line" />
                <td className="px-2 py-2.5 text-left tnum font-bold text-xs bg-slate-50 border-t-2 border-line">
                  {fmtMoney(items.reduce((s, i) => s + (Number(i.lineTotal) || 0), 0))}
                </td>
                <td colSpan={4} className="bg-slate-50 border-t-2 border-line" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* ── الجوال: بطاقات (نفس البيانات، تخطيط مختلف) ── */}
      <div className="lg:hidden divide-y divide-slate-100">
        {items.map((item, idx) => {
          const mat = rawMaterials.find((m) => m.id === item.rawMaterialId);
          const conv = convOf(item.rawMaterialId);
          const k = keyOf(idx);
          return (
            <div key={idx} className="p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <AutocompleteSelect
                    value={item.rawMaterialId}
                    onChange={(val: string) => {
                      updateItem(idx, { rawMaterialId: val, unitPrice: prefillPrice(rawMaterials.find((x) => x.id === val), branchId) });
                    }}
                    options={rawMaterials.map((m) => ({ value: m.id, label: m.nameAr, code: m.code }))}
                    getOptionLabel={(opt) => `${opt.code} - ${opt.label}`}
                    placeholder="— اختر صنف —"
                    className="w-full"
                  />
                  {mat && <p className="text-[10px] text-slate-400 mt-0.5 truncate mono">{mat.code} • {mat.unit}</p>}
                </div>
                <button
                  type="button" onClick={() => onRemove(idx)}
                  className="text-rose-500 hover:text-rose-700 p-1.5 shrink-0"
                  title="حذف الصنف"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-500 block mb-0.5">الكمية (وحدة التخزين)</label>
                  <input
                    type="text" inputMode="decimal" data-nav autoComplete="off"
                    value={draftVal(qtyKey(k), item.quantityReceived || '')}
                    onInput={(e: React.FormEvent<HTMLInputElement>) => onQty(idx, e.currentTarget.value)}
                    onBlur={() => clearDraft(qtyKey(k))}
                    onKeyDown={navOnEnter}
                    className={inputCls + ' text-center font-mono'}
                    placeholder="0.00"
                  />
                  {conv && (
                    <p className="text-[9px] font-bold text-amber-700 mt-0.5 text-center">
                      {item.quantityReceived > 0 ? `= ${(item.quantityReceived / conv.conv).toFixed(2)} ${conv.pu}` : `${mat?.unit || '—'} → ${conv.pu} (×${conv.conv})`}
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block mb-0.5">سعر الوحدة</label>
                  <input
                    type="text" inputMode="decimal" data-nav autoComplete="off"
                    value={draftVal(priceKey(k), item.unitPrice ? fmtPrice(item.unitPrice) : '')}
                    onInput={(e: React.FormEvent<HTMLInputElement>) => onPrice(idx, e.currentTarget.value)}
                    onBlur={() => clearDraft(priceKey(k))}
                    onKeyDown={navOnEnter}
                    className={inputCls + ' text-center font-mono'}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block mb-0.5">الإجمالي</label>
                  <input
                    type="text" inputMode="decimal" data-nav autoComplete="off"
                    value={draftVal(totalKey(k), item.lineTotal && item.lineTotal > 0 ? fmtPrice(item.lineTotal) : '')}
                    onInput={(e: React.FormEvent<HTMLInputElement>) => onLineTotal(idx, e.currentTarget.value)}
                    onBlur={() => clearDraft(totalKey(k))}
                    onKeyDown={navOnEnter}
                    className={inputCls + ' text-center font-mono text-emerald-700 bg-emerald-50 font-bold'}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block mb-0.5">الدفعة / الانتهاء</label>
                  <div className="flex gap-1">
                    <input type="text" value={item.batchNumber} onChange={(e) => updateItem(idx, { batchNumber: e.target.value })} className={inputCls + ' text-center'} placeholder="دفعة" />
                    <input type="date" value={item.expiryDate} onChange={(e) => updateItem(idx, { expiryDate: e.target.value })} className={inputCls + ' text-center'} />
                  </div>
                </div>
              </div>
              <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600 cursor-pointer">
                <input type="checkbox" checked={item.qualityPassed} onChange={(e) => updateItem(idx, { qualityPassed: e.target.checked })} className="w-4 h-4 accent-emerald-600" />
                فحص الجودة
              </label>
            </div>
          );
        })}
        {items.length === 0 && <p className="px-4 py-10 text-center text-slate-400 text-xs font-bold">لم تُضف أصناف بعد — اضغط «إضافة صنف»</p>}
      </div>

      <p className="px-4 py-2 bg-slate-50 border-t border-line text-[11px] text-slate-500">
        الكمية بوحدة التخزين (كغم/عدد/لتر). للتحويل من وحدة الشراء (كرتون/صندوق) استخدم «تحويل وحدة» أو المسح بالباركود.
      </p>
    </div>
  );
};