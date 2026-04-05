import { nextTick, reactive } from 'vue'

import { createChapterSessionFlow } from './useChapterSessionFlow'
import { applyExamSourceMeta, createExamSessionFlow } from './useExamSessionFlow'

function getWindowApi(name) {
  if (typeof window === 'undefined') {
    return null
  }
  return window[name] || null
}

function supportsPicker(name) {
  return typeof getWindowApi(name) === 'function'
}

async function fileToText(file) {
  return await file.text()
}

function triggerJsonDownload(fileName, text) {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' })
  triggerBlobDownload(fileName, blob)
}

function triggerBlobDownload(fileName, blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

function normalizeJsonDownloadName(fileName, fallback = 'main.json') {
  const trimmed = String(fileName || '').trim()
  if (!trimmed) {
    return fallback
  }
  return trimmed.toLowerCase().endsWith('.json') ? trimmed : `${trimmed}.json`
}

function normalizeDownloadName(fileName, fallback = 'download.bin') {
  const trimmed = String(fileName || '').trim()
  return trimmed || fallback
}

function normalizeImageAttachTargetType(value) {
  return String(value || '').trim() === 'standardAnswer' ? 'standardAnswer' : 'prompt'
}

export function useQuestionBankWorkbench() {
  const state = reactive({
    selectedPdfFiles: [],
    folderName: '',
    loading: false,
    isError: false,
    statusText: '请选择一个或多个 PDF 文件',
    batchId: '',
    outputFolder: '',
    pages: [],
    generatedTextbookJson: '',
    generatedExamJson: '',
    jsonFormError: '',
    jsonSaveStatus: '',
    jsonSaveError: false,
    examJsonFormError: '',
    examJsonSaveStatus: '',
    examJsonSaveError: false,
    currentWorkspaceId: '',
    workspaceListLoading: false,
    workspaceListStatus: '',
    workspaceListError: false,
    workspaceList: [],
    workspaceCreateName: '',
    workspaceCreateRunning: false,
    workspaceSummaryLoading: false,
    workspaceSummaryStatus: '',
    workspaceSummaryError: false,
    workspaceSummary: null,
    workspaceBrowserLoading: false,
    workspaceBrowserStatus: '',
    workspaceBrowserError: false,
    workspaceBrowser: null,
    workspaceBrowserDownloadTarget: '',
    workspaceDownloadRunning: false,
    workspaceCleanupRunning: false,
    workspaceDeleteRunning: false,
    chapterSessionJsonLabel: '',
    chapterSessionServerJsonPath: '',
    chapterSessionJsonAssetId: '',
    chapterSessionJsonHandle: null,
    workingJsonDocumentType: '',
    workingJsonExamType: '',
    workingJsonHasAnswer: null,
    chapterSessionInitChapter: '第八章 不定积分',
    chapterSessionInitSection: '习题8.1',
    chapterSessionId: '',
    chapterSessionCurrentChapter: '',
    chapterSessionCurrentSection: '',
    chapterArkApiKey: '',
    chapterRunMode: 'single',
    chapterSingleMode: 'session',
    chapterProcessingMode: 'original',
    chapterSessionStatus: '',
    chapterSessionError: false,
    examSessionJsonLabel: '',
    examSessionServerJsonPath: '',
    examSessionJsonAssetId: '',
    examSessionJsonHandle: null,
    examSessionId: '',
    examSessionTitle: '',
    examSessionExamType: '',
    examSessionHasAnswer: true,
    examSessionCurrentMajor: '',
    examSessionCurrentMinor: '',
    examSessionPayload: null,
    examSessionStatus: '',
    examSessionError: false,
    examQuestionTypeOptions: [],
    examQuestionTypeLoading: false,
    examQuestionTypeStatus: '',
    examQuestionTypeError: false,
    examSectionStatus: '',
    examSectionError: false,
    examFinalizeStatus: '',
    examFinalizeError: false,
    examFinalizeProcessing: false,
    examSectionTasks: [],
    repairForm: {
      chapterNo: '',
      sectionNo: '',
      questionNo: '',
      questionId: '',
    },
    repairImageFiles: [],
    repairProcessing: false,
    repairStatus: '',
    repairError: false,
    repairRawText: '',
    repairResult: null,
    mathFormatRepairForm: {
      targetType: 'standardAnswer',
      childNo: '',
      questionId: '',
      childQuestionId: '',
    },
    mathFormatRepairProcessing: false,
    mathFormatRepairStatus: '',
    mathFormatRepairError: false,
    mathFormatRepairResult: null,
    imageAttachForm: {
      chapterNo: '',
      sectionNo: '',
      questionNo: '',
      childNo: '',
      questionId: '',
      childQuestionId: '',
      targetType: 'prompt',
    },
    imageAttachFiles: [],
    imageAttachProcessing: false,
    imageAttachStatus: '',
    imageAttachError: false,
    imageAttachResult: null,
    visualizerFileName: '',
    visualizerServerJsonPath: '',
    visualizerJsonAssetId: '',
    visualizerWorkspaceId: '',
    visualizerWorkspaceBrowserLoading: false,
    visualizerWorkspaceBrowserStatus: '',
    visualizerWorkspaceBrowserError: false,
    visualizerWorkspaceBrowser: null,
    visualizerImportJsonFile: null,
    visualizerImportJsonName: '',
    visualizerImportJsonSourceMode: 'workspace',
    visualizerImportWorkspaceJsonPath: '',
    visualizerImportSourceMode: 'workspace',
    visualizerImportFolderFiles: [],
    visualizerImportFolderLabel: '',
    visualizerImportWorkspacePath: '',
    visualizerImportWorkspaceLabel: '',
    visualizerStatus: '',
    visualizerError: false,
    visualizerUploadsProcessing: false,
    visualizerUploadsStatus: '',
    visualizerUploadsError: false,
    visualizerPayload: null,
    visualizerArkApiKey: '',
    visualizerAnswerPrompt: '',
    visualizerAnswerProcessing: false,
    visualizerAnswerStatus: '',
    visualizerAnswerError: false,
    visualizerRepairProcessing: false,
    visualizerRepairStatus: '',
    visualizerRepairError: false,
    visualizerRepairRawText: '',
    visualizerQuestionTypeProcessing: false,
    visualizerRepairImageFiles: [],
    visualizerImageAttachTarget: 'prompt',
    visualizerRewriteResult: null,
    mergeSourceMode: 'upload',
    mergeJsonFiles: [],
    mergeWorkspaceSlotPaths: [],
    mergeOutputFileName: 'merged_textbook.json',
    mergeProcessing: false,
    mergeStatus: '',
    mergeError: false,
    mergeResult: null,
    dbImportFiles: [],
    dbImportProcessing: false,
    dbImportStatus: '',
    dbImportError: false,
    dbImportResult: null,
    dbSummaryLoading: false,
    dbSummaryStatus: '',
    dbSummaryError: false,
    dbSummary: null,
    assistantInput: '',
    assistantMessages: [],
    assistantProcessing: false,
    assistantStatus: '',
    assistantError: false,
    assistantArkApiKey: '',
    assistantToolTraces: [],
    chapterImageFile: null,
    chapterProcessing: false,
    chapterPassLogs: '',
    chapterPassResult: null,
    examImageFile: null,
    examProcessing: false,
    examPassLogs: '',
    examPassResult: null,
    chapterAutoFiles: [],
    chapterAutoFolderLabel: '',
    chapterAutoRunning: false,
    chapterAutoStopping: false,
    chapterAutoStatus: '',
    chapterAutoError: false,
    chapterAutoLogs: '',
    chapterAutoProgress: '',
    chapterAutoEntries: [],
    chapterAutoSummary: null,
    chapterAutoLive: null,
    chapterManualChapters: [],
    chapterManualRunning: false,
    chapterManualStopping: false,
    chapterManualStatus: '',
    chapterManualError: false,
    chapterManualLogs: '',
    chapterManualSummary: null,
    chapterManualLive: null,
    examAutoFiles: [],
    examAutoFolderLabel: '',
    examAutoRunning: false,
    examAutoStopping: false,
    examAutoStatus: '',
    examAutoError: false,
    examAutoLogs: '',
    examAutoEntries: [],
    examAutoSummary: null,
    examAutoLive: null,
    chapterBatchConcurrency: 2,
    chapterBatchTasks: [],
    chapterBatchRunning: false,
    chapterBatchStopping: false,
    chapterBatchStatus: '',
    chapterBatchError: false,
    multiChapterSlotCount: 3,
    multiChapterSlotSetupRunning: false,
    multiChapterSlotSetupStatus: '',
    multiChapterSlotSetupError: false,
    multiChapterSlotsLoading: false,
    multiChapterSlotsStatus: '',
    multiChapterSlotsError: false,
    multiChapterSlots: [],
    jsonForm: {
      version: 'v1.1',
      courseId: '',
      textbookId: '',
      title: '',
      publisher: '',
      subject: '',
      hasAnswer: true,
    },
    examJsonForm: {
      version: 'v1.1',
      courseId: '',
      examId: '',
      title: '',
      subject: '',
      examType: 'midterm',
      hasAnswer: true,
    },
  })

  let selectedPdfSequence = 0
  let chapterManualAbortController = null
  let chapterBatchTaskSequence = 0
  let chapterManualChapterSequence = 0
  let chapterManualSectionSequence = 0
  let examSectionTaskSequence = 0
  let examStagedQuestionSequence = 0
  const chapterBatchAbortControllers = new Map()

  function createSelectedPdfEntry(file) {
    selectedPdfSequence += 1
    return {
      id: `pdf_${Date.now()}_${selectedPdfSequence}`,
      file,
    }
  }

  function createChapterBatchTask() {
    chapterBatchTaskSequence += 1
    return {
      id: `chapter_task_${Date.now()}_${chapterBatchTaskSequence}`,
      workspaceId: '',
      slotName: '',
      slotRelativePath: '',
      slotJsonFileName: '',
      slotJsonRelativePath: '',
      slotImageCount: 0,
      initChapter: '',
      initSection: '',
      sessionId: '',
      currentChapter: '',
      currentSection: '',
      status: '',
      error: false,
      running: false,
      stopped: false,
      completed: false,
      phase: '待命',
      currentIndex: 0,
      completedCount: 0,
      successCount: 0,
      failedCount: 0,
      totalCount: 0,
      currentFileName: '',
      logs: '',
      lastQuestion: null,
      lastPrefixCache: null,
    }
  }

  function normalizeChapterBatchConcurrency(value) {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) {
      return 2
    }
    return Math.max(1, Math.min(6, Math.trunc(numeric)))
  }

  function normalizeMultiChapterSlotCount(value) {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) {
      return 1
    }
    return Math.max(1, Math.min(99, Math.trunc(numeric)))
  }

  function normalizeMergeSourceMode(value) {
    return String(value || '').trim() === 'workspace' ? 'workspace' : 'upload'
  }

  function getChapterBatchTaskLabel(task) {
    return (
      String(task?.slotRelativePath || '').trim() ||
      String(task?.slotName || '').trim() ||
      String(task?.slotJsonFileName || '').trim() ||
      [String(task?.initChapter || '').trim(), String(task?.initSection || '').trim()].filter(Boolean).join(' / ') ||
      '未命名章节任务'
    )
  }

  function findChapterBatchTask(taskId) {
    return state.chapterBatchTasks.find((item) => item?.id === taskId) || null
  }

  function findMultiChapterSlot(slotRelativePath) {
    const normalizedPath = String(slotRelativePath || '').trim()
    if (!normalizedPath) {
      return null
    }
    return (Array.isArray(state.multiChapterSlots) ? state.multiChapterSlots : []).find(
      (item) => String(item?.slotRelativePath || '').trim() === normalizedPath,
    ) || null
  }

  function isChapterBatchTaskConfigured(task) {
    if (!task || typeof task !== 'object') {
      return false
    }
    return Boolean(
      String(task.slotRelativePath || '').trim() ||
        String(task.initChapter || '').trim() ||
        String(task.initSection || '').trim() ||
        Number(task.slotImageCount || 0) > 0,
    )
  }

  function isChapterBatchTaskReady(task) {
    if (!task || typeof task !== 'object') {
      return false
    }
    return Boolean(
      String(task.slotRelativePath || '').trim() &&
        String(task.initChapter || '').trim() &&
        String(task.initSection || '').trim() &&
        Number(task.slotImageCount || 0) > 0,
    )
  }

  function findChapterManualChapter(chapterId) {
    return state.chapterManualChapters.find((item) => item?.id === chapterId) || null
  }

  function findChapterManualSection(chapterId, sectionId) {
    const chapter = findChapterManualChapter(chapterId)
    if (!chapter) {
      return { chapter: null, section: null }
    }
    return {
      chapter,
      section: (Array.isArray(chapter.sections) ? chapter.sections : []).find((item) => item?.id === sectionId) || null,
    }
  }

  function getChapterManualSectionLabel(chapter, section) {
    return [String(chapter?.chapterTitle || '').trim(), String(section?.sectionTitle || '').trim()]
      .filter(Boolean)
      .join(' / ') || '未命名片段'
  }

  function isChapterManualSectionReady(chapter, section) {
    return Boolean(
      String(chapter?.chapterTitle || '').trim()
      && String(section?.sectionTitle || '').trim()
      && Array.isArray(section?.imageFiles)
      && section.imageFiles.length,
    )
  }

  function isChapterManualConfigured(chapter) {
    if (!chapter || typeof chapter !== 'object') {
      return false
    }
    return Boolean(
      String(chapter.chapterTitle || '').trim()
      || (Array.isArray(chapter.sections) && chapter.sections.some((section) => isChapterManualSectionReady(chapter, section))),
    )
  }

  function flattenChapterManualSections() {
    const items = []
    for (const chapter of Array.isArray(state.chapterManualChapters) ? state.chapterManualChapters : []) {
      for (const section of Array.isArray(chapter?.sections) ? chapter.sections : []) {
        items.push({
          chapter,
          section,
          ready: isChapterManualSectionReady(chapter, section),
          label: getChapterManualSectionLabel(chapter, section),
        })
      }
    }
    return items
  }

  function resetPdfWorkspace() {
    state.batchId = ''
    state.outputFolder = ''
    state.pages = []
  }

  function buildTextbookPayload() {
    return {
      version: String(state.jsonForm.version || '').trim(),
      courseId: String(state.jsonForm.courseId || '').trim(),
      documentType: 'textbook',
      textbook: {
        textbookId: String(state.jsonForm.textbookId || '').trim(),
        title: String(state.jsonForm.title || '').trim(),
        publisher: String(state.jsonForm.publisher || '').trim(),
        subject: String(state.jsonForm.subject || '').trim(),
        hasAnswer: state.jsonForm.hasAnswer !== false,
      },
      chapters: [],
      questions: [],
    }
  }

  function createChapterManualSection() {
    chapterManualSectionSequence += 1
    return {
      id: `chapter_manual_section_${Date.now()}_${chapterManualSectionSequence}`,
      sectionTitle: '',
      imageFiles: [],
      status: '',
      error: false,
      running: false,
      completed: false,
      upsertedCount: 0,
      questionsCount: 0,
      logs: '',
    }
  }

  function createChapterManualChapter() {
    chapterManualChapterSequence += 1
    return {
      id: `chapter_manual_chapter_${Date.now()}_${chapterManualChapterSequence}`,
      chapterTitle: '',
      sections: [createChapterManualSection()],
    }
  }

  function createExamSectionTask() {
    examSectionTaskSequence += 1
    return {
      id: `exam_section_${Date.now()}_${examSectionTaskSequence}`,
      majorTitle: '',
      minorTitle: '',
      questionType: 'SHORT_ANSWER',
      libraryDocumentType: '',
      imageFiles: [],
      stagedQuestions: [],
      confirmed: false,
      status: '',
      error: false,
      running: false,
      result: null,
      searchQuery: '',
      searchStatus: '',
      searchError: false,
      searchResults: [],
      selectedRecordIds: [],
    }
  }

  state.examSectionTasks.push(createExamSectionTask())
  state.chapterManualChapters.push(createChapterManualChapter())

  function buildExamPayload() {
    return {
      version: String(state.examJsonForm.version || '').trim(),
      courseId: String(state.examJsonForm.courseId || '').trim(),
      documentType: 'exam',
      exam: {
        examId: String(state.examJsonForm.examId || '').trim(),
        title: String(state.examJsonForm.title || '').trim(),
        subject: String(state.examJsonForm.subject || '').trim(),
        examType: String(state.examJsonForm.examType || '').trim() || 'midterm',
        hasAnswer: state.examJsonForm.hasAnswer !== false,
      },
      chapters: [],
      questions: [],
    }
  }

  function detectPayloadDocumentType(payload) {
    if (String(payload?.documentType || '').trim().toLowerCase() === 'exam' || payload?.exam) {
      return 'exam'
    }
    return 'textbook'
  }

  function getPayloadSourceMeta(payload) {
    const documentType = detectPayloadDocumentType(payload)
    if (documentType === 'exam') {
      const exam = payload?.exam && typeof payload.exam === 'object' ? payload.exam : {}
      return {
        documentType,
        externalId: String(exam.examId || '').trim(),
        title: String(exam.title || '').trim(),
        subject: String(exam.subject || '').trim(),
        examType: String(exam.examType || '').trim(),
        hasAnswer: exam.hasAnswer !== false,
      }
    }

    const textbook = payload?.textbook && typeof payload.textbook === 'object' ? payload.textbook : {}
    return {
      documentType,
      externalId: String(textbook.textbookId || '').trim(),
      title: String(textbook.title || '').trim(),
      subject: String(textbook.subject || '').trim(),
      examType: '',
      hasAnswer: textbook.hasAnswer !== false,
    }
  }

  function normalizeQuestionTypeValue(value) {
    const raw = String(value || '').trim()
    if (!raw) {
      return ''
    }
    const upper = raw.toUpperCase()
    if (upper === 'PROGRAMMING' || upper === 'CODE') {
      return 'CODE'
    }
    return upper
  }

  function applyWorkingJsonMeta(payload) {
    const meta = getPayloadSourceMeta(payload || {})
    state.workingJsonDocumentType = meta.documentType
    state.workingJsonExamType = meta.examType || ''
    state.workingJsonHasAnswer = typeof meta.hasAnswer === 'boolean' ? meta.hasAnswer : null
    if (meta.documentType === 'exam') {
      applyExamSourceMeta(state, meta)
    }
  }

  async function parseApiResponse(resp) {
    const text = await resp.text()
    if (!text) {
      return {}
    }
    try {
      return JSON.parse(text)
    } catch (error) {
      const preview = text.slice(0, 300)
      throw new Error(`后端返回非 JSON 响应（HTTP ${resp.status}）: ${preview}`)
    }
  }

  function normalizeManagedJsonRef(ref) {
    return {
      workspaceId: String(ref?.workspaceId || '').trim(),
      jsonAssetId: String(ref?.jsonAssetId || '').trim(),
      jsonFilePath: String(ref?.jsonFilePath || '').trim(),
    }
  }

  function clearCurrentWorkspaceSummary() {
    state.workspaceSummaryLoading = false
    state.workspaceSummaryError = false
    state.workspaceSummaryStatus = ''
    state.workspaceSummary = null
  }

  function clearWorkspaceBrowser() {
    state.workspaceBrowserLoading = false
    state.workspaceBrowserError = false
    state.workspaceBrowserStatus = ''
    state.workspaceBrowser = null
    state.workspaceBrowserDownloadTarget = ''
  }

  function clearVisualizerWorkspaceBrowser() {
    state.visualizerWorkspaceBrowserLoading = false
    state.visualizerWorkspaceBrowserError = false
    state.visualizerWorkspaceBrowserStatus = ''
    state.visualizerWorkspaceBrowser = null
  }

  function clearVisualizerWorkspaceBindings() {
    state.visualizerFileName = ''
    state.visualizerServerJsonPath = ''
    state.visualizerJsonAssetId = ''
    state.visualizerImportJsonFile = null
    state.visualizerImportJsonName = ''
    state.visualizerImportJsonSourceMode = 'workspace'
    state.visualizerImportWorkspaceJsonPath = ''
    state.visualizerImportSourceMode = 'workspace'
    state.visualizerImportFolderFiles = []
    state.visualizerImportFolderLabel = ''
    state.visualizerImportWorkspacePath = ''
    state.visualizerImportWorkspaceLabel = ''
    state.visualizerStatus = ''
    state.visualizerError = false
    state.visualizerUploadsStatus = ''
    state.visualizerUploadsError = false
    state.visualizerPayload = null
    state.visualizerAnswerStatus = ''
    state.visualizerAnswerError = false
    state.visualizerRepairStatus = ''
    state.visualizerRepairError = false
    state.visualizerRepairRawText = ''
    state.visualizerRepairImageFiles = []
    state.visualizerRewriteResult = null
  }

  function clearMultiChapterSlots() {
    state.multiChapterSlotsLoading = false
    state.multiChapterSlotsError = false
    state.multiChapterSlotsStatus = ''
    state.multiChapterSlots = []
    state.mergeWorkspaceSlotPaths = []
    state.multiChapterSlotSetupRunning = false
    state.multiChapterSlotSetupError = false
    state.multiChapterSlotSetupStatus = ''
  }

  function resetCurrentWorkspaceBindings() {
    state.currentWorkspaceId = ''
    clearCurrentWorkspaceSummary()
    clearWorkspaceBrowser()
    clearMultiChapterSlots()

    state.outputFolder = ''
    state.pages = []

    state.chapterSessionJsonLabel = ''
    state.chapterSessionServerJsonPath = ''
    state.chapterSessionJsonAssetId = ''
    state.chapterSessionJsonHandle = null
    state.chapterSessionId = ''
    state.chapterSessionCurrentChapter = ''
    state.chapterSessionCurrentSection = ''

    state.examSessionJsonLabel = ''
    state.examSessionServerJsonPath = ''
    state.examSessionJsonAssetId = ''
    state.examSessionJsonHandle = null
    state.examSessionId = ''
    state.examSessionTitle = ''
    state.examSessionCurrentMajor = ''
    state.examSessionCurrentMinor = ''
    state.examSessionPayload = null

    state.visualizerWorkspaceId = ''
    clearVisualizerWorkspaceBrowser()
    clearVisualizerWorkspaceBindings()

    state.chapterBatchTasks = state.chapterBatchTasks.map(() => createChapterBatchTask())
  }

  function buildManagedJsonBody(ref, extra = {}) {
    const normalized = normalizeManagedJsonRef(ref)
    return {
      ...extra,
      workspaceId: normalized.workspaceId,
      jsonAssetId: normalized.jsonAssetId,
      jsonFilePath: normalized.jsonFilePath,
    }
  }

  function appendManagedJsonFormData(formData, ref) {
    const normalized = normalizeManagedJsonRef(ref)
    if (normalized.workspaceId) {
      formData.append('workspaceId', normalized.workspaceId)
    }
    if (normalized.jsonAssetId) {
      formData.append('jsonAssetId', normalized.jsonAssetId)
    }
    if (normalized.jsonFilePath) {
      formData.append('jsonFilePath', normalized.jsonFilePath)
    }
  }

  function getChapterProcessingProfile() {
    const isResponsesExperiment = state.chapterProcessingMode === 'responses'
    return {
      mode: isResponsesExperiment ? 'responses' : 'original',
      modeLabel: isResponsesExperiment ? 'Responses前缀缓存实验版' : '原逻辑',
      processImageEndpoint: isResponsesExperiment
        ? '/api/chapters/session/process-image-responses'
        : '/api/chapters/session/process-image',
      processSegmentEndpoint: isResponsesExperiment
        ? '/api/chapters/segments/append-from-images-responses'
        : '/api/chapters/segments/append-from-images',
    }
  }

  function setChapterRunMode(mode) {
    if (mode !== 'single' && mode !== 'multi') {
      return
    }
    if (state.chapterProcessing || state.chapterAutoRunning || state.chapterBatchRunning || state.chapterManualRunning) {
      return
    }
    state.chapterRunMode = mode
    if (mode === 'multi' && !state.chapterBatchTasks.length) {
      state.chapterBatchTasks.push(createChapterBatchTask())
    }
  }

  function setChapterSingleMode(mode) {
    if (mode !== 'session' && mode !== 'manual') {
      return
    }
    if (state.chapterProcessing || state.chapterAutoRunning || state.chapterManualRunning) {
      return
    }
    state.chapterSingleMode = mode
  }

  function setChapterProcessingMode(mode) {
    if (mode !== 'original' && mode !== 'responses') {
      return
    }
    if (state.chapterProcessing || state.chapterAutoRunning || state.chapterBatchRunning || state.chapterManualRunning) {
      return
    }
    state.chapterProcessingMode = mode
  }

  function setChapterBatchConcurrency(value) {
    state.chapterBatchConcurrency = normalizeChapterBatchConcurrency(value)
  }

  function getChapterArkApiKey() {
    return String(state.chapterArkApiKey || '').trim()
  }

  function buildChapterArkHeaders() {
    const arkApiKey = getChapterArkApiKey()
    return arkApiKey ? { 'X-Ark-Api-Key': arkApiKey } : {}
  }

  function getAssistantArkApiKey() {
    return String(state.assistantArkApiKey || '').trim()
  }

  function buildAssistantArkHeaders() {
    const arkApiKey = getAssistantArkApiKey()
    return arkApiKey ? { 'X-Ark-Api-Key': arkApiKey } : {}
  }

  function getVisualizerArkApiKey() {
    return String(state.visualizerArkApiKey || '').trim()
  }

  function buildVisualizerArkHeaders() {
    const arkApiKey = getVisualizerArkApiKey()
    return arkApiKey ? { 'X-Ark-Api-Key': arkApiKey } : {}
  }

  function ensureChapterArkApiKey() {
    if (getChapterArkApiKey()) {
      return true
    }
    state.chapterSessionError = true
    state.chapterSessionStatus = '请先在当前页面填写 API Key，再开始提取'
    state.chapterAutoError = true
    state.chapterAutoStatus = '请先在当前页面填写 API Key，再开始提取'
    state.chapterBatchError = true
    state.chapterBatchStatus = '请先在当前页面填写 API Key，再开始提取'
    state.examSessionError = true
    state.examSessionStatus = '请先在当前页面填写 API Key，再开始提取'
    state.examAutoError = true
    state.examAutoStatus = '请先在当前页面填写 API Key，再开始提取'
    return false
  }

  function isAbortRequestError(error) {
    return error?.name === 'AbortError' || String(error?.message || '').toLowerCase().includes('aborted')
  }

  function resetChapterAutoRuntimeState() {
    state.chapterAutoError = false
    state.chapterAutoStopping = false
    state.chapterAutoStatus = ''
    state.chapterAutoLogs = ''
    state.chapterAutoProgress = ''
    state.chapterAutoEntries = []
    state.chapterAutoSummary = null
    state.chapterAutoLive = null
  }

  function resetChapterManualRuntimeState() {
    state.chapterManualError = false
    state.chapterManualStopping = false
    state.chapterManualStatus = ''
    state.chapterManualLogs = ''
    state.chapterManualSummary = null
    state.chapterManualLive = null
    for (const chapter of Array.isArray(state.chapterManualChapters) ? state.chapterManualChapters : []) {
      for (const section of Array.isArray(chapter?.sections) ? chapter.sections : []) {
        section.running = false
        section.error = false
        section.completed = false
        section.upsertedCount = 0
        section.questionsCount = 0
        section.logs = ''
        if (!section.status || /处理中|完成|失败|停止/.test(section.status)) {
          section.status = ''
        }
      }
    }
  }

  function resetExamAutoRuntimeState() {
    state.examAutoError = false
    state.examAutoStopping = false
    state.examAutoStatus = ''
    state.examAutoLogs = ''
    state.examAutoEntries = []
    state.examAutoSummary = null
    state.examAutoLive = null
  }

  function appendChapterBatchTaskLog(task, line) {
    if (!task || !line) {
      return
    }
    task.logs = task.logs ? `${task.logs}\n${line}` : line
  }

  function resetChapterBatchTaskRuntime(task) {
    if (!task || typeof task !== 'object') {
      return
    }
    task.sessionId = ''
    task.currentChapter = ''
    task.currentSection = ''
    task.status = ''
    task.error = false
    task.running = false
    task.stopped = false
    task.completed = false
    task.phase = '待命'
    task.currentIndex = 0
    task.completedCount = 0
    task.successCount = 0
    task.failedCount = 0
    task.totalCount = Number(task.slotImageCount || 0)
    task.currentFileName = ''
    task.logs = ''
    task.lastQuestion = null
    task.lastPrefixCache = null
  }

  function resetChapterBatchRuntimeState() {
    state.chapterBatchError = false
    state.chapterBatchStopping = false
    state.chapterBatchStatus = ''
    state.chapterBatchTasks.forEach((task) => resetChapterBatchTaskRuntime(task))
  }

  function buildVisualizerImportFolderLabel(files) {
    const items = Array.isArray(files) ? files : []
    if (!items.length) {
      return ''
    }
    const firstRelativePath = String(items[0]?.webkitRelativePath || items[0]?.name || '').trim()
    const rootName = firstRelativePath.split('/')[0] || 'images'
    return `${rootName}（${items.length} 个文件）`
  }

  function setVisualizerWorkspaceFolder(relativePath) {
    const normalizedPath = String(relativePath || '').trim().replace(/^\/+/, '')
    state.visualizerImportWorkspacePath = normalizedPath
    state.visualizerImportWorkspaceLabel = normalizedPath || '工作区根目录'
    state.visualizerUploadsError = false
  }

  function onVisualizerJsonFileChange(event) {
    const file = event?.target?.files?.[0] ?? null
    state.visualizerImportJsonFile = file
    state.visualizerImportJsonName = file?.name || ''
    if (file) {
      state.visualizerImportJsonSourceMode = 'local'
    }
    state.visualizerError = false
    if (event?.target) {
      event.target.value = ''
    }
  }

  function clearVisualizerWorkspaceJsonFile() {
    state.visualizerImportWorkspaceJsonPath = ''
  }

  function requireCurrentWorkspace(message = '请先在工作区页面手动创建并选定一个工作区') {
    const workspaceId = String(state.currentWorkspaceId || '').trim()
    if (!workspaceId) {
      throw new Error(message)
    }
    return workspaceId
  }

  function requireVisualizerWorkspace(message = '请先在可视化这里选择一个工作区') {
    const workspaceId = String(state.visualizerWorkspaceId || '').trim()
    if (!workspaceId) {
      throw new Error(message)
    }
    return workspaceId
  }

  function onVisualizerBundleFolderChange(event) {
    const files = Array.from(event?.target?.files ?? [])
    state.visualizerImportFolderFiles = files
    state.visualizerImportFolderLabel = buildVisualizerImportFolderLabel(files)
    if (files.length) {
      state.visualizerImportSourceMode = 'local'
    }
    state.visualizerUploadsError = false
    if (event?.target) {
      event.target.value = ''
    }
  }

  function useCurrentVisualizerWorkspacePathForVisualizer() {
    const currentPath = String(state.visualizerWorkspaceBrowser?.currentPath || '').trim()
    setVisualizerWorkspaceFolder(currentPath)
    state.visualizerImportSourceMode = 'workspace'
  }

  function useCurrentWorkspaceBrowserPathForVisualizer() {
    useCurrentVisualizerWorkspacePathForVisualizer()
  }

  function useDefaultWorkspaceUploadsForVisualizer() {
    setVisualizerWorkspaceFolder('uploads/source_uploads')
    state.visualizerImportSourceMode = 'workspace'
  }

  function clearVisualizerWorkspaceFolder() {
    state.visualizerImportWorkspacePath = ''
    state.visualizerImportWorkspaceLabel = ''
  }

  async function importVisualizerBundle() {
    const jsonFile = state.visualizerImportJsonFile
    const folderFiles = Array.isArray(state.visualizerImportFolderFiles) ? state.visualizerImportFolderFiles : []
    const jsonSourceMode = String(state.visualizerImportJsonSourceMode || '').trim() === 'local' ? 'local' : 'workspace'
    const workspaceJsonPath = String(state.visualizerImportWorkspaceJsonPath || '').trim()
    const sourceMode = String(state.visualizerImportSourceMode || '').trim() === 'local' ? 'local' : 'workspace'
    const workspaceFolderPath = String(state.visualizerImportWorkspacePath || '').trim()
    const usingLocalFolder = sourceMode === 'local'
    const visualizerWorkspaceId = String(state.visualizerWorkspaceId || '').trim()
    const hasCurrentVisualizerWorkspace =
      Boolean(visualizerWorkspaceId)
      && Boolean(String(state.visualizerServerJsonPath || '').trim())
      && Boolean(String(state.visualizerJsonAssetId || '').trim())

    if (!visualizerWorkspaceId) {
      state.visualizerError = true
      state.visualizerStatus = '请先在可视化这里选择一个工作区'
      return
    }
    if (jsonSourceMode === 'local' && !(jsonFile instanceof File) && !hasCurrentVisualizerWorkspace) {
      state.visualizerError = true
      state.visualizerStatus = '首次导入请先选择题库 JSON；已有工作区时可直接使用工作区目录或重新选择本地图片文件夹'
      return
    }
    if (jsonSourceMode === 'workspace' && !workspaceJsonPath) {
      state.visualizerError = true
      state.visualizerStatus = '请先选择工作区里的具体 JSON 文件'
      return
    }
    if (usingLocalFolder && !folderFiles.length) {
      state.visualizerUploadsError = true
      state.visualizerUploadsStatus = '请先选择图片文件夹'
      return
    }
    if (!usingLocalFolder && !workspaceFolderPath) {
      state.visualizerUploadsError = true
      state.visualizerUploadsStatus = '请先选择工作区目录，或切换到本地文件夹模式'
      return
    }

    state.visualizerError = false
    state.visualizerUploadsError = false
    state.visualizerUploadsProcessing = true
    state.visualizerStatus = '正在导入 JSON 到工作区...'
    state.visualizerUploadsStatus = ''
    state.visualizerAnswerProcessing = false
    state.visualizerAnswerStatus = ''
    state.visualizerAnswerError = false
    state.visualizerRepairError = false
    state.visualizerRepairStatus = ''
    state.visualizerQuestionTypeProcessing = false
    state.visualizerRepairImageFiles = []
    state.visualizerRewriteResult = null

    try {
      let managedRef = {
        workspaceId: visualizerWorkspaceId,
        jsonAssetId: String(state.visualizerJsonAssetId || '').trim(),
        jsonFilePath: String(state.visualizerServerJsonPath || '').trim(),
      }
      let createdFromJson = false

      if (jsonSourceMode === 'local' && jsonFile instanceof File) {
        const text = await fileToText(jsonFile)
        const parsed = JSON.parse(text)
        const chapters = Array.isArray(parsed?.chapters) ? parsed.chapters : null
        const questions = Array.isArray(parsed?.questions) ? parsed.questions : null
        if (!chapters || !questions) {
          throw new Error('当前文件不是支持的题库 JSON，缺少 chapters 或 questions 数组')
        }

        state.visualizerStatus = '正在导入 JSON 到工作区...'
        const imported = await uploadJsonFileToWorkspace(jsonFile, {
          workspaceId: visualizerWorkspaceId,
        })
        managedRef = {
          workspaceId: String(imported.workspaceId || '').trim(),
          jsonAssetId: String(imported.jsonAssetId || '').trim(),
          jsonFilePath: String(imported.workspaceFilePath || imported.filePath || '').trim(),
        }
        state.visualizerFileName = jsonFile.name
        state.visualizerServerJsonPath = managedRef.jsonFilePath
        state.visualizerJsonAssetId = managedRef.jsonAssetId
        createdFromJson = true
      } else if (jsonSourceMode === 'workspace') {
        managedRef = {
          workspaceId: visualizerWorkspaceId,
          jsonAssetId: '',
          jsonFilePath: workspaceJsonPath,
        }
        state.visualizerFileName = String(workspaceJsonPath.split('/').pop() || 'workspace.json')
        state.visualizerServerJsonPath = workspaceJsonPath
        state.visualizerJsonAssetId = ''
        createdFromJson = true
      } else {
        state.visualizerStatus = usingLocalFolder ? '正在替换所选工作区图片文件夹...' : '正在使用工作区目录更新图片路径...'
      }

      state.visualizerStatus = createdFromJson
        ? usingLocalFolder
          ? '正在准备 JSON 并复制图片文件夹到工作区...'
          : '正在准备 JSON 并使用工作区目录匹配图片路径...'
        : usingLocalFolder
          ? '正在覆盖所选工作区图片文件夹...'
          : '正在使用工作区目录更新所选工作区图片路径...'

      const formData = new FormData()
      appendManagedJsonFormData(formData, managedRef)
      if (usingLocalFolder) {
        formData.append('clearTargetDir', 'true')
        for (const file of folderFiles) {
          formData.append('files', file, file.name)
          formData.append('relativePaths', String(file.webkitRelativePath || file.name || ''))
        }
      } else {
        formData.append('workspaceSourceRelativePath', workspaceFolderPath)
      }

      const resp = await fetch('/api/textbook-json/import-uploads', {
        method: 'POST',
        body: formData,
      })
      const data = await parseApiResponse(resp)
      if (!resp.ok) {
        throw new Error(data.message || '导入图片文件夹失败')
      }

      const payload = await refreshVisualizerPayloadFromWorkspace({
        cacheToken: Date.now(),
      })
      const sourceMeta = getPayloadSourceMeta(payload)
      const importedCount = Number(data.importedCount ?? (usingLocalFolder ? folderFiles.length : 0))
      const rewrittenCount = Number(data.rewrittenCount ?? 0)
      const matchedCount = Number(data.matchedCount ?? 0)
      const sourceModeLabel = usingLocalFolder ? '图片文件夹' : `工作区目录 ${workspaceFolderPath || '根目录'}`
      const jsonModeLabel = jsonSourceMode === 'local'
        ? state.visualizerFileName
        : workspaceJsonPath

      state.visualizerStatus =
        createdFromJson
          ? `已加载 ${jsonModeLabel}（${sourceMeta.documentType === 'exam' ? '试卷' : '教材'}）`
          : usingLocalFolder
            ? `已覆盖所选工作区图片文件夹（${sourceMeta.documentType === 'exam' ? '试卷' : '教材'}）`
            : `已使用工作区目录更新当前题库图片路径（${sourceMeta.documentType === 'exam' ? '试卷' : '教材'}）`
      state.visualizerUploadsStatus =
        usingLocalFolder
          ? (
              createdFromJson
                ? `图片文件夹已复制到工作区：${importedCount} 个文件，匹配 ${matchedCount} 个图片引用，改写 ${rewrittenCount} 个地址`
                : `图片文件夹已覆盖到所选工作区：${importedCount} 个文件，匹配 ${matchedCount} 个图片引用，改写 ${rewrittenCount} 个地址`
            )
          : `${sourceModeLabel} 已参与匹配：扫描 ${importedCount} 个文件，匹配 ${matchedCount} 个图片引用，改写 ${rewrittenCount} 个地址`
      state.visualizerImportJsonFile = null
      state.visualizerImportJsonName = ''
      if (usingLocalFolder) {
        state.visualizerImportFolderFiles = []
        state.visualizerImportFolderLabel = ''
      }
    } catch (error) {
      state.visualizerError = true
      state.visualizerPayload = null
      state.visualizerFileName = ''
      state.visualizerServerJsonPath = ''
      state.visualizerJsonAssetId = ''
      state.visualizerStatus = error instanceof Error ? error.message : '导入工作区失败'
    } finally {
      state.visualizerUploadsProcessing = false
    }
  }

  function parseQuestionIdParts(questionId) {
    const match = String(questionId || '').trim().match(/^q_(\d+)_(\d+)_(\d+)(?:_(\d+))?$/)
    if (!match) {
      return null
    }
    return {
      chapterNo: Number(match[1]),
      sectionNo: Number(match[2]),
      questionNo: Number(match[3]),
      childNo: match[4] ? Number(match[4]) : null,
    }
  }

  function upsertQuestionInVisualizerPayload(questionToUpsert) {
    if (!questionToUpsert || typeof questionToUpsert !== 'object') {
      return false
    }

    const payload = state.visualizerPayload
    const questionId = typeof questionToUpsert.questionId === 'string' ? questionToUpsert.questionId.trim() : ''
    if (!payload || !Array.isArray(payload.questions) || !questionId) {
      return false
    }

    const existingIndex = payload.questions.findIndex(
      (item) => item && typeof item === 'object' && item.questionId === questionId,
    )

    if (existingIndex >= 0) {
      payload.questions.splice(existingIndex, 1, questionToUpsert)
    } else {
      payload.questions.push(questionToUpsert)
    }

    return true
  }

  function applyVisualizerMathFormatRepairToPayload(params) {
    const {
      questionId,
      targetType,
      repairedText,
      childNo = null,
      childQuestionId = '',
    } = params
    const payload = state.visualizerPayload
    const questions = Array.isArray(payload?.questions) ? payload.questions : []
    const question = questions.find((item) => item && item.questionId === questionId)
    if (!question || typeof question !== 'object') {
      return false
    }

    if (targetType === 'stem' || targetType === 'prompt' || targetType === 'standardAnswer') {
      const block = question[targetType]
      if (block && typeof block === 'object') {
        block.text = repairedText
        return true
      }
      question[targetType] = { text: repairedText, media: [] }
      return true
    }

    const children = Array.isArray(question.children) ? question.children : []
    const child =
      children.find((item) => String(item?.questionId || '').trim() === String(childQuestionId || '').trim()) ||
      children.find((item) => Number(item?.orderNo) === Number(childNo)) ||
      children.find((item) => typeof item?.questionId === 'string' && item.questionId.endsWith(`_${childNo}`))
    if (!child || typeof child !== 'object') {
      return false
    }

    const childField = targetType === 'childPrompt' ? 'prompt' : 'standardAnswer'
    if (child[childField] && typeof child[childField] === 'object') {
      child[childField].text = repairedText
      return true
    }
    child[childField] = { text: repairedText, media: [] }
    return true
  }

  function appendCacheBusterToVisualizerPayload(payload, cacheToken) {
    if (!payload || typeof payload !== 'object') {
      return payload
    }

    const shouldDecorate = (url) => /^\/(?:uploads|workspace-assets)\//i.test(String(url || '').trim())
    const decorateUrl = (url) => {
      const raw = String(url || '').trim()
      if (!shouldDecorate(raw)) {
        return raw
      }
      const [base, query = ''] = raw.split('?')
      const params = new URLSearchParams(query)
      params.set('v', String(cacheToken))
      const nextQuery = params.toString()
      return nextQuery ? `${base}?${nextQuery}` : base
    }

    const normalizedQuestions = Array.isArray(payload.questions) ? payload.questions : []
    for (const question of normalizedQuestions) {
      if (!question || typeof question !== 'object') {
        continue
      }
      const blocks = []
      if (question.nodeType === 'GROUP') {
        blocks.push(question.stem)
        for (const child of Array.isArray(question.children) ? question.children : []) {
          blocks.push(child?.prompt, child?.standardAnswer)
        }
      } else {
        blocks.push(question.prompt, question.standardAnswer)
      }

      for (const block of blocks) {
        if (!block || typeof block !== 'object' || !Array.isArray(block.media)) {
          continue
        }
        for (const media of block.media) {
          if (!media || typeof media !== 'object') {
            continue
          }
          media.url = decorateUrl(media.url)
        }
      }
    }

    return payload
  }

  async function refreshVisualizerPayloadFromWorkspace(options = {}) {
    const text = await readWorkspaceJsonText({
      workspaceId: state.visualizerWorkspaceId,
      jsonAssetId: state.visualizerJsonAssetId,
      jsonFilePath: state.visualizerServerJsonPath,
    })
    const parsed = JSON.parse(text)
    if (options?.cacheToken) {
      appendCacheBusterToVisualizerPayload(parsed, options.cacheToken)
    }
    state.visualizerPayload = parsed
    return parsed
  }

  function applyVisualizerImageAttachToPayload(params) {
    const {
      questionId,
      mediaItems = [],
      childNo = null,
      childQuestionId = '',
      targetType = 'prompt',
    } = params || {}
    const payload = state.visualizerPayload
    const questions = Array.isArray(payload?.questions) ? payload.questions : []
    const question = questions.find((item) => item && item.questionId === questionId)
    if (!question || typeof question !== 'object') {
      return false
    }

    const normalizedMediaItems = Array.isArray(mediaItems) ? mediaItems : []
    const normalizedTargetType = normalizeImageAttachTargetType(targetType)
    const children = Array.isArray(question.children) ? question.children : []
    const child =
      children.find((item) => String(item?.questionId || '').trim() === String(childQuestionId || '').trim()) ||
      children.find((item) => Number(item?.orderNo) === Number(childNo)) ||
      children.find((item) => typeof item?.questionId === 'string' && item.questionId.endsWith(`_${childNo}`))

    if (child && typeof child === 'object') {
      const targetField = normalizedTargetType === 'standardAnswer' ? 'standardAnswer' : 'prompt'
      if (child[targetField] && typeof child[targetField] === 'object') {
        child[targetField].media = normalizedMediaItems
      } else {
        child[targetField] = {
          text: typeof child[targetField] === 'string' ? child[targetField] : String(child[targetField]?.text || ''),
          media: normalizedMediaItems,
        }
      }
      return true
    }

    const targetField =
      normalizedTargetType === 'standardAnswer'
        ? 'standardAnswer'
        : String(question.nodeType || '').toUpperCase() === 'GROUP'
          ? 'stem'
          : 'prompt'
    if (question[targetField] && typeof question[targetField] === 'object') {
      question[targetField].media = normalizedMediaItems
    } else {
      question[targetField] = {
        text: typeof question[targetField] === 'string' ? question[targetField] : String(question[targetField]?.text || ''),
        media: normalizedMediaItems,
      }
    }
    return true
  }

  function applyVisualizerQuestionTypeToPayload(params) {
    const {
      questionId,
      questionType,
      childNo = null,
      childQuestionId = '',
    } = params || {}
    const payload = state.visualizerPayload
    const questions = Array.isArray(payload?.questions) ? payload.questions : []
    const question = questions.find((item) => item && item.questionId === questionId)
    if (!question || typeof question !== 'object') {
      return false
    }

    const normalizedQuestionType = normalizeQuestionTypeValue(questionType)
    if (!normalizedQuestionType) {
      return false
    }

    const children = Array.isArray(question.children) ? question.children : []
    const child =
      children.find((item) => String(item?.questionId || '').trim() === String(childQuestionId || '').trim()) ||
      children.find((item) => Number(item?.orderNo) === Number(childNo)) ||
      children.find((item) => typeof item?.questionId === 'string' && item.questionId.endsWith(`_${childNo}`))

    if (child && typeof child === 'object') {
      child.questionType = normalizedQuestionType
      return true
    }

    question.questionType = normalizedQuestionType
    return true
  }

  function applyVisualizerGeneratedAnswerToPayload(params) {
    const {
      questionId,
      answerText,
      childNo = null,
      childQuestionId = '',
    } = params || {}
    const payload = state.visualizerPayload
    const questions = Array.isArray(payload?.questions) ? payload.questions : []
    const question = questions.find((item) => item && item.questionId === questionId)
    if (!question || typeof question !== 'object') {
      return false
    }

    const normalizedAnswerText = String(answerText || '')
    const children = Array.isArray(question.children) ? question.children : []
    const child =
      children.find((item) => String(item?.questionId || '').trim() === String(childQuestionId || '').trim()) ||
      children.find((item) => Number(item?.orderNo) === Number(childNo)) ||
      children.find((item) => typeof item?.questionId === 'string' && item.questionId.endsWith(`_${childNo}`))

    if (child && typeof child === 'object') {
      if (child.standardAnswer && typeof child.standardAnswer === 'object') {
        child.standardAnswer.text = normalizedAnswerText
        child.standardAnswer.media = []
      } else {
        child.standardAnswer = { text: normalizedAnswerText, media: [] }
      }
      return true
    }

    if (question.standardAnswer && typeof question.standardAnswer === 'object') {
      question.standardAnswer.text = normalizedAnswerText
      question.standardAnswer.media = []
    } else {
      question.standardAnswer = { text: normalizedAnswerText, media: [] }
    }
    return true
  }

  async function repairMathFormatFromVisualizer(params) {
    const {
      questionId,
      targetType,
      childNo = null,
      childQuestionId = '',
      blockLabel = '',
    } = params || {}

    if (!state.visualizerServerJsonPath) {
      state.visualizerRepairError = true
      state.visualizerRepairStatus = '请先导入 JSON 和图片文件夹到工作区'
      return
    }

    const effectiveChildNo =
      targetType === 'childPrompt' || targetType === 'childStandardAnswer'
        ? Number(childNo || 0)
        : null

    state.visualizerRepairProcessing = true
    state.visualizerRepairError = false
    state.visualizerRepairStatus = `正在修复 ${blockLabel || targetType}...`

    try {
      const resp = await fetch('/api/textbook-json/repair-math-format', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...buildVisualizerArkHeaders(),
        },
        body: JSON.stringify(buildManagedJsonBody({
          workspaceId: state.visualizerWorkspaceId,
          jsonAssetId: state.visualizerJsonAssetId,
          jsonFilePath: state.visualizerServerJsonPath,
        }, {
          sourceFileName: state.visualizerFileName || '',
          questionId,
          targetType,
          childNo: effectiveChildNo,
          childQuestionId: childQuestionId || '',
        })),
      })
      const data = await parseApiResponse(resp)
      if (!resp.ok) {
        throw new Error(data.message || '公式修复失败')
      }

      applyVisualizerMathFormatRepairToPayload({
        questionId,
        targetType,
        repairedText: String(data.repairedText || ''),
        childNo: effectiveChildNo,
        childQuestionId: childQuestionId || '',
      })
      state.visualizerRepairStatus = `已修复 ${blockLabel || data.targetLabel || targetType}，并写入所选工作区`
    } catch (error) {
      state.visualizerRepairError = true
      state.visualizerRepairStatus = error instanceof Error ? error.message : '公式修复失败'
    } finally {
      state.visualizerRepairProcessing = false
    }
  }

  function onVisualizerRepairImageChange(event) {
    const appendedFiles = Array.from(event?.target?.files ?? [])
    if (appendedFiles.length) {
      state.visualizerRepairImageFiles = [
        ...state.visualizerRepairImageFiles,
        ...appendedFiles,
      ]
    }
    state.visualizerRepairError = false
    state.visualizerRewriteResult = null
    if (event?.target) {
      event.target.value = ''
    }
  }

  function clearVisualizerRepairImages() {
    state.visualizerRepairImageFiles = []
  }

  function removeVisualizerRepairImage(index) {
    if (!Number.isInteger(index) || index < 0 || index >= state.visualizerRepairImageFiles.length) {
      return
    }
    state.visualizerRepairImageFiles = state.visualizerRepairImageFiles.filter((_, currentIndex) => currentIndex !== index)
  }

  async function attachImagesFromVisualizer(params) {
    const questionId = String(params?.questionId || '').trim()
    const questionTitle = String(params?.questionTitle || '').trim()
    const childQuestionId = String(params?.childQuestionId || '').trim()
    const childNoRaw = params?.childNo
    const childNo =
      childNoRaw === '' || childNoRaw === null || childNoRaw === undefined ? null : Number(childNoRaw)
    const blockLabel = String(params?.blockLabel || '').trim()
    const targetType = normalizeImageAttachTargetType(params?.targetType || state.visualizerImageAttachTarget)

    if (!state.visualizerServerJsonPath) {
      state.visualizerRepairError = true
      state.visualizerRepairStatus = '请先导入 JSON 和图片文件夹到工作区'
      return
    }
    if (!state.visualizerRepairImageFiles.length) {
      state.visualizerRepairError = true
      state.visualizerRepairStatus = '请先上传用于补图的图片'
      return
    }

    state.visualizerRepairProcessing = true
    state.visualizerRepairError = false
    state.visualizerRepairStatus = `正在为 ${blockLabel || questionTitle || questionId} 补充图片...`
    state.visualizerRewriteResult = null

    try {
      const formData = new FormData()
      appendManagedJsonFormData(formData, {
        workspaceId: state.visualizerWorkspaceId,
        jsonAssetId: state.visualizerJsonAssetId,
        jsonFilePath: state.visualizerServerJsonPath,
      })
      formData.append('sourceFileName', state.visualizerFileName || '')
      formData.append('questionId', questionId)
      formData.append('targetType', targetType)
      if (childQuestionId) {
        formData.append('childQuestionId', childQuestionId)
      }
      if (Number.isInteger(childNo) && childNo > 0) {
        formData.append('childNo', String(childNo))
      }
      for (const file of state.visualizerRepairImageFiles) {
        formData.append('images', file, file.name)
      }

      const resp = await fetch('/api/textbook-json/attach-images', {
        method: 'POST',
        body: formData,
      })
      const data = await parseApiResponse(resp)
      if (!resp.ok) {
        throw new Error(data.message || '当前题目补图失败')
      }

      applyVisualizerImageAttachToPayload({
        questionId,
        mediaItems: Array.isArray(data.mediaItems) ? data.mediaItems : [],
        childNo,
        childQuestionId: String(data.childQuestionId || childQuestionId),
        targetType: String(data.targetType || targetType),
      })
      state.visualizerRepairImageFiles = []

      state.visualizerRepairStatus =
        `已为 ${blockLabel || questionTitle || questionId} 补充 ${Number(data.mediaCount ?? 0)} 张图片，并写入所选工作区`
    } catch (error) {
      state.visualizerRepairError = true
      state.visualizerRepairStatus = error instanceof Error ? error.message : '当前题目补图失败'
    } finally {
      state.visualizerRepairProcessing = false
    }
  }

  async function updateQuestionTypeFromVisualizer(params) {
    const questionId = String(params?.questionId || '').trim()
    const questionType = String(params?.questionType || '').trim()
    const questionTitle = String(params?.questionTitle || '').trim()
    const childQuestionId = String(params?.childQuestionId || '').trim()
    const childNoRaw = params?.childNo
    const childNo =
      childNoRaw === '' || childNoRaw === null || childNoRaw === undefined ? null : Number(childNoRaw)
    const blockLabel = String(params?.blockLabel || '').trim()

    if (!state.visualizerServerJsonPath) {
      state.visualizerRepairError = true
      state.visualizerRepairStatus = '请先导入 JSON 和图片文件夹到工作区'
      return
    }
    if (!questionId || !questionType) {
      state.visualizerRepairError = true
      state.visualizerRepairStatus = '缺少 questionId 或 questionType，无法保存题型'
      return
    }

    state.visualizerQuestionTypeProcessing = true
    state.visualizerRepairError = false
    state.visualizerRepairStatus = `正在保存 ${blockLabel || questionTitle || questionId} 的题型...`
    state.visualizerRewriteResult = null

    try {
      const resp = await fetch('/api/textbook-json/update-question-type', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildManagedJsonBody({
          workspaceId: state.visualizerWorkspaceId,
          jsonAssetId: state.visualizerJsonAssetId,
          jsonFilePath: state.visualizerServerJsonPath,
        }, {
          sourceFileName: state.visualizerFileName || '',
          questionId,
          questionType,
          childQuestionId,
          childNo,
        })),
      })
      const data = await parseApiResponse(resp)
      if (!resp.ok) {
        throw new Error(data.message || '题型修改失败')
      }

      applyVisualizerQuestionTypeToPayload({
        questionId,
        questionType: String(data.questionType || questionType),
        childNo,
        childQuestionId: String(data.childQuestionId || childQuestionId),
      })

      state.visualizerRepairStatus =
        `已更新 ${blockLabel || questionTitle || questionId} 的题型为 ${String(data.questionTypeLabel || data.questionType || questionType)}，并写入所选工作区`
    } catch (error) {
      state.visualizerRepairError = true
      state.visualizerRepairStatus = error instanceof Error ? error.message : '题型修改失败'
    } finally {
      state.visualizerQuestionTypeProcessing = false
    }
  }

  async function generateAnswerFromVisualizer(params) {
    const questionId = String(params?.questionId || '').trim()
    const questionTitle = String(params?.questionTitle || '').trim()
    const childQuestionId = String(params?.childQuestionId || '').trim()
    const childNoRaw = params?.childNo
    const childNo =
      childNoRaw === '' || childNoRaw === null || childNoRaw === undefined ? null : Number(childNoRaw)
    const blockLabel = String(params?.blockLabel || '').trim()
    const imageFiles = Array.isArray(params?.imageFiles) ? params.imageFiles : []

    if (!state.visualizerServerJsonPath) {
      state.visualizerAnswerError = true
      state.visualizerAnswerStatus = '请先导入 JSON 和图片文件夹到工作区'
      return
    }
    if (!questionId) {
      state.visualizerAnswerError = true
      state.visualizerAnswerStatus = '缺少 questionId，无法生成答案'
      return
    }

    state.visualizerAnswerProcessing = true
    state.visualizerAnswerError = false
    state.visualizerAnswerStatus = `正在为 ${blockLabel || questionTitle || questionId} 生成答案...`
    state.visualizerRewriteResult = null

    try {
      const formData = new FormData()
      appendManagedJsonFormData(formData, {
        workspaceId: state.visualizerWorkspaceId,
        jsonAssetId: state.visualizerJsonAssetId,
        jsonFilePath: state.visualizerServerJsonPath,
      })
      formData.append('sourceFileName', state.visualizerFileName || '')
      formData.append('questionId', questionId)
      if (childQuestionId) {
        formData.append('childQuestionId', childQuestionId)
      }
      if (Number.isInteger(childNo) && childNo > 0) {
        formData.append('childNo', String(childNo))
      }
      formData.append('answerPrompt', String(state.visualizerAnswerPrompt || '').trim())
      for (const file of imageFiles) {
        formData.append('images', file, file.name)
      }

      const resp = await fetch('/api/textbook-json/generate-answer', {
        method: 'POST',
        headers: {
          ...buildVisualizerArkHeaders(),
        },
        body: formData,
      })
      const data = await parseApiResponse(resp)
      if (!resp.ok) {
        throw new Error(data.message || '答案生成失败')
      }

      applyVisualizerGeneratedAnswerToPayload({
        questionId,
        answerText: String(data.answerText || ''),
        childNo,
        childQuestionId: String(data.childQuestionId || childQuestionId),
      })

      state.visualizerAnswerStatus = `已为 ${blockLabel || questionTitle || questionId} 生成答案，并写入所选工作区`
    } catch (error) {
      state.visualizerAnswerError = true
      state.visualizerAnswerStatus = error instanceof Error ? error.message : '答案生成失败'
    } finally {
      state.visualizerAnswerProcessing = false
    }
  }

  async function repairQuestionFromVisualizer(params) {
    const questionId = String(params?.questionId || '').trim()
    const questionTitle = String(params?.questionTitle || '').trim()
    const childQuestionId = String(params?.childQuestionId || '').trim()
    const childNoRaw = params?.childNo
    const childNo =
      childNoRaw === '' || childNoRaw === null || childNoRaw === undefined ? null : Number(childNoRaw)
    const blockLabel = String(params?.blockLabel || '').trim()
    const hasAnswerSource = typeof params?.hasAnswerSource === 'boolean' ? params.hasAnswerSource : null
    const generateAnswerIfMissing =
      typeof params?.generateAnswerIfMissing === 'boolean' ? params.generateAnswerIfMissing : null

    if (!state.visualizerServerJsonPath) {
      state.visualizerRepairError = true
      state.visualizerRepairStatus = '请先导入 JSON 和图片文件夹到工作区'
      return
    }
    if (!state.visualizerRepairImageFiles.length) {
      state.visualizerRepairError = true
      state.visualizerRepairStatus = '请先上传用于重写当前题目的图片'
      return
    }

    state.visualizerRepairProcessing = true
    state.visualizerRepairError = false
    state.visualizerRepairStatus = `正在根据图片重写 ${blockLabel || questionTitle || questionId}...`
    state.visualizerRepairRawText = ''
    state.visualizerRewriteResult = null

    try {
      const formData = new FormData()
      appendManagedJsonFormData(formData, {
        workspaceId: state.visualizerWorkspaceId,
        jsonAssetId: state.visualizerJsonAssetId,
        jsonFilePath: state.visualizerServerJsonPath,
      })
      formData.append('sourceFileName', state.visualizerFileName || '')
      formData.append('questionId', questionId)
      if (childQuestionId) {
        formData.append('childQuestionId', childQuestionId)
      }
      if (Number.isInteger(childNo) && childNo > 0) {
        formData.append('childNo', String(childNo))
      }
      if (typeof hasAnswerSource === 'boolean') {
        formData.append('hasAnswerSource', String(hasAnswerSource))
      }
      if (typeof generateAnswerIfMissing === 'boolean') {
        formData.append('generateAnswerIfMissing', String(generateAnswerIfMissing))
      }
      for (const file of state.visualizerRepairImageFiles) {
        formData.append('images', file, file.name)
      }

      const resp = await fetch('/api/textbook-json/repair-question', {
        method: 'POST',
        headers: {
          ...buildVisualizerArkHeaders(),
        },
        body: formData,
      })
      const data = await parseApiResponse(resp)
      if (!resp.ok) {
        state.visualizerRepairRawText = String(data.rawText || '')
        state.visualizerRewriteResult = {
          chapterTitle: '',
          sectionTitle: '',
          questionId,
          childQuestionId,
          childNo: Number(childNo ?? 0),
          questionTitle: String(questionTitle || questionId),
          action: 'failed',
          insertIndex: -1,
          questionsCount: 0,
          imageCount: Number(state.visualizerRepairImageFiles.length),
          reason: '',
          targetLabel: String(blockLabel || ''),
          rawText: String(data.rawText || ''),
        }
        throw new Error(data.message || '当前题目重写失败')
      }

      state.visualizerRepairRawText = String(data.rawText || '')
      upsertQuestionInVisualizerPayload(data.question)
      state.visualizerRewriteResult = {
        chapterTitle: String(data.chapterTitle || ''),
        sectionTitle: String(data.sectionTitle || ''),
        questionId: String(data.questionId || questionId),
        childQuestionId: String(data.childQuestionId || childQuestionId),
        childNo: Number(data.childNo ?? childNo ?? 0),
        questionTitle: String(data.questionTitle || questionTitle || questionId),
        action: String(data.action || ''),
        insertIndex: Number(data.insertIndex ?? -1),
        questionsCount: Number(data.questionsCount ?? 0),
        imageCount: Number(data.imageCount ?? state.visualizerRepairImageFiles.length),
        reason: String(data.reason || ''),
        targetLabel: String(data.targetLabel || blockLabel || ''),
        rawText: String(data.rawText || ''),
      }
      state.visualizerRepairImageFiles = []

      state.visualizerRepairStatus =
        `已按图片重写 ${state.visualizerRewriteResult.targetLabel || state.visualizerRewriteResult.questionTitle}，并写入所选工作区`
    } catch (error) {
      state.visualizerRepairError = true
      state.visualizerRepairStatus = error instanceof Error ? error.message : '当前题目重写失败'
    } finally {
      state.visualizerRepairProcessing = false
    }
  }

  function appendChapterAutoLog(line) {
    state.chapterAutoLogs = state.chapterAutoLogs ? `${state.chapterAutoLogs}\n${line}` : line
  }

  function buildPrefixCacheUsage(rawUsage) {
    const usage = rawUsage && typeof rawUsage === 'object' ? rawUsage : {}
    return {
      promptTokens: Number(usage.promptTokens ?? 0),
      completionTokens: Number(usage.completionTokens ?? 0),
      totalTokens: Number(usage.totalTokens ?? 0),
      cachedTokens: Number(usage.cachedTokens ?? 0),
    }
  }

  function buildPrefixCacheRun(rawRun) {
    if (!rawRun || typeof rawRun !== 'object') {
      return null
    }

    const usage = buildPrefixCacheUsage(rawRun.usage)
    const seedResponseId = typeof rawRun.seedResponseId === 'string' ? rawRun.seedResponseId.trim() : ''
    const requestResponseId = typeof rawRun.requestResponseId === 'string' ? rawRun.requestResponseId.trim() : ''
    const seedSource = typeof rawRun.seedSource === 'string' ? rawRun.seedSource.trim() : ''

    return {
      enabled: Boolean(seedResponseId),
      hit: usage.cachedTokens > 0,
      seedResponseId,
      requestResponseId,
      seedSource,
      usage,
    }
  }

  function buildPrefixCacheSummary(prefixCacheExperiment) {
    if (!prefixCacheExperiment || typeof prefixCacheExperiment !== 'object') {
      return null
    }

    const boundary = buildPrefixCacheRun(prefixCacheExperiment.boundary)
    const extractRuns = (Array.isArray(prefixCacheExperiment.extracts) ? prefixCacheExperiment.extracts : [])
      .map((run) => buildPrefixCacheRun(run))
      .filter(Boolean)

    if (!boundary && !extractRuns.length) {
      return null
    }

    const extractCachedTokens = extractRuns.reduce((sum, run) => sum + run.usage.cachedTokens, 0)
    const extractTotalTokens = extractRuns.reduce((sum, run) => sum + run.usage.totalTokens, 0)
    const extractEnabledCount = extractRuns.filter((run) => run.enabled).length
    const extractHitCount = extractRuns.filter((run) => run.hit).length
    const latestExtractRun = extractRuns[extractRuns.length - 1] || null

    return {
      available: true,
      enabled: Boolean(boundary?.enabled || extractEnabledCount > 0),
      totalCachedTokens: (boundary?.usage.cachedTokens ?? 0) + extractCachedTokens,
      totalTokens: (boundary?.usage.totalTokens ?? 0) + extractTotalTokens,
      boundary,
      extracts: {
        runs: extractRuns.length,
        enabledCount: extractEnabledCount,
        hitCount: extractHitCount,
        cachedTokens: extractCachedTokens,
        totalTokens: extractTotalTokens,
        latestSeedSource: latestExtractRun?.seedSource || '',
      },
    }
  }

  function buildQuestionSummary(question, totalQuestions = null) {
    const safeQuestion = question || {}
    const pending = safeQuestion.pending === true
    return {
      pending,
      upsertedCount: Number(safeQuestion.upsertedCount ?? 0),
      pendingPagesCount: Number(safeQuestion.pendingPagesCount ?? 0),
      pendingPageLabels: Array.isArray(safeQuestion.pendingPageLabels) ? safeQuestion.pendingPageLabels : [],
      processingStartQuestionKey: safeQuestion.processingStartQuestionKey || '',
      processingStartQuestionLabel: safeQuestion.processingStartQuestionLabel || '',
      continueQuestionKey: safeQuestion.continueQuestionKey || '',
      continueQuestionLabel: safeQuestion.continueQuestionLabel || '',
      nextStartQuestionKey: safeQuestion.nextStartQuestionKey || '',
      nextStartQuestionLabel: safeQuestion.nextStartQuestionLabel || '',
      boundaryNeedNextPage: safeQuestion.boundaryNeedNextPage === true,
      boundaryHasExtractableQuestions: safeQuestion.boundaryHasExtractableQuestions === true,
      boundaryContinueQuestionKey: safeQuestion.boundaryContinueQuestionKey || '',
      boundaryContinueQuestionLabel: safeQuestion.boundaryContinueQuestionLabel || '',
      lookaheadContinueQuestionKey: safeQuestion.lookaheadContinueQuestionKey || '',
      lookaheadContinueQuestionLabel: safeQuestion.lookaheadContinueQuestionLabel || '',
      effectiveContinueQuestionKey: safeQuestion.effectiveContinueQuestionKey || '',
      effectiveContinueQuestionLabel: safeQuestion.effectiveContinueQuestionLabel || '',
      upsertedQuestionTitles: Array.isArray(safeQuestion.upsertedQuestionTitles) ? safeQuestion.upsertedQuestionTitles : [],
      boundaryLookaheadLabel: safeQuestion.boundaryLookaheadLabel || '',
      boundaryLookaheadReason: safeQuestion.boundaryLookaheadReason || '',
      boundaryLookaheadRawText: safeQuestion.boundaryLookaheadRawText || '',
      lookaheadConsistencyReason: safeQuestion.lookaheadConsistencyReason || '',
      boundaryRetryReason: safeQuestion.boundaryRetryReason || '',
      pendingReviewCount: Number(safeQuestion.pendingReviewCount ?? 0),
      droppedPendingQuestionCount: Number(safeQuestion.droppedPendingQuestionCount ?? 0),
      extractReturnedCount: Number(safeQuestion.extractReturnedCount ?? 0),
      normalizedCount: Number(safeQuestion.normalizedCount ?? 0),
      questionsCount: totalQuestions ?? safeQuestion.questionsCount ?? null,
      sessionStoredProcessingStartQuestionKey: safeQuestion.sessionStoredProcessingStartQuestionKey || '',
      sessionStoredProcessingStartQuestionLabel: safeQuestion.sessionStoredProcessingStartQuestionLabel || '',
      sessionStoredPendingContinueQuestionKey: safeQuestion.sessionStoredPendingContinueQuestionKey || '',
      sessionStoredPendingContinueQuestionLabel: safeQuestion.sessionStoredPendingContinueQuestionLabel || '',
      effectiveProcessingStartQuestionKey: safeQuestion.effectiveProcessingStartQuestionKey || '',
      effectiveProcessingStartQuestionLabel: safeQuestion.effectiveProcessingStartQuestionLabel || '',
      effectiveExtractEndBeforeQuestionKey: safeQuestion.effectiveExtractEndBeforeQuestionKey || '',
      effectiveExtractEndBeforeQuestionLabel: safeQuestion.effectiveExtractEndBeforeQuestionLabel || '',
      effectiveExtractMode: safeQuestion.effectiveExtractMode || '',
      reason: safeQuestion.reason || '',
      boundaryReason: safeQuestion.boundaryReason || '',
      extractReason: safeQuestion.extractReason || '',
      retryExtractReason: safeQuestion.retryExtractReason || '',
      integrityRetryReason: safeQuestion.integrityRetryReason || '',
      rangeRetryReason: safeQuestion.rangeRetryReason || '',
      flags: [
        safeQuestion.retried === true ? '触发重提' : '',
        safeQuestion.pendingReviewFixRetried === true ? '待校对修复' : '',
        safeQuestion.integrityFixRetried === true ? '完整性修复' : '',
        safeQuestion.rangeFixRetried === true ? '范围修复' : '',
        safeQuestion.rangeMismatchBlocked === true ? '范围拦截' : '',
      ].filter(Boolean),
    }
  }

  function createAutoEntry(event) {
    if (!event || typeof event !== 'object') {
      return null
    }
    if (event.type === 'result') {
      if (event.status === 'failed') {
        return {
          kind: 'failed',
          title: `第 ${event.currentIndex} 页失败`,
          subtitle: event.fileName || '',
          detail: event.error || '处理失败',
          progressLabel: `${event.currentIndex}/${event.totalCount}`,
        }
      }
      const question = buildQuestionSummary(event.question)
      return {
        kind: question.pending ? 'pending' : 'success',
        title: `第 ${event.currentIndex} 页${question.pending ? '待续页' : '已入库'}`,
        subtitle: event.fileName || '',
        detail: event.currentSectionTitle ? `当前小节：${event.currentSectionTitle}` : '',
        progressLabel: `${event.currentIndex}/${event.totalCount}`,
        question,
        prefixCache: buildPrefixCacheSummary(event.prefixCacheExperiment),
      }
    }
    if (event.type === 'error') {
      return {
        kind: 'failed',
        title: '自动处理失败',
        subtitle: '',
        detail: event.message || '发生未知错误',
      }
    }
    return null
  }

  function formatAutoProgressLine(event) {
    if (!event || typeof event !== 'object') return ''
    if (event.type === 'start') {
      return `开始自动处理，共 ${event.totalCount} 页。起始小节: ${event.currentSectionTitle || ''}`
    }
    if (event.type === 'progress') {
      return `处理中 ${event.currentIndex}/${event.totalCount}: ${event.fileName}`
    }
    if (event.type === 'result') {
      if (event.status === 'failed') {
        return `第 ${event.currentIndex}/${event.totalCount} 页失败: ${event.fileName} | ${event.error}`
      }
      const question = event.question || {}
      const queueText = Array.isArray(question.pendingPageLabels) && question.pendingPageLabels.length
        ? `，队列页: ${question.pendingPageLabels.join(' + ')}`
        : ''
      const boundaryPart = [
        `边界助手输出: 可提取=${question.boundaryHasExtractableQuestions === true ? 'true' : 'false'}`,
        `needNextPage=${question.boundaryNeedNextPage === true ? 'true' : 'false'}`,
        `续题=${question.boundaryContinueQuestionLabel || question.boundaryContinueQuestionKey || '空'}`,
        question.boundaryRetryReason ? `重判原因=${question.boundaryRetryReason}` : '',
        question.boundaryReason ? `原因=${question.boundaryReason}` : '',
      ].filter(Boolean).join('，')
      const lookaheadPart = question.boundaryLookaheadLabel || question.boundaryLookaheadReason || question.lookaheadContinueQuestionKey
        ? [
            `预读助手输出: 预读页=${question.boundaryLookaheadLabel || '空'}`,
            `续题=${question.lookaheadContinueQuestionLabel || question.lookaheadContinueQuestionKey || '空'}`,
            question.boundaryLookaheadReason ? `原因=${question.boundaryLookaheadReason}` : '',
            question.lookaheadConsistencyReason ? `对齐处理=${question.lookaheadConsistencyReason}` : '',
          ].filter(Boolean).join('，')
        : ''
      const extractPart = [
        `提取助手输出: 返回题数=${question.extractReturnedCount ?? 0}`,
        `归一化后题数=${question.normalizedCount ?? 0}`,
        question.extractReason ? `原因=${question.extractReason}` : '',
        question.retryExtractReason ? `重试原因=${question.retryExtractReason}` : '',
        question.integrityRetryReason ? `完整性重提=${question.integrityRetryReason}` : '',
        question.rangeRetryReason ? `范围重提=${question.rangeRetryReason}` : '',
      ].filter(Boolean).join('，')
      const finalPart = [
        `最终生效: session起点原值=${question.sessionStoredProcessingStartQuestionLabel || question.sessionStoredProcessingStartQuestionKey || '空'}`,
        `session续题原值=${question.sessionStoredPendingContinueQuestionLabel || question.sessionStoredPendingContinueQuestionKey || '空'}`,
        `本次实收起点=${question.effectiveProcessingStartQuestionLabel || question.effectiveProcessingStartQuestionKey || '空'}`,
        `本次实收截止=${question.effectiveExtractEndBeforeQuestionLabel || question.effectiveExtractEndBeforeQuestionKey || '空'}`,
        `最终续题=${question.effectiveContinueQuestionLabel || question.effectiveContinueQuestionKey || question.continueQuestionLabel || question.continueQuestionKey || '空'}`,
        `实收模式=${question.effectiveExtractMode || '空'}`,
        `待校对重提=${question.pendingReviewFixRetried === true ? 'true' : 'false'}`,
        `完整性重提=${question.integrityFixRetried === true ? 'true' : 'false'}`,
        `范围重提=${question.rangeFixRetried === true ? 'true' : 'false'}`,
        `范围拦截=${question.rangeMismatchBlocked === true ? 'true' : 'false'}`,
        `普通重提=${question.retried === true ? 'true' : 'false'}`,
        `截掉题数=${question.droppedPendingQuestionCount ?? 0}`,
        Array.isArray(question.upsertedQuestionTitles) && question.upsertedQuestionTitles.length
          ? `写回题目=${question.upsertedQuestionTitles.join('、')}`
          : '',
        question.reason ? `最终原因=${question.reason}` : '',
      ].filter(Boolean).join('，')
      const debugParts = [boundaryPart, lookaheadPart, extractPart, finalPart].filter(Boolean).join(' | ')
      const pendingText = question.pending
        ? `跨页处理中，处理起点: ${question.processingStartQuestionLabel || question.processingStartQuestionKey || '空'}，更新后起点: ${question.nextStartQuestionLabel || question.nextStartQuestionKey || '空'}，续题: ${question.continueQuestionLabel || question.continueQuestionKey || '空'}，队列页数: ${question.pendingPagesCount ?? '?'}${queueText}`
        : `已入库，新增题目 ${question.upsertedCount ?? 0}，更新后起点: ${question.nextStartQuestionLabel || question.nextStartQuestionKey || '空'}`
      return `第 ${event.currentIndex}/${event.totalCount} 页完成: ${event.fileName} | 当前小节: ${event.currentSectionTitle || ''} | ${pendingText}${debugParts ? ` | ${debugParts}` : ''}`
    }
    if (event.type === 'done') {
      return `自动处理完成，成功 ${event.successCount} 页，失败 ${event.failedCount} 页`
    }
    if (event.type === 'error') {
      return event.message || '自动处理失败'
    }
    return ''
  }

  function buildExamStructureLabel(result) {
    return [String(result?.currentMajorTitle || '').trim(), String(result?.currentMinorTitle || '').trim()]
      .filter(Boolean)
      .join(' / ')
  }

  function appendExamAutoLog(line) {
    state.examAutoLogs = state.examAutoLogs ? `${state.examAutoLogs}\n${line}` : line
  }

  function isFatalAutoRunErrorMessage(message) {
    const normalized = String(message || '').toLowerCase()
  return [
      'session not found',
      'please init first',
      'ark_api_key is missing',
      'account id is empty',
      '"param":"model"',
      '"param":"mode"',
      '"param":"endpoint"',
      'endpoint notfound',
      'endpoint not found',
      'failed to fetch',
      'networkerror',
      'fetch failed',
      'econnrefused',
    ].some((keyword) => normalized.includes(keyword))
  }

  async function uploadJsonFileToWorkspace(file, options = {}) {
    const workspaceId = String(options?.workspaceId || state.currentWorkspaceId || '').trim()
    if (!workspaceId) {
      throw new Error('请先在工作区页面手动创建并选定一个工作区')
    }
    const formData = new FormData()
    formData.append('json', file, file.name)
    formData.append('workspaceId', workspaceId)
    const resp = await fetch('/api/textbook-json/import', {
      method: 'POST',
      body: formData,
    })
    const data = await parseApiResponse(resp)
    if (!resp.ok) {
      throw new Error(data.message || '导入 JSON 失败')
    }
    return data
  }

  async function readWorkspaceJsonText(ref) {
    const resp = await fetch('/api/textbook-json/read', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildManagedJsonBody(ref, {
        filePath: String(ref?.jsonFilePath || ref?.filePath || '').trim(),
      })),
    })
    const data = await parseApiResponse(resp)
    if (!resp.ok) {
      throw new Error(data.message || '读取工作副本失败')
    }
    return String(data.text || '')
  }

  function parseDownloadFileName(resp, fallbackName = 'download.bin') {
    const disposition = String(resp.headers.get('content-disposition') || '').trim()
    const encodedMatch = disposition.match(/filename="?([^"]+)"?/i)
    if (!encodedMatch?.[1]) {
      return normalizeDownloadName(fallbackName)
    }
    try {
      return normalizeDownloadName(decodeURIComponent(encodedMatch[1]), fallbackName)
    } catch (_error) {
      return normalizeDownloadName(encodedMatch[1], fallbackName)
    }
  }

  async function downloadManagedJsonFile(ref, suggestedName = 'main.json') {
    const resp = await fetch('/api/textbook-json/download', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildManagedJsonBody(ref, {
        filePath: String(ref?.jsonFilePath || ref?.filePath || '').trim(),
      })),
    })
    const text = await resp.text()
    if (!resp.ok) {
      try {
        const data = JSON.parse(text)
        const message = String(data?.message || '').trim()
        throw new Error(message || '下载当前 JSON 失败')
      } catch (error) {
        if (error instanceof Error && error.message) {
          throw error
        }
        throw new Error(text || '下载当前 JSON 失败')
      }
    }
    triggerJsonDownload(normalizeJsonDownloadName(parseDownloadFileName(resp, suggestedName), suggestedName), text)
  }

  async function refreshCurrentWorkspaceSummary(options = {}) {
    const workspaceId = String(options?.workspaceId || state.currentWorkspaceId || '').trim()
    if (!workspaceId) {
      clearCurrentWorkspaceSummary()
      return null
    }

    state.workspaceSummaryLoading = true
    state.workspaceSummaryError = false
    if (!options?.silent) {
      state.workspaceSummaryStatus = '正在读取当前工作区空间占用...'
    }

    try {
      const resp = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/summary`)
      const data = await parseApiResponse(resp)
      if (!resp.ok) {
        throw new Error(data.message || '读取工作区空间统计失败')
      }
      state.workspaceSummary = data.summary || null
      state.workspaceSummaryStatus = options?.silent ? state.workspaceSummaryStatus : '已刷新当前工作区空间统计'
      return state.workspaceSummary
    } catch (error) {
      state.workspaceSummaryError = true
      state.workspaceSummaryStatus = error instanceof Error ? error.message : '读取工作区空间统计失败'
      return null
    } finally {
      state.workspaceSummaryLoading = false
    }
  }

  async function cleanupCurrentWorkspaceDerivedFiles() {
    const workspaceId = String(state.currentWorkspaceId || '').trim()
    if (!workspaceId) {
      state.workspaceSummaryError = true
      state.workspaceSummaryStatus = '当前还没有可清理的工作区'
      return
    }

    state.workspaceCleanupRunning = true
    state.workspaceSummaryError = false
    state.workspaceSummaryStatus = '正在清理当前工作区的中间产物...'

    try {
      const resp = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/cleanup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      })
      const data = await parseApiResponse(resp)
      if (!resp.ok) {
        throw new Error(data.message || '清理当前工作区失败')
      }
      state.workspaceSummary = data.after || state.workspaceSummary
      state.workspaceSummaryStatus = `清理完成，释放 ${Number(data.freedBytes || 0)} 字节`
      await refreshCurrentWorkspaceSummary({ silent: true })
    } catch (error) {
      state.workspaceSummaryError = true
      state.workspaceSummaryStatus = error instanceof Error ? error.message : '清理当前工作区失败'
    } finally {
      state.workspaceCleanupRunning = false
    }
  }

  async function deleteCurrentWorkspace() {
    const workspaceId = String(state.currentWorkspaceId || '').trim()
    if (!workspaceId) {
      state.workspaceSummaryError = true
      state.workspaceSummaryStatus = '当前还没有可删除的工作区'
      return
    }
    await deleteWorkspaceById(workspaceId)
  }

  async function syncJsonHandleFromWorkspace(ref, fileHandle) {
    return false
  }

  async function importJsonFileToWorkspace(file, payload = null, options = {}) {
    const data = await uploadJsonFileToWorkspace(file, {
      workspaceId: options?.workspaceId || state.currentWorkspaceId,
    })
    state.currentWorkspaceId = String(data.workspaceId || state.currentWorkspaceId || '')
    state.chapterSessionServerJsonPath = String(data.workspaceFilePath || data.filePath || '')
    state.chapterSessionJsonAssetId = String(data.jsonAssetId || '')
    state.chapterSessionJsonLabel = file.name
    if (payload) {
      applyWorkingJsonMeta(payload)
    }
    return data
  }

  async function syncWorkingJsonToLocalFile() {
    await syncJsonHandleFromWorkspace({
      workspaceId: state.currentWorkspaceId,
      jsonAssetId: state.chapterSessionJsonAssetId,
      jsonFilePath: state.chapterSessionServerJsonPath,
    }, state.chapterSessionJsonHandle)
    return
    if (!state.chapterSessionServerJsonPath || !state.chapterSessionJsonHandle) {
      return
    }
    const resp = await fetch('/api/textbook-json/read', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filePath: state.chapterSessionServerJsonPath,
      }),
    })
    const data = await parseApiResponse(resp)
    if (!resp.ok) {
      throw new Error(data.message || '读取工作副本失败')
    }
    const writable = await state.chapterSessionJsonHandle.createWritable()
    await writable.write(String(data.text || ''))
    await writable.close()
  }

  async function syncExamWorkingJsonToLocalFile() {
    await syncJsonHandleFromWorkspace({
      workspaceId: state.currentWorkspaceId,
      jsonAssetId: state.examSessionJsonAssetId,
      jsonFilePath: state.examSessionServerJsonPath,
    }, state.examSessionJsonHandle)
  }

  async function downloadCurrentWorkingJson() {
    if (!state.chapterSessionServerJsonPath && !state.chapterSessionJsonAssetId) {
      state.chapterSessionError = true
      state.chapterSessionStatus = '请先选择或生成一份教材 JSON'
      return
    }
    state.chapterSessionError = false
    try {
      await downloadManagedJsonFile({
        workspaceId: state.currentWorkspaceId,
        jsonAssetId: state.chapterSessionJsonAssetId,
        jsonFilePath: state.chapterSessionServerJsonPath,
      }, state.chapterSessionJsonLabel || 'textbook.json')
      state.chapterSessionStatus = '已下载当前最新 JSON'
    } catch (error) {
      state.chapterSessionError = true
      state.chapterSessionStatus = error instanceof Error ? error.message : '下载当前最新 JSON 失败'
    }
  }

  async function downloadCurrentExamJson() {
    if (!state.examSessionServerJsonPath && !state.examSessionJsonAssetId) {
      state.examSessionError = true
      state.examSessionStatus = '请先选择或生成一份试卷 JSON'
      return
    }
    state.examSessionError = false
    try {
      await downloadManagedJsonFile({
        workspaceId: state.currentWorkspaceId,
        jsonAssetId: state.examSessionJsonAssetId,
        jsonFilePath: state.examSessionServerJsonPath,
      }, state.examSessionJsonLabel || 'exam.json')
      state.examSessionStatus = '已下载当前最新 JSON'
    } catch (error) {
      state.examSessionError = true
      state.examSessionStatus = error instanceof Error ? error.message : '下载当前最新 JSON 失败'
    }
  }

  async function downloadCurrentVisualizerJson() {
    if (!state.visualizerServerJsonPath && !state.visualizerJsonAssetId) {
      state.visualizerError = true
      state.visualizerStatus = '请先加载一份题库 JSON'
      return
    }
    state.visualizerError = false
    try {
      await downloadManagedJsonFile({
        workspaceId: state.visualizerWorkspaceId,
        jsonAssetId: state.visualizerJsonAssetId,
        jsonFilePath: state.visualizerServerJsonPath,
      }, state.visualizerFileName || 'textbook.json')
      state.visualizerStatus = '已下载当前最新 JSON'
    } catch (error) {
      state.visualizerError = true
      state.visualizerStatus = error instanceof Error ? error.message : '下载当前最新 JSON 失败'
    }
  }

  async function loadWorkspaceList(options = {}) {
    state.workspaceListLoading = true
    state.workspaceListError = false
    if (!options?.silent) {
      state.workspaceListStatus = '正在读取工作区列表...'
    }

    try {
      const resp = await fetch('/api/workspaces')
      const data = await parseApiResponse(resp)
      if (!resp.ok) {
        throw new Error(data.message || '读取工作区列表失败')
      }
      state.workspaceList = Array.isArray(data.workspaces) ? data.workspaces : []
      const workspaceIds = new Set(
        state.workspaceList
          .map((workspace) => String(workspace?.workspaceId || '').trim())
          .filter(Boolean),
      )
      const currentVisualizerWorkspaceId = String(state.visualizerWorkspaceId || '').trim()
      if (currentVisualizerWorkspaceId && !workspaceIds.has(currentVisualizerWorkspaceId)) {
        state.visualizerWorkspaceId = ''
        clearVisualizerWorkspaceBrowser()
        clearVisualizerWorkspaceBindings()
      }
      if (!String(state.visualizerWorkspaceId || '').trim() && workspaceIds.size) {
        const preferredWorkspaceId = workspaceIds.has(String(state.currentWorkspaceId || '').trim())
          ? String(state.currentWorkspaceId || '').trim()
          : String(state.workspaceList[0]?.workspaceId || '').trim()
        if (preferredWorkspaceId) {
          state.visualizerWorkspaceId = preferredWorkspaceId
          await browseVisualizerWorkspace('', {
            workspaceId: preferredWorkspaceId,
            silent: true,
          })
        }
      }
      state.workspaceListStatus = options?.silent ? state.workspaceListStatus : `已读取 ${state.workspaceList.length} 个工作区`
      return state.workspaceList
    } catch (error) {
      state.workspaceListError = true
      state.workspaceListStatus = error instanceof Error ? error.message : '读取工作区列表失败'
      return []
    } finally {
      state.workspaceListLoading = false
    }
  }

  function applyMultiChapterSlotToTask(task, slot) {
    if (!task || !slot || typeof task !== 'object' || typeof slot !== 'object') {
      return
    }
    task.workspaceId = String(slot.workspaceId || state.currentWorkspaceId || '').trim()
    task.slotName = String(slot.slotName || '').trim()
    task.slotRelativePath = String(slot.slotRelativePath || '').trim()
    task.slotJsonFileName = String(slot.jsonFileName || '').trim()
    task.slotJsonRelativePath = String(slot.jsonRelativePath || '').trim()
    task.slotImageCount = Number(slot.imageCount || 0)
    if (!task.status || /选择|槽位|图片|就绪|待补全/.test(task.status)) {
      task.status = task.slotRelativePath
        ? `已绑定槽位 ${task.slotRelativePath}，当前已备份 ${task.slotImageCount} 张图片`
        : ''
    }
    task.error = false
  }

  function syncChapterBatchTasksWithSlots(slots) {
    const items = Array.isArray(slots) ? slots : []
    for (const task of Array.isArray(state.chapterBatchTasks) ? state.chapterBatchTasks : []) {
      const slot = items.find((item) => String(item?.slotRelativePath || '').trim() === String(task?.slotRelativePath || '').trim())
      if (slot) {
        applyMultiChapterSlotToTask(task, slot)
      } else if (String(task?.slotRelativePath || '').trim()) {
        task.slotImageCount = 0
        task.error = true
        task.status = `槽位不存在或已被重建：${task.slotRelativePath}`
      }
    }
  }

  function syncMergeWorkspaceSlotSelections(slots) {
    const validPaths = new Set(
      (Array.isArray(slots) ? slots : [])
        .map((item) => String(item?.slotRelativePath || '').trim())
        .filter(Boolean),
    )
    state.mergeWorkspaceSlotPaths = state.mergeWorkspaceSlotPaths.filter((slotRelativePath) =>
      validPaths.has(String(slotRelativePath || '').trim()),
    )
  }

  async function loadMultiChapterSlots(options = {}) {
    const workspaceId = String(options?.workspaceId || state.currentWorkspaceId || '').trim()
    if (!workspaceId) {
      clearMultiChapterSlots()
      return []
    }

    state.multiChapterSlotsLoading = true
    state.multiChapterSlotsError = false
    if (!options?.silent) {
      state.multiChapterSlotsStatus = '正在读取多章节槽位...'
    }

    try {
      const slots = await requestMultiChapterSlots(workspaceId)
      state.multiChapterSlots = slots
      syncChapterBatchTasksWithSlots(slots)
      syncMergeWorkspaceSlotSelections(slots)
      state.multiChapterSlotsStatus = options?.silent ? state.multiChapterSlotsStatus : `已读取 ${slots.length} 个章节槽位`
      return slots
    } catch (error) {
      state.multiChapterSlotsError = true
      state.multiChapterSlotsStatus = error instanceof Error ? error.message : '读取多章节槽位失败'
      return []
    } finally {
      state.multiChapterSlotsLoading = false
    }
  }

  async function browseCurrentWorkspace(relativePath = '', options = {}) {
    const workspaceId = String(options?.workspaceId || state.currentWorkspaceId || '').trim()
    if (!workspaceId) {
      clearWorkspaceBrowser()
      return null
    }

    state.workspaceBrowserLoading = true
    state.workspaceBrowserError = false
    if (!options?.silent) {
      state.workspaceBrowserStatus = '正在读取工作区目录...'
    }

    try {
      const query = new URLSearchParams()
      if (String(relativePath || '').trim()) {
        query.set('path', String(relativePath || '').trim())
      }
      const resp = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/browser?${query.toString()}`)
      const data = await parseApiResponse(resp)
      if (!resp.ok) {
        throw new Error(data.message || '读取工作区目录失败')
      }
      state.workspaceBrowser = data.browser || null
      state.workspaceBrowserStatus = options?.silent ? state.workspaceBrowserStatus : '已刷新工作区目录'
      return state.workspaceBrowser
    } catch (error) {
      state.workspaceBrowserError = true
      state.workspaceBrowserStatus = error instanceof Error ? error.message : '读取工作区目录失败'
      return null
    } finally {
      state.workspaceBrowserLoading = false
    }
  }

  async function browseVisualizerWorkspace(relativePath = '', options = {}) {
    const workspaceId = String(options?.workspaceId || state.visualizerWorkspaceId || '').trim()
    if (!workspaceId) {
      clearVisualizerWorkspaceBrowser()
      return null
    }

    state.visualizerWorkspaceBrowserLoading = true
    state.visualizerWorkspaceBrowserError = false
    if (!options?.silent) {
      state.visualizerWorkspaceBrowserStatus = '正在读取可视化工作区目录...'
    }

    try {
      const query = new URLSearchParams()
      if (String(relativePath || '').trim()) {
        query.set('path', String(relativePath || '').trim())
      }
      const resp = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/browser?${query.toString()}`)
      const data = await parseApiResponse(resp)
      if (!resp.ok) {
        throw new Error(data.message || '读取可视化工作区目录失败')
      }
      state.visualizerWorkspaceBrowser = data.browser || null
      state.visualizerWorkspaceBrowserStatus = options?.silent ? state.visualizerWorkspaceBrowserStatus : '已刷新可视化工作区目录'
      return state.visualizerWorkspaceBrowser
    } catch (error) {
      state.visualizerWorkspaceBrowserError = true
      state.visualizerWorkspaceBrowserStatus = error instanceof Error ? error.message : '读取可视化工作区目录失败'
      return null
    } finally {
      state.visualizerWorkspaceBrowserLoading = false
    }
  }

  async function switchVisualizerWorkspace(workspaceId, options = {}) {
    const normalizedWorkspaceId = String(workspaceId || '').trim()
    if (!normalizedWorkspaceId) {
      state.visualizerWorkspaceId = ''
      clearVisualizerWorkspaceBrowser()
      clearVisualizerWorkspaceBindings()
      return
    }

    const previousWorkspaceId = String(state.visualizerWorkspaceId || '').trim()
    const nextPath =
      normalizedWorkspaceId === previousWorkspaceId
        ? String(state.visualizerWorkspaceBrowser?.currentPath || '').trim()
        : ''

    state.visualizerWorkspaceId = normalizedWorkspaceId
    if (normalizedWorkspaceId !== previousWorkspaceId) {
      clearVisualizerWorkspaceBindings()
      clearVisualizerWorkspaceBrowser()
    }

    await browseVisualizerWorkspace(nextPath, {
      workspaceId: normalizedWorkspaceId,
      silent: options?.silent,
    })
  }

  async function switchCurrentWorkspace(workspaceId) {
    const normalizedWorkspaceId = String(workspaceId || '').trim()
    if (!normalizedWorkspaceId) {
      resetCurrentWorkspaceBindings()
      return
    }
    if (normalizedWorkspaceId === String(state.currentWorkspaceId || '').trim()) {
      await Promise.all([
        refreshCurrentWorkspaceSummary({ workspaceId: normalizedWorkspaceId, silent: true }),
        loadMultiChapterSlots({ workspaceId: normalizedWorkspaceId, silent: true }),
        browseCurrentWorkspace(state.workspaceBrowser?.currentPath || '', {
          workspaceId: normalizedWorkspaceId,
          silent: true,
        }),
      ])
      return
    }

    resetCurrentWorkspaceBindings()
    state.currentWorkspaceId = normalizedWorkspaceId
    await Promise.all([
      refreshCurrentWorkspaceSummary({ workspaceId: normalizedWorkspaceId, silent: true }),
      loadMultiChapterSlots({ workspaceId: normalizedWorkspaceId, silent: true }),
      browseCurrentWorkspace('', {
        workspaceId: normalizedWorkspaceId,
        silent: true,
      }),
    ])
  }

  async function createWorkspaceAction() {
    state.workspaceCreateRunning = true
    state.workspaceListError = false
    state.workspaceListStatus = '正在创建工作区...'

    try {
      const resp = await fetch('/api/workspaces', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: String(state.workspaceCreateName || '').trim(),
        }),
      })
      const data = await parseApiResponse(resp)
      if (!resp.ok) {
        throw new Error(data.message || '创建工作区失败')
      }
      state.workspaceCreateName = ''
      await loadWorkspaceList({ silent: true })
      await switchCurrentWorkspace(String(data.summary?.workspaceId || ''))
      state.workspaceListStatus = `已创建工作区 ${String(data.summary?.workspaceId || '').trim()}`
    } catch (error) {
      state.workspaceListError = true
      state.workspaceListStatus = error instanceof Error ? error.message : '创建工作区失败'
    } finally {
      state.workspaceCreateRunning = false
    }
  }

  async function downloadCurrentWorkspaceUploads() {
    const workspaceId = String(state.currentWorkspaceId || '').trim()
    if (!workspaceId) {
      state.workspaceSummaryError = true
      state.workspaceSummaryStatus = '当前还没有可下载交付包的工作区'
      return
    }

    state.workspaceDownloadRunning = true
    state.workspaceSummaryError = false
    state.workspaceSummaryStatus = '正在打包当前工作区交付包（JSON + 题图）...'

    try {
      const resp = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/deliverable/download`)
      if (!resp.ok) {
        const data = await parseApiResponse(resp)
        throw new Error(data.message || '下载当前工作区交付包失败')
      }
      const contentType = String(resp.headers.get('content-type') || '').toLowerCase()
      const disposition = String(resp.headers.get('content-disposition') || '')
      if (contentType.includes('text/html') || (!/attachment/i.test(disposition) && !contentType.includes('zip') && !contentType.includes('gzip'))) {
        throw new Error('交付包下载接口尚未生效，通常是后端服务还没重启，请重启 backend 后再试')
      }
      const blob = await resp.blob()
      const suggestedName = resp.headers.get('content-type')?.includes('gzip')
        ? `${workspaceId}_deliverable.tar.gz`
        : `${workspaceId}_deliverable.zip`
      triggerBlobDownload(parseDownloadFileName(resp, suggestedName), blob)
      state.workspaceSummaryStatus = '已开始下载当前工作区交付包'
    } catch (error) {
      state.workspaceSummaryError = true
      state.workspaceSummaryStatus = error instanceof Error ? error.message : '下载当前工作区交付包失败'
    } finally {
      state.workspaceDownloadRunning = false
    }
  }

  async function downloadWorkspaceBrowserEntry(relativePath = '', options = {}) {
    const workspaceId = String(options?.workspaceId || state.currentWorkspaceId || '').trim()
    if (!workspaceId) {
      state.workspaceBrowserError = true
      state.workspaceBrowserStatus = '当前还没有可下载的工作区'
      return
    }

    const normalizedPath = String(relativePath || '').trim()
    state.workspaceBrowserDownloadTarget = String(options?.downloadKey || normalizedPath || '__root__').trim()
    state.workspaceBrowserError = false
    state.workspaceBrowserStatus = normalizedPath ? `正在下载 ${normalizedPath} ...` : '正在下载当前工作区...'

    try {
      const query = new URLSearchParams()
      if (normalizedPath) {
        query.set('path', normalizedPath)
      }
      const resp = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/download?${query.toString()}`)
      if (!resp.ok) {
        const data = await parseApiResponse(resp)
        throw new Error(data.message || '下载工作区内容失败')
      }
      const blob = await resp.blob()
      const fallbackName = normalizedPath
        ? normalizedPath.split('/').filter(Boolean).slice(-1)[0] || `${workspaceId}.zip`
        : `${workspaceId}.zip`
      triggerBlobDownload(parseDownloadFileName(resp, fallbackName), blob)
      state.workspaceBrowserStatus = normalizedPath ? `已开始下载 ${normalizedPath}` : '已开始下载当前工作区'
    } catch (error) {
      state.workspaceBrowserError = true
      state.workspaceBrowserStatus = error instanceof Error ? error.message : '下载工作区内容失败'
    } finally {
      state.workspaceBrowserDownloadTarget = ''
    }
  }

  async function openWorkspaceBrowserEntry(entry) {
    if (!entry || entry.type !== 'directory') {
      return
    }
    await browseCurrentWorkspace(String(entry.relativePath || ''))
  }

  async function deleteWorkspaceById(workspaceId, options = {}) {
    const normalizedWorkspaceId = String(workspaceId || '').trim()
    if (!normalizedWorkspaceId) {
      state.workspaceListError = true
      state.workspaceListStatus = '请先选择要删除的工作区'
      return false
    }

    if (!options?.skipConfirm && typeof window !== 'undefined') {
      const confirmed = window.confirm(`确认删除工作区 ${normalizedWorkspaceId} 吗？这会删除服务器上的 JSON、PDF、页图和中间产物。`)
      if (!confirmed) {
        return false
      }
    }

    state.workspaceDeleteRunning = true
    state.workspaceSummaryError = false
    state.workspaceListError = false
    state.workspaceSummaryStatus = `正在删除工作区 ${normalizedWorkspaceId}...`
    state.workspaceListStatus = state.workspaceSummaryStatus

    try {
      const resp = await fetch(`/api/workspaces/${encodeURIComponent(normalizedWorkspaceId)}`, {
        method: 'DELETE',
      })
      const data = await parseApiResponse(resp)
      if (!resp.ok) {
        throw new Error(data.message || '删除工作区失败')
      }
      if (normalizedWorkspaceId === String(state.currentWorkspaceId || '').trim()) {
        resetCurrentWorkspaceBindings()
        state.workspaceSummaryStatus = `已删除工作区 ${normalizedWorkspaceId}`
      }
      await loadWorkspaceList({ silent: true })
      state.workspaceListStatus = `已删除工作区 ${normalizedWorkspaceId}`
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : '删除工作区失败'
      state.workspaceSummaryError = true
      state.workspaceListError = true
      state.workspaceSummaryStatus = message
      state.workspaceListStatus = message
      return false
    } finally {
      state.workspaceDeleteRunning = false
    }
  }

  async function pickJsonFileFromPicker() {
    if (!supportsPicker('showOpenFilePicker')) {
      throw new Error('当前浏览器不支持 JSON 文件选择器，请使用 Chromium 内核浏览器')
    }

    const [handle] = await window.showOpenFilePicker({
      excludeAcceptAllOption: true,
      multiple: false,
      types: [
        {
          description: '教材 JSON',
          accept: {
            'application/json': ['.json'],
          },
        },
      ],
    })
    const file = await handle.getFile()
    const text = await fileToText(file)
    const payload = JSON.parse(text)
    return {
      handle,
      file,
      payload,
      sourceMeta: getPayloadSourceMeta(payload),
    }
  }

  async function collectImagesFromDirectoryHandle(directoryHandle, prefix = '') {
    const files = []
    for await (const entry of directoryHandle.values()) {
      const nextPrefix = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.kind === 'directory') {
        files.push(...await collectImagesFromDirectoryHandle(entry, nextPrefix))
        continue
      }
      if (!/\.(jpg|jpeg|png|webp)$/i.test(entry.name)) {
        continue
      }
      const file = await entry.getFile()
      files.push({
        file,
        name: nextPrefix,
      })
    }
    return files
  }

  async function pickImageFolderFromPicker() {
    if (!supportsPicker('showDirectoryPicker')) {
      throw new Error('当前浏览器不支持文件夹选择器，请使用 Chromium 内核浏览器')
    }

    const handle = await window.showDirectoryPicker()
    const images = await collectImagesFromDirectoryHandle(handle)
    images.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true, sensitivity: 'base' }))
    if (!images.length) {
      throw new Error('所选文件夹中没有图片文件')
    }
    return {
      handle,
      images,
    }
  }

  async function requestChapterSessionInit(params) {
    const {
      workspaceId = '',
      jsonAssetId = '',
      jsonFilePath = '',
      slotRelativePath = '',
      currentChapterTitle = '',
      currentSectionTitle = '',
    } = params || {}

    const resp = await fetch('/api/chapters/session/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildManagedJsonBody({
        workspaceId,
        jsonAssetId,
        jsonFilePath,
      }, {
        slotRelativePath,
        currentChapterTitle,
        currentSectionTitle,
      })),
    })
    const data = await parseApiResponse(resp)
    if (!resp.ok) {
      throw new Error(data.message || '初始化失败')
    }
    return data
  }

  async function requestChapterProcessImage(params) {
    const {
      processingProfile,
      chapterArkHeaders = {},
      sessionId = '',
      imageFile = null,
      lookaheadFile = null,
      currentChapterTitle = '',
      currentSectionTitle = '',
      signal,
      errorMessage = '自动处理失败',
    } = params || {}

    const formData = new FormData()
    formData.append('sessionId', sessionId)
    formData.append('image', imageFile, imageFile?.name || 'image')
    formData.append('currentChapterTitle', currentChapterTitle)
    formData.append('currentSectionTitle', currentSectionTitle)
    if (lookaheadFile) {
      formData.append('lookaheadImage', lookaheadFile, lookaheadFile.name || 'lookahead')
    }

    const resp = await fetch(processingProfile.processImageEndpoint, {
      method: 'POST',
      headers: chapterArkHeaders,
      body: formData,
      signal,
    })
    const data = await parseApiResponse(resp)
    if (!resp.ok) {
      throw new Error(data.message || errorMessage)
    }
    return data
  }

  async function requestChapterSegmentAppend(params) {
    const formData = new FormData()
    appendManagedJsonFormData(formData, {
      workspaceId: params?.workspaceId || '',
      jsonAssetId: params?.jsonAssetId || '',
      jsonFilePath: params?.jsonFilePath || '',
    })
    formData.append('chapterTitle', params?.chapterTitle || '')
    formData.append('sectionTitle', params?.sectionTitle || '')
    for (const file of Array.isArray(params?.imageFiles) ? params.imageFiles : []) {
      formData.append('images', file, file.name)
    }

    const resp = await fetch(params?.processingProfile?.processSegmentEndpoint || '/api/chapters/segments/append-from-images', {
      method: 'POST',
      headers: {
        ...params?.chapterArkHeaders,
      },
      body: formData,
      signal: params?.signal,
    })
    const data = await parseApiResponse(resp)
    if (!resp.ok) {
      throw new Error(data.message || params?.errorMessage || '手工分段处理失败')
    }
    return data
  }

  async function requestMultiChapterSlotSetup(params) {
    const workspaceId = String(params?.workspaceId || '').trim()
    const slotCount = normalizeMultiChapterSlotCount(params?.slotCount)
    const resp = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/multi-chapter/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payload: params?.payload || null,
        slotCount,
      }),
    })
    const data = await parseApiResponse(resp)
    if (!resp.ok) {
      throw new Error(data.message || '批量创建多章节槽位失败')
    }
    return data
  }

  async function requestMultiChapterSlots(workspaceId) {
    const normalizedWorkspaceId = String(workspaceId || '').trim()
    const resp = await fetch(`/api/workspaces/${encodeURIComponent(normalizedWorkspaceId)}/multi-chapter/slots`)
    const data = await parseApiResponse(resp)
    if (!resp.ok) {
      throw new Error(data.message || '读取多章节槽位失败')
    }
    return Array.isArray(data.slots) ? data.slots : []
  }

  async function requestMultiChapterSlotImagesUpload(params) {
    const workspaceId = String(params?.workspaceId || '').trim()
    const slotRelativePath = String(params?.slotRelativePath || '').trim()
    const files = Array.isArray(params?.files) ? params.files : []
    const formData = new FormData()
    formData.append('slotRelativePath', slotRelativePath)
    for (const file of files) {
      formData.append('images', file, file.name)
    }

    const resp = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/multi-chapter/images`, {
      method: 'POST',
      body: formData,
    })
    const data = await parseApiResponse(resp)
    if (!resp.ok) {
      throw new Error(data.message || '上传章节槽位图片失败')
    }
    return data
  }

  async function requestChapterAutoRunStream(params) {
    const processingProfile = params?.processingProfile || getChapterProcessingProfile()
    const endpoint = processingProfile.mode === 'responses'
      ? '/api/chapters/session/auto-run-stream-responses'
      : '/api/chapters/session/auto-run-stream'
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(params?.chapterArkHeaders || {}),
      },
      body: JSON.stringify({
        sessionId: String(params?.sessionId || '').trim(),
        workspaceId: String(params?.workspaceId || '').trim(),
        slotRelativePath: String(params?.slotRelativePath || '').trim(),
        imageDir: String(params?.imageDir || '').trim(),
        currentChapterTitle: String(params?.currentChapterTitle || '').trim(),
        currentSectionTitle: String(params?.currentSectionTitle || '').trim(),
      }),
      signal: params?.signal,
    })

    if (!resp.ok) {
      const data = await parseApiResponse(resp)
      throw new Error(data.message || '自动处理失败')
    }
    if (!resp.body) {
      throw new Error('后端未返回可读取的流')
    }

    const reader = resp.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''
    let doneEvent = null

    while (true) {
      const { value, done } = await reader.read()
      if (done) {
        break
      }
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const rawLine of lines) {
        const line = String(rawLine || '').trim()
        if (!line) {
          continue
        }
        const event = JSON.parse(line)
        if (typeof params?.onEvent === 'function') {
          await params.onEvent(event)
        }
        if (event?.type === 'done') {
          doneEvent = event
        }
        if (event?.type === 'error') {
          throw new Error(String(event?.message || '自动处理失败'))
        }
      }
    }

    const finalLine = buffer.trim()
    if (finalLine) {
      const event = JSON.parse(finalLine)
      if (typeof params?.onEvent === 'function') {
        await params.onEvent(event)
      }
      if (event?.type === 'done') {
        doneEvent = event
      }
      if (event?.type === 'error') {
        throw new Error(String(event?.message || '自动处理失败'))
      }
    }

    return doneEvent
  }

  async function requestExamQuestionTypeOptions() {
    const resp = await fetch('/api/question-bank-db/question-types')
    const data = await parseApiResponse(resp)
    if (!resp.ok) {
      throw new Error(data.message || '读取题型列表失败')
    }
    return Array.isArray(data.items) ? data.items : []
  }

  async function requestQuestionBankQuestionSearch(params) {
    const resp = await fetch('/api/question-bank-db/questions/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: params?.query || '',
        courseId: params?.courseId || '',
        textbookId: params?.textbookId || '',
        documentType: params?.documentType || '',
        questionType: params?.questionType || '',
        limit: params?.limit ?? 12,
      }),
    })
    const data = await parseApiResponse(resp)
    if (!resp.ok) {
      throw new Error(data.message || '检索题库失败')
    }
    return Array.isArray(data.items) ? data.items : []
  }

  async function requestExamSectionExtractFromImages(params) {
    const formData = new FormData()
    appendManagedJsonFormData(formData, {
      workspaceId: params?.workspaceId || '',
      jsonAssetId: params?.jsonAssetId || '',
      jsonFilePath: params?.jsonFilePath || '',
    })
    formData.append('majorTitle', params?.majorTitle || '')
    formData.append('minorTitle', params?.minorTitle || '')
    formData.append('questionType', params?.questionType || '')
    for (const file of Array.isArray(params?.imageFiles) ? params.imageFiles : []) {
      formData.append('images', file, file.name)
    }

    const resp = await fetch('/api/exams/sections/extract-from-images', {
      method: 'POST',
      headers: {
        ...params?.chapterArkHeaders,
      },
      body: formData,
    })
    const data = await parseApiResponse(resp)
    if (!resp.ok) {
      throw new Error(data.message || '按指定部分提取试卷图片失败')
    }
    return data
  }

  async function requestExamSectionAppendFromLibrary(params) {
    const resp = await fetch('/api/exams/sections/append-from-library', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildManagedJsonBody({
        workspaceId: params?.workspaceId || '',
        jsonAssetId: params?.jsonAssetId || '',
        jsonFilePath: params?.jsonFilePath || '',
      }, {
        majorTitle: params?.majorTitle || '',
        minorTitle: params?.minorTitle || '',
        questionType: params?.questionType || '',
        recordIds: Array.isArray(params?.recordIds) ? params.recordIds : [],
      })),
    })
    const data = await parseApiResponse(resp)
    if (!resp.ok) {
      throw new Error(data.message || '从题库选题写入试卷失败')
    }
    return data
  }

  async function requestFinalizeExamSections(params) {
    const resp = await fetch('/api/exams/sections/finalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildManagedJsonBody({
        workspaceId: params?.workspaceId || '',
        jsonAssetId: params?.jsonAssetId || '',
        jsonFilePath: params?.jsonFilePath || '',
      }, {
        sections: Array.isArray(params?.sections) ? params.sections : [],
      })),
    })
    const data = await parseApiResponse(resp)
    if (!resp.ok) {
      throw new Error(data.message || '确认整份试卷失败')
    }
    return data
  }

  async function chooseJsonSessionFile() {
    try {
      const { handle, file, payload } = await pickJsonFileFromPicker()
      await importJsonFileToWorkspace(file, payload)
      state.chapterSessionJsonHandle = handle
      state.chapterSessionError = false
      state.chapterSessionStatus = `已选择 JSON 文件：${file.name}`
    } catch (error) {
      if (error?.name === 'AbortError') {
        return
      }
      state.chapterSessionError = true
      state.chapterSessionStatus = error instanceof Error ? error.message : '选择 JSON 文件失败'
    }
  }

  async function chooseExamJsonSessionFile() {
    try {
      const { handle, file, payload, sourceMeta } = await pickJsonFileFromPicker()
      if (sourceMeta.documentType !== 'exam') {
        throw new Error('当前文件不是试卷 JSON，请选择包含 exam 元数据的文件')
      }
      const data = await importJsonFileToWorkspace(file, payload)
      state.chapterSessionJsonHandle = handle
      state.examSessionJsonHandle = handle
      state.examSessionJsonLabel = file.name
      state.examSessionServerJsonPath = String(data.workspaceFilePath || data.filePath || '')
      state.examSessionJsonAssetId = String(data.jsonAssetId || '')
      state.currentWorkspaceId = String(data.workspaceId || state.currentWorkspaceId || '')
      state.examSessionPayload = payload
      applyExamSourceMeta(state, sourceMeta)
      state.examSessionError = false
      state.examSessionStatus = `已选择试卷 JSON：${file.name}`
    } catch (error) {
      if (error?.name === 'AbortError') {
        return
      }
      state.examSessionError = true
      state.examSessionStatus = error instanceof Error ? error.message : '选择试卷 JSON 失败'
    }
  }

  function findExamSectionTask(taskId) {
    return state.examSectionTasks.find((item) => item?.id === taskId) || null
  }

  function getDefaultExamQuestionType() {
    return String(state.examQuestionTypeOptions?.[0]?.value || 'SHORT_ANSWER').trim() || 'SHORT_ANSWER'
  }

  function normalizeExamSectionTaskQuestionType(task) {
    if (!task || typeof task !== 'object') {
      return
    }
    if (!state.examQuestionTypeOptions.length) {
      if (!String(task.questionType || '').trim()) {
        task.questionType = 'SHORT_ANSWER'
      } else {
        task.questionType = normalizeQuestionTypeValue(task.questionType)
      }
      return
    }
    task.questionType = normalizeQuestionTypeValue(task.questionType) || task.questionType
    const exists = state.examQuestionTypeOptions.some((item) => item?.value === task.questionType)
    if (!exists) {
      task.questionType = getDefaultExamQuestionType()
    }
  }

  async function loadExamQuestionTypeOptions(force = false) {
    if (state.examQuestionTypeLoading) {
      return state.examQuestionTypeOptions
    }
    if (!force && state.examQuestionTypeOptions.length) {
      return state.examQuestionTypeOptions
    }

    state.examQuestionTypeLoading = true
    state.examQuestionTypeError = false
    state.examQuestionTypeStatus = '加载题型配置中...'
    try {
      const items = await requestExamQuestionTypeOptions()
      state.examQuestionTypeOptions = items
      state.examQuestionTypeStatus = items.length ? `已载入 ${items.length} 种题型` : '题型列表为空'
      state.examSectionTasks.forEach((task) => normalizeExamSectionTaskQuestionType(task))
      return items
    } catch (error) {
      state.examQuestionTypeError = true
      state.examQuestionTypeStatus = error instanceof Error ? error.message : '加载题型配置失败'
      return state.examQuestionTypeOptions
    } finally {
      state.examQuestionTypeLoading = false
    }
  }

  function addExamSectionTask() {
    const task = createExamSectionTask()
    task.questionType = getDefaultExamQuestionType()
    state.examSectionTasks.push(task)
  }

  function removeExamSectionTask(taskId) {
    if (state.examSectionTasks.length <= 1) {
      const onlyTask = state.examSectionTasks[0]
      if (!onlyTask) {
        state.examSectionTasks = [createExamSectionTask()]
        return
      }
      onlyTask.majorTitle = ''
      onlyTask.minorTitle = ''
      onlyTask.questionType = getDefaultExamQuestionType()
      onlyTask.libraryDocumentType = ''
      onlyTask.imageFiles = []
      onlyTask.stagedQuestions = []
      onlyTask.confirmed = false
      onlyTask.status = ''
      onlyTask.error = false
      onlyTask.running = false
      onlyTask.result = null
      onlyTask.searchQuery = ''
      onlyTask.searchStatus = ''
      onlyTask.searchError = false
      onlyTask.searchResults = []
      onlyTask.selectedRecordIds = []
      return
    }
    state.examSectionTasks = state.examSectionTasks.filter((item) => item?.id !== taskId)
  }

  function onExamSectionImagesChange(taskId, event) {
    const task = findExamSectionTask(taskId)
    if (!task) {
      return
    }
    task.imageFiles = Array.from(event?.target?.files ?? [])
    task.error = false
    task.status = task.imageFiles.length ? `已选择 ${task.imageFiles.length} 张图片` : ''
    if (event?.target) {
      event.target.value = ''
    }
  }

  function clearExamSectionImages(taskId) {
    const task = findExamSectionTask(taskId)
    if (!task) {
      return
    }
    task.imageFiles = []
    task.error = false
    task.status = '已清空当前部分的待提取图片'
  }

  function toggleExamSectionRecord(taskId, recordId) {
    const task = findExamSectionTask(taskId)
    if (!task) {
      return
    }
    const normalizedId = String(recordId || '').trim()
    if (!normalizedId) {
      return
    }
    const exists = task.selectedRecordIds.includes(normalizedId)
    task.selectedRecordIds = exists
      ? task.selectedRecordIds.filter((item) => item !== normalizedId)
      : [...task.selectedRecordIds, normalizedId]
  }

  function ensureExamSectionTaskReady(task) {
    if (!task) {
      throw new Error('试卷部分任务不存在')
    }
    if (!state.examSessionServerJsonPath) {
      throw new Error('请先选择试卷 JSON 文件')
    }
    if (!String(task.majorTitle || '').trim()) {
      throw new Error('请先填写当前部分的大结构标题')
    }
    if (!String(task.questionType || '').trim()) {
      throw new Error('请先选择题型')
    }
  }

  function cloneExamQuestion(question) {
    return JSON.parse(JSON.stringify(question))
  }

  function createExamStagedQuestion(task, question, source) {
    examStagedQuestionSequence += 1
    return {
      ...cloneExamQuestion(question),
      localId: `exam_stage_${Date.now()}_${examStagedQuestionSequence}`,
      source,
      sectionQuestionType: String(task.questionType || '').trim(),
    }
  }

  function stripExamStagedQuestionMeta(question) {
    if (!question || typeof question !== 'object') {
      return question
    }
    const cloned = cloneExamQuestion(question)
    delete cloned.localId
    delete cloned.source
    delete cloned.sectionQuestionType
    return cloned
  }

  function appendQuestionsToExamSectionTask(task, questions, source, successText) {
    const incoming = (Array.isArray(questions) ? questions : []).map((question) => createExamStagedQuestion(task, question, source))
    task.stagedQuestions = [...task.stagedQuestions, ...incoming]
    task.confirmed = false
    task.error = false
    task.result = {
      questionType: String(task.questionType || ''),
      questionTypeLabel: questionTypeLabelByValue(task.questionType),
      currentMajorTitle: String(task.majorTitle || ''),
      currentMinorTitle: String(task.minorTitle || ''),
      currentStructureChapterId: '',
      upsertedCount: incoming.length,
      questionsCount: task.stagedQuestions.length,
      reason: successText || '',
    }
    task.status = successText || `已暂存 ${incoming.length} 道题`
    state.examSectionError = false
    state.examSectionStatus = task.status
    state.examFinalizeError = false
    state.examFinalizeStatus = ''
  }

  function moveExamSectionQuestion(taskId, localId, direction) {
    const task = findExamSectionTask(taskId)
    if (!task || !Array.isArray(task.stagedQuestions)) {
      return
    }
    const index = task.stagedQuestions.findIndex((item) => item?.localId === localId)
    if (index < 0) {
      return
    }
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= task.stagedQuestions.length) {
      return
    }
    const next = [...task.stagedQuestions]
    const [current] = next.splice(index, 1)
    next.splice(targetIndex, 0, current)
    task.stagedQuestions = next
    task.confirmed = false
    task.status = '已调整当前部分题目顺序，请重新确认这一部分'
  }

  function removeExamSectionQuestion(taskId, localId) {
    const task = findExamSectionTask(taskId)
    if (!task || !Array.isArray(task.stagedQuestions)) {
      return
    }
    task.stagedQuestions = task.stagedQuestions.filter((item) => item?.localId !== localId)
    task.confirmed = false
    task.status = '已移除一道题，请重新确认这一部分'
    task.error = false
  }

  function questionTypeLabelByValue(value) {
    const normalizedValue = normalizeQuestionTypeValue(value) || String(value || '').trim()
    const matched = state.examQuestionTypeOptions.find((item) => item?.value === normalizedValue)
    return matched?.label || normalizedValue || '未分类'
  }

  function confirmExamSection(taskId) {
    const task = findExamSectionTask(taskId)
    try {
      ensureExamSectionTaskReady(task)
      if (!Array.isArray(task.stagedQuestions) || !task.stagedQuestions.length) {
        throw new Error('当前部分还没有暂存题目')
      }
      task.confirmed = true
      task.error = false
      task.status = `这一部分已确认，共 ${task.stagedQuestions.length} 道题`
      state.examSectionError = false
      state.examSectionStatus = task.status
      state.examSessionCurrentMajor = String(task.majorTitle || '').trim()
      state.examSessionCurrentMinor = String(task.minorTitle || '').trim()
    } catch (error) {
      task.error = true
      task.status = error instanceof Error ? error.message : '确认当前部分失败'
      state.examSectionError = true
      state.examSectionStatus = task.status
    }
  }

  function reopenExamSection(taskId) {
    const task = findExamSectionTask(taskId)
    if (!task) {
      return
    }
    task.confirmed = false
    task.error = false
    task.status = '已返回当前部分，你可以继续加题、调序和改分'
    state.examSectionError = false
    state.examSectionStatus = task.status
  }

  function finalizeExamSectionPayload() {
    const sections = state.examSectionTasks.map((task) => ({
      majorTitle: String(task.majorTitle || '').trim(),
      minorTitle: String(task.minorTitle || '').trim(),
      questionType: String(task.questionType || '').trim(),
      questions: (Array.isArray(task.stagedQuestions) ? task.stagedQuestions : []).map((item) =>
        stripExamStagedQuestionMeta(item),
      ),
      confirmed: task.confirmed === true,
    }))

    const invalid = sections.find(
      (item) => !item.confirmed || !item.majorTitle || !item.questionType || !Array.isArray(item.questions) || !item.questions.length,
    )
    if (invalid) {
      throw new Error('请先把每一个试卷部分都配置完整并确认后，再做总确认')
    }

    return sections.map(({ confirmed, ...rest }) => rest)
  }

  async function finalizeExamSections() {
    if (!state.examSessionServerJsonPath) {
      state.examFinalizeError = true
      state.examFinalizeStatus = '请先选择试卷 JSON 文件'
      return
    }

    state.examFinalizeProcessing = true
    state.examFinalizeError = false
    state.examFinalizeStatus = '正在生成完整试卷 JSON...'
    try {
      const sections = finalizeExamSectionPayload()
      const data = await requestFinalizeExamSections({
        workspaceId: state.currentWorkspaceId,
        jsonAssetId: state.examSessionJsonAssetId,
        jsonFilePath: state.examSessionServerJsonPath,
        sections,
      })
      state.examFinalizeStatus = `整份试卷已确认，共 ${Number(data.sectionCount ?? sections.length)} 个部分，${Number(data.questionsCount ?? 0)} 道题`
      state.examSessionStatus = state.examFinalizeStatus
      state.examSessionCurrentMajor = ''
      state.examSessionCurrentMinor = ''
      await syncExamWorkingJsonToLocalFile().catch(() => {})
    } catch (error) {
      state.examFinalizeError = true
      state.examFinalizeStatus = error instanceof Error ? error.message : '确认整份试卷失败'
    } finally {
      state.examFinalizeProcessing = false
    }
  }

  function applyExamSectionPreviewMeta(task, data, successText) {
    task.error = false
    task.result = {
      questionType: String(data.questionType || task.questionType || ''),
      questionTypeLabel: String(data.questionTypeLabel || ''),
      currentMajorTitle: String(data.currentMajorTitle || task.majorTitle || ''),
      currentMinorTitle: String(data.currentMinorTitle || task.minorTitle || ''),
      currentStructureChapterId: String(data.currentStructureChapterId || ''),
      chaptersCount: Number(data.chaptersCount ?? 0),
      questionsCount: Array.isArray(task.stagedQuestions) ? task.stagedQuestions.length : 0,
      upsertedCount: Number(data.question?.upsertedCount ?? 0),
      reason: String(data.question?.reason || ''),
    }
    task.status = successText || `已暂存 ${task.result.upsertedCount} 道题`
    state.examSectionError = false
    state.examSectionStatus = task.status
    state.examSessionTitle = String(data.examTitle || state.examSessionTitle || '')
    state.examSessionExamType = String(data.examType || state.examSessionExamType || '')
    state.examSessionHasAnswer = data.hasAnswer !== false
    state.examSessionCurrentMajor = task.result.currentMajorTitle
    state.examSessionCurrentMinor = task.result.currentMinorTitle
    state.examSessionStatus = task.status
  }

  async function searchExamSectionLibrary(taskId) {
    const task = findExamSectionTask(taskId)
    if (!task) {
      return
    }
    await loadExamQuestionTypeOptions()
    normalizeExamSectionTaskQuestionType(task)

    task.searchError = false
    task.searchStatus = '检索题库中...'
    task.searchResults = []
    task.selectedRecordIds = []

    try {
      const items = await requestQuestionBankQuestionSearch({
        query: String(task.searchQuery || '').trim(),
        courseId: String(state.examJsonForm.courseId || '').trim(),
        documentType: String(task.libraryDocumentType || '').trim(),
        questionType: String(task.questionType || '').trim(),
        limit: 12,
      })
      task.searchResults = items
      task.searchStatus = items.length ? `已找到 ${items.length} 条候选题` : '没有找到符合条件的题目'
    } catch (error) {
      task.searchError = true
      task.searchStatus = error instanceof Error ? error.message : '检索题库失败'
    }
  }

  async function appendExamSectionFromImages(taskId) {
    const task = findExamSectionTask(taskId)
    try {
      ensureExamSectionTaskReady(task)
      if (!Array.isArray(task.imageFiles) || !task.imageFiles.length) {
        throw new Error('请先为当前部分上传图片')
      }
      if (!ensureChapterArkApiKey()) {
        return
      }
      task.running = true
      task.error = false
      task.status = '正在按当前部分配置提取图片...'
      state.examSectionError = false
      state.examSectionStatus = task.status

      const data = await requestExamSectionExtractFromImages({
        chapterArkHeaders: buildChapterArkHeaders(),
        workspaceId: state.currentWorkspaceId,
        jsonAssetId: state.examSessionJsonAssetId,
        jsonFilePath: state.examSessionServerJsonPath,
        majorTitle: String(task.majorTitle || '').trim(),
        minorTitle: String(task.minorTitle || '').trim(),
        questionType: String(task.questionType || '').trim(),
        imageFiles: task.imageFiles,
      })
      appendQuestionsToExamSectionTask(
        task,
        data.questionsToStage,
        'image',
        `已从图片暂存 ${Number(data.question?.upsertedCount ?? 0)} 道题，请继续调序或赋分`,
      )
      applyExamSectionPreviewMeta(task, data, task.status)
    } catch (error) {
      if (task) {
        task.error = true
        task.status = error instanceof Error ? error.message : '当前部分图片提取失败'
      }
      state.examSectionError = true
      state.examSectionStatus = task?.status || '当前部分图片提取失败'
    } finally {
      if (task) {
        task.running = false
      }
    }
  }

  async function appendExamSectionFromLibrary(taskId) {
    const task = findExamSectionTask(taskId)
    try {
      ensureExamSectionTaskReady(task)
      if (!Array.isArray(task.selectedRecordIds) || !task.selectedRecordIds.length) {
        throw new Error('请先从题库里勾选题目')
      }
      task.running = true
      task.error = false
      task.status = '正在把题库选题加入当前部分...'
      state.examSectionError = false
      state.examSectionStatus = task.status

      const data = await requestExamSectionAppendFromLibrary({
        workspaceId: state.currentWorkspaceId,
        jsonAssetId: state.examSessionJsonAssetId,
        jsonFilePath: state.examSessionServerJsonPath,
        majorTitle: String(task.majorTitle || '').trim(),
        minorTitle: String(task.minorTitle || '').trim(),
        questionType: String(task.questionType || '').trim(),
        recordIds: task.selectedRecordIds,
      })
      appendQuestionsToExamSectionTask(
        task,
        data.questionsToStage,
        'library',
        `已从题库暂存 ${Number(data.question?.upsertedCount ?? 0)} 道题，请继续调序或赋分`,
      )
      applyExamSectionPreviewMeta(task, data, task.status)
    } catch (error) {
      if (task) {
        task.error = true
        task.status = error instanceof Error ? error.message : '题库选题写入失败'
      }
      state.examSectionError = true
      state.examSectionStatus = task?.status || '题库选题写入失败'
    } finally {
      if (task) {
        task.running = false
      }
    }
  }

  function addChapterManualChapter() {
    state.chapterManualChapters.push(createChapterManualChapter())
  }

  function removeChapterManualChapter(chapterId) {
    if (state.chapterManualRunning) {
      return
    }
    if (state.chapterManualChapters.length <= 1) {
      state.chapterManualChapters = [createChapterManualChapter()]
      return
    }
    state.chapterManualChapters = state.chapterManualChapters.filter((item) => item?.id !== chapterId)
  }

  function addChapterManualSection(chapterId) {
    const chapter = findChapterManualChapter(chapterId)
    if (!chapter || state.chapterManualRunning) {
      return
    }
    chapter.sections = [...(Array.isArray(chapter.sections) ? chapter.sections : []), createChapterManualSection()]
  }

  function removeChapterManualSection(chapterId, sectionId) {
    const chapter = findChapterManualChapter(chapterId)
    if (!chapter || state.chapterManualRunning) {
      return
    }
    const sections = Array.isArray(chapter.sections) ? chapter.sections : []
    if (sections.length <= 1) {
      chapter.sections = [createChapterManualSection()]
      return
    }
    chapter.sections = sections.filter((item) => item?.id !== sectionId)
  }

  function onChapterManualSectionImagesChange(chapterId, sectionId, event) {
    const { section } = findChapterManualSection(chapterId, sectionId)
    if (!section) {
      return
    }
    section.imageFiles = Array.from(event?.target?.files ?? [])
    section.error = false
    section.completed = false
    section.status = section.imageFiles.length ? `已选择 ${section.imageFiles.length} 张图片` : ''
    if (event?.target) {
      event.target.value = ''
    }
  }

  function clearChapterManualSectionImages(chapterId, sectionId) {
    const { section } = findChapterManualSection(chapterId, sectionId)
    if (!section) {
      return
    }
    section.imageFiles = []
    section.error = false
    section.completed = false
    section.status = '已清空当前小节图片'
  }

  function appendChapterManualLog(line) {
    const text = String(line || '').trim()
    if (!text) {
      return
    }
    state.chapterManualLogs = state.chapterManualLogs
      ? `${state.chapterManualLogs}\n${text}`
      : text
  }

  async function runChapterManualBatch() {
    if (!state.chapterSessionServerJsonPath) {
      state.chapterManualError = true
      state.chapterManualStatus = '请先选择目标 JSON 文件'
      return
    }
    if (state.workingJsonDocumentType === 'exam') {
      state.chapterManualError = true
      state.chapterManualStatus = '当前文件是试卷 JSON，请切换到试卷流程'
      return
    }
    if (!ensureChapterArkApiKey()) {
      return
    }

    const sections = flattenChapterManualSections()
    const readySections = sections.filter((item) => item.ready)
    if (!readySections.length) {
      state.chapterManualError = true
      state.chapterManualStatus = '请至少配置一个完整的小节片段：章名、小节名和图片都要填写'
      return
    }

    chapterManualAbortController?.abort()
    chapterManualAbortController = new AbortController()
    const processingProfile = getChapterProcessingProfile()
    const chapterArkHeaders = buildChapterArkHeaders()
    state.chapterManualRunning = true
    state.chapterManualStopping = false
    state.chapterManualError = false
    state.chapterManualStatus = '正在按手工分段批量生成...'
    state.chapterManualLogs = ''
    state.chapterManualSummary = {
      totalCount: readySections.length,
      completedCount: 0,
      successCount: 0,
      failedCount: 0,
      currentLabel: '',
      modeLabel: processingProfile.modeLabel,
    }
    state.chapterManualLive = {
      totalCount: readySections.length,
      completedCount: 0,
      successCount: 0,
      failedCount: 0,
      currentLabel: '',
      modeLabel: processingProfile.modeLabel,
    }

    let successCount = 0
    let failedCount = 0

    try {
      for (let index = 0; index < readySections.length; index += 1) {
        const item = readySections[index]
        const { chapter, section, label } = item

        if (state.chapterManualStopping || chapterManualAbortController.signal.aborted) {
          appendChapterManualLog(`手工分段已停止：${label}`)
          state.chapterManualSummary = {
            totalCount: readySections.length,
            completedCount: index,
            successCount,
            failedCount,
            currentLabel: label,
            modeLabel: processingProfile.modeLabel,
            stopped: true,
          }
          state.chapterManualStatus = `已手动停止，停在 ${label}`
          return
        }

        section.running = true
        section.error = false
        section.completed = false
        section.status = '正在处理这一段图片...'
        state.chapterManualLive = {
          totalCount: readySections.length,
          completedCount: index,
          successCount,
          failedCount,
          currentLabel: label,
          modeLabel: processingProfile.modeLabel,
        }
        appendChapterManualLog(`处理中 ${index + 1}/${readySections.length}: ${label}`)

        try {
          const data = await requestChapterSegmentAppend({
            processingProfile,
            chapterArkHeaders,
            workspaceId: state.currentWorkspaceId,
            jsonAssetId: state.chapterSessionJsonAssetId,
            jsonFilePath: state.chapterSessionServerJsonPath,
            chapterTitle: String(chapter.chapterTitle || '').trim(),
            sectionTitle: String(section.sectionTitle || '').trim(),
            imageFiles: section.imageFiles,
            signal: chapterManualAbortController.signal,
            errorMessage: '手工分段处理失败',
          })

          section.running = false
          section.completed = true
          section.error = false
          section.upsertedCount = Number(data.question?.upsertedCount ?? 0)
          section.questionsCount = Number(data.questionsCount ?? 0)
          section.logs = JSON.stringify(
            {
              passLogs: data.passLogs || [],
              question: data.question || {},
              prefixCacheExperiment: data.prefixCacheExperiment || null,
            },
            null,
            2,
          )
          section.status = `处理完成，新增 ${section.upsertedCount} 题，当前总题数 ${section.questionsCount}`
          state.chapterSessionCurrentChapter = String(data.currentChapterTitle || chapter.chapterTitle || '')
          state.chapterSessionCurrentSection = String(data.currentSectionTitle || section.sectionTitle || '')
          successCount += 1
          state.chapterManualLive = {
            totalCount: readySections.length,
            completedCount: index + 1,
            successCount,
            failedCount,
            currentLabel: label,
            modeLabel: processingProfile.modeLabel,
            lastUpsertedCount: section.upsertedCount,
          }
          appendChapterManualLog(`完成 ${index + 1}/${readySections.length}: ${label} | 新增 ${section.upsertedCount} 题 | 总题数 ${section.questionsCount}`)
          await syncWorkingJsonToLocalFile().catch(() => {})
        } catch (error) {
          section.running = false
          section.completed = false
          section.error = true
          section.status = error instanceof Error ? error.message : '手工分段处理失败'
          failedCount += 1
          state.chapterManualError = true
          state.chapterManualLive = {
            totalCount: readySections.length,
            completedCount: index + 1,
            successCount,
            failedCount,
            currentLabel: label,
            modeLabel: processingProfile.modeLabel,
            error: section.status,
          }
          appendChapterManualLog(`失败 ${index + 1}/${readySections.length}: ${label} | ${section.status}`)
        }
      }

      state.chapterManualSummary = {
        totalCount: readySections.length,
        completedCount: readySections.length,
        successCount,
        failedCount,
        currentLabel: '',
        modeLabel: processingProfile.modeLabel,
      }
      state.chapterManualStatus = failedCount
        ? `手工分段处理完成，成功 ${successCount} 段，失败 ${failedCount} 段`
        : `手工分段处理完成，共生成 ${successCount} 段`
    } catch (error) {
      state.chapterManualError = true
      state.chapterManualStatus = error instanceof Error ? error.message : '手工分段处理失败'
    } finally {
      for (const item of readySections) {
        item.section.running = false
      }
      state.chapterManualRunning = false
      state.chapterManualStopping = false
      chapterManualAbortController = null
    }
  }

  function stopChapterManualBatch() {
    if (!state.chapterManualRunning || state.chapterManualStopping) {
      return
    }
    state.chapterManualStopping = true
    state.chapterManualError = false
    state.chapterManualStatus = '正在停止手工分段处理...'
    chapterManualAbortController?.abort()
  }

  function resetChapterManualBatch() {
    if (state.chapterManualRunning) {
      return
    }
    resetChapterManualRuntimeState()
  }

  function createSuggestedJsonFileName() {
    const base =
      String(state.jsonForm.textbookId || '').trim() ||
      String(state.jsonForm.title || '').trim() ||
      'textbook'
    return `${base.replace(/[\\/:*?"<>|]+/g, '_')}.json`
  }

  function createSuggestedExamJsonFileName() {
    const base =
      String(state.examJsonForm.examId || '').trim() ||
      String(state.examJsonForm.title || '').trim() ||
      'exam'
    return `${base.replace(/[\\/:*?"<>|]+/g, '_')}.json`
  }

  async function createMultiChapterSlotsFromTextbookForm() {
    const payload = buildTextbookPayload()

    if (!payload.version || !payload.courseId || !payload.textbook.textbookId) {
      state.jsonFormError = '请至少填写 version、courseId、textbookId'
      state.generatedTextbookJson = ''
      return
    }

    let workspaceId = ''
    try {
      workspaceId = requireCurrentWorkspace('请先在工作区页面手动创建并选定一个工作区，再批量创建多章节槽位')
    } catch (error) {
      state.multiChapterSlotSetupRunning = false
      state.multiChapterSlotSetupError = true
      state.multiChapterSlotSetupStatus = error instanceof Error ? error.message : '请先选择当前工作区'
      return
    }

    const slotCount = normalizeMultiChapterSlotCount(state.multiChapterSlotCount)
    state.multiChapterSlotCount = slotCount
    state.jsonFormError = ''
    state.generatedTextbookJson = JSON.stringify(payload, null, 2)
    state.multiChapterSlotSetupRunning = true
    state.multiChapterSlotSetupError = false
    state.multiChapterSlotSetupStatus = `正在重建当前工作区的 ${slotCount} 个章节槽位...`

    try {
      const data = await requestMultiChapterSlotSetup({
        workspaceId,
        payload,
        slotCount,
      })
      state.currentWorkspaceId = String(data.workspaceId || workspaceId)
      state.multiChapterSlots = Array.isArray(data.slots) ? data.slots : []
      syncChapterBatchTasksWithSlots(state.multiChapterSlots)
      state.multiChapterSlotSetupStatus = `已在当前工作区创建 ${state.multiChapterSlots.length} 个章节槽位`
      state.multiChapterSlotsStatus = `已读取 ${state.multiChapterSlots.length} 个章节槽位`
      state.multiChapterSlotsError = false
      await Promise.all([
        refreshCurrentWorkspaceSummary({ silent: true }),
        browseCurrentWorkspace('multi_chapter', { silent: true }).catch(() => null),
      ])
    } catch (error) {
      state.multiChapterSlotSetupError = true
      state.multiChapterSlotSetupStatus = error instanceof Error ? error.message : '批量创建多章节槽位失败'
    } finally {
      state.multiChapterSlotSetupRunning = false
    }
  }

  function generateTextbookJson() {
    const payload = buildTextbookPayload()

    if (!payload.version || !payload.courseId || !payload.textbook.textbookId) {
      state.jsonFormError = '请至少填写 version、courseId、textbookId'
      state.generatedTextbookJson = ''
      return
    }

    state.jsonFormError = ''
    state.jsonSaveStatus = ''
    state.jsonSaveError = false
    state.generatedTextbookJson = JSON.stringify(payload, null, 2)
  }

  function generateExamJson() {
    const payload = buildExamPayload()

    if (!payload.version || !payload.courseId || !payload.exam.examId || !payload.exam.title) {
      state.examJsonFormError = '请至少填写 version、courseId、examId、试卷名称'
      state.generatedExamJson = ''
      return
    }

    state.examJsonFormError = ''
    state.examJsonSaveStatus = ''
    state.examJsonSaveError = false
    state.generatedExamJson = JSON.stringify(payload, null, 2)
  }

  async function saveTextbookJson() {
    const payload = buildTextbookPayload()
    if (!payload.version || !payload.courseId || !payload.textbook.textbookId) {
      state.jsonFormError = '请至少填写 version、courseId、textbookId'
      state.generatedTextbookJson = ''
      return
    }

    state.jsonFormError = ''
    state.jsonSaveError = false
    state.jsonSaveStatus = '保存中...'

    const text = `${JSON.stringify(payload, null, 2)}\n`
    const suggestedName = createSuggestedJsonFileName()

    try {
      requireCurrentWorkspace()
      if (supportsPicker('showSaveFilePicker')) {
        const handle = await window.showSaveFilePicker({
          suggestedName,
          types: [
            {
              description: '教材 JSON',
              accept: {
                'application/json': ['.json'],
              },
            },
          ],
        })
        const writable = await handle.createWritable()
        await writable.write(text)
        await writable.close()

        const localFile = new File([text], handle.name || suggestedName, { type: 'application/json' })
        await importJsonFileToWorkspace(localFile, payload)
        state.chapterSessionJsonHandle = handle
        state.generatedTextbookJson = text.trim()
        state.jsonSaveStatus = `已保存并载入当前工作副本：${handle.name || suggestedName}`
      } else {
        triggerJsonDownload(suggestedName, text)
        const localFile = new File([text], suggestedName, { type: 'application/json' })
        await importJsonFileToWorkspace(localFile, payload)
        state.generatedTextbookJson = text.trim()
        state.jsonSaveStatus = '当前浏览器不支持原生保存选择器，已下载 JSON 并载入后端工作副本'
      }
    } catch (error) {
      if (error?.name === 'AbortError') {
        state.jsonSaveStatus = '已取消保存'
        return
      }
      state.jsonSaveError = true
      state.jsonSaveStatus = error instanceof Error ? error.message : '保存失败'
    }
  }

  async function saveExamJson() {
    const payload = buildExamPayload()
    if (!payload.version || !payload.courseId || !payload.exam.examId || !payload.exam.title) {
      state.examJsonFormError = '请至少填写 version、courseId、examId、试卷名称'
      state.generatedExamJson = ''
      return
    }

    state.examJsonFormError = ''
    state.examJsonSaveError = false
    state.examJsonSaveStatus = '保存中...'

    const text = `${JSON.stringify(payload, null, 2)}\n`
    const suggestedName = createSuggestedExamJsonFileName()

    try {
      requireCurrentWorkspace()
      if (supportsPicker('showSaveFilePicker')) {
        const handle = await window.showSaveFilePicker({
          suggestedName,
          types: [
            {
              description: '试卷 JSON',
              accept: {
                'application/json': ['.json'],
              },
            },
          ],
        })
        const writable = await handle.createWritable()
        await writable.write(text)
        await writable.close()

        const localFile = new File([text], handle.name || suggestedName, { type: 'application/json' })
        const data = await importJsonFileToWorkspace(localFile, payload)
        state.chapterSessionJsonHandle = handle
        state.examSessionJsonHandle = handle
        state.examSessionJsonLabel = handle.name || suggestedName
        state.examSessionServerJsonPath = String(data.workspaceFilePath || data.filePath || '')
        state.examSessionJsonAssetId = String(data.jsonAssetId || '')
        state.currentWorkspaceId = String(data.workspaceId || state.currentWorkspaceId || '')
        state.examSessionPayload = payload
        state.generatedExamJson = text.trim()
        state.examJsonSaveStatus = `已保存并载入当前工作副本：${handle.name || suggestedName}`
      } else {
        triggerJsonDownload(suggestedName, text)
        const localFile = new File([text], suggestedName, { type: 'application/json' })
        const data = await importJsonFileToWorkspace(localFile, payload)
        state.examSessionJsonLabel = suggestedName
        state.examSessionServerJsonPath = String(data.workspaceFilePath || data.filePath || '')
        state.examSessionJsonAssetId = String(data.jsonAssetId || '')
        state.currentWorkspaceId = String(data.workspaceId || state.currentWorkspaceId || '')
        state.examSessionPayload = payload
        state.generatedExamJson = text.trim()
        state.examJsonSaveStatus = '当前浏览器不支持原生保存选择器，已下载 JSON 并载入后端工作副本'
      }
    } catch (error) {
      if (error?.name === 'AbortError') {
        state.examJsonSaveStatus = '已取消保存'
        return
      }
      state.examJsonSaveError = true
      state.examJsonSaveStatus = error instanceof Error ? error.message : '保存失败'
    }
  }

  function onExamImageChange(event) {
    state.examImageFile = event?.target?.files?.[0] ?? null
  }

  function onRepairImageChange(event) {
    state.repairImageFiles = Array.from(event.target.files ?? [])
  }

  function onImageAttachFilesChange(event) {
    state.imageAttachFiles = Array.from(event.target.files ?? [])
  }

  function clearImageAttachFiles() {
    state.imageAttachFiles = []
    state.imageAttachError = false
    state.imageAttachStatus = '已清空当前待补充图片列表'
  }

  function removeImageAttachFile(index) {
    if (!Number.isInteger(index) || index < 0 || index >= state.imageAttachFiles.length) {
      return
    }
    state.imageAttachFiles = state.imageAttachFiles.filter((_, currentIndex) => currentIndex !== index)
    state.imageAttachError = false
    state.imageAttachStatus = '已移除 1 张待补充图片'
  }

  function onImageAttachPaste(event) {
    const clipboardItems = Array.from(event?.clipboardData?.items ?? [])
    const imageFiles = clipboardItems
      .filter((item) => item.kind === 'file' && /^image\//i.test(item.type))
      .map((item, index) => item.getAsFile() || null)
      .filter(Boolean)
      .map((file, index) => {
        const ext = file.type === 'image/png'
          ? '.png'
          : file.type === 'image/webp'
            ? '.webp'
            : file.type === 'image/jpeg'
              ? '.jpg'
              : ''
        return new File([file], file.name || `pasted_image_${Date.now()}_${index + 1}${ext}`, {
          type: file.type || 'image/png',
          lastModified: Date.now(),
        })
      })

    if (!imageFiles.length) {
      state.imageAttachError = true
      state.imageAttachStatus = '剪贴板里没有可用图片，请先截图后再粘贴'
      return
    }

    event.preventDefault()
    state.imageAttachFiles = [...state.imageAttachFiles, ...imageFiles]
    state.imageAttachError = false
    state.imageAttachStatus = `已追加 ${imageFiles.length} 张剪贴板图片，当前共 ${state.imageAttachFiles.length} 张`
  }

  function onMergeJsonFilesChange(event) {
    const incomingFiles = Array.from(event.target.files ?? [])
    const existingKeys = new Set(
      state.mergeJsonFiles.map((file) => `${file.name}__${file.size}__${file.lastModified}`),
    )
    for (const file of incomingFiles) {
      const key = `${file.name}__${file.size}__${file.lastModified}`
      if (!existingKeys.has(key)) {
        state.mergeJsonFiles.push(file)
        existingKeys.add(key)
      }
    }
    if (event?.target) {
      event.target.value = ''
    }
  }

  function setMergeSourceMode(mode) {
    state.mergeSourceMode = normalizeMergeSourceMode(mode)
    state.mergeError = false
    state.mergeStatus = ''
    state.mergeResult = null
  }

  function toggleMergeWorkspaceSlot(slotRelativePath) {
    const normalizedPath = String(slotRelativePath || '').trim()
    if (!normalizedPath) {
      return
    }
    const current = new Set(
      state.mergeWorkspaceSlotPaths
        .map((item) => String(item || '').trim())
        .filter(Boolean),
    )
    if (current.has(normalizedPath)) {
      state.mergeWorkspaceSlotPaths = state.mergeWorkspaceSlotPaths.filter(
        (item) => String(item || '').trim() !== normalizedPath,
      )
    } else {
      state.mergeWorkspaceSlotPaths = [...state.mergeWorkspaceSlotPaths, normalizedPath]
    }
    state.mergeError = false
  }

  function removeMergeJsonFile(index) {
    state.mergeJsonFiles.splice(index, 1)
  }

  function clearMergeJsonFiles() {
    state.mergeJsonFiles = []
  }

  function clearMergeWorkspaceSlotSelections() {
    state.mergeWorkspaceSlotPaths = []
  }

  async function mergeJsonFiles() {
    const mergeSourceMode = normalizeMergeSourceMode(state.mergeSourceMode)
    const selectedSlotPaths = [...new Set(
      state.mergeWorkspaceSlotPaths
        .map((item) => String(item || '').trim())
        .filter(Boolean),
    )]

    let workspaceId = ''
    if (mergeSourceMode === 'workspace') {
      try {
        workspaceId = requireCurrentWorkspace('请先选择当前工作区，再从 multi_chapter 槽位合并 JSON')
      } catch (error) {
        state.mergeError = true
        state.mergeStatus = error instanceof Error ? error.message : '请先选择当前工作区'
        return
      }
      if (selectedSlotPaths.length < 2) {
        state.mergeError = true
        state.mergeStatus = '请至少勾选 2 个 multi_chapter 章节槽位'
        return
      }
    } else if (state.mergeJsonFiles.length < 2) {
      state.mergeError = true
      state.mergeStatus = '请至少选择 2 个 JSON 文件'
      return
    }

    state.mergeProcessing = true
    state.mergeError = false
    state.mergeStatus = mergeSourceMode === 'workspace' ? '正在合并工作区章节槽位...' : '合并处理中...'
    state.mergeResult = null

    try {
      const formData = new FormData()
      formData.append('outputFileName', String(state.mergeOutputFileName || '').trim())
      if (mergeSourceMode === 'workspace') {
        formData.append('workspaceId', workspaceId)
        for (const slotRelativePath of selectedSlotPaths) {
          formData.append('slotRelativePaths', slotRelativePath)
        }
      } else {
        for (const file of state.mergeJsonFiles) {
          formData.append('jsonFiles', file, file.name)
        }
      }

      const resp = await fetch('/api/textbook-json/merge', {
        method: 'POST',
        body: formData,
      })
      const data = await parseApiResponse(resp)
      if (!resp.ok) {
        throw new Error(data.message || '合并失败')
      }

      state.mergeResult = {
        mergedFileName: String(data.mergedFileName || ''),
        mergedFilePath: String(data.mergedFilePath || ''),
        inputCount: Number(data.inputCount ?? 0),
        chaptersCount: Number(data.chaptersCount ?? 0),
        questionsCount: Number(data.questionsCount ?? 0),
        duplicateChapterCount: Number(data.duplicateChapterCount ?? 0),
        duplicateQuestionCount: Number(data.duplicateQuestionCount ?? 0),
        persistedToWorkspace: data.persistedToWorkspace === true,
        workspaceId: String(data.workspaceId || ''),
        jsonAssetId: String(data.jsonAssetId || ''),
        workspaceFilePath: String(data.workspaceFilePath || ''),
      }
      if (state.mergeResult.persistedToWorkspace) {
        state.mergeStatus = `合并完成，已写入当前工作区主 JSON，可直接下载完整文件包`
        await Promise.all([
          refreshCurrentWorkspaceSummary({ workspaceId: state.mergeResult.workspaceId || workspaceId, silent: true }),
          browseCurrentWorkspace(state.workspaceBrowser?.currentPath || '', {
            workspaceId: state.mergeResult.workspaceId || workspaceId,
            silent: true,
          }).catch(() => null),
        ])
      } else {
        state.mergeStatus = `合并完成，已输出到 merged_json：${state.mergeResult.mergedFileName || state.mergeResult.mergedFilePath}`
      }
    } catch (error) {
      state.mergeError = true
      state.mergeStatus = error instanceof Error ? error.message : '合并失败'
    } finally {
      state.mergeProcessing = false
    }
  }

  function onDbImportFilesChange(event) {
    const incomingFiles = Array.from(event?.target?.files ?? []).filter((file) => /\.json$/i.test(file.name || ''))
    const existingKeys = new Set(
      state.dbImportFiles.map((file) => `${file.name}__${file.size}__${file.lastModified}`),
    )
    for (const file of incomingFiles) {
      const key = `${file.name}__${file.size}__${file.lastModified}`
      if (!existingKeys.has(key)) {
        state.dbImportFiles.push(file)
        existingKeys.add(key)
      }
    }
    state.dbImportError = false
    if (event?.target) {
      event.target.value = ''
    }
  }

  function removeDbImportFile(index) {
    state.dbImportFiles.splice(index, 1)
  }

  function clearDbImportFiles() {
    state.dbImportFiles = []
    state.dbImportError = false
    state.dbImportStatus = '已清空当前待导入文件列表'
  }

  async function loadQuestionBankDbSummary() {
    state.dbSummaryLoading = true
    state.dbSummaryError = false
    state.dbSummaryStatus = '读取数据库摘要中...'

    try {
      const resp = await fetch('/api/question-bank-db/summary')
      const data = await parseApiResponse(resp)
      if (!resp.ok) {
        throw new Error(data.message || '读取数据库摘要失败')
      }

      state.dbSummary = {
        schema: String(data.schema || ''),
        database: String(data.database || ''),
        counts: {
          textbookCount: Number(data.counts?.textbookCount ?? 0),
          examCount: Number(data.counts?.examCount ?? 0),
          chapterCount: Number(data.counts?.chapterCount ?? 0),
          textbookSchoolScopeCount: Number(data.counts?.textbookSchoolScopeCount ?? 0),
          questionRowCount: Number(data.counts?.questionRowCount ?? 0),
          paperCount: Number(data.counts?.paperCount ?? 0),
          groupQuestionCount: Number(data.counts?.groupQuestionCount ?? 0),
          leafQuestionCount: Number(data.counts?.leafQuestionCount ?? 0),
          childQuestionCount: Number(data.counts?.childQuestionCount ?? 0),
        },
        textbooks: Array.isArray(data.textbooks) ? data.textbooks : [],
      }
      const sourceCount = state.dbSummary.counts.textbookCount + state.dbSummary.counts.examCount
      state.dbSummaryStatus = `当前 schema：${state.dbSummary.schema}，来源文档 ${sourceCount} 份（教材 ${state.dbSummary.counts.textbookCount} / 试卷 ${state.dbSummary.counts.examCount}），题目行 ${state.dbSummary.counts.questionRowCount} 条`
    } catch (error) {
      state.dbSummaryError = true
      state.dbSummary = null
      state.dbSummaryStatus = error instanceof Error ? error.message : '读取数据库摘要失败'
    } finally {
      state.dbSummaryLoading = false
    }
  }

  async function importQuestionBankDbJsonFiles() {
    if (!state.dbImportFiles.length) {
      state.dbImportError = true
      state.dbImportStatus = '请先选择至少一个 JSON 文件'
      return
    }

    state.dbImportProcessing = true
    state.dbImportError = false
    state.dbImportStatus = `正在导入 ${state.dbImportFiles.length} 个来源 JSON 到数据库...`
    state.dbImportResult = null

    try {
      const formData = new FormData()
      for (const file of state.dbImportFiles) {
        formData.append('jsonFiles', file, file.name)
      }

      const resp = await fetch('/api/question-bank-db/import-upload', {
        method: 'POST',
        body: formData,
      })
      const data = await parseApiResponse(resp)
      if (!resp.ok) {
        throw new Error(data.message || '导入数据库失败')
      }

      state.dbImportResult = {
        schema: String(data.schema || ''),
        fileCount: Number(data.fileCount ?? 0),
        items: Array.isArray(data.items) ? data.items : [],
      }
      state.dbImportStatus = `导入完成，已写入 schema ${state.dbImportResult.schema}，共处理 ${state.dbImportResult.fileCount} 个文件`
      await loadQuestionBankDbSummary()
    } catch (error) {
      state.dbImportError = true
      state.dbImportStatus = error instanceof Error ? error.message : '导入数据库失败'
    } finally {
      state.dbImportProcessing = false
    }
  }

  function fillAssistantPrompt(prompt) {
    state.assistantInput = String(prompt || '').trim()
    state.assistantError = false
    if (state.assistantInput) {
      state.assistantStatus = '已填入示例问题，可以直接发送'
    }
  }

  function clearQuestionBankAssistantChat() {
    state.assistantMessages = []
    state.assistantToolTraces = []
    state.assistantError = false
    state.assistantStatus = '已清空当前对话'
  }

  async function sendQuestionBankAssistantMessage() {
    const question = String(state.assistantInput || '').trim()
    if (!question) {
      state.assistantError = true
      state.assistantStatus = '请先输入问题'
      return
    }

    const userMessage = {
      role: 'user',
      content: question,
      createdAt: new Date().toISOString(),
    }

    state.assistantMessages = [...state.assistantMessages, userMessage]
    state.assistantProcessing = true
    state.assistantError = false
    state.assistantStatus = 'AI 助手正在通过 MCP 查询数据库...'
    state.assistantToolTraces = []

    try {
      const resp = await fetch('/api/question-bank-assistant/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...buildAssistantArkHeaders(),
        },
        body: JSON.stringify({
          messages: state.assistantMessages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          maxToolSteps: 6,
        }),
      })

      const data = await parseApiResponse(resp)
      if (!resp.ok) {
        throw new Error(data.message || 'AI 助手回答失败')
      }

      const assistantMessage = {
        role: 'assistant',
        content: String(data.answer || '').trim() || '数据库返回了结果，但助手没有生成可用回答。',
        usedTools: Array.isArray(data.usedTools) ? data.usedTools.map((item) => String(item || '').trim()).filter(Boolean) : [],
        createdAt: new Date().toISOString(),
      }

      state.assistantMessages = [...state.assistantMessages, assistantMessage]
      state.assistantToolTraces = Array.isArray(data.toolTraces) ? data.toolTraces : []
      state.assistantStatus = assistantMessage.usedTools.length
        ? `回答完成，已调用 ${assistantMessage.usedTools.length} 个 MCP 工具`
        : '回答完成'
      state.assistantInput = ''
    } catch (error) {
      state.assistantError = true
      state.assistantStatus = error instanceof Error ? error.message : 'AI 助手回答失败'
    } finally {
      state.assistantProcessing = false
    }
  }

  async function repairQuestionInJson() {
    if (!state.chapterSessionServerJsonPath) {
      state.repairError = true
      state.repairStatus = '请先选择 JSON 文件'
      return
    }
    if (!state.repairImageFiles.length) {
      state.repairError = true
      state.repairStatus = '请先上传题目图片'
      return
    }

    const isExam = state.workingJsonDocumentType === 'exam'
    const questionId = String(state.repairForm.questionId || '').trim()
    const chapterNo = Number(state.repairForm.chapterNo)
    const sectionNo = Number(state.repairForm.sectionNo)
    const questionNo = Number(state.repairForm.questionNo)
    if (isExam) {
      if (!questionId) {
        state.repairError = true
        state.repairStatus = '试卷修复请填写 questionId'
        return
      }
    } else if (
      !Number.isInteger(chapterNo) ||
      chapterNo <= 0 ||
      !Number.isInteger(sectionNo) ||
      sectionNo <= 0 ||
      !Number.isInteger(questionNo) ||
      questionNo <= 0
    ) {
      state.repairError = true
      state.repairStatus = '章、小节、题号都必须是正整数'
      return
    }

    state.repairProcessing = true
    state.repairError = false
    state.repairStatus = '定点修复处理中...'
    state.repairRawText = ''
    state.repairResult = null

    try {
      const formData = new FormData()
      appendManagedJsonFormData(formData, {
        workspaceId: state.currentWorkspaceId,
        jsonAssetId: state.chapterSessionJsonAssetId,
        jsonFilePath: state.chapterSessionServerJsonPath,
      })
      formData.append('sourceFileName', state.chapterSessionJsonLabel || '')
      if (isExam) {
        formData.append('questionId', questionId)
      } else {
        formData.append('chapterNo', String(chapterNo))
        formData.append('sectionNo', String(sectionNo))
        formData.append('questionNo', String(questionNo))
      }
      for (const file of state.repairImageFiles) {
        formData.append('images', file, file.name)
      }

      const resp = await fetch('/api/textbook-json/repair-question', {
        method: 'POST',
        body: formData,
      })
      const data = await parseApiResponse(resp)
      if (!resp.ok) {
        state.repairRawText = String(data.rawText || '')
        throw new Error(data.message || '定点修复失败')
      }

      state.repairRawText = String(data.rawText || '')
      state.repairResult = {
        jsonFilePath: String(data.jsonFilePath || ''),
        chapterTitle: String(data.chapterTitle || ''),
        sectionTitle: String(data.sectionTitle || ''),
        questionId: String(data.questionId || ''),
        questionTitle: String(data.questionTitle || ''),
        action: String(data.action || ''),
        insertIndex: Number(data.insertIndex ?? -1),
        questionsCount: Number(data.questionsCount ?? 0),
        reason: String(data.reason || ''),
        rawText: String(data.rawText || ''),
      }
      state.repairStatus = '修复完成，已写入当前工作区'
    } catch (error) {
      state.repairError = true
      state.repairStatus = error instanceof Error ? error.message : '定点修复失败'
    } finally {
      state.repairProcessing = false
    }
  }

  async function attachImagesToQuestionJson() {
    if (!state.chapterSessionServerJsonPath) {
      state.imageAttachError = true
      state.imageAttachStatus = '请先选择 JSON 文件'
      return
    }
    if (!state.imageAttachFiles.length) {
      state.imageAttachError = true
      state.imageAttachStatus = '请先上传题目图片'
      return
    }

    const isExam = state.workingJsonDocumentType === 'exam'
    const chapterNo = Number(state.imageAttachForm.chapterNo)
    const sectionNo = Number(state.imageAttachForm.sectionNo)
    const questionNo = Number(state.imageAttachForm.questionNo)
    const childNoText = String(state.imageAttachForm.childNo || '').trim()
    const childNo = childNoText ? Number(childNoText) : null
    const questionId = String(state.imageAttachForm.questionId || '').trim()
    const childQuestionId = String(state.imageAttachForm.childQuestionId || '').trim()
    const targetType = normalizeImageAttachTargetType(state.imageAttachForm.targetType)

    if (isExam) {
      if (!questionId) {
        state.imageAttachError = true
        state.imageAttachStatus = '试卷补图请填写 questionId'
        return
      }
    } else if (
      !Number.isInteger(chapterNo) ||
      chapterNo <= 0 ||
      !Number.isInteger(sectionNo) ||
      sectionNo <= 0 ||
      !Number.isInteger(questionNo) ||
      questionNo <= 0
    ) {
      state.imageAttachError = true
      state.imageAttachStatus = '章、小节、题号都必须是正整数'
      return
    }
    if (childNoText && (!Number.isInteger(childNo) || Number(childNo) <= 0)) {
      state.imageAttachError = true
      state.imageAttachStatus = '小题号必须是正整数，或者留空'
      return
    }

    state.imageAttachProcessing = true
    state.imageAttachError = false
    state.imageAttachStatus = '图片补充处理中...'
    state.imageAttachResult = null

    try {
      const formData = new FormData()
      appendManagedJsonFormData(formData, {
        workspaceId: state.currentWorkspaceId,
        jsonAssetId: state.chapterSessionJsonAssetId,
        jsonFilePath: state.chapterSessionServerJsonPath,
      })
      formData.append('sourceFileName', state.chapterSessionJsonLabel || '')
      if (isExam) {
        formData.append('questionId', questionId)
      } else {
        formData.append('chapterNo', String(chapterNo))
        formData.append('sectionNo', String(sectionNo))
        formData.append('questionNo', String(questionNo))
      }
      formData.append('targetType', targetType)
      if (childNoText) {
        formData.append('childNo', String(childNo))
      }
      if (childQuestionId) {
        formData.append('childQuestionId', childQuestionId)
      }
      for (const file of state.imageAttachFiles) {
        formData.append('images', file, file.name)
      }

      const resp = await fetch('/api/textbook-json/attach-images', {
        method: 'POST',
        body: formData,
      })
      const data = await parseApiResponse(resp)
      if (!resp.ok) {
        throw new Error(data.message || '图片补充失败')
      }

      state.imageAttachResult = {
        chapterTitle: String(data.chapterTitle || ''),
        sectionTitle: String(data.sectionTitle || ''),
        questionId: String(data.questionId || ''),
        childQuestionId: String(data.childQuestionId || ''),
        questionTitle: String(data.questionTitle || ''),
        targetType: String(data.targetType || targetType),
        targetLabel: String(data.targetLabel || ''),
        mediaCount: Number(data.mediaCount ?? 0),
        mediaItems: Array.isArray(data.mediaItems) ? data.mediaItems : [],
      }
      state.imageAttachStatus = '图片补充完成，已写入当前工作区'
    } catch (error) {
      state.imageAttachError = true
      state.imageAttachStatus = error instanceof Error ? error.message : '图片补充失败'
    } finally {
      state.imageAttachProcessing = false
    }
  }

  async function repairQuestionMathFormat() {
    if (!state.chapterSessionServerJsonPath) {
      state.mathFormatRepairError = true
      state.mathFormatRepairStatus = '请先选择 JSON 文件'
      return
    }

    const isExam = state.workingJsonDocumentType === 'exam'
    const chapterNo = Number(state.repairForm.chapterNo)
    const sectionNo = Number(state.repairForm.sectionNo)
    const questionNo = Number(state.repairForm.questionNo)
    const questionId = String(state.mathFormatRepairForm.questionId || state.repairForm.questionId || '').trim()

    const targetType = String(state.mathFormatRepairForm.targetType || '').trim()
    const requiresChildNo = targetType === 'childPrompt' || targetType === 'childStandardAnswer'
    const childNo = String(state.mathFormatRepairForm.childNo || '').trim()
    const childQuestionId = String(state.mathFormatRepairForm.childQuestionId || '').trim()
    if (!targetType) {
      state.mathFormatRepairError = true
      state.mathFormatRepairStatus = '请选择要修复的字段'
      return
    }
    if (isExam) {
      if (!questionId) {
        state.mathFormatRepairError = true
        state.mathFormatRepairStatus = '试卷公式修复请填写 questionId'
        return
      }
    } else if (
      !Number.isInteger(chapterNo) ||
      chapterNo <= 0 ||
      !Number.isInteger(sectionNo) ||
      sectionNo <= 0 ||
      !Number.isInteger(questionNo) ||
      questionNo <= 0
    ) {
      state.mathFormatRepairError = true
      state.mathFormatRepairStatus = '章、小节、题号都必须是正整数'
      return
    }
    if (requiresChildNo) {
      const numericChildNo = Number(childNo)
      if (!childQuestionId && (!Number.isInteger(numericChildNo) || numericChildNo <= 0)) {
        state.mathFormatRepairError = true
        state.mathFormatRepairStatus = '修复小题字段时，请填写 childQuestionId，或提供正整数小题号'
        return
      }
    }

    state.mathFormatRepairProcessing = true
    state.mathFormatRepairError = false
    state.mathFormatRepairStatus = '大模型公式修复处理中...'
    state.mathFormatRepairResult = null

    try {
      const resp = await fetch('/api/textbook-json/repair-math-format', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildManagedJsonBody({
          workspaceId: state.currentWorkspaceId,
          jsonAssetId: state.chapterSessionJsonAssetId,
          jsonFilePath: state.chapterSessionServerJsonPath,
        }, {
          sourceFileName: state.chapterSessionJsonLabel || '',
          questionId: isExam ? questionId : '',
          chapterNo: isExam ? null : chapterNo,
          sectionNo: isExam ? null : sectionNo,
          questionNo: isExam ? null : questionNo,
          targetType,
          childNo: requiresChildNo && !childQuestionId ? Number(childNo) : null,
          childQuestionId: requiresChildNo ? childQuestionId : '',
        })),
      })
      const data = await parseApiResponse(resp)
      if (!resp.ok) {
        throw new Error(data.message || '大模型公式修复失败')
      }

      state.mathFormatRepairResult = {
        chapterTitle: String(data.chapterTitle || ''),
        sectionTitle: String(data.sectionTitle || ''),
        questionId: String(data.questionId || ''),
        childQuestionId: String(data.childQuestionId || ''),
        questionTitle: String(data.questionTitle || ''),
        targetType: String(data.targetType || ''),
        childNo: data.childNo == null ? null : Number(data.childNo),
        targetLabel: String(data.targetLabel || ''),
        previousText: String(data.previousText || ''),
        repairedText: String(data.repairedText || ''),
        reason: String(data.reason || ''),
      }
      state.mathFormatRepairStatus = '公式修复完成，已写入当前工作区'
    } catch (error) {
      state.mathFormatRepairError = true
      state.mathFormatRepairStatus = error instanceof Error ? error.message : '大模型公式修复失败'
    } finally {
      state.mathFormatRepairProcessing = false
    }
  }

  function onChapterImageChange(event) {
    state.chapterImageFile = event.target.files?.[0] ?? null
  }

  function addChapterBatchTask() {
    state.chapterBatchTasks.push(createChapterBatchTask())
    state.chapterBatchError = false
    if (!state.chapterBatchStatus) {
      state.chapterBatchStatus = '已添加章节任务，请为每一章选择工作区槽位、填写起始章节并上传图片'
    }
  }

  function removeChapterBatchTask(taskId) {
    if (state.chapterBatchRunning) {
      return
    }
    const index = state.chapterBatchTasks.findIndex((item) => item?.id === taskId)
    if (index === -1) {
      return
    }
    state.chapterBatchTasks.splice(index, 1)
    if (!state.chapterBatchTasks.length) {
      state.chapterBatchError = false
      state.chapterBatchStatus = ''
    }
  }

  function setChapterBatchTaskSlot(taskId, slotRelativePath) {
    const task = findChapterBatchTask(taskId)
    if (!task) {
      return
    }

    const normalizedSlotPath = String(slotRelativePath || '').trim()
    if (!normalizedSlotPath) {
      task.workspaceId = String(state.currentWorkspaceId || '').trim()
      task.slotName = ''
      task.slotRelativePath = ''
      task.slotJsonFileName = ''
      task.slotJsonRelativePath = ''
      task.slotImageCount = 0
      task.error = false
      task.status = '请选择一个章节槽位'
      return
    }

    const slot = findMultiChapterSlot(normalizedSlotPath)
    if (!slot) {
      task.error = true
      task.status = `未找到槽位：${normalizedSlotPath}`
      return
    }

    applyMultiChapterSlotToTask(task, slot)
  }

  async function uploadChapterBatchTaskImages(taskId, event) {
    const task = findChapterBatchTask(taskId)
    const files = Array.from(event?.target?.files ?? [])
    if (event?.target) {
      event.target.value = ''
    }
    if (!task) {
      return
    }
    if (!files.length) {
      return
    }
    if (!String(task.slotRelativePath || '').trim()) {
      task.error = true
      task.status = '请先为这个任务选择工作区槽位，再上传图片'
      return
    }

    try {
      task.error = false
      task.status = `正在备份 ${files.length} 张图片到 ${task.slotRelativePath}...`
      const data = await requestMultiChapterSlotImagesUpload({
        workspaceId: task.workspaceId || state.currentWorkspaceId,
        slotRelativePath: task.slotRelativePath,
        files,
      })
      applyMultiChapterSlotToTask(task, data)
      await Promise.all([
        loadMultiChapterSlots({ workspaceId: task.workspaceId || state.currentWorkspaceId, silent: true }),
        refreshCurrentWorkspaceSummary({ silent: true }),
      ])
      task.error = false
      task.status = `已覆盖并备份 ${Number(data.imageCount || files.length)} 张图片到 ${task.slotRelativePath}`
    } catch (error) {
      task.error = true
      task.status = error instanceof Error ? error.message : '上传章节图片失败'
    }
  }

  async function runChapterBatchTask(task, processingProfile, chapterArkHeaders) {
    if (!task) {
      return
    }

    const abortController = new AbortController()
    chapterBatchAbortControllers.set(task.id, abortController)
    resetChapterBatchTaskRuntime(task)
    task.running = true
    task.totalCount = Number(task.slotImageCount || 0)
    task.phase = '初始化中'
    task.status = '初始化章节会话中...'

    const markStopped = (currentFileName = '') => {
      task.running = false
      task.stopped = true
      task.phase = '已手动停止'
      task.currentFileName = currentFileName || task.currentFileName || ''
      task.status = currentFileName ? `已手动停止，停在 ${currentFileName}` : '已手动停止'
    }

    let firstFailureMessage = ''

    try {
      const initData = await requestChapterSessionInit({
        workspaceId: task.workspaceId || state.currentWorkspaceId,
        slotRelativePath: task.slotRelativePath,
        currentChapterTitle: task.initChapter,
        currentSectionTitle: task.initSection,
      })
      task.sessionId = String(initData.sessionId || '')
      task.currentChapter = String(initData.currentChapterTitle || '')
      task.currentSection = String(initData.currentSectionTitle || '')
      task.phase = '会话已初始化'
      task.status = `初始化成功，chapters: ${initData.chaptersCount}，questions: ${initData.questionsCount || 0}`
      await requestChapterAutoRunStream({
        processingProfile,
        chapterArkHeaders,
        sessionId: task.sessionId,
        workspaceId: task.workspaceId || state.currentWorkspaceId,
        slotRelativePath: task.slotRelativePath,
        currentChapterTitle: task.currentChapter,
        currentSectionTitle: task.currentSection,
        signal: abortController.signal,
        onEvent: async (event) => {
          if (!event || typeof event !== 'object') {
            return
          }
          if (event.type === 'start') {
            task.totalCount = Number(event.totalCount || task.totalCount || 0)
            task.phase = '处理中'
            appendChapterBatchTaskLog(task, formatAutoProgressLine(event))
            return
          }
          if (event.type === 'progress') {
            task.currentIndex = Number(event.currentIndex || task.currentIndex || 0)
            task.currentFileName = String(event.fileName || task.currentFileName || '')
            task.phase = '处理中'
            task.status = formatAutoProgressLine(event)
            appendChapterBatchTaskLog(task, task.status)
            await nextTick()
            return
          }
          if (event.type === 'result') {
            task.currentIndex = Number(event.currentIndex || task.currentIndex || 0)
            task.currentFileName = String(event.fileName || task.currentFileName || '')
            if (event.status === 'success') {
              const question = event.question || {}
              task.successCount += 1
              task.completedCount = task.successCount + task.failedCount
              task.currentChapter = String(event.currentChapterTitle || task.currentChapter)
              task.currentSection = String(event.currentSectionTitle || task.currentSection)
              task.lastQuestion = buildQuestionSummary(question)
              task.lastPrefixCache = buildPrefixCacheSummary(event.prefixCacheExperiment)
              task.phase = question.pending ? '待下一页' : '本页已完成'
            } else {
              const errorMessage = String(event.error || '章节任务失败')
              if (!firstFailureMessage) {
                firstFailureMessage = errorMessage
              }
              task.failedCount += 1
              task.completedCount = task.successCount + task.failedCount
              task.phase = '本页失败'
              task.error = true
              if (isFatalAutoRunErrorMessage(errorMessage)) {
                task.phase = '处理中止'
              }
            }
            task.status = formatAutoProgressLine(event)
            appendChapterBatchTaskLog(task, task.status)
            return
          }
          if (event.type === 'done') {
            task.totalCount = Number(event.totalCount || task.totalCount || 0)
            task.successCount = Number(event.successCount || task.successCount || 0)
            task.failedCount = Number(event.failedCount || task.failedCount || 0)
            task.completedCount = task.successCount + task.failedCount
            task.currentChapter = String(event.currentChapterTitle || task.currentChapter)
            task.currentSection = String(event.currentSectionTitle || task.currentSection)
            appendChapterBatchTaskLog(task, formatAutoProgressLine(event))
          }
        },
      })

      task.running = false
      task.completed = true
      task.phase = task.failedCount ? '完成（含失败）' : '已完成'
      task.currentFileName = ''
      task.status =
        task.failedCount && firstFailureMessage
          ? `自动处理完成，成功 ${task.successCount} 张，失败 ${task.failedCount} 张。首个错误：${firstFailureMessage}`
          : `自动处理完成，成功 ${task.successCount} 张，失败 ${task.failedCount} 张`
    } catch (error) {
      if (state.chapterBatchStopping || isAbortRequestError(error) || abortController.signal.aborted) {
        markStopped(task.currentFileName || '')
        return
      }

      task.running = false
      task.error = true
      task.phase = '初始化失败'
      task.status = error instanceof Error ? error.message : '章节任务初始化失败'
    } finally {
      task.running = false
      chapterBatchAbortControllers.delete(task.id)
    }
  }

  async function runChapterBatch() {
    if (!ensureChapterArkApiKey()) {
      return
    }

    const configuredTasks = state.chapterBatchTasks.filter((task) => isChapterBatchTaskConfigured(task))
    if (!configuredTasks.length) {
      state.chapterBatchError = true
      state.chapterBatchStatus = '请先至少添加并配置一个章节任务'
      return
    }

    const invalidTask = configuredTasks.find((task) => !isChapterBatchTaskReady(task))
    if (invalidTask) {
      state.chapterBatchError = true
      state.chapterBatchStatus = `请先补全任务：${getChapterBatchTaskLabel(invalidTask)}。每一章都需要工作区槽位、当前章、当前小节和已备份图片`
      return
    }

    const processingProfile = getChapterProcessingProfile()
    const chapterArkHeaders = buildChapterArkHeaders()
    const concurrency = Math.min(normalizeChapterBatchConcurrency(state.chapterBatchConcurrency), configuredTasks.length)

    resetChapterBatchRuntimeState()
    setChapterBatchConcurrency(concurrency)
    state.chapterBatchRunning = true
    state.chapterBatchStopping = false
    state.chapterBatchError = false
    state.chapterBatchStatus = `多章并行处理中：${configuredTasks.length} 个任务，最大并发 ${concurrency}`

    let nextTaskIndex = 0

    const worker = async () => {
      while (!state.chapterBatchStopping) {
        const currentIndex = nextTaskIndex
        if (currentIndex >= configuredTasks.length) {
          return
        }
        nextTaskIndex += 1
        await runChapterBatchTask(configuredTasks[currentIndex], processingProfile, chapterArkHeaders)
      }
    }

    try {
      await Promise.all(Array.from({ length: concurrency }, () => worker()))
      const successTasks = configuredTasks.filter((task) => task.completed && !task.error && !task.stopped).length
      const failedTasks = configuredTasks.filter((task) => task.error).length
      const stoppedTasks = configuredTasks.filter((task) => task.stopped).length
      const completedTasks = configuredTasks.filter((task) => task.completed || task.stopped || task.error).length

      if (state.chapterBatchStopping) {
        state.chapterBatchError = false
        state.chapterBatchStatus = `多章并行已停止，已结束 ${completedTasks}/${configuredTasks.length} 个任务`
      } else if (failedTasks > 0) {
        state.chapterBatchError = true
        state.chapterBatchStatus = `多章并行完成：成功 ${successTasks} 个任务，失败 ${failedTasks} 个任务`
      } else {
        state.chapterBatchError = false
        state.chapterBatchStatus = `多章并行完成：${successTasks} 个任务全部处理完成`
      }

      if (stoppedTasks > 0 && !state.chapterBatchStopping) {
        state.chapterBatchStatus = `${state.chapterBatchStatus}，另有 ${stoppedTasks} 个任务被停止`
      }
    } catch (error) {
      state.chapterBatchError = true
      state.chapterBatchStatus = error instanceof Error ? error.message : '多章并行处理失败'
    } finally {
      state.chapterBatchRunning = false
      state.chapterBatchStopping = false
      chapterBatchAbortControllers.clear()
    }
  }

  function stopChapterBatch() {
    if (!state.chapterBatchRunning || state.chapterBatchStopping) {
      return
    }
    state.chapterBatchStopping = true
    state.chapterBatchError = false
    state.chapterBatchStatus = '正在请求停止多章并行处理...'
    for (const controller of chapterBatchAbortControllers.values()) {
      controller.abort()
    }
  }

  function resetChapterBatch() {
    if (state.chapterBatchRunning) {
      return
    }
    resetChapterBatchRuntimeState()
  }

  function onFileChange(event) {
    const files = Array.from(event?.target?.files ?? [])
    if (event?.target) {
      event.target.value = ''
    }

    const pdfFiles = files.filter((file) => /\.pdf$/i.test(file.name || ''))
    const skippedCount = files.length - pdfFiles.length
    state.selectedPdfFiles = pdfFiles.map((file) => createSelectedPdfEntry(file))
    resetPdfWorkspace()

    if (state.selectedPdfFiles.length) {
      state.isError = false
      state.statusText = skippedCount
        ? `已选择 ${state.selectedPdfFiles.length} 个 PDF，已忽略 ${skippedCount} 个非 PDF 文件`
        : `已选择 ${state.selectedPdfFiles.length} 个 PDF，可按下方顺序连续生成页图`
      return
    }

    state.isError = skippedCount > 0
    state.statusText = skippedCount ? '仅支持 PDF 文件' : '请选择一个或多个 PDF 文件'
  }

  function moveSelectedPdf(index, offset) {
    const nextIndex = index + offset
    if (
      index < 0 ||
      index >= state.selectedPdfFiles.length ||
      nextIndex < 0 ||
      nextIndex >= state.selectedPdfFiles.length
    ) {
      return
    }

    const items = [...state.selectedPdfFiles]
    const [current] = items.splice(index, 1)
    items.splice(nextIndex, 0, current)
    state.selectedPdfFiles = items
    state.isError = false
    state.statusText = `已调整 PDF 顺序，当前共 ${state.selectedPdfFiles.length} 个文件`
  }

  function removeSelectedPdf(index) {
    if (index < 0 || index >= state.selectedPdfFiles.length) {
      return
    }

    state.selectedPdfFiles = state.selectedPdfFiles.filter((_, currentIndex) => currentIndex !== index)
    resetPdfWorkspace()
    state.isError = false
    state.statusText = state.selectedPdfFiles.length
      ? `已移除 1 个 PDF，当前剩余 ${state.selectedPdfFiles.length} 个`
      : '已清空待转换 PDF 列表'
  }

  function clearSelectedPdfs() {
    state.selectedPdfFiles = []
    resetPdfWorkspace()
    state.isError = false
    state.statusText = '已清空待转换 PDF 列表'
  }

  async function uploadPdf() {
    if (!state.selectedPdfFiles.length) {
      state.isError = true
      state.statusText = '请先选择至少一个 PDF 文件'
      return
    }
    if (!state.folderName) {
      state.isError = true
      state.statusText = '请先输入文件夹名'
      return
    }

    state.loading = true
    state.isError = false
    state.statusText = '上传并转换中...'

    try {
      const workspaceId = requireCurrentWorkspace('请先在工作区页面手动创建并选定一个工作区，再上传 PDF')
      const formData = new FormData()
      formData.append('folderName', state.folderName)
      formData.append('workspaceId', workspaceId)
      state.selectedPdfFiles.forEach((item, index) => {
        formData.append(`pdf_${index}`, item.file, item.file.name)
      })

      const resp = await fetch('/api/convert', {
        method: 'POST',
        body: formData,
      })

      const data = await parseApiResponse(resp)
      if (!resp.ok) {
        throw new Error(data.message || '转换失败')
      }

      state.batchId = data.batchId || ''
      state.currentWorkspaceId = String(data.workspaceId || state.currentWorkspaceId || '')
      state.outputFolder = data.folderName || state.folderName
      state.pages = Array.isArray(data.pages) ? data.pages : []
      state.statusText = `转换完成，按当前顺序合并了 ${data.pdfCount || state.selectedPdfFiles.length} 个 PDF，共 ${state.pages.length} 页`
    } catch (error) {
      state.isError = true
      state.statusText = error instanceof Error ? error.message : '转换失败'
    } finally {
      state.loading = false
    }
  }

  const examSessionFlow = createExamSessionFlow({
    state,
    getPayloadSourceMeta,
    readWorkspaceJsonText,
    buildManagedJsonBody,
    parseApiResponse,
    buildChapterArkHeaders,
    ensureChapterArkApiKey,
    resetExamAutoRuntimeState,
    buildQuestionSummary,
    buildExamStructureLabel,
    appendExamAutoLog,
    isAbortRequestError,
    syncExamWorkingJsonToLocalFile,
    pickImageFolderFromPicker,
  })

  const chapterSessionFlow = createChapterSessionFlow({
    state,
    nextTick,
    parseApiResponse,
    buildManagedJsonBody,
    buildChapterArkHeaders,
    ensureChapterArkApiKey,
    getChapterProcessingProfile,
    resetChapterAutoRuntimeState,
    buildQuestionSummary,
    buildPrefixCacheSummary,
    createAutoEntry,
    formatAutoProgressLine,
    appendChapterAutoLog,
    isAbortRequestError,
    isFatalAutoRunErrorMessage,
    syncWorkingJsonToLocalFile,
    pickImageFolderFromPicker,
  })

  const actions = {
    addExamSectionTask,
    addChapterBatchTask,
    addChapterManualChapter,
    addChapterManualSection,
    appendExamSectionFromImages,
    appendExamSectionFromLibrary,
    chooseAutoImageFolder: chapterSessionFlow.chooseAutoImageFolder,
    chooseExamAutoImageFolder: examSessionFlow.chooseExamAutoImageFolder,
    chooseExamJsonSessionFile,
    chooseJsonSessionFile,
    onDbImportFilesChange,
    removeDbImportFile,
    clearDbImportFiles,
    clearCurrentWorkspaceSummary,
    clearWorkspaceBrowser,
    loadQuestionBankDbSummary,
    loadWorkspaceList,
    loadMultiChapterSlots,
    cleanupCurrentWorkspaceDerivedFiles,
    importQuestionBankDbJsonFiles,
    createWorkspace: createWorkspaceAction,
    createMultiChapterSlotsFromTextbookForm,
    deleteCurrentWorkspace,
    deleteWorkspaceById,
    fillAssistantPrompt,
    clearQuestionBankAssistantChat,
    clearChapterManualSectionImages,
    clearExamSectionImages,
    confirmExamSection,
    downloadCurrentExamJson,
    downloadCurrentWorkspaceUploads,
    downloadWorkspaceBrowserEntry,
    downloadCurrentVisualizerJson,
    downloadCurrentWorkingJson,
    browseCurrentWorkspace,
    browseVisualizerWorkspace,
    openWorkspaceBrowserEntry,
    refreshCurrentWorkspaceSummary,
    sendQuestionBankAssistantMessage,
    finalizeExamSections,
    generateExamJson,
    generateTextbookJson,
    saveExamJson,
    saveTextbookJson,
    initExamSession: examSessionFlow.initExamSession,
    initChapterSession: chapterSessionFlow.initChapterSession,
    onVisualizerJsonFileChange,
    onVisualizerBundleFolderChange,
    importVisualizerBundle,
    clearVisualizerWorkspaceJsonFile,
    switchVisualizerWorkspace,
    useCurrentVisualizerWorkspacePathForVisualizer,
    useCurrentWorkspaceBrowserPathForVisualizer,
    useDefaultWorkspaceUploadsForVisualizer,
    clearVisualizerWorkspaceFolder,
    onVisualizerRepairImageChange,
    clearVisualizerRepairImages,
    removeVisualizerRepairImage,
    attachImagesFromVisualizer,
    generateAnswerFromVisualizer,
    repairQuestionFromVisualizer,
    repairMathFormatFromVisualizer,
    updateQuestionTypeFromVisualizer,
    setMergeSourceMode,
    onMergeJsonFilesChange,
    toggleMergeWorkspaceSlot,
    removeMergeJsonFile,
    clearMergeJsonFiles,
    clearMergeWorkspaceSlotSelections,
    mergeJsonFiles,
    loadExamQuestionTypeOptions,
    onImageAttachFilesChange,
    onImageAttachPaste,
    onChapterManualSectionImagesChange,
    onExamAutoFilesChange: examSessionFlow.onExamAutoFilesChange,
    onExamSectionImagesChange,
    clearExamAutoFiles: examSessionFlow.clearExamAutoFiles,
    clearImageAttachFiles,
    removeImageAttachFile,
    attachImagesToQuestionJson,
    onRepairImageChange,
    repairQuestionInJson,
    repairQuestionMathFormat,
    onChapterImageChange,
    onExamImageChange,
    removeChapterBatchTask,
    removeChapterManualChapter,
    removeChapterManualSection,
    removeExamSectionTask,
    removeExamSectionQuestion,
    processExamImage: examSessionFlow.processExamImage,
    reopenExamSection,
    resetChapterBatch,
    resetChapterManualBatch,
    resetExamAuto: examSessionFlow.resetExamAuto,
    runChapterBatch,
    runChapterManualBatch,
    runExamAuto: examSessionFlow.runExamAuto,
    searchExamSectionLibrary,
    setChapterBatchConcurrency,
    setChapterBatchTaskSlot,
    setChapterProcessingMode,
    setChapterRunMode,
    setChapterSingleMode,
    processChapterImage: chapterSessionFlow.processChapterImage,
    runChapterAuto: chapterSessionFlow.runChapterAuto,
    stopExamAuto: examSessionFlow.stopExamAuto,
    stopChapterBatch,
    stopChapterManualBatch,
    stopChapterAuto: chapterSessionFlow.stopChapterAuto,
    switchCurrentWorkspace,
    uploadChapterBatchTaskImages,
    resetChapterAuto: chapterSessionFlow.resetChapterAuto,
    moveExamSectionQuestion,
    toggleExamSectionRecord,
    onFileChange,
    moveSelectedPdf,
    removeSelectedPdf,
    clearSelectedPdfs,
    uploadPdf,
  }

  void loadExamQuestionTypeOptions()

  return {
    state,
    actions,
  }
}
