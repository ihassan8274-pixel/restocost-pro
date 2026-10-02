// ============ STRUCTURE ============
export interface Branch {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  type: 'central_kitchen' | 'restaurant';
  city: string;
  region?: string;
  address: string;
  managerName: string;
  phone: string;
  isActive: boolean;
  companyId?: string;
}

// القيم الافتراضية الثمانية محمولة في الكود؛ يمكن إضافة تصنيفات مخصصة من شاشة الإعدادات
export type MaterialCategory = string;

export const DEFAULT_MATERIAL_CATEGORIES: Record<string, { labelAr: string; labelEn: string; order: number; isDefault: true }> = {
  meat_poultry: { labelAr: 'لحوم ودواجن', labelEn: 'Meat & Poultry', order: 1, isDefault: true },
  seafood: { labelAr: 'أسماك ومأكولات بحرية', labelEn: 'Seafood', order: 2, isDefault: true },
  vegetables_fruits: { labelAr: 'خضروات وفواكه', labelEn: 'Vegetables & Fruits', order: 3, isDefault: true },
  dairy_eggs: { labelAr: 'ألبان وبيض', labelEn: 'Dairy & Eggs', order: 4, isDefault: true },
  dry_goods: { labelAr: 'مواد جافة', labelEn: 'Dry Goods', order: 5, isDefault: true },
  oils_sauces: { labelAr: 'زيوت وصوصات', labelEn: 'Oils & Sauces', order: 6, isDefault: true },
  packaging: { labelAr: 'تغليف', labelEn: 'Packaging', order: 7, isDefault: true },
  beverages: { labelAr: 'مشروبات', labelEn: 'Beverages', order: 8, isDefault: true },
};

// ============ MULTI-CURRENCY ============
export interface Currency {
  // مفتاح الدمج على الخادم (mergeById يسقط ما بلا id). مشتق من code ثابت.
  id?: string;
  code: string;
  nameAr: string;
  symbol: string;
  rateToBase: number; // 1 unit of this currency = N base (SAR) units
  isBase?: boolean;
  isActive: boolean;
}

// ============ COMPANIES (decentralized holding) ============
export interface Company {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  address?: string;
  phone?: string;
  vatNumber?: string;
  notes?: string;
  isActive: boolean;
}

export interface CustomCategory {
  id: string;
  nameAr: string;
  nameEn: string;
  type: 'raw_material' | 'recipe';
  description?: string;
}