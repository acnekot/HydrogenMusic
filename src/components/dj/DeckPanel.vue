<template>
    <div class="deck-panel" :class="{ 'deck-playing': deckData.playing }">
        <div class="deck-label">DECK {{ deck === 0 ? 'A' : 'B' }}</div>

        <!-- 歌曲信息 -->
        <div class="deck-track-info">
            <div class="track-title" :title="deckData.title">{{ deckData.title || '—' }}</div>
            <div class="track-artist">{{ deckData.artist || '' }}</div>
        </div>

        <!-- 波形 -->
        <WaveformCanvas
            :waveform="deckData.waveform"
            :position="deckData.position"
            :duration="deckData.duration"
            :cues="deckData.cues"
            :loopStart="deckData.loopStart"
            :loopEnd="deckData.loopEnd"
            :playing="deckData.playing"
            @seek="handleSeek"
        />

        <!-- BPM + 传输控制 -->
        <div class="deck-controls">
            <div class="deck-bpm">
                <span class="bpm-value">{{ deckData.bpm ? deckData.bpm.toFixed(1) : '—' }}</span>
                <span class="bpm-label">BPM</span>
                <button class="dj-btn sync-btn" @click="handleSync" title="同步BPM">SYNC</button>
            </div>

            <div class="transport-buttons">
                <button class="dj-btn" @click="handleCuePlay" title="Cue 播放">⏮</button>
                <button
                    class="dj-btn play-btn"
                    :class="{ active: deckData.playing }"
                    @click="handlePlayPause"
                >
                    {{ deckData.playing ? '⏸' : '▶' }}
                </button>
                <button class="dj-btn" @click="djStore.stopDeck(deck)" title="停止">⏹</button>
            </div>

            <div class="deck-time">
                {{ formatTime(deckData.position, deckData.duration) }}
            </div>
        </div>

        <!-- Cue 点按钮 -->
        <CueButtons :deck="deck" />

        <!-- 拖放区 -->
        <div
            v-if="!deckData.loaded"
            class="deck-dropzone"
            @dragover.prevent
            @drop.prevent="handleDrop"
            @click="handleBrowse"
        >
            拖放音频文件或点击选择
        </div>
    </div>
</template>

<script setup>
import { computed } from 'vue'
import { useDjStore } from '../../store/djStore'
import WaveformCanvas from './WaveformCanvas.vue'
import CueButtons from './CueButtons.vue'

const props = defineProps({
    deck: { type: Number, required: true },
})

const djStore = useDjStore()
const deckData = computed(() => djStore.decks[props.deck])

function formatTime(positionSamples, durationSamples) {
    if (!durationSamples) return '0:00 / 0:00'
    const sr = 44100
    const posSec = positionSamples / sr
    const durSec = durationSamples / sr
    const fmt = (sec) => {
        const m = Math.floor(sec / 60)
        const s = Math.floor(sec % 60).toString().padStart(2, '0')
        return `${m}:${s}`
    }
    return `${fmt(posSec)} / ${fmt(durSec)}`
}

async function handlePlayPause() {
    if (deckData.value.playing) {
        await djStore.pauseDeck(props.deck)
    } else {
        await djStore.playDeck(props.deck)
    }
}

function handleSeek(positionRatio) {
    const samples = Math.floor(positionRatio * deckData.value.duration)
    djStore.seekDeck(props.deck, samples)
}

function handleCuePlay() {
    djStore.jumpToCue(props.deck, 0)
    djStore.playDeck(props.deck)
}

async function handleSync() {
    const otherDeck = props.deck === 0 ? 1 : 0
    if (djStore.decks[otherDeck].bpm) {
        await djStore.syncBpm(otherDeck, props.deck)
    }
}

async function handleDrop(e) {
    const file = e.dataTransfer?.files?.[0]
    if (!file) return
    await djStore.loadTrack(props.deck, {
        path: file.path,
        title: file.name,
    })
}

async function handleBrowse() {
    try {
        const result = await window.windowApi.openFile()
        if (result) {
            await djStore.loadTrack(props.deck, {
                path: result,
                title: result.split(/[/\\]/).pop(),
            })
        }
    } catch (_) {}
}
</script>

<style lang="scss" scoped>
.deck-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: var(--panel);
    border-radius: 8px;
    padding: 8px;
    gap: 6px;
    min-width: 0;
    position: relative;
    border: 1px solid transparent;
    transition: border-color 0.3s;

    &.deck-playing {
        border-color: rgba(255, 255, 255, 0.15);
    }
}

.deck-label {
    font-family: 'Gilroy-ExtraBold', sans-serif;
    font-size: 12px;
    letter-spacing: 2px;
    color: var(--muted-text);
}

.deck-track-info {
    .track-title {
        font-size: 14px;
        font-weight: bold;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .track-artist {
        font-size: 11px;
        color: var(--muted-text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
}

.deck-controls {
    display: flex;
    align-items: center;
    gap: 12px;
}

.deck-bpm {
    display: flex;
    align-items: baseline;
    gap: 4px;

    .bpm-value {
        font-family: 'Bender-Bold', monospace;
        font-size: 20px;
    }
    .bpm-label {
        font-size: 10px;
        color: var(--muted-text);
        letter-spacing: 1px;
    }
}

.transport-buttons {
    display: flex;
    gap: 4px;
    margin-left: auto;
}

.deck-time {
    font-family: 'Bender-Bold', monospace;
    font-size: 12px;
    color: var(--muted-text);
    letter-spacing: 0.5px;
}

.dj-btn {
    background: var(--layer);
    border: none;
    color: var(--text);
    padding: 4px 10px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    transition: background 0.15s, transform 0.1s;

    &:hover {
        background: var(--border);
    }
    &:active {
        transform: scale(0.95);
    }
    &.active {
        background: rgba(255, 255, 255, 0.25);
    }
}

.sync-btn {
    font-size: 10px;
    letter-spacing: 1px;
    padding: 2px 8px;
    margin-left: 6px;
}

.play-btn {
    min-width: 36px;
    font-size: 14px;
}

.deck-dropzone {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.6);
    border-radius: 8px;
    font-size: 13px;
    color: var(--muted-text);
    cursor: pointer;
    z-index: 10;
    transition: background 0.2s;

    &:hover {
        background: rgba(0, 0, 0, 0.75);
        color: var(--text);
    }
}
</style>
