import { reactive, computed } from 'vue'
import { apiClient } from '../api/client'

export const store = reactive({
  brands: [],
  branches: [],
  expenseTypes: [],
  settings: { company: {}, theme: 'light', currency: 'SAR' },
  loading: false,
  lastError: '',

  user: null,
  authReady: false,
  unreadCount: 0,
  notifications: [],
  notificationOpen: false,
  searchOpen: false,

  currencySymbols: { SAR: 'ر.س', USD: '$', EUR: '€', AED: 'د.إ' },

  get currency() { return this.settings.currency || 'SAR' },
  get companyName() { return this.settings.company?.name || 'شركتي' },
  get companySlogan() { return this.settings.company?.slogan || 'منصة إدارة مالية ذكية' },
  get companyLogo() { return this.settings.logo || '' },

  get isAdmin() { return this.user?.role === 'admin' },
  get canApprove() { return ['admin', 'finance_manager', 'reviewer'].includes(this.user?.role) },
  get canEdit() { return ['admin', 'finance_manager', 'branch_manager'].includes(this.user?.role) },
  get roleLabel() {
    return ({ admin: 'مدير النظام', finance_manager: 'المدير المالي', branch_manager: 'مدير فرع', reviewer: 'مراجع', viewer: 'مشاهد' })[this.user?.role] || ''
  },
  get roleIcon() {
    return ({ admin: '🛡️', finance_manager: '💼', branch_manager: '🏪', reviewer: '🔍', viewer: '👁️' })[this.user?.role] || '👤'
  },

  get brandById() {
    const map = {}
    for (const b of this.brands) map[b.id] = b
    return map
  },
  get branchById() {
    const map = {}
    for (const b of this.branches) map[b.id] = b
    return map
  },
})

export async function checkAuth() {
  const token = localStorage.getItem('rcp_token')
  if (!token) { store.authReady = true; store.user = null; return null }
  try {
    const { user } = await apiClient.me()
    store.user = user
    await Promise.all([refreshUnread(), loadStaticData()])
    return user
  } catch (_) {
    store.user = null
    localStorage.removeItem('rcp_token')
    return null
  } finally {
    store.authReady = true
  }
}

export async function login(username, password) {
  const { token, user } = await apiClient.login({ username, password })
  localStorage.setItem('rcp_token', token)
  store.user = user
  store.authReady = true
  await loadStaticData()
  return user
}

export async function logout() {
  try { await apiClient.logout() } catch (_) {}
  localStorage.removeItem('rcp_token')
  store.user = null
  store.notifications = []
  store.unreadCount = 0
}

export async function refreshNotifications() {
  try {
    const [notifications, count] = await Promise.all([apiClient.getNotifications(), apiClient.getUnreadCount()])
    store.notifications = notifications || []
    store.unreadCount = count?.count || 0
  } catch (_) {}
}

export async function refreshUnread() {
  try { store.unreadCount = (await apiClient.getUnreadCount())?.count || 0 } catch (_) {}
}

export async function loadStaticData() {
  store.loading = true
  try {
    const [brands, branches, types, settings] = await Promise.all([
      apiClient.getBrands(),
      apiClient.getBranches(),
      apiClient.getExpenseTypes(),
      apiClient.getSettings().catch(() => ({})),
    ])
    store.brands = brands || []
    store.branches = branches || []
    store.expenseTypes = types || []
    store.settings = { ...store.settings, ...settings }
  } catch (e) {
    store.lastError = e.message
  } finally {
    store.loading = false
  }
}

export function setTheme(theme) {
  store.settings.theme = theme
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem('rcp_theme', theme)
}

export function initTheme() {
  const saved = localStorage.getItem('rcp_theme')
  const theme = saved || store.settings.theme || 'light'
  setTheme(theme)
}

export function applyCompanyHeader() {
  document.title = `${store.companyName} - منصة مالية ذكية`
}