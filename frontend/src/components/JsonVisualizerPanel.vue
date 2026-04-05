<template>
  <GlassPanel
    eyebrow="Visualizer"
    title="题库可视化"
    description="支持直接加载工作区里的 JSON 和图片目录，也保留本地 JSON / 图片文件夹导入方式。"
    tone="mint"
    prominent
  >
    <div class="field-grid compact-grid">
      <div class="field field-span-2">
        <span>当前导入来源</span>
        <div class="action-row inline-row">
          <span class="glass-pill" :class="{ 'is-active': Boolean(state.visualizerImportJsonName) }">
            {{ state.visualizerImportJsonName || '尚未选择 JSON' }}
          </span>
          <span class="glass-pill" :class="{ 'is-active': Boolean(activeImportSourceLabel) }">
            {{ activeImportSourceLabel || '尚未选择图片来源' }}
          </span>
          <button class="secondary-button" :disabled="!canImportVisualizerBundle" @click="actions.importVisualizerBundle">
            {{ importVisualizerActionLabel }}
          </button>
          <button
            class="ghost-button"
            :disabled="!state.visualizerServerJsonPath"
            @click="actions.downloadCurrentVisualizerJson"
          >
            下载当前已加载 JSON
          </button>
        </div>
      </div>

      <label class="field">
        <span>可视化工作区</span>
        <select
          v-model="state.visualizerWorkspaceId"
          class="glass-input"
          :disabled="!workspaceOptions.length"
          @change="handleVisualizerWorkspaceChange"
        >
          <option value="">请选择工作区</option>
          <option v-for="workspace in workspaceOptions" :key="workspace.workspaceId" :value="workspace.workspaceId">
            {{ workspace.name || workspace.workspaceId }}
          </option>
        </select>
      </label>

      <div class="field">
        <span>当前浏览</span>
        <div class="visualizer-browser-summary">
          <span class="glass-pill" :class="{ 'is-active': Boolean(visualizerWorkspaceSelectionLabel) }">
            {{ visualizerWorkspaceSelectionLabel || '未选择工作区' }}
          </span>
          <span class="glass-pill" :class="{ 'is-active': hasVisualizerWorkspaceSelection }">
            {{ visualizerCurrentPathLabel }}
          </span>
        </div>
      </div>

      <div class="field field-span-2">
        <span>工作区目录浏览</span>
        <div class="action-row inline-row">
          <button
            class="ghost-button"
            :disabled="!hasVisualizerWorkspaceSelection || state.visualizerWorkspaceBrowserLoading"
            @click="actions.browseVisualizerWorkspace('')"
          >
            回到根目录
          </button>
          <button
            class="ghost-button"
            :disabled="!canBrowseVisualizerParent || state.visualizerWorkspaceBrowserLoading"
            @click="actions.browseVisualizerWorkspace(state.visualizerWorkspaceBrowser?.parentPath || '')"
          >
            上一级
          </button>
          <button
            class="ghost-button"
            :disabled="!hasVisualizerWorkspaceSelection || state.visualizerWorkspaceBrowserLoading"
            @click="actions.browseVisualizerWorkspace(state.visualizerWorkspaceBrowser?.currentPath || '')"
          >
            {{ state.visualizerWorkspaceBrowserLoading ? '刷新中...' : '刷新目录' }}
          </button>
          <button
            class="ghost-button"
            :disabled="!hasVisualizerWorkspaceSelection"
            @click="actions.useCurrentVisualizerWorkspacePathForVisualizer"
          >
            选当前浏览目录
          </button>
          <button
            class="ghost-button"
            :disabled="!hasVisualizerWorkspaceSelection"
            @click="actions.useDefaultWorkspaceUploadsForVisualizer"
          >
            用 uploads/source_uploads
          </button>
        </div>

        <div v-if="visualizerBreadcrumbs.length" class="visualizer-browser-crumbs">
          <button
            v-for="crumb in visualizerBreadcrumbs"
            :key="crumb.relativePath || '__root__'"
            type="button"
            class="workspace-breadcrumb"
            @click="actions.browseVisualizerWorkspace(crumb.relativePath)"
          >
            {{ crumb.name }}
          </button>
        </div>

        <p
          v-if="state.visualizerWorkspaceBrowserStatus"
          class="panel-status"
          :class="{ 'is-error': state.visualizerWorkspaceBrowserError }"
        >
          {{ state.visualizerWorkspaceBrowserStatus }}
        </p>

        <div v-if="visualizerBrowserEntries.length" class="visualizer-browser-list">
          <button
            v-if="canBrowseVisualizerParent"
            type="button"
            class="visualizer-browser-entry"
            @click="actions.browseVisualizerWorkspace(state.visualizerWorkspaceBrowser?.parentPath || '')"
          >
            <strong>..</strong>
            <span>返回上一级目录</span>
          </button>
          <button
            v-for="entry in visualizerBrowserEntries"
            :key="entry.relativePath"
            type="button"
            class="visualizer-browser-entry"
            :class="{
              'is-directory': entry.type === 'directory',
              'is-file': entry.type !== 'directory',
              'is-active':
                entry.relativePath === state.visualizerImportWorkspacePath
                || entry.relativePath === state.visualizerImportWorkspaceJsonPath,
            }"
            :disabled="entry.type !== 'directory'"
            @click="actions.browseVisualizerWorkspace(entry.relativePath)"
          >
            <strong>{{ entry.name }}</strong>
            <span>{{ entry.type === 'directory' ? '目录' : fileTypeLabel(entry.extension) }}</span>
          </button>
        </div>
        <div v-else class="visualizer-browser-empty">
          <strong>{{ hasVisualizerWorkspaceSelection ? '当前目录为空' : '请先选择工作区' }}</strong>
          <span>{{ hasVisualizerWorkspaceSelection ? '切换到别的目录，或直接使用当前目录作为图片来源。' : '选择后这里会显示该工作区的目录结构。' }}</span>
        </div>
      </div>

      <label class="file-shell field-span-2">
        <span>选择本地 JSON 文件</span>
        <input type="file" accept="application/json,.json" @change="actions.onVisualizerJsonFileChange" />
      </label>

      <label class="field">
        <span>JSON 来源</span>
        <select v-model="state.visualizerImportJsonSourceMode" class="glass-input">
          <option value="workspace">工作区文件</option>
          <option value="local">本地文件</option>
        </select>
      </label>

      <div class="field field-span-2">
        <span>工作区 JSON 文件</span>
        <div class="action-row inline-row">
          <span class="glass-pill" :class="{ 'is-active': Boolean(workspaceJsonSelectionLabel) }">
            {{ workspaceJsonSelectionLabel || '尚未选择工作区 JSON 文件' }}
          </span>
          <select
            v-if="workspaceJsonEntries.length"
            v-model="state.visualizerImportWorkspaceJsonPath"
            class="glass-input"
          >
            <option value="">请选择当前浏览目录中的 JSON 文件</option>
            <option v-for="entry in workspaceJsonEntries" :key="entry.relativePath" :value="entry.relativePath">
              {{ entry.name }}
            </option>
          </select>
          <button
            class="ghost-button"
            :disabled="!state.visualizerImportWorkspaceJsonPath"
            @click="actions.clearVisualizerWorkspaceJsonFile"
          >
            清空
          </button>
        </div>
      </div>

      <label class="field">
        <span>图片来源</span>
        <select v-model="state.visualizerImportSourceMode" class="glass-input">
          <option value="workspace">工作区目录</option>
          <option value="local">本地文件夹</option>
        </select>
      </label>

      <div class="field field-span-2">
        <span>工作区图片目录</span>
        <div class="action-row inline-row">
          <span class="glass-pill" :class="{ 'is-active': Boolean(state.visualizerImportWorkspaceLabel) }">
            {{ state.visualizerImportWorkspaceLabel || '尚未选择工作区目录' }}
          </span>
          <select v-if="workspaceDirectoryEntries.length" class="glass-input" @change="handleWorkspaceFolderSelect">
            <option value="">选择当前浏览目录中的子目录</option>
            <option v-for="entry in workspaceDirectoryEntries" :key="entry.relativePath" :value="entry.relativePath">
              {{ entry.name }}
            </option>
          </select>
          <button class="ghost-button" :disabled="!hasVisualizerWorkspaceSelection" @click="actions.useCurrentVisualizerWorkspacePathForVisualizer">
            选当前浏览目录
          </button>
          <button class="ghost-button" :disabled="!hasVisualizerWorkspaceSelection" @click="actions.useDefaultWorkspaceUploadsForVisualizer">
            用 uploads/source_uploads
          </button>
          <button
            class="ghost-button"
            :disabled="!state.visualizerImportWorkspacePath"
            @click="actions.clearVisualizerWorkspaceFolder"
          >
            清空
          </button>
        </div>
      </div>

      <label class="file-shell field-span-2">
        <span>选择本地图片文件夹</span>
        <input
          type="file"
          multiple
          webkitdirectory
          directory
          accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
          @change="actions.onVisualizerBundleFolderChange"
        />
      </label>
    </div>

    <p v-if="state.visualizerStatus" class="panel-status" :class="{ 'is-error': state.visualizerError }">
      {{ state.visualizerStatus }}
    </p>
    <p v-if="state.visualizerUploadsStatus" class="panel-status" :class="{ 'is-error': state.visualizerUploadsError }">
      {{ state.visualizerUploadsStatus }}
    </p>
    <p v-if="state.visualizerRepairStatus" class="panel-status" :class="{ 'is-error': state.visualizerRepairError }">
      {{ state.visualizerRepairStatus }}
    </p>
    <section v-if="state.visualizerRepairError || state.visualizerRepairRawText" class="subpanel">
      <div class="subpanel-head">
        <h3>本次模型原始返回</h3>
        <p>这里显示本次重写接口返回的原始文本；如果为空，说明这次报错分支没有返回可展示的模型原文。</p>
      </div>
      <pre class="process-raw-output">{{ state.visualizerRepairRawText || '当前这次报错没有拿到 rawText，说明失败发生在未回传模型原文的分支。' }}</pre>
    </section>
    <p v-if="state.visualizerAnswerStatus" class="panel-status" :class="{ 'is-error': state.visualizerAnswerError }">
      {{ state.visualizerAnswerStatus }}
    </p>

    <section v-if="model" class="subpanel">
      <div class="subpanel-head">
        <h3>模型配置</h3>
        <p>留空时会使用后端环境变量 `ARK_API_KEY`。AI 写答案会使用当前定位题目的文字与图片。</p>
      </div>

      <div class="field-grid compact-grid">
        <label class="field">
          <span>火山 Ark API Key</span>
          <input
            v-model.trim="state.visualizerArkApiKey"
            class="glass-input"
            type="password"
            placeholder="可选，留空则使用后端环境变量"
          />
        </label>

        <label class="field field-span-2">
          <span>答案生成补充要求</span>
          <textarea
            v-model="state.visualizerAnswerPrompt"
            class="glass-input assistant-input"
            rows="4"
            placeholder="例如：答案尽量规范一些；如果是编程题，请给出思路、核心代码和复杂度。"
          />
        </label>
      </div>
    </section>

    <div v-if="model" class="info-grid">
      <article class="info-card">
        <span class="info-label">{{ documentTypeLabel }}</span>
        <strong>{{ model.source.title || model.source.externalId || `未命名${documentTypeLabel}` }}</strong>
      </article>
      <article class="info-card">
        <span class="info-label">{{ structureCountLabel }}</span>
        <strong>{{ model.totalChapters }}</strong>
      </article>
      <article class="info-card">
        <span class="info-label">题目数</span>
        <strong>{{ model.totalQuestions }}</strong>
      </article>
      <article class="info-card">
        <span class="info-label">答案模式</span>
        <strong>{{ hasAnswerLabel }}</strong>
      </article>
      <article class="info-card">
        <span class="info-label">当前文件</span>
        <strong>{{ state.visualizerFileName || '-' }}</strong>
      </article>
    </div>

    <div v-if="model" class="visualizer-layout">
      <aside class="visualizer-sidebar">
        <div class="visualizer-sidebar__head">
          <strong>{{ sidebarTitle }}</strong>
          <span>{{ model.flatChapters.length }} 个节点</span>
        </div>

        <button
          v-for="chapter in model.flatChapters"
          :key="chapter.chapterId"
          class="visualizer-sidebar__item"
          :class="{ 'is-active': chapter.chapterId === selectedChapterId }"
          :style="{ paddingLeft: `${18 + chapter.depth * 18}px` }"
          @click="selectedChapterId = chapter.chapterId"
        >
          <strong>{{ chapter.title }}</strong>
          <span>{{ chapter.totalQuestions }} 题</span>
        </button>
      </aside>

      <section class="visualizer-detail">
        <header v-if="selectedChapter" class="visualizer-detail__head">
          <div>
            <p class="panel-eyebrow">{{ detailEyebrow }}</p>
            <h3 class="visualizer-detail__title">{{ selectedChapter.title }}</h3>
            <p class="visualizer-detail__meta">
              {{ selectedChapter.chapterId }} / 当前{{ isExamDocument ? '结构' : '章节' }}共有 {{ flattenedQuestions.length }} 道题
            </p>
          </div>
        </header>

        <div v-if="flattenedQuestions.length" class="visualizer-filter-panel">
          <div class="field-grid compact-grid">
            <label class="field">
              <span>{{ sectionFilterLabel }}</span>
              <select v-model="selectedSectionId" class="glass-input">
                <option value="">{{ allSectionOptionLabel }}</option>
                <option v-for="group in questionGroups" :key="group.chapterId" :value="group.chapterId">
                  {{ group.title }}（{{ group.questions.length }} 题）
                </option>
              </select>
            </label>

            <label class="field">
              <span>关键词筛选</span>
              <input
                v-model.trim="keyword"
                class="glass-input"
                type="text"
                placeholder="题号、标题、题干、答案关键词"
              />
            </label>
          </div>

          <div class="field-grid compact-grid">
            <label class="field field-span-2">
              <span>选择题目</span>
              <select v-model="selectedQuestionKey" class="glass-input">
                <option v-for="item in filteredQuestions" :key="item.key" :value="item.key">
                  {{ item.label }}
                </option>
              </select>
            </label>
          </div>

          <div class="visualizer-toolbar">
            <span class="glass-pill is-active">{{ currentQuestionIndex + 1 }}/{{ filteredQuestions.length }} 题</span>
            <span class="glass-pill">{{ currentQuestionMeta?.groupTitle || unnamedGroupLabel }}</span>
            <button class="ghost-button" :disabled="currentQuestionIndex <= 0" @click="goPrevQuestion">上一题</button>
            <button
              class="ghost-button"
              :disabled="currentQuestionIndex < 0 || currentQuestionIndex >= filteredQuestions.length - 1"
              @click="goNextQuestion"
            >
              下一题
            </button>
          </div>
        </div>

        <QuestionPreviewCard
          v-if="currentQuestion"
          :question="currentQuestion"
          :repair-enabled="Boolean(state.visualizerServerJsonPath)"
          :repairing-target="state.visualizerRepairProcessing ? repairingTargetType : ''"
          :question-type-options="questionTypeOptions"
          :question-type-saving="state.visualizerQuestionTypeProcessing"
          :selected-child-key="selectedChildKey"
          @select-child="handleSelectChild"
          @repair-math-format="handleRepairMathFormat"
          @update-question-type="handleUpdateQuestionType"
        />

        <section v-if="currentQuestion" class="subpanel visualizer-action-panel">
          <div class="subpanel-head">
            <h3>当前图片片操作</h3>
            <p>图一只负责当前定位题的图片操作。对于 GROUP 题，会自动定位到当前选中的小题。</p>
          </div>

          <div class="visualizer-rewrite-meta">
            <article class="visualizer-rewrite-card">
              <span>当前定位</span>
              <strong>{{ currentOperationTitle }}</strong>
            </article>
            <article class="visualizer-rewrite-card">
              <span>自动定位</span>
              <strong>{{ currentQuestionLocatorText }}</strong>
            </article>
          </div>

          <div class="action-row inline-row visualizer-mode-tabs">
            <button class="ghost-button" :class="{ 'is-active': operationMode === 'attach' }" @click="operationMode = 'attach'">
              补图
            </button>
            <button class="ghost-button" :class="{ 'is-active': operationMode === 'rewrite' }" @click="operationMode = 'rewrite'">
              按图重写
            </button>
            <button class="ghost-button" :class="{ 'is-active': operationMode === 'answer' }" @click="operationMode = 'answer'">
              AI 写答案
            </button>
          </div>

          <div v-if="operationMode === 'attach'" class="field-grid compact-grid">
            <label class="field field-span-2">
              <span>补图位置</span>
              <select v-model="attachTarget" class="glass-input">
                <option v-for="item in attachTargetOptions" :key="item.value" :value="item.value">
                  {{ item.label }}
                </option>
              </select>
            </label>

            <div class="field field-span-2">
              <span>说明</span>
              <p class="panel-status">
                {{
                  currentQuestion.nodeType === 'GROUP'
                    ? '当前是大题，补图可以写到公共题干，或者写到当前定位小题的题目 / 答案。'
                    : '当前是单题，补图可以写到这道题的题目或答案。'
                }}
              </p>
            </div>
          </div>

          <div v-else-if="operationMode === 'rewrite'" class="field-grid compact-grid">
            <label class="field">
              <span>是否有自带答案</span>
              <select v-model="rewriteHasAnswerSource" class="glass-input">
                <option value="yes">有自带答案</option>
                <option value="no">没有自带答案</option>
              </select>
            </label>

            <label v-if="rewriteHasAnswerSource === 'no'" class="field">
              <span>没有答案时是否 AI 补写</span>
              <select v-model="rewriteGenerateAnswerIfMissing" class="glass-input">
                <option value="no">不补写，保持空</option>
                <option value="yes">允许 AI 写答案</option>
              </select>
            </label>

            <label v-if="rewriteScopeOptions.length > 1" class="field field-span-2">
              <span>重写范围</span>
              <select v-model="rewriteScope" class="glass-input">
                <option v-for="item in rewriteScopeOptions" :key="item.value" :value="item.value">
                  {{ item.label }}
                </option>
              </select>
            </label>
          </div>

          <div v-else class="field-grid compact-grid">
            <div class="field field-span-2">
              <span>答案生成目标</span>
              <p class="panel-status">
                {{
                  currentQuestion.nodeType === 'GROUP' && currentLocatedChild
                    ? `将为第 ${currentLocatedChildNo} 小题生成答案，发给模型的题目会自动拼上公共题干。`
                    : '将为当前定位这道题生成答案。'
                }}
              </p>
            </div>
          </div>

          <div class="visualizer-rewrite-upload-wrap">
            <label class="file-shell visualizer-rewrite-upload">
              <span>上传图片（可追加）</span>
              <input
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp"
                @change="actions.onVisualizerRepairImageChange"
              />
            </label>
          </div>

          <div class="action-row inline-row visualizer-rewrite-actions">
            <span class="glass-pill" :class="{ 'is-active': state.visualizerRepairImageFiles.length > 0 }">
              {{
                state.visualizerRepairImageFiles.length
                  ? `已选择 ${state.visualizerRepairImageFiles.length} 张图片`
                  : '可选择多张连续页图片'
              }}
            </span>

            <button
              class="ghost-button"
              :disabled="state.visualizerRepairProcessing || state.visualizerAnswerProcessing || !state.visualizerRepairImageFiles.length"
              @click="actions.clearVisualizerRepairImages"
            >
              清空图片
            </button>
          </div>

          <section v-if="state.visualizerRepairImageFiles.length" class="subpanel">
            <div class="subpanel-head">
              <h3>待处理图片预览</h3>
              <p>图片会按当前顺序参与补图、重写或 AI 写答案。</p>
            </div>

            <PendingImageList
              :files="state.visualizerRepairImageFiles"
              :processing="state.visualizerRepairProcessing || state.visualizerAnswerProcessing"
              @remove="actions.removeVisualizerRepairImage"
            />
          </section>

          <div class="action-row visualizer-rewrite-primary-actions">
            <button v-if="operationMode === 'attach'" class="secondary-button" :disabled="!canRunAttachMode" @click="runAttachMode">
              {{ state.visualizerRepairProcessing ? '处理中...' : '确认补到所选位置' }}
            </button>

            <button v-if="operationMode === 'rewrite'" class="primary-button" :disabled="!canRunRewriteMode" @click="runRewriteMode">
              {{ state.visualizerRepairProcessing ? '重写中...' : '按所选方式重写' }}
            </button>

            <button v-if="operationMode === 'answer'" class="primary-button" :disabled="!canRunAnswerMode" @click="runAnswerMode">
              {{ state.visualizerAnswerProcessing ? '生成中...' : '为当前定位题写答案' }}
            </button>
          </div>

          <div v-if="state.visualizerRewriteResult" class="process-panel">
            <article class="process-card" :class="{ 'is-success': !state.visualizerRepairError }">
              <div class="process-card__header">
                <div>
                  <strong>{{ state.visualizerRewriteResult.targetLabel || state.visualizerRewriteResult.questionTitle }}</strong>
                  <p>{{ state.visualizerRewriteResult.chapterTitle }} / {{ state.visualizerRewriteResult.sectionTitle }}</p>
                </div>
                <span class="process-badge is-done">{{ state.visualizerRewriteResult.action || 'done' }}</span>
              </div>

              <div class="process-key-grid">
                <div>
                  <span>题目 ID</span>
                  <strong>{{ state.visualizerRewriteResult.questionId }}</strong>
                </div>
                <div v-if="state.visualizerRewriteResult.childQuestionId">
                  <span>小题 ID</span>
                  <strong>{{ state.visualizerRewriteResult.childQuestionId }}</strong>
                </div>
                <div>
                  <span>图片数</span>
                  <strong>{{ state.visualizerRewriteResult.imageCount }}</strong>
                </div>
                <div>
                  <span>题库总量</span>
                  <strong>{{ state.visualizerRewriteResult.questionsCount }}</strong>
                </div>
              </div>

              <div v-if="state.visualizerRewriteResult.reason" class="process-reason-stack">
                <div class="process-reason">
                  <span>模型说明</span>
                  <p>{{ state.visualizerRewriteResult.reason }}</p>
                </div>
              </div>

              <details v-if="state.visualizerRewriteResult.rawText" class="process-raw-details">
                <summary>查看模型原始返回</summary>
                <pre class="process-raw-output">{{ state.visualizerRewriteResult.rawText }}</pre>
              </details>
            </article>
          </div>
        </section>

        <div v-else-if="flattenedQuestions.length" class="empty-state">
          <strong>当前筛选条件下没有题目</strong>
          <span>可以切换结构筛选，或者清空关键词后再看。</span>
        </div>

        <div v-else class="empty-state">
          <strong>{{ isExamDocument ? '当前结构下没有题目' : '当前章节下没有题目' }}</strong>
          <span>可以切换到下一级结构查看，或者检查 JSON 里的 `question.chapterId` 是否与结构树一致。</span>
        </div>
      </section>
    </div>

    <div v-else class="empty-state">
      <strong>还没有加载题库 JSON</strong>
      <span>导入或加载一份 JSON 后，这里会按章节结构展示题目内容。</span>
    </div>
  </GlassPanel>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import GlassPanel from './GlassPanel.vue'
