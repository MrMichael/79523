<template>
  <div class="sound">
    <button class="sound-btn" :title="muted ? '音效已静音' : '音效设置'" @click="open = !open">
      {{ muted ? '🔇' : '🔊' }}
    </button>
    <div v-if="open" class="sound-panel">
      <label class="sound-row">
        <input type="checkbox" :checked="!muted" @change="onToggle" />
        <span>音效</span>
      </label>
      <input
        class="sound-range"
        type="range"
        min="0"
        max="100"
        step="5"
        :value="Math.round(volume * 100)"
        :disabled="muted"
        aria-label="音效音量"
        @input="onVolume"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { muted, volume, setMuted, setVolume } from '@/audio'

const open = ref(false)

function onToggle(e: Event) {
  setMuted(!(e.target as HTMLInputElement).checked)
}
function onVolume(e: Event) {
  setVolume(Number((e.target as HTMLInputElement).value) / 100)
}
</script>

<style scoped>
.sound { position: relative; }
.sound-btn {
  padding: 0.35rem 0.6rem; font-size: 0.95rem; line-height: 1;
  border: 1px solid rgba(255,255,255,0.12); border-radius: 8px;
  background: rgba(255,255,255,0.05); cursor: pointer;
}
.sound-btn:hover { border-color: rgba(255,255,255,0.3); }
.sound-panel {
  position: absolute; right: 0; top: calc(100% + 6px); z-index: 120;
  display: flex; flex-direction: column; gap: 0.5rem;
  padding: 0.6rem 0.7rem; min-width: 160px;
  background: rgba(15,23,42,0.98); border: 1px solid #334155; border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.45);
}
.sound-row { display: flex; align-items: center; gap: 0.4rem; font-size: 0.8rem; color: #e2e8f0; cursor: pointer; }
.sound-range { width: 100%; accent-color: #3b82f6; }
.sound-range:disabled { opacity: 0.4; }
</style>
