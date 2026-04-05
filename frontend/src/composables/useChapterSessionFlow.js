export function createChapterSessionFlow(deps) {
  const {
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
  } = deps

  let chapterAutoAbortController = null

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
      const data = await requestChapterProcessImage({
        processingProfile,
        chapterArkHeaders,
        sessionId: state.chapterSessionId,
        imageFile: state.chapterImageFile,
        currentChapterTitle: state.chapterSessionCurrentChapter,
        currentSectionTitle: state.chapterSessionCurrentSection,
      })
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
          const data = await requestChapterProcessImage({
            processingProfile,
            chapterArkHeaders,
            sessionId: state.chapterSessionId,
            imageFile: current.file,
            lookaheadFile: lookahead?.file || null,
            currentChapterTitle: state.chapterSessionCurrentChapter,
            currentSectionTitle: state.chapterSessionCurrentSection,
            signal: chapterAutoAbortController.signal,
          })

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

  return {
    chooseAutoImageFolder,
    initChapterSession,
    processChapterImage,
    runChapterAuto,
    stopChapterAuto,
    resetChapterAuto,
  }
}
