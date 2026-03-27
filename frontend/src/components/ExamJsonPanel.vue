<template>
  <GlassPanel
    eyebrow="Step 02"
    title="基础试卷 JSON"
    description="先由前端指定试卷名称、考试类型和是否有答案，再生成可继续结构化处理的试卷骨架。"
    tone="mint"
  >
    <div class="field-grid">
      <label class="field">
        <span>version</span>
        <input v-model.trim="state.examJsonForm.version" class="glass-input" type="text" placeholder="v1.1" />
      </label>
      <label class="field">
        <span>courseId</span>
        <input v-model.trim="state.examJsonForm.courseId" class="glass-input" type="text" placeholder="c_001" />
      </label>
      <label class="field">
        <span>examId</span>
        <input v-model.trim="state.examJsonForm.examId" class="glass-input" type="text" placeholder="exam_001" />
      </label>
      <label class="field field-span-2">
        <span>试卷名称</span>
        <input
          v-model.trim="state.examJsonForm.title"
          class="glass-input"
          type="text"
          placeholder="重庆邮电大学 2023-2024 学年第一学期半期模拟考试"
        />
      </label>
      <label class="field">
        <span>学科</span>
        <input v-model.trim="state.examJsonForm.subject" class="glass-input" type="text" placeholder="数学分析" />
      </label>
      <label class="field">
        <span>考试类型</span>
        <select v-model="state.examJsonForm.examType" class="glass-input">
          <option value="quiz">小测</option>
          <option value="midterm">半期</option>
          <option value="final">期末</option>
        </select>
      </label>
      <label class="field">
        <span>是否有答案</span>
        <select v-model="hasAnswerValue" class="glass-input">
          <option value="true">有答案</option>
          <option value="false">无答案</option>
        </select>
      </label>
    </div>

    <div class="action-row">
      <button class="primary-button" @click="actions.generateExamJson">生成基础 JSON</button>
      <button class="secondary-button" @click="actions.saveExamJson">选择位置并保存</button>
    </div>

    <p v-if="state.examJsonFormError" class="panel-status is-error">{{ state.examJsonFormError }}</p>
    <p v-if="state.examJsonSaveStatus" class="panel-status" :class="{ 'is-error': state.examJsonSaveError }">
      {{ state.examJsonSaveStatus }}
    </p>

    <pre v-if="state.generatedExamJson" class="code-surface">{{ state.generatedExamJson }}</pre>
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
    return props.state.examJsonForm.hasAnswer === false ? 'false' : 'true'
  },
  set(value) {
    props.state.examJsonForm.hasAnswer = value !== 'false'
  },
})
</script>
