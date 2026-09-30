import { useSalesStore } from '@stores/salesStore';

export const useSales = () => {
  const {
    posOrders, batchSalesRecords, customers, reservations, invoices, deliveryApps, deliverySales,
    addPOSOrder, updatePOSOrder, deletePOSOrder,
    addBatchSalesRecord, updateBatchSalesRecord, deleteBatchSalesRecord,
    addCustomer, updateCustomer, deleteCustomer,
    addReservation, updateReservationStatus, deleteReservation,
    addInvoice, updateInvoice, deleteInvoice, recordInvoicePayment,
    addDeliveryApp, updateDeliveryApp, deleteDeliveryApp, getDeliveryAppName,
    addDeliverySale, updateDeliverySale, deleteDeliverySale,
  } = useSalesStore();

  return {
    posOrders, batchSalesRecords, customers, reservations, invoices, deliveryApps, deliverySales,
    addPOSOrder, updatePOSOrder, deletePOSOrder,
    addBatchSalesRecord, updateBatchSalesRecord, deleteBatchSalesRecord,
    addCustomer, updateCustomer, deleteCustomer,
    addReservation, updateReservationStatus, deleteReservation,
    addInvoice, updateInvoice, deleteInvoice, recordInvoicePayment,
    addDeliveryApp, updateDeliveryApp, deleteDeliveryApp, getDeliveryAppName,
    addDeliverySale, updateDeliverySale, deleteDeliverySale,
  };
};