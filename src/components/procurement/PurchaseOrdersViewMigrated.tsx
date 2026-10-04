import React, { useState } from 'react';
import { PackageSearch, Plus } from 'lucide-react';
import { useProcurementStore } from '../../context/domains/procurement';
import { useSettingsStore } from '../../context/domains/settings';
import { useAuthStore } from '../../context/domains/auth';
import { useFinancialStore } from '../../context/domains/financial';
import { Card, PageHeader, Btn, inputCls } from '../ui';
import { ViewToolbar } from '../ui/ViewToolbar';

export const PurchaseOrdersViewMigrated: React.FC = () => {
  // Domain store selectors - isolated subscriptions
  const purchaseOrders = useProcurementStore(state => state.purchaseOrders);
  useProcurementStore(state => state.suppliers);
  useProcurementStore(state => state.addPurchaseOrder);
  
  const branches = useSettingsStore(state => state.branches);
  const visibleBranchIds = useAuthStore(state => state.currentUser?.branchId ? [state.currentUser.branchId] : []);
  
  useSettingsStore(state => state.getBranchName);
  
  useFinancialStore();
  
  // Local state
  const [filterBranch, setFilterBranch] = useState('all');
  const [_showModal, _setShowModal] = useState(false);
  
  const visibleBranches = branches.filter((b) => visibleBranchIds.includes(b.id));
  const filtered = filterBranch === 'all' ? purchaseOrders : purchaseOrders.filter((p) => p.branchId === filterBranch);
  
  return (
    <div className="space-y-6">
      <PageHeader title="أوامر الشراء (Purchase Orders)" subtitle="إنشاء أوامر الشراء ومتابعتها من التقديم حتى الاستلام مع ربط مباشر بالمخزون" icon={<PackageSearch className="w-6 h-6 text-indigo-600" />}
        actions={<>
          <ViewToolbar
            filename="أوامر_الشراء"
            sheets={[
              { name: 'أوامر الشراء', header: ['رقم PO', 'المورد', 'الفرع', 'تاريخ الطلب', 'المتوقع', 'عدد الأصناف', 'المبلغ', 'العملة', 'معادل الريال', 'الحالة', 'طلب بواسطة', 'ملاحظات'], rows: filtered.map((p) => [p.poNumber, p.supplierName, p.branchId === 'b-ck' ? 'المطبخ المركزي' : p.branchId, p.orderDate, p.expectedDate, p.items.length, p.totalAmount, p.currencyCode || 'SAR', p.totalAmount * (p.exchangeRate || 0), p.status, p.requestedBy, p.notes || '']) },
            ]}
          />
          <Btn onClick={() => {}}><Plus className="w-4 h-4" /> أمر شراء جديد</Btn>
        </>} />
      
      <Card className="p-4 flex items-center gap-3 text-xs">
        <select value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)} className={inputCls + ' !w-64'}>
          <option value="all">جميع الفروع</option>
          {visibleBranches.map((b) => <option key={b.id} value={b.id}>{b.nameAr}</option>)}
        </select>
      </Card>
      
      <div className="text-center py-8 text-slate-500">
        <p>Migration in progress - using domain stores (useProcurementStore, useSettingsStore, useAuthStore, useFinancialStore, useUIStore)</p>
        <p className="text-sm mt-2">Full component migration replaces useApp() with domain store selectors</p>
      </div>
    </div>
  );
};

export default PurchaseOrdersViewMigrated;