import PendingImageList from './PendingImageList.vue'
import QuestionPreviewCard from './QuestionPreviewCard.vue'
import { buildTextbookVisualizerModel, collectQuestionGroups } from '../utils/textbookVisualizer'

const FALLBACK_QUESTION_TYPE_OPTIONS = [
  { value: 'SHORT_ANSWER', label: '填空/简答题' },
  { value: 'PROOF', label: '证明题' },
  { value: 'CALCULATION', label: '计算题' },
  { value: 'CODE', label: '编程题' },
  { value: 'SINGLE_CHOICE', label: '单选题' },
  { value: 'MULTI_CHOICE', label: '多选题' },
  { value: 'JUDGE', label: '判断题' },
]

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

const state = props.state
const actions = props.actions

const selectedChapterId = ref('')
const selectedSectionId = ref('')
const selectedQuestionKey = ref('')
const selectedChildKey = ref('')
const keyword = ref('')
const repairingTargetType = ref('')
const operationMode = ref('attach')
const attachTarget = ref('')
const rewriteHasAnswerSource = ref('yes')
const rewriteGenerateAnswerIfMissing = ref('no')
const rewriteScope = ref('question')

const model = computed(() => {
  if (!props.state.visualizerPayload) {
    return null
  }
  return buildTextbookVisualizerModel(props.state.visualizerPayload)
})

