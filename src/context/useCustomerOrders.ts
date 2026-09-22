import { useState } from 'react';
import { nextDocSequence } from '../business/docNumbers';
import type { CustomerOrder, CustomerOrderStatus } from '../types';

// كبسولة «طلبات العميل الذاتية» المستخرجة من AppProvider: الكشك الذاتي زمن
// معرّف الأرقام (nextDocSequence) يبقى داخل الكبسولة، والأثر التدقيقي يُحقن خارجياً.
interface UseCustomerOrdersDeps {
  logAudit: (action: string, module: string, details?: string) => void;
}

export const useCustomerOrders = ({ logAudit }: UseCustomerOrdersDeps) => {
  const [customerOrders, setCustomerOrders] = useState<CustomerOrder[]>([]);

  const addCustomerOrder = (o: Omit<CustomerOrder, 'id' | 'orderNumber' | 'createdAt' | 'status'>): CustomerOrder => {
    const rec: CustomerOrder = {
      ...o,
      id: `co-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      orderNumber: nextDocSequence('ORD', { existing: customerOrders.map((o) => o.orderNumber) }),
      status: 'new',
      createdAt: new Date().toISOString(),
    };
    setCustomerOrders((prev) => [rec, ...prev]);
    logAudit('طلب عميل جديد', 'الطلبات', `${rec.orderNumber} — ${rec.branchName}`);
    return rec;
  };
  const updateCustomerOrderStatus = (id: string, status: CustomerOrderStatus, paymentMethod?: string) => {
    setCustomerOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status, paymentMethod: paymentMethod ?? o.paymentMethod } : o)));
    logAudit('تحديث حالة طلب عميل', 'الطلبات', id);
  };

  return { customerOrders, setCustomerOrders, addCustomerOrder, updateCustomerOrderStatus };
};