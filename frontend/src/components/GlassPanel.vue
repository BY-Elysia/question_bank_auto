<template>
  <section class="liquid-panel" :class="[`tone-${tone}`, { 'is-prominent': prominent }]">
    <div class="liquid-panel__inner">
      <div class="panel-head" v-if="eyebrow || title || description">
        <p v-if="eyebrow" class="panel-eyebrow">{{ eyebrow }}</p>
        <div class="panel-title-row">
          <div>
            <h2 v-if="title" class="panel-title">{{ title }}</h2>
            <p v-if="description" class="panel-description">{{ description }}</p>
          </div>
          <slot name="meta" />
        </div>
      </div>
      <slot />
    </div>
  </section>
</template>

<script setup>
defineProps({
  eyebrow: {
    type: String,
    default: '',
  },
  title: {
    type: String,
    default: '',
  },
  description: {
    type: String,
    default: '',
  },
  tone: {
    type: String,
    default: 'ice',
  },
  prominent: {
    type: Boolean,
    default: false,
  },
})
</script>
