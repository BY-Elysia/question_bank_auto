<template>
  <GlassPanel
    eyebrow="Step 03"
    title="试卷板块组卷"
    description="按板块提取、暂存、调序、改分，最后一次性生成整份试卷 JSON。"
    tone="ice"
    prominent
  >
    <div class="subpanel">
      <div class="subpanel-head">
        <h3>目标文件</h3>
        <p>先绑定试卷 JSON 工作副本，后续所有板块提取和最终生成都会写回这份文件。</p>
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
            placeholder="请输入图片提取所需的 API Key"
          />
        </label>

        <div class="field field-span-2">
          <span>目标试卷 JSON</span>

          <div class="exam-json-layout">
            <article class="info-card exam-json-card">
              <div class="exam-json-card__head">
                <div>
                  <span class="info-label">当前绑定</span>
                  <strong>{{ state.examSessionJsonLabel || '尚未绑定试卷 JSON' }}</strong>
                </div>
                <span class="glass-pill" :class="{ 'is-active': Boolean(state.examSessionServerJsonPath) }">
                  {{ state.examSessionServerJsonPath ? '已绑定工作副本' : '等待绑定' }}
                </span>
              </div>

              <p class="result-meta exam-json-card__hint">
                {{ examJsonBindingHint }}
              </p>

              <div class="exam-json-facts">
                <div class="exam-json-fact">
                  <span>写回位置</span>
                  <strong>{{ boundWorkspaceJsonLabel }}</strong>
                </div>
                <div class="exam-json-fact">
                  <span>当前工作区</span>
                  <strong>{{ currentWorkspaceLabel || '未选择工作区' }}</strong>
                </div>
              </div>

              <div class="action-row exam-json-card__actions">
                <button class="secondary-button" @click="actions.chooseExamJsonSessionFile">选择试卷 JSON</button>
                <button
                  class="ghost-button"
                  :disabled="!state.examSessionServerJsonPath"
                  @click="actions.downloadCurrentExamJson"
                >
                  下载当前 JSON
                </button>
              </div>
            </article>

            <article class="info-card exam-json-card exam-json-browser">
              <div class="exam-json-card__head">
                <div>
                  <span class="info-label">从工作区选择</span>
                  <strong>{{ workspaceCurrentPathLabel }}</strong>
                </div>
                <span class="glass-pill" :class="{ 'is-active': Boolean(state.examSessionWorkspaceJsonPath) }">
                  {{ workspaceJsonSelectionLabel || '未选中文件' }}
                </span>
              </div>

              <p class="result-meta exam-json-card__hint">
                {{ workspaceBrowserHint }}
              </p>

              <div class="action-row exam-json-card__actions">
                <button
                  class="ghost-button"
                  :disabled="!hasWorkspaceSelection || state.workspaceBrowserLoading"
                  @click="actions.browseCurrentWorkspace('')"
                >
                  根目录
                </button>
                <button
                  class="ghost-button"
                  :disabled="!canBrowseWorkspaceParent || state.workspaceBrowserLoading"
                  @click="actions.browseCurrentWorkspace(state.workspaceBrowser?.parentPath || '')"
                >
                  上一级
                </button>
                <button
                  class="ghost-button"
                  :disabled="!hasWorkspaceSelection || state.workspaceBrowserLoading"
                  @click="actions.browseCurrentWorkspace(state.workspaceBrowser?.currentPath || '')"
                >
                  {{ state.workspaceBrowserLoading ? '刷新中...' : '刷新目录' }}
                </button>
              </div>

              <p
                v-if="state.workspaceBrowserStatus"
                class="panel-status"
                :class="{ 'is-error': state.workspaceBrowserError }"
              >
                {{ state.workspaceBrowserStatus }}
              </p>

              <div v-if="workspaceBreadcrumbs.length" class="visualizer-browser-crumbs">
                <button
                  v-for="crumb in workspaceBreadcrumbs"
                  :key="crumb.relativePath || '__root__'"
                  type="button"
                  class="workspace-breadcrumb"
                  @click="actions.browseCurrentWorkspace(crumb.relativePath)"
                >
                  {{ crumb.name || crumb.label }}
                </button>
              </div>

              <div class="exam-json-picker-row">
                <select
                  v-model="state.examSessionWorkspaceJsonPath"
                  class="glass-input workspace-json-select"
                  :disabled="!hasWorkspaceSelection"
                >
                  <option value="">选择当前目录中的 JSON 文件</option>
                  <option v-for="entry in workspaceJsonEntries" :key="entry.relativePath" :value="entry.relativePath">
                    {{ entry.name }}
                  </option>
                </select>
                <button
                  class="secondary-button"
                  :disabled="!state.currentWorkspaceId || !state.examSessionWorkspaceJsonPath"
                  @click="actions.chooseExamJsonSessionFileFromWorkspace(state.examSessionWorkspaceJsonPath)"
                >
                  使用选中文件
                </button>
                <button
                  class="ghost-button"
                  :disabled="!state.examSessionWorkspaceJsonPath"
                  @click="state.examSessionWorkspaceJsonPath = ''"
                >
                  清空
                </button>
              </div>

              <div class="exam-json-browser-meta">
                <span>{{ currentWorkspaceLabel || '未选择工作区' }}</span>
                <span>{{ workspaceBrowserEntrySummary }}</span>
              </div>

              <div v-if="workspaceDirectoryEntries.length" class="visualizer-browser-list exam-json-browser-list">
                <button
                  v-if="canBrowseWorkspaceParent"
                  type="button"
                  class="visualizer-browser-entry"
                  @click="actions.browseCurrentWorkspace(state.workspaceBrowser?.parentPath || '')"
                >
                  <strong>..</strong>
                  <span>返回上一级目录</span>
                </button>
                <button
                  v-for="entry in workspaceDirectoryEntries"
                  :key="entry.relativePath"
                  type="button"
                  class="visualizer-browser-entry is-directory"
                  @click="actions.browseCurrentWorkspace(entry.relativePath)"
                >
                  <strong>{{ entry.name }}</strong>
                  <span>目录</span>
                </button>
              </div>
            </article>
          </div>
        </div>
      </div>

      <p v-if="state.examSessionStatus" class="panel-status" :class="{ 'is-error': state.examSessionError }">
        {{ state.examSessionStatus }}
      </p>
    </div>

    <div v-if="state.examSessionJsonLabel" class="info-grid">
      <div class="info-card">
        <span class="info-label">试卷标题</span>
        <strong>{{ state.examSessionTitle || '未命名试卷' }}</strong>
      </div>
      <div class="info-card">
        <span class="info-label">考试类型</span>
        <strong>{{ examTypeLabel }}</strong>
      </div>
      <div class="info-card">
        <span class="info-label">答案模式</span>
        <strong>{{ state.examSessionHasAnswer === false ? '无答案' : '有答案' }}</strong>
      </div>
      <div class="info-card">
        <span class="info-label">当前结构</span>
        <strong>{{ currentStructureLabel }}</strong>
      </div>
      <div class="info-card">
        <span class="info-label">板块数量</span>
        <strong>{{ examSectionTasks.length }}</strong>
      </div>
      <div class="info-card">
        <span class="info-label">暂存题目</span>
        <strong>{{ totalStagedQuestions }}</strong>
      </div>
    </div>

    <div class="subpanel">
      <div class="subpanel-head">
        <h3>先识别板块</h3>
        <p>先上传整份试卷图片或 PDF，让 AI 识别出“简答题 / 计算题 / 应用题”这类板块，再自动生成对应任务卡。</p>
      </div>

      <div class="action-row wrap-top">
        <label class="file-shell">
          <span>上传整份试卷</span>
          <input
            type="file"
            multiple
            accept="application/pdf,.pdf,image/png,image/jpeg,image/webp"
            @change="actions.onExamAutoFilesChange"
          />
        </label>
        <button class="secondary-button" @click="actions.chooseExamAutoImageFolder">选择图片文件夹</button>
        <button
          class="ghost-button"
          :disabled="!hasSourceFiles || state.examSectionBootstrapProcessing"
          @click="actions.clearExamAutoFiles"
        >
          清空源文件
        </button>
        <span class="glass-pill" :class="{ 'is-active': hasSourceFiles, 'is-error': sourceKind === 'mixed' }">
          {{ sourceSummary }}
        </span>
      </div>

      <div v-if="hasSourceFiles" class="process-panel source-order-panel">
        <article v-for="(entry, index) in state.examAutoFiles" :key="`${entry.name || 'source'}-${index}`" class="process-card source-order-card">
          <div>
            <strong>{{ index + 1 }}. {{ entry.name || entry.file?.name || 'source' }}</strong>
            <p class="result-meta">提取时会按这个顺序写入 output_images，并重命名为连续页图。</p>
          </div>
          <div class="action-row inline-row">
            <button
              class="ghost-button"
              :disabled="index === 0 || state.examSectionBootstrapProcessing"
              @click="actions.moveExamAutoFile(index, 'up')"
            >
              上移
            </button>
            <button
              class="ghost-button"
              :disabled="index === state.examAutoFiles.length - 1 || state.examSectionBootstrapProcessing"
              @click="actions.moveExamAutoFile(index, 'down')"
            >
              下移
            </button>
          </div>
        </article>
      </div>

      <div class="action-row">
        <button
          class="secondary-button"
          :disabled="!state.examSessionJsonLabel || !hasSourceFiles || sourceKind === 'mixed' || state.examSectionBootstrapProcessing"
          @click="actions.bootstrapExamSectionsFromSources"
        >
          {{ state.examSectionBootstrapProcessing ? '识别中...' : 'AI 识别板块并生成任务' }}
        </button>
        <button class="ghost-button" :disabled="state.examSectionBootstrapProcessing" @click="actions.addExamSectionTask">
          手动补一个板块
        </button>
        <button
          class="primary-button"
          :disabled="!state.examSessionJsonLabel || !examSectionTasks.length || state.examFinalizeProcessing"
          @click="actions.finalizeExamSections"
        >
          {{ state.examFinalizeProcessing ? '生成中...' : '生成整份试卷 JSON' }}
        </button>
      </div>

      <p v-if="state.examSectionStatus" class="panel-status" :class="{ 'is-error': state.examSectionError }">
        {{ state.examSectionStatus }}
      </p>
      <p v-if="state.examFinalizeStatus" class="panel-status" :class="{ 'is-error': state.examFinalizeError }">
        {{ state.examFinalizeStatus }}
      </p>

      <div v-if="state.examSectionBootstrapLogs" class="subpanel subpanel--inner">
        <div class="subpanel-head">
          <h3>过程日志</h3>
          <p>这里会展示整份试卷板块识别和各板块暂存提取的过程信息。</p>
        </div>
        <pre class="code-surface chapter-task-log">{{ state.examSectionBootstrapLogs }}</pre>
      </div>

      <div class="info-grid compact-summary">
        <div class="info-card">
          <span class="info-label">已确认板块</span>
          <strong>{{ confirmedSectionCount }}/{{ examSectionTasks.length }}</strong>
        </div>
        <div class="info-card">
          <span class="info-label">可生成状态</span>
          <strong>{{ canFinalizeExam ? '可以生成' : '仍需确认' }}</strong>
        </div>
      </div>

      <div v-if="examSectionTasks.length" class="chapter-task-list">
        <article v-for="(task, index) in examSectionTasks" :key="task.id" class="process-card chapter-task-card">
          <div class="process-card__header">
            <div>
              <strong>{{ sectionTitle(task, index) }}</strong>
              <p>{{ sectionSubtitle(task, index) }}</p>
            </div>
            <div class="action-row inline-row">
              <span class="glass-pill" :class="{ 'is-active': task.confirmed, 'is-error': task.error }">
                {{ task.confirmed ? '已确认' : '编辑中' }}
              </span>
              <button class="ghost-button" :disabled="task.running" @click="actions.removeExamSectionTask(task.id)">
                删除板块
              </button>
            </div>
          </div>

          <div class="field-grid compact-grid">
            <label class="field">
              <span>板块标题</span>
              <input
                :value="task.majorTitle"
                class="glass-input"
                type="text"
                placeholder="例如：一、简答题"
                @input="updateTaskField(task, 'majorTitle', $event.target.value)"
              />
            </label>

            <label class="field">
              <span>子标题</span>
              <input
                :value="task.minorTitle"
                class="glass-input"
                type="text"
                placeholder="可选，例如：基础题"
                @input="updateTaskField(task, 'minorTitle', $event.target.value)"
              />
            </label>

            <label class="field">
              <span>题型</span>
              <select
                :value="task.questionType"
                class="glass-input"
                @change="updateTaskField(task, 'questionType', $event.target.value)"
              >
                <option v-for="option in questionTypeOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </label>

            <label class="field">
              <span>预计结构</span>
              <input :value="`ch_${index + 1}`" class="glass-input" type="text" readonly />
            </label>
          </div>

          <div class="subpanel subpanel--inner">
            <div class="subpanel-head">
              <h3>从图片加题</h3>
              <p>这里只处理当前板块的图片，不再走整卷续页识别。</p>
            </div>

            <div class="action-row wrap-top">
              <label class="file-shell">
                <span>上传当前板块图片</span>
                <input type="file" multiple accept="image/png,image/jpeg,image/webp" @change="actions.onExamSectionImagesChange(task.id, $event)" />
              </label>
              <button class="secondary-button" :disabled="task.running" @click="actions.appendExamSectionFromImages(task.id)">
                {{ task.running ? '提取中...' : '按当前板块提取' }}
              </button>
              <button class="ghost-button" :disabled="task.running || !task.imageFiles?.length" @click="actions.clearExamSectionImages(task.id)">
                清空图片
              </button>
              <span class="glass-pill" :class="{ 'is-active': Boolean(task.imageFiles?.length) }">
                {{ task.imageFiles?.length ? `已选 ${task.imageFiles.length} 张图片` : '尚未选择图片' }}
              </span>
            </div>
          </div>

          <div class="subpanel subpanel--inner">
            <div class="subpanel-head">
              <h3>从题库加题</h3>
              <p>可以为当前板块补题或替换题，加入后仍可继续调序、改分和删除。</p>
            </div>

            <div class="field-grid compact-grid">
              <label class="field">
                <span>题库类型</span>
                <select
                  :value="task.libraryDocumentType || 'textbook'"
                  class="glass-input"
                  :disabled="task.running || task.librarySourcesLoading"
                  @change="onLibraryDocumentTypeChange(task, $event)"
                >
                  <option v-for="item in libraryDocumentTypeOptions" :key="item.value" :value="item.value">
                    {{ item.label }}
                  </option>
                </select>
              </label>
              <label class="field">
                <span>题库来源</span>
                <select
                  :value="task.libraryTextbookId || ''"
                  class="glass-input"
                  :disabled="task.running || task.librarySourcesLoading"
                  @change="onLibrarySourceChange(task, $event)"
                >
                  <option value="">{{ task.librarySourcesLoading ? '加载来源中...' : '请选择题库来源' }}</option>
                  <option v-for="item in librarySourceOptions(task)" :key="item.textbookId" :value="item.textbookId">
                    {{ librarySourceLabel(item) }}
                  </option>
                </select>
              </label>
              <label class="field">
                <span>{{ task.libraryDocumentType === 'exam' ? '大结构' : '章节' }}</span>
                <select
                  :value="task.libraryChapterId || ''"
                  class="glass-input"
                  :disabled="task.running || task.libraryChaptersLoading || !task.libraryTextbookId"
                  @change="onLibraryChapterChange(task, $event)"
                >
                  <option value="">全部{{ task.libraryDocumentType === 'exam' ? '结构' : '章节' }}</option>
                  <option v-for="item in libraryChapterOptions(task)" :key="item.chapterId" :value="item.chapterId">
                    {{ item.title }}
                  </option>
                </select>
              </label>
              <label class="field">
                <span>{{ task.libraryDocumentType === 'exam' ? '子结构' : '小节' }}</span>
                <select
                  :value="task.librarySectionChapterId || ''"
                  class="glass-input"
                  :disabled="task.running || task.libraryChaptersLoading || !librarySectionOptions(task).length"
                  @change="onLibrarySectionChange(task, $event)"
                >
                  <option value="">全部{{ task.libraryDocumentType === 'exam' ? '子结构' : '小节' }}</option>
                  <option v-for="item in librarySectionOptions(task)" :key="item.chapterId" :value="item.chapterId">
                    {{ item.label }}
                  </option>
                </select>
              </label>
              <label class="field field-span-2">
                <span>检索关键词</span>
                <input
                  :value="task.searchQuery"
                  class="glass-input"
                  type="text"
                  placeholder="输入题号、标题或关键词"
                  @input="updateTaskField(task, 'searchQuery', $event.target.value, false)"
                />
              </label>
            </div>

            <p v-if="task.librarySourceStatus" class="panel-status" :class="{ 'is-error': task.librarySourceError }">
              {{ task.librarySourceStatus }}
            </p>
            <p v-if="task.libraryChapterStatus" class="panel-status" :class="{ 'is-error': task.libraryChapterError }">
              {{ task.libraryChapterStatus }}
            </p>

            <div class="action-row">
              <button class="secondary-button" :disabled="task.running" @click="searchExamSectionLibrary(task)">
                检索题库
              </button>
              <button
                class="ghost-button"
                :disabled="task.running || !task.selectedRecordIds?.length"
                @click="actions.appendExamSectionFromLibrary(task.id)"
              >
                加入所选题目
              </button>
            </div>

            <p v-if="task.searchStatus" class="panel-status" :class="{ 'is-error': task.searchError }">
              {{ task.searchStatus }}
            </p>

            <div v-if="task.searchResults?.length" class="process-panel">
              <article v-for="record in task.searchResults" :key="record.recordId" class="process-card">
                <div class="process-card__header">
                  <label class="check-line">
                    <input
                      type="checkbox"
                      :checked="task.selectedRecordIds?.includes(record.recordId)"
                      @change="actions.toggleExamSectionRecord(task.id, record.recordId)"
                    />
                    <strong>{{ record.questionCode || record.title || record.recordId }}</strong>
                  </label>
                  <span class="glass-pill">{{ formatSearchScore(record.defaultScore) }} 分</span>
                </div>
                <p class="result-meta">
                  {{ searchResultMeta(record) }}
                </p>
                <p class="question-preview">{{ record.contentPreview || record.description || '暂无预览' }}</p>
              </article>
            </div>
          </div>

          <div class="subpanel subpanel--inner">
            <div class="subpanel-head">
              <h3>暂存题目</h3>
              <p>可以调序、删题、改分。改动后需要重新确认当前板块。</p>
            </div>

            <p v-if="task.status" class="panel-status" :class="{ 'is-error': task.error }">
              {{ task.status }}
            </p>

            <div v-if="task.stagedQuestions?.length" class="process-panel">
              <article v-for="(question, questionIndex) in task.stagedQuestions" :key="question.localId" class="process-card">
                <div class="process-card__header">
                  <div>
                    <strong>{{ stagedQuestionTitle(question, questionIndex) }}</strong>
                    <p>{{ question.questionId || '待重排题号' }} / {{ questionTypeLabel(question.questionType) }}</p>
                  </div>
                  <div class="action-row inline-row">
                    <span class="glass-pill">{{ questionScore(question) }} 分</span>
                    <button
                      class="ghost-button"
                      :disabled="questionIndex === 0"
                      @click="actions.moveExamSectionQuestion(task.id, question.localId, 'up')"
                    >
                      上移
                    </button>
                    <button
                      class="ghost-button"
                      :disabled="questionIndex === task.stagedQuestions.length - 1"
                      @click="actions.moveExamSectionQuestion(task.id, question.localId, 'down')"
                    >
                      下移
                    </button>
                    <button class="ghost-button" @click="actions.removeExamSectionQuestion(task.id, question.localId)">
                      删除
                    </button>
                  </div>
                </div>

                <p class="result-meta">来源：{{ question.source === 'library' ? '题库' : '图片提取' }}</p>

                <template v-if="question.nodeType === 'GROUP'">
                  <QuestionTextBlock label="母题题干" :value="question.stem" />

                  <div class="process-panel">
                    <article v-for="child in question.children || []" :key="child.questionId" class="process-card">
                      <div class="process-card__header">
                        <div>
                          <strong>{{ child.title || child.questionId }}</strong>
                          <p>{{ child.questionId }} / {{ questionTypeLabel(child.questionType) }}</p>
                        </div>
                        <label class="score-editor">
                          <span>分值</span>
                          <input
                            class="glass-input score-input"
                            type="number"
                            min="0"
                            step="1"
                            :value="child.defaultScore"
                            @input="updateChildScore(task, child, $event.target.value)"
                          />
                        </label>
                      </div>
                      <QuestionTextBlock label="题目" :value="child.prompt" />
                      <QuestionTextBlock label="答案" :value="child.standardAnswer" />
                    </article>
                  </div>
                </template>

                <template v-else>
                  <div class="score-row">
                    <label class="score-editor">
                      <span>分值</span>
                      <input
                        class="glass-input score-input"
                        type="number"
                        min="0"
                        step="1"
                        :value="question.defaultScore"
                        @input="updateLeafScore(task, question, $event.target.value)"
                      />
                    </label>
                  </div>
                  <QuestionTextBlock label="题目" :value="question.prompt" />
                  <QuestionTextBlock label="答案" :value="question.standardAnswer" />
                </template>
              </article>
            </div>

            <div v-else class="empty-state empty-state--inner">
              <strong>当前板块还没有暂存题目</strong>
              <span>上传图片提取，或者从题库补题后，这里会出现可编辑的题目列表。</span>
            </div>

            <div class="action-row">
              <button
                class="secondary-button"
                :disabled="!task.stagedQuestions?.length || task.confirmed"
                @click="actions.confirmExamSection(task.id)"
              >
                确认当前板块
              </button>
              <button class="ghost-button" :disabled="!task.confirmed" @click="actions.reopenExamSection(task.id)">
                重新编辑
              </button>
            </div>
          </div>
        </article>
      </div>

      <div v-else class="empty-state empty-state--inner">
        <strong>还没有生成板块任务</strong>
        <span>先上传整份试卷并点击“AI 识别板块并生成任务”，再进入每个板块继续改题和赋分。</span>
      </div>
    </div>

    <div v-if="examParts.length" class="subpanel">
      <div class="subpanel-head">
        <h3>当前试卷结果</h3>
        <p>以下内容直接来自当前工作区里的试卷 JSON，按最终章节结构展示。</p>
      </div>

      <div class="chapter-task-list">
        <article v-for="part in examParts" :key="part.chapterId" class="process-card chapter-task-card">
          <div class="process-card__header">
            <div>
              <strong>{{ part.title }}</strong>
              <p>{{ part.chapterId }} / 共 {{ part.totalQuestions }} 题</p>
            </div>
            <span class="process-badge is-done">{{ part.groups.length }} 个分组</span>
          </div>

          <div class="process-panel">
            <article v-for="group in part.groups" :key="group.chapterId" class="process-card">
              <div class="process-card__header">
                <div>
                  <strong>{{ group.title }}</strong>
                  <p>{{ group.chapterId }} / {{ group.questions.length }} 题</p>
                </div>
              </div>

              <div class="process-panel">
                <article v-for="question in group.questions" :key="question.questionId" class="process-card">
                  <div class="process-card__header">
                    <div>
                      <strong>{{ question.title || question.questionId }}</strong>
                      <p>{{ question.questionId }} / {{ questionTypeLabel(question.questionType) }}</p>
                    </div>
                    <span class="glass-pill is-active">{{ questionScore(question) }} 分</span>
                  </div>

                  <template v-if="question.nodeType === 'GROUP'">
                    <QuestionTextBlock label="母题题干" :value="question.stem" />

                    <div class="process-panel">
                      <article v-for="child in question.children || []" :key="child.questionId" class="process-card">
                        <div class="process-card__header">
                          <div>
                            <strong>{{ child.title || child.questionId }}</strong>
                            <p>{{ child.questionId }} / {{ questionTypeLabel(child.questionType) }}</p>
                          </div>
                          <span class="glass-pill">{{ Number(child.defaultScore || 0) }} 分</span>
                        </div>
                        <QuestionTextBlock label="题目" :value="child.prompt" />
                        <QuestionTextBlock label="答案" :value="child.standardAnswer" />
                      </article>
                    </div>
                  </template>

                  <template v-else>
                    <QuestionTextBlock label="题目" :value="question.prompt" />
                    <QuestionTextBlock label="答案" :value="question.standardAnswer" />
                  </template>
                </article>
              </div>
            </article>
          </div>
        </article>
      </div>
    </div>

    <div v-else-if="state.examSessionPayload" class="empty-state">
      <strong>当前试卷 JSON 里还没有可展示的结构</strong>
      <span>先按板块提取并确认，再生成整份试卷 JSON。</span>
    </div>
  </GlassPanel>
