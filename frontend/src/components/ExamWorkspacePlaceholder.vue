<template>
  <GlassPanel
    eyebrow="Step 02"
    title="试卷生成"
    description="试卷生成会走独立于教材的另一套逻辑。当前先把入口分流做好，后续再接试卷专属面板。"
    tone="ice"
    prominent
  >
    <div class="empty-state">
      <strong>试卷分支入口已建立</strong>
      <span>现在进入“结构化处理”时，已经可以先选择教材生成还是试卷生成。</span>
      <span>教材分支继续沿用原有流程；试卷分支后续再接试卷专属的步骤和操作面板。</span>
    </div>

    <div class="action-row">
      <button class="secondary-button" type="button" @click="$emit('back-to-kind')">返回重新选择</button>
    </div>
  </GlassPanel>
</template>

<script setup>
import GlassPanel from './GlassPanel.vue'

defineEmits(['back-to-kind'])
</script>
