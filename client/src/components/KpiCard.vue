<template>
  <div class="kpi-card" :style="{ borderTopColor: color }">
    <div class="icon">{{ icon }}</div>
    <div class="label">{{ label }}</div>
    <div class="value num-ltr" :style="{ color: valueColor }">{{ displayValue }}</div>
    <div v-if="change !== null && change !== undefined" class="change" :class="changeClass">{{ changeText }} <template v-if="vsLabel">vs {{ vsLabel }}</template></div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { formatNumber } from '../utils/format'

const props = defineProps({
  icon: { type: String, default: '📊' },
  label: { type: String, required: true },
  value: { type: [Number, String], default: 0 },
  isPercent: { type: Boolean, default: false },
  change: { type: [Number, String, null], default: null },
  goodWhenDown: { type: Boolean, default: false },
  vsLabel: { type: String, default: '' },
  color: { type: String, default: 'var(--gold)' },
})

const displayValue = computed(() => {
  if (props.isPercent) return `${Number(props.value || 0).toFixed(2)}%`
  return formatNumber(props.value)
})

const changeClass = computed(() => {
  if (props.change === null || props.change === undefined || props.change === '--') return ''
  const numChange = Number(props.change)
  const isPositive = numChange >= 0
  const isGood = props.goodWhenDown ? !isPositive : isPositive
  return isGood ? 'up' : 'down'
})

const changeText = computed(() => {
  if (props.change === null || props.change === undefined || props.change === '--') return ''
  const numChange = Number(props.change)
  return `${numChange >= 0 ? '▲' : '▼'} ${Math.abs(numChange).toFixed(1)}%`
})

const valueColor = computed(() => {
  if (props.change === null || props.change === undefined || props.change === '--') return ''
  return ''
})
</script>