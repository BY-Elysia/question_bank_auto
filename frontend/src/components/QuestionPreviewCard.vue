<template>
  <article class="visual-question-card">
    <header class="visual-question-card__header">
      <div>
        <h4>{{ question.title || question.questionId }}</h4>
        <p>{{ question.questionId }} · {{ question.nodeType }}</p>
      </div>
      <span class="visual-question-card__type">{{ question.questionType || '未分类' }}</span>
    </header>

    <QuestionTextBlock
      v-if="question.nodeType === 'GROUP'"
      label="题干"
      :value="question.stem"
      :repairable="repairEnabled"
      :repairing="repairingTarget === 'stem'"
      @repair="emitRepair('stem')"
    />
    <template v-if="question.nodeType === 'GROUP'">
      <div v-if="currentChild" class="visual-subquestion-switcher">
        <span class="glass-pill is-active">
          小题 {{ currentChild.orderNo || currentChildIndex + 1 }}/{{ question.children.length }}
        </span>
        <label class="field visual-subquestion-switcher__select">
          <span>切换小题</span>
          <select v-model="selectedChildKey" class="glass-input">
            <option
              v-for="(child, index) in question.children"
              :key="child.questionId || `${question.questionId}-${index}`"
              :value="child.questionId || `${question.questionId}-${index}`"
            >
              {{ child.title || `小题 ${child.orderNo || index + 1}` }}
            </option>
          </select>
        </label>
        <button class="ghost-button" :disabled="currentChildIndex <= 0" @click="goPrevChild">
          上一小题
        </button>
        <button
          class="ghost-button"
          :disabled="currentChildIndex < 0 || currentChildIndex >= question.children.length - 1"
          @click="goNextChild"
        >
          下一小题
        </button>
      </div>

      <section v-if="currentChild" class="visual-subquestion">
        <div class="visual-subquestion__meta">
          <strong>{{ currentChild.title || `小题 ${currentChild.orderNo || currentChildIndex + 1}` }}</strong>
          <span>{{ currentChild.questionId }}</span>
        </div>
        <QuestionTextBlock
          label="题目"
          :value="currentChild.prompt"
          :repairable="repairEnabled"
          :repairing="repairingTarget === 'childPrompt'"
          @repair="emitRepair('childPrompt')"
        />
        <QuestionTextBlock
          label="答案"
          :value="currentChild.standardAnswer"
          :repairable="repairEnabled"
          :repairing="repairingTarget === 'childStandardAnswer'"
          @repair="emitRepair('childStandardAnswer')"
        />
      </section>
    </template>
    <template v-else>
      <QuestionTextBlock
        label="题目"
        :value="question.prompt"
        :repairable="repairEnabled"
        :repairing="repairingTarget === 'prompt'"
        @repair="emitRepair('prompt')"
      />
      <QuestionTextBlock
        label="答案"
        :value="question.standardAnswer"
        :repairable="repairEnabled"
        :repairing="repairingTarget === 'standardAnswer'"
        @repair="emitRepair('standardAnswer')"
      />
    </template>
  </article>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import QuestionTextBlock from './QuestionTextBlock.vue'

const emit = defineEmits(['repair-math-format'])

const props = defineProps({
  question: {
    type: Object,
    required: true,
  },
  repairEnabled: {
    type: Boolean,
    default: false,
  },
  repairingTarget: {
    type: String,
    default: '',
  },
})

const selectedChildKey = ref('')

const childOptions = computed(() =>
  Array.isArray(props.question.children)
    ? props.question.children.map((child, index) => ({
        key: child.questionId || `${props.question.questionId}-${index}`,
        value: child,
      }))
    : [],
)

watch(
  () => props.question.questionId,
  () => {
    selectedChildKey.value = childOptions.value[0]?.key || ''
  },
  { immediate: true },
)

watch(
  childOptions,
  (items) => {
    const exists = items.some((item) => item.key === selectedChildKey.value)
    if (!exists) {
      selectedChildKey.value = items[0]?.key || ''
    }
  },
  { immediate: true },
)

const currentChildIndex = computed(() =>
  childOptions.value.findIndex((item) => item.key === selectedChildKey.value),
)

const currentChild = computed(() => {
  if (currentChildIndex.value < 0) {
    return null
  }
  return childOptions.value[currentChildIndex.value]?.value || null
})

function goPrevChild() {
  if (currentChildIndex.value <= 0) {
    return
  }
  selectedChildKey.value = childOptions.value[currentChildIndex.value - 1].key
}

function goNextChild() {
  if (currentChildIndex.value < 0 || currentChildIndex.value >= childOptions.value.length - 1) {
    return
  }
  selectedChildKey.value = childOptions.value[currentChildIndex.value + 1].key
}

function emitRepair(targetType) {
  emit('repair-math-format', {
    questionId: props.question.questionId,
    targetType,
    childNo:
      targetType === 'childPrompt' || targetType === 'childStandardAnswer'
        ? Number(currentChild.value?.orderNo || currentChildIndex.value + 1 || 0)
        : null,
    blockLabel:
      targetType === 'stem'
        ? '题干'
        : targetType === 'prompt'
          ? '题目'
          : targetType === 'standardAnswer'
            ? '答案'
            : targetType === 'childPrompt'
              ? `小题 ${currentChild.value?.orderNo || currentChildIndex.value + 1} 题目`
              : `小题 ${currentChild.value?.orderNo || currentChildIndex.value + 1} 答案`,
  })
}
</script>
