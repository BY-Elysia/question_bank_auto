<template>
  <GlassPanel
    eyebrow="Step 03"
    title="试卷部分编排"
    description="每一部分都先做成可编辑草稿。图片提取和题库选题都可以往同一部分里继续加题，调好顺序和分值后确认这一部分；所有部分确认完，再统一生成完整试卷 JSON。"
    tone="ice"
    prominent
  >
    <div class="subpanel">
      <div class="subpanel-head">
        <h3>目标文件</h3>
        <p>先绑定试卷 JSON 骨架，后面的每个部分都先在前端暂存，最后一次总确认时才统一写回这份文件。</p>
      </div>
      <div class="field-grid compact-grid">
        <label class="field field-span-2">
          <span>ARK API Key</span>
          <input
            v-model.trim="state.chapterArkApiKey"
            class="glass-input"
            type="password"
            autocomplete="off"
            spellcheck="false"
            placeholder="请输入图片提取所需的 API Key"
          />
        </label>
        <div class="field field-span-2">
          <span>目标试卷 JSON</span>
          <div class="action-row inline-row">
            <button class="secondary-button" @click="actions.chooseExamJsonSessionFile">选择试卷 JSON</button>
            <button
              class="ghost-button"
              :disabled="!state.examSessionServerJsonPath"
              @click="actions.downloadCurrentExamJson"
            >
              下载当前最新 JSON
            </button>
            <span class="glass-pill" :class="{ 'is-active': Boolean(state.examSessionJsonLabel) }">
              {{ state.examSessionJsonLabel || '尚未选择文件' }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <p v-if="state.examSessionStatus" class="panel-status" :class="{ 'is-error': state.examSessionError }">
      {{ state.examSessionStatus }}
    </p>

    <div v-if="state.examSessionJsonLabel" class="info-grid">
      <div class="info-card">
        <span class="info-label">试卷标题</span>
        <strong>{{ state.examSessionTitle || '未命名试卷' }}</strong>
      </div>
      <div class="info-card">
        <span class="info-label">考试类型</span>
        <strong>{{ examTypeLabel }}</strong>
      </div>
      <div class="info-card">
        <span class="info-label">答案模式</span>
        <strong>{{ state.examSessionHasAnswer === false ? '无答案' : '有答案' }}</strong>
      </div>
      <div class="info-card">
        <span class="info-label">当前部分数</span>
        <strong>{{ sectionCount }}</strong>
      </div>
    </div>

    <div class="subpanel">
      <div class="subpanel-head">
        <h3>数据库题型</h3>
        <p>当前按题库数据库里的 7 种题型来编排试卷部分。填空题这边归到 `SHORT_ANSWER`，证明题归到 `PROOF`，编程题归到 `PROGRAMMING`。</p>
      </div>
      <div class="action-row wrap-top">
        <span
          v-for="item in questionTypeOptions"
          :key="item.value"
          class="glass-pill"
          :class="{ 'is-active': true }"
        >
          {{ item.label }} · {{ item.value }}
        </span>
      </div>
      <p
        v-if="state.examQuestionTypeStatus"
        class="panel-status"
        :class="{ 'is-error': state.examQuestionTypeError }"
      >
        {{ state.examQuestionTypeStatus }}
      </p>
    </div>

    <div class="subpanel">
      <div class="subpanel-head">
        <h3>部分列表</h3>
        <p>建议一部分对应一类题，比如“第一部分：填空题”“第二部分：证明题”。确认完当前部分后，再新增下一部分；如果要回改，直接把部分切回编辑状态即可。</p>
      </div>
      <div class="action-row">
        <button class="secondary-button" @click="actions.addExamSectionTask">新增一个部分</button>
        <span class="glass-pill is-active">已确认 {{ confirmedSectionCount }} / {{ sectionCount }} 个部分</span>
        <span class="glass-pill" :class="{ 'is-active': totalQuestionCount > 0 }">已暂存 {{ totalQuestionCount }} 道题</span>
      </div>
    </div>

    <p v-if="state.examSectionStatus" class="panel-status" :class="{ 'is-error': state.examSectionError }">
      {{ state.examSectionStatus }}
    </p>

    <div class="chapter-task-list">
      <article
        v-for="(task, index) in state.examSectionTasks"
        :key="task.id"
        class="process-card chapter-task-card"
        :class="taskCardClass(task)"
      >
        <div class="process-card__header">
          <div>
            <strong>第 {{ index + 1 }} 部分</strong>
            <p>{{ sectionHeadline(task) }}</p>
          </div>
          <span class="process-badge" :class="taskBadgeClass(task)">{{ taskBadgeLabel(task) }}</span>
        </div>

        <div class="field-grid compact-grid">
          <label class="field">
            <span>大结构标题</span>
            <input
              v-model.trim="task.majorTitle"
              class="glass-input"
              type="text"
              placeholder="例如：一、填空题"
              :disabled="task.running"
            />
          </label>
          <label class="field">
            <span>二级结构标题</span>
            <input
              v-model.trim="task.minorTitle"
              class="glass-input"
              type="text"
              placeholder="例如：1.1，可留空"
              :disabled="task.running"
            />
          </label>
          <label class="field">
            <span>题型</span>
            <select v-model="task.questionType" class="glass-input" :disabled="task.running">
              <option v-for="item in questionTypeOptions" :key="item.value" :value="item.value">
                {{ item.label }}
              </option>
            </select>
          </label>
          <div class="info-card">
            <span class="info-label">当前分值合计</span>
            <strong>{{ sectionScore(task) }}</strong>
            <p>{{ task.stagedQuestions.length || 0 }} 道题</p>
          </div>
        </div>

        <div class="subpanel">
          <div class="subpanel-head">
            <h3>图片加题</h3>
            <p>只提取这一个部分，不做跨页预读。提出来的题会先进入当前部分草稿，还不会立刻写回最终 JSON。</p>
          </div>
          <div class="action-row wrap-top">
            <label class="file-shell">
              <span>上传这一部分的图片</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                @change="actions.onExamSectionImagesChange(task.id, $event)"
              />
            </label>
            <span class="glass-pill" :class="{ 'is-active': task.imageFiles.length > 0 }">
              {{ task.imageFiles.length ? `已选 ${task.imageFiles.length} 张图片` : '尚未上传图片' }}
            </span>
            <button class="ghost-button" :disabled="!task.imageFiles.length || task.running" @click="actions.clearExamSectionImages(task.id)">
              清空图片
            </button>
            <button
              class="primary-button"
              :disabled="task.running || !task.imageFiles.length || !hasArkApiKey || !state.examSessionJsonLabel"
              @click="actions.appendExamSectionFromImages(task.id)"
            >
              {{ task.running ? '提取中...' : '提取到当前部分' }}
            </button>
          </div>
        </div>

        <div class="subpanel">
          <div class="subpanel-head">
            <h3>题库加题</h3>
            <p>先检索，再勾选题目加入当前部分草稿。图片提取和题库选题可以同时往这一部分里继续累加。</p>
          </div>
          <div class="field-grid compact-grid">
            <label class="field field-span-2">
              <span>检索关键词</span>
              <input
                v-model.trim="task.searchQuery"
                class="glass-input"
                type="text"
                placeholder="例如：极限 证明 单调收敛"
                :disabled="task.running"
              />
            </label>
            <label class="field">
              <span>来源文档类型</span>
              <select v-model="task.libraryDocumentType" class="glass-input" :disabled="task.running">
                <option value="">全部来源</option>
                <option value="textbook">教材</option>
                <option value="exam">试卷</option>
              </select>
            </label>
            <div class="field">
              <span>操作</span>
              <div class="action-row inline-row">
                <button class="secondary-button" :disabled="task.running" @click="actions.searchExamSectionLibrary(task.id)">
                  搜索题库
                </button>
                <span class="glass-pill" :class="{ 'is-active': task.selectedRecordIds.length > 0 }">
                  已选 {{ task.selectedRecordIds.length }} 题
                </span>
              </div>
            </div>
          </div>

          <p v-if="task.searchStatus" class="panel-status" :class="{ 'is-error': task.searchError }">
            {{ task.searchStatus }}
          </p>

          <div v-if="task.searchResults.length" class="process-panel">
            <article
              v-for="item in task.searchResults"
              :key="item.recordId"
              class="process-card"
            >
              <div class="process-card__header">
                <div>
                  <strong>{{ item.title || item.questionCode }}</strong>
                  <p>{{ item.questionCode }} · {{ sourceDocumentLabel(item) }}</p>
                </div>
                <label class="glass-pill exam-record-select">
                  <input
                    type="checkbox"
                    :checked="isRecordSelected(task, item.recordId)"
                    @change="actions.toggleExamSectionRecord(task.id, item.recordId)"
                  />
                  <span>{{ isRecordSelected(task, item.recordId) ? '已选中' : '选入这一部分' }}</span>
                </label>
              </div>
              <div class="process-key-grid">
                <div>
                  <span>题型</span>
                  <strong>{{ questionTypeLabel(item.questionType) }}</strong>
                </div>
                <div>
                  <span>节点类型</span>
                  <strong>{{ item.nodeType }}</strong>
                </div>
                <div>
                  <span>结构位置</span>
                  <strong>{{ item.chapterTitle || '未绑定结构' }}</strong>
                </div>
                <div>
                  <span>分值</span>
                  <strong>{{ item.defaultScore || '-' }}</strong>
                </div>
              </div>
              <p>{{ item.contentPreview || item.description || '暂无预览' }}</p>
            </article>
          </div>

          <div class="action-row">
            <button
              class="primary-button"
              :disabled="task.running || !task.selectedRecordIds.length || !state.examSessionJsonLabel"
              @click="actions.appendExamSectionFromLibrary(task.id)"
            >
              {{ task.running ? '加入中...' : '把已选题目加入当前部分' }}
            </button>
          </div>
        </div>

        <div class="subpanel">
          <div class="subpanel-head">
            <h3>当前部分草稿</h3>
            <p>这里可以调顺序、删题和赋分。确认这一部分之前，你可以反复继续加题。</p>
          </div>

          <div v-if="task.stagedQuestions.length" class="process-panel">
            <article
              v-for="(question, questionIndex) in task.stagedQuestions"
              :key="question.localId || `${task.id}_${questionIndex}`"
              class="process-card"
            >
              <div class="process-card__header">
                <div>
                  <strong>{{ question.title || question.questionId || `题目 ${questionIndex + 1}` }}</strong>
                  <p>{{ question.source === 'library' ? '题库选题' : '图片提取' }} · {{ question.questionType || task.questionType }}</p>
                </div>
                <div class="action-row inline-row">
                  <button class="ghost-button" :disabled="questionIndex <= 0 || task.running" @click="actions.moveExamSectionQuestion(task.id, question.localId, 'up')">
                    上移
                  </button>
                  <button
                    class="ghost-button"
                    :disabled="questionIndex >= task.stagedQuestions.length - 1 || task.running"
                    @click="actions.moveExamSectionQuestion(task.id, question.localId, 'down')"
                  >
                    下移
                  </button>
                  <button class="ghost-button" :disabled="task.running" @click="actions.removeExamSectionQuestion(task.id, question.localId)">
                    删除
                  </button>
                </div>
              </div>

              <template v-if="question.nodeType === 'GROUP'">
                <div class="process-key-grid">
                  <div>
                    <span>公共题干</span>
                    <strong>{{ previewText(question.stem?.text) }}</strong>
                  </div>
                  <div>
                    <span>小题数量</span>
                    <strong>{{ question.children?.length || 0 }}</strong>
                  </div>
                  <div>
                    <span>当前总分</span>
                    <strong>{{ groupScore(question) }}</strong>
                  </div>
                </div>
                <div class="process-panel">
                  <article
                    v-for="(child, childIndex) in question.children || []"
                    :key="child.questionId || `${question.localId}_${childIndex}`"
                    class="process-card"
                  >
                    <div class="process-card__header">
                      <div>
                        <strong>{{ child.title || `小题 ${childIndex + 1}` }}</strong>
                        <p>{{ previewText(child.prompt?.text) }}</p>
                      </div>
                      <label class="field exam-score-field">
                        <span>分值</span>
                        <input v-model.number="child.defaultScore" class="glass-input" type="number" min="0" step="0.5" />
                      </label>
                    </div>
                  </article>
                </div>
              </template>

              <template v-else>
                <div class="process-key-grid">
                  <div>
                    <span>题干预览</span>
                    <strong>{{ previewText(question.prompt?.text) }}</strong>
                  </div>
                  <div>
                    <span>答案状态</span>
                    <strong>{{ hasAnswerText(question) ? '有内容' : '空答案' }}</strong>
                  </div>
                  <label class="field exam-score-field">
                    <span>分值</span>
                    <input v-model.number="question.defaultScore" class="glass-input" type="number" min="0" step="0.5" />
                  </label>
                </div>
              </template>
            </article>
          </div>

          <p v-else class="panel-status">当前部分还没有题目草稿</p>
        </div>

        <div class="action-row">
          <span class="glass-pill" :class="{ 'is-active': Boolean(task.majorTitle) }">
            {{ structureLabel(task) }}
          </span>
          <span class="glass-pill" :class="{ 'is-active': task.stagedQuestions.length > 0 }">
            {{ task.stagedQuestions.length }} 题 · {{ sectionScore(task) }} 分
          </span>
          <button
            v-if="!task.confirmed"
            class="primary-button"
            :disabled="task.running || !task.stagedQuestions.length"
            @click="actions.confirmExamSection(task.id)"
          >
            确认这一部分
          </button>
          <button v-else class="secondary-button" :disabled="task.running" @click="actions.reopenExamSection(task.id)">
            返回继续修改
          </button>
          <button class="ghost-button" :disabled="task.running" @click="actions.removeExamSectionTask(task.id)">
            移除这一部分
          </button>
        </div>

        <p v-if="task.status" class="panel-status" :class="{ 'is-error': task.error }">{{ task.status }}</p>
      </article>
    </div>

    <div class="subpanel">
      <div class="subpanel-head">
        <h3>总确认</h3>
        <p>最后一步会按你当前确认过的部分顺序，重新生成整份试卷 JSON 并写回目标文件。只要某一部分还没确认，就不能做总确认。</p>
      </div>
      <div class="action-row">
        <button
          class="primary-button"
          :disabled="state.examFinalizeProcessing || !canFinalize"
          @click="actions.finalizeExamSections"
        >
          {{ state.examFinalizeProcessing ? '生成中...' : '确认整份试卷' }}
        </button>
        <span class="glass-pill" :class="{ 'is-active': canFinalize }">
          {{ canFinalize ? '可以总确认' : '请先确认所有部分' }}
        </span>
      </div>
      <p v-if="state.examFinalizeStatus" class="panel-status" :class="{ 'is-error': state.examFinalizeError }">
        {{ state.examFinalizeStatus }}
      </p>
    </div>
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

const hasArkApiKey = computed(() => Boolean(String(props.state.chapterArkApiKey || '').trim()))

const questionTypeOptions = computed(() =>
  Array.isArray(props.state.examQuestionTypeOptions) && props.state.examQuestionTypeOptions.length
    ? props.state.examQuestionTypeOptions
    : [
        { value: 'SHORT_ANSWER', label: '填空/简答题' },
        { value: 'PROOF', label: '证明题' },
        { value: 'CALCULATION', label: '计算题' },
        { value: 'PROGRAMMING', label: '编程题' },
        { value: 'SINGLE_CHOICE', label: '单选题' },
        { value: 'MULTI_CHOICE', label: '多选题' },
        { value: 'JUDGE', label: '判断题' },
      ],
)

const questionTypeLabelMap = computed(() => {
  const map = new Map()
  questionTypeOptions.value.forEach((item) => {
    map.set(item.value, item.label)
  })
  return map
})

const examTypeLabel = computed(() => {
  if (props.state.examSessionExamType === 'quiz') return '小测'
  if (props.state.examSessionExamType === 'final') return '期末'
  return '半期'
})

const sectionCount = computed(() => (Array.isArray(props.state.examSectionTasks) ? props.state.examSectionTasks.length : 0))

const confirmedSectionCount = computed(() =>
  (Array.isArray(props.state.examSectionTasks) ? props.state.examSectionTasks : []).filter((task) => task?.confirmed).length,
)

const totalQuestionCount = computed(() =>
  (Array.isArray(props.state.examSectionTasks) ? props.state.examSectionTasks : []).reduce(
    (sum, task) => sum + (Array.isArray(task?.stagedQuestions) ? task.stagedQuestions.length : 0),
    0,
  ),
)

const canFinalize = computed(() => {
  if (!props.state.examSessionJsonLabel) {
    return false
  }
  const tasks = Array.isArray(props.state.examSectionTasks) ? props.state.examSectionTasks : []
  if (!tasks.length) {
    return false
  }
  return tasks.every((task) => task?.confirmed && Array.isArray(task?.stagedQuestions) && task.stagedQuestions.length > 0)
})

function questionTypeLabel(value) {
  return questionTypeLabelMap.value.get(String(value || '').trim()) || String(value || '未分类').trim() || '未分类'
}

function structureLabel(source) {
  const major = String(source?.majorTitle || source?.currentMajorTitle || '').trim()
  const minor = String(source?.minorTitle || source?.currentMinorTitle || '').trim()
  return [major, minor].filter(Boolean).join(' / ') || '待填写结构'
}

function sectionHeadline(task) {
  return `${structureLabel(task)} · ${questionTypeLabel(task.questionType)}`
}

function sourceDocumentLabel(item) {
  const parts = [
    item?.documentType === 'exam' ? '试卷' : item?.documentType === 'textbook' ? '教材' : '',
    String(item?.textbookTitle || '').trim(),
    String(item?.chapterTitle || '').trim(),
  ].filter(Boolean)
  return parts.join(' / ') || '来源未标注'
}

function isRecordSelected(task, recordId) {
  return Array.isArray(task?.selectedRecordIds) && task.selectedRecordIds.includes(recordId)
}

function taskCardClass(task) {
  return {
    'is-progress': task?.running,
    'is-failed': task?.error,
    'is-done': task?.confirmed && !task?.running && !task?.error,
  }
}

function taskBadgeClass(task) {
  if (task?.running) return 'is-progress'
  if (task?.error) return 'is-failed'
  if (task?.confirmed) return 'is-done'
  return ''
}

function taskBadgeLabel(task) {
  if (task?.running) return '处理中'
  if (task?.error) return '失败'
  if (task?.confirmed) return '已确认'
  return '编辑中'
}

function previewText(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (!text) {
    return '暂无内容'
  }
  return text.length > 60 ? `${text.slice(0, 60)}...` : text
}

function groupScore(question) {
  return (Array.isArray(question?.children) ? question.children : []).reduce(
    (sum, child) => sum + Number(child?.defaultScore || 0),
    0,
  )
}

function sectionScore(task) {
  return (Array.isArray(task?.stagedQuestions) ? task.stagedQuestions : []).reduce((sum, question) => {
    if (question?.nodeType === 'GROUP') {
      return sum + groupScore(question)
    }
    return sum + Number(question?.defaultScore || 0)
  }, 0)
}

function hasAnswerText(question) {
  return Boolean(String(question?.standardAnswer?.text || '').trim())
}
</script>