</template>

<script setup>
import { computed } from 'vue'
import GlassPanel from './GlassPanel.vue'
import QuestionTextBlock from './QuestionTextBlock.vue'
import { buildTextbookVisualizerModel, collectQuestionGroups } from '../utils/textbookVisualizer'

const FALLBACK_QUESTION_TYPE_OPTIONS = [{ value: 'SHORT_ANSWER', label: '简答题' }]
const LIBRARY_DOCUMENT_TYPE_OPTIONS = [
  { value: 'textbook', label: '教材' },
  { value: 'exam', label: '试卷' },
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

const examSectionTasks = computed(() =>
  Array.isArray(props.state.examSectionTasks) && props.state.examSectionTasks.length
    ? props.state.examSectionTasks
    : [],
)

const questionTypeOptions = computed(() =>
  Array.isArray(props.state.examQuestionTypeOptions) && props.state.examQuestionTypeOptions.length
    ? props.state.examQuestionTypeOptions
    : FALLBACK_QUESTION_TYPE_OPTIONS,
)

const libraryDocumentTypeOptions = computed(() => LIBRARY_DOCUMENT_TYPE_OPTIONS)

const hasSourceFiles = computed(() => Array.isArray(props.state.examAutoFiles) && props.state.examAutoFiles.length > 0)

const sourceKind = computed(() => {
  const files = Array.isArray(props.state.examAutoFiles) ? props.state.examAutoFiles : []
  if (!files.length) {
    return ''
  }
  const hasPdf = files.some((item) => /\.pdf$/i.test(String(item?.name || item?.file?.name || '').trim()))
  const hasImage = files.some((item) => /\.(png|jpe?g|webp)$/i.test(String(item?.name || item?.file?.name || '').trim()))
  if (hasPdf && hasImage) return 'mixed'
  if (hasPdf) return 'pdf'
  if (hasImage) return 'image'
  return ''
})

const sourceSummary = computed(() => {
  const files = Array.isArray(props.state.examAutoFiles) ? props.state.examAutoFiles : []
  if (!files.length) {
    return '尚未选择源文件'
  }
  if (sourceKind.value === 'pdf') {
    return `已选 ${files.length} 个 PDF`
  }
  if (sourceKind.value === 'mixed') {
    return `已选 ${files.length} 个文件，当前不支持图片与 PDF 混传`
  }
  return `已选 ${files.length} 张图片`
})

const workspaceJsonEntries = computed(() =>
  (Array.isArray(props.state.workspaceBrowser?.entries) ? props.state.workspaceBrowser.entries : []).filter(
    (entry) => entry?.type === 'file' && String(entry?.extension || '').toLowerCase() === '.json',
  ),
)

const workspaceDirectoryEntries = computed(() =>
  (Array.isArray(props.state.workspaceBrowser?.entries) ? props.state.workspaceBrowser.entries : []).filter(
    (entry) => entry?.type === 'directory',
  ),
)

const workspaceBreadcrumbs = computed(() =>
  Array.isArray(props.state.workspaceBrowser?.breadcrumbs) ? props.state.workspaceBrowser.breadcrumbs : [],
)

const hasWorkspaceSelection = computed(() => Boolean(String(props.state.currentWorkspaceId || '').trim()))

const canBrowseWorkspaceParent = computed(() =>
  Boolean(props.state.workspaceBrowser && !props.state.workspaceBrowser.isRoot),
)

const currentWorkspaceLabel = computed(() => {
  const workspaceId = String(props.state.currentWorkspaceId || '').trim()
  if (!workspaceId) {
    return ''
  }
  const items = Array.isArray(props.state.workspaceList) ? props.state.workspaceList : []
  const matched = items.find((item) => String(item?.workspaceId || '').trim() === workspaceId)
  return matched?.name || workspaceId
})

const workspaceCurrentPathLabel = computed(() => {
  if (!hasWorkspaceSelection.value) {
    return '未选择工作区'
  }
  return String(props.state.workspaceBrowser?.currentPath || '').trim() || '工作区根目录'
})

const workspaceJsonSelectionLabel = computed(() => {
  const selectedPath = String(props.state.examSessionWorkspaceJsonPath || '').trim()
  if (!selectedPath) {
    return ''
  }
  const matched = workspaceJsonEntries.value.find((entry) => String(entry?.relativePath || '').trim() === selectedPath)
  return matched?.name ? `已选 ${matched.name}` : `已选 ${selectedPath}`
})

const boundWorkspaceJsonLabel = computed(() => {
  if (!String(props.state.examSessionServerJsonPath || '').trim()) {
    return '尚未写入工作区'
  }
  return String(props.state.examSessionWorkspaceJsonPath || '').trim() || 'output_json/main.json'
})

const examJsonBindingHint = computed(() => {
  if (String(props.state.examSessionServerJsonPath || '').trim()) {
    return '后续板块提取、调序和最终生成都会写回这份工作区 JSON。'
  }
  return '可以选择本地试卷 JSON，或者直接绑定当前工作区里的试卷 JSON。'
})

const workspaceBrowserEntrySummary = computed(() => (
  `当前目录 ${workspaceJsonEntries.value.length} 个 JSON，${workspaceDirectoryEntries.value.length} 个子目录`
))

const workspaceBrowserHint = computed(() => {
  if (!hasWorkspaceSelection.value) {
    return '先在工作区面板里选中一个工作区，这里才会显示目录和 JSON 文件。'
  }
  if (workspaceJsonSelectionLabel.value) {
    return '已选中目标文件，点击“使用选中文件”后，这个试卷流程就会绑定到它。'
  }
  if (workspaceJsonEntries.value.length) {
    return '当前目录已经找到可用的 JSON 文件，直接选择并绑定即可。'
  }
  return '先切换目录，再从包含试卷 JSON 的文件夹里选择目标文件。'
})

const questionTypeLabelMap = computed(() => {
  const map = new Map()
  questionTypeOptions.value.forEach((item) => {
    map.set(item.value, item.label)
  })
  return map
})

const currentStructureLabel = computed(() => {
  return [String(props.state.examSessionCurrentMajor || '').trim(), String(props.state.examSessionCurrentMinor || '').trim()]
    .filter(Boolean)
    .join(' / ') || '尚未开始'
})

const examTypeLabel = computed(() => {
  if (props.state.examSessionExamType === 'quiz') return '小测'
  if (props.state.examSessionExamType === 'final') return '期末'
  return '期中'
})

const totalStagedQuestions = computed(() =>
  examSectionTasks.value.reduce(
    (sum, task) => sum + (Array.isArray(task?.stagedQuestions) ? task.stagedQuestions.length : 0),
    0,
  ),
)

const confirmedSectionCount = computed(() => examSectionTasks.value.filter((task) => task?.confirmed).length)

const canFinalizeExam = computed(() =>
  examSectionTasks.value.length > 0 &&
  examSectionTasks.value.every((task) => {
    const questions = Array.isArray(task?.stagedQuestions) ? task.stagedQuestions : []
    return task?.confirmed === true && String(task?.majorTitle || '').trim() && String(task?.questionType || '').trim() && questions.length
  }),
)

const model = computed(() => {
  if (!props.state.examSessionPayload) {
    return null
  }
  return buildTextbookVisualizerModel(props.state.examSessionPayload)
})

const examParts = computed(() => {
  const roots = Array.isArray(model.value?.roots) ? model.value.roots : []
  return roots
    .map((root) => ({
      chapterId: root.chapterId,
      title: root.title,
      totalQuestions: root.totalQuestions,
      groups: collectQuestionGroups(root),
    }))
    .filter((item) => item.groups.length > 0)
})

function questionTypeLabel(value) {
  return questionTypeLabelMap.value.get(String(value || '').trim()) || String(value || '未分类')
}

function questionScore(question) {
  if (question?.nodeType === 'GROUP') {
    return (Array.isArray(question.children) ? question.children : []).reduce(
      (sum, child) => sum + Number(child?.defaultScore || 0),
      0,
    )
  }
  return Number(question?.defaultScore || 0)
}

function sectionTitle(task, index) {
  return String(task?.majorTitle || '').trim() || `板块 ${index + 1}`
}

function sectionSubtitle(task, index) {
  const minorTitle = String(task?.minorTitle || '').trim()
  const questionCount = Array.isArray(task?.stagedQuestions) ? task.stagedQuestions.length : 0
  if (minorTitle) {
    return `ch_${index + 1} / ${minorTitle} / ${questionCount} 题`
  }
  return `ch_${index + 1} / ${questionCount} 题`
}

function stagedQuestionTitle(question, index) {
  return question?.title || `第 ${index + 1} 题`
}

function normalizeScoreValue(value, fallback = 10) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0) {
    return fallback
  }
  return Math.round(numeric * 100) / 100
}

