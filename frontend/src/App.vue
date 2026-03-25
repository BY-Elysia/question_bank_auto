<template>
  <div class="app-shell" :class="{ 'app-shell--overview': currentPage === 'overview' }">
    <span class="ambient-orb orb-a"></span>
    <span class="ambient-orb orb-b"></span>
    <span class="ambient-orb orb-c"></span>

    <main class="workspace-shell">
      <WorkspaceNav :items="pages" :current-page="currentPage" @change="currentPage = $event" />

      <div class="workspace-stage">
        <aside class="workspace-dock workspace-dock--left">
          <OverviewDeck
            :items="overviewItems"
            :current-page="currentPage"
            side="left"
            @jump="currentPage = $event"
          />
        </aside>

        <div class="workspace-content">
          <section v-if="currentPage === 'overview'" class="overview-empty-stage" aria-hidden="true">
            <img class="overview-brand-mark" src="/home-overview-logo.png" alt="" />
          </section>

          <section v-else-if="currentPage === 'pipeline'" class="stack-column">
            <PipelineStepper
              :items="pipelineSteps"
              :current-step="pipelineStep"
              :can-go-back="canGoPipelineBack"
              :can-go-next="canGoPipelineNext"
              @change="goPipelineStep"
              @back="goPipelineBack"
              @next="goPipelineNext"
            />

            <PipelineKindPanel
              v-if="pipelineStep === 'kind'"
              :pipeline-kind="pipelineKind"
              @select="selectPipelineKind"
            />
            <TextbookJsonPanel v-else-if="pipelineStep === 'json'" :state="state" :actions="actions" />
            <ChapterSessionPanel v-else-if="pipelineStep === 'session'" :state="state" :actions="actions" />
            <ExamWorkspacePlaceholder v-else @back-to-kind="pipelineStep = 'kind'" />
          </section>

          <section v-else-if="currentPage === 'pdf'" class="stack-column">
            <PdfWorkspacePanel :state="state" :actions="actions" />
            <PageGallery :state="state" :actions="actions" />
          </section>

          <section v-else-if="currentPage === 'repair'" class="stack-column">
            <QuestionRepairPanel :state="state" :actions="actions" />
          </section>

          <section v-else-if="currentPage === 'imageAttach'" class="stack-column">
            <ImageAttachPanel :state="state" :actions="actions" />
          </section>

          <section v-else-if="currentPage === 'visualize'" class="stack-column">
            <JsonVisualizerPanel :state="state" :actions="actions" />
          </section>

          <section v-else-if="currentPage === 'merge'" class="stack-column">
            <JsonMergePanel :state="state" :actions="actions" />
          </section>

          <section v-else-if="currentPage === 'database'" class="stack-column">
            <QuestionBankDatabasePanel :state="state" :actions="actions" />
          </section>

          <section v-else-if="currentPage === 'assistant'" class="stack-column">
            <QuestionBankAssistantPanel :state="state" :actions="actions" />
          </section>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import ChapterSessionPanel from './components/ChapterSessionPanel.vue'
import ExamWorkspacePlaceholder from './components/ExamWorkspacePlaceholder.vue'
import ImageAttachPanel from './components/ImageAttachPanel.vue'
import JsonMergePanel from './components/JsonMergePanel.vue'
import JsonVisualizerPanel from './components/JsonVisualizerPanel.vue'
import OverviewDeck from './components/OverviewDeck.vue'
import PageGallery from './components/PageGallery.vue'
import PdfWorkspacePanel from './components/PdfWorkspacePanel.vue'
import PipelineKindPanel from './components/PipelineKindPanel.vue'
import PipelineStepper from './components/PipelineStepper.vue'
import QuestionBankAssistantPanel from './components/QuestionBankAssistantPanel.vue'
import QuestionBankDatabasePanel from './components/QuestionBankDatabasePanel.vue'
import QuestionRepairPanel from './components/QuestionRepairPanel.vue'
import TextbookJsonPanel from './components/TextbookJsonPanel.vue'
import WorkspaceNav from './components/WorkspaceNav.vue'
import { useQuestionBankWorkbench } from './composables/useQuestionBankWorkbench'

const { state, actions } = useQuestionBankWorkbench()
const currentPage = ref('overview')
const pipelineKind = ref('textbook')
const pipelineStep = ref('kind')

