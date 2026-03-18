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
    jsonFormError: '',
    jsonSaveStatus: '',
    jsonSaveError: false,
    chapterSessionJsonLabel: '',
    chapterSessionServerJsonPath: '',
    chapterSessionJsonHandle: null,
    chapterSessionInitChapter: '第八章 不定积分',
    chapterSessionInitSection: '习题8.1',
    chapterSessionId: '',
    chapterSessionCurrentChapter: '',
    chapterSessionCurrentSection: '',
    chapterArkApiKey: '',
    chapterProcessingMode: 'original',
    chapterSessionStatus: '',
    chapterSessionError: false,
    repairForm: {
      chapterNo: '',
      sectionNo: '',
      questionNo: '',
    },
    repairImageFiles: [],
    repairProcessing: false,
    repairStatus: '',
    repairError: false,
    repairResult: null,
    mathFormatRepairForm: {
      targetType: 'standardAnswer',
      childNo: '',
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
    },
    imageAttachFiles: [],
    imageAttachProcessing: false,
    imageAttachStatus: '',
    imageAttachError: false,
    imageAttachResult: null,
    visualizerFileName: '',
    visualizerFileHandle: null,
    visualizerServerJsonPath: '',
    visualizerStatus: '',
    visualizerError: false,
    visualizerPayload: null,
    visualizerRepairProcessing: false,
    visualizerRepairStatus: '',
    visualizerRepairError: false,
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
    jsonForm: {
      version: 'v1.1',
      courseId: '',
      textbookId: '',
      title: '',
      publisher: '',
      subject: '',
    },
  })

  let selectedPdfSequence = 0
  let chapterAutoAbortController = null

  function createSelectedPdfEntry(file) {
    selectedPdfSequence += 1
    return {
      id: `pdf_${Date.now()}_${selectedPdfSequence}`,
      file,
    }
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
      textbook: {
        textbookId: String(state.jsonForm.textbookId || '').trim(),
        title: String(state.jsonForm.title || '').trim(),
        publisher: String(state.jsonForm.publisher || '').trim(),
        subject: String(state.jsonForm.subject || '').trim(),
      },
      chapters: [],
      questions: [],
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

  function getChapterProcessingProfile() {
    const isResponsesExperiment = state.chapterProcessingMode === 'responses'
    return {
      mode: isResponsesExperiment ? 'responses' : 'original',
      modeLabel: isResponsesExperiment ? 'Responses前缀缓存实验版' : '原逻辑',
      processImageEndpoint: isResponsesExperiment
        ? '/api/chapters/session/process-image-responses'
        : '/api/chapters/session/process-image',
    }
  }

  function setChapterProcessingMode(mode) {
    if (mode !== 'original' && mode !== 'responses') {
      return
    }
    state.chapterProcessingMode = mode
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

  function ensureChapterArkApiKey() {
    if (getChapterArkApiKey()) {
      return true
    }
    state.chapterSessionError = true
    state.chapterSessionStatus = '请先在当前页面填写 API Key，再开始提取'
    state.chapterAutoError = true
    state.chapterAutoStatus = '请先在当前页面填写 API Key，再开始提取'
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

  async function loadVisualizerJsonFile(file, fileHandle = null) {
    if (!file) {
      return
    }

    state.visualizerError = false
    state.visualizerStatus = '解析 JSON 中...'
    state.visualizerRepairError = false
    state.visualizerRepairStatus = ''
    state.visualizerRepairImageFiles = []
    state.visualizerRewriteResult = null

    try {
      const text = await fileToText(file)
      const parsed = JSON.parse(text)
      const chapters = Array.isArray(parsed?.chapters) ? parsed.chapters : null
      const questions = Array.isArray(parsed?.questions) ? parsed.questions : null

      if (!chapters || !questions) {
        throw new Error('当前文件不是支持的题库 JSON，缺少 chapters 或 questions 数组')
      }

      const imported = await uploadJsonFileToWorkspace(file)
      state.visualizerPayload = parsed
      state.visualizerFileName = file.name
      state.visualizerFileHandle = fileHandle
      state.visualizerServerJsonPath = String(imported.filePath || '')
      state.visualizerStatus = `已加载 ${file.name}，共 ${chapters.length} 个章节节点，${questions.length} 道题`
    } catch (error) {
      state.visualizerError = true
      state.visualizerPayload = null
      state.visualizerFileName = ''
      state.visualizerFileHandle = null
      state.visualizerServerJsonPath = ''
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

  async function repairMathFormatFromVisualizer(params) {
    const {
      questionId,
      targetType,
      childNo = null,
      blockLabel = '',
    } = params || {}

    if (!state.visualizerServerJsonPath) {
      state.visualizerRepairError = true
      state.visualizerRepairStatus = '当前可视化文件尚未同步到修复工作区，请重新选择一次 JSON 文件'
      return
    }

    const parts = parseQuestionIdParts(questionId)
    if (!parts) {
      state.visualizerRepairError = true
      state.visualizerRepairStatus = `无法从 questionId 解析章节信息：${questionId || 'unknown'}`
      return
    }

    const effectiveChildNo =
      targetType === 'childPrompt' || targetType === 'childStandardAnswer'
        ? Number(childNo || parts.childNo || 0)
        : null

    state.visualizerRepairProcessing = true
    state.visualizerRepairError = false
    state.visualizerRepairStatus = `正在修复 ${blockLabel || targetType}...`

    try {
      const resp = await fetch('/api/textbook-json/repair-math-format', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonFilePath: state.visualizerServerJsonPath,
          sourceFileName: state.visualizerFileName || '',
          chapterNo: parts.chapterNo,
          sectionNo: parts.sectionNo,
          questionNo: parts.questionNo,
          targetType,
          childNo: effectiveChildNo,
        }),
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

  async function repairQuestionFromVisualizer(params) {
    const questionId = String(params?.questionId || '').trim()
    const questionTitle = String(params?.questionTitle || '').trim()

    if (!state.visualizerServerJsonPath) {
      state.visualizerRepairError = true
      state.visualizerRepairStatus = '褰撳墠鍙鍖栨枃浠跺皻鏈悓姝ュ埌淇宸ヤ綔鍖猴紝璇烽噸鏂伴€夋嫨涓€娆?JSON 鏂囦欢'
      return
    }
    if (!state.visualizerRepairImageFiles.length) {
      state.visualizerRepairError = true
      state.visualizerRepairStatus = '璇峰厛涓婁紶鐢ㄤ簬閲嶅啓褰撳墠棰樼洰鐨勫浘鐗?'
      return
    }

    const parts = parseQuestionIdParts(questionId)
    if (!parts) {
      state.visualizerRepairError = true
      state.visualizerRepairStatus = `鏃犳硶浠?questionId 瑙ｆ瀽绔犺妭淇℃伅锛?${questionId || 'unknown'}`
      return
    }

    state.visualizerRepairProcessing = true
    state.visualizerRepairError = false
    state.visualizerRepairStatus = `姝ｅ湪鏍规嵁鍥剧墖閲嶅啓 ${questionTitle || questionId}...`
    state.visualizerRewriteResult = null

    try {
      const formData = new FormData()
      formData.append('jsonFilePath', state.visualizerServerJsonPath)
      formData.append('sourceFileName', state.visualizerFileName || '')
      formData.append('chapterNo', String(parts.chapterNo))
      formData.append('sectionNo', String(parts.sectionNo))
      formData.append('questionNo', String(parts.questionNo))
      for (const file of state.visualizerRepairImageFiles) {
        formData.append('images', file, file.name)
      }

      const resp = await fetch('/api/textbook-json/repair-question', {
        method: 'POST',
        body: formData,
      })
      const data = await parseApiResponse(resp)
      if (!resp.ok) {
        throw new Error(data.message || '褰撳墠棰樼洰閲嶅啓澶辫触')
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
        syncWarning = syncError instanceof Error ? syncError.message : '鍥炲啓鏈湴鏂囦欢澶辫触'
      }
      state.visualizerRepairStatus = syncWarning
        ? `宸叉寜鍥剧墖閲嶅啓 ${state.visualizerRewriteResult.questionTitle}锛屼絾鍥炲啓鏈湴鏂囦欢澶辫触锛?${syncWarning}`
        : `宸叉寜鍥剧墖閲嶅啓 ${state.visualizerRewriteResult.questionTitle}`
    } catch (error) {
      state.visualizerRepairError = true
      state.visualizerRepairStatus = error instanceof Error ? error.message : '褰撳墠棰樼洰閲嶅啓澶辫触'
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

  async function uploadJsonFileToWorkspace(file) {
    const formData = new FormData()
    formData.append('json', file, file.name)
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

  async function readWorkspaceJsonText(filePath) {
    const resp = await fetch('/api/textbook-json/read', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filePath,
      }),
    })
    const data = await parseApiResponse(resp)
    if (!resp.ok) {
      throw new Error(data.message || '璇诲彇宸ヤ綔鍓湰澶辫触')
    }
    return String(data.text || '')
  }

  async function syncJsonHandleFromWorkspace(filePath, fileHandle) {
    if (!filePath || !fileHandle) {
      return
    }

    const text = await readWorkspaceJsonText(filePath)
    const writable = await fileHandle.createWritable()
    await writable.write(text)
    await writable.close()
  }

  async function importJsonFileToWorkspace(file) {
    const data = await uploadJsonFileToWorkspace(file)
    state.chapterSessionServerJsonPath = String(data.filePath || '')
    state.chapterSessionJsonLabel = file.name
    return data
  }

  async function syncWorkingJsonToLocalFile() {
    await syncJsonHandleFromWorkspace(state.chapterSessionServerJsonPath, state.chapterSessionJsonHandle)
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
    await syncJsonHandleFromWorkspace(state.visualizerServerJsonPath, state.visualizerFileHandle)
  }

  async function chooseJsonSessionFile() {
    if (!supportsPicker('showOpenFilePicker')) {
      state.chapterSessionError = true
      state.chapterSessionStatus = '当前浏览器不支持 JSON 文件选择器，请使用 Chromium 内核浏览器'
      return
    }

    try {
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
      JSON.parse(text)
      await importJsonFileToWorkspace(file)
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

  async function chooseAutoImageFolder() {
    if (!supportsPicker('showDirectoryPicker')) {
      state.chapterAutoError = true
      state.chapterAutoStatus = '当前浏览器不支持文件夹选择器，请使用 Chromium 内核浏览器'
      return
    }

    async function collectImages(directoryHandle, prefix = '') {
      const files = []
      for await (const entry of directoryHandle.values()) {
        const nextPrefix = prefix ? `${prefix}/${entry.name}` : entry.name
        if (entry.kind === 'directory') {
          files.push(...await collectImages(entry, nextPrefix))
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

    try {
      const handle = await window.showDirectoryPicker()
      const images = await collectImages(handle)
      images.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true, sensitivity: 'base' }))
      if (!images.length) {
        throw new Error('所选文件夹中没有图片文件')
      }
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

  function createSuggestedJsonFileName() {
    const base =
      String(state.jsonForm.textbookId || '').trim() ||
      String(state.jsonForm.title || '').trim() ||
      'textbook'
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
        await importJsonFileToWorkspace(localFile)
        state.chapterSessionJsonHandle = handle
        state.generatedTextbookJson = text.trim()
        state.jsonSaveStatus = `已保存并载入当前工作副本：${handle.name || suggestedName}`
      } else {
        triggerJsonDownload(suggestedName, text)
        const localFile = new File([text], suggestedName, { type: 'application/json' })
        await importJsonFileToWorkspace(localFile)
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

  async function initChapterSession() {
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
      const resp = await fetch('/api/chapters/session/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonFilePath: state.chapterSessionServerJsonPath,
          currentChapterTitle: state.chapterSessionInitChapter,
          currentSectionTitle: state.chapterSessionInitSection,
        }),
      })
      const data = await parseApiResponse(resp)
      if (!resp.ok) {
        throw new Error(data.message || '初始化失败')
      }
      state.chapterSessionId = String(data.sessionId || '')
      state.chapterSessionCurrentChapter = String(data.currentChapterTitle || '')
      state.chapterSessionCurrentSection = String(data.currentSectionTitle || '')
      state.chapterSessionStatus = `初始化成功，chapters: ${data.chaptersCount}，questions: ${data.questionsCount || 0}`
      await syncWorkingJsonToLocalFile().catch(() => {})
    } catch (error) {
      state.chapterSessionError = true
      state.chapterSessionStatus = error instanceof Error ? error.message : '初始化失败'
    }
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
          chapterCount: Number(data.counts?.chapterCount ?? 0),
          questionRowCount: Number(data.counts?.questionRowCount ?? 0),
          groupQuestionCount: Number(data.counts?.groupQuestionCount ?? 0),
          leafQuestionCount: Number(data.counts?.leafQuestionCount ?? 0),
          childQuestionCount: Number(data.counts?.childQuestionCount ?? 0),
        },
        textbooks: Array.isArray(data.textbooks) ? data.textbooks : [],
      }
      state.dbSummaryStatus = `当前 schema：${state.dbSummary.schema}，教材 ${state.dbSummary.counts.textbookCount} 本，题目行 ${state.dbSummary.counts.questionRowCount} 条`
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
    state.dbImportStatus = `正在导入 ${state.dbImportFiles.length} 个 JSON 文件到数据库...`
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

    const chapterNo = Number(state.repairForm.chapterNo)
    const sectionNo = Number(state.repairForm.sectionNo)
    const questionNo = Number(state.repairForm.questionNo)
    if (!Number.isInteger(chapterNo) || chapterNo <= 0 || !Number.isInteger(sectionNo) || sectionNo <= 0 || !Number.isInteger(questionNo) || questionNo <= 0) {
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
      formData.append('jsonFilePath', state.chapterSessionServerJsonPath)
      formData.append('chapterNo', String(chapterNo))
      formData.append('sectionNo', String(sectionNo))
      formData.append('questionNo', String(questionNo))
      formData.append('sourceFileName', state.chapterSessionJsonLabel || '')
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

    const chapterNo = Number(state.imageAttachForm.chapterNo)
    const sectionNo = Number(state.imageAttachForm.sectionNo)
    const questionNo = Number(state.imageAttachForm.questionNo)
    const childNoText = String(state.imageAttachForm.childNo || '').trim()
    const childNo = childNoText ? Number(childNoText) : null

    if (
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
      formData.append('jsonFilePath', state.chapterSessionServerJsonPath)
      formData.append('sourceFileName', state.chapterSessionJsonLabel || '')
      formData.append('chapterNo', String(chapterNo))
      formData.append('sectionNo', String(sectionNo))
      formData.append('questionNo', String(questionNo))
      if (childNoText) {
        formData.append('childNo', String(childNo))
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

    const chapterNo = Number(state.repairForm.chapterNo)
    const sectionNo = Number(state.repairForm.sectionNo)
    const questionNo = Number(state.repairForm.questionNo)
    if (
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

    const targetType = String(state.mathFormatRepairForm.targetType || '').trim()
    const requiresChildNo = targetType === 'childPrompt' || targetType === 'childStandardAnswer'
    const childNo = String(state.mathFormatRepairForm.childNo || '').trim()
    if (!targetType) {
      state.mathFormatRepairError = true
      state.mathFormatRepairStatus = '请选择要修复的字段'
      return
    }
    if (requiresChildNo) {
      const numericChildNo = Number(childNo)
      if (!Number.isInteger(numericChildNo) || numericChildNo <= 0) {
        state.mathFormatRepairError = true
        state.mathFormatRepairStatus = '修复小题字段时，小题号必须是正整数'
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
        body: JSON.stringify({
          jsonFilePath: state.chapterSessionServerJsonPath,
          sourceFileName: state.chapterSessionJsonLabel || '',
          chapterNo,
          sectionNo,
          questionNo,
          targetType,
          childNo: requiresChildNo ? Number(childNo) : null,
        }),
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
    chooseAutoImageFolder,
    chooseJsonSessionFile,
    chooseVisualizerJsonFile,
    onDbImportFilesChange,
    removeDbImportFile,
    clearDbImportFiles,
    loadQuestionBankDbSummary,
    importQuestionBankDbJsonFiles,
    fillAssistantPrompt,
    clearQuestionBankAssistantChat,
    sendQuestionBankAssistantMessage,
    generateTextbookJson,
    saveTextbookJson,
    initChapterSession,
    onVisualizerJsonChange,
    onVisualizerRepairImageChange,
    clearVisualizerRepairImages,
    reloadVisualizerJsonFile,
    repairQuestionFromVisualizer,
    repairMathFormatFromVisualizer,
    onMergeJsonFilesChange,
    removeMergeJsonFile,
    clearMergeJsonFiles,
    mergeJsonFiles,
    onImageAttachFilesChange,
    onImageAttachPaste,
    clearImageAttachFiles,
    attachImagesToQuestionJson,
    onRepairImageChange,
    repairQuestionInJson,
    repairQuestionMathFormat,
    onChapterImageChange,
    setChapterProcessingMode,
    processChapterImage,
    runChapterAuto,
    stopChapterAuto,
    resetChapterAuto,
    onFileChange,
    moveSelectedPdf,
    removeSelectedPdf,
    clearSelectedPdfs,
    uploadPdf,
  }

  return {
    state,
    actions,
  }
}
