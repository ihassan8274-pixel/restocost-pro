<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="logo-box">
          <img v-if="store.companyLogo" :src="store.companyLogo" alt="logo" style="width:100%;height:100%;object-fit:contain;border-radius:6px;" />
          <span v-else>🏢</span>
        </div>
        <div>
          <div class="title">{{ store.companyName }}</div>
          <div class="subtitle">{{ store.companySlogan }}</div>
        </div>
      </div>
      <nav>
        <div v-for="(group, gi) in menuGroups" :key="gi">
          <div v-if="group.label" class="menu-label">{{ group.label }}</div>
          <router-link v-for="item in group.items" :key="item.to" :to="item.to" @click="trackNav(item.to)">
            <span>{{ item.icon }}</span>
            <span>{{ item.label }}</span>
          </router-link>
        </div>
      </nav>
    </aside>
    <main class="main">
      <header class="shell-bar">
        <button class="icon-btn search-trigger" @click="store.searchOpen = true" title="بحث شامل (Ctrl+K)">
          <span>🔍</span>
          <span class="kbd">Ctrl K</span>
        </button>
        <div class="topbar-spacer"></div>
        <div class="notif-wrap">
          <button class="icon-btn" @click="toggleNotif" title="الإشعارات">
            <span>🔔</span>
            <span v-if="store.unreadCount > 0" class="badge">{{ store.unreadCount > 99 ? '99+' : store.unreadCount }}</span>
          </button>
          <div v-if="store.notificationOpen" class="notif-panel">
            <div class="notif-head">
              <b>الإشعارات</b>
              <button class="link" @click="markAllRead">تحديد الكل كمقروء</button>
            </div>
            <div v-if="!store.notifications.length" class="notif-empty">لا توجد إشعارات</div>
            <div v-for="n in store.notifications" :key="n.id" class="notif-item" :class="{ unread: !n.read }" @click="markRead(n)">
              <span>{{ kindIcon(n.kind) }}</span>
              <div>
                <div class="notif-title">{{ n.title }}</div>
                <div class="notif-msg">{{ n.message }}</div>
                <div class="notif-time">{{ timeAgo(n.createdAt) }}</div>
              </div>
            </div>
          </div>
        </div>
        <div class="user-chip" :title="store.user?.username">
          <span class="user-avatar">{{ store.roleIcon }}</span>
          <span class="user-info">
            <span class="user-name">{{ store.user?.name || store.user?.username }}</span>
            <span class="user-role">{{ store.roleLabel }}</span>
          </span>
          <button class="logout-btn" @click="doLogout" title="خروج">⏻</button>
        </div>
      </header>
      <div class="page">
        <router-view v-slot="{ Component }">
          <component :is="Component" />
        </router-view>
      </div>
    </main>
    <SearchOverlay />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { store, logout, refreshNotifications } from '../store'
import SearchOverlay from './SearchOverlay.vue'

const router = useRouter()

const menuGroups = computed(() => {
  const main = [
    { to: '/dashboard', icon: '📊', label: 'لوحة التحكم' },
    { to: '/entry', icon: '📝', label: 'إدخال البيانات' },
    { to: '/expense-entry', icon: '🧾', label: 'إدخال المصروفات' },
    { to: '/branches', icon: '🏪', label: 'الفروع والعلامات' },
    { to: '/expenses', icon: '💰', label: 'المصروفات' },
    { to: '/budgets', icon: '📋', label: 'الميزانيات' },
    { to: '/costs', icon: '📉', label: 'تحليل التكاليف' },
    { to: '/reports', icon: '📋', label: 'التقارير المالية' },
    { to: '/pl', icon: '💰', label: 'قائمة الدخل (P&L)' },
    { to: '/insights', icon: '📈', label: 'تقارير تحليلية' },
    { to: '/annual', icon: '📅', label: 'المقارنة السنوية' },
    { to: '/ai', icon: '🤖', label: 'الذكاء الاصطناعي' },
  ]
  const governance = [
    { to: '/governance', icon: '🛡️', label: 'الاعتمادات والحوكمة' },
    { to: '/exceptions', icon: '⚠️', label: 'الاستثناءات المالية' },
    { to: '/targets', icon: '🎯', label: 'أهداف KPI' },
  ]
  const schedules = [
    { to: '/scheduled', icon: '🗓️', label: 'التقارير المجدولة' },
  ]
  const system = [
    { to: '/users', icon: '👥', label: 'المستخدمون والأدوار' },
    { to: '/settings', icon: '⚙️', label: 'الإعدادات' },
  ]
  const groups = [
    { label: '', items: main },
    { label: 'الرقابة المالية', items: governance },
    { label: 'التشغيل', items: schedules },
  ]
  if (store.isAdmin) groups.push({ label: 'النظام', items: system })
  else groups.push({ label: '', items: [{ to: '/settings', icon: '⚙️', label: 'الإعدادات' }] })
  return groups
})

function trackNav(to) {
  if (to !== '/dashboard') store.lastNav = to
}

function kindIcon(kind) {
  return ({ approval: '🛡️', exception: '⚠️', schedule: '🗓️', system: '⚙️' })[kind] || '🔔'
}

async function toggleNotif() {
  store.notificationOpen = !store.notificationOpen
  if (store.notificationOpen) await refreshNotifications()
}

async function markRead(n) {
  if (n.read) return
  const { markNotificationRead } = await import('../api/client')
  n.read = 1
  try { await markNotificationRead(n.id) } catch (_) {}
  store.unreadCount = Math.max(0, store.unreadCount - 1)
}

async function markAllRead() {
  const { markAllRead: markAll } = await import('../api/client')
  await markAll()
  store.notifications.forEach(n => { n.read = 1 })
  store.unreadCount = 0
}

async function doLogout() {
  await logout()
  router.push('/login')
}

function timeAgo(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'الآن'
  if (s < 3600) return `منذ ${Math.floor(s / 60)} دقيقة`
  if (s < 86400) return `منذ ${Math.floor(s / 3600)} ساعة`
  return new Date(iso).toLocaleDateString('ar')
}
</script>