const pages = [
  { id: 'overview', label: '总览', description: '入口与状态' },
  { id: 'pipeline', label: '结构化处理', description: '教材与试卷分流' },
  { id: 'pdf', label: '页图工作台', description: 'PDF 与页图画廊' },
  { id: 'repair', label: '题目修复', description: '单题补录与覆盖' },
  { id: 'imageAttach', label: '图片补充', description: '补回题目配图' },
  { id: 'visualize', label: '题库可视化', description: '章节树与题目浏览' },
  { id: 'merge', label: 'JSON 合并', description: '多文件整理输出' },
  { id: 'database', label: '数据库导入', description: '新 schema 入库' },
  { id: 'assistant', label: 'AI 助手', description: 'MCP 查库问答' },
]

const sessionLabel = computed(() => {
  if (!state.chapterSessionId) {
    return ''
  }
  return `${state.chapterSessionCurrentChapter || '未命名章节'} / ${state.chapterSessionCurrentSection || '未命名小节'}`
})

const chapterBatchConfiguredCount = computed(
  () =>
    (Array.isArray(state.chapterBatchTasks) ? state.chapterBatchTasks : []).filter(
      (task) =>
        String(task?.jsonLabel || '').trim() ||
        String(task?.serverJsonPath || '').trim() ||
        String(task?.initChapter || '').trim() ||
        String(task?.initSection || '').trim() ||
        (Array.isArray(task?.imageFiles) && task.imageFiles.length),
    ).length,
)

const pipelineSessionLabel = computed(() => {
  if (state.chapterRunMode === 'multi') {
    return chapterBatchConfiguredCount.value
      ? `多章并行 · ${chapterBatchConfiguredCount.value} 个任务`
      : '多章并行待配置'
  }
  return sessionLabel.value || '可直接进入章节会话'
})

const pipelineStatusText = computed(() => {
  if (state.chapterRunMode === 'multi') {
    return state.chapterBatchRunning
      ? '多章并行处理中'
      : state.chapterBatchStatus || '准备配置多章并行任务'
  }
  return state.chapterAutoRunning ? '自动处理运行中' : state.chapterSessionStatus || '准备处理章节与题目'
})

const pipelineSteps = computed(() => {
  const items = [
    {
      id: 'kind',
      index: '01',
      title: '生成类型',
      description: pipelineKind.value === 'exam' ? '当前：试卷生成' : '当前：教材生成',
      disabled: false,
    },
  ]

  if (pipelineKind.value === 'exam') {
    items.push({
      id: 'exam',
      index: '02',
      title: '试卷生成',
      description: '试卷专属流程入口已预留',
      disabled: false,
    })
    return items
  }

  items.push(
    {
      id: 'json',
      index: '02',
      title: '基础教材 JSON',
      description: '可选生成教材工作副本',
      disabled: false,
    },
    {
      id: 'session',
      index: '03',
      title: '章节会话与跑题',
      description: '继续沿用原有教材结构化流程',
      disabled: false,
    },
  )

  return items
})

const canGoPipelineBack = computed(() => pipelineStep.value !== 'kind')
const canGoPipelineNext = computed(() => pipelineStep.value === 'kind' || pipelineStep.value === 'json')

function selectPipelineKind(kind) {
  pipelineKind.value = kind
  pipelineStep.value = kind === 'exam' ? 'exam' : 'json'
}

function goPipelineStep(step) {
  if (step === 'json' || step === 'session') {
    pipelineKind.value = 'textbook'
  }
  if (step === 'exam') {
    pipelineKind.value = 'exam'
  }
  pipelineStep.value = step
}

function goPipelineBack() {
  if (pipelineStep.value === 'session') {
    pipelineStep.value = 'json'
    return
  }
  if (pipelineStep.value === 'json' || pipelineStep.value === 'exam') {
    pipelineStep.value = 'kind'
  }
}

function goPipelineNext() {
  if (pipelineStep.value === 'kind') {
    pipelineStep.value = pipelineKind.value === 'exam' ? 'exam' : 'json'
    return
  }
  if (pipelineStep.value === 'json') {
    pipelineStep.value = 'session'
  }
}

