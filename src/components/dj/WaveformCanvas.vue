<template>
    <canvas
        ref="canvasRef"
        class="waveform-canvas"
        @click="handleClick"
        @mousedown="handleMouseDown"
    ></canvas>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'

const props = defineProps({
    waveform: { type: Array, default: null },
    position: { type: Number, default: 0 },
    duration: { type: Number, default: 0 },
    cues: { type: Array, default: () => [null, null, null, null] },
    loopStart: { type: Number, default: null },
    loopEnd: { type: Number, default: null },
    playing: { type: Boolean, default: false },
})

const emit = defineEmits(['seek'])

const canvasRef = ref(null)
let animFrameId = null
let resizeObserver = null

const CUE_COLORS = ['#ff4444', '#44aaff', '#ffaa00', '#44ff44']
const WAVEFORM_COLOR_TOP = 'rgba(100, 180, 255, 0.85)'
const WAVEFORM_COLOR_BOTTOM = 'rgba(60, 120, 200, 0.5)'
const PLAYED_COLOR_TOP = 'rgba(200, 220, 255, 0.95)'
const PLAYED_COLOR_BOTTOM = 'rgba(140, 180, 240, 0.7)'

function draw() {
    const canvas = canvasRef.value
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    const { width, height } = canvas
    const waveform = props.waveform
    const posRatio = props.duration > 0 ? props.position / props.duration : 0

    // 清空
    ctx.clearRect(0, 0, width, height)

    // 背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
    ctx.fillRect(0, 0, width, height)

    if (!waveform || waveform.length === 0) {
        animFrameId = null
        return
    }

    const barCount = waveform.length
    const barWidth = width / barCount
    const halfH = height / 2

    // 循环区间高亮
    if (props.loopStart !== null && props.loopEnd !== null && props.duration > 0) {
        const x1 = (props.loopStart / props.duration) * width
        const x2 = (props.loopEnd / props.duration) * width
        ctx.fillStyle = 'rgba(100, 255, 100, 0.08)'
        ctx.fillRect(x1, 0, x2 - x1, height)
    }

    // 绘制波形
    const playedBarIndex = Math.floor(posRatio * barCount)

    for (let i = 0; i < barCount; i++) {
        const val = waveform[i] || 0
        const barH = val * halfH * 0.9

        const x = i * barWidth
        const isPlayed = i <= playedBarIndex

        // 上半波形
        ctx.fillStyle = isPlayed ? PLAYED_COLOR_TOP : WAVEFORM_COLOR_TOP
        ctx.fillRect(x, halfH - barH, barWidth - 0.5, barH)

        // 下半波形（镜像，稍短）
        ctx.fillStyle = isPlayed ? PLAYED_COLOR_BOTTOM : WAVEFORM_COLOR_BOTTOM
        ctx.fillRect(x, halfH, barWidth - 0.5, barH * 0.6)
    }

    // 中间线
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)'
    ctx.fillRect(0, halfH - 0.5, width, 1)

    // Cue 点标记
    for (let c = 0; c < 4; c++) {
        const cuePos = props.cues[c]
        if (cuePos !== null && cuePos !== undefined && props.duration > 0) {
            const cx = (cuePos / props.duration) * width
            ctx.fillStyle = CUE_COLORS[c]
            ctx.fillRect(cx - 1, 0, 2, height)

            // 标签
            ctx.font = '9px sans-serif'
            ctx.fillText(String.fromCharCode(65 + c), cx + 3, 10)
        }
    }

    // 播放头
    const playheadX = posRatio * width
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(playheadX - 1, 0, 2, height)

    // 如果正在播放，持续动画
    if (props.playing) {
        animFrameId = requestAnimationFrame(draw)
    } else {
        animFrameId = null
    }
}

function handleClick(e) {
    const canvas = canvasRef.value
    if (!canvas || !props.duration) return
    const rect = canvas.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    emit('seek', Math.max(0, Math.min(1, ratio)))
}

function handleMouseDown(e) {
    if (e.button !== 0) return
    const canvas = canvasRef.value
    if (!canvas || !props.duration) return

    const onMouseMove = (me) => {
        const rect = canvas.getBoundingClientRect()
        const ratio = (me.clientX - rect.left) / rect.width
        emit('seek', Math.max(0, Math.min(1, ratio)))
    }

    const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
}

function resizeCanvas() {
    const canvas = canvasRef.value
    if (!canvas) return
    const parent = canvas.parentElement
    if (!parent) return

    const dpr = window.devicePixelRatio || 1
    const w = parent.clientWidth
    const h = parent.clientHeight || 80

    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = w + 'px'
    canvas.style.height = h + 'px'

    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)
    // canvas 的 width/height 是逻辑坐标，draw() 中直接用它们
    // 重置为逻辑尺寸
    canvas.width = w
    canvas.height = h

    draw()
}

onMounted(() => {
    nextTick(() => {
        resizeCanvas()
    })

    resizeObserver = new ResizeObserver(() => resizeCanvas())
    if (canvasRef.value?.parentElement) {
        resizeObserver.observe(canvasRef.value.parentElement)
    }
})

onUnmounted(() => {
    if (animFrameId) cancelAnimationFrame(animFrameId)
    if (resizeObserver) resizeObserver.disconnect()
})

watch(() => props.waveform, () => draw())
watch(() => props.position, () => {
    if (!props.playing && !animFrameId) draw()
})
watch(() => props.playing, (val) => {
    if (val && !animFrameId) {
        animFrameId = requestAnimationFrame(draw)
    }
})
</script>

<style lang="scss" scoped>
.waveform-canvas {
    width: 100%;
    flex: 1;
    min-height: 60px;
    border-radius: 4px;
    cursor: crosshair;
    display: block;
}
</style>
