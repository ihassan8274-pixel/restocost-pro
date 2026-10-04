import React, { useState } from 'react';
import { Warehouse, ArrowRightLeft, ClipboardList, Plus, Package, Scan } from 'lucide-react';
import { useInventory, useInventoryActions } from '../../context/domains/inventory';
import { useSettingsStore } from '../../context/domains/settings';
import { useProcurementStore } from '../../context/domains/procurement';
import { useAuthStore } from '../../context/domains/auth';
import { Card, PageHeader, Btn, TabBar, inputCls } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';
import { fmt } from '../../utils/helpers';

export const InventoryViewMigrated: React.FC = () => {
  // Domain store selectors - isolated subscriptions
  const inventory = useInventory();
  const { 
    adjustInventory: _adjustInventory 
  } = useInventoryActions();
  
  const branches = useSettingsStore(state => state.branches);
  useProcurementStore(state => state.suppliers);
  const visibleBranchIds = useAuthStore(state => state.currentUser?.branchId ? [state.currentUser.branchId] : []);
  
  const getRawMaterialName = useSettingsStore(state => state.getRawMaterialName);
  const getRawMaterialUnitCost = useSettingsStore(state => state.getRawMaterialUnitCost);
  const getBranchAverageUnitCost = useSettingsStore(state => state.getBranchAverageUnitCost);
  
  // Local state
  const [filterBranch, setFilterBranch] = useState('all');
  const [tab, setTab] = useState<'stock' | 'transfers' | 'count' | 'items' | 'expiry'>('stock');

  // Derived from domain stores
  const visibleBranches = branches.filter((b) => visibleBranchIds.includes(b.id));
  const filteredInv = filterBranch === 'all' ? inventory : inventory.filter((i) => i.branchId === filterBranch);

  const totalStockValue = filteredInv.reduce((s, i) => s + i.quantity * getRawMaterialUnitCost(i.rawMaterialId), 0);

  return (
    <div className="space-y-6">
      <PageHeader title="المخزون والتحويلات والجرد" subtitle="مراقبة الأرصدة، تنبيهات الحد الأدنى، التحويلات بين الفروع، والجرد الدوري" icon={<Warehouse className="w-6 h-6 text-indigo-300" />}
        actions={<>
          <ViewToolbar
            filename="المخزون"
            onImport={() => {}}
            importLabel="استيراد الأصناف"
            sheets={[
              { name: 'الأرصدة', header: ['المادة', 'التصنيف', 'الفرع', 'الكمية', 'الوحدة', 'سعر الوحدة', 'القيمة'], rows: filteredInv.map((i) => [getRawMaterialName(i.rawMaterialId), '-', i.branchId === 'b-ck' ? 'المطبخ المركزي' : i.branchId, i.quantity, '-', getRawMaterialUnitCost(i.rawMaterialId), i.quantity * getRawMaterialUnitCost(i.rawMaterialId)]) },
              { name: 'التحويلات', header: ['الرقم', 'من', 'إلى', 'التاريخ', 'الأصناف'], rows: [] },
            ]}
          />
          <Btn onClick={() => {}}><ArrowRightLeft className="w-4 h-4" /> تحويل</Btn>
          <Btn tone="dark" onClick={() => {}}><ClipboardList className="w-4 h-4" /> جرد فعلي</Btn>
        </>} />
      
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">إجمالي قيمة المخزون</span><strong className="text-lg font-extrabold font-mono text-slate-900 block mt-1">{fmt(totalStockValue)} ر.س</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">أصناف مراقبة</span><strong className="text-lg font-extrabold font-mono text-slate-900 block mt-1">{filteredInv.length}</strong></div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs"><span className="text-slate-500 text-[11px] block">تحويلات</span><strong className="text-lg font-extrabold font-mono text-slate-900 block mt-1">{0}</strong></div>
      </div>

      <Card className="p-4 flex items-center gap-3 text-xs">
        <select value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)} className={inputCls + ' !w-64'}>
          <option value="all">جميع الفروع</option>
          {visibleBranches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
        </select>
      </Card>

      <TabBar tabs={[{ id: 'stock', label: 'الأرصدة' }, { id: 'items', label: 'الأصناف' }, { id: 'transfers', label: 'التحويلات' }, { id: 'count', label: 'سجل الجرد' }, { id: 'expiry', label: 'الصلاحية' }]} active={tab} onChange={(id) => setTab(id as 'stock' | 'transfers' | 'count' | 'items' | 'expiry')} />

      {/* Stock tab */}
      {tab === 'stock' && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr><th className="p-3">المادة</th><th className="p-3">التصنيف</th><th className="p-3">الفرع</th><th className="p-3">الكمية</th><th className="p-3">الوحدة</th><th className="p-3">متوسط السعر</th><th className="p-3">سعر قياسي</th><th className="p-3">القيمة</th><th className="p-3">الحالة</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInv.map((i) => {
                  const isLow = false;
                  return (
                    <tr key={i.id} className="hover:bg-slate-50">
                      <td className="p-3 font-bold text-slate-900">{getRawMaterialName(i.rawMaterialId)}</td>
                      <td className="p-3">-</td>
                      <td className="p-3 text-slate-600">{i.branchId === 'b-ck' ? 'المطبخ المركزي' : i.branchId}</td>
                      <td className="tnum text-left p-3 font-extrabold text-slate-900">{fmt(i.quantity)}</td>
                      <td className="p-3 text-slate-500">-</td>
                      <td className="tnum text-left p-3 font-bold text-indigo-700">{fmt(getBranchAverageUnitCost(i.branchId, i.rawMaterialId))}</td>
                      <td className="tnum text-left p-3 text-slate-500">-</td>
                      <td className="tnum text-left p-3 font-bold text-indigo-700">{fmt(i.quantity * getBranchAverageUnitCost(i.branchId, i.rawMaterialId))} ر.س</td>
                      <td className="p-3">{isLow ? <span className="text-[10px] font-bold bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full">منخفض</span> : <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">آمن</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Items tab */}
      {tab === 'items' && (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between p-3 border-b border-slate-100">
            <p className="text-xs font-extrabold text-slate-700 flex items-center gap-2"><Package className="w-4 h-4 text-indigo-500" /> الأصناف المسجلة (0)</p>
            <div className="flex gap-2">
              <Btn onClick={() => {}}><Scan className="w-4 h-4" /> مسح QR</Btn>
              <Btn onClick={() => {}}><Plus className="w-4 h-4" /> إضافة صنف</Btn>
              <Btn onClick={() => {}}><Plus className="w-4 h-4" /> استيراد أصناف من Excel</Btn>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr><th className="p-3">الكود</th><th className="p-3">الاسم</th><th className="p-3">التصنيف</th><th className="p-3">المخزون (وحدة)</th><th className="p-3">التداول (الوصفات)</th><th className="p-3">سعر الوحدة</th><th className="p-3">حد أدنى</th><th className="p-3">حد أقصى</th><th className="p-3">الإنتاجية</th><th className="p-3">التخزين</th><th className="p-3">الحالة</th><th className="p-3">إجراءات</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {/* Would map rawMaterials from appropriate store */}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Other tabs would follow similar pattern */}
      
      <div className="text-center py-8 text-slate-500">
        <p>Migration in progress - using domain stores (useInventory, useSettingsStore, useProcurementStore, useAuthStore, useUIStore)</p>
        <p className="text-sm mt-2">Full component migration replaces useApp() with domain store selectors</p>
      </div>
    </div>
  );
};

export default InventoryViewMigrated;