const workspaceOptions = computed(() =>
  Array.isArray(props.state.workspaceList) ? props.state.workspaceList : [],
)

const visualizerBrowserEntries = computed(() =>
  Array.isArray(props.state.visualizerWorkspaceBrowser?.entries) ? props.state.visualizerWorkspaceBrowser.entries : [],
)

const visualizerBreadcrumbs = computed(() =>
  Array.isArray(props.state.visualizerWorkspaceBrowser?.breadcrumbs) ? props.state.visualizerWorkspaceBrowser.breadcrumbs : [],
)

const hasVisualizerWorkspaceSelection = computed(() => Boolean(String(props.state.visualizerWorkspaceId || '').trim()))

const canBrowseVisualizerParent = computed(() =>
  Boolean(props.state.visualizerWorkspaceBrowser && !props.state.visualizerWorkspaceBrowser.isRoot),
)

const visualizerWorkspaceSelectionLabel = computed(() => {
  const workspaceId = String(props.state.visualizerWorkspaceId || '').trim()
  if (!workspaceId) {
    return ''
  }
  const matched = workspaceOptions.value.find((workspace) => String(workspace?.workspaceId || '').trim() === workspaceId)
  return matched?.name || workspaceId
})

const visualizerCurrentPathLabel = computed(() => {
  if (!hasVisualizerWorkspaceSelection.value) {
    return '未选择目录'
  }
  const currentPath = String(props.state.visualizerWorkspaceBrowser?.currentPath || '').trim()
  return currentPath || '工作区根目录'
})

