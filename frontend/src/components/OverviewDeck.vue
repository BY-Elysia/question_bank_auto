<template>
  <section class="overview-grid">
    <article
      v-for="item in items"
      :key="item.id"
      class="overview-card liquid-panel"
      :class="`tone-${item.tone || 'clear'}`"
    >
      <div class="liquid-panel__inner overview-card__inner">
        <p class="overview-card__eyebrow">{{ item.eyebrow }}</p>
        <h3 class="overview-card__title">{{ item.title }}</h3>
        <p class="overview-card__description">{{ item.description }}</p>
        <div class="overview-card__meta">
          <strong>{{ item.value }}</strong>
          <span>{{ item.hint }}</span>
        </div>
        <button class="secondary-button" @click="$emit('jump', item.id)">
          前往 {{ item.buttonLabel || item.title }}
        </button>
      </div>
    </article>
  </section>
</template>

<script setup>
defineProps({
  items: {
    type: Array,
    required: true,
  },
})

defineEmits(['jump'])
</script>
