<template>
  <div class="login-page">
    <div class="login-card">
      <div class="logo-box lg">
        <img v-if="store.companyLogo" :src="store.companyLogo" alt="logo" />
        <span v-else>🏢</span>
      </div>
      <h1>{{ store.companyName }}</h1>
      <p class="subtitle">{{ store.companySlogan }}</p>
      <form @submit.prevent="doLogin">
        <label>اسم المستخدم</label>
        <input v-model="username" type="text" autocomplete="username" placeholder="admin" />
        <label>كلمة المرور</label>
        <input v-model="password" type="password" autocomplete="current-password" placeholder="••••••" />
        <p v-if="error" class="login-error">⚠️ {{ error }}</p>
        <button class="btn primary" :disabled="busy" style="width:100%">{{ busy ? 'جارِ التحقق...' : 'دخول' }}</button>
      </form>
      <p class="hint">الافتراضي: admin / admin123 — غيّر كلمة المرور من شاشة المستخدمين</p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { store, login } from '../store'

const router = useRouter()
const username = ref('')
const password = ref('')
const error = ref('')
const busy = ref(false)

async function doLogin() {
  error.value = ''
  busy.value = true
  try {
    await login(username.value.trim(), password.value)
    router.push('/dashboard')
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}
</script>