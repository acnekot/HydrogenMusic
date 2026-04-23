<template>
    <div class="crossfader-container">
        <div class="cf-label">A</div>
        <input
            type="range"
            class="crossfader-slider"
            min="0" max="1" step="0.005"
            :value="djStore.crossfader"
            @input="handleInput"
        />
        <div class="cf-label">B</div>
        <div class="cf-curve-select">
            <button
                v-for="curve in curves"
                :key="curve.value"
                class="cf-curve-btn"
                :class="{ active: djStore.crossfaderCurve === curve.value }"
                @click="djStore.setCrossfaderCurve(curve.value)"
                :title="curve.label"
            >
                {{ curve.icon }}
            </button>
        </div>
    </div>
</template>

<script setup>
import { useDjStore } from '../../store/djStore'

const djStore = useDjStore()

const curves = [
    { value: 'linear', label: '线性', icon: '╱' },
    { value: 'equal-power', label: '等功率', icon: '∿' },
    { value: 'scratch', label: '硬切', icon: '⊓' },
]

function handleInput(e) {
    djStore.setCrossfader(Number(e.target.value))
}
</script>

<style lang="scss" scoped>
.crossfader-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 8px 0;
}

.cf-label {
    font-family: 'Gilroy-ExtraBold', sans-serif;
    font-size: 12px;
    color: var(--muted-text);
    letter-spacing: 1px;
}

.crossfader-slider {
    writing-mode: vertical-lr;
    direction: rtl;
    -webkit-appearance: none;
    appearance: none;
    height: 120px;
    width: 6px;
    background: var(--layer);
    border-radius: 3px;
    outline: none;
    cursor: pointer;

    &::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 20px;
        height: 10px;
        border-radius: 3px;
        background: var(--text);
        cursor: pointer;
        transition: transform 0.1s;
    }

    &::-webkit-slider-thumb:hover {
        transform: scaleX(1.2);
    }
}

.cf-curve-select {
    display: flex;
    gap: 2px;
}

.cf-curve-btn {
    background: var(--layer);
    border: none;
    color: var(--muted-text);
    width: 22px;
    height: 22px;
    border-radius: 3px;
    cursor: pointer;
    font-size: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s;

    &.active {
        background: rgba(255, 255, 255, 0.2);
        color: var(--text);
    }

    &:hover {
        background: var(--border);
    }
}
</style>
