<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { usePlayerStore } from '../store/playerStore'

const FFT_SIZE = 2048
const RETRY_ATTACH_LIMIT = 16
const EMPTY_FRAME_LIMIT = 90
const REATTACH_COOLDOWN_MS = 1200
const MIN_LEVEL = 0.012

const playerStore = usePlayerStore()
const {
    currentMusic,
    playing,
    lyricVisualizer,
    lyricVisualizerHeight,
    lyricVisualizerFrequencyMin,
    lyricVisualizerFrequencyMax,
    lyricVisualizerTransitionDelay,
    lyricVisualizerBarCount,
    lyricVisualizerBarWidth,
    lyricVisualizerColor,
    lyricVisualizerOpacity,
    lyricVisualizerStyle,
    lyricVisualizerRadialSize,
    lyricVisualizerRadialOffsetX,
    lyricVisualizerRadialOffsetY,
    lyricVisualizerRadialCoreSize,
    videoIsPlaying,
} = storeToRefs(playerStore)

const canvasRef = ref(null)
const visible = computed(() => (
    lyricVisualizer.value
    && !!currentMusic.value
    && !videoIsPlaying.value
))
const rootStyle = computed(() => ({
    height: `${lyricVisualizerHeight.value}px`,
    opacity: Math.max(0, Math.min(100, Number(lyricVisualizerOpacity.value) || 0)) / 100,
}))

let analyser = null
let analyserData = null
let analyserSource = null
let analyserConnectionOwned = false
let attachedPlayback = null
let animationFrame = 0
let attachTimer = 0
let retryCount = 0
let emptyFrames = 0
let lastReattachAt = 0
let mediaAudioContext = null
let mediaStream = null
let playbackEventCleanup = null
let resizeObserver = null
let levels = new Float32Array(0)

function getBarCount() {
    return Math.max(8, Math.min(128, Math.round(Number(lyricVisualizerBarCount.value) || 48)))
}

function ensureLevels() {
    const count = getBarCount()
    if (levels.length === count) return
    levels = new Float32Array(count)
    levels.fill(MIN_LEVEL)
}

function clearAttachTimer() {
    if (!attachTimer) return
    window.clearTimeout(attachTimer)
    attachTimer = 0
}

function clearPlaybackEventListeners() {
    playbackEventCleanup?.()
    playbackEventCleanup = null
}

function disconnectAnalyser() {
    clearAttachTimer()
    if (analyserConnectionOwned && analyserSource && analyser) {
        try { analyserSource.disconnect(analyser) } catch (_) {}
    }
    analyser = null
    analyserData = null
    analyserSource = null
    analyserConnectionOwned = false
    mediaStream = null
    emptyFrames = 0
}

function resetAnalyser({ keepPlayback = false } = {}) {
    disconnectAnalyser()
    retryCount = 0
    if (keepPlayback) return
    clearPlaybackEventListeners()
    attachedPlayback = null
}

function closeMediaAudioContext() {
    if (!mediaAudioContext) return
    const context = mediaAudioContext
    mediaAudioContext = null
    void context.close().catch(() => {})
}

function configureAnalyser(node) {
    node.fftSize = FFT_SIZE
    node.smoothingTimeConstant = 0.82
    node.minDecibels = -92
    node.maxDecibels = -18
    return node
}

function useConnectedAnalyser(source, node, { ownsConnection = true } = {}) {
    analyserSource = source || null
    analyserConnectionOwned = ownsConnection
    analyser = configureAnalyser(node)
    analyserData = new Uint8Array(analyser.frequencyBinCount)
    retryCount = 0
    return analyser
}

function getWebAudioAnalyser(playback) {
    const context = playback?._context
    const gain = playback?._gain
    if (!context || !gain || typeof context.createAnalyser !== 'function') return null
    const node = configureAnalyser(context.createAnalyser())
    gain.connect(node)
    return useConnectedAnalyser(gain, node)
}

