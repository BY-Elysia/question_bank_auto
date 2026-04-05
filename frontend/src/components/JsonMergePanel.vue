<template>
  <GlassPanel
    eyebrow="Merge"
    title="多章节 JSON 合并"
    description="支持本地上传合并，也支持直接勾选当前工作区 multi_chapter 里的章节槽位合并。工作区合并会写回当前工作区主 JSON，方便直接下载完整文件包。"
    tone="clear"
    prominent
  >
    <div class="field-grid compact-grid">
      <label class="field">
        <span>合并来源</span>
        <select v-model="mergeSourceMode" class="glass-input">
          <option value="upload">本地上传 JSON</option>
          <option value="workspace">当前工作区 multi_chapter</option>
        </select>
      </label>
      <label class="field">
        <span>输出文件名</span>
        <input
          v-model.trim="state.mergeOutputFileName"
          class="glass-input"
          type="text"
          placeholder="merged_textbook.json"
        />
      </label>
      <label v-if="isUploadMode" class="file-shell field-span-2">
        <span>添加 JSON 文件</span>
        <input type="file" multiple accept="application/json,.json" @change="actions.onMergeJsonFilesChange" />
      </label>
    </div>

    <section v-if="isWorkspaceMode" class="subpanel merge-slot-panel">
      <div class="process-card__header">
        <div>
          <strong>当前工作区章节槽位</strong>
          <p>{{ state.currentWorkspaceId || '尚未选择工作区' }}</p>
        </div>
        <div class="action-row inline-row">
          <button class="ghost-button" :disabled="state.multiChapterSlotsLoading" @click="actions.loadMultiChapterSlots()">
            {{ state.multiChapterSlotsLoading ? '刷新中...' : '刷新槽位' }}
          </button>
          <button
            class="ghost-button"
            :disabled="!selectedWorkspaceSlotCount"
            @click="actions.clearMergeWorkspaceSlotSelections"
          >
            清空勾选
          </button>
        </div>
      </div>

      <p v-if="state.multiChapterSlotsStatus" class="panel-status" :class="{ 'is-error': state.multiChapterSlotsError }">
        {{ state.multiChapterSlotsStatus }}
      </p>

      <div v-if="workspaceSlots.length" class="merge-slot-list">
        <label
          v-for="slot in workspaceSlots"
          :key="slot.slotRelativePath"
          class="merge-slot-item"
          :class="{ 'is-active': selectedWorkspaceSlotSet.has(slot.slotRelativePath) }"
        >
          <input
            type="checkbox"
            :checked="selectedWorkspaceSlotSet.has(slot.slotRelativePath)"
            @change="actions.toggleMergeWorkspaceSlot(slot.slotRelativePath)"
          />
          <div>
            <strong>{{ slot.slotRelativePath }}</strong>
            <p>{{ slot.jsonFileName }} · 原图 {{ slot.imageCount || 0 }} 张</p>
          </div>
        </label>
      </div>

      <div v-else class="empty-state">
        <strong>{{ state.currentWorkspaceId ? '当前工作区还没有章节槽位' : '请先选择工作区' }}</strong>
        <span>
          {{ state.currentWorkspaceId ? '先去“基础教材 JSON”里批量创建 multi_chapter 槽位，再回来勾选要合并的章节。' : '工作区模式下会直接读取当前工作区的 multi_chapter 目录。' }}
        </span>
      </div>
    </section>

    <div class="action-row inline-row">
      <span class="glass-pill" :class="{ 'is-active': selectedCount > 0 }">
        {{
          isWorkspaceMode
            ? (selectedWorkspaceSlotCount ? `已勾选 ${selectedWorkspaceSlotCount} 个章节槽位` : '至少勾选 2 个章节槽位')
            : (state.mergeJsonFiles.length ? `当前已加入 ${state.mergeJsonFiles.length} 个 JSON 文件` : '至少选择 2 个 JSON 文件，可分多次添加')
        }}
      </span>
      <button
        v-if="isUploadMode"
        class="ghost-button"
        :disabled="!state.mergeJsonFiles.length"
        @click="actions.clearMergeJsonFiles"
      >
        清空列表
      </button>
      <span v-if="isWorkspaceMode" class="glass-pill" :class="{ 'is-active': Boolean(state.currentWorkspaceId) }">
        {{ state.currentWorkspaceId ? '会写回当前工作区主 JSON' : '未选择工作区' }}
      </span>
    </div>

    <div v-if="isUploadMode && state.mergeJsonFiles.length" class="merge-file-list">
      <article
        v-for="(file, index) in state.mergeJsonFiles"
        :key="`${file.name}-${file.size}-${file.lastModified}`"
        class="merge-file-item"
      >
        <div>
          <strong>{{ index + 1 }}. {{ file.name }}</strong>
          <p>{{ formatFileSize(file.size) }}</p>
        </div>
        <button class="ghost-button" @click="actions.removeMergeJsonFile(index)">移除</button>
      </article>
    </div>

    <div class="action-row">
      <button
        class="primary-button"
        :disabled="!canMerge"
        @click="actions.mergeJsonFiles"
      >
        {{ state.mergeProcessing ? '合并中...' : '执行合并' }}
      </button>
    </div>

    <p v-if="state.mergeStatus" class="panel-status" :class="{ 'is-error': state.mergeError }">
      {{ state.mergeStatus }}
    </p>

    <div v-if="state.mergeResult" class="process-panel">
      <article class="process-card" :class="{ 'is-success': !state.mergeError }">
        <div class="process-card__header">
          <div>
            <strong>合并文件已生成</strong>
            <p>{{ state.mergeResult.persistedToWorkspace ? '已同步到当前工作区主 JSON' : 'merged_json 输出目录' }}</p>
          </div>
          <span class="process-badge is-done">完成</span>
        </div>

        <div class="process-key-grid">
          <div>
            <span>输出文件名</span>
            <strong>{{ state.mergeResult.mergedFileName }}</strong>
          </div>
          <div>
            <span>merged_json 路径</span>
            <strong>{{ state.mergeResult.mergedFilePath }}</strong>
          </div>
          <div v-if="state.mergeResult.workspaceFilePath">
            <span>工作区主 JSON</span>
            <strong>{{ state.mergeResult.workspaceFilePath }}</strong>
          </div>
          <div>
            <span>输入文件数</span>
            <strong>{{ state.mergeResult.inputCount }}</strong>
          </div>
          <div>
            <span>章节总数</span>
            <strong>{{ state.mergeResult.chaptersCount }}</strong>
          </div>
          <div>
            <span>题目总数</span>
            <strong>{{ state.mergeResult.questionsCount }}</strong>
          </div>
          <div>
            <span>重复章节</span>
            <strong>{{ state.mergeResult.duplicateChapterCount }}</strong>
          </div>
          <div>
            <span>重复题目</span>
            <strong>{{ state.mergeResult.duplicateQuestionCount }}</strong>
          </div>
        </div>
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

