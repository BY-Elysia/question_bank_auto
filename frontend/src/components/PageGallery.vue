<template>
  <GlassPanel
    eyebrow="Gallery"
    title="页图画廊"
    description="生成后的所有页图都会在这里展示，可直接勾选后送进豆包做逐字转写。"
    tone="clear"
  >
    <template #meta>
      <span class="glass-pill" :class="{ 'is-active': state.selectedImageUrls.length > 0 }">
        已选 {{ state.selectedImageUrls.length }} / {{ state.pages.length || 0 }}
      </span>
    </template>

    <div v-if="!state.pages.length" class="empty-state">
      <strong>还没有可浏览的页图</strong>
      <span>先在上方上传 PDF，系统会把每一页转成标准 JPG 并显示在这里。</span>
    </div>

    <template v-else>
      <div class="action-row">
        <button class="ghost-button" @click="actions.toggleSelectAll">
          {{ state.selectedImageUrls.length === state.pages.length ? '取消全选' : '全选页图' }}
        </button>
        <button
          class="primary-button"
          :disabled="state.reading || state.selectedImageUrls.length === 0"
          @click="actions.readSelectedByDoubao"
        >
          {{ state.reading ? '读取中...' : '豆包读取选中页图' }}
        </button>
      </div>

      <div class="gallery-grid">
        <article
          v-for="item in state.pages"
          :key="item.url"
          class="gallery-card"
          :class="{ 'is-selected': state.selectedImageUrls.includes(item.url) }"
        >
          <label class="gallery-card__check">
            <input
              type="checkbox"
              :checked="state.selectedImageUrls.includes(item.url)"
              @change="actions.toggleImage(item.url, $event.target.checked)"
            />
            <span>第 {{ item.page }} 页</span>
          </label>
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
    </template>
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