function getHowlBufferAnalyser(playback) {
    const sounds = Array.isArray(playback?._sounds) ? playback._sounds : []
    const source = sounds.find(sound => sound?._node?.bufferSource)?._node?.bufferSource
    const context = source?.context
    if (!source || !context || typeof context.createAnalyser !== 'function') return null
    const node = configureAnalyser(context.createAnalyser())
    source.connect(node)
    return useConnectedAnalyser(source, node)
}

function getHowlMediaElement(playback) {
    const sounds = Array.isArray(playback?._sounds) ? playback._sounds : []
    const MediaElement = typeof HTMLMediaElement === 'undefined' ? null : HTMLMediaElement
    return sounds
        .map(sound => sound?._node)
        .find(node => node && (
            (MediaElement && node instanceof MediaElement)
            || typeof node.captureStream === 'function'
            || typeof node.mozCaptureStream === 'function'
        )) || null
}

function getMediaStreamAnalyser(playback) {
    const mediaElement = getHowlMediaElement(playback)
    const capture = mediaElement?.captureStream || mediaElement?.mozCaptureStream
    if (!mediaElement || typeof capture !== 'function') return null

    const stream = capture.call(mediaElement)
    if (!stream?.getAudioTracks?.().some(track => track.readyState === 'live')) return null

    const AudioContextCtor = window.AudioContext || window.webkitAudioContext
    if (!AudioContextCtor) return null
    if (!mediaAudioContext || mediaAudioContext.state === 'closed') {
        mediaAudioContext = new AudioContextCtor()
    }
    if (mediaAudioContext.state === 'suspended') {
        void mediaAudioContext.resume().catch(() => {})
    }

    const source = mediaAudioContext.createMediaStreamSource(stream)
    const node = configureAnalyser(mediaAudioContext.createAnalyser())
    source.connect(node)
    mediaStream = stream
    return useConnectedAnalyser(source, node)
}

function getHifiAnalyser(playback) {
    if (playback?.__hmHifiOutputPlayer !== true) return null
    const existing = playback.getAnalyser?.()
    if (existing) return useConnectedAnalyser(null, existing, { ownsConnection: false })

    const preparePromise = playback.prepareAnalyser?.()
    if (preparePromise?.then) {
        preparePromise
            .then(() => {
                if (visible.value && currentMusic.value === playback) refreshAnalyser(playback)
            })
            .catch(() => {})
    }
    return null
}

function bindPlaybackEvents(playback) {
    clearPlaybackEventListeners()
    if (typeof playback?.on !== 'function') return
    const refresh = () => refreshAnalyser(playback)
    playback.on('play', refresh)
    playbackEventCleanup = () => {
        try { playback.off?.('play', refresh) } catch (_) {}
    }
}

function tryAttachAnalyser() {
    clearAttachTimer()
    if (!visible.value) return
    const playback = currentMusic.value
    if (!playback) return

    if (attachedPlayback !== playback) {
        resetAnalyser()
        attachedPlayback = playback
        bindPlaybackEvents(playback)
    }

    try {
        if (playback.__hmHifiOutputPlayer) getHifiAnalyser(playback)
        else if (playback.__hmWebAudioPlayer) getWebAudioAnalyser(playback)
        else getHowlBufferAnalyser(playback) || getMediaStreamAnalyser(playback)
    } catch (_) {
        disconnectAnalyser()
    }

    if (!analyser && retryCount < RETRY_ATTACH_LIMIT) {
        retryCount += 1
        attachTimer = window.setTimeout(tryAttachAnalyser, 250)
    }
}

function refreshAnalyser(playback = currentMusic.value) {
    if (!visible.value || currentMusic.value !== playback) return
    resetAnalyser({ keepPlayback: true })
    attachedPlayback = playback
    tryAttachAnalyser()
    requestDraw()
}

function resizeCanvas() {
    const canvas = canvasRef.value
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const ratio = Math.min(2, Math.max(1, window.devicePixelRatio || 1))
    const width = Math.max(1, Math.round(rect.width * ratio))
    const height = Math.max(1, Math.round(rect.height * ratio))
    if (canvas.width !== width) canvas.width = width
    if (canvas.height !== height) canvas.height = height
    const context = canvas.getContext('2d')
    context?.setTransform(ratio, 0, 0, ratio, 0, 0)
}

