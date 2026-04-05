<template>
  <article class="visual-question-card">
    <header class="visual-question-card__header">
      <div class="visual-question-card__header-main">
        <h4>{{ question.title || question.questionId }}</h4>
        <p>{{ question.questionId }} / {{ question.nodeType }}</p>
      </div>

      <div class="visual-question-card__header-actions">
        <label class="field visual-question-card__editor">
          <span>{{ question.nodeType === 'GROUP' ? '大题题型' : '当前题型' }}</span>
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
          {{ questionTypeSaving ? '保存中...' : question.nodeType === 'GROUP' ? '保存大题题型' : '保存题型' }}
        </button>
      </div>
    </header>

    <QuestionTextBlock
      v-if="question.nodeType === 'GROUP'"
      label="公共题干"
      :value="question.stem"
      :repairable="repairEnabled"
      :repairing="repairingTarget === 'stem'"
      @repair="emitRepair('stem')"
    />

    <template v-if="question.nodeType === 'GROUP'">
      <div v-if="currentChild" class="visual-subquestion-switcher">
        <span class="glass-pill is-active">
          当前定位：第{{ currentChild.orderNo || currentChildIndex + 1 }}小题
        </span>

        <label class="field visual-subquestion-switcher__select">
          <span>定位小题</span>
          <select :value="selectedChildKey" class="glass-input" @change="handleChildSelect">
            <option
              v-for="(child, index) in question.children"
              :key="child.questionId || `${question.questionId}-${index}`"
              :value="child.questionId || `${question.questionId}-${index}`"
            >
              {{ child.title || `第${child.orderNo || index + 1}小题` }}
            </option>
          </select>
        </label>

        <button class="ghost-button" :disabled="currentChildIndex <= 0" @click="goPrevChild">
          上一小题
        </button>

        <button
          class="ghost-button"
          :disabled="currentChildIndex < 0 || currentChildIndex >= childOptions.length - 1"
          @click="goNextChild"
        >
          下一小题
        </button>
      </div>

      <section v-if="currentChild" class="visual-subquestion">
        <div class="visual-subquestion__meta">
          <div class="visual-subquestion__meta-main">
            <strong>{{ currentChild.title || `第${currentChild.orderNo || currentChildIndex + 1}小题` }}</strong>
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
  { value: 'CODE', label: '编程题' },
  { value: 'SINGLE_CHOICE', label: '单选题' },
  { value: 'MULTI_CHOICE', label: '多选题' },
  { value: 'JUDGE', label: '判断题' },
]

const emit = defineEmits(['repair-math-format', 'update-question-type', 'select-child'])

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
  selectedChildKey: {
    type: String,
    default: '',
  },
})

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

const effectiveSelectedChildKey = computed(() => {
  const matched = childOptions.value.find((item) => item.key === props.selectedChildKey)
  return matched?.key || childOptions.value[0]?.key || ''
})

watch(
  () => props.question.questionType,
  (value) => {
    questionTypeDraft.value = String(value || '').trim() || resolvedQuestionTypeOptions.value[0]?.value || 'SHORT_ANSWER'
  },
  { immediate: true },
)

watch(
  childOptions,
  (items) => {
    if (!items.length) {
      return
    }
    const exists = items.some((item) => item.key === props.selectedChildKey)
    if (!exists && items[0]?.key) {
      emit('select-child', items[0].key)
    }
  },
  { immediate: true },
)

const currentChildIndex = computed(() =>
  childOptions.value.findIndex((item) => item.key === effectiveSelectedChildKey.value),
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

function getCurrentChildNo() {
  return Number(currentChild.value?.orderNo || currentChildIndex.value + 1 || 0)
}

function handleChildSelect(event) {
  emit('select-child', String(event?.target?.value || '').trim())
}

function goPrevChild() {
  if (currentChildIndex.value <= 0) {
    return
  }
  emit('select-child', childOptions.value[currentChildIndex.value - 1].key)
}

function goNextChild() {
  if (currentChildIndex.value < 0 || currentChildIndex.value >= childOptions.value.length - 1) {
    return
  }
  emit('select-child', childOptions.value[currentChildIndex.value + 1].key)
}

function emitRepair(targetType) {
  const currentChildNo = getCurrentChildNo()
  emit('repair-math-format', {
    questionId: props.question.questionId,
    childQuestionId:
      targetType === 'childPrompt' || targetType === 'childStandardAnswer'
        ? String(currentChild.value?.questionId || '')
        : '',
    targetType,
    childNo:
      targetType === 'childPrompt' || targetType === 'childStandardAnswer'
        ? currentChildNo
        : null,
    blockLabel:
      targetType === 'stem'
        ? '公共题干'
        : targetType === 'prompt'
          ? '题目'
          : targetType === 'standardAnswer'
            ? '答案'
            : targetType === 'childPrompt'
              ? `第${currentChildNo}小题题目`
              : `第${currentChildNo}小题答案`,
  })
}

function emitUpdateQuestionType(forChild = false) {
  if (forChild) {
    if (!currentChild.value) {
      return
    }
    const currentChildNo = getCurrentChildNo()
    emit('update-question-type', {
      questionId: props.question.questionId,
      questionTitle: currentChild.value.title || currentChild.value.questionId,
      questionType: childQuestionTypeDraft.value,
      childQuestionId: String(currentChild.value.questionId || ''),
      childNo: currentChildNo,
      blockLabel: `第${currentChildNo}小题`,
    })
    return
  }

  emit('update-question-type', {
    questionId: props.question.questionId,
    questionTitle: props.question.title || props.question.questionId,
    questionType: questionTypeDraft.value,
    childQuestionId: '',
    childNo: null,
    blockLabel: '当前题目',
  })
}
</script>
