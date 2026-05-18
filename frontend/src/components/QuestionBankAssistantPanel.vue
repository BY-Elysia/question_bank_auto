<template>
  <div class="agent-chat">
    <section class="agent-chat__panel">
      <span class="agent-chat__panel-glow agent-chat__panel-glow--rose" aria-hidden="true"></span>
      <span class="agent-chat__panel-glow agent-chat__panel-glow--blue" aria-hidden="true"></span>
      <span class="agent-chat__panel-grid" aria-hidden="true"></span>

      <header class="agent-chat__header">
        <div class="agent-chat__brand">
          <div class="agent-chat__sigil" aria-hidden="true">
            <span class="agent-chat__sigil-ring"></span>
            <span class="agent-chat__sigil-core"></span>
          </div>

          <div class="agent-chat__heading">
            <p class="agent-chat__eyebrow">Aemeath Core</p>
            <h1 class="agent-chat__title">爱弥斯</h1>
            <p class="agent-chat__subtitle">{{ currentSessionTitle }}</p>
          </div>
        </div>

        <div class="agent-chat__header-actions">
          <button
            class="ghost-button agent-chat__header-button agent-chat__history-toggle"
            type="button"
            @click="historyDrawerOpen = !historyDrawerOpen"
          >
            历史
          </button>
          <button class="ghost-button agent-chat__header-button" type="button" @click="emit('exit')">
            返回工作台
          </button>
          <span class="agent-chat__badge" :class="state.agentAvailable ? 'is-online' : 'is-offline'">
            {{ state.agentAvailable ? '已连接' : '未连接' }}
          </span>
          <button
            class="secondary-button agent-chat__header-button"
            type="button"
            :disabled="state.agentBootstrapLoading || state.agentSessionsLoading"
            @click="refreshSidebar"
          >
            {{ state.agentBootstrapLoading || state.agentSessionsLoading ? '同步中...' : '同步' }}
          </button>
          <button
            class="ghost-button agent-chat__header-button"
            type="button"
            :disabled="state.agentProcessing || state.agentSessionLoading"
            @click="startNewConversation"
          >
            新对话
          </button>
        </div>
      </header>

      <div class="agent-chat__body agent-chat__body--scene" :style="heroVisualStyle">
        <div
          v-if="historyDrawerOpen"
          class="agent-chat__sidebar-backdrop"
          aria-hidden="true"
          @click="historyDrawerOpen = false"
        ></div>

        <aside class="agent-chat__sidebar" :class="{ 'is-open': historyDrawerOpen }">
          <div class="agent-chat__sidebar-head">
            <div class="agent-chat__sidebar-copy">
              <p class="agent-chat__sidebar-label">历史对话</p>
              <strong>{{ sessionSummaryText }}</strong>
            </div>

            <div class="agent-chat__sidebar-actions">
              <button
                class="ghost-button agent-chat__sidebar-button"
                type="button"
                :disabled="state.agentSessionsLoading || state.agentProcessing"
                @click="startNewConversation"
              >
                新对话
              </button>
              <button
                class="ghost-button agent-chat__sidebar-button"
                type="button"
                :disabled="state.agentSessionsLoading"
                @click="actions.loadAgentSessions()"
              >
                刷新
              </button>
            </div>
          </div>

          <p
            v-if="state.agentSessionsStatus && (state.agentSessionsLoading || state.agentSessionsError)"
            class="agent-chat__sidebar-status"
            :class="{ 'is-error': state.agentSessionsError }"
          >
            {{ state.agentSessionsStatus }}
          </p>

          <div v-if="sessionItems.length" class="agent-chat__session-list">
            <article
              v-for="session in sessionItems"
              :key="session.sessionId"
              class="agent-chat__session-item"
              :class="{ 'is-active': session.sessionId === state.agentSessionId }"
            >
              <div class="agent-chat__session-top">
                <button
                  type="button"
                  class="agent-chat__session-head"
                  :disabled="state.agentSessionLoading"
                  @click="openSession(session.sessionId)"
                >
                  <div class="agent-chat__session-line">
                    <strong>{{ session.title }}</strong>
                    <span>{{ formatSessionTime(session.updatedAt) }}</span>
                  </div>
                </button>

                <button
                  type="button"
                  class="agent-chat__session-delete"
                  :disabled="state.agentSessionLoading || state.agentProcessing"
                  @click.stop="deleteSession(session.sessionId)"
                >
                  删除
                </button>
              </div>

              <button
                type="button"
                class="agent-chat__session-body"
                :disabled="state.agentSessionLoading"
                @click="openSession(session.sessionId)"
              >
                <p v-if="session.preview" class="agent-chat__session-preview">{{ session.preview }}</p>
                <div class="agent-chat__session-meta">
                  <span>{{ session.messageCount }} 条消息</span>
                  <span v-if="session.hasPendingAction" class="agent-chat__session-pill">待确认</span>
                </div>
              </button>
            </article>
          </div>

          <div v-else class="agent-chat__session-empty">
            <p>{{ state.agentSessionsLoading ? '正在同步对话...' : '还没有历史对话' }}</p>
          </div>
        </aside>

        <div class="agent-chat__main">
          <section class="agent-chat__surface">
            <div v-if="!hasMessages" class="agent-chat__empty" aria-hidden="true">
              <div class="agent-chat__empty-chip">爱弥斯待命中</div>
            </div>

            <div v-else class="agent-chat__thread">
              <article
                v-for="(message, index) in state.agentMessages"
                :key="`${message.role}_${index}_${message.createdAt || ''}`"
                class="agent-chat__message"
                :class="[
                  `agent-chat__message--${message.role}`,
                  { 'is-error': message.status === 'error' },
                ]"
              >
                <div class="agent-chat__message-meta">
                  <div class="agent-chat__message-role">
                    <span class="agent-chat__message-role-mark" :class="`is-${message.role}`"></span>
                    <strong>{{ message.role === 'assistant' ? 'Aemeath' : '你' }}</strong>
                  </div>
                  <span>{{ formatDate(message.createdAt) }}</span>
                </div>

                <div class="agent-chat__message-content assistant-rich-text" v-html="renderMessageHtml(message.content)"></div>

                <div v-if="Array.isArray(message.attachments) && message.attachments.length" class="agent-chat__message-attachments">
                  <span
                    v-for="attachment in message.attachments"
                    :key="`${attachment.name || attachment.file_name}_${attachment.size || attachment.size_bytes || 0}`"
                    class="agent-chat__attachment-chip"
                  >
                    <span>{{ attachment.name || attachment.file_name || 'attachment' }}</span>
                    <small>{{ formatFileSize(attachment.size || attachment.size_bytes || 0) }}</small>
                  </span>
                </div>

                <div v-if="canPlayVoice(message)" class="agent-chat__message-tools">
                  <button
                    class="agent-chat__voice-button"
                    :class="{ 'is-playing': activeVoiceIndex === index }"
                    :disabled="message.audioLoading"
                    type="button"
                    @click="toggleVoice(message, index)"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M4 10h4l5-4v12l-5-4H4zM16 9a5 5 0 0 1 0 6M18.5 6.5a8.5 8.5 0 0 1 0 11"
                        fill="none"
                        stroke="currentColor"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="1.8"
                      />
                    </svg>
                    <span>
                      {{
                        message.audioLoading
                          ? '生成语音中...'
                          : activeVoiceIndex === index
                            ? '停止播放'
                            : '播放语音'
                      }}
                    </span>
                  </button>
                  <span v-if="message.audioError" class="agent-chat__voice-error">{{ message.audioError }}</span>
                </div>

                <div
                  v-if="message.pendingAction && state.agentPendingAction?.action_id === message.pendingAction.action_id"
                  class="agent-chat__pending"
                >
                  <div class="agent-chat__pending-head">
                    <strong>待确认操作</strong>
                    <span>{{ message.pendingAction.tool_name }}</span>
                  </div>
                  <p class="agent-chat__pending-summary">{{ message.pendingAction.summary }}</p>
                  <pre class="code-surface agent-chat__pending-preview">{{ formatJson(message.pendingAction.args_preview) }}</pre>
                  <div class="agent-chat__pending-actions">
                    <button
                      class="primary-button agent-chat__send-button"
                      type="button"
                      :disabled="state.agentProcessing"
                      @click="actions.confirmAgentPendingAction(true)"
                    >
                      确认执行
                    </button>
                    <button
                      class="ghost-button"
                      type="button"
                      :disabled="state.agentProcessing"
                      @click="actions.confirmAgentPendingAction(false)"
                    >
                      取消
                    </button>
                  </div>
                </div>
              </article>
            </div>
          </section>

          <div class="agent-chat__composer">
            <div v-if="visibleAgentStatus" class="agent-chat__composer-bar">
              <p class="agent-chat__status" :class="{ 'is-error': state.agentError || !state.agentAvailable }">
                {{ visibleAgentStatus }}
              </p>
            </div>

            <label class="agent-chat__field">
              <span class="sr-only">发送给 Aemeath 的消息</span>
              <textarea
                v-model="state.agentInput"
                class="glass-input agent-chat__textarea"
                rows="4"
                :disabled="state.agentProcessing || state.agentSessionLoading || Boolean(state.agentPendingAction)"
                placeholder="输入消息，Enter 发送，Shift + Enter 换行"
                @keydown.enter.exact.prevent="actions.sendAgentMessage"
              />
            </label>

            <div class="agent-chat__attachment-bar">
              <input
                ref="agentAttachmentInput"
                class="sr-only"
                type="file"
                multiple
                accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
                :disabled="state.agentProcessing || state.agentSessionLoading || Boolean(state.agentPendingAction)"
                @change="onAgentAttachmentChange"
              />
              <button
                class="ghost-button agent-chat__attach-button"
                type="button"
                :disabled="state.agentProcessing || state.agentSessionLoading || Boolean(state.agentPendingAction)"
                @click="pickAgentAttachments"
              >
                添加附件
              </button>
              <div v-if="agentAttachmentFiles.length" class="agent-chat__attachment-list">
                <span
                  v-for="(file, fileIndex) in agentAttachmentFiles"
                  :key="`${file.name}_${file.size}_${fileIndex}`"
                  class="agent-chat__attachment-chip"
                >
                  <span>{{ file.name }}</span>
                  <small>{{ formatFileSize(file.size) }}</small>
                  <button
                    type="button"
                    :disabled="state.agentProcessing"
                    @click="removeAgentAttachment(fileIndex)"
                  >
                    ×
                  </button>
                </span>
              </div>
            </div>

            <div class="agent-chat__composer-footer">
              <details class="agent-chat__details">
                <summary>系统面板</summary>

                <div class="agent-chat__details-body">
                  <div class="agent-chat__facts">
                    <div class="agent-chat__fact">
                      <span>模型</span>
                      <strong>{{ state.agentIdentity?.model || '等待 Agent 返回' }}</strong>
                    </div>
                    <div class="agent-chat__fact">
                      <span>会话</span>
                      <strong>{{ state.agentSessionId || '新对话' }}</strong>
                    </div>
                    <div class="agent-chat__fact">
                      <span>历史</span>
                      <strong>{{ sessionSummaryText }}</strong>
                    </div>
                    <div class="agent-chat__fact">
                      <span>MCP</span>
                      <strong>{{ state.agentMcp?.available ? `已连接 · ${state.agentMcp.toolCount || 0} 个工具` : '未连接' }}</strong>
                    </div>
                  </div>

                  <p v-if="enabledSkillsText" class="agent-chat__skills">已启用能力：{{ enabledSkillsText }}</p>

                  <label class="field">
                    <span>Ark API Key 覆盖</span>
                    <input
                      v-model="state.agentArkApiKey"
                      class="glass-input agent-chat__config-input"
                      type="password"
                      placeholder="可选，留空则使用默认配置"
                    />
                  </label>

                  <div v-if="state.agentTrace.length" class="agent-chat__trace">
                    <p class="agent-chat__trace-title">最近一轮轨迹</p>
                    <article
                      v-for="trace in compactTraces"
                      :key="`${trace.step}_${trace.kind}_${trace.tool_name || ''}`"
                      class="agent-chat__trace-item"
                    >
                      <div class="agent-chat__trace-head">
                        <strong>#{{ trace.step }} · {{ trace.kind }}</strong>
                        <span>{{ trace.status }}</span>
                      </div>
                      <p>{{ trace.summary }}</p>
                      <p v-if="trace.skill_name || trace.tool_name">
                        {{ [trace.skill_name, trace.tool_name].filter(Boolean).join(' / ') }}
                      </p>
                      <pre v-if="trace.args_preview" class="code-surface agent-chat__trace-preview">{{ formatJson(trace.args_preview) }}</pre>
                      <pre v-if="trace.result_preview" class="code-surface agent-chat__trace-preview">{{ formatTraceResult(trace.result_preview) }}</pre>
                    </article>
                  </div>
                </div>
              </details>

              <div class="agent-chat__actions">
                <button
                  class="primary-button agent-chat__send-button"
                  type="button"
                  :disabled="state.agentProcessing || state.agentSessionLoading || (!state.agentInput.trim() && !agentAttachmentFiles.length) || Boolean(state.agentPendingAction)"
                  @click="actions.sendAgentMessage"
                >
                  {{ state.agentProcessing ? '处理中...' : '发送' }}
                </button>
                <button
                  class="ghost-button"
                  type="button"
                  :disabled="state.agentProcessing || state.agentSessionLoading"
                  @click="startNewConversation"
                >
                  新对话
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { renderRichTextHtml } from '../utils/mathRender'

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