watch(
  () => state.chapterSessionServerJsonPath,
  (value, previous) => {
    if (pipelineKind.value === 'textbook' && value && value !== previous) {
      pipelineStep.value = 'session'
    }
  },
)

onMounted(() => {
  actions.loadQuestionBankDbSummary().catch(() => {})
})

const overviewItems = computed(() => [
  {
    id: 'pipeline',
    eyebrow: 'Structure',
    title: '结构化处理',
    description: '先选择教材生成或试卷生成，再进入对应的结构化工作流。',
    value:
      pipelineKind.value === 'exam'
        ? '当前预览试卷分支'
        : state.chapterRunMode === 'multi'
          ? chapterBatchConfiguredCount.value
            ? '多章模式已配置'
            : '等待配置任务'
          : state.chapterSessionId
            ? '会话已激活'
            : '等待初始化',
    hint:
      pipelineKind.value === 'exam'
        ? '试卷分支入口已建立，后续接入专属逻辑'
        : state.chapterRunMode === 'multi'
          ? pipelineStatusText.value
          : state.chapterSessionCurrentSection || '尚未开始',
    tone: 'mint',
    buttonLabel: '结构化处理',
  },
  {
    id: 'pdf',
    eyebrow: 'Images',
    title: '页图工作台',
    description: '上传 PDF 自动切页，并在画廊中预览每一页的输出结果。',
    value: `${state.pages.length || 0} 页`,
    hint: state.outputFolder || '暂无输出目录',
    tone: 'sun',
    buttonLabel: '页图工作台',
  },
  {
    id: 'repair',
    eyebrow: 'Repair',
    title: '题目修复',
    description: '指定章、小节和题号，只修这一题，适合补题、纠错和局部覆盖。',
    value: state.repairResult ? '最近已修复' : '等待修复',
    hint: state.repairResult?.questionId || state.chapterSessionJsonLabel || '先选择 JSON 文件',
    tone: 'ice',
    buttonLabel: '题目修复',
  },
  {
    id: 'imageAttach',
    eyebrow: 'Images',
    title: '图片补充',
    description: '给指定题目补回缺失配图，自动处理路径和命名，并让可视化页面直接显示。',
    value: state.imageAttachResult ? '最近已补图' : '等待补图',
    hint: state.imageAttachResult?.questionId || state.chapterSessionJsonLabel || '先选择 JSON 文件',
    tone: 'sun',
    buttonLabel: '图片补充',
  },
  {
    id: 'visualize',
    eyebrow: 'Visualize',
    title: '题库可视化',
    description: '读取已有 JSON，按章节树浏览题目、答案和小题结构，并渲染公式。',
    value: state.visualizerPayload ? '已加载题库' : '等待加载',
    hint: state.visualizerFileName || '选择一个题库 JSON 文件',
    tone: 'mint',
    buttonLabel: '题库可视化',
  },
  {
    id: 'merge',
    eyebrow: 'Merge',
    title: 'JSON 合并',
    description: '选择多个章节 JSON，去重拼接后输出到 merged_json 新目录。',
    value: state.mergeResult ? '最近已合并' : '等待合并',
    hint: state.mergeResult?.mergedFileName || `${state.mergeJsonFiles.length || 0} 个待合并文件`,
    tone: 'clear',
    buttonLabel: 'JSON 合并',
  },
  {
    id: 'database',
    eyebrow: 'Database',
    title: '数据库导入',
    description: '终端执行迁移后，把题库 JSON 直接上传到 PostgreSQL 新 schema，并在页面里看导入结果。',
    value: state.dbSummary?.counts?.textbookCount ?? '0',
    hint: state.dbSummary?.schema || state.dbSummaryStatus || '等待数据库摘要',
    tone: 'ice',
    buttonLabel: '数据库导入',
  },
  {
    id: 'assistant',
    eyebrow: 'Assistant',
    title: 'AI 助手',
    description: '采用 MCP 查询题库数据库，支持自然语言问答、教材筛选、章节定位和题目检索。',
    value: state.assistantMessages.length ? `${state.assistantMessages.length} 条消息` : '等待提问',
    hint: state.assistantStatus || '可直接询问某章某节有哪些题',
    tone: 'berry',
    buttonLabel: 'AI 助手',
  },
])
</script>
