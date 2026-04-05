<template>
  <div class="workspace-nav-shell">
    <nav class="workspace-nav liquid-panel tone-clear" aria-label="工作台导航">
      <div class="liquid-panel__inner workspace-nav__inner">
        <div class="workspace-nav__copy">
          <p class="workspace-nav__eyebrow">Navigation</p>
          <strong class="workspace-nav__title">题库自动处理中心</strong>
        </div>
        <div v-if="state?.currentWorkspaceId" class="workspace-nav__workspace">
          <div class="workspace-nav__workspace-head">
            <strong>当前工作区</strong>
            <span class="glass-pill is-active">{{ state.currentWorkspaceId }}</span>
          </div>
          <div class="workspace-nav__workspace-meta">
            <span class="glass-pill">
              {{ state.workspaceSummary ? `占用 ${formatBytes(state.workspaceSummary.totalBytes)}` : '尚未读取空间统计' }}
            </span>
            <span class="glass-pill" v-if="state.workspaceSummary">
              {{ `文件 ${state.workspaceSummary.fileCount} · 资产 ${state.workspaceSummary.assetCount}` }}
            </span>
          </div>
          <div class="action-row workspace-nav__workspace-actions">
            <button
              type="button"
              class="ghost-button"
              :disabled="state.workspaceSummaryLoading || state.workspaceDownloadRunning || state.workspaceCleanupRunning || state.workspaceDeleteRunning"
              @click="actions.refreshCurrentWorkspaceSummary"
            >
              {{ state.workspaceSummaryLoading ? '刷新中...' : '刷新空间' }}
            </button>
            <button
              type="button"
              class="ghost-button"
              :disabled="state.workspaceDownloadRunning || state.workspaceCleanupRunning || state.workspaceDeleteRunning"
              @click="actions.downloadCurrentWorkspaceUploads"
            >
              {{ state.workspaceDownloadRunning ? '打包中...' : '下载交付包' }}
            </button>
            <button
              type="button"
              class="ghost-button"
              :disabled="state.workspaceDownloadRunning || state.workspaceCleanupRunning || state.workspaceDeleteRunning"
              @click="actions.cleanupCurrentWorkspaceDerivedFiles"
            >
              {{ state.workspaceCleanupRunning ? '清理中...' : '清理中间产物' }}
            </button>
            <button
              type="button"
              class="ghost-button workspace-nav__danger"
              :disabled="state.workspaceDownloadRunning || state.workspaceDeleteRunning"
              @click="actions.deleteCurrentWorkspace"
            >
              {{ state.workspaceDeleteRunning ? '删除中...' : '删除当前工作区' }}
            </button>
          </div>
          <p
            v-if="state.workspaceSummaryStatus"
            class="workspace-nav__workspace-status"
            :class="{ 'is-error': state.workspaceSummaryError }"
          >
            {{ state.workspaceSummaryStatus }}
          </p>
        </div>
        <div class="workspace-nav__tabs">
          <button
            v-for="item in items"
            :key="item.id"
            type="button"
            class="workspace-tab"
            :class="{ 'is-active': item.id === currentPage }"
            :aria-current="item.id === currentPage ? 'page' : null"
            @click="$emit('change', item.id)"
          >
            <span>{{ item.label }}</span>
            <small>{{ item.description }}</small>
          </button>
        </div>
      </div>
    </nav>
  </div>
</template>

<script setup>
defineProps({
  items: {
    type: Array,
    required: true,
  },
  state: {
    type: Object,
    required: true,
  },
  actions: {
    type: Object,
    required: true,
  },
  currentPage: {
    type: String,
    required: true,
  },
})

defineEmits(['change'])

function formatBytes(value) {
  const bytes = Number(value || 0)
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B'
  }
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
</script>
