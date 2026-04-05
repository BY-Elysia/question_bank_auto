<template>
  <GlassPanel
    eyebrow="Step 02"
    title="章节会话与自动处理"
    description="支持单章逐页推进，也支持多份初始化 JSON 与图片文件夹并行提取。"
    tone="ice"
    prominent
  >
    <div class="subpanel-head">
      <h3>工作模式</h3>
      <p>单章流程适合逐页调试；多章并行适合多份初始化好的 JSON 同时跑目录。</p>
    </div>
    <div class="mode-switch" role="tablist" aria-label="结构化提取工作模式">
      <button
        type="button"
        class="mode-switch__button"
        :class="{ 'is-active': state.chapterRunMode === 'single' }"
        :disabled="isRunModeSwitchLocked"
        @click="actions.setChapterRunMode('single')"
      >
        <strong>单章流程</strong>
        <span>沿用当前章节会话，适合单页调试和单目录跑批</span>
      </button>
      <button
        type="button"
        class="mode-switch__button"
        :class="{ 'is-active': state.chapterRunMode === 'multi' }"
        :disabled="isRunModeSwitchLocked"
        @click="actions.setChapterRunMode('multi')"
      >
        <strong>多章并行</strong>
        <span>多份 JSON 和图片文件夹同时处理，共享同一个 API Key</span>
      </button>
    </div>
    <p class="mode-switch__hint">当前工作模式：{{ runModeLabel }}。{{ runModeHint }}</p>

    <div class="subpanel">
      <div class="subpanel-head">
        <h3>提取凭证</h3>
        <p>API Key 只保存在当前页面内存中。单章和多章模式都会复用这里的 Key。</p>
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
            placeholder="请输入本次结构化提取使用的 API Key"
          />
        </label>
      </div>
    </div>

    <div class="subpanel">
      <div class="subpanel-head">
        <h3>处理链路</h3>
        <p>只切换调用入口，现有后端结构化逻辑保持不变。</p>
      </div>
      <div class="mode-switch" role="tablist" aria-label="章节处理链路">
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
        当前链路：{{ processingModeLabel }}。{{ isModeSwitchLocked ? '运行中暂时锁定，避免处理中混用两种链路。' : processingModeHint }}
      </p>
    </div>

    <template v-if="state.chapterRunMode === 'single'">
      <div class="subpanel">
        <div class="subpanel-head">
          <h3>单章子模式</h3>
          <p>可以继续沿用逐页会话，也可以改用手工分段批处理。</p>
        </div>
        <div class="mode-switch" role="tablist" aria-label="单章处理模式">
          <button
            type="button"
            class="mode-switch__button"
            :class="{ 'is-active': state.chapterSingleMode === 'session' }"
            :disabled="isSingleModeSwitchLocked"
            @click="actions.setChapterSingleMode('session')"
          >
            <strong>逐页会话</strong>
            <span>初始化当前章/小节后，逐页调试或按目录顺序跑批</span>
          </button>
          <button
            type="button"
            class="mode-switch__button"
            :class="{ 'is-active': state.chapterSingleMode === 'manual' }"
            :disabled="isSingleModeSwitchLocked"
            @click="actions.setChapterSingleMode('manual')"
          >
            <strong>手工分段</strong>
            <span>手动配置章名、小节名和对应图片，按片段一次性全部生成</span>
          </button>
        </div>
        <p class="mode-switch__hint">{{ singleModeHint }}</p>
      </div>

      <template v-if="state.chapterSingleMode === 'session'">
      <div class="subpanel">
        <div class="field-grid">
          <div class="field field-span-2">
            <span>目标 JSON 文件</span>
            <div class="action-row inline-row">
              <button class="secondary-button" @click="actions.chooseJsonSessionFile">选择 JSON 文件</button>
              <button
                class="ghost-button"
                :disabled="!state.chapterSessionServerJsonPath"
                @click="actions.downloadCurrentWorkingJson"
              >
                下载当前最新 JSON
              </button>
              <span class="glass-pill" :class="{ 'is-active': Boolean(state.chapterSessionJsonLabel) }">
                {{ state.chapterSessionJsonLabel || '尚未选择文件' }}
              </span>
            </div>
          </div>
          <label class="field">
            <span>当前章</span>
            <input v-model.trim="state.chapterSessionInitChapter" class="glass-input" type="text" placeholder="第八章 不定积分" />
          </label>
          <label class="field">
            <span>当前小节</span>
            <input v-model.trim="state.chapterSessionInitSection" class="glass-input" type="text" placeholder="习题8.1" />
          </label>
        </div>

        <div class="action-row">
          <button class="primary-button" @click="actions.initChapterSession">初始化会话</button>
          <span v-if="state.chapterSessionId" class="glass-pill is-active">session {{ state.chapterSessionId }}</span>
          <span class="glass-pill" :class="{ 'is-active': state.chapterProcessingMode === 'responses' }">{{ processingModeLabel }}</span>
        </div>
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
        </div>
        <div v-if="state.chapterPassResult" class="process-panel">
          <div class="process-summary-grid">
            <article class="process-metric">
              <span>当前小节</span>
              <strong>{{ state.chapterPassResult.sectionTitle }}</strong>
            </article>
            <article class="process-metric">
              <span>新增题目</span>
              <strong>{{ state.chapterPassResult.question.upsertedCount }}</strong>
            </article>
            <article class="process-metric">
              <span>总题目数</span>
              <strong>{{ state.chapterPassResult.questionsCount }}</strong>
            </article>
          </div>
          <pre v-if="state.chapterPassLogs" class="code-surface chapter-task-log">{{ state.chapterPassLogs }}</pre>
        </div>
      </div>

      <div v-if="state.chapterSessionId" class="subpanel">
        <div class="subpanel-head">
          <h3>目录自动跑批</h3>
          <p>按自然顺序逐页处理，并持续显示当前进度与日志。</p>
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
          <button class="ghost-button" :disabled="!state.chapterAutoRunning" @click="actions.stopChapterAuto">
            {{ state.chapterAutoStopping ? '停止中...' : '手动停止' }}
          </button>
          <button class="ghost-button" :disabled="state.chapterAutoRunning || !canResetChapterAuto" @click="actions.resetChapterAuto">
            重置状态
          </button>
        </div>
      </div>

      <p v-if="state.chapterAutoStatus" class="panel-status" :class="{ 'is-error': state.chapterAutoError }">
        {{ state.chapterAutoStatus }}
      </p>

      <div v-if="state.chapterAutoSummary || state.chapterAutoLive" class="process-panel">
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
          <pre v-if="state.chapterAutoLogs" class="code-surface chapter-task-log">{{ state.chapterAutoLogs }}</pre>
        </article>
      </div>
      </template>

      <template v-else>
        <div class="subpanel">
          <div class="subpanel-head">
            <h3>目标文件</h3>
            <p>先绑定同一个教材 JSON，后面所有手工分段都会按你配置的章名和小节名依次写进这份文件。</p>
          </div>
          <div class="field-grid compact-grid">
            <div class="field field-span-2">
              <span>目标 JSON 文件</span>
              <div class="action-row inline-row">
                <button class="secondary-button" @click="actions.chooseJsonSessionFile">选择 JSON 文件</button>
                <button
                  class="ghost-button"
                  :disabled="!state.chapterSessionServerJsonPath"
                  @click="actions.downloadCurrentWorkingJson"
                >
                  下载当前最新 JSON
                </button>
                <span class="glass-pill" :class="{ 'is-active': Boolean(state.chapterSessionJsonLabel) }">
                  {{ state.chapterSessionJsonLabel || '尚未选择文件' }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <p v-if="state.chapterManualStatus" class="panel-status" :class="{ 'is-error': state.chapterManualError }">
          {{ state.chapterManualStatus }}
        </p>

        <div v-if="state.chapterSessionJsonLabel" class="subpanel">
          <div class="subpanel-head">
            <h3>分段配置</h3>
            <p>每个章节下面可以继续添加多个小节。每个小节都绑定自己的一组图片，系统会按你现在的顺序串行处理。</p>
          </div>
          <div class="action-row">
            <button class="secondary-button" :disabled="state.chapterManualRunning" @click="actions.addChapterManualChapter">新增章节</button>
            <span class="glass-pill is-active">已配置 {{ manualReadyCount }} / {{ manualSectionCount }} 个小节片段</span>
          </div>
        </div>

        <div v-if="state.chapterSessionJsonLabel" class="chapter-task-list">
          <article
            v-for="(chapter, chapterIndex) in manualChapters"
            :key="chapter.id"
            class="process-card chapter-task-card"
          >
            <div class="process-card__header">
              <div>
                <strong>第 {{ chapterIndex + 1 }} 章配置</strong>
                <p>{{ chapter.chapterTitle || '未填写章名' }} · {{ (chapter.sections || []).length }} 个小节</p>
              </div>
              <span class="process-badge" :class="{ 'is-done': manualChapterReadyCount(chapter) > 0 }">
                {{ manualChapterReadyCount(chapter) }}/{{ (chapter.sections || []).length }} 已就绪
              </span>
            </div>

            <div class="field-grid compact-grid">
              <label class="field field-span-2">
                <span>章节名称</span>
                <input
                  v-model.trim="chapter.chapterTitle"
                  class="glass-input"
                  type="text"
                  :disabled="state.chapterManualRunning"
                  placeholder="例如：第八章 不定积分"
                />
              </label>
            </div>

            <div
              v-for="(section, sectionIndex) in chapter.sections"
              :key="section.id"
              class="subpanel"
            >
              <div class="process-card__header">
                <div>
                  <strong>小节 {{ sectionIndex + 1 }}</strong>
                  <p>{{ manualSectionLabel(chapter, section) }}</p>
                </div>
                <span class="process-badge" :class="manualSectionBadgeClass(chapter, section)">
                  {{ manualSectionBadgeLabel(chapter, section) }}
                </span>
              </div>

              <div class="field-grid compact-grid">
                <label class="field">
                  <span>小节名称</span>
                  <input
                    v-model.trim="section.sectionTitle"
                    class="glass-input"
                    type="text"
                    :disabled="state.chapterManualRunning"
                    placeholder="例如：习题8.1"
                  />
                </label>
                <div class="field">
                  <span>图片</span>
                  <div class="action-row inline-row wrap-top">
                    <label class="file-shell">
                      <span>上传这一小节图片</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        multiple
                        :disabled="state.chapterManualRunning"
                        @change="actions.onChapterManualSectionImagesChange(chapter.id, section.id, $event)"
                      />
                    </label>
                    <span class="glass-pill" :class="{ 'is-active': section.imageFiles.length > 0 }">
                      {{ section.imageFiles.length ? `已选 ${section.imageFiles.length} 张` : '尚未上传图片' }}
                    </span>
                    <button
                      class="ghost-button"
                      :disabled="state.chapterManualRunning || !section.imageFiles.length"
                      @click="actions.clearChapterManualSectionImages(chapter.id, section.id)"
                    >
                      清空图片
                    </button>
                  </div>
                </div>
              </div>

              <p v-if="section.status" class="panel-status" :class="{ 'is-error': section.error }">{{ section.status }}</p>
              <pre v-if="section.logs" class="code-surface chapter-task-log">{{ section.logs }}</pre>

              <div class="action-row">
                <button class="ghost-button" :disabled="state.chapterManualRunning" @click="actions.removeChapterManualSection(chapter.id, section.id)">
                  删除这个小节
                </button>
              </div>
            </div>

            <div class="action-row">
              <button class="secondary-button" :disabled="state.chapterManualRunning" @click="actions.addChapterManualSection(chapter.id)">给这一章新增小节</button>
              <button class="ghost-button" :disabled="state.chapterManualRunning" @click="actions.removeChapterManualChapter(chapter.id)">删除这一章</button>
            </div>
          </article>
        </div>

        <div v-if="state.chapterSessionJsonLabel" class="subpanel">
          <div class="subpanel-head">
            <h3>开始生成</h3>
            <p>会严格按你当前看到的顺序，从上到下依次处理每个小节片段，并持续把结果同步回本地 JSON。</p>
          </div>
          <div class="action-row">
            <button
              class="primary-button"
              :disabled="state.chapterManualRunning || !manualReadyCount || !hasChapterArkApiKey"
              @click="actions.runChapterManualBatch"
            >
              {{ state.chapterManualRunning ? '批量处理中...' : '开始按分段批量生成' }}
            </button>
            <button class="ghost-button" :disabled="!state.chapterManualRunning" @click="actions.stopChapterManualBatch">
              {{ state.chapterManualStopping ? '停止中...' : '手动停止' }}
            </button>
            <button class="ghost-button" :disabled="state.chapterManualRunning || !canResetChapterManual" @click="actions.resetChapterManualBatch">
              重置状态
            </button>
          </div>
        </div>

        <div v-if="state.chapterManualSummary || state.chapterManualLive" class="process-panel">
          <article class="process-card process-live" :class="manualLiveCardClass">
            <div class="process-card__header">
              <div>
                <strong>{{ manualLiveTitle }}</strong>
                <p>{{ manualLiveDetail }}</p>
              </div>
              <span class="process-badge" :class="manualLiveBadgeClass">{{ manualLiveBadge }}</span>
            </div>
            <div class="process-summary-grid">
              <article class="process-metric">
                <span>总片段</span>
                <strong>{{ state.chapterManualSummary?.totalCount ?? state.chapterManualLive?.totalCount ?? 0 }}</strong>
              </article>
              <article class="process-metric">
                <span>已完成</span>
                <strong>{{ state.chapterManualSummary?.completedCount ?? state.chapterManualLive?.completedCount ?? 0 }}</strong>
              </article>
              <article class="process-metric">
                <span>成功</span>
                <strong>{{ state.chapterManualSummary?.successCount ?? state.chapterManualLive?.successCount ?? 0 }}</strong>
              </article>
              <article class="process-metric">
                <span>失败</span>
                <strong>{{ state.chapterManualSummary?.failedCount ?? state.chapterManualLive?.failedCount ?? 0 }}</strong>
              </article>
            </div>
            <pre v-if="state.chapterManualLogs" class="code-surface chapter-task-log">{{ state.chapterManualLogs }}</pre>
          </article>
        </div>
      </template>
    </template>

    <template v-else>
      <div class="subpanel">
        <div class="subpanel-head">
          <h3>多章并行配置</h3>
          <p>每个任务都使用独立 session 和独立 JSON 副本处理，完成后会同步回你选择的本地文件。</p>
        </div>
        <div class="field-grid compact-grid">
          <label class="field">
            <span>最大并行数</span>
            <input
              v-model.number="state.chapterBatchConcurrency"
              class="glass-input"
              type="number"
              min="1"
              max="6"
              :disabled="state.chapterBatchRunning"
              @change="actions.setChapterBatchConcurrency(state.chapterBatchConcurrency)"
            />
          </label>
          <div class="info-card chapter-batch-overview">
            <span class="info-label">任务概览</span>
            <strong>{{ configuredBatchTaskCount }} / {{ batchTasks.length }}</strong>
            <p>{{ readyBatchTaskCount }} 个任务已就绪，可直接开始</p>
          </div>
        </div>
        <div class="action-row">
          <button class="secondary-button" :disabled="state.chapterBatchRunning" @click="actions.addChapterBatchTask">添加章节任务</button>
          <button
            class="primary-button"
            :disabled="state.chapterBatchRunning || !batchTasks.length || !hasChapterArkApiKey"
            @click="actions.runChapterBatch"
          >
            {{ state.chapterBatchRunning ? '多章处理中...' : '开始多章并行处理' }}
          </button>
          <button class="ghost-button" :disabled="!state.chapterBatchRunning" @click="actions.stopChapterBatch">
            {{ state.chapterBatchStopping ? '停止中...' : '手动停止' }}
          </button>
          <button class="ghost-button" :disabled="state.chapterBatchRunning || !canResetChapterBatch" @click="actions.resetChapterBatch">
            重置运行状态
          </button>
        </div>
      </div>

      <p v-if="state.chapterBatchStatus" class="panel-status" :class="{ 'is-error': state.chapterBatchError }">
        {{ state.chapterBatchStatus }}
      </p>
      <p v-if="state.multiChapterSlotsStatus" class="panel-status" :class="{ 'is-error': state.multiChapterSlotsError }">
        {{ state.multiChapterSlotsStatus }}
      </p>

      <div v-if="batchTasks.length" class="process-panel">
        <article class="process-card process-live" :class="batchSummaryCardClass">
          <div class="process-summary-grid">
            <article class="process-metric">
              <span>任务总数</span>
              <strong>{{ batchSummary.total }}</strong>
            </article>
            <article class="process-metric">
              <span>已就绪</span>
              <strong>{{ batchSummary.ready }}</strong>
            </article>
            <article class="process-metric">
              <span>运行中</span>
              <strong>{{ batchSummary.running }}</strong>
            </article>
            <article class="process-metric">
              <span>完成页数</span>
              <strong>{{ batchSummary.pagesCompleted }}/{{ batchSummary.pagesTotal }}</strong>
            </article>
          </div>
        </article>
      </div>

      <div v-if="batchTasks.length" class="chapter-task-list">
        <article
          v-for="task in batchTasks"
          :key="task.id"
          class="process-card chapter-task-card"
          :class="batchTaskCardClass(task)"
        >
          <div class="process-card__header">
            <div>
              <strong>{{ batchTaskLabel(task) }}</strong>
              <p>{{ task.slotRelativePath || '未选择工作区槽位' }} · {{ task.slotJsonFileName || '未绑定 JSON' }}</p>
            </div>
            <span class="process-badge" :class="batchTaskBadgeClass(task)">{{ batchTaskBadgeLabel(task) }}</span>
          </div>

          <div class="field-grid compact-grid">
            <div class="field field-span-2">
              <span>工作区槽位</span>
              <div class="action-row inline-row">
                <select
                  class="glass-input"
                  :disabled="state.chapterBatchRunning || state.multiChapterSlotsLoading"
                  :value="task.slotRelativePath || ''"
                  @change="actions.setChapterBatchTaskSlot(task.id, $event.target.value)"
                >
                  <option value="">请选择章节槽位</option>
                  <option
                    v-for="slot in multiChapterSlots"
                    :key="slot.slotRelativePath"
                    :value="slot.slotRelativePath"
                  >
                    {{ slot.slotRelativePath }} · {{ slot.imageCount }} 张
                  </option>
                </select>
                <span class="glass-pill" :class="{ 'is-active': Boolean(task.slotJsonFileName) }">
                  {{ task.slotJsonFileName || '尚未绑定 JSON' }}
                </span>
              </div>
            </div>
            <label class="field">
              <span>当前章</span>
              <input v-model.trim="task.initChapter" class="glass-input" type="text" :disabled="state.chapterBatchRunning" placeholder="第八章 不定积分" />
            </label>
            <label class="field">
              <span>当前小节</span>
              <input v-model.trim="task.initSection" class="glass-input" type="text" :disabled="state.chapterBatchRunning" placeholder="??8.1" />
            </label>
            <div class="field field-span-2">
              <span>槽位图片</span>
              <div class="action-row inline-row wrap-top">
                <label class="file-shell">
                  <span>上传并覆盖槽位图片</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    multiple
                    :disabled="state.chapterBatchRunning || !task.slotRelativePath"
                    @change="actions.uploadChapterBatchTaskImages(task.id, $event)"
                  />
                </label>
                <span class="glass-pill" :class="{ 'is-active': Number(task.slotImageCount || 0) > 0 }">
                  {{ task.slotRelativePath ? `${task.slotRelativePath} · ${task.slotImageCount || 0} 张` : '请先选择槽位' }}
                </span>
              </div>
            </div>
          </div>

          <div class="action-row">
            <span v-if="task.sessionId" class="glass-pill is-active">session {{ task.sessionId }}</span>
            <span class="glass-pill" :class="{ 'is-active': isBatchTaskReady(task) }">{{ isBatchTaskReady(task) ? '已就绪' : '待补全' }}</span>
            <button class="ghost-button" :disabled="state.chapterBatchRunning" @click="actions.removeChapterBatchTask(task.id)">移除任务</button>
          </div>

          <p v-if="task.status" class="panel-status" :class="{ 'is-error': task.error }">{{ task.status }}</p>

          <div class="process-summary-grid">
            <article class="process-metric">
              <span>总页数</span>
              <strong>{{ task.totalCount || task.slotImageCount || 0 }}</strong>
            </article>
            <article class="process-metric">
              <span>已完成</span>
              <strong>{{ task.completedCount || 0 }}</strong>
            </article>
            <article class="process-metric">
              <span>成功</span>
              <strong>{{ task.successCount || 0 }}</strong>
            </article>
            <article class="process-metric">
              <span>失败</span>
              <strong>{{ task.failedCount || 0 }}</strong>
            </article>
          </div>

          <div class="process-key-grid">
            <div>
              <span>当前进度</span>
              <strong>{{ batchTaskProgress(task) }}</strong>
            </div>
            <div>
              <span>当前章</span>
              <strong>{{ task.currentChapter || task.initChapter || '未设置' }}</strong>
            </div>
            <div>
              <span>当前小节</span>
              <strong>{{ task.currentSection || task.initSection || '未设置' }}</strong>
            </div>
            <div>
              <span>当前文件</span>
              <strong>{{ task.currentFileName || '等待开始' }}</strong>
            </div>
            <div>
              <span>当前阶段</span>
              <strong>{{ task.phase || '??' }}</strong>
            </div>
          </div>

          <div v-if="batchTaskLogTail(task)" class="chapter-task-log-stack">
            <pre class="code-surface chapter-task-log">{{ batchTaskLogTail(task) }}</pre>
            <details v-if="batchTaskLogFull(task) && batchTaskLogFull(task) !== batchTaskLogTail(task)" class="chapter-task-log-details">
              <summary>查看完整处理日志</summary>
              <pre class="code-surface chapter-task-log chapter-task-log--full">{{ batchTaskLogFull(task) }}</pre>
            </details>
          </div>
        </article>
      </div>
    </template>
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

const batchTasks = computed(() => (Array.isArray(props.state.chapterBatchTasks) ? props.state.chapterBatchTasks : []))
const multiChapterSlots = computed(() => (Array.isArray(props.state.multiChapterSlots) ? props.state.multiChapterSlots : []))

const runModeLabel = computed(() => (props.state.chapterRunMode === 'multi' ? '多章并行' : '单章流程'))
const processingModeLabel = computed(() => (props.state.chapterProcessingMode === 'responses' ? 'Responses前缀缓存实验版' : '原逻辑'))

const isRunModeSwitchLocked = computed(
  () => props.state.chapterProcessing || props.state.chapterAutoRunning || props.state.chapterBatchRunning || props.state.chapterManualRunning,
)
const isSingleModeSwitchLocked = computed(
  () => props.state.chapterProcessing || props.state.chapterAutoRunning || props.state.chapterManualRunning,
)

const runModeHint = computed(() => {
  if (isRunModeSwitchLocked.value) {
    return '运行中暂时锁定，避免单章和多章流程混用。'
  }
  return props.state.chapterRunMode === 'multi'
    ? '为每一章分别配置 JSON、当前章、当前小节和图片文件夹，再按并行数统一启动。'
    : '沿用当前会话逐页推进，适合单章调试和单目录顺序跑批。'
})

const singleModeHint = computed(() => {
  if (isSingleModeSwitchLocked.value) {
    return '运行中暂时锁定，避免逐页会话和手工分段混用。'
  }
  return props.state.chapterSingleMode === 'manual'
    ? '你手动定义章名和小节名，系统按当前顺序把每个片段整段写入同一个 JSON。'
    : '仍按当前章/小节会话逐页推进，适合单页调试与目录顺序跑批。'
})

const processingModeHint = computed(() =>
  props.state.chapterProcessingMode === 'responses'
    ? '单章和多章都会走 Responses 前缀缓存实验接口。'
    : '单章和多章都会走当前稳定接口。',
)

const isModeSwitchLocked = computed(
  () => props.state.chapterProcessing || props.state.chapterAutoRunning || props.state.chapterBatchRunning || props.state.chapterManualRunning,
)
const hasChapterArkApiKey = computed(() => Boolean(String(props.state.chapterArkApiKey || '').trim()))
const manualChapters = computed(() => (Array.isArray(props.state.chapterManualChapters) ? props.state.chapterManualChapters : []))

const canResetChapterAuto = computed(
  () =>
    Boolean(
      props.state.chapterAutoStatus ||
        props.state.chapterAutoEntries.length ||
        props.state.chapterAutoSummary ||
        props.state.chapterAutoLive,
    ) && !props.state.chapterAutoRunning,
)

const canResetChapterManual = computed(
  () =>
    Boolean(
      props.state.chapterManualStatus ||
        props.state.chapterManualLogs ||
        props.state.chapterManualSummary ||
        props.state.chapterManualLive,
    ) && !props.state.chapterManualRunning,
)

const canResetChapterBatch = computed(
  () =>
    Boolean(
      props.state.chapterBatchStatus ||
        props.state.chapterBatchTasks.some((task) => task?.status || task?.completedCount || task?.sessionId),
    ) && !props.state.chapterBatchRunning,
)

const liveSource = computed(() => props.state.chapterAutoLive || props.state.chapterAutoSummary || null)
const liveTitle = computed(() => liveSource.value?.title || (props.state.chapterAutoRunning ? '自动处理进行中' : '自动处理状态'))
const liveDetail = computed(() => liveSource.value?.detail || props.state.chapterAutoStatus || '尚未开始自动处理。')

const liveBadge = computed(() => {
  if (props.state.chapterAutoLive?.phase === 'stopped' || props.state.chapterAutoSummary?.phase === '已手动停止') return '已停止'
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

const manualSectionCount = computed(() =>
  manualChapters.value.reduce((sum, chapter) => sum + (Array.isArray(chapter?.sections) ? chapter.sections.length : 0), 0),
)

const manualReadyCount = computed(() =>
  manualChapters.value.reduce(
    (sum, chapter) =>
      sum + (Array.isArray(chapter?.sections) ? chapter.sections.filter((section) => isManualSectionReady(chapter, section)).length : 0),
    0,
  ),
)

const manualLiveSource = computed(() => props.state.chapterManualLive || props.state.chapterManualSummary || null)
const manualLiveTitle = computed(() => (props.state.chapterManualRunning ? '手工分段处理中' : '手工分段状态'))
const manualLiveDetail = computed(() => {
  const label = String(manualLiveSource.value?.currentLabel || '').trim()
  if (label) {
    return `当前片段：${label}`
  }
  return props.state.chapterManualStatus || '尚未开始手工分段处理。'
})

const manualLiveBadge = computed(() => {
  if (props.state.chapterManualLive?.stopped || props.state.chapterManualSummary?.stopped) return '已停止'
  if (props.state.chapterManualRunning) return '进行中'
  if (props.state.chapterManualError) return '失败'
  if (props.state.chapterManualSummary) return '已完成'
  return '待命'
})

const manualLiveBadgeClass = computed(() => {
  if (props.state.chapterManualRunning) return 'is-progress'
  if (props.state.chapterManualError) return 'is-failed'
  if (props.state.chapterManualSummary) return 'is-done'
  return ''
})

const manualLiveCardClass = computed(() => {
  if (props.state.chapterManualRunning) return 'is-progress'
  if (props.state.chapterManualError) return 'is-failed'
  if (props.state.chapterManualSummary) return 'is-done'
  return ''
})

const configuredBatchTaskCount = computed(() => batchTasks.value.filter((task) => isBatchTaskConfigured(task)).length)
const readyBatchTaskCount = computed(() => batchTasks.value.filter((task) => isBatchTaskReady(task)).length)

const batchSummary = computed(() => ({
  total: batchTasks.value.length,
  ready: batchTasks.value.filter((task) => isBatchTaskReady(task)).length,
  running: batchTasks.value.filter((task) => task?.running).length,
  pagesCompleted: batchTasks.value.reduce((sum, task) => sum + Number(task?.completedCount ?? 0), 0),
  pagesTotal: batchTasks.value.reduce((sum, task) => sum + Number(task?.totalCount || task?.slotImageCount || 0), 0),
}))

const batchSummaryCardClass = computed(() => {
  if (props.state.chapterBatchStopping || props.state.chapterBatchRunning) return 'is-progress'
  if (props.state.chapterBatchError) return 'is-failed'
  return ''
})

function isBatchTaskConfigured(task) {
  return Boolean(
    String(task?.slotRelativePath || '').trim() ||
      String(task?.initChapter || '').trim() ||
      String(task?.initSection || '').trim() ||
      Number(task?.slotImageCount || 0) > 0,
  )
}

function isManualSectionReady(chapter, section) {
  return Boolean(
    String(chapter?.chapterTitle || '').trim()
      && String(section?.sectionTitle || '').trim()
      && Array.isArray(section?.imageFiles)
      && section.imageFiles.length,
  )
}

function manualSectionLabel(chapter, section) {
  return [String(chapter?.chapterTitle || '').trim(), String(section?.sectionTitle || '').trim()]
    .filter(Boolean)
    .join(' / ') || '未命名片段'
}

function manualChapterReadyCount(chapter) {
  return Array.isArray(chapter?.sections) ? chapter.sections.filter((section) => isManualSectionReady(chapter, section)).length : 0
}

function manualSectionBadgeLabel(chapter, section) {
  if (section?.running) return '处理中'
  if (section?.completed) return '已完成'
  if (section?.error) return '失败'
  if (isManualSectionReady(chapter, section)) return '已就绪'
  return '待补全'
}

function manualSectionBadgeClass(chapter, section) {
  if (section?.running) return 'is-progress'
  if (section?.completed) return 'is-done'
  if (section?.error) return 'is-failed'
  return isManualSectionReady(chapter, section) ? 'is-progress' : ''
}

function isBatchTaskReady(task) {
  return Boolean(
    String(task?.slotRelativePath || '').trim() &&
      String(task?.initChapter || '').trim() &&
      String(task?.initSection || '').trim() &&
      Number(task?.slotImageCount || 0) > 0,
  )
}

function batchTaskLabel(task) {
  return (
    String(task?.slotRelativePath || '').trim() ||
    String(task?.slotJsonFileName || '').trim() ||
    [String(task?.initChapter || '').trim(), String(task?.initSection || '').trim()].filter(Boolean).join(' / ') ||
    '请先填写当前章和当前小节'
  )
}

function batchTaskBadgeLabel(task) {
  if (task?.stopped) return '已停止'
  if (task?.running) return '进行中'
  if (task?.completed && task?.error) return '完成（含失败）'
  if (task?.completed) return '已完成'
  if (task?.error) return '失败'
  if (isBatchTaskReady(task)) return '已就绪'
  if (isBatchTaskConfigured(task)) return '待补全'
  return '待配置'
}

function batchTaskBadgeClass(task) {
  if (task?.stopped || task?.running) return 'is-progress'
  if (task?.completed && !task?.error) return 'is-done'
  if (task?.error) return 'is-failed'
  return ''
}

function batchTaskCardClass(task) {
  if (task?.stopped || task?.running) return 'is-progress'
  if (task?.completed && !task?.error) return 'is-done'
  if (task?.error) return 'is-failed'
  if (isBatchTaskReady(task)) return 'is-pending'
  return ''
}

function batchTaskProgress(task) {
  const total = Number(task?.totalCount || task?.slotImageCount || 0)
  const completed = Number(task?.completedCount || 0)
  return total ? `${completed}/${total}` : '0/0'
}

function batchTaskLogTail(task) {
  const lines = String(task?.logs || '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
  return lines.slice(-8).join('\n')
}

function batchTaskLogFull(task) {
  return String(task?.logs || '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .join('\n')
}
</script>

<style scoped>
.chapter-task-log-stack {
  display: grid;
  gap: 10px;
}

.chapter-task-log-details summary {
  cursor: pointer;
  color: #17304f;
  font-weight: 600;
}

.chapter-task-log--full {
  max-height: 480px;
}
</style>
