import type { ReactNode } from 'react';

export interface ReportTemplateProps {
  title: string;
  filters?: ReactNode;
  summary?: ReactNode;
  table?: ReactNode;
  toolbar?: ReactNode;
}

export function ReportTemplate({ title, filters, summary, table, toolbar }: ReportTemplateProps) {
  return (
    <div className="report-template bg-white rounded-xl shadow p-6">
      <header className="mb-6 border-b pb-4">
        <h1 className="text-2xl font-extrabold text-slate-800">{title}</h1>
        {toolbar && <div className="mt-3">{toolbar}</div>}
      </header>
      {filters && <section className="mb-4">{filters}</section>}
      {summary && <section className="mb-4">{summary}</section>}
      <section>{table}</section>
    </div>
  );
}
