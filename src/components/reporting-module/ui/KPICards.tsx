// ============================================================
// بطاقات مؤشرات الأداء الرئيسية (KPI Cards)
// ============================================================

import React from 'react';
import { Minus, TrendingUp, TrendingDown, ArrowLeft } from 'lucide-react';
import type { KPIValue, MetricId } from '../types';
import { getMetric } from '../data/metricsDictionary';

interface KPIProps {
  kpi: KPIValue;
  compact?: boolean;
}

const formatValue = (value: number, metricId: MetricId): string => {
  const metric = getMetric(metricId);
  const absVal = Math.abs(value);

  switch (metric.format) {
    case 'currency':
      return new Intl.NumberFormat('ar-SA', {
        style: 'currency', currency: 'SAR', maximumFractionDigits: 0,
      }).format(value);
    case 'percent':
      return new Intl.NumberFormat('ar-SA', {
        style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1,
      }).format(value / 100);
    case 'days':
      return `${absVal.toFixed(1)} يوم`;
    case 'quantity':
      return absVal.toLocaleString('ar-SA');
    default:
      return absVal.toLocaleString('ar-SA');
  }
};

const getTone = (direction: 'up-is-good' | 'down-is-good' | 'neutral', delta?: number): { bg: string; text: string; icon: React.ReactNode } => {
  if (delta === undefined) return { bg: 'bg-slate-50', text: 'text-slate-600', icon: <Minus className="w-4 h-4" /> };

  if (direction === 'up-is-good') {
    return delta >= 0
      ? { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: <TrendingUp className="w-4 h-4" /> }
      : { bg: 'bg-rose-50', text: 'text-rose-700', icon: <TrendingDown className="w-4 h-4" /> };
  }

  if (direction === 'down-is-good') {
    return delta <= 0
      ? { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: <TrendingUp className="w-4 h-4" /> }
      : { bg: 'bg-rose-50', text: 'text-rose-700', icon: <TrendingDown className="w-4 h-4" /> };
  }

  return { bg: 'bg-blue-50', text: 'text-blue-700', icon: <ArrowLeft className="w-4 h-4" /> };
};

export const KPICard: React.FC<KPIProps> = ({ kpi, compact = false }) => {
  const { bg, text, icon } = getTone(kpi.direction, kpi.delta);
  const formattedValue = formatValue(kpi.value, kpi.id);
  const formattedDelta = kpi.delta !== undefined ? `${kpi.delta >= 0 ? '+' : ''}${kpi.delta.toFixed(1)}%` : null;

  if (compact) {
    return (
      <div className={`rounded-lg border p-2 ${bg}`}>
        <div className="text-[10px] font-bold text-slate-500 uppercase">{kpi.labelAr}</div>
        <div className={`text-lg font-extrabold ${text}`}>{formattedValue}</div>
        {formattedDelta && (
          <div className={`text-[10px] font-bold ${kpi.delta! >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {formattedDelta}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`rounded-xl border p-4 ${bg} hover:shadow-md transition-shadow`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">{kpi.labelAr}</span>
        <span className="text-lg">{icon}</span>
      </div>
      <div className={`text-2xl font-extrabold ${text}`}>{formattedValue}</div>
      {formattedDelta && (
        <div className={`text-xs font-bold mt-1 ${kpi.delta! >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
          {formattedDelta} مقارنة بالفترة السابقة
        </div>
      )}
    </div>
  );
};

interface KPICardsGridProps {
  kpis: KPIValue[];
  maxCards?: number;
  compact?: boolean;
}

export const KPICardsGrid: React.FC<KPICardsGridProps> = ({ kpis, maxCards = 6, compact = false }) => {
  const displayKPIs = kpis.slice(0, maxCards);

  if (displayKPIs.length === 0) return null;

  return (
    <div className={`grid gap-3 ${compact ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-6' : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-6'}`}>
      {displayKPIs.map(kpi => (
        <KPICard key={kpi.id} kpi={kpi} compact={compact} />
      ))}
    </div>
  );
};