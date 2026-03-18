<template>
  <GlassPanel
    eyebrow="Gallery"
    title="页图画廊"
    description="生成后的所有页图都会在这里展示，方便按页预览、核对顺序和回看输出目录。"
    tone="clear"
  >
    <template #meta>
      <span class="glass-pill">{{ state.pages.length || 0 }} 页</span>
    </template>

    <div v-if="!state.pages.length" class="empty-state">
      <strong>还没有可浏览的页图</strong>
      <span>先在上方上传 PDF，系统会把每一页转成标准 JPG 并显示在这里。</span>
    </div>

    <div v-else class="gallery-grid">
      <article v-for="item in state.pages" :key="item.url" class="gallery-card">
        <div class="gallery-card__check">
          <span>第 {{ item.page }} 页</span>
        </div>
        <img class="gallery-card__image" :src="item.url" :alt="item.filename" loading="lazy" />
        <div class="gallery-card__meta">
          <strong>{{ item.filename }}</strong>
          <span v-if="item.sourcePdfName">
            来自第 {{ item.sourcePdfIndex }} 个 PDF：{{ item.sourcePdfName }} · PDF 第 {{ item.sourcePage }} 页
          </span>
          <span>{{ item.url }}</span>
        </div>
      </article>
    </div>
  </GlassPanel>
</template>

<script setup>
import GlassPanel from './GlassPanel.vue'

defineProps({
  state: {
    type: Object,
    required: true,
  },
  actions: {
    type: Object,
    required: true,
  },
})
</script>
