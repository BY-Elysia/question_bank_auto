<template>
  <div class="pipeline-stepper liquid-panel tone-clear">
    <div class="liquid-panel__inner pipeline-stepper__inner">
      <div class="pipeline-stepper__track">
        <button
          v-for="item in items"
          :key="item.id"
          class="pipeline-step"
          :class="{
            'is-active': item.id === currentStep,
            'is-locked': item.disabled,
          }"
          :disabled="item.disabled"
          @click="$emit('change', item.id)"
        >
          <span class="pipeline-step__index">{{ item.index }}</span>
          <span class="pipeline-step__body">
            <strong>{{ item.title }}</strong>
            <small>{{ item.description }}</small>
          </span>
        </button>
      </div>

      <div class="pipeline-stepper__actions">
        <button class="ghost-button" :disabled="!canGoBack" @click="$emit('back')">上一步</button>
        <button class="secondary-button" :disabled="!canGoNext" @click="$emit('next')">下一步</button>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  items: {
    type: Array,
    required: true,
  },
  currentStep: {
    type: String,
    required: true,
  },
  canGoBack: {
    type: Boolean,
    default: false,
  },
  canGoNext: {
    type: Boolean,
    default: false,
  },
})

defineEmits(['change', 'back', 'next'])
</script>