function markTaskDirty(task, message = '已修改当前板块，请重新确认') {
  if (!task || typeof task !== 'object') {
    return
  }
  task.confirmed = false
  task.error = false
  task.status = message
}

function updateTaskField(task, field, value, dirty = true) {
  if (!task || typeof task !== 'object') {
    return
  }
  task[field] = typeof value === 'string' ? value : value ?? ''
  if (dirty) {
    markTaskDirty(task)
  }
}

function updateLeafScore(task, question, value) {
  if (!question || question.nodeType === 'GROUP') {
    return
  }
  question.defaultScore = normalizeScoreValue(value, Number(question.defaultScore || 10))
  markTaskDirty(task, '已更新题目分值，请重新确认当前板块')
}

function updateChildScore(task, child, value) {
  if (!child || typeof child !== 'object') {
    return
  }
  child.defaultScore = normalizeScoreValue(value, Number(child.defaultScore || 10))
  markTaskDirty(task, '已更新小题分值，请重新确认当前板块')
}

function librarySourceOptions(task) {
  return Array.isArray(task?.librarySources) ? task.librarySources : []
}

function chapterMapById(task) {
  const chapters = Array.isArray(task?.libraryChapters) ? task.libraryChapters : []
  return new Map(
    chapters
      .map((item) => [String(item?.chapterId || '').trim(), item])
      .filter(([chapterId]) => Boolean(chapterId)),
  )
}