const mergeSourceMode = computed({
  get() {
    return String(props.state.mergeSourceMode || '').trim() === 'workspace' ? 'workspace' : 'upload'
  },
  set(value) {
    props.actions.setMergeSourceMode(value)
  },
})

const isWorkspaceMode = computed(() => mergeSourceMode.value === 'workspace')
const isUploadMode = computed(() => !isWorkspaceMode.value)

const workspaceSlots = computed(() => (
  Array.isArray(props.state.multiChapterSlots) ? props.state.multiChapterSlots : []
))

const selectedWorkspaceSlotSet = computed(() => new Set(
  (Array.isArray(props.state.mergeWorkspaceSlotPaths) ? props.state.mergeWorkspaceSlotPaths : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean),
))

const selectedWorkspaceSlotCount = computed(() => selectedWorkspaceSlotSet.value.size)

const selectedCount = computed(() => (
  isWorkspaceMode.value ? selectedWorkspaceSlotCount.value : Number(props.state.mergeJsonFiles.length || 0)
))

const canMerge = computed(() => {
  if (props.state.mergeProcessing) return false
  if (isWorkspaceMode.value) {
    return Boolean(props.state.currentWorkspaceId) && selectedWorkspaceSlotCount.value >= 2
  }
  return Number(props.state.mergeJsonFiles.length || 0) >= 2
})

function formatFileSize(size) {
  if (!Number.isFinite(size)) return '-'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(2)} MB`
}
</script>
