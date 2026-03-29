import { nextTick, reactive } from 'vue'

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
    workspaceSummaryLoading: false,
    workspaceSummaryStatus: '',
    workspaceSummaryError: false,
    workspaceSummary: null,
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
    },
    imageAttachFiles: [],
    imageAttachProcessing: false,
    imageAttachStatus: '',
    imageAttachError: false,
    imageAttachResult: null,
    visualizerFileName: '',
    visualizerFileHandle: null,
    visualizerServerJsonPath: '',
    visualizerJsonAssetId: '',
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
    visualizerQuestionTypeProcessing: false,
    visualizerRepairImageFiles: [],
    visualizerRewriteResult: null,
    mergeJsonFiles: [],
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
  let chapterAutoAbortController = null
  let chapterManualAbortController = null
  let examAutoAbortController = null
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
      jsonLabel: '',
      serverJsonPath: '',
      jsonAssetId: '',
      workspaceId: '',
      jsonHandle: null,
      initChapter: '',
      initSection: '',
      imageFiles: [],
      folderLabel: '',
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

  function getChapterBatchTaskLabel(task) {
    return (
      String(task?.jsonLabel || '').trim() ||
      String(task?.folderLabel || '').trim() ||
      [String(task?.initChapter || '').trim(), String(task?.initSection || '').trim()].filter(Boolean).join(' / ') ||
      '未命名章节任务'
    )
  }

  function findChapterBatchTask(taskId) {
    return state.chapterBatchTasks.find((item) => item?.id === taskId) || null
  }

  function isChapterBatchTaskConfigured(task) {
    if (!task || typeof task !== 'object') {
      return false
    }
    return Boolean(
      String(task.jsonLabel || '').trim() ||
        String(task.serverJsonPath || '').trim() ||
        String(task.initChapter || '').trim() ||
        String(task.initSection || '').trim() ||
        (Array.isArray(task.imageFiles) && task.imageFiles.length),
    )
  }

  function isChapterBatchTaskReady(task) {
    if (!task || typeof task !== 'object') {
      return false
    }
    return Boolean(
      String(task.serverJsonPath || '').trim() &&
        String(task.initChapter || '').trim() &&
        String(task.initSection || '').trim() &&
        Array.isArray(task.imageFiles) &&
        task.imageFiles.length,
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
      return 'code'
    }
    return upper
  }

  function applyWorkingJsonMeta(payload) {
    const meta = getPayloadSourceMeta(payload || {})
    state.workingJsonDocumentType = meta.documentType
    state.workingJsonExamType = meta.examType || ''
    state.workingJsonHasAnswer = typeof meta.hasAnswer === 'boolean' ? meta.hasAnswer : null
    if (meta.documentType === 'exam') {
      applyExamSourceMeta(meta)
    }
  }

  function applyExamSourceMeta(meta) {
    if (!meta || typeof meta !== 'object') {
      return
    }
    state.examSessionTitle = String(meta.title || '').trim()
    state.examSessionExamType = String(meta.examType || '').trim() || 'midterm'
    state.examSessionHasAnswer = meta.hasAnswer !== false
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

  function resetCurrentWorkspaceBindings() {
    state.currentWorkspaceId = ''
    clearCurrentWorkspaceSummary()

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

    state.visualizerFileName = ''
    state.visualizerFileHandle = null
    state.visualizerServerJsonPath = ''
    state.visualizerJsonAssetId = ''
    state.visualizerPayload = null
    state.visualizerUploadsStatus = ''
    state.visualizerUploadsError = false
    state.visualizerRepairStatus = ''
    state.visualizerRepairError = false
    state.visualizerAnswerStatus = ''
    state.visualizerAnswerError = false
    state.visualizerRewriteResult = null
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
    task.totalCount = Array.isArray(task.imageFiles) ? task.imageFiles.length : 0
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

  async function loadVisualizerJsonFile(file, fileHandle = null) {
    if (!file) {
      return
    }

    state.visualizerError = false
    state.visualizerStatus = '解析 JSON 中...'
    state.visualizerAnswerProcessing = false
    state.visualizerAnswerStatus = ''
    state.visualizerAnswerError = false
    state.visualizerUploadsProcessing = false
    state.visualizerUploadsStatus = ''
    state.visualizerUploadsError = false
    state.visualizerRepairError = false
    state.visualizerRepairStatus = ''
    state.visualizerQuestionTypeProcessing = false
    state.visualizerRepairImageFiles = []
    state.visualizerRewriteResult = null

    try {
      const text = await fileToText(file)
      const parsed = JSON.parse(text)
      const chapters = Array.isArray(parsed?.chapters) ? parsed.chapters : null
      const questions = Array.isArray(parsed?.questions) ? parsed.questions : null
      const sourceMeta = getPayloadSourceMeta(parsed)

      if (!chapters || !questions) {
        throw new Error('当前文件不是支持的题库 JSON，缺少 chapters 或 questions 数组')
      }

      const imported = await uploadJsonFileToWorkspace(file, {
        workspaceId: state.currentWorkspaceId,
      })
      state.visualizerPayload = parsed
      state.visualizerFileName = file.name
      state.visualizerFileHandle = fileHandle
      state.visualizerServerJsonPath = String(imported.workspaceFilePath || imported.filePath || '')
      state.visualizerJsonAssetId = String(imported.jsonAssetId || '')
      state.currentWorkspaceId = String(imported.workspaceId || state.currentWorkspaceId || '')
      state.visualizerStatus = `已加载 ${file.name}（${sourceMeta.documentType === 'exam' ? '试卷' : '教材'}），共 ${chapters.length} 个结构节点，${questions.length} 道题`
    } catch (error) {
      state.visualizerError = true
      state.visualizerPayload = null
      state.visualizerFileName = ''
      state.visualizerFileHandle = null
      state.visualizerServerJsonPath = ''
      state.visualizerJsonAssetId = ''
      state.visualizerAnswerProcessing = false
      state.visualizerAnswerStatus = ''
      state.visualizerAnswerError = false
      state.visualizerUploadsProcessing = false
      state.visualizerUploadsStatus = ''
      state.visualizerUploadsError = false
      state.visualizerQuestionTypeProcessing = false
      state.visualizerRepairImageFiles = []
      state.visualizerRewriteResult = null
      state.visualizerStatus = error instanceof Error ? error.message : '解析 JSON 失败'
    }
  }

  async function onVisualizerJsonChange(event) {
    const file = event?.target?.files?.[0] ?? null
    if (event?.target) {
      event.target.value = ''
    }
    await loadVisualizerJsonFile(file, null)
  }

  async function chooseVisualizerJsonFile() {
    if (!supportsPicker('showOpenFilePicker')) {
      state.visualizerError = true
      state.visualizerStatus = '当前浏览器不支持文件选择器，请改用下方文件上传'
      return
    }

    try {
      const [handle] = await window.showOpenFilePicker({
        excludeAcceptAllOption: true,
        multiple: false,
        types: [
          {
            description: '题库 JSON',
            accept: {
              'application/json': ['.json'],
            },
          },
        ],
      })
      const file = await handle.getFile()
      await loadVisualizerJsonFile(file, handle)
    } catch (error) {
      if (error?.name === 'AbortError') {
        return
      }
      state.visualizerError = true
      state.visualizerStatus = error instanceof Error ? error.message : '选择可视化 JSON 失败'
    }
  }

  async function reloadVisualizerJsonFile() {
    if (!state.visualizerFileHandle) {
      state.visualizerError = true
      state.visualizerStatus = '当前文件没有可重读句柄，请重新选择一次 JSON 文件'
      return
    }

    state.visualizerError = false
    state.visualizerStatus = `重新读取 ${state.visualizerFileName || '当前文件'} 中...`

    try {
      const file = await state.visualizerFileHandle.getFile()
      await loadVisualizerJsonFile(file, state.visualizerFileHandle)
      state.visualizerStatus = `已重新读取 ${file.name}，当前内容已刷新`
    } catch (error) {
      state.visualizerError = true
      state.visualizerStatus = error instanceof Error ? error.message : '重新读取当前文件失败'
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
      workspaceId: state.currentWorkspaceId,
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
    } = params || {}
    const payload = state.visualizerPayload
    const questions = Array.isArray(payload?.questions) ? payload.questions : []
    const question = questions.find((item) => item && item.questionId === questionId)
    if (!question || typeof question !== 'object') {
      return false
    }

    const normalizedMediaItems = Array.isArray(mediaItems) ? mediaItems : []
    const children = Array.isArray(question.children) ? question.children : []
    const child =
      children.find((item) => String(item?.questionId || '').trim() === String(childQuestionId || '').trim()) ||
      children.find((item) => Number(item?.orderNo) === Number(childNo)) ||
      children.find((item) => typeof item?.questionId === 'string' && item.questionId.endsWith(`_${childNo}`))

    if (child && typeof child === 'object') {
      if (child.prompt && typeof child.prompt === 'object') {
        child.prompt.media = normalizedMediaItems
      } else {
        child.prompt = {
          text: typeof child.prompt === 'string' ? child.prompt : String(child.prompt?.text || ''),
          media: normalizedMediaItems,
        }
      }
      return true
    }

    const targetField = String(question.nodeType || '').toUpperCase() === 'GROUP' ? 'stem' : 'prompt'
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
      state.visualizerRepairStatus = '当前可视化文件尚未同步到修复工作区，请重新选择一次 JSON 文件'
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
          workspaceId: state.currentWorkspaceId,
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
      state.visualizerRepairStatus = `已修复 ${blockLabel || data.targetLabel || targetType}`
    } catch (error) {
      state.visualizerRepairError = true
      state.visualizerRepairStatus = error instanceof Error ? error.message : '公式修复失败'
    } finally {
      state.visualizerRepairProcessing = false
    }
  }

  function onVisualizerRepairImageChange(event) {
    state.visualizerRepairImageFiles = Array.from(event?.target?.files ?? [])
    state.visualizerRepairError = false
    state.visualizerRewriteResult = null
    if (event?.target) {
      event.target.value = ''
    }
  }

  function clearVisualizerRepairImages() {
    state.visualizerRepairImageFiles = []
  }

  async function importVisualizerUploadsFolder(files) {
    if (!state.visualizerServerJsonPath) {
      state.visualizerUploadsError = true
      state.visualizerUploadsStatus = '请先加载一个 JSON，再上传本地 uploads 文件夹'
      return
    }
    if (!Array.isArray(files) || !files.length) {
      state.visualizerUploadsError = true
      state.visualizerUploadsStatus = '请选择 uploads 文件夹中的图片文件'
      return
    }

    state.visualizerUploadsProcessing = true
    state.visualizerUploadsError = false
    state.visualizerUploadsStatus = `正在上传 uploads 文件夹，共 ${files.length} 个文件...`

    try {
      const formData = new FormData()
      appendManagedJsonFormData(formData, {
        workspaceId: state.currentWorkspaceId,
        jsonAssetId: state.visualizerJsonAssetId,
        jsonFilePath: state.visualizerServerJsonPath,
      })

      for (const file of files) {
        formData.append('files', file, file.name)
        formData.append('relativePaths', String(file.webkitRelativePath || file.name || ''))
      }

      const resp = await fetch('/api/textbook-json/import-uploads', {
        method: 'POST',
        body: formData,
      })
      const data = await parseApiResponse(resp)
      if (!resp.ok) {
        throw new Error(data.message || '上传 uploads 文件夹失败')
      }

      let syncWarning = ''
      try {
        await refreshVisualizerPayloadFromWorkspace({
          cacheToken: Date.now(),
        })
        await syncVisualizerJsonToLocalFile()
      } catch (syncError) {
        syncWarning = syncError instanceof Error ? syncError.message : '工作区 JSON 刷新失败'
      }

      const importedCount = Number(data.importedCount ?? files.length)
      const rewrittenCount = Number(data.rewrittenCount ?? 0)
      const matchedCount = Number(data.matchedCount ?? 0)
      state.visualizerUploadsStatus = syncWarning
        ? `已上传 ${importedCount} 个文件，匹配 ${matchedCount} 个图片引用，改写 ${rewrittenCount} 个地址，但本地同步失败：${syncWarning}`
        : `已上传 ${importedCount} 个文件，匹配 ${matchedCount} 个图片引用，改写 ${rewrittenCount} 个地址`
    } catch (error) {
      state.visualizerUploadsError = true
      state.visualizerUploadsStatus = error instanceof Error ? error.message : '上传 uploads 文件夹失败'
    } finally {
      state.visualizerUploadsProcessing = false
    }
  }

  async function onVisualizerUploadsFolderChange(event) {
    const files = Array.from(event?.target?.files ?? [])
    if (event?.target) {
      event.target.value = ''
    }
    await importVisualizerUploadsFolder(files)
  }

  async function attachImagesFromVisualizer(params) {
    const questionId = String(params?.questionId || '').trim()
    const questionTitle = String(params?.questionTitle || '').trim()
    const childQuestionId = String(params?.childQuestionId || '').trim()
    const childNoRaw = params?.childNo
    const childNo =
      childNoRaw === '' || childNoRaw === null || childNoRaw === undefined ? null : Number(childNoRaw)
    const blockLabel = String(params?.blockLabel || '').trim()

    if (!state.visualizerServerJsonPath) {
      state.visualizerRepairError = true
      state.visualizerRepairStatus = '当前可视化文件尚未同步到修复工作区，请重新选择一次 JSON 文件'
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
        workspaceId: state.currentWorkspaceId,
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
      })
      state.visualizerRepairImageFiles = []

      let syncWarning = ''
      try {
        await syncVisualizerJsonToLocalFile()
      } catch (syncError) {
        syncWarning = syncError instanceof Error ? syncError.message : '回写本地文件失败'
      }
      state.visualizerRepairStatus = syncWarning
        ? `已为 ${blockLabel || questionTitle || questionId} 补图，但回写本地文件失败：${syncWarning}`
        : `已为 ${blockLabel || questionTitle || questionId} 补充 ${Number(data.mediaCount ?? 0)} 张图片`
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
      state.visualizerRepairStatus = '当前可视化文件尚未同步到修复工作区，请重新选择一次 JSON 文件'
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
          workspaceId: state.currentWorkspaceId,
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

      let syncWarning = ''
      try {
        await syncVisualizerJsonToLocalFile()
      } catch (syncError) {
        syncWarning = syncError instanceof Error ? syncError.message : '回写本地文件失败'
      }
      state.visualizerRepairStatus = syncWarning
        ? `已更新 ${blockLabel || questionTitle || questionId} 的题型，但回写本地文件失败：${syncWarning}`
        : `已更新 ${blockLabel || questionTitle || questionId} 的题型为 ${String(data.questionTypeLabel || data.questionType || questionType)}`
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

    if (!state.visualizerServerJsonPath) {
      state.visualizerAnswerError = true
      state.visualizerAnswerStatus = '当前可视化文件尚未同步到修复工作区，请重新选择一次 JSON 文件'
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
      const resp = await fetch('/api/textbook-json/generate-answer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...buildVisualizerArkHeaders(),
        },
        body: JSON.stringify(buildManagedJsonBody({
          workspaceId: state.currentWorkspaceId,
          jsonAssetId: state.visualizerJsonAssetId,
          jsonFilePath: state.visualizerServerJsonPath,
        }, {
          sourceFileName: state.visualizerFileName || '',
          questionId,
          childQuestionId,
          childNo,
          answerPrompt: String(state.visualizerAnswerPrompt || '').trim(),
        })),
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

      let syncWarning = ''
      try {
        await syncVisualizerJsonToLocalFile()
      } catch (syncError) {
        syncWarning = syncError instanceof Error ? syncError.message : '回写本地文件失败'
      }
      state.visualizerAnswerStatus = syncWarning
        ? `已为 ${blockLabel || questionTitle || questionId} 生成答案，但回写本地文件失败：${syncWarning}`
        : `已为 ${blockLabel || questionTitle || questionId} 生成答案，并已写回当前 JSON`
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

    if (!state.visualizerServerJsonPath) {
      state.visualizerRepairError = true
      state.visualizerRepairStatus = '当前可视化文件尚未同步到修复工作区，请重新选择一次 JSON 文件'
      return
    }
    if (!state.visualizerRepairImageFiles.length) {
      state.visualizerRepairError = true
      state.visualizerRepairStatus = '请先上传用于重写当前题目的图片'
      return
    }

    state.visualizerRepairProcessing = true
    state.visualizerRepairError = false
    state.visualizerRepairStatus = `正在根据图片重写 ${questionTitle || questionId}...`
    state.visualizerRewriteResult = null

    try {
      const formData = new FormData()
      appendManagedJsonFormData(formData, {
        workspaceId: state.currentWorkspaceId,
        jsonAssetId: state.visualizerJsonAssetId,
        jsonFilePath: state.visualizerServerJsonPath,
      })
      formData.append('sourceFileName', state.visualizerFileName || '')
      formData.append('questionId', questionId)
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
        throw new Error(data.message || '当前题目重写失败')
      }

      upsertQuestionInVisualizerPayload(data.question)
      state.visualizerRewriteResult = {
        repairJsonPath: String(data.repairJsonPath || ''),
        repairJsonFileName: String(data.repairJsonFileName || ''),
        chapterTitle: String(data.chapterTitle || ''),
        sectionTitle: String(data.sectionTitle || ''),
        questionId: String(data.questionId || questionId),
        questionTitle: String(data.questionTitle || questionTitle || questionId),
        action: String(data.action || ''),
        insertIndex: Number(data.insertIndex ?? -1),
        questionsCount: Number(data.questionsCount ?? 0),
        imageCount: Number(data.imageCount ?? state.visualizerRepairImageFiles.length),
        reason: String(data.reason || ''),
      }
      state.visualizerRepairImageFiles = []

      let syncWarning = ''
      try {
        await syncVisualizerJsonToLocalFile()
      } catch (syncError) {
        syncWarning = syncError instanceof Error ? syncError.message : '回写本地文件失败'
      }
      state.visualizerRepairStatus = syncWarning
        ? `已按图片重写 ${state.visualizerRewriteResult.questionTitle}，但回写本地文件失败：${syncWarning}`
        : `已按图片重写 ${state.visualizerRewriteResult.questionTitle}`
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
      continueQuestionKey: safeQuestion.continueQuestionKey || '',
      nextStartQuestionKey: safeQuestion.nextStartQuestionKey || '',
      boundaryNeedNextPage: safeQuestion.boundaryNeedNextPage === true,
      boundaryHasExtractableQuestions: safeQuestion.boundaryHasExtractableQuestions === true,
      boundaryContinueQuestionKey: safeQuestion.boundaryContinueQuestionKey || '',
      boundaryLookaheadLabel: safeQuestion.boundaryLookaheadLabel || '',
      boundaryLookaheadReason: safeQuestion.boundaryLookaheadReason || '',
      pendingReviewCount: Number(safeQuestion.pendingReviewCount ?? 0),
      droppedPendingQuestionCount: Number(safeQuestion.droppedPendingQuestionCount ?? 0),
      extractReturnedCount: Number(safeQuestion.extractReturnedCount ?? 0),
      normalizedCount: Number(safeQuestion.normalizedCount ?? 0),
      questionsCount: totalQuestions ?? safeQuestion.questionsCount ?? null,
      sessionStoredProcessingStartQuestionKey: safeQuestion.sessionStoredProcessingStartQuestionKey || '',
      sessionStoredPendingContinueQuestionKey: safeQuestion.sessionStoredPendingContinueQuestionKey || '',
      effectiveProcessingStartQuestionKey: safeQuestion.effectiveProcessingStartQuestionKey || '',
      effectiveExtractEndBeforeQuestionKey: safeQuestion.effectiveExtractEndBeforeQuestionKey || '',
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
      const debugParts = [
        `边界可提取: ${question.boundaryHasExtractableQuestions === true ? 'true' : 'false'}`,
        `边界needNextPage: ${question.boundaryNeedNextPage === true ? 'true' : 'false'}`,
        `边界续题: ${question.boundaryContinueQuestionKey || '空'}`,
        question.boundaryLookaheadLabel ? `边界预读页: ${question.boundaryLookaheadLabel}` : '',
        question.boundaryLookaheadReason ? `边界预读原因: ${question.boundaryLookaheadReason}` : '',
        question.boundaryReason ? `边界原因: ${question.boundaryReason}` : '',
        question.extractReason ? `提取原因: ${question.extractReason}` : '',
        question.retryExtractReason ? `提取重试原因: ${question.retryExtractReason}` : '',
        question.integrityRetryReason ? `完整性重提原因: ${question.integrityRetryReason}` : '',
        question.rangeRetryReason ? `范围重提原因: ${question.rangeRetryReason}` : '',
        `提取返回题数: ${question.extractReturnedCount ?? 0}`,
        `归一化后题数: ${question.normalizedCount ?? 0}`,
        `session起点原值: ${question.sessionStoredProcessingStartQuestionKey || '空'}`,
        `session续题原值: ${question.sessionStoredPendingContinueQuestionKey || '空'}`,
        `实收起点: ${question.effectiveProcessingStartQuestionKey || '空'}`,
        `实收截止: ${question.effectiveExtractEndBeforeQuestionKey || '空'}`,
        `实收模式: ${question.effectiveExtractMode || '空'}`,
        `待校对重提: ${question.pendingReviewFixRetried === true ? 'true' : 'false'}`,
        `完整性重提: ${question.integrityFixRetried === true ? 'true' : 'false'}`,
        `范围重提: ${question.rangeFixRetried === true ? 'true' : 'false'}`,
        `范围拦截: ${question.rangeMismatchBlocked === true ? 'true' : 'false'}`,
        `普通重提: ${question.retried === true ? 'true' : 'false'}`,
        `截掉题数: ${question.droppedPendingQuestionCount ?? 0}`,
        question.reason ? `原因: ${question.reason}` : '',
      ].filter(Boolean).join(' | ')
      const pendingText = question.pending
        ? `跨页处理中，处理起点: ${question.processingStartQuestionKey || '空'}，更新后起点: ${question.nextStartQuestionKey || '空'}，续题: ${question.continueQuestionKey || '空'}，队列页数: ${question.pendingPagesCount ?? '?'}${queueText}`
        : `已入库，新增题目 ${question.upsertedCount ?? 0}，更新后起点: ${question.nextStartQuestionKey || '空'}`
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
    const formData = new FormData()
    formData.append('json', file, file.name)
    if (options?.workspaceId) {
      formData.append('workspaceId', String(options.workspaceId))
    }
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

  function parseDownloadFileName(resp, fallbackName = 'main.json') {
    const disposition = String(resp.headers.get('content-disposition') || '').trim()
    const encodedMatch = disposition.match(/filename="?([^"]+)"?/i)
    if (!encodedMatch?.[1]) {
      return normalizeJsonDownloadName(fallbackName)
    }
    try {
      return normalizeJsonDownloadName(decodeURIComponent(encodedMatch[1]), fallbackName)
    } catch (_error) {
      return normalizeJsonDownloadName(encodedMatch[1], fallbackName)
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
    triggerJsonDownload(parseDownloadFileName(resp, suggestedName), text)
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
        body: JSON.stringify({
          keepRepairSnapshots: 10,
        }),
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

    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(`确认删除当前工作区 ${workspaceId} 吗？这会删除服务器上的 JSON、PDF、页图和中间产物。`)
      if (!confirmed) {
        return
      }
    }

    state.workspaceDeleteRunning = true
    state.workspaceSummaryError = false
    state.workspaceSummaryStatus = '正在删除当前工作区...'

    try {
      const resp = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}`, {
        method: 'DELETE',
      })
      const data = await parseApiResponse(resp)
      if (!resp.ok) {
        throw new Error(data.message || '删除当前工作区失败')
      }
      resetCurrentWorkspaceBindings()
      state.workspaceSummaryStatus = `已删除工作区 ${workspaceId}`
    } catch (error) {
      state.workspaceSummaryError = true
      state.workspaceSummaryStatus = error instanceof Error ? error.message : '删除当前工作区失败'
    } finally {
      state.workspaceDeleteRunning = false
    }
  }

  async function syncJsonHandleFromWorkspace(ref, fileHandle) {
    const managedRef = normalizeManagedJsonRef(ref)
    if ((!managedRef.jsonFilePath && !managedRef.jsonAssetId) || !fileHandle) {
      return
    }

    const text = await readWorkspaceJsonText(managedRef)
    const writable = await fileHandle.createWritable()
    await writable.write(text)
    await writable.close()
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

  async function syncVisualizerJsonToLocalFile() {
    await syncJsonHandleFromWorkspace({
      workspaceId: state.currentWorkspaceId,
      jsonAssetId: state.visualizerJsonAssetId,
      jsonFilePath: state.visualizerServerJsonPath,
    }, state.visualizerFileHandle)
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
        workspaceId: state.currentWorkspaceId,
        jsonAssetId: state.visualizerJsonAssetId,
        jsonFilePath: state.visualizerServerJsonPath,
      }, state.visualizerFileName || 'textbook.json')
      state.visualizerStatus = '已下载当前最新 JSON'
    } catch (error) {
      state.visualizerError = true
      state.visualizerStatus = error instanceof Error ? error.message : '下载当前最新 JSON 失败'
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

  async function requestExamSessionInit(params) {
    const {
      workspaceId = '',
      jsonAssetId = '',
      jsonFilePath = '',
    } = params || {}

    const resp = await fetch('/api/exams/session/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildManagedJsonBody({
        workspaceId,
        jsonAssetId,
        jsonFilePath,
      })),
    })
    const data = await parseApiResponse(resp)
    if (!resp.ok) {
      throw new Error(data.message || '初始化失败')
    }
    return data
  }

  async function requestExamProcessImage(params) {
    const {
      chapterArkHeaders = {},
      sessionId = '',
      imageFile = null,
      lookaheadFile = null,
      signal,
      errorMessage = '自动处理失败',
    } = params || {}

    const formData = new FormData()
    formData.append('sessionId', sessionId)
    formData.append('image', imageFile, imageFile?.name || 'image')
    if (lookaheadFile) {
      formData.append('lookaheadImage', lookaheadFile, lookaheadFile.name || 'lookahead')
    }

    const resp = await fetch('/api/exams/session/process-image', {
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

  async function syncChapterBatchTaskToLocalFile(task) {
    await syncJsonHandleFromWorkspace({
      workspaceId: task?.workspaceId || '',
      jsonAssetId: task?.jsonAssetId || '',
      jsonFilePath: task?.serverJsonPath || '',
    }, task?.jsonHandle)
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

  async function chooseAutoImageFolder() {
    try {
      const { handle, images } = await pickImageFolderFromPicker()
      state.chapterAutoFiles = images
      state.chapterAutoFolderLabel = handle.name
      state.chapterAutoError = false
      state.chapterAutoStatus = `已选择文件夹：${handle.name}，共 ${images.length} 张图片`
    } catch (error) {
      if (error?.name === 'AbortError') {
        return
      }
      state.chapterAutoError = true
      state.chapterAutoStatus = error instanceof Error ? error.message : '选择文件夹失败'
    }
  }

  async function chooseExamAutoImageFolder() {
    try {
      const { handle, images } = await pickImageFolderFromPicker()
      state.examAutoFiles = images
      state.examAutoFolderLabel = handle.name
      state.examAutoError = false
      state.examAutoStatus = `已选择文件夹：${handle.name}，共 ${images.length} 张图片`
    } catch (error) {
      if (error?.name === 'AbortError') {
        return
      }
      state.examAutoError = true
      state.examAutoStatus = error instanceof Error ? error.message : '选择文件夹失败'
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

  async function initChapterSession() {
    if (state.workingJsonDocumentType === 'exam') {
      state.chapterSessionError = true
      state.chapterSessionStatus = '当前文件是试卷 JSON，请切换到试卷流程初始化会话'
      return
    }
    if (!state.chapterSessionServerJsonPath || !state.chapterSessionInitChapter || !state.chapterSessionInitSection) {
      state.chapterSessionError = true
      state.chapterSessionStatus = '请先选择 JSON 文件，并填写当前章、当前小节'
      return
    }
    state.chapterSessionError = false
    state.chapterSessionStatus = '初始化中...'
    state.chapterPassLogs = ''
    state.chapterPassResult = null
    resetChapterAutoRuntimeState()

    try {
      const data = await requestChapterSessionInit({
        workspaceId: state.currentWorkspaceId,
        jsonAssetId: state.chapterSessionJsonAssetId,
        jsonFilePath: state.chapterSessionServerJsonPath,
        currentChapterTitle: state.chapterSessionInitChapter,
        currentSectionTitle: state.chapterSessionInitSection,
      })
      state.chapterSessionId = String(data.sessionId || '')
      state.currentWorkspaceId = String(data.workspaceId || state.currentWorkspaceId || '')
      state.chapterSessionJsonAssetId = String(data.jsonAssetId || state.chapterSessionJsonAssetId || '')
      state.chapterSessionCurrentChapter = String(data.currentChapterTitle || '')
      state.chapterSessionCurrentSection = String(data.currentSectionTitle || '')
      state.chapterSessionStatus = `初始化成功，chapters: ${data.chaptersCount}，questions: ${data.questionsCount || 0}`
      await syncWorkingJsonToLocalFile().catch(() => {})
    } catch (error) {
      state.chapterSessionError = true
      state.chapterSessionStatus = error instanceof Error ? error.message : '初始化失败'
    }
  }

  async function initExamSession() {
    if (state.workingJsonDocumentType && state.workingJsonDocumentType !== 'exam') {
      state.examSessionError = true
      state.examSessionStatus = '当前文件不是试卷 JSON，请重新选择试卷文件'
      return
    }
    if (!state.examSessionServerJsonPath) {
      state.examSessionError = true
      state.examSessionStatus = '请先选择试卷 JSON 文件'
      return
    }

    state.examSessionError = false
    state.examSessionStatus = '初始化中...'
    state.examPassLogs = ''
    state.examPassResult = null
    resetExamAutoRuntimeState()

    try {
      const data = await requestExamSessionInit({
        workspaceId: state.currentWorkspaceId,
        jsonAssetId: state.examSessionJsonAssetId,
        jsonFilePath: state.examSessionServerJsonPath,
      })
      state.examSessionId = String(data.sessionId || '')
      state.currentWorkspaceId = String(data.workspaceId || state.currentWorkspaceId || '')
      state.examSessionJsonAssetId = String(data.jsonAssetId || state.examSessionJsonAssetId || '')
      state.examSessionTitle = String(data.examTitle || '')
      state.examSessionExamType = String(data.examType || '')
      state.examSessionHasAnswer = data.hasAnswer !== false
      state.examSessionCurrentMajor = String(data.currentMajorTitle || '')
      state.examSessionCurrentMinor = String(data.currentMinorTitle || '')
      state.examSessionStatus = `初始化成功，结构节点 ${Number(data.chaptersCount ?? 0)} 个，题目 ${Number(data.questionsCount ?? 0)} 道`
      await syncExamWorkingJsonToLocalFile().catch(() => {})
    } catch (error) {
      state.examSessionError = true
      state.examSessionStatus = error instanceof Error ? error.message : '初始化失败'
    }
  }

  function onExamImageChange(event) {
    state.examImageFile = event?.target?.files?.[0] ?? null
  }

  async function processExamImage() {
    if (!ensureChapterArkApiKey()) {
      return
    }
    if (!state.examSessionId) {
      state.examSessionError = true
      state.examSessionStatus = '请先初始化试卷会话'
      return
    }
    if (!state.examImageFile) {
      state.examSessionError = true
      state.examSessionStatus = '请先上传当前图片'
      return
    }

    state.examProcessing = true
    state.examSessionError = false
    state.examSessionStatus = '处理中...'
    state.examPassLogs = ''
    state.examPassResult = null

    try {
      const data = await requestExamProcessImage({
        chapterArkHeaders: buildChapterArkHeaders(),
        sessionId: state.examSessionId,
        imageFile: state.examImageFile,
      })
      const structureLabel = buildExamStructureLabel(data)
      state.examSessionCurrentMajor = String(data.currentMajorTitle || '')
      state.examSessionCurrentMinor = String(data.currentMinorTitle || '')
      state.examPassResult = {
        structureLabel,
        chaptersCount: Number(data.chaptersCount ?? 0),
        questionsCount: Number(data.questionsCount ?? 0),
        question: buildQuestionSummary(data.question, data.questionsCount ?? 0),
      }
      state.examPassLogs = [
        `当前结构：${structureLabel || '未识别'}`,
        `结构节点：${state.examPassResult.chaptersCount}`,
        `题目总数：${state.examPassResult.questionsCount}`,
        `本次新增：${state.examPassResult.question.upsertedCount}`,
        `跨页待续：${state.examPassResult.question.pending ? '是' : '否'}`,
        state.examPassResult.question.reason ? `说明：${state.examPassResult.question.reason}` : '',
      ]
        .filter(Boolean)
        .join('\n')
      state.examSessionStatus = `处理完成，当前结构：${structureLabel || '未识别'}，题目总数 ${state.examPassResult.questionsCount}`
      await syncExamWorkingJsonToLocalFile().catch(() => {})
    } catch (error) {
      state.examSessionError = true
      state.examSessionStatus = error instanceof Error ? error.message : '处理失败'
    } finally {
      state.examProcessing = false
    }
  }

  async function runExamAuto() {
    if (!ensureChapterArkApiKey()) {
      return
    }
    if (!state.examSessionId) {
      state.examAutoError = true
      state.examAutoStatus = '请先初始化试卷会话'
      return
    }
    const files = Array.isArray(state.examAutoFiles) ? state.examAutoFiles : []
    if (!files.length) {
      state.examAutoError = true
      state.examAutoStatus = '请先选择图片文件夹'
      return
    }

    resetExamAutoRuntimeState()
    state.examAutoRunning = true
    state.examAutoStopping = false
    state.examAutoError = false
    state.examAutoStatus = '试卷自动处理进行中...'
    examAutoAbortController = new AbortController()
    let successCount = 0
    let failedCount = 0
    let firstFailureMessage = ''

    appendExamAutoLog(`开始自动处理，共 ${files.length} 页`)

    try {
      for (let index = 0; index < files.length; index += 1) {
        const current = files[index]
        const lookahead = files[index + 1] || null

        if (state.examAutoStopping || examAutoAbortController.signal.aborted) {
          appendExamAutoLog(`手动停止于 ${current.name}`)
          state.examAutoSummary = {
            phase: 'stopped',
            currentIndex: index,
            totalCount: files.length,
            successCount,
            failedCount,
            currentFileName: current.name,
          }
          state.examAutoStatus = `已手动停止，停在 ${current.name}`
          return
        }

        appendExamAutoLog(`处理中 ${index + 1}/${files.length}: ${current.name}`)
        try {
          const data = await requestExamProcessImage({
            chapterArkHeaders: buildChapterArkHeaders(),
            sessionId: state.examSessionId,
            imageFile: current.file,
            lookaheadFile: lookahead?.file || null,
            signal: examAutoAbortController.signal,
          })
          successCount += 1
          const structureLabel = buildExamStructureLabel(data)
          state.examSessionCurrentMajor = String(data.currentMajorTitle || '')
          state.examSessionCurrentMinor = String(data.currentMinorTitle || '')
          const question = buildQuestionSummary(data.question, data.questionsCount ?? 0)
          appendExamAutoLog(
            `第 ${index + 1}/${files.length} 页完成: ${current.name} | 当前结构: ${structureLabel || '未识别'} | 新增 ${question.upsertedCount} | ${question.pending ? '待续页' : '已完成'}`,
          )
          state.examAutoEntries.push({
            fileName: current.name,
            status: 'success',
            structureLabel,
            question,
          })
          state.examAutoLive = {
            phase: question.pending ? 'pending' : 'success',
            currentIndex: index + 1,
            totalCount: files.length,
            currentFileName: current.name,
            successCount,
            failedCount,
            structureLabel,
            question,
          }
          await syncExamWorkingJsonToLocalFile().catch(() => {})
        } catch (error) {
          if (state.examAutoStopping || isAbortRequestError(error) || examAutoAbortController.signal.aborted) {
            appendExamAutoLog(`手动停止于 ${current.name}`)
            state.examAutoSummary = {
              phase: 'stopped',
              currentIndex: index,
              totalCount: files.length,
              successCount,
              failedCount,
              currentFileName: current.name,
            }
            state.examAutoStatus = `已手动停止，停在 ${current.name}`
            return
          }

          const message = error instanceof Error ? error.message : String(error)
          if (!firstFailureMessage) {
            firstFailureMessage = message
          }
          failedCount += 1
          appendExamAutoLog(`第 ${index + 1}/${files.length} 页失败: ${current.name} | ${message}`)
          state.examAutoEntries.push({
            fileName: current.name,
            status: 'failed',
            error: message,
          })
          state.examAutoLive = {
            phase: 'failed',
            currentIndex: index + 1,
            totalCount: files.length,
            currentFileName: current.name,
            successCount,
            failedCount,
            error: message,
          }

          if (isFatalAutoRunErrorMessage(message)) {
            throw error
          }
        }
      }

      state.examAutoSummary = {
        phase: 'done',
        currentIndex: files.length,
        totalCount: files.length,
        successCount,
        failedCount,
        currentFileName: '',
        structureLabel: buildExamStructureLabel({
          currentMajorTitle: state.examSessionCurrentMajor,
          currentMinorTitle: state.examSessionCurrentMinor,
        }),
      }
      state.examAutoStatus =
        failedCount && firstFailureMessage
          ? `自动处理完成，成功 ${successCount} 张，失败 ${failedCount} 张。首个错误：${firstFailureMessage}`
          : `自动处理完成，成功 ${successCount} 张，失败 ${failedCount} 张`
      appendExamAutoLog(`自动处理完成，成功 ${successCount} 页，失败 ${failedCount} 页`)
    } catch (error) {
      state.examAutoError = true
      state.examAutoStatus = error instanceof Error ? error.message : '自动处理失败'
    } finally {
      state.examAutoRunning = false
      state.examAutoStopping = false
      examAutoAbortController = null
    }
  }

  function stopExamAuto() {
    if (!state.examAutoRunning || state.examAutoStopping) {
      return
    }
    state.examAutoStopping = true
    state.examAutoError = false
    state.examAutoStatus = '正在请求停止自动处理...'
    examAutoAbortController?.abort()
  }

  function resetExamAuto() {
    if (state.examAutoRunning) {
      return
    }
    resetExamAutoRuntimeState()
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

  function removeMergeJsonFile(index) {
    state.mergeJsonFiles.splice(index, 1)
  }

  function clearMergeJsonFiles() {
    state.mergeJsonFiles = []
  }

  async function mergeJsonFiles() {
    if (state.mergeJsonFiles.length < 2) {
      state.mergeError = true
      state.mergeStatus = '请至少选择 2 个 JSON 文件'
      return
    }

    state.mergeProcessing = true
    state.mergeError = false
    state.mergeStatus = '合并处理中...'
    state.mergeResult = null

    try {
      const formData = new FormData()
      formData.append('outputFileName', String(state.mergeOutputFileName || '').trim())
      for (const file of state.mergeJsonFiles) {
        formData.append('jsonFiles', file, file.name)
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
      }
      state.mergeStatus = `合并完成，已输出到 merged_json：${state.mergeResult.mergedFileName || state.mergeResult.mergedFilePath}`
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
        throw new Error(data.message || '定点修复失败')
      }

      state.repairResult = {
        jsonFilePath: String(data.jsonFilePath || ''),
        repairJsonPath: String(data.repairJsonPath || ''),
        repairJsonFileName: String(data.repairJsonFileName || ''),
        chapterTitle: String(data.chapterTitle || ''),
        sectionTitle: String(data.sectionTitle || ''),
        questionId: String(data.questionId || ''),
        questionTitle: String(data.questionTitle || ''),
        action: String(data.action || ''),
        insertIndex: Number(data.insertIndex ?? -1),
        questionsCount: Number(data.questionsCount ?? 0),
        reason: String(data.reason || ''),
      }
      state.repairStatus = `修复完成，已输出到 repair_json：${state.repairResult.repairJsonFileName || state.repairResult.repairJsonPath}`
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
        repairJsonPath: String(data.repairJsonPath || ''),
        repairJsonFileName: String(data.repairJsonFileName || ''),
        chapterTitle: String(data.chapterTitle || ''),
        sectionTitle: String(data.sectionTitle || ''),
        questionId: String(data.questionId || ''),
        childQuestionId: String(data.childQuestionId || ''),
        questionTitle: String(data.questionTitle || ''),
        targetLabel: String(data.targetLabel || ''),
        mediaCount: Number(data.mediaCount ?? 0),
        mediaItems: Array.isArray(data.mediaItems) ? data.mediaItems : [],
      }
      state.imageAttachStatus = `图片补充完成，已输出到 repair_json：${state.imageAttachResult.repairJsonFileName || state.imageAttachResult.repairJsonPath}`
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
        repairJsonPath: String(data.repairJsonPath || ''),
        repairJsonFileName: String(data.repairJsonFileName || ''),
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
      state.mathFormatRepairStatus = `公式修复完成，已输出到 repair_json：${state.mathFormatRepairResult.repairJsonFileName || state.mathFormatRepairResult.repairJsonPath}`
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

  async function processChapterImage() {
    if (!state.chapterSessionId) {
      state.chapterSessionError = true
      state.chapterSessionStatus = '请先初始化会话'
      return
    }
    if (!state.chapterImageFile) {
      state.chapterSessionError = true
      state.chapterSessionStatus = '请先选择图片'
      return
    }
    if (!ensureChapterArkApiKey()) {
      return
    }

    const processingProfile = getChapterProcessingProfile()
    const chapterArkHeaders = buildChapterArkHeaders()
    state.chapterProcessing = true
    state.chapterSessionError = false
    state.chapterSessionStatus = '处理中...'

    try {
      const formData = new FormData()
      formData.append('sessionId', state.chapterSessionId)
      formData.append('image', state.chapterImageFile)
      formData.append('currentChapterTitle', state.chapterSessionCurrentChapter)
      formData.append('currentSectionTitle', state.chapterSessionCurrentSection)

      const resp = await fetch(processingProfile.processImageEndpoint, {
        method: 'POST',
        headers: chapterArkHeaders,
        body: formData,
      })
      const data = await parseApiResponse(resp)
      if (!resp.ok) {
        throw new Error(data.message || '处理失败')
      }
      state.chapterSessionCurrentChapter = String(data.currentChapterTitle || '')
      state.chapterSessionCurrentSection = String(data.currentSectionTitle || '')
      const question = data.question || {}
      if (question.pending) {
        state.chapterSessionStatus = `当前页处理完成，检测到跨页题 ${question.continueQuestionKey || ''}，等待下一页。当前小节: ${state.chapterSessionCurrentSection}，跨页队列: ${question.pendingPagesCount ?? '?'} 页`
      } else {
        state.chapterSessionStatus = `当前页处理完成并已入库。当前小节: ${state.chapterSessionCurrentSection}，新增题目: ${question.upsertedCount ?? 0}，总 questions: ${data.questionsCount}`
      }
      state.chapterPassLogs = JSON.stringify(
        {
          chapters: data.passLogs || [],
          question,
          prefixCacheExperiment: data.prefixCacheExperiment || null,
        },
        null,
        2,
      )
      state.chapterPassResult = {
        chapterTitle: state.chapterSessionCurrentChapter,
        sectionTitle: state.chapterSessionCurrentSection,
        modeLabel: processingProfile.modeLabel,
        chaptersCount: Number(data.chaptersCount ?? 0),
        questionsCount: Number(data.questionsCount ?? 0),
        question: buildQuestionSummary(question, data.questionsCount ?? 0),
        prefixCache: buildPrefixCacheSummary(data.prefixCacheExperiment),
      }
      await syncWorkingJsonToLocalFile().catch(() => {})
    } catch (error) {
      state.chapterSessionError = true
      state.chapterSessionStatus = error instanceof Error ? error.message : '处理失败'
    } finally {
      state.chapterProcessing = false
    }
  }

  async function runChapterAuto() {
    if (!state.chapterSessionId) {
      state.chapterAutoError = true
      state.chapterAutoStatus = '请先初始化会话'
      return
    }
    if (!state.chapterAutoFiles.length) {
      state.chapterAutoError = true
      state.chapterAutoStatus = '请先选择图片文件夹'
      return
    }
    if (!ensureChapterArkApiKey()) {
      return
    }

    const processingProfile = getChapterProcessingProfile()
    const chapterArkHeaders = buildChapterArkHeaders()
    const files = state.chapterAutoFiles
    chapterAutoAbortController?.abort()
    chapterAutoAbortController = new AbortController()
    state.chapterAutoRunning = true
    state.chapterAutoStopping = false
    state.chapterAutoError = false
    state.chapterAutoStatus = '自动处理中...'
    state.chapterAutoLogs = ''
    state.chapterAutoProgress = ''
    state.chapterAutoEntries = []
    state.chapterAutoSummary = {
      totalCount: files.length,
      completedCount: 0,
      successCount: 0,
      failedCount: 0,
      currentIndex: 0,
      currentFileName: '',
      currentChapterTitle: state.chapterSessionCurrentChapter,
      currentSectionTitle: state.chapterSessionCurrentSection,
      modeLabel: processingProfile.modeLabel,
      phase: '准备开始',
    }
    state.chapterAutoLive = {
      phase: 'preparing',
      title: '准备开始自动处理',
      detail: `共 ${files.length} 页，当前从 ${state.chapterSessionCurrentSection} 开始`,
      currentIndex: 0,
      totalCount: files.length,
      currentFileName: '',
      successCount: 0,
      failedCount: 0,
      completedCount: 0,
      currentSectionTitle: state.chapterSessionCurrentSection,
      modeLabel: processingProfile.modeLabel,
    }

    let successCount = 0
    let failedCount = 0
    let firstFailureMessage = ''

    const markChapterAutoStopped = (currentFileName = '') => {
      const detail = currentFileName ? `已手动停止，当前停在 ${currentFileName}` : '已手动停止当前自动处理'
      state.chapterAutoError = false
      state.chapterAutoStatus = detail
      state.chapterAutoSummary = {
        totalCount: files.length,
        completedCount: successCount + failedCount,
        successCount,
        failedCount,
        currentIndex: successCount + failedCount,
        currentFileName: currentFileName || state.chapterAutoSummary?.currentFileName || '',
        currentChapterTitle: state.chapterSessionCurrentChapter,
        currentSectionTitle: state.chapterSessionCurrentSection,
        modeLabel: processingProfile.modeLabel,
        phase: '已手动停止',
      }
      state.chapterAutoLive = {
        phase: 'stopped',
        title: '自动处理已手动停止',
        detail,
        currentIndex: successCount + failedCount,
        totalCount: files.length,
        currentFileName: currentFileName || state.chapterAutoSummary?.currentFileName || '',
        successCount,
        failedCount,
        completedCount: successCount + failedCount,
        currentSectionTitle: state.chapterSessionCurrentSection,
        question: state.chapterAutoLive?.question || null,
        prefixCache: state.chapterAutoLive?.prefixCache || null,
        modeLabel: processingProfile.modeLabel,
      }
    }

    try {
      const startEvent = {
        type: 'start',
        totalCount: files.length,
        currentSectionTitle: state.chapterSessionCurrentSection,
      }
      appendChapterAutoLog(formatAutoProgressLine(startEvent))

      for (let index = 0; index < files.length; index += 1) {
        const current = files[index]
        const lookahead = files[index + 1] || null

        if (state.chapterAutoStopping || chapterAutoAbortController?.signal.aborted) {
          appendChapterAutoLog(`手动停止于 ${current.name}`)
          markChapterAutoStopped(current.name)
          return
        }

        const progressEvent = {
          type: 'progress',
          currentIndex: index + 1,
          totalCount: files.length,
          fileName: current.name,
        }
        state.chapterAutoProgress = formatAutoProgressLine(progressEvent)
        appendChapterAutoLog(state.chapterAutoProgress)
        state.chapterAutoSummary = {
          ...state.chapterAutoSummary,
          currentIndex: index + 1,
          currentFileName: current.name,
          currentChapterTitle: state.chapterSessionCurrentChapter,
          currentSectionTitle: state.chapterSessionCurrentSection,
          phase: '处理中',
        }
        state.chapterAutoLive = {
          phase: 'processing',
          title: `正在处理第 ${index + 1} 页`,
          detail: '已发送图片，等待结构化结果返回',
          currentIndex: index + 1,
          totalCount: files.length,
          currentFileName: current.name,
          successCount,
          failedCount,
          completedCount: successCount + failedCount,
          currentSectionTitle: state.chapterSessionCurrentSection,
          question: state.chapterAutoLive?.question || null,
          prefixCache: state.chapterAutoLive?.prefixCache || null,
        }
        await nextTick()

        try {
          const formData = new FormData()
          formData.append('sessionId', state.chapterSessionId)
          formData.append('image', current.file, current.file.name)
          formData.append('currentChapterTitle', state.chapterSessionCurrentChapter)
          formData.append('currentSectionTitle', state.chapterSessionCurrentSection)
          if (lookahead) {
            formData.append('lookaheadImage', lookahead.file, lookahead.file.name)
          }

          const resp = await fetch(processingProfile.processImageEndpoint, {
            method: 'POST',
            headers: chapterArkHeaders,
            body: formData,
            signal: chapterAutoAbortController.signal,
          })
          const data = await parseApiResponse(resp)
          if (!resp.ok) {
            throw new Error(data.message || '自动处理失败')
          }

          successCount += 1
          const question = data.question || {}
          state.chapterSessionCurrentChapter = String(data.currentChapterTitle || state.chapterSessionCurrentChapter)
          state.chapterSessionCurrentSection = String(data.currentSectionTitle || state.chapterSessionCurrentSection)
          const resultEvent = {
            type: 'result',
            status: 'success',
            currentIndex: index + 1,
            totalCount: files.length,
            fileName: current.name,
            currentSectionTitle: data.currentSectionTitle,
            question: data.question,
            prefixCacheExperiment: data.prefixCacheExperiment,
          }
          const message = formatAutoProgressLine(resultEvent)
          state.chapterAutoProgress = message
          appendChapterAutoLog(message)
          const entry = createAutoEntry(resultEvent)
          if (entry) {
            state.chapterAutoEntries.push(entry)
          }
          state.chapterAutoSummary = {
            ...state.chapterAutoSummary,
            completedCount: successCount + failedCount,
            successCount,
            failedCount,
            currentIndex: index + 1,
            currentFileName: current.name,
            currentChapterTitle: state.chapterSessionCurrentChapter,
            currentSectionTitle: state.chapterSessionCurrentSection,
            phase: question.pending ? '待下一页续接' : '本页已完成',
          }
          state.chapterAutoLive = {
            phase: question.pending ? 'pending' : 'success',
            title: question.pending ? `第 ${index + 1} 页进入跨页等待` : `第 ${index + 1} 页完成入库`,
            detail: question.pending
              ? `续题标记 ${question.continueQuestionKey || '无'}，当前队列 ${question.pendingPagesCount ?? 0} 页`
              : `新增 ${question.upsertedCount ?? 0} 题，当前小节 ${state.chapterSessionCurrentSection || '未命名小节'}`,
            currentIndex: index + 1,
            totalCount: files.length,
            currentFileName: current.name,
            successCount,
            failedCount,
            completedCount: successCount + failedCount,
            currentSectionTitle: state.chapterSessionCurrentSection,
            question: buildQuestionSummary(question),
            prefixCache: buildPrefixCacheSummary(data.prefixCacheExperiment),
          }
          await syncWorkingJsonToLocalFile().catch(() => {})
        } catch (error) {
          if (state.chapterAutoStopping || isAbortRequestError(error) || chapterAutoAbortController?.signal.aborted) {
            appendChapterAutoLog(`手动停止于 ${current.name}`)
            markChapterAutoStopped(current.name)
            return
          }

          const errorMessage = error instanceof Error ? error.message : String(error)
          if (!firstFailureMessage) {
            firstFailureMessage = errorMessage
          }
          failedCount += 1
          const resultEvent = {
            type: 'result',
            status: 'failed',
            currentIndex: index + 1,
            totalCount: files.length,
            fileName: current.name,
            error: errorMessage,
          }
          const message = formatAutoProgressLine(resultEvent)
          state.chapterAutoProgress = message
          appendChapterAutoLog(message)
          const entry = createAutoEntry(resultEvent)
          if (entry) {
            state.chapterAutoEntries.push(entry)
          }
          state.chapterAutoSummary = {
            ...state.chapterAutoSummary,
            completedCount: successCount + failedCount,
            successCount,
            failedCount,
            currentIndex: index + 1,
            currentFileName: current.name,
            currentChapterTitle: state.chapterSessionCurrentChapter,
            currentSectionTitle: state.chapterSessionCurrentSection,
            phase: '本页失败',
          }
          state.chapterAutoLive = {
            phase: 'failed',
            title: `第 ${index + 1} 页处理失败`,
            detail: errorMessage,
            currentIndex: index + 1,
            totalCount: files.length,
            currentFileName: current.name,
            successCount,
            failedCount,
            completedCount: successCount + failedCount,
            currentSectionTitle: state.chapterSessionCurrentSection,
            question: state.chapterAutoLive?.question || null,
            prefixCache: state.chapterAutoLive?.prefixCache || null,
            modeLabel: processingProfile.modeLabel,
          }

          if (isFatalAutoRunErrorMessage(errorMessage)) {
            state.chapterAutoError = true
            state.chapterAutoStatus = `自动处理已中止：${errorMessage}`
            state.chapterAutoSummary = {
              totalCount: files.length,
              completedCount: successCount + failedCount,
              successCount,
              failedCount,
              currentIndex: index + 1,
              currentFileName: current.name,
              currentChapterTitle: state.chapterSessionCurrentChapter,
              currentSectionTitle: state.chapterSessionCurrentSection,
              modeLabel: processingProfile.modeLabel,
              phase: '自动处理已中止',
            }
            state.chapterAutoLive = {
              phase: 'failed',
              title: '自动处理已中止',
              detail: errorMessage,
              currentIndex: index + 1,
              totalCount: files.length,
              currentFileName: current.name,
              successCount,
              failedCount,
              completedCount: successCount + failedCount,
              currentSectionTitle: state.chapterSessionCurrentSection,
              question: state.chapterAutoLive?.question || null,
              prefixCache: state.chapterAutoLive?.prefixCache || null,
              modeLabel: processingProfile.modeLabel,
            }

            if (errorMessage.toLowerCase().includes('session not found') || errorMessage.toLowerCase().includes('please init first')) {
              state.chapterSessionError = true
              state.chapterSessionStatus = '当前章节会话已失效，请重新点击“初始化会话”后再跑目录。'
            }
            return
          }
        }
      }

      const doneEvent = {
        type: 'done',
        successCount,
        failedCount,
      }
      appendChapterAutoLog(formatAutoProgressLine(doneEvent))
      state.chapterAutoSummary = {
        totalCount: files.length,
        completedCount: files.length,
        successCount,
        failedCount,
        currentIndex: files.length,
        currentFileName: '',
        currentChapterTitle: state.chapterSessionCurrentChapter,
        currentSectionTitle: state.chapterSessionCurrentSection,
        modeLabel: processingProfile.modeLabel,
        phase: '自动处理完成',
      }
      state.chapterAutoLive = {
        phase: failedCount ? 'done-with-failure' : 'done',
        title: '自动处理完成',
        detail:
          failedCount && firstFailureMessage
            ? `成功 ${successCount} 页，失败 ${failedCount} 页。首个错误：${firstFailureMessage}`
            : `成功 ${successCount} 页，失败 ${failedCount} 页`,
        currentIndex: files.length,
        totalCount: files.length,
        currentFileName: '',
        successCount,
        failedCount,
        completedCount: files.length,
        currentSectionTitle: state.chapterSessionCurrentSection,
        question: state.chapterAutoLive?.question || null,
        prefixCache: state.chapterAutoLive?.prefixCache || null,
        modeLabel: processingProfile.modeLabel,
      }
      state.chapterAutoStatus =
        failedCount && firstFailureMessage
          ? `自动处理完成，成功 ${successCount} 张，失败 ${failedCount} 张。首个错误：${firstFailureMessage}`
          : `自动处理完成，成功 ${successCount} 张，失败 ${failedCount} 张`
    } catch (error) {
      if (state.chapterAutoStopping || isAbortRequestError(error) || chapterAutoAbortController?.signal.aborted) {
        markChapterAutoStopped(state.chapterAutoSummary?.currentFileName || '')
        return
      }

      state.chapterAutoError = true
      state.chapterAutoStatus = error instanceof Error ? error.message : '自动处理失败'
      state.chapterAutoLive = {
        phase: 'failed',
        title: '自动处理失败',
        detail: state.chapterAutoStatus,
        currentIndex: state.chapterAutoSummary?.currentIndex || 0,
        totalCount: files.length,
        currentFileName: state.chapterAutoSummary?.currentFileName || '',
        successCount,
        failedCount,
        completedCount: successCount + failedCount,
        currentSectionTitle: state.chapterSessionCurrentSection,
        question: state.chapterAutoLive?.question || null,
        prefixCache: state.chapterAutoLive?.prefixCache || null,
        modeLabel: processingProfile.modeLabel,
      }
    } finally {
      state.chapterAutoRunning = false
      state.chapterAutoStopping = false
      chapterAutoAbortController = null
    }
  }

  function stopChapterAuto() {
    if (!state.chapterAutoRunning || state.chapterAutoStopping) {
      return
    }
    state.chapterAutoStopping = true
    state.chapterAutoError = false
    state.chapterAutoStatus = '正在请求停止自动处理...'
    chapterAutoAbortController?.abort()
  }

  function resetChapterAuto() {
    if (state.chapterAutoRunning) {
      return
    }
    resetChapterAutoRuntimeState()
  }

  function addChapterBatchTask() {
    state.chapterBatchTasks.push(createChapterBatchTask())
    state.chapterBatchError = false
    if (!state.chapterBatchStatus) {
      state.chapterBatchStatus = '已添加章节任务，请为每一章选择 JSON、填写起始章节并选择图片文件夹'
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

  async function chooseChapterBatchTaskJson(taskId) {
    const task = findChapterBatchTask(taskId)
    if (!task) {
      return
    }

    try {
      const { handle, file } = await pickJsonFileFromPicker()
      const data = await uploadJsonFileToWorkspace(file, {
        workspaceId: task.workspaceId,
      })
      task.serverJsonPath = String(data.workspaceFilePath || data.filePath || '')
      task.jsonAssetId = String(data.jsonAssetId || '')
      task.workspaceId = String(data.workspaceId || state.currentWorkspaceId || '')
      state.currentWorkspaceId = String(data.workspaceId || state.currentWorkspaceId || '')
      task.jsonLabel = file.name
      task.jsonHandle = handle
      task.error = false
      task.status = `已选择 JSON 文件：${file.name}`
    } catch (error) {
      if (error?.name === 'AbortError') {
        return
      }
      task.error = true
      task.status = error instanceof Error ? error.message : '选择 JSON 文件失败'
    }
  }

  async function chooseChapterBatchTaskFolder(taskId) {
    const task = findChapterBatchTask(taskId)
    if (!task) {
      return
    }

    try {
      const { handle, images } = await pickImageFolderFromPicker()
      task.imageFiles = images
      task.folderLabel = handle.name
      task.error = false
      task.status = `已选择文件夹：${handle.name}，共 ${images.length} 张图片`
    } catch (error) {
      if (error?.name === 'AbortError') {
        return
      }
      task.error = true
      task.status = error instanceof Error ? error.message : '选择文件夹失败'
    }
  }

  async function runChapterBatchTask(task, processingProfile, chapterArkHeaders) {
    if (!task) {
      return
    }

    const files = Array.isArray(task.imageFiles) ? task.imageFiles : []
    const abortController = new AbortController()
    chapterBatchAbortControllers.set(task.id, abortController)
    resetChapterBatchTaskRuntime(task)
    task.running = true
    task.totalCount = files.length
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
        workspaceId: task.workspaceId,
        jsonAssetId: task.jsonAssetId,
        jsonFilePath: task.serverJsonPath,
        currentChapterTitle: task.initChapter,
        currentSectionTitle: task.initSection,
      })
      task.sessionId = String(initData.sessionId || '')
      task.currentChapter = String(initData.currentChapterTitle || '')
      task.currentSection = String(initData.currentSectionTitle || '')
      task.phase = '会话已初始化'
      task.status = `初始化成功，chapters: ${initData.chaptersCount}，questions: ${initData.questionsCount || 0}`
      await syncChapterBatchTaskToLocalFile(task).catch(() => {})

      const startEvent = {
        type: 'start',
        totalCount: files.length,
        currentSectionTitle: task.currentSection,
      }
      appendChapterBatchTaskLog(task, formatAutoProgressLine(startEvent))

      for (let index = 0; index < files.length; index += 1) {
        const current = files[index]
        const lookahead = files[index + 1] || null

        if (state.chapterBatchStopping || abortController.signal.aborted) {
          appendChapterBatchTaskLog(task, `手动停止于 ${current.name}`)
          markStopped(current.name)
          return
        }

        const progressEvent = {
          type: 'progress',
          currentIndex: index + 1,
          totalCount: files.length,
          fileName: current.name,
        }
        task.currentIndex = index + 1
        task.currentFileName = current.name
        task.phase = '处理中'
        task.status = formatAutoProgressLine(progressEvent)
        appendChapterBatchTaskLog(task, task.status)
        await nextTick()

        try {
          const data = await requestChapterProcessImage({
            processingProfile,
            chapterArkHeaders,
            sessionId: task.sessionId,
            imageFile: current.file,
            lookaheadFile: lookahead?.file || null,
            currentChapterTitle: task.currentChapter,
            currentSectionTitle: task.currentSection,
            signal: abortController.signal,
          })

          const question = data.question || {}
          task.successCount += 1
          task.completedCount = task.successCount + task.failedCount
          task.currentChapter = String(data.currentChapterTitle || task.currentChapter)
          task.currentSection = String(data.currentSectionTitle || task.currentSection)
          task.lastQuestion = buildQuestionSummary(question)
          task.lastPrefixCache = buildPrefixCacheSummary(data.prefixCacheExperiment)
          task.phase = question.pending ? '待下一页' : '本页已完成'
          const resultEvent = {
            type: 'result',
            status: 'success',
            currentIndex: index + 1,
            totalCount: files.length,
            fileName: current.name,
            currentSectionTitle: data.currentSectionTitle,
            question: data.question,
            prefixCacheExperiment: data.prefixCacheExperiment,
          }
          task.status = formatAutoProgressLine(resultEvent)
          appendChapterBatchTaskLog(task, task.status)
          await syncChapterBatchTaskToLocalFile(task).catch(() => {})
        } catch (error) {
          if (state.chapterBatchStopping || isAbortRequestError(error) || abortController.signal.aborted) {
            appendChapterBatchTaskLog(task, `手动停止于 ${current.name}`)
            markStopped(current.name)
            return
          }

          const errorMessage = error instanceof Error ? error.message : String(error)
          if (!firstFailureMessage) {
            firstFailureMessage = errorMessage
          }
          task.failedCount += 1
          task.completedCount = task.successCount + task.failedCount
          task.phase = '本页失败'
          task.error = true
          const resultEvent = {
            type: 'result',
            status: 'failed',
            currentIndex: index + 1,
            totalCount: files.length,
            fileName: current.name,
            error: errorMessage,
          }
          task.status = formatAutoProgressLine(resultEvent)
          appendChapterBatchTaskLog(task, task.status)

          if (isFatalAutoRunErrorMessage(errorMessage)) {
            task.running = false
            task.phase = '处理中止'
            task.status = `章节任务已中止：${errorMessage}`
            return
          }
        }
      }

      const doneEvent = {
        type: 'done',
        successCount: task.successCount,
        failedCount: task.failedCount,
      }
      appendChapterBatchTaskLog(task, formatAutoProgressLine(doneEvent))
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
      state.chapterBatchStatus = `请先补全任务：${getChapterBatchTaskLabel(invalidTask)}。每一章都需要 JSON、当前章、当前小节和图片文件夹`
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
      const formData = new FormData()
      formData.append('folderName', state.folderName)
      if (state.currentWorkspaceId) {
        formData.append('workspaceId', state.currentWorkspaceId)
      }
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

  const actions = {
    addExamSectionTask,
    addChapterBatchTask,
    addChapterManualChapter,
    addChapterManualSection,
    appendExamSectionFromImages,
    appendExamSectionFromLibrary,
    chooseAutoImageFolder,
    chooseChapterBatchTaskFolder,
    chooseChapterBatchTaskJson,
    chooseExamAutoImageFolder,
    chooseExamJsonSessionFile,
    chooseJsonSessionFile,
    chooseVisualizerJsonFile,
    onDbImportFilesChange,
    removeDbImportFile,
    clearDbImportFiles,
    clearCurrentWorkspaceSummary,
    loadQuestionBankDbSummary,
    cleanupCurrentWorkspaceDerivedFiles,
    importQuestionBankDbJsonFiles,
    deleteCurrentWorkspace,
    fillAssistantPrompt,
    clearQuestionBankAssistantChat,
    clearChapterManualSectionImages,
    clearExamSectionImages,
    confirmExamSection,
    downloadCurrentExamJson,
    downloadCurrentVisualizerJson,
    downloadCurrentWorkingJson,
    refreshCurrentWorkspaceSummary,
    sendQuestionBankAssistantMessage,
    finalizeExamSections,
    generateExamJson,
    generateTextbookJson,
    saveExamJson,
    saveTextbookJson,
    initExamSession,
    initChapterSession,
    onVisualizerJsonChange,
    onVisualizerUploadsFolderChange,
    onVisualizerRepairImageChange,
    clearVisualizerRepairImages,
    attachImagesFromVisualizer,
    generateAnswerFromVisualizer,
    reloadVisualizerJsonFile,
    repairQuestionFromVisualizer,
    repairMathFormatFromVisualizer,
    updateQuestionTypeFromVisualizer,
    onMergeJsonFilesChange,
    removeMergeJsonFile,
    clearMergeJsonFiles,
    mergeJsonFiles,
    loadExamQuestionTypeOptions,
    onImageAttachFilesChange,
    onImageAttachPaste,
    onChapterManualSectionImagesChange,
    onExamSectionImagesChange,
    clearImageAttachFiles,
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
    processExamImage,
    reopenExamSection,
    resetChapterBatch,
    resetChapterManualBatch,
    resetExamAuto,
    runChapterBatch,
    runChapterManualBatch,
    runExamAuto,
    searchExamSectionLibrary,
    setChapterBatchConcurrency,
    setChapterProcessingMode,
    setChapterRunMode,
    setChapterSingleMode,
    processChapterImage,
    runChapterAuto,
    stopExamAuto,
    stopChapterBatch,
    stopChapterManualBatch,
    stopChapterAuto,
    resetChapterAuto,
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
