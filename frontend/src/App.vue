<template>
  <div class="page">
    <div class="card">
      <h1>PDF 课本转 JPG</h1>
      <p>上传 PDF 后，后端会把每一页转成 JPG 并保存；你可以勾选图片交给豆包模型读取。</p>

      <div class="json-generator">
        <h2>课本 JSON 生成（第 1 步）</h2>
        <p>先填写基础信息，生成包含固定 key 的 JSON；`chapters` 和 `questions` 先留空。</p>
        <div class="json-form-grid">
          <input v-model.trim="jsonForm.version" type="text" placeholder="version，例如 v1.1" />
          <input v-model.trim="jsonForm.courseId" type="text" placeholder="courseId，例如 c_001" />
          <input v-model.trim="jsonForm.textbookId" type="text" placeholder="textbookId" />
          <input v-model.trim="jsonForm.title" type="text" placeholder="textbook.title" />
          <input v-model.trim="jsonForm.publisher" type="text" placeholder="textbook.publisher" />
          <input v-model.trim="jsonForm.subject" type="text" placeholder="textbook.subject" />
        </div>
        <div class="upload-row">
          <button @click="generateTextbookJson">生成基础 JSON</button>
          <button @click="saveTextbookJson">保存到文件夹</button>
        </div>
        <div class="json-form-grid">
          <input v-model.trim="jsonSaveDir" type="text" placeholder="保存目录（必须已存在）" />
          <input v-model.trim="jsonFileName" type="text" placeholder="文件名（可选，如 textbook_step1.json）" />
        </div>
        <div class="status error" v-if="jsonFormError">{{ jsonFormError }}</div>
        <div class="status" :class="{ error: jsonSaveError }" v-if="jsonSaveStatus">{{ jsonSaveStatus }}</div>
        <pre class="read-result" v-if="generatedTextbookJson">{{ generatedTextbookJson }}</pre>
      </div>

      <div class="json-generator">
        <h2>Chapters 提取（逐页手动）</h2>
        <p>初始化当前章/小节后，每次手动上传一张图触发一次，会同步处理 chapters + questions。</p>
        <div class="json-form-grid">
          <input v-model.trim="chapterSessionJsonPath" type="text" placeholder="目标 JSON 文件路径" />
          <input v-model.trim="chapterSessionInitChapter" type="text" placeholder="当前章（如 第一章 实数集与函数）" />
          <input v-model.trim="chapterSessionInitSection" type="text" placeholder="当前小节（如 习题1.1）" />
        </div>
        <div class="upload-row">
          <button @click="initChapterSession">初始化会话</button>
        </div>
        <div class="status" :class="{ error: chapterSessionError }" v-if="chapterSessionStatus">{{ chapterSessionStatus }}</div>

        <div class="json-form-grid" v-if="chapterSessionId">
          <input type="text" :value="`sessionId: ${chapterSessionId}`" readonly />
          <input type="text" :value="`当前章: ${chapterSessionCurrentChapter}`" readonly />
          <input type="text" :value="`当前小节: ${chapterSessionCurrentSection}`" readonly />
        </div>
        <div class="upload-row" v-if="chapterSessionId">
          <input type="file" accept="image/png,image/jpeg,image/webp" @change="onChapterImageChange" />
          <button :disabled="chapterProcessing || !chapterImageFile" @click="processChapterImage">
            {{ chapterProcessing ? '处理中...' : '处理当前图片（chapters + questions）' }}
          </button>
        </div>
        <div class="json-form-grid" v-if="chapterSessionId">
          <input
            v-model.trim="chapterAutoImageDir"
            type="text"
            placeholder="自动处理目录（例如 D:\\ai-homework-system\\question_bank_auto\\output_images\\数学分析）"
          />
        </div>
        <div class="upload-row" v-if="chapterSessionId">
          <button :disabled="chapterAutoRunning || !chapterAutoImageDir" @click="runChapterAuto">
            {{ chapterAutoRunning ? '自动处理中...' : '自动逐页处理目录' }}
          </button>
        </div>
        <div class="status" :class="{ error: chapterAutoError }" v-if="chapterAutoStatus">{{ chapterAutoStatus }}</div>
        <div class="status" v-if="chapterAutoProgress && !chapterAutoError">{{ chapterAutoProgress }}</div>
        <pre class="read-result" v-if="chapterAutoLogs">{{ chapterAutoLogs }}</pre>
        <pre class="read-result" v-if="chapterPassLogs">{{ chapterPassLogs }}</pre>
      </div>

      <div class="upload-row">
        <input
          type="text"
          v-model.trim="folderName"
          placeholder="请输入图片文件夹名，如 math_book_1"
          class="folder-input"
        />
        <input type="file" accept="application/pdf" @change="onFileChange" />
        <button :disabled="loading || !selectedFile || !folderName" @click="uploadPdf">
          {{ loading ? '转换中...' : '上传并转换' }}
        </button>
      </div>

      <div class="status" :class="{ error: isError }">{{ statusText }}</div>

      <div class="direct-ai">
        <h2>图片直传豆包读取</h2>
        <p>可直接上传图片给豆包模型读取，不依赖 PDF 转换。</p>
        <div class="upload-row">
          <input type="file" accept="image/png,image/jpeg,image/webp" multiple @change="onAiImageChange" />
          <button :disabled="reading || aiImageFiles.length === 0" @click="readUploadedImagesByDoubao">
            {{ reading ? '读取中...' : '上传图片并读取' }}
          </button>
        </div>
      </div>

      <div class="status" :class="{ error: readError }" v-if="readStatusText">{{ readStatusText }}</div>
      <a v-if="savedTextUrl" :href="savedTextUrl" target="_blank" class="txt-link">打开保存的 TXT</a>
      <pre class="read-result" v-if="readText">{{ readText }}</pre>

      <template v-if="pages.length > 0">
        <div class="result-head">
          <strong>共 {{ pages.length }} 页</strong>
          <span>文件夹: {{ outputFolder }} | 批次: {{ batchId }}</span>
        </div>

        <div class="result-actions">
          <span>已选 {{ selectedImageUrls.length }} 张</span>
          <button class="ghost-btn" @click="toggleSelectAll">
            {{ selectedImageUrls.length === pages.length ? '取消全选' : '全选' }}
          </button>
          <button
            :disabled="reading || selectedImageUrls.length === 0"
            @click="readSelectedByDoubao"
          >
            {{ reading ? '读取中...' : '豆包读取选中图片' }}
          </button>
        </div>

        <div class="image-grid">
          <div
            class="image-card"
            :class="{ selected: selectedImageUrls.includes(item.url) }"
            v-for="item in pages"
            :key="item.filename"
          >
            <label class="select-row">
              <input
                type="checkbox"
                :checked="selectedImageUrls.includes(item.url)"
                @change="toggleImage(item.url, $event.target.checked)"
              />
              选择
            </label>
            <img :src="item.url" :alt="item.filename" loading="lazy" />
            <div class="meta">第 {{ item.page }} 页 - {{ item.filename }}</div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const selectedFile = ref(null)