function isDescendantChapter(chapterId, ancestorId, byId) {
  let currentId = String(chapterId || '').trim()
  const normalizedAncestorId = String(ancestorId || '').trim()
  if (!currentId || !normalizedAncestorId || currentId === normalizedAncestorId) {
    return false
  }
  const visited = new Set()
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId)
    const current = byId.get(currentId)
    const parentId = String(current?.parentChapterId || '').trim()
    if (!parentId) {
      return false
    }
    if (parentId === normalizedAncestorId) {
      return true
    }
    currentId = parentId
  }
  return false
}

function buildChapterPathLabel(chapter, byId, stopParentId = '') {
  const parts = []
  const normalizedStopParentId = String(stopParentId || '').trim()
  let current = chapter
  const visited = new Set()
  while (current && !visited.has(String(current.chapterId || '').trim())) {
    const currentId = String(current.chapterId || '').trim()
    visited.add(currentId)
    parts.unshift(String(current.title || current.chapterId || '').trim() || currentId)
    const parentId = String(current.parentChapterId || '').trim()
    if (!parentId || parentId === normalizedStopParentId) {
      break
    }
    current = byId.get(parentId)
  }
  return parts.join(' / ')
}

function libraryChapterOptions(task) {
  const chapters = Array.isArray(task?.libraryChapters) ? task.libraryChapters : []
  return chapters.filter((item) => !String(item?.parentChapterId || '').trim())
}

