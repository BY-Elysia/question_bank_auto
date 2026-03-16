<template>
  <div class="app-shell">
    <span class="ambient-orb orb-a"></span>
    <span class="ambient-orb orb-b"></span>
    <span class="ambient-orb orb-c"></span>

    <main class="workspace-shell">
      <WorkspaceNav :items="pages" :current-page="currentPage" @change="currentPage = $event" />

      <AppHero
        :metrics="heroMetrics"
        :title="currentHero.title"
        :description="currentHero.description"
        :model-name="currentHero.model"
        :session-label="currentHero.session"
        :status-text="currentHero.status"
      />

      <section v-if="currentPage === 'overview'" class="stack-column">
        <OverviewDeck :items="overviewItems" @jump="currentPage = $event" />
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
        <TextbookJsonPanel v-if="pipelineStep === 'json'" :state="state" :actions="actions" />
        <ChapterSessionPanel v-else :state="state" :actions="actions" />
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

      <section v-else-if="currentPage === 'latexRepair'" class="stack-column">
        <LatexRepairPanel :state="state" :actions="actions" />
      </section>

      <section v-else-if="currentPage === 'visualize'" class="stack-column">
        <JsonVisualizerPanel :state="state" :actions="actions" />
      </section>

      <section v-else-if="currentPage === 'merge'" class="stack-column">
        <JsonMergePanel :state="state" :actions="actions" />
      </section>

      <section v-else class="stack-column">
        <ReadStudioPanel :state="state" :actions="actions" />
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import AppHero from './components/AppHero.vue'
import ChapterSessionPanel from './components/ChapterSessionPanel.vue'
import ImageAttachPanel from './components/ImageAttachPanel.vue'
import JsonMergePanel from './components/JsonMergePanel.vue'
import JsonVisualizerPanel from './components/JsonVisualizerPanel.vue'
import LatexRepairPanel from './components/LatexRepairPanel.vue'
import OverviewDeck from './components/OverviewDeck.vue'
import PageGallery from './components/PageGallery.vue'
import PdfWorkspacePanel from './components/PdfWorkspacePanel.vue'
import PipelineStepper from './components/PipelineStepper.vue'
import QuestionRepairPanel from './components/QuestionRepairPanel.vue'
import ReadStudioPanel from './components/ReadStudioPanel.vue'
import TextbookJsonPanel from './components/TextbookJsonPanel.vue'
import WorkspaceNav from './components/WorkspaceNav.vue'
import { useQuestionBankWorkbench } from './composables/useQuestionBankWorkbench'

const { state, actions } = useQuestionBankWorkbench()
const currentPage = ref('overview')
const pipelineStep = ref('session')

const pages = [
  { id: 'overview', label: '总览', description: '入口与状态' },
  { id: 'pipeline', label: '结构化处理', description: 'JSON 与章节会话' },
  { id: 'pdf', label: '页图工作台', description: 'PDF 与页图库' },
  { id: 'repair', label: '题目修复', description: '单题补录覆盖' },
  { id: 'imageAttach', label: '图片补充', description: '补回题目配图' },
  { id: 'latexRepair', label: 'LaTeX修复', description: '已有 JSON 公式修复' },
  { id: 'visualize', label: '题库可视化', description: '章节与题答浏览' },
  { id: 'merge', label: 'JSON 合并', description: '多文件拼接输出' },
  { id: 'read', label: '豆包读取', description: '图片直传识别' },
]

const sessionLabel = computed(() => {
  if (!state.chapterSessionId) {
    return ''
  }
  return `${state.chapterSessionCurrentChapter || '未命名章节'} / ${state.chapterSessionCurrentSection || '未命名小节'}`
})

const heroByPage = computed(() => ({
  overview: {
    title: '题库自动处理中心',
    description: '集中管理结构化提取、题目修复、图片补充、LaTeX 修复、题库可视化、JSON 合并和页图识别入口。',
    model: '总览面板',
    session: sessionLabel.value || '查看当前工作流状态',
    status: '从这里进入对应工作区',
  },
  pipeline: {
    title: '结构化提取流程',
    description: '处理章节会话、跨页题和按页入库。基础教材 JSON 是可选步骤，当前可直接进入第二步。',
    model: '结构化处理工作台',
    session: sessionLabel.value || '可直接进入章节会话',
    status: state.chapterAutoRunning ? '自动处理运行中' : state.chapterSessionStatus || '准备处理章节与题目',
  },
  pdf: {
    title: 'PDF 与页图库',
    description: '负责 PDF 转图、页图筛选和后续送入模型前的图片准备。',
    model: '页图工作台',
    session: state.outputFolder || '先上传 PDF 生成页图',
    status: state.statusText || '准备处理 PDF',
  },
  repair: {
    title: '题目定点修复',
    description: '按章节、小节和题号精确修复单题，支持多图跨页读取，结果输出到 repair_json。',
    model: '题目修复工作台',
    session: state.chapterSessionJsonLabel || '先选择需要修复的 JSON 文件',
    status: state.repairStatus || '准备执行定点修复',
  },
  imageAttach: {
    title: '题目图片补充',
    description: '给指定大题或小题补回遗漏的题目配图，自动写入 media 字段，并让可视化页面直接显示。',
    model: '图片补充工作台',
    session: state.chapterSessionJsonLabel || '先选择需要补图的 JSON 文件',
    status: state.imageAttachStatus || '准备补充题目图片',
  },
  latexRepair: {
    title: 'LaTeX 格式修复',
    description: '对已有题库 JSON 做确定性公式修复，重点处理单反斜杠命令和未闭合块公式。',
    model: 'LaTeX 修复工作台',
    session: state.chapterSessionJsonLabel || '先选择一个题库 JSON 文件',
    status: state.latexRepairStatus || '准备扫描并修复 LaTeX 文本',
  },
  visualize: {
    title: '题库章节可视化',
    description: '本地解析题库 JSON，按章节树筛选题目和答案，并直接渲染 LaTeX 公式。',
    model: '题库浏览工作台',
    session: state.visualizerFileName || '先选择一个题库 JSON 文件',
    status: state.visualizerStatus || '准备解析题库结构并展示题答',
  },
  merge: {
    title: '多章节 JSON 合并',
    description: '把拆开的多个章节 JSON 去重合并，自动整理章节树和题目顺序，输出到 merged_json。',
    model: 'JSON 合并工作台',
    session: state.mergeJsonFiles.length ? `已选择 ${state.mergeJsonFiles.length} 个文件` : '先选择多个 JSON 文件',
    status: state.mergeStatus || '准备执行 JSON 合并',
  },
  read: {
    title: '豆包读取工作区',
    description: '直接上传图片做逐字转写，结果统一输出到识别文本区域。',
    model: '豆包直传读取',
    session: state.savedTextUrl ? '已生成可打开的 TXT 结果' : '可直接上传图片转写',
    status: state.readStatusText || '准备发送图片给豆包',
  },
}))

