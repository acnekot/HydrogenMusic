<template>
    <div class="cue-buttons">
        <button
            v-for="(cue, i) in deckData.cues"
            :key="i"
            class="cue-btn"
            :class="{ set: cue !== null }"
            :style="{ '--cue-color': CUE_COLORS[i] }"
            @click="handleCueClick(i)"
            @dblclick="handleCueDblClick(i)"
            :title="`Cue ${labels[i]} — 单击设置/跳转，双击清除`"
        >
            {{ labels[i] }}
        </button>
    </div>
</template>

<script setup>
import { computed } from 'vue'
import { useDjStore } from '../../store/djStore'

const props = defineProps({
    deck: { type: Number, required: true },
})

const djStore = useDjStore()
const deckData = computed(() => djStore.decks[props.deck])

const labels = ['A', 'B', 'C', 'D']
const CUE_COLORS = ['#ff4444', '#44aaff', '#ffaa00', '#44ff44']

function handleCueClick(index) {
    if (deckData.value.cues[index] !== null) {
        djStore.jumpToCue(props.deck, index)
    } else {
        djStore.setCue(props.deck, index)
    }
}

function handleCueDblClick(index) {
    // 双击清除 cue 点
    deckData.value.cues[index] = null
}
</script>

<style lang="scss" scoped>
.cue-buttons {
    display: flex;
    gap: 4px;
}

.cue-btn {
    flex: 1;
    height: 24px;
    border: 1px solid var(--border);
    border-radius: 3px;
    background: var(--layer);
    color: var(--muted-text);
    font-family: 'Gilroy-ExtraBold', sans-serif;
    font-size: 11px;
    letter-spacing: 1px;
    cursor: pointer;
    transition: all 0.15s;

    &.set {
        border-color: var(--cue-color);
        color: var(--cue-color);
        background: rgba(255, 255, 255, 0.05);
    }

    &:hover {
        background: var(--border);
    }

    &:active {
        transform: scale(0.95);
    }
}
</style>