function librarySectionOptions(task) {
  const chapters = Array.isArray(task?.libraryChapters) ? task.libraryChapters : []
  const chapterId = String(task?.libraryChapterId || '').trim()
  if (!chapterId) {
    return []
  }
  const byId = chapterMapById(task)
  return chapters
    .filter((item) => isDescendantChapter(item?.chapterId, chapterId, byId))
    .map((item) => ({
      ...item,
      label: buildChapterPathLabel(item, byId, chapterId),
    }))
}

function librarySourceLabel(item) {
  const title = String(item?.title || item?.textbookId || '未命名来源').trim()
  const subject = String(item?.subject || '').trim()
  const meta = [subject, item?.documentType === 'exam' ? '试卷' : '教材'].filter(Boolean).join(' / ')
  return meta ? `${title} (${meta})` : title
}

function onLibraryDocumentTypeChange(task, event) {
  props.actions.updateExamSectionLibraryDocumentType(task?.id, event?.target?.value)
}

function onLibrarySourceChange(task, event) {
  props.actions.updateExamSectionLibrarySource(task?.id, event?.target?.value)
}

function onLibraryChapterChange(task, event) {
  props.actions.updateExamSectionLibraryChapter(task?.id, event?.target?.value)
}

function onLibrarySectionChange(task, event) {
  props.actions.updateExamSectionLibrarySection(task?.id, event?.target?.value)
}

