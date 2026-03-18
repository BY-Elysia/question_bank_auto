<template>
  <GlassPanel
    eyebrow="Step 02"
    title="章节会话与自动处理"
    description="初始化当前章和小节后，每一页图片都会沿着同一个会话继续推进。"
    tone="ice"
    prominent
  >
    <div class="field-grid">
      <div class="field field-span-2">
        <span>目标 JSON 文件</span>
        <div class="action-row inline-row">
          <button class="secondary-button" @click="actions.chooseJsonSessionFile">选择 JSON 文件</button>
          <span class="glass-pill" :class="{ 'is-active': Boolean(state.chapterSessionJsonLabel) }">
            {{ state.chapterSessionJsonLabel || '尚未选择文件' }}
          </span>
        </div>
      </div>
      <label class="field">
        <span>当前章</span>
        <input
          v-model.trim="state.chapterSessionInitChapter"
          class="glass-input"
          type="text"
          placeholder="第八章 不定积分"
        />
      </label>
      <label class="field">
        <span>当前小节</span>
        <input
          v-model.trim="state.chapterSessionInitSection"
          class="glass-input"
          type="text"
          placeholder="习题8.1"
        />
      </label>
    </div>

    <div class="action-row">
      <button class="primary-button" @click="actions.initChapterSession">初始化会话</button>
      <span v-if="state.chapterSessionId" class="glass-pill is-active">session {{ state.chapterSessionId }}</span>
    </div>

    <p v-if="state.chapterSessionStatus" class="panel-status" :class="{ 'is-error': state.chapterSessionError }">
      {{ state.chapterSessionStatus }}
    </p>

    <div v-if="state.chapterSessionId" class="info-grid">
      <div class="info-card">
        <span class="info-label">当前章</span>
        <strong>{{ state.chapterSessionCurrentChapter }}</strong>
      </div>
      <div class="info-card">
        <span class="info-label">当前小节</span>
        <strong>{{ state.chapterSessionCurrentSection }}</strong>
      </div>
    </div>

    <div v-if="state.chapterSessionId" class="subpanel">
      <div class="subpanel-head">
        <h3>提取凭证</h3>
        <p>API Key 只保存在当前页面内存中。自动处理开始后切换到其他页面不会中断，返回这里还能继续看状态。</p>
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
            placeholder="请输入本次主提取使用的 API Key"
          />
        </label>
      </div>
    </div>

    <div v-if="state.chapterSessionId" class="subpanel">
      <div class="subpanel-head">
        <h3>处理模式</h3>
        <p>只切换前端调用入口，原有后端逻辑保留不动。</p>
      </div>
      <div class="mode-switch" role="tablist" aria-label="章节处理模式">
        <button
          type="button"
          class="mode-switch__button"
          :class="{ 'is-active': state.chapterProcessingMode === 'original' }"
          :disabled="isModeSwitchLocked"
          @click="actions.setChapterProcessingMode('original')"
        >
          <strong>原逻辑</strong>
          <span>调用现有稳定接口</span>
        </button>
        <button
          type="button"
          class="mode-switch__button"
          :class="{ 'is-active': state.chapterProcessingMode === 'responses' }"
          :disabled="isModeSwitchLocked"
          @click="actions.setChapterProcessingMode('responses')"
        >
          <strong>Responses前缀缓存实验版</strong>
          <span>调用 Responses 前缀缓存实验接口</span>
        </button>
      </div>
      <p class="mode-switch__hint">
        当前模式：{{ processingModeLabel }}。{{ isModeSwitchLocked ? '运行中暂时锁定，避免一轮处理中混用两种链路。' : processingModeHint }}
      </p>
    </div>

    <div v-if="state.chapterSessionId" class="subpanel">
      <div class="subpanel-head">
        <h3>单页调试</h3>
        <p>适合检查某一页的跨页状态、入库结果和重试原因。</p>
      </div>
      <div class="action-row wrap-top">
        <label class="file-shell">
          <span>上传当前图片</span>
          <input type="file" accept="image/png,image/jpeg,image/webp" @change="actions.onChapterImageChange" />
        </label>
        <button
          class="primary-button"
          :disabled="state.chapterProcessing || !state.chapterImageFile || !hasChapterArkApiKey"
          @click="actions.processChapterImage"
        >
          {{ state.chapterProcessing ? '处理中...' : '处理当前图片' }}
        </button>
        <span class="glass-pill" :class="{ 'is-active': state.chapterProcessingMode === 'responses' }">{{ processingModeLabel }}</span>
      </div>

      <div v-if="state.chapterPassResult" class="process-panel">
        <div class="process-summary-grid">
          <article class="process-metric">
            <span>当前小节</span>
            <strong>{{ state.chapterPassResult.sectionTitle }}</strong>
          </article>
          <article class="process-metric">
            <span>题库总量</span>
            <strong>{{ state.chapterPassResult.questionsCount }}</strong>
          </article>
          <article class="process-metric">
            <span>新增题目</span>
            <strong>{{ state.chapterPassResult.question.upsertedCount }}</strong>
          </article>
        </div>

        <article class="process-card" :class="{ 'is-pending': state.chapterPassResult.question.pending }">
          <div class="process-card__header">
            <div>
              <strong>
                {{ state.chapterPassResult.question.pending ? '当前页进入跨页等待' : '当前页已完成入库' }}
              </strong>
              <p>{{ state.chapterPassResult.chapterTitle }} / {{ state.chapterPassResult.sectionTitle }}</p>
            </div>
            <span class="process-badge" :class="{ 'is-pending': state.chapterPassResult.question.pending }">
              {{ state.chapterPassResult.question.pending ? '待下一页' : '已入库' }}
            </span>
          </div>

          <div class="process-tag-row">
            <span class="process-tag">处理模式: {{ state.chapterPassResult.modeLabel || processingModeLabel }}</span>
            <span class="process-tag">边界提取: {{ state.chapterPassResult.question.boundaryHasExtractableQuestions ? '是' : '否' }}</span>
            <span class="process-tag">边界续页: {{ state.chapterPassResult.question.boundaryNeedNextPage ? '是' : '否' }}</span>
            <span class="process-tag">归一化题数: {{ state.chapterPassResult.question.normalizedCount }}</span>
            <span v-if="state.chapterPassResult.question.pendingReviewCount" class="process-tag is-warn">
              待校对 {{ state.chapterPassResult.question.pendingReviewCount }}
            </span>
            <span v-if="state.chapterPassResult.question.droppedPendingQuestionCount" class="process-tag is-warn">
              截掉 {{ state.chapterPassResult.question.droppedPendingQuestionCount }}
            </span>
          </div>
          <div v-if="prefixCacheTagItems(state.chapterPassResult.prefixCache).length" class="process-tag-row">
            <span
              v-for="tag in prefixCacheTagItems(state.chapterPassResult.prefixCache)"
              :key="tag.key"
              class="process-tag"
              :class="tag.tone ? `is-${tag.tone}` : ''"
            >
              {{ tag.label }}
            </span>
          </div>

        <div class="process-key-grid">
          <div>
            <span>续题标记</span>
            <strong>{{ state.chapterPassResult.question.continueQuestionKey || '无' }}</strong>
          </div>
            <div>
              <span>下一起点</span>
              <strong>{{ state.chapterPassResult.question.nextStartQuestionKey || '无' }}</strong>
            </div>
          <div>
            <span>队列页数</span>
            <strong>{{ state.chapterPassResult.question.pendingPagesCount || 0 }}</strong>
          </div>
          <div>
            <span>会话起点</span>
            <strong>{{ state.chapterPassResult.question.sessionStoredProcessingStartQuestionKey || '无' }}</strong>
          </div>
          <div>
            <span>实际 start</span>
            <strong>{{ state.chapterPassResult.question.effectiveProcessingStartQuestionKey || '无' }}</strong>
          </div>
          <div>
            <span>实际 end</span>
            <strong>{{ state.chapterPassResult.question.effectiveExtractEndBeforeQuestionKey || '页尾' }}</strong>
          </div>
          <div>
            <span>提取模式</span>
            <strong>{{ state.chapterPassResult.question.effectiveExtractMode || '默认' }}</strong>
          </div>
          <div>
            <span>边界续题</span>
            <strong>{{ state.chapterPassResult.question.boundaryContinueQuestionKey || '无' }}</strong>
          </div>
          <div>
            <span>队列页面</span>
            <strong>{{ queueLabel(state.chapterPassResult.question) }}</strong>
          </div>
        </div>

          <div class="process-reason-stack">
            <div v-if="state.chapterPassResult.question.reason" class="process-reason">
              <span>处理结论</span>
              <p>{{ state.chapterPassResult.question.reason }}</p>
            </div>
            <div v-if="state.chapterPassResult.question.boundaryReason" class="process-reason">
              <span>边界判断</span>
              <p>{{ state.chapterPassResult.question.boundaryReason }}</p>
            </div>
            <div v-if="state.chapterPassResult.question.extractReason" class="process-reason">
              <span>提取说明</span>
              <p>{{ state.chapterPassResult.question.extractReason }}</p>
            </div>
            <div
              v-if="state.chapterPassResult.question.boundaryLookaheadLabel || state.chapterPassResult.question.boundaryLookaheadReason"
              class="process-reason"
            >
              <span>预读信息</span>
              <p>
                {{
                  [
                    state.chapterPassResult.question.boundaryLookaheadLabel
                      ? `预读页 ${state.chapterPassResult.question.boundaryLookaheadLabel}`
                      : '',
                    state.chapterPassResult.question.boundaryLookaheadReason || '',
                  ]
                    .filter(Boolean)
                    .join('，')
                }}
              </p>
            </div>
            <div v-if="prefixCacheDetail(state.chapterPassResult.prefixCache)" class="process-reason">
              <span>前缀缓存</span>
              <p>{{ prefixCacheDetail(state.chapterPassResult.prefixCache) }}</p>
            </div>
          </div>

          <div v-if="state.chapterPassResult.question.flags.length" class="process-tag-row">
            <span v-for="flag in state.chapterPassResult.question.flags" :key="flag" class="process-tag is-info">
              {{ flag }}
            </span>
          </div>
        </article>
      </div>
    </div>

    <div v-if="state.chapterSessionId" class="subpanel">
      <div class="subpanel-head">
        <h3>目录自动跑批</h3>
        <p>按自然顺序逐页处理，并以结构化卡片展示每一页的处理结果。</p>
      </div>
      <div class="field-grid compact-grid">
        <div class="field field-span-2">
          <span>图片文件夹</span>
          <div class="action-row inline-row">
            <button class="secondary-button" @click="actions.chooseAutoImageFolder">选择图片文件夹</button>
            <span class="glass-pill" :class="{ 'is-active': state.chapterAutoFiles.length > 0 }">
              {{ state.chapterAutoFolderLabel ? `${state.chapterAutoFolderLabel} · ${state.chapterAutoFiles.length} 张` : '尚未选择文件夹' }}
            </span>
          </div>
        </div>
      </div>
      <div class="action-row">
        <button
          class="secondary-button"
          :disabled="state.chapterAutoRunning || !state.chapterAutoFiles.length || !hasChapterArkApiKey"
          @click="actions.runChapterAuto"
        >
          {{ state.chapterAutoRunning ? '自动处理中...' : '自动逐页处理目录' }}
        </button>
        <button
          class="ghost-button"
          :disabled="!state.chapterAutoRunning"
          @click="actions.stopChapterAuto"
        >
          {{ state.chapterAutoStopping ? '停止中...' : '手动停止' }}
        </button>
        <button
          class="ghost-button"
          :disabled="state.chapterAutoRunning || !canResetChapterAuto"
          @click="actions.resetChapterAuto"
        >
          重置状态
        </button>
        <span class="glass-pill" :class="{ 'is-active': state.chapterProcessingMode === 'responses' }">{{ processingModeLabel }}</span>
        <span v-if="state.chapterAutoLive?.title" class="glass-pill" :class="{ 'is-active': state.chapterAutoRunning }">
          {{ state.chapterAutoLive.title }}
        </span>
      </div>
    </div>

    <p v-if="state.chapterAutoStatus" class="panel-status" :class="{ 'is-error': state.chapterAutoError }">
      {{ state.chapterAutoStatus }}
    </p>

    <div v-if="state.chapterAutoLive || state.chapterAutoSummary" class="process-panel">
      <article class="process-card process-live" :class="liveCardClass">
        <div class="process-card__header">
          <div>
            <strong>{{ liveTitle }}</strong>
            <p>{{ liveDetail }}</p>
          </div>
          <span class="process-badge" :class="liveBadgeClass">{{ liveBadge }}</span>
        </div>

        <div class="process-summary-grid">
          <article class="process-metric">
            <span>总页数</span>
            <strong>{{ state.chapterAutoSummary?.totalCount ?? state.chapterAutoLive?.totalCount ?? 0 }}</strong>
          </article>
          <article class="process-metric">
            <span>已完成</span>
            <strong>{{ state.chapterAutoSummary?.completedCount ?? state.chapterAutoLive?.completedCount ?? 0 }}</strong>
          </article>
          <article class="process-metric">
            <span>成功</span>
            <strong>{{ state.chapterAutoSummary?.successCount ?? state.chapterAutoLive?.successCount ?? 0 }}</strong>
          </article>
          <article class="process-metric">
            <span>失败</span>
            <strong>{{ state.chapterAutoSummary?.failedCount ?? state.chapterAutoLive?.failedCount ?? 0 }}</strong>
          </article>
        </div>

        <div class="process-key-grid">
          <div>
            <span>处理模式</span>
            <strong>{{ liveModeLabel }}</strong>
          </div>
          <div>
            <span>当前进度</span>
            <strong>{{ liveProgress }}</strong>
          </div>
          <div>
            <span>当前文件</span>
            <strong>{{ state.chapterAutoSummary?.currentFileName || state.chapterAutoLive?.currentFileName || '等待开始' }}</strong>
          </div>
          <div>
            <span>当前小节</span>
            <strong>{{ state.chapterAutoSummary?.currentSectionTitle || state.chapterAutoLive?.currentSectionTitle || '未初始化' }}</strong>
          </div>
          <div>
            <span>当前阶段</span>
            <strong>{{ state.chapterAutoSummary?.phase || state.chapterAutoLive?.phase || '待命' }}</strong>
          </div>
        </div>

        <template v-if="liveQuestion">
          <div class="process-inline-head">
            <strong>最近一页结构化细节</strong>
          </div>
          <div v-if="prefixCacheTagItems(livePrefixCache).length" class="process-tag-row">
            <span
              v-for="tag in prefixCacheTagItems(livePrefixCache)"
              :key="tag.key"
              class="process-tag"
              :class="tag.tone ? `is-${tag.tone}` : ''"
            >
              {{ tag.label }}
            </span>
          </div>
          <div class="process-key-grid">
            <div>
              <span>会话 start</span>
              <strong>{{ liveQuestion.sessionStoredProcessingStartQuestionKey || '无' }}</strong>
            </div>
            <div>
              <span>实际 start</span>
              <strong>{{ liveQuestion.effectiveProcessingStartQuestionKey || liveQuestion.processingStartQuestionKey || '无' }}</strong>
            </div>
            <div>
              <span>实际 end</span>
              <strong>{{ liveQuestion.effectiveExtractEndBeforeQuestionKey || '页尾' }}</strong>
            </div>
            <div>
              <span>提取模式</span>
              <strong>{{ liveQuestion.effectiveExtractMode || '默认' }}</strong>
            </div>
            <div>
              <span>续题标记</span>
              <strong>{{ liveQuestion.continueQuestionKey || '无' }}</strong>
            </div>
            <div>
              <span>边界续题</span>
              <strong>{{ liveQuestion.boundaryContinueQuestionKey || '无' }}</strong>
            </div>
            <div>
              <span>下一起点</span>
              <strong>{{ liveQuestion.nextStartQuestionKey || '无' }}</strong>
            </div>
            <div>
              <span>队列页面</span>
              <strong>{{ queueLabel(liveQuestion) }}</strong>
            </div>
          </div>

          <div class="process-reason-stack">
            <div v-if="liveQuestion.reason" class="process-reason">
              <span>处理结论</span>
              <p>{{ liveQuestion.reason }}</p>
            </div>
            <div v-if="liveQuestion.boundaryReason" class="process-reason">
              <span>边界判断</span>
              <p>{{ liveQuestion.boundaryReason }}</p>
            </div>
            <div v-if="liveQuestion.extractReason" class="process-reason">
              <span>提取说明</span>
              <p>{{ liveQuestion.extractReason }}</p>
            </div>
            <div v-if="liveQuestion.boundaryLookaheadLabel || liveQuestion.boundaryLookaheadReason" class="process-reason">
              <span>预读信息</span>
              <p>{{ lookaheadText(liveQuestion) }}</p>
            </div>
            <div v-if="prefixCacheDetail(livePrefixCache)" class="process-reason">
              <span>前缀缓存</span>
              <p>{{ prefixCacheDetail(livePrefixCache) }}</p>
            </div>
          </div>
        </template>
      </article>
    </div>

    <div v-if="state.chapterAutoEntries.length" class="process-timeline">
      <div class="subpanel-head process-feed-head">
        <h3>逐页结果</h3>
        <p>每处理完一页就立即追加结果卡，最新一页排在最上面。</p>
      </div>
      <article
        v-for="(entry, index) in autoEntries"
        :key="`${entry?.kind || 'item'}-${index}`"
        v-if="entry"
        class="process-card"
        :class="[`is-${entry.kind}`, { 'is-pending': entry.question?.pending }]"
      >
        <div class="process-card__header">
          <div>
            <strong>{{ entry.title }}</strong>
            <p>{{ entry.progressLabel }} · {{ entry.subtitle }}</p>
          </div>
          <span class="process-badge" :class="[`is-${entry.kind}`, { 'is-pending': entry.question?.pending }]">
            {{ processBadgeLabel(entry) }}
          </span>
        </div>

        <p v-if="entry.detail" class="process-card__detail">{{ entry.detail }}</p>

        <template v-if="entry.question">
          <div class="process-tag-row">
            <span class="process-tag">新增 {{ entry.question.upsertedCount }}</span>
            <span class="process-tag">归一化 {{ entry.question.normalizedCount }}</span>
            <span class="process-tag">边界提取 {{ entry.question.boundaryHasExtractableQuestions ? '是' : '否' }}</span>
            <span class="process-tag">边界续页 {{ entry.question.boundaryNeedNextPage ? '是' : '否' }}</span>
            <span class="process-tag">下一队列 {{ entry.question.pendingPagesCount || 0 }}</span>
            <span v-if="entry.question.pendingReviewCount" class="process-tag is-warn">
              待校对 {{ entry.question.pendingReviewCount }}
            </span>
            <span v-for="flag in entry.question.flags" :key="flag" class="process-tag is-info">{{ flag }}</span>
          </div>
          <div v-if="prefixCacheTagItems(entry.prefixCache).length" class="process-tag-row">
            <span
              v-for="tag in prefixCacheTagItems(entry.prefixCache)"
              :key="tag.key"
              class="process-tag"
              :class="tag.tone ? `is-${tag.tone}` : ''"
            >
              {{ tag.label }}
            </span>
          </div>

          <div class="process-key-grid">
            <div>
              <span>续题标记</span>
              <strong>{{ entry.question.continueQuestionKey || '无' }}</strong>
            </div>
            <div>
              <span>下一起点</span>
              <strong>{{ entry.question.nextStartQuestionKey || '无' }}</strong>
            </div>
            <div>
              <span>队列页数</span>
              <strong>{{ entry.question.pendingPagesCount || 0 }}</strong>
            </div>
            <div>
              <span>会话 start</span>
              <strong>{{ entry.question.sessionStoredProcessingStartQuestionKey || '无' }}</strong>
            </div>
            <div>
              <span>实际 start</span>
              <strong>{{ entry.question.effectiveProcessingStartQuestionKey || entry.question.processingStartQuestionKey || '无' }}</strong>
            </div>
            <div>
              <span>实际 end</span>
              <strong>{{ entry.question.effectiveExtractEndBeforeQuestionKey || '页尾' }}</strong>
            </div>
            <div>
              <span>提取模式</span>
              <strong>{{ entry.question.effectiveExtractMode || '默认' }}</strong>
            </div>
            <div>
              <span>边界续题</span>
              <strong>{{ entry.question.boundaryContinueQuestionKey || '无' }}</strong>
            </div>
            <div>
              <span>队列页面</span>
              <strong>{{ queueLabel(entry.question) }}</strong>
            </div>
          </div>

          <div class="process-reason-stack">
            <div v-if="entry.question.reason" class="process-reason">
              <span>处理结论</span>
              <p>{{ entry.question.reason }}</p>
            </div>
            <div v-if="entry.question.boundaryReason" class="process-reason">
              <span>边界判断</span>
              <p>{{ entry.question.boundaryReason }}</p>
            </div>
            <div v-if="entry.question.extractReason" class="process-reason">
              <span>提取说明</span>
              <p>{{ entry.question.extractReason }}</p>
            </div>
            <div v-if="entry.question.boundaryLookaheadLabel || entry.question.boundaryLookaheadReason" class="process-reason">
              <span>预读信息</span>
              <p>{{ lookaheadText(entry.question) }}</p>
            </div>
            <div
              v-if="entry.question.retryExtractReason || entry.question.integrityRetryReason || entry.question.rangeRetryReason"
              class="process-reason"
            >
              <span>补充说明</span>
              <p>{{ entry.question.retryExtractReason || entry.question.integrityRetryReason || entry.question.rangeRetryReason }}</p>
            </div>
            <div v-if="prefixCacheDetail(entry.prefixCache)" class="process-reason">
              <span>前缀缓存</span>
              <p>{{ prefixCacheDetail(entry.prefixCache) }}</p>
            </div>
          </div>
        </template>
      </article>
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