const folderName = ref('')
const loading = ref(false)
const isError = ref(false)
const statusText = ref('请选择一个 PDF 文件')
const batchId = ref('')
const outputFolder = ref('')
const pages = ref([])

const selectedImageUrls = ref([])
const aiImageFiles = ref([])
const reading = ref(false)
const readError = ref(false)
const readStatusText = ref('')
const readText = ref('')
const savedTextUrl = ref('')
const generatedTextbookJson = ref('')
const jsonFormError = ref('')
const jsonSaveDir = ref('D:\\ai-homework-system\\question_bank_auto\\output_json')
const jsonFileName = ref('')
const jsonSaveStatus = ref('')
const jsonSaveError = ref(false)
const chapterSessionJsonPath = ref('C:\\Users\\27145\\Desktop\\test\\output\\math8.json')
const chapterSessionInitChapter = ref('第八章 不定积分')
const chapterSessionInitSection = ref('习题8.1')
const chapterSessionId = ref('')
const chapterSessionCurrentChapter = ref('')
const chapterSessionCurrentSection = ref('')
const chapterSessionStatus = ref('')
const chapterSessionError = ref(false)
const chapterImageFile = ref('')
const chapterProcessing = ref(false)
const chapterPassLogs = ref('')
const chapterAutoImageDir = ref('')
const chapterAutoRunning = ref(false)
const chapterAutoStatus = ref('')
const chapterAutoError = ref(false)
const chapterAutoLogs = ref('')
const chapterAutoProgress = ref('')
const jsonForm = ref({
  version: 'v1.1',
  courseId: '',
  textbookId: '',
  title: '',
  publisher: '',
  subject: '',
})