function searchExamSectionLibrary(task) {
  if (!task) {
    return
  }
  props.actions.searchExamSectionLibrary(task.id)
}

function searchResultMeta(record) {
  return [
    String(record?.textbookTitle || '').trim(),
    String(record?.chapterTitle || '').trim(),
    questionTypeLabel(record?.questionType),
  ].filter(Boolean).join(' / ') || '题库记录'
}

function formatSearchScore(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}
</script>

<style scoped>
.compact-summary {
  margin-bottom: 1rem;
}

.subpanel--inner {
  margin-top: 1rem;
}

.check-line {
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
}

.result-meta {
  margin: 0.35rem 0 0;
  font-size: 0.9rem;
  color: rgba(17, 41, 77, 0.72);
}

.exam-json-layout {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 12px;
  margin-top: 0.75rem;
}

.exam-json-card {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  border-color: rgba(126, 161, 214, 0.46);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.86), rgba(225, 238, 255, 0.76));
  box-shadow:
    0 18px 36px rgba(70, 111, 176, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.98);
}

.exam-json-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.exam-json-card__head .info-label {
  display: block;
}

.exam-json-card__head strong {
  display: block;
  margin-top: 0.4rem;
  line-height: 1.35;
}

.exam-json-card__head .glass-pill {
  max-width: min(100%, 220px);
  white-space: normal;
  text-align: center;
  color: rgba(17, 41, 77, 0.9);
  background: rgba(244, 248, 255, 0.92);
  border-color: rgba(123, 156, 207, 0.34);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.98);
}

