<template>
  <div>
    <router-view />
    <div id="toasts">
      <div v-for="t in toasts" :key="t.id" class="toast" :class="[t.type, { leaving: t.leaving }]" @click="dismissToast(t.id)">
        <span>{{ t.icon }}</span>
        <span>{{ t.message }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { toasts, dismissToast } from './store/toast'
import { initTheme } from './store'

onMounted(() => {
  initTheme()
})
</script>