import React from 'react';
import { PageHeader } from '../../ui';
import { ReportToolbar } from './ReportToolbar';
import { ReportFilters, type BranchOption } from './ReportFilters';
import { ReportSummaryCards } from './ReportSummaryCards';
import { ReportTable } from './ReportTable';
import { emptyReportFilter, type ReportFilter, type ReportResult } from '../_core/ReportTypes';

export interface ReportTemplateProps {
  report: ReportResult;
  filters: ReportFilter;
  onFiltersChange: (f: ReportFilter) => void;
  branches?: BranchOption[];
  showStatus?: boolean;
  statusOptions?: { value: string; label: string }[];
  actions?: React.ReactNode;
  /** فلاتر إضافية تُحقن داخل شريط الفلاتر (مثل اختيار شهر) */
  extraFilters?: React.ReactNode;
  /** رسوم بيانية/محتوى إضافي يُعرض بين المؤشرات والجداول */
  visuals?: React.ReactNode;
}

/** قالب تقرير موحّد: عنوان + فلاتر + مؤشرات + رسوم + جدول + تصدير/طباعة */
export const ReportTemplate: React.FC<ReportTemplateProps> = ({
  report, filters, onFiltersChange, branches, showStatus, statusOptions, actions, extraFilters, visuals,
}) => <>
  <PageHeader title={report.title} subtitle={report.subtitle} actions={
    <div className="flex items-center gap-2 print:hidden">
      {actions}
      <ReportToolbar report={report} />
    </div>
  } />

  <div className="space-y-4" dir="rtl">
    <ReportFilters value={filters} onChange={onFiltersChange} branches={branches} showStatus={showStatus} statusOptions={statusOptions}>
      {extraFilters}
    </ReportFilters>

    <ReportSummaryCards items={report.summaries} />

    {visuals}

    {report.tables.map((t, i) => <ReportTable key={i} data={t} />)}
  </div>
</>;

export type { ReportFilter, ReportResult };
export { emptyReportFilter };