function sampleSpectrum() {
    if (!analyser || !analyserData || !playing.value) return false
    try {
        analyser.getByteFrequencyData(analyserData)
    } catch (_) {
        disconnectAnalyser()
        return false
    }

    ensureLevels()
    const sampleRate = Number(analyser.context?.sampleRate) || 44100
    const nyquist = sampleRate / 2
    const minFrequency = Math.max(20, Math.min(nyquist, Number(lyricVisualizerFrequencyMin.value) || 20))
    const maxFrequency = Math.max(minFrequency + 1, Math.min(nyquist, Number(lyricVisualizerFrequencyMax.value) || 8000))
    const smoothing = Math.max(0.05, Math.min(1, 1 - Number(lyricVisualizerTransitionDelay.value || 0)))
    let total = 0

    for (let index = 0; index < levels.length; index += 1) {
        const position = levels.length <= 1 ? 0 : index / (levels.length - 1)
        const frequency = minFrequency * Math.pow(maxFrequency / minFrequency, position)
        const bin = Math.max(0, Math.min(analyserData.length - 1, Math.round((frequency / nyquist) * analyserData.length)))
        const start = Math.max(0, bin - 1)
        const end = Math.min(analyserData.length - 1, bin + 1)
        let sum = 0
        for (let sample = start; sample <= end; sample += 1) sum += analyserData[sample]
        const raw = sum / (end - start + 1) / 255
        const target = Math.max(MIN_LEVEL, Math.pow(raw, 0.72))
        levels[index] += (target - levels[index]) * smoothing
        total += raw
    }
    return total / Math.max(1, levels.length) > 0.002
}

function settleLevels() {
    ensureLevels()
    let active = false
    for (let index = 0; index < levels.length; index += 1) {
        const delta = MIN_LEVEL - levels[index]
        levels[index] += delta * 0.16
        if (Math.abs(delta) > 0.002) active = true
    }
    return active
}

function getDrawColor() {
    const value = lyricVisualizerColor.value
    if (value === 'white') return '#ffffff'
    if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) return value
    return '#000000'
}

function drawBars(context, width, height) {
    const slotWidth = width / Math.max(1, levels.length)
    const fillRatio = Math.max(0.1, Math.min(1, Number(lyricVisualizerBarWidth.value || 55) / 100))
    const barWidth = Math.max(1, slotWidth * fillRatio)
    for (let index = 0; index < levels.length; index += 1) {
        const barHeight = Math.max(1, levels[index] * height * 0.94)
        const x = index * slotWidth + (slotWidth - barWidth) / 2
        context.fillRect(x, height - barHeight, barWidth, barHeight)
    }
}

function drawRadial(context, width, height) {
    const size = Math.max(0.2, Math.min(2, Number(lyricVisualizerRadialSize.value || 100) / 100))
    const outerRadius = Math.min(width, height) * 0.46 * size
    const coreRatio = Math.max(0.1, Math.min(0.95, Number(lyricVisualizerRadialCoreSize.value || 62) / 100))
    const innerRadius = outerRadius * coreRatio
    const amplitude = Math.max(2, outerRadius - innerRadius)
    const offsetX = Math.max(-1, Math.min(1, Number(lyricVisualizerRadialOffsetX.value || 0) / 100))
    const offsetY = Math.max(-1, Math.min(1, Number(lyricVisualizerRadialOffsetY.value || 0) / 100))
    const centerX = width / 2 + width * 0.32 * offsetX
    const centerY = height / 2 + height * 0.32 * offsetY
    const circumferenceSlot = (Math.PI * 2 * innerRadius) / Math.max(1, levels.length)
    context.lineWidth = Math.max(1, circumferenceSlot * Math.max(0.1, Math.min(1, Number(lyricVisualizerBarWidth.value || 55) / 100)))
    context.lineCap = 'round'

    for (let index = 0; index < levels.length; index += 1) {
        const angle = -Math.PI / 2 + (index / levels.length) * Math.PI * 2
        const length = Math.max(1, levels[index] * amplitude)
        const cos = Math.cos(angle)
        const sin = Math.sin(angle)
        context.beginPath()
        context.moveTo(centerX + cos * innerRadius, centerY + sin * innerRadius)
        context.lineTo(centerX + cos * (innerRadius + length), centerY + sin * (innerRadius + length))
        context.stroke()
    }
}