const autoEntries = computed(() => [...props.state.chapterAutoEntries].reverse())

const processingModeLabel = computed(() =>
  props.state.chapterProcessingMode === 'responses' ? 'Responses前缀缓存实验版' : '原逻辑',
)

const processingModeHint = computed(() =>
  props.state.chapterProcessingMode === 'responses'
    ? '单页调试和目录自动处理都会走 Responses 前缀缓存实验接口。'
    : '单页调试和目录自动处理都会走当前稳定接口。',
)

const isModeSwitchLocked = computed(() => props.state.chapterProcessing || props.state.chapterAutoRunning)
const hasChapterArkApiKey = computed(() => Boolean(String(props.state.chapterArkApiKey || '').trim()))
const canResetChapterAuto = computed(
  () =>
    Boolean(
      props.state.chapterAutoStatus ||
        props.state.chapterAutoEntries.length ||
        props.state.chapterAutoSummary ||
        props.state.chapterAutoLive,
    ) && !props.state.chapterAutoRunning,
)

const liveSource = computed(() => props.state.chapterAutoLive || props.state.chapterAutoSummary || null)

const liveModeLabel = computed(
  () => props.state.chapterAutoLive?.modeLabel || props.state.chapterAutoSummary?.modeLabel || processingModeLabel.value,
)

