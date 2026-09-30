import { reactive } from 'vue'

export const toasts = reactive([])
let uid = 0

export function showToast(message, type = 'info', duration = 3200) {
  const id = ++uid
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' }
  toasts.push({ id, message, type, icon: icons[type] || 'ℹ️', leaving: false })
  setTimeout(() => {
    const t = toasts.find(x => x.id === id)
    if (t) t.leaving = true
    setTimeout(() => {
      const i = toasts.findIndex(x => x.id === id)
      if (i > -1) toasts.splice(i, 1)
    }, 300)
  }, duration)
  return id
}

export function dismissToast(id) {
  const i = toasts.findIndex(x => x.id === id)
  if (i > -1) toasts.splice(i, 1)
}