// ============ CUSTOMERS / CRM ============
export type CustomerType = 'individual' | 'corporate' | 'loyalty';

export interface Customer {
  id: string;
  code: string;
  name: string;
  phone: string;
  email?: string;
  type: CustomerType;
  city?: string;
  branchId: string;
  joinDate: string;
  totalSpent: number;
  visits: number;
  lastVisit?: string;
  notes?: string;
  isVip: boolean;
}

export type ReservationStatus = 'pending' | 'confirmed' | 'seated' | 'completed' | 'cancelled' | 'no_show';

export interface Reservation {
  id: string;
  reservationNumber: string;
  branchId: string;
  customerId?: string;
  customerName: string;
  phone: string;
  guests: number;
  date: string;
  time: string;
  status: ReservationStatus;
  tableNumber?: string;
  specialRequest?: string;
  createdBy: string;
  createdAt: string;
}