const workspaceJsonEntries = computed(() =>
  visualizerBrowserEntries.value.filter((entry) => entry?.type === 'file' && String(entry?.extension || '').toLowerCase() === '.json'),
)

const workspaceDirectoryEntries = computed(() =>
  visualizerBrowserEntries.value.filter((entry) => entry?.type === 'directory'),
)

const workspaceJsonSelectionLabel = computed(() => {
  const selectedPath = String(props.state.visualizerImportWorkspaceJsonPath || '').trim()
  if (!selectedPath) {
    return ''
  }
  const matched = workspaceJsonEntries.value.find((entry) => String(entry?.relativePath || '').trim() === selectedPath)
  return matched?.name || selectedPath
})

const isWorkspaceSourceMode = computed(() => String(props.state.visualizerImportSourceMode || '').trim() !== 'local')
const hasLocalFolderSelection = computed(() => Array.isArray(props.state.visualizerImportFolderFiles) && props.state.visualizerImportFolderFiles.length > 0)
const hasWorkspaceFolderSelection = computed(() => Boolean(String(props.state.visualizerImportWorkspacePath || '').trim()))
const hasManagedVisualizerJson = computed(() => Boolean(String(props.state.visualizerServerJsonPath || '').trim()))
const needsJsonImport = computed(() => !props.state.visualizerImportJsonFile && !hasManagedVisualizerJson.value)