.exam-json-card__hint {
  margin-top: 0;
}

.exam-json-card__actions {
  margin-top: auto;
}

.exam-json-facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 0.75rem;
}

.exam-json-fact {
  padding: 0.85rem 1rem;
  border-radius: 18px;
  border: 1px solid rgba(130, 163, 210, 0.34);
  background: rgba(245, 249, 255, 0.88);
  box-shadow:
    0 10px 22px rgba(84, 120, 177, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.98);
}

.exam-json-fact span {
  display: block;
  color: rgba(17, 41, 77, 0.62);
  font-size: 0.78rem;
  letter-spacing: 0.04em;
}

.exam-json-fact strong {
  display: block;
  margin-top: 0.4rem;
  color: rgba(17, 41, 77, 0.94);
  font-size: 0.96rem;
  line-height: 1.4;
  word-break: break-word;
}

.exam-json-browser-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.exam-json-browser-meta span {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid rgba(129, 162, 209, 0.28);
  background: rgba(241, 247, 255, 0.82);
  color: rgba(17, 41, 77, 0.78);
  font-size: 0.84rem;
}

.exam-json-picker-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 0.75rem;
  align-items: center;
}

.exam-json-browser .workspace-breadcrumb {
  color: rgba(17, 41, 77, 0.88);
  background: rgba(241, 247, 255, 0.84);
  border-color: rgba(129, 162, 209, 0.28);
}

