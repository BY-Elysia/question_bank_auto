<template>
  <section class="hero-shell">
    <div class="hero-copy liquid-panel tone-clear is-prominent">
      <div class="liquid-panel__inner">
        <p class="hero-kicker">Question Bank Studio</p>
        <h1 class="hero-title">{{ title }}</h1>
        <p class="hero-description">
          {{ description }}
        </p>
        <div class="hero-pills">
          <span class="glass-pill">当前模型 {{ modelName }}</span>
          <span class="glass-pill" :class="{ 'is-active': Boolean(sessionLabel) }">
            {{ sessionLabel || '未初始化会话' }}
          </span>
          <span class="glass-pill">{{ statusText }}</span>
        </div>
      </div>
    </div>

    <div class="hero-metrics">
      <article class="metric-card" v-for="metric in metrics" :key="metric.label">
        <span class="metric-label">{{ metric.label }}</span>
        <strong class="metric-value">{{ metric.value }}</strong>
        <small class="metric-hint">{{ metric.hint }}</small>
      </article>
    </div>
  </section>
</template>

<script setup>
defineProps({
  modelName: {
    type: String,
    default: 'doubao-seed-2-0-pro-260215',
  },
  title: {
    type: String,
    default: '题库自动处理中心',
  },
  description: {
    type: String,
    default: '把 PDF 页图、章节会话和豆包结构化提取放进同一块工作台。',
  },
  sessionLabel: {
    type: String,
    default: '',
  },
  statusText: {
    type: String,
    default: '',
  },
  metrics: {
    type: Array,
    default: () => [],
  },
})
</script>