function buildTextbookPayload() {
  return {
    version: String(jsonForm.value.version || '').trim(),
    courseId: String(jsonForm.value.courseId || '').trim(),
    textbook: {
      textbookId: String(jsonForm.value.textbookId || '').trim(),
      title: String(jsonForm.value.title || '').trim(),
      publisher: String(jsonForm.value.publisher || '').trim(),
      subject: String(jsonForm.value.subject || '').trim(),
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

function resetReadState() {
  selectedImageUrls.value = []
  reading.value = false
  readError.value = false
  readStatusText.value = ''
  readText.value = ''
  savedTextUrl.value = ''
}

function appendChapterAutoLog(line) {
  chapterAutoLogs.value = chapterAutoLogs.value ? `${chapterAutoLogs.value}\n${line}` : line
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

function generateTextbookJson() {
  const payload = buildTextbookPayload()

  if (!payload.version || !payload.courseId || !payload.textbook.textbookId) {
    jsonFormError.value = '请至少填写 version、courseId、textbookId'
    generatedTextbookJson.value = ''
    return
  }

  jsonFormError.value = ''
  jsonSaveStatus.value = ''
  jsonSaveError.value = false
  generatedTextbookJson.value = JSON.stringify(payload, null, 2)
}

async function saveTextbookJson() {
  const payload = buildTextbookPayload()
  if (!payload.version || !payload.courseId || !payload.textbook.textbookId) {
    jsonFormError.value = '请至少填写 version、courseId、textbookId'
    generatedTextbookJson.value = ''
    return
  }
  if (!jsonSaveDir.value.trim()) {
    jsonSaveError.value = true
    jsonSaveStatus.value = '请填写保存目录'
    return
  }

  jsonFormError.value = ''
  jsonSaveError.value = false
  jsonSaveStatus.value = '保存中...'
  generatedTextbookJson.value = JSON.stringify(payload, null, 2)

  try {
    const resp = await fetch('/api/textbook-json/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        payload,
        saveDir: jsonSaveDir.value.trim(),
        fileName: jsonFileName.value.trim(),
      }),
    })
    const data = await parseApiResponse(resp)
    if (!resp.ok) {
      throw new Error(data.message || '保存失败')
    }
    jsonSaveStatus.value = `已保存: ${data.savePath}`
  } catch (error) {
    jsonSaveError.value = true
    jsonSaveStatus.value = error instanceof Error ? error.message : '保存失败'
  }
}

async function initChapterSession() {
  if (!chapterSessionJsonPath.value || !chapterSessionInitChapter.value || !chapterSessionInitSection.value) {
    chapterSessionError.value = true
    chapterSessionStatus.value = '请填写 JSON 路径、当前章、当前小节'
    return
  }
  chapterSessionError.value = false
  chapterSessionStatus.value = '初始化中...'
  chapterPassLogs.value = ''
  chapterAutoError.value = false
  chapterAutoStatus.value = ''
  chapterAutoLogs.value = ''
  chapterAutoProgress.value = ''

  try {
    const resp = await fetch('/api/chapters/session/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonFilePath: chapterSessionJsonPath.value,
        currentChapterTitle: chapterSessionInitChapter.value,
        currentSectionTitle: chapterSessionInitSection.value,
      }),
    })
    const data = await parseApiResponse(resp)
    if (!resp.ok) {
      throw new Error(data.message || '初始化失败')
    }
    chapterSessionId.value = String(data.sessionId || '')
    chapterSessionCurrentChapter.value = String(data.currentChapterTitle || '')
    chapterSessionCurrentSection.value = String(data.currentSectionTitle || '')
    chapterSessionStatus.value = `初始化成功，chapters: ${data.chaptersCount}，questions: ${data.questionsCount || 0}`
  } catch (error) {
    chapterSessionError.value = true
    chapterSessionStatus.value = error instanceof Error ? error.message : '初始化失败'
  }
}