const liveTitle = computed(() => liveSource.value?.title || (props.state.chapterAutoRunning ? '自动处理进行中' : '自动处理状态'))

const liveDetail = computed(() => {
  if (liveSource.value?.detail) {
    return liveSource.value.detail
  }
  if (props.state.chapterAutoRunning) {
    return '当前页处理状态会在这里实时刷新。'
  }
  return '尚未开始自动处理。'
})

const liveProgress = computed(() => {
  const currentIndex = liveSource.value?.currentIndex ?? 0
  const totalCount = liveSource.value?.totalCount ?? 0
  return totalCount ? `${currentIndex}/${totalCount}` : '0/0'
})

const liveBadge = computed(() => {
  if (props.state.chapterAutoLive?.phase === 'stopped' || props.state.chapterAutoSummary?.phase === '已手动停止') {
    return '已停止'
  }
  if (props.state.chapterAutoRunning) return '进行中'
  if (props.state.chapterAutoError) return '失败'
  if (props.state.chapterAutoSummary) return '已完成'
  return '待命'
})

const liveBadgeClass = computed(() => {
  if (props.state.chapterAutoRunning) return 'is-progress'
  if (props.state.chapterAutoError) return 'is-failed'
  if (props.state.chapterAutoSummary) return 'is-done'
  return ''
})

