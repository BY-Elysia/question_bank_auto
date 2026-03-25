<template>
  <section v-if="items.length" class="overview-launchpad">
    <aside
      class="overview-stage__rail overview-stage__rail--launchpad"
      :class="side === 'right' ? 'is-right' : 'is-left'"
      :style="{ '--launchpad-count': items.length }"
      :aria-label="side === 'right' ? '右侧工作台入口' : '左侧工作台入口'"
    >
      <button
        v-for="(item, index) in items"
        :key="item.id"
        type="button"
        class="overview-stage-card overview-stage-card--launchpad"
        :class="[{ 'is-active': item.id === currentPage }, `tone-${item.tone || 'clear'}`]"
        :style="{
          '--stage-z': `${item.id === currentPage ? items.length + 2 : items.length - index}`,
          '--stage-offset': `${item.id === currentPage ? 0 : side === 'right' ? '18px' : '-18px'}`,
        }"
        :aria-current="item.id === currentPage ? 'page' : null"
        @click="$emit('jump', item.id)"
      >
        <div class="overview-stage-card__traffic" aria-hidden="true">
          <span class="overview-stage-card__dot is-red"></span>
          <span class="overview-stage-card__dot is-amber"></span>
          <span class="overview-stage-card__dot is-green"></span>
        </div>
        <div class="overview-stage-card__screen">
          <strong class="overview-stage-card__launchpad-title">{{ item.title }}</strong>
        </div>
      </button>
    </aside>
  </section>

  <section v-else class="overview-grid overview-grid--empty">
    <div class="empty-state">
      <strong>暂无工作台入口</strong>
      <span>等状态加载完成后，这里会显示可以进入的处理工作台。</span>
    </div>
  </section>
</template>

<script setup>
defineProps({
  items: {
    type: Array,
    required: true,
  },
  currentPage: {
    type: String,
    default: '',
  },
  side: {
    type: String,
    default: 'left',
  },
})

defineEmits(['jump'])
</script>