.exam-json-browser-list {
  margin-top: 0;
}

.exam-json-browser .workspace-json-select {
  background: rgba(248, 251, 255, 0.94);
  border-color: rgba(129, 162, 209, 0.38);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.98);
}

.workspace-json-select {
  min-width: 18rem;
  color: rgba(17, 41, 77, 0.92);
}

.workspace-json-select option {
  color: rgba(17, 41, 77, 0.92);
}

.visualizer-browser-crumbs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.visualizer-browser-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.75rem;
  margin-top: 0.75rem;
}

.visualizer-browser-entry {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.25rem;
  padding: 0.9rem 1rem;
  border-radius: 18px;
  border: 1px solid rgba(127, 160, 209, 0.32);
  background: rgba(241, 247, 255, 0.84);
  box-shadow:
    0 10px 22px rgba(81, 117, 174, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.98);
  color: rgba(17, 41, 77, 0.92);
  text-align: left;
  transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
}

.visualizer-browser-entry:hover {
  transform: translateY(-1px);
  border-color: rgba(92, 137, 203, 0.46);
  background: rgba(247, 251, 255, 0.96);
  box-shadow:
    0 14px 28px rgba(73, 111, 171, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.99);
}

.visualizer-browser-entry strong {
  color: rgba(17, 41, 77, 0.94);
}

.visualizer-browser-entry span {
  color: rgba(17, 41, 77, 0.64);
  font-size: 0.88rem;
}

.question-preview {
  margin: 0.75rem 0 0;
  white-space: pre-wrap;
  color: rgba(255, 255, 255, 0.88);
}

.score-row {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 0.75rem;
}

.source-order-panel {
  margin-top: 0.75rem;
}

.source-order-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.score-editor {
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
}

.score-input {
  width: 7rem;
}

.empty-state--inner {
  margin-top: 0.75rem;
}

@media (max-width: 900px) {
  .exam-json-card__head {
    flex-direction: column;
  }

  .exam-json-card__head .glass-pill {
    max-width: 100%;
  }

  .exam-json-picker-row {
    grid-template-columns: 1fr;
  }
}
</style>
