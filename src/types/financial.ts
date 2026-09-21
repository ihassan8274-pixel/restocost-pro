// ============ INVOICES (AR / AP) ============
export type InvoiceType = 'sales' | 'purchase';
export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'partially_paid' | 'overdue' | 'cancelled';

export interface Invoice {
  id: string;
  invoiceNumber: string;
  type: InvoiceType;
  branchId: string;
  partyId: string; // customerId for sales, supplierId for purchase
  partyName: string;
  date: string;
  dueDate: string;
  subtotal: number;
  vatAmount: number;
  totalAmount: number;
  paidAmount: number;
  status: InvoiceStatus;
  reference?: string;
  notes?: string;
  createdBy: string;
  currencyCode?: string;
  exchangeRate?: number;
  // 3-way match linkage (purchase invoices)
  purchaseOrderId?: string;
  grnId?: string;
  rawMaterialId?: string; // for line-level matching
  matchedQty?: number;
  matchedAmount?: number;
  varianceQty?: number;
  varianceAmount?: number;
  matchStatus?: 'matched' | 'qty_mismatch' | 'price_mismatch' | 'two_way' | 'no_docs';
  matchDoneAt?: string;
}

export type FixedAssetCategory = 'machinery' | 'equipment' | 'furniture' | 'vehicles' | 'buildings' | 'software' | 'other';

export interface FixedAsset {
  id: string;
  code: string;
  name: string;
  category: FixedAssetCategory;
  branchId: string;
  purchaseDate: string;
  purchaseCost: number;
  salvageValue: number;
  usefulLifeYears: number;
  accumulatedDepreciation: number;
  supplierId?: string;
  description?: string;
  isActive: boolean;
  lastDepreciationDate?: string;
}