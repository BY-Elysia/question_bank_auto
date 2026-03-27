<template>
  <GlassPanel
    eyebrow="Repair"
    title="题目定点修复"
    :description="
      state.workingJsonDocumentType === 'exam'
        ? '试卷模式下直接填写 questionId，上传一张或多张连续图片，只修这一题并写回当前 JSON。'
        : '直接指定第几章、第几小节、第几题，上传一张或多张连续图片，只修这一题并写回当前 JSON。'
    "
    tone="clear"
    prominent
  >
    <div class="field-grid">
      <div class="field field-span-2">
        <span>目标 JSON 文件</span>
        <div class="action-row inline-row">
          <button class="secondary-button" @click="actions.chooseJsonSessionFile">选择 JSON 文件</button>
          <span class="glass-pill" :class="{ 'is-active': Boolean(state.chapterSessionJsonLabel) }">
            {{ state.chapterSessionJsonLabel || '尚未选择文件' }}
          </span>
        </div>
      </div>
    </div>

    <div v-if="state.workingJsonDocumentType === 'exam'" class="field-grid compact-grid">
      <label class="field field-span-2">
        <span>questionId</span>
        <input v-model.trim="state.repairForm.questionId" class="glass-input" type="text" placeholder="q_1_0_7" />
      </label>
      <label class="file-shell">
        <span>上传修复图片</span>
        <input type="file" multiple accept="image/png,image/jpeg,image/webp" @change="actions.onRepairImageChange" />
      </label>
    </div>

    <div v-else class="field-grid compact-grid">
      <label class="field">
        <span>第几章</span>
        <input v-model.trim="state.repairForm.chapterNo" class="glass-input" type="text" placeholder="8" />
      </label>
      <label class="field">
        <span>第几小节</span>
        <input v-model.trim="state.repairForm.sectionNo" class="glass-input" type="text" placeholder="1" />
      </label>
      <label class="field">
        <span>第几题</span>
        <input v-model.trim="state.repairForm.questionNo" class="glass-input" type="text" placeholder="3" />
      </label>
      <label class="file-shell">
        <span>上传修复图片</span>
        <input type="file" multiple accept="image/png,image/jpeg,image/webp" @change="actions.onRepairImageChange" />
      </label>
    </div>

    <div class="action-row inline-row">
      <span class="glass-pill" :class="{ 'is-active': state.repairImageFiles.length > 0 }">
        {{ state.repairImageFiles.length ? `已选择 ${state.repairImageFiles.length} 张图片` : '可选择多张连续页图片' }}
      </span>
    </div>

    <div class="action-row">
      <button
        class="primary-button"
        :disabled="state.repairProcessing || !state.repairImageFiles.length || !state.chapterSessionServerJsonPath"
        @click="actions.repairQuestionInJson"
      >
        {{ state.repairProcessing ? '修复中...' : '执行定点修复' }}
      </button>
    </div>

    <p v-if="state.repairStatus" class="panel-status" :class="{ 'is-error': state.repairError }">
      {{ state.repairStatus }}
    </p>

    <div v-if="state.repairResult" class="process-panel">
      <article class="process-card" :class="{ 'is-success': !state.repairError }">
        <div class="process-card__header">
          <div>
            <strong>{{ state.repairResult.action === 'replaced' ? '目标题已覆盖' : '目标题已补入' }}</strong>
            <p>{{ state.repairResult.chapterTitle }} / {{ state.repairResult.sectionTitle }}</p>
          </div>
          <span class="process-badge is-done">{{ state.repairResult.action === 'replaced' ? '覆盖' : '补入' }}</span>
        </div>

        <div class="process-key-grid">
          <div>
            <span>修复输出文件</span>
            <strong>{{ state.repairResult.repairJsonFileName || '未生成' }}</strong>
          </div>
          <div>
            <span>repair_json 路径</span>
            <strong>{{ state.repairResult.repairJsonPath || '未生成' }}</strong>
          </div>
          <div>
            <span>题目 ID</span>
            <strong>{{ state.repairResult.questionId }}</strong>
          </div>
          <div>
            <span>题目标题</span>
            <strong>{{ state.repairResult.questionTitle }}</strong>
          </div>
          <div>
            <span>写入位置</span>
            <strong>{{ state.repairResult.insertIndex }}</strong>
          </div>
          <div>
            <span>题库总量</span>
            <strong>{{ state.repairResult.questionsCount }}</strong>
          </div>
        </div>

        <div v-if="state.repairResult.reason" class="process-reason-stack">
          <div class="process-reason">
            <span>模型说明</span>
            <p>{{ state.repairResult.reason }}</p>
          </div>
        </div>

      </article>
    </div>

    <section class="subpanel">
      <div class="subpanel-head">
        <h3>大模型公式修复</h3>
        <p>不影响上面的图片定点补题，只修指定题目文本块里的公式格式，并输出新的 repair_json。</p>
      </div>

      <div class="field-grid compact-grid">
        <label v-if="state.workingJsonDocumentType === 'exam'" class="field field-span-2">
          <span>questionId</span>
          <input
            v-model.trim="state.mathFormatRepairForm.questionId"
            class="glass-input"
            type="text"
            placeholder="q_1_0_7"
          />
        </label>

        <label class="field">
          <span>修复字段</span>
          <select v-model="state.mathFormatRepairForm.targetType" class="glass-input">
            <option value="stem">题目 stem</option>
            <option value="prompt">题目 prompt</option>
            <option value="standardAnswer">题目 standardAnswer</option>
            <option value="childPrompt">小题 prompt</option>
            <option value="childStandardAnswer">小题 standardAnswer</option>
          </select>
        </label>

        <label
          v-if="state.mathFormatRepairForm.targetType === 'childPrompt' || state.mathFormatRepairForm.targetType === 'childStandardAnswer'"
          class="field"
        >
          <span>{{ state.workingJsonDocumentType === 'exam' ? 'childQuestionId（可选）' : '第几小题' }}</span>
          <input
            v-if="state.workingJsonDocumentType === 'exam'"
            v-model.trim="state.mathFormatRepairForm.childQuestionId"
            class="glass-input"
            type="text"
            placeholder="q_1_0_7_1"
          />
          <input
            v-else
            v-model.trim="state.mathFormatRepairForm.childNo"
            class="glass-input"
            type="text"
            placeholder="1"
          />
        </label>
      </div>

      <div class="action-row">
        <button
          class="primary-button"
          :disabled="state.mathFormatRepairProcessing || !state.chapterSessionServerJsonPath"
          @click="actions.repairQuestionMathFormat"
        >
          {{ state.mathFormatRepairProcessing ? '修复中...' : '执行大模型公式修复' }}
        </button>
      </div>

      <p
        v-if="state.mathFormatRepairStatus"
        class="panel-status"
        :class="{ 'is-error': state.mathFormatRepairError }"
      >
        {{ state.mathFormatRepairStatus }}
      </p>

      <div v-if="state.mathFormatRepairResult" class="process-panel">
        <article class="process-card" :class="{ 'is-success': !state.mathFormatRepairError }">
          <div class="process-card__header">
            <div>
              <strong>公式字段已修复</strong>
              <p>{{ state.mathFormatRepairResult.chapterTitle }} / {{ state.mathFormatRepairResult.sectionTitle }}</p>
            </div>
            <span class="process-badge is-done">已修复</span>
          </div>

          <div class="process-key-grid">
            <div>
              <span>修复字段</span>
              <strong>{{ state.mathFormatRepairResult.targetLabel }}</strong>
            </div>
            <div>
              <span>题目 ID</span>
              <strong>{{ state.mathFormatRepairResult.childQuestionId || state.mathFormatRepairResult.questionId }}</strong>
            </div>
            <div>
              <span>题目标题</span>
              <strong>{{ state.mathFormatRepairResult.questionTitle }}</strong>
            </div>
            <div>
              <span>修复输出文件</span>
              <strong>{{ state.mathFormatRepairResult.repairJsonFileName || '未生成' }}</strong>
            </div>
            <div>
              <span>repair_json 路径</span>
              <strong>{{ state.mathFormatRepairResult.repairJsonPath || '未生成' }}</strong>
            </div>
          </div>

          <div v-if="state.mathFormatRepairResult.reason" class="process-reason-stack">
            <div class="process-reason">
              <span>模型说明</span>
              <p>{{ state.mathFormatRepairResult.reason }}</p>
            </div>
          </div>

          <div class="process-reason-stack">
            <div class="process-reason">
              <span>修复前</span>
              <p>{{ state.mathFormatRepairResult.previousText }}</p>
            </div>
            <div class="process-reason">
              <span>修复后</span>
              <p>{{ state.mathFormatRepairResult.repairedText }}</p>
            </div>
          </div>
        </article>
      </div>
    </section>
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