const activeImportSourceLabel = computed(() =>
  isWorkspaceSourceMode.value ? props.state.visualizerImportWorkspaceLabel || '' : props.state.visualizerImportFolderLabel || '',
)

const canImportVisualizerBundle = computed(() => {
  if (props.state.visualizerUploadsProcessing) {
    return false
  }
  if (!hasVisualizerWorkspaceSelection.value) {
    return false
  }
  if (String(props.state.visualizerImportJsonSourceMode || '').trim() === 'local') {
    if (needsJsonImport.value && !props.state.visualizerImportJsonFile) {
      return false
    }
  } else if (!String(props.state.visualizerImportWorkspaceJsonPath || '').trim()) {
    return false
  }
  return isWorkspaceSourceMode.value ? hasWorkspaceFolderSelection.value : hasLocalFolderSelection.value
})

const importVisualizerActionLabel = computed(() => {
  if (props.state.visualizerUploadsProcessing) {
    return '导入中...'
  }
  const usingWorkspaceJson = String(props.state.visualizerImportJsonSourceMode || '').trim() !== 'local'
  if (usingWorkspaceJson) {
    return isWorkspaceSourceMode.value ? '加载工作区 JSON 并使用目录' : '加载工作区 JSON 并导入图片'
  }
  if (props.state.visualizerImportJsonFile) {
    return isWorkspaceSourceMode.value ? '导入本地 JSON 并使用目录' : '导入本地 JSON 与图片'
  }
  return isWorkspaceSourceMode.value ? '使用工作区目录重写图片' : '覆盖工作区图片'
})