function onChapterImageChange(event) {
  chapterImageFile.value = event.target.files?.[0] ?? null
}

async function processChapterImage() {
  if (!chapterSessionId.value) {
    chapterSessionError.value = true
    chapterSessionStatus.value = '请先初始化会话'
    return
  }
  if (!chapterImageFile.value) {
    chapterSessionError.value = true
    chapterSessionStatus.value = '请先选择图片'
    return
  }

  chapterProcessing.value = true
  chapterSessionError.value = false
  chapterSessionStatus.value = '处理中...'

  try {
    const formData = new FormData()
    formData.append('sessionId', chapterSessionId.value)
    formData.append('image', chapterImageFile.value)
    formData.append('currentChapterTitle', chapterSessionCurrentChapter.value)
    formData.append('currentSectionTitle', chapterSessionCurrentSection.value)

    const resp = await fetch('/api/chapters/session/process-image', {
      method: 'POST',
      body: formData,
    })
    const data = await parseApiResponse(resp)
    if (!resp.ok) {
      throw new Error(data.message || '处理失败')
    }
    chapterSessionCurrentChapter.value = String(data.currentChapterTitle || '')
    chapterSessionCurrentSection.value = String(data.currentSectionTitle || '')
    const question = data.question || {}
    if (question.pending) {
      chapterSessionStatus.value = `当前页处理完成，检测到跨页题 ${question.continueQuestionKey || ''}，等待下一页。当前小节: ${chapterSessionCurrentSection.value}，跨页队列: ${question.pendingPagesCount ?? '?'} 页`
    } else {
      chapterSessionStatus.value = `当前页处理完成并已入库。当前小节: ${chapterSessionCurrentSection.value}，新增题目: ${question.upsertedCount ?? 0}，总 questions: ${data.questionsCount}`
    }
    chapterPassLogs.value = JSON.stringify(
      {
        chapters: data.passLogs || [],
        question,
      },
      null,
      2,
    )
  } catch (error) {
    chapterSessionError.value = true
    chapterSessionStatus.value = error instanceof Error ? error.message : '处理失败'
  } finally {
    chapterProcessing.value = false
  }
}

async function runChapterAuto() {
  if (!chapterSessionId.value) {
    chapterAutoError.value = true
    chapterAutoStatus.value = '请先初始化会话'
    return
  }
  if (!chapterAutoImageDir.value.trim()) {
    chapterAutoError.value = true
    chapterAutoStatus.value = '请填写自动处理目录'
    return
  }

  chapterAutoRunning.value = true
  chapterAutoError.value = false
  chapterAutoStatus.value = '自动处理中...'
  chapterAutoLogs.value = ''
  chapterAutoProgress.value = ''

  try {
    const resp = await fetch('/api/chapters/session/auto-run-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: chapterSessionId.value,
        imageDir: chapterAutoImageDir.value.trim(),
        currentChapterTitle: chapterSessionCurrentChapter.value,
        currentSectionTitle: chapterSessionCurrentSection.value,
      }),
    })
    if (!resp.ok) {
      const data = await parseApiResponse(resp)
      throw new Error(data.message || '自动处理失败')
    }
    if (!resp.body) {
      throw new Error('自动处理流为空')
    }

    const reader = resp.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''
    let finalDoneEvent = null

    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const rawLine of lines) {
        const line = rawLine.trim()
        if (!line) continue
        const event = JSON.parse(line)
        const message = formatAutoProgressLine(event)
        if (message) {
          chapterAutoProgress.value = message
          appendChapterAutoLog(message)
        }
        if (event.type === 'result' && event.status === 'success') {
          chapterSessionCurrentChapter.value = String(event.currentChapterTitle || chapterSessionCurrentChapter.value)
          chapterSessionCurrentSection.value = String(event.currentSectionTitle || chapterSessionCurrentSection.value)
        }
        if (event.type === 'done') {
          finalDoneEvent = event
        }
        if (event.type === 'error') {
          throw new Error(event.message || '自动处理失败')
        }
      }
    }

    if (buffer.trim()) {
      const event = JSON.parse(buffer.trim())
      const message = formatAutoProgressLine(event)
      if (message) {
        chapterAutoProgress.value = message
        appendChapterAutoLog(message)
      }
      if (event.type === 'done') {
        finalDoneEvent = event
      }
      if (event.type === 'error') {
        throw new Error(event.message || '自动处理失败')
      }
    }

    if (!finalDoneEvent) {
      throw new Error('自动处理未返回完成事件')
    }

    chapterSessionCurrentChapter.value = String(finalDoneEvent.currentChapterTitle || chapterSessionCurrentChapter.value)
    chapterSessionCurrentSection.value = String(finalDoneEvent.currentSectionTitle || chapterSessionCurrentSection.value)
    chapterAutoStatus.value = `自动处理完成，成功 ${finalDoneEvent.successCount} 张，失败 ${finalDoneEvent.failedCount} 张`
  } catch (error) {
    chapterAutoError.value = true
    chapterAutoStatus.value = error instanceof Error ? error.message : '自动处理失败'
  } finally {
    chapterAutoRunning.value = false
  }
}

