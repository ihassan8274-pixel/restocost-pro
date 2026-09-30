import { useProcurementStore } from '@stores/procurementStore';

export const useProcurement = () => {
  const {
    suppliers, grnNotes, purchaseOrders, purchaseRequests, supplierQuotes, supplierReturns,
    addSupplier, updateSupplier, deleteSupplier,
    addGoodsReceiptNote, updateGoodsReceiptNote, updateGRNStatus, revertGoodsReceiptToDraft,
    addPurchaseOrder, updatePurchaseOrder,
    addPurchaseRequest, updatePurchaseRequest, deletePurchaseRequest, convertRequestToPOs,
    addSupplierQuote, updateSupplierQuote, deleteSupplierQuote, getQuotePrice,
    addSupplierReturn, updateSupplierReturn, approveSupplierReturn, reprocessSupplierReturn,
    revertSupplierReturnToDraft, reprocessAllApprovedReturns, getReturnedQtyForGrn,
  } = useProcurementStore();

  return {
    suppliers, grnNotes, purchaseOrders, purchaseRequests, supplierQuotes, supplierReturns,
    addSupplier, updateSupplier, deleteSupplier,
    addGoodsReceiptNote, updateGoodsReceiptNote, updateGRNStatus, revertGoodsReceiptToDraft,
    addPurchaseOrder, updatePurchaseOrder,
    addPurchaseRequest, updatePurchaseRequest, deletePurchaseRequest, convertRequestToPOs,
    addSupplierQuote, updateSupplierQuote, deleteSupplierQuote, getQuotePrice,
    addSupplierReturn, updateSupplierReturn, approveSupplierReturn, reprocessSupplierReturn,
    revertSupplierReturnToDraft, reprocessAllApprovedReturns, getReturnedQtyForGrn,
  };
};