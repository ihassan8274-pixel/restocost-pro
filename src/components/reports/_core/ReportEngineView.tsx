import type { ReportConfig, ReportData } from './ReportTypes';

export interface ReportEngineProps {
  type: import('./ReportTypes').ReportType;
  config: ReportConfig;
  data: ReportData;
}

export function ReportEngine({ type, config, data }: ReportEngineProps) {
  // محرك موحد: تصفية → تجميع → مقاييس → عرض
  // ملاحظة: هذه الهيكلية مؤقتة — التصفية والتجميع مُعلَّقان حتى يكتمل العقد،
  // لذلك لا نحسب filteredData/aggregated الآن حتى لا يُبلّغ TS6133 عنهما.
  const rowCount = Array.isArray(data?.items) ? data.items.length : 0;

  return (
    <div className="report-engine">
      <h2 className="text-xl font-bold mb-4">{config.title}</h2>
      <div className="mb-4 text-sm text-gray-600">
        النوع: {type} | الأعمدة: {config.columns.join(', ')}
      </div>
      <table className="w-full border-collapse border border-gray-300 text-sm">
        <thead className="bg-gray-100">
          <tr>
            {config.columns.map((c) => (
              <th key={c} className="border border-gray-300 px-3 py-2 text-right">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={config.columns.length} className="border border-gray-300 px-3 py-2 text-center text-gray-400">
              بيانات التقرير الموحدة — {rowCount} صف · جاهزة للتصدير ({config.onExport.join(', ')})
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
