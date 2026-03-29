<template>
  <article class="visual-question-card">
    <header class="visual-question-card__header">
      <div class="visual-question-card__header-main">
        <h4>{{ question.title || question.questionId }}</h4>
        <p>{{ question.questionId }} · {{ question.nodeType }}</p>
      </div>

      <div class="visual-question-card__header-actions">
        <label class="field visual-question-card__editor">
          <span>当前题型</span>
          <select v-model="questionTypeDraft" class="glass-input" :disabled="questionTypeSaving">
            <option v-for="item in resolvedQuestionTypeOptions" :key="item.value" :value="item.value">
              {{ item.label }}
            </option>
          </select>
        </label>

        <button
          class="ghost-button"
          :disabled="questionTypeSaving || !questionTypeChanged"
          @click="emitUpdateQuestionType()"
        >
          {{ questionTypeSaving ? '保存中...' : '保存题型' }}
        </button>

        <button
          v-if="answerEnabled && question.nodeType !== 'GROUP'"
          class="secondary-button"
          :disabled="answerProcessing"
          @click="emitGenerateAnswer()"
        >
          {{ answerProcessing ? '生成中...' : '生成当前题答案' }}
        </button>
      </div>
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
          <div class="visual-subquestion__meta-main">
            <strong>{{ currentChild.title || `小题 ${currentChild.orderNo || currentChildIndex + 1}` }}</strong>
            <span>{{ currentChild.questionId }}</span>
          </div>

          <div class="visual-subquestion__meta-actions">
            <label class="field visual-question-card__editor visual-question-card__editor--child">
              <span>小题题型</span>
              <select v-model="childQuestionTypeDraft" class="glass-input" :disabled="questionTypeSaving">
                <option v-for="item in resolvedQuestionTypeOptions" :key="item.value" :value="item.value">
                  {{ item.label }}
                </option>
              </select>
            </label>

            <button
              class="ghost-button"
              :disabled="questionTypeSaving || !childQuestionTypeChanged"
              @click="emitUpdateQuestionType(true)"
            >
              {{ questionTypeSaving ? '保存中...' : '保存小题题型' }}
            </button>

            <button
              v-if="attachEnabled"
              class="ghost-button"
              :disabled="attachProcessing || !hasPendingImages"
              @click="emitAttachToChild"
            >
              {{ attachProcessing ? '补图中...' : '补图到当前小题' }}
            </button>

            <button
              v-if="answerEnabled"
              class="secondary-button"
              :disabled="answerProcessing"
              @click="emitGenerateAnswer(true)"
            >
              {{ answerProcessing ? '生成中...' : '生成当前小题答案' }}
            </button>
          </div>
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

const FALLBACK_QUESTION_TYPE_OPTIONS = [
  { value: 'SHORT_ANSWER', label: '填空/简答题' },
  { value: 'PROOF', label: '证明题' },
  { value: 'CALCULATION', label: '计算题' },
  { value: 'code', label: '编程题' },
  { value: 'SINGLE_CHOICE', label: '单选题' },
  { value: 'MULTI_CHOICE', label: '多选题' },
  { value: 'JUDGE', label: '判断题' },
]

const emit = defineEmits(['repair-math-format', 'update-question-type', 'attach-images', 'generate-answer'])

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
  questionTypeOptions: {
    type: Array,
    default: () => [],
  },
  questionTypeSaving: {
    type: Boolean,
    default: false,
  },
  attachEnabled: {
    type: Boolean,
    default: false,
  },
  attachProcessing: {
    type: Boolean,
    default: false,
  },
  hasPendingImages: {
    type: Boolean,
    default: false,
  },
  answerEnabled: {
    type: Boolean,
    default: false,
  },
  answerProcessing: {
    type: Boolean,
    default: false,
  },
})

const selectedChildKey = ref('')
const questionTypeDraft = ref('')
const childQuestionTypeDraft = ref('')

const resolvedQuestionTypeOptions = computed(() =>
  Array.isArray(props.questionTypeOptions) && props.questionTypeOptions.length
    ? props.questionTypeOptions
    : FALLBACK_QUESTION_TYPE_OPTIONS,
)

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

watch(
  () => props.question.questionType,
  (value) => {
    questionTypeDraft.value = String(value || '').trim() || resolvedQuestionTypeOptions.value[0]?.value || 'SHORT_ANSWER'
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

watch(
  () => currentChild.value?.questionId,
  () => {
    childQuestionTypeDraft.value =
      String(currentChild.value?.questionType || '').trim() || resolvedQuestionTypeOptions.value[0]?.value || 'SHORT_ANSWER'
  },
  { immediate: true },
)

const questionTypeChanged = computed(
  () => String(questionTypeDraft.value || '').trim() !== String(props.question.questionType || '').trim(),
)

const childQuestionTypeChanged = computed(
  () => String(childQuestionTypeDraft.value || '').trim() !== String(currentChild.value?.questionType || '').trim(),
)

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
    childQuestionId:
      targetType === 'childPrompt' || targetType === 'childStandardAnswer'
        ? String(currentChild.value?.questionId || '')
        : '',
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

function emitUpdateQuestionType(forChild = false) {
  if (forChild) {
    if (!currentChild.value) {
      return
    }
    emit('update-question-type', {
      questionId: props.question.questionId,
      questionTitle: currentChild.value.title || currentChild.value.questionId,
      questionType: childQuestionTypeDraft.value,
      childQuestionId: String(currentChild.value.questionId || ''),
      childNo: Number(currentChild.value.orderNo || currentChildIndex.value + 1 || 0),
      blockLabel: `小题 ${currentChild.value.orderNo || currentChildIndex.value + 1}`,
    })
    return
  }

  emit('update-question-type', {
    questionId: props.question.questionId,
    questionTitle: props.question.title || props.question.questionId,
    questionType: questionTypeDraft.value,
    childQuestionId: '',
    childNo: null,
    blockLabel: props.question.nodeType === 'GROUP' ? '当前大题' : '当前题目',
  })
}

function emitAttachToChild() {
  if (!currentChild.value) {
    return
  }
  emit('attach-images', {
    questionId: props.question.questionId,
    questionTitle: currentChild.value.title || currentChild.value.questionId,
    childQuestionId: String(currentChild.value.questionId || ''),
    childNo: Number(currentChild.value.orderNo || currentChildIndex.value + 1 || 0),
    blockLabel: `小题 ${currentChild.value.orderNo || currentChildIndex.value + 1}`,
  })
}

function emitGenerateAnswer(forChild = false) {
  if (forChild) {
    if (!currentChild.value) {
      return
    }
    emit('generate-answer', {
      questionId: props.question.questionId,
      questionTitle: currentChild.value.title || currentChild.value.questionId,
      childQuestionId: String(currentChild.value.questionId || ''),
      childNo: Number(currentChild.value.orderNo || currentChildIndex.value + 1 || 0),
      blockLabel: `小题 ${currentChild.value.orderNo || currentChildIndex.value + 1}`,
    })
    return
  }

  emit('generate-answer', {
    questionId: props.question.questionId,
    questionTitle: props.question.title || props.question.questionId,
    childQuestionId: '',
    childNo: null,
    blockLabel: '当前题目',
  })
}
</script>