function onFileChange(event) {
  const file = event.target.files?.[0] ?? null
  selectedFile.value = file
  batchId.value = ''
  outputFolder.value = ''
  pages.value = []
  resetReadState()

  if (file) {
    isError.value = false
    statusText.value = `已选择: ${file.name}`
  } else {
    statusText.value = '请选择一个 PDF 文件'
  }
}

function toggleImage(url, checked) {
  const current = new Set(selectedImageUrls.value)
  if (checked) {
    current.add(url)
  } else {
    current.delete(url)
  }
  selectedImageUrls.value = Array.from(current)
}

function toggleSelectAll() {
  if (selectedImageUrls.value.length === pages.value.length) {
    selectedImageUrls.value = []
    return
  }
  selectedImageUrls.value = pages.value.map((item) => item.url)
}

function onAiImageChange(event) {
  const files = Array.from(event.target.files ?? [])
  aiImageFiles.value = files
  readError.value = false
  if (files.length) {
    readStatusText.value = `已选择 ${files.length} 张图片`
  } else {
    readStatusText.value = ''
  }
}

async function uploadPdf() {
  if (!selectedFile.value) {
    isError.value = true
    statusText.value = '请先选择 PDF 文件'
    return
  }
  if (!folderName.value) {
    isError.value = true
    statusText.value = '请先输入文件夹名'
    return
  }

  loading.value = true
  isError.value = false
  statusText.value = '上传并转换中...'

  try {
    const formData = new FormData()
    formData.append('pdf', selectedFile.value)
    formData.append('folderName', folderName.value)

    const resp = await fetch('/api/convert', {
      method: 'POST',
      body: formData,
    })

    const data = await parseApiResponse(resp)
    if (!resp.ok) {
      throw new Error(data.message || '转换失败')
    }

    batchId.value = data.batchId || ''
    outputFolder.value = data.folderName || folderName.value
    pages.value = Array.isArray(data.pages) ? data.pages : []
    resetReadState()
    statusText.value = `转换完成，共 ${pages.value.length} 页`
  } catch (error) {
    isError.value = true
    statusText.value = error instanceof Error ? error.message : '转换失败'
  } finally {
    loading.value = false
  }
}

async function readSelectedByDoubao() {
  if (selectedImageUrls.value.length === 0) {
    readError.value = true
    readStatusText.value = '请先选择至少一张图片'
    return
  }

  reading.value = true
  readError.value = false
  readStatusText.value = '豆包读取中...'

  try {
    const resp = await fetch('/api/doubao/read', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        imageUrls: selectedImageUrls.value,
      }),
    })

    const data = await parseApiResponse(resp)
    if (!resp.ok) {
      throw new Error(data.message || '豆包读取失败')
    }

    readText.value = String(data.text || '')
    savedTextUrl.value = String(data.savedTextUrl || '')
    readStatusText.value = `读取完成，模型: ${data.model || 'doubao-seed-2-0-pro-260215'}`
  } catch (error) {
    readError.value = true
    readStatusText.value = error instanceof Error ? error.message : '豆包读取失败'
  } finally {
    reading.value = false
  }
}

