// RestoCost Pro v10 - API client
const API_BASE = '/api'

export async function api(path, options = {}, raw = false) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  const token = localStorage.getItem('rcp_token')
  if (token && !options.skipAuth) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(API_BASE + path, {
    headers,
    ...options,
  })
  if (!res.ok) {
    let detail = ''
    try { const j = await res.json(); detail = j.error || j.detail || '' } catch (_) {}
    throw new Error(detail || `خطأ ${res.status}`)
  }
  if (res.status === 204) return null
  if (raw) return res.text()
  return res.json()
}

export const apiClient = {
  // auth
  login: (data) => api('/auth/login', { method: 'POST', body: JSON.stringify(data), skipAuth: true }),
  logout: () => api('/auth/logout', { method: 'POST' }),
  me: () => api('/auth/me'),
  changePassword: (data) => api('/auth/change-password', { method: 'POST', body: JSON.stringify(data) }),

  // users
  getUsers: () => api('/users'),
  createUser: (data) => api('/users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id, data) => api(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteUser: (id) => api(`/users/${id}`, { method: 'DELETE' }),

  // governance
  getApprovals: () => api('/approvals'),
  setApproval: (month, data) => api(`/approvals/${month}`, { method: 'PUT', body: JSON.stringify(data) }),
  getAuditLogs: (limit = 100) => api(`/audit-logs?limit=${limit}`),

  // exceptions
  getExceptions: (params) => api(`/exceptions${toQuery(params)}`),
  createException: (data) => api('/exceptions', { method: 'POST', body: JSON.stringify(data) }),
  updateException: (id, data) => api(`/exceptions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteException: (id) => api(`/exceptions/${id}`, { method: 'DELETE' }),
  generateExceptions: (month) => api('/exceptions/generate', { method: 'POST', body: JSON.stringify({ month }) }),

  // KPI targets
  getKpiTargets: (month) => api(`/kpi-targets${toQuery({ month })}`),
  saveKpiTargets: (month, targets) => api('/kpi-targets', { method: 'PUT', body: JSON.stringify({ month, targets }) }),

  // report templates / settings / versions
  getReportTemplates: () => api('/report-templates'),
  createReportTemplate: (data) => api('/report-templates', { method: 'POST', body: JSON.stringify(data) }),
  updateReportTemplate: (id, data) => api(`/report-templates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteReportTemplate: (id) => api(`/report-templates/${id}`, { method: 'DELETE' }),
  getReportSettings: () => api('/report-settings'),
  saveReportSettings: (data) => api('/report-settings', { method: 'PUT', body: JSON.stringify(data) }),
  getReportVersions: (params) => api(`/report-versions${toQuery(params)}`),
  createReportVersion: (data) => api('/report-versions', { method: 'POST', body: JSON.stringify(data) }),
  getReportVersion: (id) => api(`/report-versions/${id}`),

  // notifications
  getNotifications: () => api('/notifications'),
  getUnreadCount: () => api('/notifications/unread-count'),
  markNotificationRead: (id) => api(`/notifications/${id}/read`, { method: 'POST' }),
  markAllRead: () => api('/notifications/read-all', { method: 'POST' }),

  // scheduled reports
  getScheduledReports: () => api('/scheduled-reports'),
  createScheduledReport: (data) => api('/scheduled-reports', { method: 'POST', body: JSON.stringify(data) }),
  updateScheduledReport: (id, data) => api(`/scheduled-reports/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteScheduledReport: (id) => api(`/scheduled-reports/${id}`, { method: 'DELETE' }),
  runScheduledReport: (id) => api(`/scheduled-reports/${id}/run`, { method: 'POST' }),
  getScheduledRuns: (id) => api(`/scheduled-reports/${id}/runs`),
  getScheduledRun: (id) => api(`/scheduled-runs/${id}`),

  // global search
  search: (q) => api(`/search${toQuery({ q })}`),

  // brands
  getBrands: () => api('/brands'),
  createBrand: (data) => api('/brands', { method: 'POST', body: JSON.stringify(data) }),
  updateBrand: (id, data) => api(`/brands/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteBrand: (id) => api(`/brands/${id}`, { method: 'DELETE' }),

  // branches
  getBranches: () => api('/branches'),
  createBranch: (data) => api('/branches', { method: 'POST', body: JSON.stringify(data) }),
  updateBranch: (id, data) => api(`/branches/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteBranch: (id) => api(`/branches/${id}`, { method: 'DELETE' }),

  // records
  getRecords: (params) => api(`/records${toQuery(params)}`),
  updateRecord: (month, branchId, data) => api(`/records/${month}/${branchId}`, { method: 'PUT', body: JSON.stringify(data) }),
  bulkUpdateRecords: (month, rows) => api(`/records/${month}`, { method: 'PUT', body: JSON.stringify(rows) }),
  deleteMonth: (month) => api(`/records/${month}`, { method: 'DELETE' }),

  // expense types
  getExpenseTypes: () => api('/expense-types'),
  createExpenseType: (data) => api('/expense-types', { method: 'POST', body: JSON.stringify(data) }),
  updateExpenseType: (id, data) => api(`/expense-types/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteExpenseType: (id) => api(`/expense-types/${id}`, { method: 'DELETE' }),

  // expenses
  getExpenses: (params) => api(`/expenses${toQuery(params)}`),
  createExpense: (data) => api('/expenses', { method: 'POST', body: JSON.stringify(data) }),
  updateExpense: (id, data) => api(`/expenses/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteExpense: (id) => api(`/expenses/${id}`, { method: 'DELETE' }),

  // budgets
  getBudgets: (params) => api(`/budgets${toQuery(params)}`),
  createBudget: (data) => api('/budgets', { method: 'POST', body: JSON.stringify(data) }),
  updateBudget: (id, data) => api(`/budgets/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteBudget: (id) => api(`/budgets/${id}`, { method: 'DELETE' }),

  // analytics & AI
  getSummary: (params) => api(`/summary${toQuery(params)}`),
  getPL: (params) => api(`/pl${toQuery(params)}`),
  getBudgetVariance: (params) => api(`/insights/budget-variance${toQuery(params)}`),
  getExpenseAnalysis: (params) => api(`/insights/expense-analysis${toQuery(params)}`),
  getMomComparison: (params) => api(`/insights/mom-comparison${toQuery(params)}`),
  getDataRange: () => api('/insights/data-range'),
  getSmartAlerts: (params) => api(`/insights/alerts${toQuery(params)}`),
  getFoodCostTrend: (params) => api(`/insights/food-cost-trend${toQuery(params)}`),
  getBrandPerformance: (params) => api(`/insights/brand-performance${toQuery(params)}`),
  getTopBranches: (params) => api(`/insights/top-branches${toQuery(params)}`),
  getBranchRanking: (params) => api(`/branch-ranking${toQuery(params)}`),
  getTrend: () => api('/trend'),
  getBrandDistribution: () => api('/brand-distribution'),
  getBudgetSummary: (params) => api(`/budget-summary${toQuery(params)}`),
  forecast: () => api('/ai/forecast'),
  expenseForecast: () => api('/ai/expense-forecast'),
  anomalies: (params) => api(`/ai/anomalies${toQuery(params)}`),
  recommendations: () => api('/ai/recommendations'),
  yearComparison: (params) => api(`/year-comparison${toQuery(params)}`),

  // settings
  getSettings: () => api('/settings'),
  saveSettings: (data) => api('/settings', { method: 'PUT', body: JSON.stringify(data) }),

  // backups
  createBackup: () => api('/backups', { method: 'POST' }),
  getBackups: () => api('/backups'),
  restoreBackup: (id) => api(`/backups/${id}/restore`, { method: 'POST' }),
  clearBackups: () => api('/backups', { method: 'DELETE' }),
}

function toQuery(params = {}) {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') qs.append(k, v)
  }
  const s = qs.toString()
  return s ? `?${s}` : ''
}