<template>
  <GlassPanel
    eyebrow="Model"
    title="豆包识别工作台"
    description="支持直传图片逐字转写，也会展示从页图选择发送后的识别结果。"
    tone="berry"
  >
    <div class="action-row wrap-top">
      <label class="file-shell">
        <span>上传图片给模型</span>
        <input type="file" accept="image/png,image/jpeg,image/webp" multiple @change="actions.onAiImageChange" />
      </label>
      <button
        class="secondary-button"
        :disabled="state.reading || state.aiImageFiles.length === 0"
        @click="actions.readUploadedImagesByDoubao"
      >
        {{ state.reading ? '读取中...' : '上传图片并读取' }}
      </button>
    </div>

    <p v-if="state.readStatusText" class="panel-status" :class="{ 'is-error': state.readError }">
      {{ state.readStatusText }}
    </p>

    <a v-if="state.savedTextUrl" :href="state.savedTextUrl" target="_blank" class="glass-link">打开保存的 TXT</a>

    <pre v-if="state.readText" class="code-surface tall-surface">{{ state.readText }}</pre>
    <div v-else class="empty-state">
      <strong>识别结果会显示在这里</strong>
      <span>无论是直传图片，还是从页图库中勾选送入模型，结果都复用这一块输出窗。</span>
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