function drawCanvas() {
    const canvas = canvasRef.value
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const ratio = Math.min(2, Math.max(1, window.devicePixelRatio || 1))
    const width = canvas.width / ratio
    const height = canvas.height / ratio
    context.clearRect(0, 0, width, height)
    context.fillStyle = getDrawColor()
    context.strokeStyle = getDrawColor()
    if (lyricVisualizerStyle.value === 'radial') drawRadial(context, width, height)
    else drawBars(context, width, height)
}

function requestDraw() {
    if (!visible.value || animationFrame) return
    animationFrame = window.requestAnimationFrame(drawFrame)
}

function drawFrame() {
    animationFrame = 0
    if (!visible.value) return

    const hasSignal = sampleSpectrum()
    if (playing.value && analyser && !hasSignal) {
        emptyFrames += 1
        const now = Date.now()
        if (emptyFrames >= EMPTY_FRAME_LIMIT && now - lastReattachAt >= REATTACH_COOLDOWN_MS) {
            lastReattachAt = now
            refreshAnalyser()
        }
    } else if (hasSignal) {
        emptyFrames = 0
    } else {
        settleLevels()
    }

    if (!analyser && !attachTimer && playing.value) tryAttachAnalyser()
    drawCanvas()
    if (playing.value || settleLevels()) requestDraw()
}

function start() {
    void nextTick(() => {
        if (!visible.value) return
        resizeCanvas()
        ensureLevels()
        tryAttachAnalyser()
        requestDraw()
    })
}

function stop() {
    if (animationFrame) window.cancelAnimationFrame(animationFrame)
    animationFrame = 0
    resetAnalyser()
    closeMediaAudioContext()
    const context = canvasRef.value?.getContext('2d')
    context?.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height)
}

watch(visible, active => {
    if (active) start()
    else stop()
}, { immediate: true })

watch(currentMusic, () => {
    resetAnalyser()
    if (visible.value) start()
})

watch(playing, active => {
    if (active && visible.value) start()
    else if (visible.value) requestDraw()
})

watch(
    [
        lyricVisualizerHeight,
        lyricVisualizerBarCount,
        lyricVisualizerBarWidth,
        lyricVisualizerStyle,
        lyricVisualizerRadialSize,
        lyricVisualizerRadialOffsetX,
        lyricVisualizerRadialOffsetY,
        lyricVisualizerRadialCoreSize,
    ],
    () => {
        ensureLevels()
        void nextTick(() => {
            resizeCanvas()
            drawCanvas()
        })
    }
)

onMounted(() => {
    resizeCanvas()
    if (typeof ResizeObserver !== 'undefined' && canvasRef.value) {
        resizeObserver = new ResizeObserver(() => {
            resizeCanvas()
            drawCanvas()
        })
        resizeObserver.observe(canvasRef.value)
    }
})

onBeforeUnmount(() => {
    stop()
    resizeObserver?.disconnect()
    resizeObserver = null
})
</script>

<template>
    <div v-show="visible" class="lyric-visualizer" :style="rootStyle" aria-hidden="true">
        <canvas ref="canvasRef"></canvas>
    </div>
</template>

<style scoped>
.lyric-visualizer {
    position: absolute;
    right: 1.5vh;
    bottom: 1.5vh;
    left: 1.5vh;
    z-index: 0;
    overflow: hidden;
    pointer-events: none;
    transition: height 0.25s ease, opacity 0.25s ease;
    contain: strict;
}

canvas {
    display: block;
    width: 100%;
    height: 100%;
}
</style>
