import { createRouter, createWebHistory } from 'vue-router'
import Layout from '../components/Layout.vue'
import { store } from '../store'

const routes = [
  { path: '/login', name: 'login', component: () => import('../views/Login.vue'), meta: { public: true } },
  {
    path: '/',
    component: Layout,
    children: [
      { path: '', redirect: '/dashboard' },
      { path: 'dashboard', name: 'dashboard', component: () => import('../views/Dashboard.vue') },
      { path: 'branches', name: 'branches', component: () => import('../views/Branches.vue') },
      { path: 'entry', name: 'entry', component: () => import('../views/Entry.vue') },
      { path: 'expense-entry', name: 'expense-entry', component: () => import('../views/ExpenseEntry.vue') },
      { path: 'expenses', name: 'expenses', component: () => import('../views/Expenses.vue') },
      { path: 'budgets', name: 'budgets', component: () => import('../views/Budgets.vue') },
      { path: 'costs', name: 'costs', component: () => import('../views/Costs.vue') },
      { path: 'reports', name: 'reports', component: () => import('../views/Reports.vue') },
      { path: 'pl', name: 'pl', component: () => import('../views/PL.vue') },
      { path: 'insights', name: 'insights', component: () => import('../views/Insights.vue') },
      { path: 'annual', name: 'annual', component: () => import('../views/AnnualComparison.vue') },
      { path: 'ai', name: 'ai', component: () => import('../views/AI.vue') },
      { path: 'settings', name: 'settings', component: () => import('../views/Settings.vue') },
      { path: 'governance', name: 'governance', component: () => import('../views/Governance.vue') },
      { path: 'exceptions', name: 'exceptions', component: () => import('../views/Exceptions.vue') },
      { path: 'targets', name: 'targets', component: () => import('../views/Targets.vue') },
      { path: 'scheduled', name: 'scheduled', component: () => import('../views/ScheduledReports.vue') },
      { path: 'users', name: 'users', component: () => import('../views/Users.vue') },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to) => {
  if (!store.authReady) {
    await import('../store').then(m => m.checkAuth()).catch(() => {})
  }
  if (to.meta.public) {
    if (to.path === '/login' && store.user) return '/'
    return true
  }
  if (!store.user) return '/login'
  return true
})

export default router