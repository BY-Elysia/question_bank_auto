<template>
  <GlassPanel
    eyebrow="Step 01"
    title="基础教材 JSON"
    description="这是一个可选步骤：需要时先生成教材骨架；已有 JSON 时可直接去第二步继续处理。"
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
      <label class="field">
        <span>是否有答案</span>
        <select v-model="hasAnswerValue" class="glass-input">
          <option value="true">有答案</option>
          <option value="false">无答案</option>
        </select>
      </label>
      <label v-if="hasAnswerValue === 'false'" class="field">
        <span>无答案时</span>
        <select v-model="answerHandlingModeValue" class="glass-input">
          <option value="generate_brief">由 AI 生成完整步骤答案</option>
          <option value="leave_empty">保持留空</option>
        </select>
      </label>
      <label class="field">
        <span>章节数量</span>
        <input
          v-model.number="state.multiChapterSlotCount"
          class="glass-input"
          type="number"
          min="1"
          max="99"
        />
      </label>
    </div>

    <div class="action-row">
      <button class="primary-button" @click="actions.generateTextbookJson">生成基础 JSON</button>
      <button class="secondary-button" @click="actions.saveTextbookJson">选择位置并保存</button>
      <button
        class="secondary-button"
        :disabled="state.multiChapterSlotSetupRunning"
        @click="actions.createMultiChapterSlotsFromTextbookForm"
      >
        {{ state.multiChapterSlotSetupRunning ? '创建槽位中...' : '批量生成到当前工作区' }}
      </button>
    </div>

    <p v-if="state.jsonFormError" class="panel-status is-error">{{ state.jsonFormError }}</p>
    <p v-if="state.jsonSaveStatus" class="panel-status" :class="{ 'is-error': state.jsonSaveError }">
      {{ state.jsonSaveStatus }}
    </p>
    <p v-if="state.multiChapterSlotSetupStatus" class="panel-status" :class="{ 'is-error': state.multiChapterSlotSetupError }">
      {{ state.multiChapterSlotSetupStatus }}
    </p>
    <p v-if="state.multiChapterSlotsStatus" class="panel-status" :class="{ 'is-error': state.multiChapterSlotsError }">
      {{ state.multiChapterSlotsStatus }}
    </p>

    <pre v-if="state.generatedTextbookJson" class="code-surface">{{ state.generatedTextbookJson }}</pre>
  </GlassPanel>
</template>

<script setup>
import { computed } from 'vue'
import GlassPanel from './GlassPanel.vue'

const props = defineProps({
  state: {
    type: Object,
    required: true,
  },
  actions: {
    type: Object,
    required: true,
  },
})

const hasAnswerValue = computed({
  get() {
    return props.state.jsonForm.hasAnswer === false ? 'false' : 'true'
  },
  set(value) {
    props.state.jsonForm.hasAnswer = value !== 'false'
    if (props.state.jsonForm.hasAnswer !== false) {
      props.state.jsonForm.answerHandlingMode = 'extract_visible'
    } else if (!['leave_empty', 'generate_brief'].includes(String(props.state.jsonForm.answerHandlingMode || '').trim())) {
      props.state.jsonForm.answerHandlingMode = 'generate_brief'
    }
  },
})

const answerHandlingModeValue = computed({
  get() {
    const value = String(props.state.jsonForm.answerHandlingMode || '').trim()
    return value === 'leave_empty' ? 'leave_empty' : 'generate_brief'
  },
  set(value) {
    props.state.jsonForm.answerHandlingMode = value === 'leave_empty' ? 'leave_empty' : 'generate_brief'
    props.state.jsonForm.hasAnswer = false
  },
})
</script>
