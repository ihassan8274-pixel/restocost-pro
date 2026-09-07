<template>
  <div class="card">
    <div class="card-header">
      <h3>{{ title }}</h3>
      <slot name="actions" />
    </div>
    <div class="chart-container" :style="{ height: height + 'px' }">
      <canvas ref="canvasEl"></canvas>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { Chart, registerables } from 'chart.js'

Chart.register(...registerables)

const props = defineProps({
  title: { type: String, required: true },
  type: { type: String, default: 'bar' },
  labels: { type: Array, default: () => [] },
  datasets: { type: Array, default: () => [] },
  height: { type: Number, default: 280 },
  options: { type: Object, default: () => ({}) },
})

const canvasEl = ref(null)
let chart = null

function render(opts = {}) {
  if (!canvasEl.value) return
  if (chart) chart.destroy()
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
  const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'
  chart = new Chart(canvasEl.value, {
    type: props.type,
    data: { labels: props.labels, datasets: props.datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      ...props.options,
      plugins: {
        ...props.options.plugins,
        legend: { position: 'top', labels: { usePointStyle: true, font: { size: 11, family: 'Tajawal' } }, ...(props.options.plugins?.legend || {}) },
      },
      scales: {
        y: { beginAtZero: true, grid: { color: gridColor }, ticks: { font: { family: 'Tajawal', size: 11 } } },
        x: { grid: { display: false }, ticks: { font: { family: 'Tajawal', size: 11 } } },
        ...(props.options.scales || {}),
      },
      animation: opts.immediate === true ? false : undefined,
    },
  })
}

onMounted(render)
onBeforeUnmount(() => { if (chart) chart.destroy() })
watch(() => [props.labels, props.datasets, props.type], render, { deep: true })

defineExpose({ reRender: render })
</script>