const currentHero = computed(() => heroByPage.value[currentPage.value] || heroByPage.value.overview)

const pipelineSteps = computed(() => [
  { id: 'json', index: '01', title: '基础教材 JSON', description: '可选生成教材工作副本', disabled: false },
  { id: 'session', index: '02', title: '章节会话与跑批', description: '可直接开始，也支持回退', disabled: false },
])

const canGoPipelineBack = computed(() => pipelineStep.value === 'session')
const canGoPipelineNext = computed(() => pipelineStep.value === 'json')

function goPipelineStep(step) {
  pipelineStep.value = step
}

function goPipelineBack() {
  if (pipelineStep.value === 'session') {
    pipelineStep.value = 'json'
  }
}

function goPipelineNext() {
  pipelineStep.value = 'session'
}

watch(
  () => state.chapterSessionServerJsonPath,
  (value, previous) => {
    if (value && value !== previous) {
      pipelineStep.value = 'session'
    }
  },
)

const heroMetrics = computed(() => [
  {
    label: 'Pages',
    value: state.pages.length || '0',
    hint: state.pages.length ? `输出目录 ${state.outputFolder || '-'}` : '等待 PDF 转图',
  },
  {
    label: 'Selected',
    value: state.selectedImageUrls.length || '0',
    hint: state.selectedImageUrls.length ? '页图库已选择识别输入' : '可从页图库中勾选',
  },
  {
    label: 'Session',
    value: state.chapterSessionId ? 'Active' : 'Idle',
    hint: state.chapterSessionId ? state.chapterSessionCurrentSection || '会话已初始化' : '等待初始化章节会话',
  },
  {
    label: 'Readback',
    value: state.readText ? 'Ready' : 'Empty',
    hint: state.readText ? `${state.readText.length} 字输出已生成` : '识别结果会显示在读取工作台',
  },
])

const overviewItems = computed(() => [
  {
    id: 'pipeline',
    eyebrow: 'Structure',
    title: '结构化处理',
    description: '生成教材 JSON、初始化章节会话、按页推进题库结构化提取。',
    value: state.chapterSessionId ? '会话已激活' : '等待初始化',
    hint: state.chapterSessionCurrentSection || '尚未开始',
    tone: 'mint',
    buttonLabel: '结构化处理',
  },
  {
    id: 'pdf',
    eyebrow: 'Images',
    title: '页图工作台',
    description: '上传 PDF 自动切页，并在画廊中勾选图片送入模型。',
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
    id: 'latexRepair',
    eyebrow: 'LaTeX',
    title: 'LaTeX修复',
    description: '对已有 JSON 做公式格式修复，输出新文件，不覆盖原文件。',
    value: state.latexRepairResult ? '最近已修复' : '等待修复',
    hint: state.latexRepairResult?.repairedFileName || state.chapterSessionJsonLabel || '先选择 JSON 文件',
    tone: 'clear',
    buttonLabel: 'LaTeX修复',
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
    description: '选择多个章节 JSON，去重拼接后输出到 merged_json 新文件夹。',
    value: state.mergeResult ? '最近已合并' : '等待合并',
    hint: state.mergeResult?.mergedFileName || `${state.mergeJsonFiles.length || 0} 个待合并文件`,
    tone: 'clear',
    buttonLabel: 'JSON 合并',
  },
  {
    id: 'read',
    eyebrow: 'Reading',
    title: '豆包读取',
    description: '直接上传图片做逐字转写，结果统一落到识别输出窗。',
    value: state.readText ? '结果已生成' : '等待识别',
    hint: state.readText ? `${state.readText.length} 字` : '未生成输出',
    tone: 'berry',
    buttonLabel: '豆包读取',
  },
])
</script>
