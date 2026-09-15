<template>
  <div class="player-slot" :class="{ active: isActive, highest: isHighest, offline: !connected }" :style="color ? { borderColor: color } : undefined">
    <div class="name" :style="color ? { color } : undefined">{{ name }}{{ isHighest ? ' 👑' : '' }}</div>
    <div class="cards-face-down" :class="{ dim: !connected }">
      <div v-for="i in cardCount" :key="i" class="card-back"></div>
    </div>
    <div v-if="!connected" class="offline-badge" title="离线，由系统自动托管">🤖 托管</div>
    <div class="meta"><span class="count">{{ cardCount }}张</span> · <span class="score">{{ score }}分</span></div>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{ name: string; cardCount: number; score: number; isActive: boolean; isHighest?: boolean; color?: string; connected?: boolean }>(),
  { connected: true }
)
</script>

<style scoped>
.player-slot { display: flex; flex-direction: column; align-items: center; gap: 0.25rem; padding: 0.5rem 0.75rem; border-radius: 10px; min-width: 70px; border: 1px solid transparent; }
.player-slot.active { background: rgba(251,191,36,0.1); border: 1px solid rgba(251,191,36,0.2); }
.name { font-weight: 700; font-size: 0.85rem; color: #e2e8f0; }
.cards-face-down { display: flex; gap: 2px; justify-content: center; }
.cards-face-down.dim { filter: grayscale(0.7); opacity: 0.5; }
.card-back { width: 22px; height: 32px; background: linear-gradient(135deg, #1e3a5f, #3b82f6); border-radius: 3px; border: 1px solid #1e3a5f; }
.score { font-size: 0.75rem; color: #94a3b8; font-weight: 600; }
.meta { font-size: 0.75rem; color: #94a3b8; font-weight: 600; }
.meta .count { color: #cbd5e1; }
.player-slot.highest { background: rgba(251,191,36,0.12); border: 1px solid rgba(251,191,36,0.3); }
.player-slot.highest .score { color: #fbbf24; }

/* Disconnected player */
.player-slot.offline { opacity: 0.75; border-color: rgba(239,68,68,0.35) !important; background: rgba(239,68,68,0.06); }
.player-slot.offline .name { color: #94a3b8; }
.offline-badge {
  font-size: 0.68rem; font-weight: 700; color: #93c5fd;
  background: rgba(96,165,250,0.15); border: 1px solid rgba(96,165,250,0.4);
  border-radius: 6px; padding: 0 0.35rem; line-height: 1.4;
}
</style>