const isExamDocument = computed(() => model.value?.documentType === 'exam')
const documentTypeLabel = computed(() => (isExamDocument.value ? '试卷' : '教材'))
const structureCountLabel = computed(() => (isExamDocument.value ? '结构节点数' : '章节数'))
const sidebarTitle = computed(() => (isExamDocument.value ? '结构目录' : '章节目录'))
const detailEyebrow = computed(() => (isExamDocument.value ? 'Structure' : 'Chapter'))
const sectionFilterLabel = computed(() => (isExamDocument.value ? '结构筛选' : '小节筛选'))
const allSectionOptionLabel = computed(() => (isExamDocument.value ? '全部结构' : '全部小节'))
const unnamedGroupLabel = computed(() => (isExamDocument.value ? '未命名结构' : '未命名小节'))
const hasAnswerLabel = computed(() => (model.value?.source?.hasAnswer === false ? '无自带答案' : '有自带答案'))
const questionTypeOptions = computed(() =>
  Array.isArray(props.state.examQuestionTypeOptions) && props.state.examQuestionTypeOptions.length
    ? props.state.examQuestionTypeOptions
    : FALLBACK_QUESTION_TYPE_OPTIONS,
)

watch(
  model,
  (value) => {
    if (!value?.flatChapters?.length) {
      selectedChapterId.value = ''
      return
    }
    const stillExists = value.chapterMap.has(selectedChapterId.value)
    if (!stillExists) {
      const firstWithQuestions = value.flatChapters.find((chapter) => chapter.totalQuestions > 0)
      selectedChapterId.value = firstWithQuestions?.chapterId || value.flatChapters[0].chapterId
    }
  },
  { immediate: true },
)

const selectedChapter = computed(() => {
  if (!model.value || !selectedChapterId.value) {
    return null
  }
  return model.value.chapterMap.get(selectedChapterId.value) || null
})

const questionGroups = computed(() => collectQuestionGroups(selectedChapter.value))

watch(
  questionGroups,
  (groups) => {
    const validSectionIds = new Set(groups.map((item) => item.chapterId))
    if (selectedSectionId.value && !validSectionIds.has(selectedSectionId.value)) {
      selectedSectionId.value = ''
    }
  },
  { immediate: true },
)

function buildQuestionSearchText(question) {
  const parts = [question.questionId, question.title, question.questionType]
  if (question.nodeType === 'GROUP') {
    parts.push(question.stem?.text || '')
    for (const child of question.children || []) {
      parts.push(child.questionId, child.title, child.questionType, child.prompt?.text || '', child.standardAnswer?.text || '')
    }
  } else {
    parts.push(question.prompt?.text || '', question.standardAnswer?.text || '')
  }
  return parts.join('\n').toLowerCase()
}

