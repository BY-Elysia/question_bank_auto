<template>
  <GlassPanel
    eyebrow="Images"
    title="图片补充"
    :description="
      state.workingJsonDocumentType === 'exam'
        ? '把漏掉的试卷题目图片补回 JSON。默认按 questionId 直达定位，小题可选填 childQuestionId。'
        : '把漏掉的题目图片补回 JSON。填写章、小节、题号，小题可选；不填小题时默认补到大题题干区域。'
    "
    tone="sun"
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
    </div>

    <div v-if="state.workingJsonDocumentType === 'exam'" class="field-grid compact-grid">
      <label class="field field-span-2">
        <span>questionId</span>
        <input v-model.trim="state.imageAttachForm.questionId" class="glass-input" type="text" placeholder="q_1_0_7" />
      </label>
      <label class="field field-span-2">
        <span>childQuestionId（可选）</span>
        <input
          v-model.trim="state.imageAttachForm.childQuestionId"
          class="glass-input"
          type="text"
          placeholder="留空表示大题"
        />
      </label>
      <label class="file-shell field-span-2">
        <span>上传补充图片</span>
        <input type="file" multiple accept="image/png,image/jpeg,image/webp" @change="actions.onImageAttachFilesChange" />
      </label>
    </div>

    <div v-else class="field-grid compact-grid">
      <label class="field">
        <span>第几章</span>
        <input v-model.trim="state.imageAttachForm.chapterNo" class="glass-input" type="text" placeholder="8" />
      </label>
      <label class="field">
        <span>第几小节</span>
        <input v-model.trim="state.imageAttachForm.sectionNo" class="glass-input" type="text" placeholder="1" />
      </label>
      <label class="field">
        <span>第几题</span>
        <input v-model.trim="state.imageAttachForm.questionNo" class="glass-input" type="text" placeholder="3" />
      </label>
      <label class="field">
        <span>第几小题（可选）</span>
        <input v-model.trim="state.imageAttachForm.childNo" class="glass-input" type="text" placeholder="留空表示大题" />
      </label>
      <label class="file-shell field-span-2">
        <span>上传补充图片</span>
        <input type="file" multiple accept="image/png,image/jpeg,image/webp" @change="actions.onImageAttachFilesChange" />
      </label>
    </div>

    <div
      class="empty-state paste-zone"
      tabindex="0"
      @paste="actions.onImageAttachPaste"
    >
      <strong>支持直接粘贴截图</strong>
      <span>先点击这里，再按 `Ctrl + V`。剪贴板图片会追加到当前列表，不会覆盖已选文件。</span>
    </div>

    <div class="action-row inline-row">
      <span class="glass-pill" :class="{ 'is-active': state.imageAttachFiles.length > 0 }">
        {{ state.imageAttachFiles.length ? `已选择 ${state.imageAttachFiles.length} 张图片` : '可上传一张或多张题目图片' }}
      </span>
      <button
        class="ghost-button"
        :disabled="!state.imageAttachFiles.length || state.imageAttachProcessing"
        @click="actions.clearImageAttachFiles"
      >
        清空图片
      </button>
    </div>

    <div class="action-row">
      <button
        class="primary-button"
        :disabled="state.imageAttachProcessing || !state.imageAttachFiles.length || !state.chapterSessionServerJsonPath"
        @click="actions.attachImagesToQuestionJson"
      >
        {{ state.imageAttachProcessing ? '补充中...' : '执行图片补充' }}
      </button>
    </div>

    <p v-if="state.imageAttachStatus" class="panel-status" :class="{ 'is-error': state.imageAttachError }">
      {{ state.imageAttachStatus }}
    </p>

    <div v-if="state.imageAttachResult" class="process-panel">
      <article class="process-card" :class="{ 'is-success': !state.imageAttachError }">
        <div class="process-card__header">
          <div>
            <strong>图片已补充到题目</strong>
            <p>{{ state.imageAttachResult.chapterTitle }} / {{ state.imageAttachResult.sectionTitle }}</p>
          </div>
          <span class="process-badge is-done">已补充</span>
        </div>

        <div class="process-key-grid">
          <div>
            <span>写入位置</span>
            <strong>{{ state.imageAttachResult.targetLabel }}</strong>
          </div>
          <div>
            <span>题目 ID</span>
            <strong>{{ state.imageAttachResult.childQuestionId || state.imageAttachResult.questionId }}</strong>
          </div>
          <div>
            <span>题目标题</span>
            <strong>{{ state.imageAttachResult.questionTitle }}</strong>
          </div>
          <div>
            <span>补充图片数</span>
            <strong>{{ state.imageAttachResult.mediaCount }}</strong>
          </div>
          <div>
            <span>修复输出文件</span>
            <strong>{{ state.imageAttachResult.repairJsonFileName || '未生成' }}</strong>
          </div>
          <div>
            <span>repair_json 路径</span>
            <strong>{{ state.imageAttachResult.repairJsonPath || '未生成' }}</strong>
          </div>
        </div>

        <div v-if="state.imageAttachResult.mediaItems?.length" class="question-block__media">
          <figure
            v-for="(media, index) in state.imageAttachResult.mediaItems"
            :key="`${media.url || 'media'}-${index}`"
            class="question-block__figure"
          >
            <img :src="media.url" :alt="media.caption || '题目图片'" />
            <figcaption>{{ media.caption || media.url }}</figcaption>
          </figure>
        </div>
      </article>
    </div>
  </GlassPanel>
</template>

<script setup>
import GlassPanel from './GlassPanel.vue'

defineProps({
  state: {
    type: Object,
    required: true,
  },
  actions: {
    type: Object,
    required: true,
  },
})
</script>
