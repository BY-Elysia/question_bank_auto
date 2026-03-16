<template>
  <nav class="workspace-nav liquid-panel tone-clear">
    <div class="liquid-panel__inner workspace-nav__inner">
      <div class="workspace-nav__copy">
        <p class="workspace-nav__eyebrow">Navigation</p>
        <strong class="workspace-nav__title">题库自动处理中心</strong>
      </div>
      <div class="workspace-nav__tabs">
        <button
          v-for="item in items"
          :key="item.id"
          class="workspace-tab"
          :class="{ 'is-active': item.id === currentPage }"
          @click="$emit('change', item.id)"
        >
          <span>{{ item.label }}</span>
          <small>{{ item.description }}</small>
        </button>
      </div>
    </div>
  </nav>
</template>

<script setup>
defineProps({
  items: {
    type: Array,
    required: true,
  },
  currentPage: {
    type: String,
    required: true,
  },
})

defineEmits(['change'])
</script>