function buildQuestionLabel(groupTitle, question) {
  return `${groupTitle} / ${question.title || question.questionId} / ${question.questionId}`
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

const flattenedQuestions = computed(() =>
  questionGroups.value.flatMap((group) =>
    group.questions.map((question) => ({
      key: question.questionId || `${group.chapterId}-${question.title}`,
      groupId: group.chapterId,
      groupTitle: group.title,
      question,
      label: buildQuestionLabel(group.title, question),
      searchText: buildQuestionSearchText(question),
    })),
  ),
)

const filteredQuestions = computed(() => {
  const keywordValue = keyword.value.trim().toLowerCase()
  return flattenedQuestions.value.filter((item) => {
    if (selectedSectionId.value && item.groupId !== selectedSectionId.value) {
      return false
    }
    if (keywordValue && !item.searchText.includes(keywordValue)) {
      return false
    }
    return true
  })
})

watch(
  filteredQuestions,
  (items) => {
    const exists = items.some((item) => item.key === selectedQuestionKey.value)
    if (!exists) {
      selectedQuestionKey.value = items[0]?.key || ''
    }
  },
  { immediate: true },
)

const currentQuestionIndex = computed(() =>
  filteredQuestions.value.findIndex((item) => item.key === selectedQuestionKey.value),
)

const currentQuestionMeta = computed(() => {
  if (currentQuestionIndex.value < 0) {
    return null
  }
  return filteredQuestions.value[currentQuestionIndex.value] || null
})

const currentQuestion = computed(() => currentQuestionMeta.value?.question || null)

const currentChildOptions = computed(() =>
  Array.isArray(currentQuestion.value?.children)
    ? currentQuestion.value.children.map((child, index) => ({
        key: child.questionId || `${currentQuestion.value?.questionId || 'question'}-${index}`,
        value: child,
      }))
    : [],
)

watch(
  currentChildOptions,
  (items) => {
    if (!items.length) {
      selectedChildKey.value = ''
      return
    }
    const exists = items.some((item) => item.key === selectedChildKey.value)
    if (!exists) {
      selectedChildKey.value = items[0]?.key || ''
    }
  },
  { immediate: true },
)

const currentChildIndex = computed(() =>
  currentChildOptions.value.findIndex((item) => item.key === selectedChildKey.value),
)

const currentLocatedChild = computed(() => {
  if (currentChildIndex.value < 0) {
    return null
  }
  return currentChildOptions.value[currentChildIndex.value]?.value || null
})

const currentLocatedChildNo = computed(() =>
  currentLocatedChild.value ? Number(currentLocatedChild.value.orderNo || currentChildIndex.value + 1 || 0) : null,
)

const currentQuestionParts = computed(() =>
  parseQuestionIdParts(currentQuestion.value?.questionId || ''),
)

const currentQuestionLocatorText = computed(() => {
  if (!currentQuestion.value) {
    return ''
  }
  if (isExamDocument.value) {
    return currentQuestion.value.questionId
  }
  if (!currentQuestionParts.value) {
    return currentQuestion.value.questionId
  }
  const childSuffix =
    currentQuestion.value.nodeType === 'GROUP' && currentLocatedChildNo.value
      ? ` / 第 ${currentLocatedChildNo.value} 小题`
      : ''
  return `第 ${currentQuestionParts.value.chapterNo} 章 / 第 ${currentQuestionParts.value.sectionNo} 节 / 第 ${currentQuestionParts.value.questionNo} 题${childSuffix}`
})

const currentOperationTitle = computed(() => {
  if (!currentQuestion.value) {
    return ''
  }
  if (currentQuestion.value.nodeType === 'GROUP' && currentLocatedChild.value) {
    return currentLocatedChild.value.title || `第${currentLocatedChildNo.value}小题`
  }
  return currentQuestion.value.title || currentQuestion.value.questionId
})

const attachTargetOptions = computed(() => {
  const question = currentQuestion.value
  if (!question) {
    return []
  }
  if (String(question.nodeType || '').toUpperCase() !== 'GROUP') {
    return [
      { value: 'questionPrompt', label: '当前题的题目', targetType: 'prompt', childQuestionId: '', childNo: null, blockLabel: '当前题目' },
      { value: 'questionAnswer', label: '当前题的答案', targetType: 'standardAnswer', childQuestionId: '', childNo: null, blockLabel: '当前题答案' },
    ]
  }

  const options = [
    { value: 'groupStem', label: '大题公共题干', targetType: 'prompt', childQuestionId: '', childNo: null, blockLabel: '大题公共题干' },
  ]
  if (currentLocatedChild.value) {
    options.push(
      {
        value: 'childPrompt',
        label: `第${currentLocatedChildNo.value}小题的题目`,
        targetType: 'prompt',
        childQuestionId: String(currentLocatedChild.value.questionId || ''),
        childNo: currentLocatedChildNo.value,
        blockLabel: `第${currentLocatedChildNo.value}小题题目`,
      },
      {
        value: 'childAnswer',
        label: `第${currentLocatedChildNo.value}小题的答案`,
        targetType: 'standardAnswer',
        childQuestionId: String(currentLocatedChild.value.questionId || ''),
        childNo: currentLocatedChildNo.value,
        blockLabel: `第${currentLocatedChildNo.value}小题答案`,
      },
    )
  }
  return options
})

watch(
  attachTargetOptions,
  (items) => {
    const exists = items.some((item) => item.value === attachTarget.value)
    if (!exists) {
      attachTarget.value = items[0]?.value || ''
    }
  },
  { immediate: true },
)

const selectedAttachTargetOption = computed(() =>
  attachTargetOptions.value.find((item) => item.value === attachTarget.value) || null,
)

const rewriteScopeOptions = computed(() => {
  const question = currentQuestion.value
  if (!question) {
    return []
  }
  if (String(question.nodeType || '').toUpperCase() !== 'GROUP' || !currentLocatedChild.value) {
    return [{ value: 'question', label: '重写当前这道题' }]
  }
  return [
    { value: 'child', label: `只重写第${currentLocatedChildNo.value}小题` },
    { value: 'question', label: '重写整个大题' },
  ]
})

watch(
  rewriteScopeOptions,
  (items) => {
    const exists = items.some((item) => item.value === rewriteScope.value)
    if (!exists) {
      rewriteScope.value = items[0]?.value || 'question'
    }
  },
  { immediate: true },
)

watch(
  () => model.value?.source?.hasAnswer,
  (value) => {
    rewriteHasAnswerSource.value = value === false ? 'no' : 'yes'
  },
  { immediate: true },
)

const canRunAttachMode = computed(() =>
  Boolean(
    currentQuestion.value &&
    selectedAttachTargetOption.value &&
    props.state.visualizerServerJsonPath &&
    props.state.visualizerRepairImageFiles.length &&
    !props.state.visualizerRepairProcessing
  ),
)

const canRunRewriteMode = computed(() =>
  Boolean(
    currentQuestion.value &&
    props.state.visualizerServerJsonPath &&
    props.state.visualizerRepairImageFiles.length &&
    !props.state.visualizerRepairProcessing
  ),
)

const canRunAnswerMode = computed(() => {
  const question = currentQuestion.value
  if (!question || !props.state.visualizerServerJsonPath || props.state.visualizerAnswerProcessing) {
    return false
  }
  if (String(question.nodeType || '').toUpperCase() === 'GROUP') {
    return Boolean(currentLocatedChild.value)
  }
  return true
})

function goPrevQuestion() {
  if (currentQuestionIndex.value <= 0) {
    return
  }
  selectedQuestionKey.value = filteredQuestions.value[currentQuestionIndex.value - 1].key
}

function goNextQuestion() {
  if (currentQuestionIndex.value < 0 || currentQuestionIndex.value >= filteredQuestions.value.length - 1) {
    return
  }
  selectedQuestionKey.value = filteredQuestions.value[currentQuestionIndex.value + 1].key
}

async function handleVisualizerWorkspaceChange(event) {
  const nextWorkspaceId = String(event?.target?.value || props.state.visualizerWorkspaceId || '').trim()
  await props.actions.switchVisualizerWorkspace(nextWorkspaceId)
}

function fileTypeLabel(extension) {
  const ext = String(extension || '').trim().toLowerCase()
  return ext ? ext.replace(/^\./, '').toUpperCase() : '文件'
}

function handleWorkspaceFolderSelect(event) {
  const nextPath = String(event?.target?.value || '').trim()
  props.state.visualizerImportWorkspacePath = nextPath
  props.state.visualizerImportWorkspaceLabel = nextPath || '工作区根目录'
  if (event?.target) {
    event.target.value = ''
  }
}

function handleSelectChild(nextKey) {
  selectedChildKey.value = String(nextKey || '').trim()
}

async function handleRepairMathFormat(payload) {
  repairingTargetType.value = String(payload?.targetType || '')
  try {
    await props.actions.repairMathFormatFromVisualizer(payload)
  } finally {
    repairingTargetType.value = ''
  }
}

async function handleUpdateQuestionType(payload) {
  await props.actions.updateQuestionTypeFromVisualizer(payload)
}

async function runAttachMode() {
  if (!currentQuestion.value || !selectedAttachTargetOption.value) {
    return
  }
  await props.actions.attachImagesFromVisualizer({
    questionId: currentQuestion.value.questionId,
    questionTitle: currentOperationTitle.value,
    childQuestionId: selectedAttachTargetOption.value.childQuestionId,
    childNo: selectedAttachTargetOption.value.childNo,
    targetType: selectedAttachTargetOption.value.targetType,
    blockLabel: selectedAttachTargetOption.value.blockLabel,
  })
}

async function runRewriteMode() {
  if (!currentQuestion.value) {
    return
  }

  const rewriteChild = rewriteScope.value === 'child' && currentQuestion.value.nodeType === 'GROUP' && currentLocatedChild.value
  await props.actions.repairQuestionFromVisualizer({
    questionId: currentQuestion.value.questionId,
    questionTitle: rewriteChild ? currentOperationTitle.value : currentQuestion.value.title || currentQuestion.value.questionId,
    childQuestionId: rewriteChild ? String(currentLocatedChild.value.questionId || '') : '',
    childNo: rewriteChild ? currentLocatedChildNo.value : null,
    blockLabel: rewriteChild ? `第${currentLocatedChildNo.value}小题` : '当前大题',
    hasAnswerSource: rewriteHasAnswerSource.value === 'yes',
    generateAnswerIfMissing: rewriteHasAnswerSource.value === 'no' && rewriteGenerateAnswerIfMissing.value === 'yes',
  })
}

async function runAnswerMode() {
  if (!currentQuestion.value) {
    return
  }

  const useChild = currentQuestion.value.nodeType === 'GROUP' && currentLocatedChild.value
  await props.actions.generateAnswerFromVisualizer({
    questionId: currentQuestion.value.questionId,
    questionTitle: useChild ? currentOperationTitle.value : currentQuestion.value.title || currentQuestion.value.questionId,
    childQuestionId: useChild ? String(currentLocatedChild.value.questionId || '') : '',
    childNo: useChild ? currentLocatedChildNo.value : null,
    blockLabel: useChild ? `第${currentLocatedChildNo.value}小题` : '当前题目',
    imageFiles: props.state.visualizerRepairImageFiles,
  })
}
</script>

<style scoped>
.process-raw-details {
  margin-top: 14px;
}

.process-raw-details summary {
  cursor: pointer;
  color: #17304f;
  font-weight: 600;
}

.process-raw-output {
  margin: 10px 0 0;
  padding: 14px 16px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.55);
  border: 1px solid rgba(126, 164, 214, 0.28);
  color: #17304f;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 320px;
  overflow: auto;
}
</style>
