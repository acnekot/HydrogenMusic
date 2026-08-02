<template>
    <div class="dj-page">
        <div class="dj-header">
            <div class="dj-title">DJ <span>EXPERIMENTAL</span></div>
            <div class="dj-engine-status" :class="{ active: djStore.engineRunning }">
                <span class="status-dot"></span>
                {{ djStore.engineRunning ? 'ENGINE ON' : 'ENGINE OFF' }}
            </div>
            <button class="engine-button" :disabled="engineStarting" @click="toggleEngine">
                {{ engineStarting ? '启动中…' : djStore.engineRunning ? '停止引擎' : '启动引擎' }}
            </button>
            <div class="dj-master">
                <span class="master-label">MASTER</span>
                <input
                    type="range"
                    class="dj-slider master-volume"
                    min="0" max="1" step="0.01"
                    :value="djStore.masterVolume"
                    :disabled="!djStore.engineRunning"
                    @input="djStore.setMasterVolume(Number($event.target.value))"
                />
            </div>
        </div>

        <div class="experimental-notice">
            <div>
                双 Deck 音频仍是实验功能，请先降低系统音量再手动启动。VST3 托管尚未实现，相关槽位已停用。
            </div>
            <div v-if="djStore.engineInfo" class="engine-details">
                {{ djStore.engineInfo.outputDevice }} · {{ djStore.engineInfo.sampleRate }} Hz ·
                {{ djStore.engineInfo.channels }} ch
            </div>
            <div v-if="djStore.engineError" class="engine-error">{{ djStore.engineError }}</div>
        </div>

        <div class="dj-decks-row">
            <DeckPanel :deck="0" />
            <div class="dj-center-column">
                <Crossfader />
            </div>
            <DeckPanel :deck="1" />
        </div>

        <div class="dj-bottom-row">
            <EQPanel :deck="0" />
            <FXChain :deck="0" />
            <div class="dj-bottom-spacer"></div>
            <FXChain :deck="1" />
            <EQPanel :deck="1" />
        </div>
    </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { useDjStore } from '../store/djStore'
import DeckPanel from '../components/dj/DeckPanel.vue'
import Crossfader from '../components/dj/Crossfader.vue'
import EQPanel from '../components/dj/EQPanel.vue'
import FXChain from '../components/dj/FXChain.vue'

const djStore = useDjStore()
const engineStarting = ref(false)

async function toggleEngine() {
    if (djStore.engineRunning) {
        await djStore.stopEngine()
        return
    }
    engineStarting.value = true
    try {
        await djStore.startEngine()
    } finally {
        engineStarting.value = false
    }
}

onMounted(() => {
    if (djStore.engineRunning) djStore._startPositionPolling()
})

onUnmounted(() => {
    djStore._stopPositionPolling()
})
</script>

<style lang="scss" scoped>
.dj-page {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--bg);
    color: var(--text);
    overflow: hidden;
    padding: 8px;
    gap: 6px;
    box-sizing: border-box;
}

.dj-header {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 4px 8px;
    flex-shrink: 0;
}

.dj-title {
    font-family: 'Gilroy-ExtraBold', sans-serif;
    font-size: 20px;
    letter-spacing: 2px;

    span {
        margin-left: 5px;
        color: #ffb347;
        font-size: 9px;
        letter-spacing: 1px;
        vertical-align: middle;
    }
}

.engine-button {
    border: 1px solid var(--border);
    border-radius: 5px;
    padding: 4px 10px;
    background: var(--layer);
    color: var(--text);
    cursor: pointer;

    &:disabled {
        cursor: wait;
        opacity: 0.6;
    }
}

.experimental-notice {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 8px;
    border: 1px solid rgba(255, 179, 71, 0.35);
    border-radius: 6px;
    background: rgba(255, 179, 71, 0.08);
    color: var(--muted-text);
    font-size: 10px;
    flex-shrink: 0;
}

.engine-details {
    margin-left: auto;
    white-space: nowrap;
    color: var(--text);
}

.engine-error {
    color: #ff6666;
}

.dj-engine-status {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--muted-text);
    letter-spacing: 1px;

    .status-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #ff4444;
        transition: background 0.3s;
    }

    &.active .status-dot {
        background: #44ff44;
        box-shadow: 0 0 6px #44ff44;
    }
}

.dj-master {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 8px;

    .master-label {
        font-size: 10px;
        letter-spacing: 1px;
        color: var(--muted-text);
    }

    .master-volume {
        width: 100px;
    }
}

.dj-decks-row {
    display: flex;
    flex: 1;
    gap: 6px;
    min-height: 0;
}

.dj-center-column {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    width: 80px;
    flex-shrink: 0;
}

.dj-bottom-row {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
    height: 120px;
}

.dj-bottom-spacer {
    flex: 0 0 80px;
}

// 通用 DJ 滑块样式
.dj-slider {
    -webkit-appearance: none;
    appearance: none;
    height: 4px;
    background: var(--layer);
    border-radius: 2px;
    outline: none;
    cursor: pointer;

    &::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: var(--text);
        cursor: pointer;
        transition: transform 0.1s;
    }

    &::-webkit-slider-thumb:hover {
        transform: scale(1.3);
    }
}
</style>
