<template>
    <div class="eq-panel">
        <div class="eq-label">EQ {{ deck === 0 ? 'A' : 'B' }}</div>
        <div class="eq-knobs">
            <div class="eq-band" v-for="band in bands" :key="band.name">
                <input
                    type="range"
                    class="eq-slider"
                    :min="-24" :max="24" step="0.5"
                    :value="deckData.eq[band.key]"
                    @input="handleEqChange(band.key, $event)"
                    orient="vertical"
                />
                <span class="eq-value">{{ formatDb(deckData.eq[band.key]) }}</span>
                <span class="eq-band-name">{{ band.name }}</span>
            </div>
            <div class="eq-band gain-band">
                <input
                    type="range"
                    class="eq-slider gain-slider"
                    min="0" max="2" step="0.01"
                    :value="deckData.gain"
                    @input="handleGainChange($event)"
                    orient="vertical"
                />
                <span class="eq-value">{{ (deckData.gain * 100).toFixed(0) }}%</span>
                <span class="eq-band-name">GAIN</span>
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

const bands = [
    { key: 'high', name: 'HI' },
    { key: 'mid', name: 'MID' },
    { key: 'low', name: 'LO' },
]

function formatDb(val) {
    const v = val || 0
    return (v >= 0 ? '+' : '') + v.toFixed(1)
}

function handleEqChange(band, e) {
    djStore.setEq(props.deck, band, Number(e.target.value))
}

function handleGainChange(e) {
    djStore.setDeckGain(props.deck, Number(e.target.value))
}
</script>

<style lang="scss" scoped>
.eq-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: var(--panel);
    border-radius: 6px;
    padding: 6px 8px;
    gap: 4px;
}

.eq-label {
    font-size: 10px;
    letter-spacing: 1px;
    color: var(--muted-text);
}

.eq-knobs {
    display: flex;
    gap: 8px;
    flex: 1;
    align-items: stretch;
}

.eq-band {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    flex: 1;
}

.eq-slider {
    writing-mode: vertical-lr;
    direction: rtl;
    -webkit-appearance: none;
    appearance: none;
    width: 4px;
    flex: 1;
    background: var(--layer);
    border-radius: 2px;
    outline: none;
    cursor: pointer;

    &::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: var(--text);
        cursor: pointer;
    }
}

.gain-slider {
    &::-webkit-slider-thumb {
        background: #ffaa00;
    }
}

.eq-value {
    font-family: 'Bender-Bold', monospace;
    font-size: 9px;
    color: var(--muted-text);
}

.eq-band-name {
    font-size: 9px;
    letter-spacing: 0.5px;
    color: var(--muted-text);
}
</style>
