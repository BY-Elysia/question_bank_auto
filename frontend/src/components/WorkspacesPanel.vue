<template>
  <div class="workspace-manager-grid">
    <GlassPanel
      eyebrow="Workspace"
      title="工作区管理"
      description="先手动创建工作区并切换当前工作区，后续 JSON、PDF、图片导入都会写入这里。"
      tone="ice"
      prominent
    >
      <div class="field-grid compact-grid">
        <label class="field field-span-2">
          <span>新工作区名称</span>
          <input
            v-model.trim="state.workspaceCreateName"
            class="glass-input"
            type="text"
            placeholder="例如：高数上册_第三章"
            @keyup.enter="actions.createWorkspace"
          />
        </label>
      </div>

      <div class="action-row">
        <button
          class="primary-button"
          :disabled="state.workspaceCreateRunning || state.workspaceListLoading"
          @click="actions.createWorkspace"
        >
          {{ state.workspaceCreateRunning ? '创建中...' : '创建工作区' }}
        </button>
        <button
          class="ghost-button"
          :disabled="state.workspaceCreateRunning || state.workspaceListLoading"
          @click="actions.loadWorkspaceList"
        >
          {{ state.workspaceListLoading ? '刷新中...' : '刷新列表' }}
        </button>
        <span class="glass-pill" :class="{ 'is-active': state.workspaceList.length > 0 }">
          {{ state.workspaceList.length ? `共 ${state.workspaceList.length} 个工作区` : '暂无工作区' }}
        </span>
      </div>

      <p
        v-if="state.workspaceListStatus"
        class="panel-status"
        :class="{ 'is-error': state.workspaceListError }"
      >
        {{ state.workspaceListStatus }}
      </p>

      <div v-if="state.workspaceList.length" class="workspace-manager-list">
        <article
          v-for="workspace in state.workspaceList"
          :key="workspace.workspaceId"
          class="workspace-manager-card"
          :class="{ 'is-active': workspace.workspaceId === state.currentWorkspaceId }"
        >
          <div class="workspace-manager-card__head">
            <div class="workspace-manager-card__title">
              <strong>{{ workspace.name || workspace.workspaceId }}</strong>
              <small>{{ workspace.workspaceId }}</small>
            </div>
            <span
              class="glass-pill"
              :class="{ 'is-active': workspace.workspaceId === state.currentWorkspaceId }"
            >
              {{ workspace.workspaceId === state.currentWorkspaceId ? '当前工作区' : '可切换' }}
            </span>
          </div>

          <div class="workspace-manager-card__meta">
            <span>{{ `大小 ${formatBytes(workspace.totalBytes)}` }}</span>
            <span>{{ `文件 ${workspace.fileCount} · 资产 ${workspace.assetCount}` }}</span>
            <span>{{ `更新于 ${formatDateTime(workspace.updatedAt)}` }}</span>
          </div>

          <div class="action-row workspace-manager-card__actions">
            <button
              class="secondary-button"
              :disabled="workspace.workspaceId === state.currentWorkspaceId"
              @click="actions.switchCurrentWorkspace(workspace.workspaceId)"
            >
              {{ workspace.workspaceId === state.currentWorkspaceId ? '已选定' : '设为当前' }}
            </button>
            <button
              class="ghost-button"
              :disabled="state.workspaceDeleteRunning"
              @click="actions.deleteWorkspaceById(workspace.workspaceId)"
            >
              删除
            </button>
          </div>
        </article>
      </div>

      <div v-else class="empty-state">
        <strong>还没有工作区</strong>
        <span>先创建一个工作区，再去导入 JSON、PDF 和图片文件夹。</span>
      </div>
    </GlassPanel>

    <GlassPanel
      eyebrow="Browser"
      title="工作区内容"
      description="像本地文件夹一样浏览当前工作区，可以下载当前目录，也可以单独下载任意文件夹或文件。"
      tone="clear"
      prominent
    >
      <template v-if="state.currentWorkspaceId">
        <div class="workspace-browser-head">
          <div class="workspace-browser-head__copy">
            <strong>{{ state.currentWorkspaceId }}</strong>
            <span>{{ state.workspaceSummary?.name || '未命名工作区' }}</span>
          </div>
          <div class="action-row workspace-browser-head__actions">
            <button
              class="secondary-button"
              :disabled="state.workspaceBrowserLoading || state.workspaceBrowserDownloadTarget === '__current__'"
              @click="downloadCurrentFolder"
            >
              {{ state.workspaceBrowserDownloadTarget === '__current__' ? '下载中...' : '下载当前目录' }}
            </button>
            <button
              class="ghost-button"
              :disabled="state.workspaceBrowserLoading"
              @click="actions.browseCurrentWorkspace(state.workspaceBrowser?.currentPath || '')"
            >
              {{ state.workspaceBrowserLoading ? '刷新中...' : '刷新目录' }}
            </button>
          </div>
        </div>

        <div v-if="breadcrumbs.length" class="workspace-breadcrumbs">
          <button
            v-for="crumb in breadcrumbs"
            :key="crumb.relativePath || '__root__'"
            type="button"
            class="workspace-breadcrumb"
            @click="actions.browseCurrentWorkspace(crumb.relativePath)"
          >
            {{ crumb.label }}
          </button>
        </div>

        <p
          v-if="state.workspaceBrowserStatus"
          class="panel-status"
          :class="{ 'is-error': state.workspaceBrowserError }"
        >
          {{ state.workspaceBrowserStatus }}
        </p>

        <div v-if="showParentRow || browserEntries.length" class="workspace-browser-table">
          <div class="workspace-browser-table__head">
            <span>名称</span>
            <span>类型</span>
            <span>大小 / 项数</span>
            <span>修改时间</span>
            <span>操作</span>
          </div>

          <article
            v-if="showParentRow"
            class="workspace-browser-row workspace-browser-row--parent"
          >
            <button
              type="button"
              class="workspace-browser-row__name workspace-browser-row__name--nav"
              @click="actions.browseCurrentWorkspace(state.workspaceBrowser?.parentPath || '')"
            >
              .. 返回上一级
            </button>
            <span>目录</span>
            <span>-</span>
            <span>-</span>
            <span></span>
          </article>

          <article
            v-for="entry in browserEntries"
            :key="entry.relativePath"
            class="workspace-browser-row"
          >
            <button
              v-if="entry.type === 'directory'"
              type="button"
              class="workspace-browser-row__name workspace-browser-row__name--nav"
              @click="actions.openWorkspaceBrowserEntry(entry)"
            >
              {{ entry.name }}
            </button>
            <span v-else class="workspace-browser-row__name">{{ entry.name }}</span>
            <span>{{ entry.type === 'directory' ? '目录' : fileTypeLabel(entry.extension) }}</span>
            <span>{{ entry.type === 'directory' ? `${entry.childCount ?? 0} 项` : formatBytes(entry.size) }}</span>
            <span>{{ formatDateTime(entry.modifiedAt) }}</span>
            <div class="workspace-browser-row__actions">
              <button
                v-if="entry.type === 'directory'"
                class="ghost-button"
                :disabled="state.workspaceBrowserDownloadTarget === entry.relativePath"
                @click="actions.openWorkspaceBrowserEntry(entry)"
              >
                打开
              </button>
              <button
                class="secondary-button"
                :disabled="state.workspaceBrowserDownloadTarget === entry.relativePath"
                @click="actions.downloadWorkspaceBrowserEntry(entry.relativePath)"
              >
                {{ state.workspaceBrowserDownloadTarget === entry.relativePath ? '下载中...' : '下载' }}
              </button>
            </div>
          </article>
        </div>

        <div v-else class="empty-state">
          <strong>当前目录为空</strong>
          <span>这个工作区还没有内容，或者你刚创建完还没导入文件。</span>
        </div>
      </template>

      <div v-else class="empty-state">
        <strong>还没有当前工作区</strong>
        <span>请先在左侧手动创建一个工作区，并把它设为当前工作区。</span>
      </div>
    </GlassPanel>
  </div>
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

const browserEntries = computed(() => (
  Array.isArray(props.state.workspaceBrowser?.entries) ? props.state.workspaceBrowser.entries : []
))

const breadcrumbs = computed(() => (
  Array.isArray(props.state.workspaceBrowser?.breadcrumbs) ? props.state.workspaceBrowser.breadcrumbs : []
))

const showParentRow = computed(() => Boolean(props.state.workspaceBrowser && !props.state.workspaceBrowser.isRoot))

function downloadCurrentFolder() {
  props.actions.downloadWorkspaceBrowserEntry(props.state.workspaceBrowser?.currentPath || '', {
    downloadKey: '__current__',
  })
}

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

function formatDateTime(value) {
  const text = String(value || '').trim()
  if (!text) {
    return '-'
  }
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) {
    return text
  }
  return date.toLocaleString('zh-CN', {
    hour12: false,
  })
}

function fileTypeLabel(extension) {
  const ext = String(extension || '').trim().toLowerCase()
  return ext ? ext.replace(/^\./, '').toUpperCase() : '文件'
}
</script>