const liveCardClass = computed(() => {
  if (props.state.chapterAutoRunning) return 'is-progress'
  if (props.state.chapterAutoError) return 'is-failed'
  if (props.state.chapterAutoSummary) return 'is-done'
  return ''
})

const liveQuestion = computed(() => {
  if (props.state.chapterAutoLive?.question) {
    return props.state.chapterAutoLive.question
  }
  const latestEntry = [...props.state.chapterAutoEntries].reverse().find((entry) => entry?.question)
  return latestEntry?.question || null
})

const livePrefixCache = computed(() => {
  if (props.state.chapterAutoLive?.prefixCache) {
    return props.state.chapterAutoLive.prefixCache
  }
  const latestEntry = [...props.state.chapterAutoEntries].reverse().find((entry) => entry?.prefixCache)
  return latestEntry?.prefixCache || null
})

function queueLabel(question) {
  if (!question?.pendingPageLabels?.length) {
    return '无'
  }
  return question.pendingPageLabels.join(' / ')
}

function lookaheadText(question) {
  return [
    question?.boundaryLookaheadLabel ? `预读页 ${question.boundaryLookaheadLabel}` : '',
    question?.boundaryLookaheadReason || '',
  ]
    .filter(Boolean)
    .join('，') || '无'
}

function processBadgeLabel(entry) {
  if (!entry) return ''
  if (entry.kind === 'failed') return '失败'
  if (entry.question?.pending) return '待续页'
  return '成功'
}

