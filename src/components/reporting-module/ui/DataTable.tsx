// ============================================================
// جدول البيانات التفاعلي مع الترتيب والتجميع
// ============================================================

import React, { useState, useMemo, useCallback } from 'react';
import { Inbox } from 'lucide-react';
import type { AggregatedRow, ReportFilters, MetricId } from '../types';
import { METRICS_DICTIONARY } from '../data/metricsDictionary';

interface DataTableProps {
  rows: AggregatedRow[];
  totals: AggregatedRow | null;
  filters: ReportFilters;
  sortConfig?: { column: string; direction: 'asc' | 'desc' };
  onSort?: (column: string) => void;
  groupBy?: string;
}

export const DataTable: React.FC<DataTableProps> = ({
  rows,
  totals,
  sortConfig,
  onSort,
  groupBy,
}) => {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const columns = useMemo(() => {
    if (rows.length === 0) return [];
    return Object.keys(rows[0])
      .filter(k => typeof rows[0][k] === 'number' || typeof rows[0][k] === 'string')
      .map(key => {
        const metric = METRICS_DICTIONARY[key as MetricId];
        return {
          key,
          label: metric?.labelAr || key,
          format: metric?.format || 'number',
          align: typeof rows[0][key] === 'number' ? 'left' : 'left', // RTL
        };
      });
  }, [rows]);

  const formatCell = useMemo(() => {
    return (value: any, format: string): string => {
      if (value === undefined || value === null) return '—';
      const num = Number(value);
      if (isNaN(num)) return String(value);

      switch (format) {
        case 'currency':
          return new Intl.NumberFormat('ar-SA', { style: 'currency', currency: 'SAR', maximumFractionDigits: 0 }).format(num);
        case 'percent':
          return `${num.toFixed(1)}%`;
        case 'number':
          return num.toLocaleString('ar-SA');
        case 'days':
          return `${num.toFixed(0)} يوم`;
        case 'quantity':
          return num.toLocaleString('ar-SA');
        default:
          return String(value);
      }
    };
  }, []);

  const handleToggleExpand = useCallback((rowId: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId); else next.add(rowId);
      return next;
    });
  }, []);

  const sortedRows = useMemo(() => {
    if (!sortConfig || rows.length === 0) return rows;
    return [...rows].sort((a, b) => {
      const aVal = a[sortConfig.column];
      const bVal = b[sortConfig.column];
      if (aVal === undefined || aVal === null) return 1;
      if (bVal === undefined || bVal === null) return -1;
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortConfig.direction === 'asc' ? cmp : -cmp;
    });
  }, [rows, sortConfig]);

  // تجميع إذا مطلوب
  const groupedData = useMemo(() => {
    if (!groupBy || sortedRows.length === 0) return { groups: null, rows: sortedRows };

    const groups = new Map<string, AggregatedRow[]>();
    sortedRows.forEach(row => {
      const key = String(row[groupBy] || 'غير محدد');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    });
    return { groups, rows: sortedRows };
  }, [sortedRows, groupBy]);

  if (rows.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        <div className="text-slate-300 mb-2"><Inbox className="w-10 h-10 mx-auto" /></div>
        <div className="text-sm">لا توجد بيانات للفترة المحددة</div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 border-b-2 border-slate-200">
            <th className="px-3 py-2 text-right font-bold text-slate-600 w-8">#</th>
            {columns.map(col => (
              <th
                key={col.key}
                onClick={() => onSort?.(col.key)}
                className={`px-3 py-2 text-right font-bold text-slate-700 cursor-pointer hover:bg-slate-100 select-none whitespace-nowrap ${
                  sortConfig?.column === col.key ? 'text-brand-600 border-b-2 border-brand-500' : ''
                }`}
              >
                <div className="flex items-center gap-1 justify-end">
                  {col.label}
                  {sortConfig?.column === col.key && (
                    <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groupedData.groups ? (
            // عرض مجمّع
            Array.from(groupedData.groups.entries()).map(([groupKey, groupRows]) => (
              <React.Fragment key={groupKey}>
                <tr
                  className="bg-brand-50 cursor-pointer hover:bg-brand-100"
                  onClick={() => handleToggleExpand(groupKey)}
                >
                  <td colSpan={columns.length + 1} className="px-3 py-2 font-bold text-brand-700">
                    {groupKey === 'غير محدد' ? '—' : groupKey} ({groupRows.length} سجل)
                    {expandedRows.has(groupKey) ? ' ▼' : ' ▶'}
                  </td>
                </tr>
                {expandedRows.has(groupKey) && groupRows.map((row, idx) => (
                  <tr key={row.branchId || idx} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-1 text-xs text-slate-400">{idx + 1}</td>
                    {columns.map(col => (
                      <td key={col.key} className="px-3 py-1 text-left font-medium">
                        {formatCell(row[col.key], col.format)}
                      </td>
                    ))}
                  </tr>
                ))}
              </React.Fragment>
            ))
          ) : (
            // عرض عادي
            sortedRows.map((row, idx) => (
              <tr key={row.branchId || idx} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-1 text-xs text-slate-400">{idx + 1}</td>
                {columns.map(col => (
                  <td key={col.key} className="px-3 py-1 text-left font-medium">
                    {formatCell(row[col.key], col.format)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
        {totals && (
          <tfoot>
            <tr className="bg-emerald-50 border-t-2 border-emerald-300 font-bold">
              <td colSpan={columns.length + 1} className="px-3 py-2 text-emerald-800">الإجماليات</td>
            </tr>
            <tr className="bg-emerald-50 border-t border-emerald-200">
              <td className="px-3 py-1"></td>
              {columns.map(col => (
                <td key={col.key} className="px-3 py-1 text-left font-bold text-emerald-800">
                  {col.key === 'branchName' || col.key === 'branchId' ? 'المجموع' : formatCell(totals[col.key], col.format)}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
};