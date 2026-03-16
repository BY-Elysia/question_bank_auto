<template>
  <section v-if="hasContent" class="question-block">
    <div class="question-block__head">
      <div class="question-block__label">{{ label }}</div>
      <button
        v-if="repairable"
        class="ghost-button question-block__repair-button"
        :disabled="repairing"
        @click="emit('repair')"
      >
        {{ repairing ? '修复中...' : '修复公式' }}
      </button>
    </div>
    <div v-if="block.text" class="question-block__text" v-html="html"></div>
    <div v-if="block.media.length" class="question-block__media">
      <figure
        v-for="(media, index) in block.media"
        :key="`${media.url || 'media'}-${index}`"
        class="question-block__figure"
      >
        <img :src="media.url" :alt="media.caption || label" />
        <figcaption v-if="media.caption">{{ media.caption }}</figcaption>
      </figure>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { renderLatexHtml } from '../utils/mathRender'
import { normalizeTextBlock } from '../utils/textbookVisualizer'

const emit = defineEmits(['repair'])

const props = defineProps({
  label: {
    type: String,
    required: true,
  },
  value: {
    type: [Object, String],
    default: '',
  },
  repairable: {
    type: Boolean,
    default: false,
  },
  repairing: {
    type: Boolean,
    default: false,
  },
})

const block = computed(() => normalizeTextBlock(props.value))
const html = computed(() => renderLatexHtml(block.value.text))
const hasContent = computed(() => Boolean(block.value.text.trim() || block.value.media.length))
</script>
