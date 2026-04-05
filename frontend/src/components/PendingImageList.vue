<template>
  <div v-if="previewItems.length" class="pending-image-list">
    <article
      v-for="(item, index) in previewItems"
      :key="item.key"
      class="pending-image-card"
    >
      <a
        class="pending-image-card__preview"
        :href="item.url"
        target="_blank"
        rel="noreferrer"
      >
        <img
          :src="item.url"
          :alt="item.file.name || `待提交图片 ${index + 1}`"
          loading="lazy"
        />
      </a>

      <div class="pending-image-card__meta">
        <div class="pending-image-card__meta-main">
          <span>第 {{ index + 1 }} 张</span>
          <strong>{{ item.file.name || `图片 ${index + 1}` }}</strong>
          <span>{{ item.sizeLabel }}</span>
        </div>

        <button
          class="ghost-button"
          :disabled="processing"
          @click="emit('remove', index)"
        >
          删除
        </button>
      </div>
    </article>
  </div>
</template>

<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps({
  files: {
    type: Array,
    default: () => [],
  },
  processing: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['remove'])

const previewItems = ref([])
const canCreateObjectUrl =
  typeof URL !== 'undefined' &&
  typeof URL.createObjectURL === 'function' &&
  typeof URL.revokeObjectURL === 'function'

watch(
  () =>
    (Array.isArray(props.files) ? props.files : []).map(
      (file, index) => `${file?.name || 'image'}__${file?.size || 0}__${file?.lastModified || 0}__${index}`,
    ),
  () => {
    clearPreviewItems()
    previewItems.value = (Array.isArray(props.files) ? props.files : [])
      .filter((file) => Boolean(file) && (typeof File === 'undefined' || file instanceof File))
      .map((file, index) => ({
        key: `${file.name || 'image'}__${file.size || 0}__${file.lastModified || 0}__${index}`,
        file,
        url: canCreateObjectUrl ? URL.createObjectURL(file) : '',
        sizeLabel: formatFileSize(file.size),
      }))
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  clearPreviewItems()
})

function clearPreviewItems() {
  for (const item of previewItems.value) {
    if (canCreateObjectUrl && item?.url) {
      URL.revokeObjectURL(item.url)
    }
  }
  previewItems.value = []
}

function formatFileSize(size) {
  const numericSize = Number(size || 0)
  if (!Number.isFinite(numericSize) || numericSize <= 0) {
    return '未知大小'
  }
  if (numericSize < 1024) {
    return `${numericSize} B`
  }
  if (numericSize < 1024 * 1024) {
    return `${(numericSize / 1024).toFixed(1)} KB`
  }
  return `${(numericSize / (1024 * 1024)).toFixed(2)} MB`
}
</script>