const emit = defineEmits(['exit'])

const activeVoiceIndex = ref(-1)
const historyDrawerOpen = ref(false)
const agentAttachmentInput = ref(null)
let activeAudio = null

const heroVisualStyle = computed(() => ({
  '--agent-scene-image': "url('/aemeath-agent-hero.png')",
}))

const sessionItems = computed(() =>
  Array.isArray(props.state.agentSessions) ? props.state.agentSessions : [],
)

const hasMessages = computed(() => Array.isArray(props.state.agentMessages) && props.state.agentMessages.length > 0)

const agentAttachmentFiles = computed(() =>
  Array.isArray(props.state.agentAttachmentFiles) ? props.state.agentAttachmentFiles : [],
)

const compactTraces = computed(() =>
  Array.isArray(props.state.agentTrace) ? props.state.agentTrace.slice(0, 6) : [],
)

const enabledSkillsText = computed(() => {
  const skills = Array.isArray(props.state.agentIdentity?.skills) ? props.state.agentIdentity.skills : []
  return skills.map((item) => String(item || '').trim()).filter(Boolean).join(' · ')
})

const activeSessionSummary = computed(() =>
  sessionItems.value.find((item) => item.sessionId === props.state.agentSessionId) || null,
)

const currentSessionTitle = computed(() => {
  if (activeSessionSummary.value?.title) {
    return activeSessionSummary.value.title
  }
  const firstUserMessage = (Array.isArray(props.state.agentMessages) ? props.state.agentMessages : []).find(
    (item) => item?.role === 'user' && String(item?.content || '').trim(),
  )
  const fallback = String(firstUserMessage?.content || '').trim()
  if (!fallback) {
    return '新对话'
  }
  return compactText(fallback, 36)
})

