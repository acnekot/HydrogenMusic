<template>
    <div class="fx-chain">
        <div class="fx-label">FX {{ deck === 0 ? 'A' : 'B' }}</div>
        <div class="fx-slots">
            <div
                class="fx-slot"
                v-for="(slot, i) in deckData.fxChain"
                :key="i"
                :class="{ active: slot.active }"
            >
                <div class="fx-slot-name" @click="openBrowser(i)">
                    {{ slot.pluginName || `SLOT ${i + 1}` }}
                </div>
                <input
                    v-if="slot.active"
                    type="range"
                    class="fx-drywet"
                    min="0" max="1" step="0.01"
                    :value="slot.dryWet"
                    @input="handleDryWet(i, $event)"
                />
                <button
                    v-if="slot.active"
                    class="fx-remove-btn"
                    @click="djStore.unloadFx(deck, i)"
                    title="移除插件"
                >×</button>
            </div>
        </div>
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

function openBrowser(slot) {
    djStore.openVstBrowser(props.deck, slot)
}

function handleDryWet(slot, e) {
    djStore.setFxDryWet(props.deck, slot, Number(e.target.value))
}
</script>

<style lang="scss" scoped>
.fx-chain {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: var(--panel);
    border-radius: 6px;
    padding: 6px 8px;
    gap: 4px;
}

.fx-label {
    font-size: 10px;
    letter-spacing: 1px;
    color: var(--muted-text);
}

.fx-slots {
    display: flex;
    flex-direction: column;
    gap: 3px;
    flex: 1;
}

.fx-slot {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 6px;
    background: var(--layer);
    border-radius: 4px;
    min-height: 20px;

    &.active {
        background: rgba(255, 255, 255, 0.12);
    }
}

.fx-slot-name {
    font-size: 10px;
    flex: 1;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--muted-text);

    .active & {
        color: var(--text);
    }

    &:hover {
        text-decoration: underline;
    }
}

.fx-drywet {
    -webkit-appearance: none;
    appearance: none;
    width: 50px;
    height: 3px;
    background: var(--border);
    border-radius: 2px;
    outline: none;
    cursor: pointer;

    &::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--text);
    }
}

.fx-remove-btn {
    background: none;
    border: none;
    color: var(--muted-text);
    font-size: 14px;
    cursor: pointer;
    padding: 0 2px;
    line-height: 1;

    &:hover {
        color: #ff4444;
    }
}
</style>
