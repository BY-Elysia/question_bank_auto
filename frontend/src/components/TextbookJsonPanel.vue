<template>
  <GlassPanel
    eyebrow="Step 01"
    title="基础教材 JSON"
    description="这是一个可选步骤：需要时先生成教材骨架；已有 JSON 时可以直接去第二步继续处理。"
    tone="mint"
  >
    <div class="field-grid">
      <label class="field">
        <span>version</span>
        <input v-model.trim="state.jsonForm.version" class="glass-input" type="text" placeholder="v1.1" />
      </label>
      <label class="field">
        <span>courseId</span>
        <input v-model.trim="state.jsonForm.courseId" class="glass-input" type="text" placeholder="c_001" />
      </label>
      <label class="field">
        <span>textbookId</span>
        <input v-model.trim="state.jsonForm.textbookId" class="glass-input" type="text" placeholder="tb_001" />
      </label>
      <label class="field">
        <span>教材标题</span>
        <input v-model.trim="state.jsonForm.title" class="glass-input" type="text" placeholder="高等数学" />
      </label>
      <label class="field">
        <span>出版社</span>
        <input v-model.trim="state.jsonForm.publisher" class="glass-input" type="text" placeholder="出版社" />
      </label>
      <label class="field">
        <span>学科</span>
        <input v-model.trim="state.jsonForm.subject" class="glass-input" type="text" placeholder="数学" />
      </label>
    </div>

    <div class="action-row">
      <button class="primary-button" @click="actions.generateTextbookJson">生成基础 JSON</button>
      <button class="secondary-button" @click="actions.saveTextbookJson">选择位置并保存</button>
    </div>

    <p v-if="state.jsonFormError" class="panel-status is-error">{{ state.jsonFormError }}</p>
    <p v-if="state.jsonSaveStatus" class="panel-status" :class="{ 'is-error': state.jsonSaveError }">
      {{ state.jsonSaveStatus }}
    </p>

    <pre v-if="state.generatedTextbookJson" class="code-surface">{{ state.generatedTextbookJson }}</pre>
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
