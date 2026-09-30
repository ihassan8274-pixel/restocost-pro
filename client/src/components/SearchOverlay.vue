<template>
  <Teleport to="body">
    <div v-if="store.searchOpen" class="overlay" @click.self="store.searchOpen = false">
      <div class="search-modal">
        <div class="search-input-wrap">
          <span>🔍</span>
          <input ref="input" v-model="q" type="text" placeholder="ابحث عن فرع، علامة، نوع مصروف... (Ctrl+K)" @keyup.esc="store.searchOpen = false" />
          <button class="link" @click="store.searchOpen = false">إغلاق</button>
        </div>
        <div class="search-groups">
          <div v-if="busy" class="search-empty">جارِ البحث...</div>
          <div v-if="!busy && total === 0" class="search-empty">لا توجد نتائج</div>
          <div v-for="g in groups" :key="g.label" class="search-group">
            <div v-if="g.list.length" class="search-group-label">{{ g.icon }} {{ g.label }}</div>
            <div v-for="it in g.list" :key="String(it.id) + g.label" class="search-result" @click="go(g, it)">
              <span class="sr-icon">{{ g.icon }}</span>
              <span class="sr-name">{{ it.name }}</span>
              <span class="sr-sub">{{ g.sub(it) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { store } from '../store'
import { apiClient } from '../api/client'

const router = useRouter()
const q = ref('')
const busy = ref(false)
const results = ref({ branches: [], brands: [], types: [] })
const input = ref(null)

const groups = computed(() => [
  { label: 'الفروع', icon: '🏪', list: results.value.branches, sub: b => b.region, to: '/branches' },
  { label: 'العلامات التجارية', icon: '🏷️', list: results.value.brands, sub: () => '', to: '/branches' },
  { label: 'أنواع المصروفات', icon: '🧾', list: results.value.types, sub: t => t.category, to: '/expenses' },
])
const total = computed(() => results.value.branches.length + results.value.brands.length + results.value.types.length)

let timer = null
watch(q, (val) => {
  clearTimeout(timer)
  if (!val.trim()) { results.value = { branches: [], brands: [], types: [] }; return }
  timer = setTimeout(async () => {
    busy.value = true
    try { results.value = await apiClient.search(val.trim()) } catch (_) { results.value = { branches: [], brands: [], types: [] } }
    busy.value = false
  }, 250)
})

function go(group, item) {
  store.searchOpen = false
  if (group.to === '/branches') {
    router.push({ path: '/branches', query: { highlight: String(item.id) } })
  } else {
    router.push(group.to)
  }
}

function onKey(e) {
  if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
    e.preventDefault()
    store.searchOpen = !store.searchOpen
  }
}

onMounted(() => { window.addEventListener('keydown', onKey) })
onUnmounted(() => { window.removeEventListener('keydown', onKey) })

watch(() => store.searchOpen, (open) => {
  if (open) setTimeout(() => input.value && input.value.focus(), 50)
})
</script>