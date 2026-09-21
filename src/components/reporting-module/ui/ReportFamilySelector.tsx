// ============================================================
// مكون اختيار عائلة التقرير
// ============================================================

import React from 'react';
import {
  TrendingUp, UtensilsCrossed, Users, Truck, Wallet, Warehouse, Crown, ShieldCheck,
  LayoutGrid, BarChart3, FileChartColumn,
} from 'lucide-react';
import type { ReportFamily } from '../types';

const ICON_MAP: Record<string, typeof TrendingUp> = {
  TrendingUp, UtensilsCrossed, Users, Truck, Wallet, Warehouse, Crown, ShieldCheck,
  LayoutGrid, BarChart3, FileChartColumn,
};

interface ReportFamilySelectorProps {
  families: ReportFamily[];
  selectedFamily: string | null;
  onSelect: (familyId: string) => void;
}

export const ReportFamilySelector: React.FC<ReportFamilySelectorProps> = ({
  families,
  selectedFamily,
  onSelect,
}) => {
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {/* خيار الكل */}
      <button
        onClick={() => onSelect('all')}
        className={`px-3 py-2 rounded-lg border text-xs font-bold transition-colors flex items-center gap-1.5 ${
          selectedFamily === 'all'
            ? 'border-indigo-500 bg-indigo-500 text-white'
            : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300'
        }`}
      >
        <BarChart3 className="w-3.5 h-3.5" />
        جميع التقارير
      </button>

      {families.map(family => {
        const Icon = ICON_MAP[family.icon] || TrendingUp;
        const isSelected = selectedFamily === family.id;

        return (
          <button
            key={family.id}
            onClick={() => onSelect(family.id)}
            className={`px-3 py-2 rounded-lg border text-xs font-bold transition-colors flex items-center gap-1.5 ${
              isSelected
                ? 'border-indigo-500 bg-indigo-500 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {family.nameAr}
          </button>
        );
      })}
    </div>
  );
};