async function readUploadedImagesByDoubao() {
  if (!aiImageFiles.value.length) {
    readError.value = true
    readStatusText.value = '请先选择图片'
    return
  }

  reading.value = true
  readError.value = false
  readStatusText.value = '上传图片并读取中...'

  try {
    const formData = new FormData()
    for (const file of aiImageFiles.value) {
      formData.append('images', file)
    }

    const resp = await fetch('/api/doubao/read-files', {
      method: 'POST',
      body: formData,
    })

    const data = await parseApiResponse(resp)
    if (!resp.ok) {
      throw new Error(data.message || '豆包读取失败')
    }

    readText.value = String(data.text || '')
    savedTextUrl.value = String(data.savedTextUrl || '')
    readStatusText.value = `读取完成，模型: ${data.model || 'doubao-seed-2-0-pro-260215'}`
  } catch (error) {
    readError.value = true
    readStatusText.value = error instanceof Error ? error.message : '豆包读取失败'
  } finally {
    reading.value = false
  }
}
</script>

<style scoped>
:global(*) {
  box-sizing: border-box;
}

:global(body) {
  margin: 0;
  min-height: 100vh;
  font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  color: #183153;
  background: radial-gradient(circle at 20% 10%, #ffffff 0%, #f4f7fb 40%, #dce7f5 100%);
}

.page {
  width: min(1100px, calc(100vw - 32px));
  margin: 24px auto;
}

.card {
  background: #fff;
  border: 1px solid #d9e2ee;
  border-radius: 16px;
  padding: 18px;
  box-shadow: 0 12px 30px rgba(24, 49, 83, 0.08);
}

h1 {
  margin: 0 0 8px;
  font-size: 40px;
}

p {
  margin: 0;
  color: #4e6076;
}

.upload-row {
  margin-top: 16px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

input[type='file'] {
  flex: 1;
  min-width: 260px;
  border: 1px dashed #d9e2ee;
  border-radius: 12px;
  padding: 10px;
  background: #fbfdff;
}

.folder-input {
  flex: 1;
  min-width: 260px;
  border: 1px solid #d9e2ee;
  border-radius: 12px;
  padding: 10px;
  background: #fff;
}

button {
  border: 0;
  border-radius: 12px;
  background: #1f6feb;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  padding: 11px 18px;
  cursor: pointer;
}

button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.ghost-btn {
  background: #eef5ff;
  color: #1f6feb;
}

.status {
  margin-top: 12px;
  font-size: 14px;
}

.status.error {
  color: #b42318;
}

.result-head {
  margin-top: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.direct-ai {
  margin-top: 18px;
  padding: 12px;
  border: 1px solid #d9e2ee;
  border-radius: 12px;
  background: #f9fcff;
}

.json-generator {
  margin-top: 18px;
  padding: 12px;
  border: 1px solid #d9e2ee;
  border-radius: 12px;
  background: #f9fcff;
}

.json-generator h2 {
  margin: 0;
  font-size: 18px;
}

.json-generator p {
  margin-top: 6px;
}

.json-form-grid {
  margin-top: 12px;
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
}

.json-form-grid input {
  border: 1px solid #d9e2ee;
  border-radius: 10px;
  padding: 10px;
  background: #fff;
}

.direct-ai h2 {
  margin: 0;
  font-size: 18px;
}

.direct-ai p {
  margin-top: 6px;
}

.result-actions {
  margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.read-result {
  margin-top: 8px;
  border: 1px solid #d9e2ee;
  border-radius: 12px;
  background: #f8fbff;
  padding: 12px;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 320px;
  overflow: auto;
}

.txt-link {
  display: inline-block;
  margin-top: 8px;
  color: #1f6feb;
  text-decoration: none;
}

.image-grid {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}

.image-card {
  border: 1px solid #d9e2ee;
  border-radius: 12px;
  overflow: hidden;
  background: #fff;
}

.image-card.selected {
  border-color: #1f6feb;
  box-shadow: 0 0 0 1px #1f6feb;
}

.select-row {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
  border-bottom: 1px solid #e7edf6;
  font-size: 13px;
  color: #4e6076;
}

.image-card img {
  width: 100%;
  display: block;
  background: #f7f9fc;
}

.meta {
  padding: 8px 10px;
  font-size: 13px;
  color: #4e6076;
}
</style>
