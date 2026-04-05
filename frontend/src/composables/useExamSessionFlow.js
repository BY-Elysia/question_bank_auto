function getLocalFileDisplayName(file) {
  return String(file?.webkitRelativePath || file?.name || '').trim()
}

function compareLocalFileDisplayName(left, right) {
  return getLocalFileDisplayName(left).localeCompare(getLocalFileDisplayName(right), 'zh-CN', {
    numeric: true,
    sensitivity: 'base',
  })
}

function sortLocalFiles(files) {
  return [...(Array.isArray(files) ? files : [])].sort(compareLocalFileDisplayName)
}

export function applyExamSourceMeta(state, meta) {
  if (!meta || typeof meta !== 'object') {
    return
  }
  state.examSessionTitle = String(meta.title || '').trim()
  state.examSessionExamType = String(meta.examType || '').trim() || 'midterm'
  state.examSessionHasAnswer = meta.hasAnswer !== false
}

export function createExamSessionFlow(deps) {
  const {
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
  } = deps

  let examAutoAbortController = null

  async function refreshExamSessionPayloadFromWorkspace() {
    if (!state.examSessionServerJsonPath && !state.examSessionJsonAssetId) {
      state.examSessionPayload = null
      return null
    }
    const text = await readWorkspaceJsonText({
      workspaceId: state.currentWorkspaceId,
      jsonAssetId: state.examSessionJsonAssetId,
      jsonFilePath: state.examSessionServerJsonPath,
    })
    const parsed = JSON.parse(text)
    const chapters = Array.isArray(parsed?.chapters) ? parsed.chapters : null
    const questions = Array.isArray(parsed?.questions) ? parsed.questions : null
    if (!chapters || !questions) {
      throw new Error('当前试卷 JSON 缺少 chapters 或 questions 数组')
    }
    state.examSessionPayload = parsed
    applyExamSourceMeta(state, getPayloadSourceMeta(parsed))
    return parsed
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

  async function consumeNdjsonStream(resp, onEvent) {
    const reader = resp.body?.getReader?.()
    if (!reader) {
      throw new Error('浏览器不支持流式读取响应')
    }

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) {
          continue
        }
        onEvent(JSON.parse(trimmed))
      }

      if (done) {
        break
      }
    }

    const tail = buffer.trim()
    if (tail) {
      onEvent(JSON.parse(tail))
    }
  }

  async function requestExamAutoUploadRunStream(params) {
    const formData = new FormData()
    formData.append('sessionId', String(params?.sessionId || '').trim())
    if (params?.workspaceId) {
      formData.append('workspaceId', String(params.workspaceId).trim())
    }
    if (params?.folderName) {
      formData.append('folderName', String(params.folderName).trim())
    }
    ;(Array.isArray(params?.files) ? params.files : []).forEach((file, index) => {
      formData.append(`source_${index}`, file, file.name || `source_${index + 1}`)
    })

    const resp = await fetch('/api/exams/session/auto-run-upload-stream', {
      method: 'POST',
      headers: params?.chapterArkHeaders || {},
      body: formData,
      signal: params?.signal,
    })
    if (!resp.ok) {
      const data = await parseApiResponse(resp)
      throw new Error(data.message || '试卷自动处理失败')
    }
    await consumeNdjsonStream(resp, params?.onEvent || (() => {}))
  }

  function normalizeExamAutoEntries(files) {
    return sortLocalFiles(files)
      .map((item) => {
        if (typeof File !== 'undefined' && item instanceof File) {
          return {
            file: item,
            name: getLocalFileDisplayName(item) || item.name || 'source',
          }
        }
        if (item?.file && (typeof File === 'undefined' || item.file instanceof File)) {
          return {
            file: item.file,
            name: String(item.name || getLocalFileDisplayName(item.file) || item.file.name || 'source').trim(),
          }
        }
        return null
      })
      .filter(Boolean)
  }

  function getExamAutoSourceKind(files) {
    const normalized = Array.isArray(files) ? files : []
    const hasPdf = normalized.some((item) => /\.pdf$/i.test(String(item?.name || item?.file?.name || '').trim()))
    const hasImage = normalized.some((item) => /\.(png|jpe?g|webp)$/i.test(String(item?.name || item?.file?.name || '').trim()))
    if (hasPdf && hasImage) return 'mixed'
    if (hasPdf) return 'pdf'
    if (hasImage) return 'image'
    return ''
  }

  function setExamAutoFiles(files, label = '') {
    const entries = normalizeExamAutoEntries(files)
    const sourceKind = getExamAutoSourceKind(entries)
    state.examAutoFiles = entries
    state.examAutoFolderLabel = String(label || '').trim()
    state.examAutoError = sourceKind === 'mixed'
    if (!entries.length) {
      state.examAutoStatus = ''
      return
    }
    if (sourceKind === 'mixed') {
      state.examAutoStatus = '暂不支持同一批次同时上传图片和 PDF'
      return
    }
    state.examAutoStatus = sourceKind === 'pdf'
      ? `已选择 ${entries.length} 个 PDF，生成时将由后端自动切图`
      : `已选择 ${entries.length} 张图片，可直接开始生成试卷`
  }

  async function chooseExamAutoImageFolder() {
    try {
      const { handle, images } = await pickImageFolderFromPicker()
      setExamAutoFiles(images, handle.name)
    } catch (error) {
      if (error?.name === 'AbortError') {
        return
      }
      state.examAutoError = true
      state.examAutoStatus = error instanceof Error ? error.message : '选择文件夹失败'
    }
  }

  function onExamAutoFilesChange(event) {
    setExamAutoFiles(Array.from(event?.target?.files ?? []))
    if (event?.target) {
      event.target.value = ''
    }
  }

  function clearExamAutoFiles() {
    if (state.examAutoRunning) {
      return
    }
    state.examAutoFiles = []
    state.examAutoFolderLabel = ''
    state.examAutoError = false
    state.examAutoStatus = ''
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
      await refreshExamSessionPayloadFromWorkspace().catch(() => {})
      await syncExamWorkingJsonToLocalFile().catch(() => {})
    } catch (error) {
      state.examSessionError = true
      state.examSessionStatus = error instanceof Error ? error.message : '初始化失败'
    }
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
      await refreshExamSessionPayloadFromWorkspace().catch(() => {})
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
    const files = Array.isArray(state.examAutoFiles) ? state.examAutoFiles : []
    if (!files.length) {
      state.examAutoError = true
      state.examAutoStatus = '请先选择要生成试卷的图片或 PDF'
      return
    }
    if (getExamAutoSourceKind(files) === 'mixed') {
      state.examAutoError = true
      state.examAutoStatus = '暂不支持同一批次同时上传图片和 PDF'
      return
    }
    if (!state.examSessionId) {
      await initExamSession()
    }
    if (!state.examSessionId) {
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

    appendExamAutoLog(`开始自动处理，共 ${files.length} 个源文件`)

    try {
      await requestExamAutoUploadRunStream({
        chapterArkHeaders: buildChapterArkHeaders(),
        sessionId: state.examSessionId,
        workspaceId: state.currentWorkspaceId,
        folderName: state.examAutoFolderLabel || state.examSessionTitle || state.examSessionJsonLabel || 'exam_auto',
        files: files.map((item) => item.file).filter(Boolean),
        signal: examAutoAbortController.signal,
        onEvent: (event) => {
          if (!event || typeof event !== 'object') {
            return
          }
          if (event.type === 'source-ready') {
            if (event.workspaceId) {
              state.currentWorkspaceId = String(event.workspaceId || state.currentWorkspaceId || '')
            }
            if (event.outputFolder) {
              state.outputFolder = String(event.outputFolder || '')
            }
            if (event.sourceKind === 'pdf') {
              appendExamAutoLog(`已检测到 PDF，并在后端自动切图，共 ${Number(event.totalCount ?? 0)} 页`)
              state.examAutoStatus = `PDF 切图完成，共 ${Number(event.totalCount ?? 0)} 页，开始生成试卷...`
            }
            return
          }
          if (event.type === 'start') {
            appendExamAutoLog(`开始自动处理，共 ${Number(event.totalCount ?? 0)} 页`)
            state.examAutoStatus = `试卷自动处理中，共 ${Number(event.totalCount ?? 0)} 页`
            return
          }
          if (event.type === 'result') {
            const currentIndex = Number(event.currentIndex ?? 0)
            const totalCount = Number(event.totalCount ?? 0)
            const fileName = String(event.fileName || '')
            if (event.status === 'success') {
              successCount += 1
              const data = event.result || {}
              const structureLabel = buildExamStructureLabel(data)
              state.examSessionCurrentMajor = String(data.currentMajorTitle || '')
              state.examSessionCurrentMinor = String(data.currentMinorTitle || '')
              const question = buildQuestionSummary(data.question, data.questionsCount ?? 0)
              appendExamAutoLog(
                `第 ${currentIndex}/${totalCount} 页完成: ${fileName} | 当前结构: ${structureLabel || '未识别'} | 新增 ${question.upsertedCount} | ${question.pending ? '待续页' : '已完成'}`,
              )
              state.examAutoEntries.push({
                fileName,
                status: 'success',
                structureLabel,
                question,
              })
              state.examAutoLive = {
                phase: question.pending ? 'pending' : 'success',
                currentIndex,
                totalCount,
                currentFileName: fileName,
                successCount,
                failedCount,
                structureLabel,
                question,
              }
              return
            }

            const message = String(event.error || '自动处理失败')
            if (!firstFailureMessage) {
              firstFailureMessage = message
            }
            failedCount += 1
            appendExamAutoLog(`第 ${currentIndex}/${totalCount} 页失败: ${fileName} | ${message}`)
            state.examAutoEntries.push({
              fileName,
              status: 'failed',
              error: message,
            })
            state.examAutoLive = {
              phase: 'failed',
              currentIndex,
              totalCount,
              currentFileName: fileName,
              successCount,
              failedCount,
              error: message,
            }
            return
          }
          if (event.type === 'done') {
            state.examSessionCurrentMajor = String(event.currentMajorTitle || state.examSessionCurrentMajor || '')
            state.examSessionCurrentMinor = String(event.currentMinorTitle || state.examSessionCurrentMinor || '')
            state.examAutoSummary = {
              phase: 'done',
              currentIndex: state.examAutoLive?.currentIndex ?? files.length,
              totalCount: state.examAutoLive?.totalCount ?? files.length,
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
                ? `自动处理完成，成功 ${successCount} 页，失败 ${failedCount} 页。首个错误：${firstFailureMessage}`
                : `自动处理完成，成功 ${successCount} 页，失败 ${failedCount} 页`
            appendExamAutoLog(`自动处理完成，成功 ${successCount} 页，失败 ${failedCount} 页`)
            return
          }
          if (event.type === 'fatal') {
            throw new Error(String(event.error || '自动处理失败'))
          }
        },
      })
      await refreshExamSessionPayloadFromWorkspace().catch(() => {})
      await syncExamWorkingJsonToLocalFile().catch(() => {})
    } catch (error) {
      if (state.examAutoStopping || isAbortRequestError(error) || examAutoAbortController?.signal?.aborted) {
        state.examAutoError = false
        state.examAutoStatus = state.examAutoStatus || '已手动停止自动处理'
        return
      }
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

  return {
    refreshExamSessionPayloadFromWorkspace,
    chooseExamAutoImageFolder,
    onExamAutoFilesChange,
    clearExamAutoFiles,
    initExamSession,
    processExamImage,
    runExamAuto,
    stopExamAuto,
    resetExamAuto,
  }
}