function seedSourceLabel(source) {
  switch (source) {
    case 'fixed':
      return '固定 seed'
    case 'local-cache':
      return '本地复用'
    case 'remote-create':
      return '新建 seed'
    case 'remote-refresh':
      return '刷新 seed'
    default:
      return '未知来源'
  }
}

function prefixCacheTagItems(prefixCache) {
  if (!prefixCache) {
    return []
  }

  const tags = []
  tags.push({
    key: 'enabled',
    label: prefixCache.enabled ? '前缀缓存已启用' : '前缀缓存未确认',
    tone: prefixCache.enabled ? 'info' : 'warn',
  })

  if (prefixCache.boundary) {
    tags.push({
      key: 'boundary',
      label: `边界${prefixCache.boundary.hit ? '命中' : '未命中'} ${prefixCache.boundary.usage.cachedTokens}`,
      tone: prefixCache.boundary.hit ? 'info' : '',
    })
  }

  if (prefixCache.extracts?.runs) {
    tags.push({
      key: 'extract',
      label: `提取命中 ${prefixCache.extracts.hitCount}/${prefixCache.extracts.runs}`,
      tone: prefixCache.extracts.hitCount > 0 ? 'info' : '',
    })
  }

  tags.push({
    key: 'cached',
    label: `Cached Tokens ${prefixCache.totalCachedTokens || 0}`,
    tone: prefixCache.totalCachedTokens > 0 ? 'info' : '',
  })

  return tags
}

function prefixCacheDetail(prefixCache) {
  if (!prefixCache) {
    return ''
  }

  const lines = []
  if (prefixCache.boundary) {
    lines.push(
      `边界: ${prefixCache.boundary.hit ? '命中' : '未命中'}，cached ${prefixCache.boundary.usage.cachedTokens}，${seedSourceLabel(prefixCache.boundary.seedSource)}`,
    )
  }

  if (prefixCache.extracts?.runs) {
    const extractSource = prefixCache.extracts.latestSeedSource
      ? `，最近一次 ${seedSourceLabel(prefixCache.extracts.latestSeedSource)}`
      : ''
    lines.push(
      `提取: ${prefixCache.extracts.hitCount}/${prefixCache.extracts.runs} 次命中，cached ${prefixCache.extracts.cachedTokens}${extractSource}`,
    )
  } else {
    lines.push('提取: 本页未触发结构化提取')
  }

  lines.push(`总 cached tokens: ${prefixCache.totalCachedTokens || 0}`)
  return lines.join('；')
}
</script>