const sessionSummaryText = computed(() => {
  const count = sessionItems.value.length
  return count ? `${count} 个会话` : '暂无历史'
})

const visibleAgentStatus = computed(() => {
  const raw = String(props.state.agentStatus || props.state.agentBootstrapStatus || '').trim()
  if (!raw) return ''

  const shouldShow = Boolean(
    props.state.agentError ||
      props.state.agentProcessing ||
      props.state.agentPendingAction ||
      props.state.agentBootstrapLoading ||
      props.state.agentSessionLoading ||
      !props.state.agentAvailable,
  )
  if (!shouldShow) return ''

  if (raw.includes('<!doctype html') || raw.includes('<html')) {
    return 'Agent 接口没有返回有效 JSON，请确认前端代理、Node 后端和 agent_service 都已启动。'
  }
  return raw.length > 220 ? `${raw.slice(0, 220)}...` : raw
})

function compactText(value, maxLength = 48) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  return text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}...` : text
}

function formatDate(value) {
  if (!value) return '刚刚'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('zh-CN', { hour12: false })
}

function formatSessionTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function formatJson(value) {
  try {
    return JSON.stringify(value || {}, null, 2)
  } catch (_error) {
    return '{}'
  }
}

function formatFileSize(value) {
  const size = Number(value || 0)
  if (!Number.isFinite(size) || size <= 0) return '0 B'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function formatTraceResult(value) {
  if (typeof value === 'string') {
    return value
  }
  return formatJson(value)
}

function renderMessageHtml(value) {
  return renderRichTextHtml(value)
}

function canPlayVoice(message) {
  return message?.role === 'assistant' && message?.status !== 'error' && String(message?.content || '').trim()
}

function stopActiveAudio() {
  if (!activeAudio) {
    activeVoiceIndex.value = -1
    return
  }
  activeAudio.pause()
  activeAudio.currentTime = 0
  activeAudio.src = ''
  activeVoiceIndex.value = -1
}

function startNewConversation() {
  stopActiveAudio()
  props.actions.clearAgentConversation()
  historyDrawerOpen.value = false
}

function refreshSidebar() {
  props.actions.loadAgentBootstrap()
  props.actions.loadAgentSessions()
}

function pickAgentAttachments() {
  agentAttachmentInput.value?.click()
}

function onAgentAttachmentChange(event) {
  props.actions.setAgentAttachmentFiles(event?.target?.files || [])
  if (event?.target) {
    event.target.value = ''
  }
}

function removeAgentAttachment(index) {
  props.actions.removeAgentAttachmentFile(index)
}

function openSession(sessionId) {
  stopActiveAudio()
  props.actions.openAgentSession(sessionId)
  historyDrawerOpen.value = false
}

function deleteSession(sessionId) {
  props.actions.deleteAgentSession(sessionId)
}

async function toggleVoice(message, index) {
  if (!canPlayVoice(message)) {
    return
  }

  if (activeVoiceIndex.value === index && activeAudio && !activeAudio.paused) {
    activeAudio.pause()
    activeAudio.currentTime = 0
    activeVoiceIndex.value = -1
    return
  }

  try {
    const audioUrl = message.audioUrl || (await props.actions.ensureAgentMessageVoice(index))
    if (!audioUrl) {
      return
    }

    if (!activeAudio) {
      activeAudio = new Audio()
      activeAudio.addEventListener('ended', () => {
        activeVoiceIndex.value = -1
      })
      activeAudio.addEventListener('pause', () => {
        if (activeAudio && activeAudio.ended) {
          activeVoiceIndex.value = -1
        }
      })
    } else {
      activeAudio.pause()
      activeAudio.currentTime = 0
    }

    activeAudio.src = new URL(audioUrl, window.location.origin).toString()
    activeVoiceIndex.value = index
    await activeAudio.play()
  } catch (_error) {
    activeVoiceIndex.value = -1
  }
}

onBeforeUnmount(() => {
  stopActiveAudio()
  activeAudio = null
})
</script>
