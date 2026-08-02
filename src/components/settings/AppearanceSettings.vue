<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { usePlayerStore } from '../../store/playerStore'
import { dialogOpen } from '../../utils/dialog'
import Selector from '../Selector.vue'

const playerStore = usePlayerStore()
const searchAssistLimit = defineModel('searchAssistLimit', { default: 8 })

const visualizerDefaults = Object.freeze({
    height: 220,
    frequencyMin: 20,
    frequencyMax: 8000,
    transitionDelay: 0.75,
    barCount: 48,
    barWidth: 55,
    color: 'black',
    opacity: 100,
    style: 'bars',
    radialSize: 100,
    radialOffsetX: 0,
    radialOffsetY: 0,
    radialCoreSize: 62,
})

const backgroundDefaults = Object.freeze({
    mode: 'cover',
    blur: 0,
    brightness: 100,
    applyToChrome: true,
    applyToPlayer: true,
})

const followOptions = [
    { label: '靠上', value: 'top' },
    { label: '居中', value: 'center' },
    { label: '靠下', value: 'bottom' },
]
const visualizerStyleOptions = [
    { label: '柱状条形（默认）', value: 'bars' },
    { label: '辐射圆环', value: 'radial' },
]
const visualizerColorOptions = [
    { label: '黑色（默认）', value: 'black' },
    { label: '白色', value: 'white' },
]
const backgroundModeOptions = [
    { label: '拉伸填充', value: 'stretch' },
    { label: '等比裁剪填充（默认）', value: 'cover' },
    { label: '等比适应', value: 'contain' },
    { label: '原始尺寸居中', value: 'center' },
]
const baseZoomOptions = [0.5, 0.6, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 2, 2.5, 3]
const zoomOptions = computed(() => {
    const values = [...baseZoomOptions]
    const current = Number(playerStore.globalZoom)
    if (Number.isFinite(current) && !values.includes(current)) values.push(current)
    return values
        .sort((a, b) => a - b)
        .map(value => ({ label: `${Math.round(value * 100)}%`, value }))
})

function clampNumber(value, min, max, fallback, integer = false) {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return fallback
    const bounded = Math.min(max, Math.max(min, numeric))
    return integer ? Math.round(bounded) : bounded
}

function displayNumber(value, fractionDigits = 0) {
    if (!Number.isFinite(value)) return ''
    if (fractionDigits <= 0) return String(Math.round(value))
    return value
        .toFixed(fractionDigits)
        .replace(/\.0+$/, '')
        .replace(/(\.\d*?)0+$/, '$1')
}

function formatPreset(value, unit, defaultValue, fractionDigits = 0) {
    return `${displayNumber(value, fractionDigits)}${unit}${value === defaultValue ? '（默认）' : ''}`
}

function createPresetControl({
    storeKey,
    defaultValue,
    values,
    min,
    max,
    unit = '',
    fractionDigits = 0,
    integer = true,
}) {
    const choices = ref([...new Set([...values, defaultValue])].sort((a, b) => a - b))
    const input = ref('')
    const sanitize = value => {
        const numeric = Number(value)
        if (!Number.isFinite(numeric)) return null
        const bounded = Math.min(max, Math.max(min, numeric))
        if (integer) return Math.round(bounded)
        return Math.round(bounded * 100) / 100
    }
    const addChoice = value => {
        if (!Number.isFinite(value) || choices.value.includes(value)) return
        choices.value = [...choices.value, value].sort((a, b) => a - b)
    }
    const removeChoice = value => {
        if (value === defaultValue) return
        choices.value = choices.value.filter(item => item !== value)
    }
    const options = computed(() => choices.value.map(value => ({
        label: formatPreset(value, unit, defaultValue, fractionDigits),
        value,
    })))
    const action = computed(() => {
        const raw = String(input.value ?? '').trim()
        if (!raw) return { mode: 'add', value: null }
        const safe = sanitize(raw)
        if (!Number.isFinite(safe)) return { mode: 'add', value: null }
        return { mode: choices.value.includes(safe) ? 'remove' : 'add', value: safe }
    })
    const apply = () => {
        const { mode, value } = action.value
        if (!Number.isFinite(value)) return
        if (mode === 'remove') {
            removeChoice(value)
            if (playerStore[storeKey] === value) playerStore[storeKey] = defaultValue
        } else {
            addChoice(value)
            playerStore[storeKey] = value
        }
        input.value = ''
    }
    const reset = () => {
        playerStore[storeKey] = defaultValue
    }

    watch(
        () => playerStore[storeKey],
        value => {
            const safe = sanitize(value)
            if (!Number.isFinite(safe)) {
                if (value !== defaultValue) playerStore[storeKey] = defaultValue
                addChoice(defaultValue)
                return
            }
            if (value !== safe) playerStore[storeKey] = safe
            addChoice(safe)
        },
        { immediate: true }
    )

    return reactive({ input, options, action, apply, reset })
}

const heightControl = createPresetControl({
    storeKey: 'lyricVisualizerHeight',
    defaultValue: visualizerDefaults.height,
    values: [80, 120, 160, 180, 200, 220, 260, 320, 400, 480],
    min: 80,
    max: 480,
    unit: 'px',
})
const barCountControl = createPresetControl({
    storeKey: 'lyricVisualizerBarCount',
    defaultValue: visualizerDefaults.barCount,
    values: [8, 16, 24, 32, 48, 64, 96, 128],
    min: 8,
    max: 128,
    unit: ' 个',
})
const barWidthControl = createPresetControl({
    storeKey: 'lyricVisualizerBarWidth',
    defaultValue: visualizerDefaults.barWidth,
    values: [10, 20, 35, 45, 55, 65, 75, 90, 100],
    min: 10,
    max: 100,
})
const frequencyMinControl = createPresetControl({
    storeKey: 'lyricVisualizerFrequencyMin',
    defaultValue: visualizerDefaults.frequencyMin,
    values: [20, 40, 80, 120, 200],
    min: 20,
    max: 19990,
    unit: 'Hz',
})
const frequencyMaxControl = createPresetControl({
    storeKey: 'lyricVisualizerFrequencyMax',
    defaultValue: visualizerDefaults.frequencyMax,
    values: [4000, 6000, 8000, 12000, 16000, 20000],
    min: 30,
    max: 20000,
    unit: 'Hz',
})
const opacityControl = createPresetControl({
    storeKey: 'lyricVisualizerOpacity',
    defaultValue: visualizerDefaults.opacity,
    values: [0, 20, 40, 60, 80, 100],
    min: 0,
    max: 100,
    unit: '%',
})
const transitionControl = createPresetControl({
    storeKey: 'lyricVisualizerTransitionDelay',
    defaultValue: visualizerDefaults.transitionDelay,
    values: [0, 0.25, 0.5, 0.75, 0.9, 0.95],
    min: 0,
    max: 0.95,
    unit: ' 秒',
    fractionDigits: 2,
    integer: false,
})
const radialSizeControl = createPresetControl({
    storeKey: 'lyricVisualizerRadialSize',
    defaultValue: visualizerDefaults.radialSize,
    values: [20, 40, 60, 80, 100, 120, 160, 200],
    min: 20,
    max: 200,
    unit: '%',
})
const radialCoreControl = createPresetControl({
    storeKey: 'lyricVisualizerRadialCoreSize',
    defaultValue: visualizerDefaults.radialCoreSize,
    values: [10, 20, 40, 52, 62, 72, 84, 95],
    min: 10,
    max: 95,
    unit: '%',
})
const radialOffsetXControl = createPresetControl({
    storeKey: 'lyricVisualizerRadialOffsetX',
    defaultValue: visualizerDefaults.radialOffsetX,
    values: [-100, -50, -25, 0, 25, 50, 100],
    min: -100,
    max: 100,
    unit: '%',
})
const radialOffsetYControl = createPresetControl({
    storeKey: 'lyricVisualizerRadialOffsetY',
    defaultValue: visualizerDefaults.radialOffsetY,
    values: [-100, -50, -25, 0, 25, 50, 100],
    min: -100,
    max: 100,
    unit: '%',
})
const backgroundBlurControl = createPresetControl({
    storeKey: 'customBackgroundBlur',
    defaultValue: backgroundDefaults.blur,
    values: [0, 5, 10, 15, 20, 40, 60, 80],
    min: 0,
    max: 80,
    unit: 'px',
})
const backgroundBrightnessControl = createPresetControl({
    storeKey: 'customBackgroundBrightness',
    defaultValue: backgroundDefaults.brightness,
    values: [10, 25, 50, 75, 100, 125, 150, 175, 200],
    min: 10,
    max: 200,
    unit: '%',
})

watch(
    [() => playerStore.lyricVisualizerFrequencyMin, () => playerStore.lyricVisualizerFrequencyMax],
    ([rawMin, rawMax]) => {
        let min = clampNumber(rawMin, 20, 19990, visualizerDefaults.frequencyMin, true)
        let max = clampNumber(rawMax, 30, 20000, visualizerDefaults.frequencyMax, true)
        if (max <= min) {
            if (min >= 19990) max = 20000
            else max = Math.min(20000, min + 10)
        }
        if (playerStore.lyricVisualizerFrequencyMin !== min) playerStore.lyricVisualizerFrequencyMin = min
        if (playerStore.lyricVisualizerFrequencyMax !== max) playerStore.lyricVisualizerFrequencyMax = max
    },
    { immediate: true }
)

watch(
    () => playerStore.lyricVisualizerStyle,
    value => {
        if (!visualizerStyleOptions.some(option => option.value === value)) {
            playerStore.lyricVisualizerStyle = visualizerDefaults.style
        }
    },
    { immediate: true }
)
watch(
    () => playerStore.lyricVisualizerColor,
    value => {
        if (!visualizerColorOptions.some(option => option.value === value)) {
            playerStore.lyricVisualizerColor = visualizerDefaults.color
        }
    },
    { immediate: true }
)
watch(
    () => playerStore.customBackgroundMode,
    value => {
        if (!backgroundModeOptions.some(option => option.value === value)) {
            playerStore.customBackgroundMode = backgroundDefaults.mode
        }
    },
    { immediate: true }
)
watch(
    () => playerStore.globalZoom,
    value => {
        const safe = clampNumber(value, 0.5, 3, 1)
        if (safe !== value) playerStore.globalZoom = safe
        try { windowApi?.setZoom?.(safe) } catch (_) {}
    },
    { immediate: true }
)

function toggleLyricVisualizer() {
    if (playerStore.lyricVisualizer) {
        playerStore.lyricVisualizer = false
        return
    }
    dialogOpen(
        '确定开启',
        '开启后此功能会消耗一定性能且可能造成卡顿，确定开启吗？',
        confirmed => { if (confirmed) playerStore.lyricVisualizer = true }
    )
}

async function chooseBackground() {
    try {
        const api = typeof windowApi !== 'undefined'
            ? windowApi?.openImageFile
            : window?.electronAPI?.openImageFile
        const image = await api?.()
        if (image) playerStore.customBackgroundImage = image
    } catch (_) {}
}

function normalizeCommentFontSize() {
    playerStore.commentFontSize = clampNumber(playerStore.commentFontSize, 8, 32, 13, true)
}
</script>

<template>
    <div class="appearance-settings">
        <div class="option">
            <div class="option-name">开启自定义背景</div>
            <div class="option-operation">
                <div class="toggle" @click="playerStore.customBackgroundEnabled = !playerStore.customBackgroundEnabled">
                    <div class="toggle-off" :class="{ 'toggle-on-in': playerStore.customBackgroundEnabled }">
                        {{ playerStore.customBackgroundEnabled ? '已开启' : '已关闭' }}
                    </div>
                    <Transition name="toggle">
                        <div v-show="playerStore.customBackgroundEnabled" class="toggle-on"></div>
                    </Transition>
                </div>
            </div>
        </div>

        <template v-if="playerStore.customBackgroundEnabled">
            <div class="option">
                <div class="option-name">背景图片</div>
                <div class="option-operation option-operation--file">
                    <div class="option-file-path" :title="playerStore.customBackgroundImage">
                        {{ playerStore.customBackgroundImage || '未选择' }}
                    </div>
                    <div class="option-add" @click="chooseBackground">选择</div>
                    <div v-if="playerStore.customBackgroundImage" class="option-reset" @click="playerStore.customBackgroundImage = ''">清除</div>
                </div>
            </div>
            <div class="option">
                <div class="option-name">背景显示模式</div>
                <div class="option-operation option-operation--selector">
                    <div class="selector-wrapper">
                        <Selector v-model="playerStore.customBackgroundMode" :options="backgroundModeOptions" />
                    </div>
                </div>
            </div>
            <div class="option">
                <div class="option-name">背景模糊</div>
                <div class="option-operation option-operation--selector">
                    <div class="selector-wrapper">
                        <Selector v-model="playerStore.customBackgroundBlur" :options="backgroundBlurControl.options" />
                    </div>
                    <div class="option-add-group">
                        <input v-model="backgroundBlurControl.input" aria-label="自定义背景模糊" type="number" min="0" max="80" @keyup.enter="backgroundBlurControl.apply" />
                        <div class="option-add" :class="{ 'option-add--remove': backgroundBlurControl.action.mode === 'remove' }" @click="backgroundBlurControl.apply">
                            {{ backgroundBlurControl.action.mode === 'remove' ? '删除' : '添加' }}
                        </div>
                    </div>
                    <div class="option-reset" @click="backgroundBlurControl.reset">重置</div>
                </div>
            </div>
            <div class="option">
                <div class="option-name">背景亮度</div>
                <div class="option-operation option-operation--selector">
                    <div class="selector-wrapper">
                        <Selector v-model="playerStore.customBackgroundBrightness" :options="backgroundBrightnessControl.options" />
                    </div>
                    <div class="option-add-group">
                        <input v-model="backgroundBrightnessControl.input" aria-label="自定义背景亮度" type="number" min="10" max="200" @keyup.enter="backgroundBrightnessControl.apply" />
                        <div class="option-add" :class="{ 'option-add--remove': backgroundBrightnessControl.action.mode === 'remove' }" @click="backgroundBrightnessControl.apply">
                            {{ backgroundBrightnessControl.action.mode === 'remove' ? '删除' : '添加' }}
                        </div>
                    </div>
                    <div class="option-reset" @click="backgroundBrightnessControl.reset">重置</div>
                </div>
            </div>
            <div class="option">
                <div class="option-name">播放页背景</div>
                <div class="option-operation">
                    <div class="toggle" @click="playerStore.customBackgroundApplyToPlayer = !playerStore.customBackgroundApplyToPlayer">
                        <div class="toggle-off" :class="{ 'toggle-on-in': playerStore.customBackgroundApplyToPlayer }">
                            {{ playerStore.customBackgroundApplyToPlayer ? '已开启' : '已关闭' }}
                        </div>
                        <Transition name="toggle">
                            <div v-show="playerStore.customBackgroundApplyToPlayer" class="toggle-on"></div>
                        </Transition>
                    </div>
                </div>
            </div>
            <div class="option">
                <div class="option-name">主界面背景</div>
                <div class="option-operation">
                    <div class="toggle" @click="playerStore.customBackgroundApplyToChrome = !playerStore.customBackgroundApplyToChrome">
                        <div class="toggle-off" :class="{ 'toggle-on-in': playerStore.customBackgroundApplyToChrome }">
                            {{ playerStore.customBackgroundApplyToChrome ? '已开启' : '已关闭' }}
                        </div>
                        <Transition name="toggle">
                            <div v-show="playerStore.customBackgroundApplyToChrome" class="toggle-on"></div>
                        </Transition>
                    </div>
                </div>
            </div>
        </template>

        <div class="option">
            <div class="option-name">开启歌词音频可视化</div>
            <div class="option-operation">
                <div class="toggle" @click="toggleLyricVisualizer">
                    <div class="toggle-off" :class="{ 'toggle-on-in': playerStore.lyricVisualizer }">
                        {{ playerStore.lyricVisualizer ? '已开启' : '已关闭' }}
                    </div>
                    <Transition name="toggle">
                        <div v-show="playerStore.lyricVisualizer" class="toggle-on"></div>
                    </Transition>
                </div>
            </div>
        </div>

        <template v-if="playerStore.lyricVisualizer">
            <div class="option">
                <div class="option-name">可视化样式</div>
                <div class="option-operation option-operation--selector">
                    <div class="selector-wrapper">
                        <Selector v-model="playerStore.lyricVisualizerStyle" :options="visualizerStyleOptions" />
                    </div>
                    <div class="option-reset" @click="playerStore.lyricVisualizerStyle = visualizerDefaults.style">重置</div>
                </div>
            </div>

            <template v-if="playerStore.lyricVisualizerStyle === 'radial'">
                <div class="option">
                    <div class="option-name">圆环大小</div>
                    <div class="option-operation option-operation--selector">
                        <div class="selector-wrapper"><Selector v-model="playerStore.lyricVisualizerRadialSize" :options="radialSizeControl.options" /></div>
                        <div class="option-add-group">
                            <input v-model="radialSizeControl.input" aria-label="自定义圆环大小" type="number" min="20" max="200" @keyup.enter="radialSizeControl.apply" />
                            <div class="option-add" :class="{ 'option-add--remove': radialSizeControl.action.mode === 'remove' }" @click="radialSizeControl.apply">{{ radialSizeControl.action.mode === 'remove' ? '删除' : '添加' }}</div>
                        </div>
                        <div class="option-reset" @click="radialSizeControl.reset">重置</div>
                    </div>
                </div>
                <div class="option">
                    <div class="option-name">中心圆尺寸</div>
                    <div class="option-operation option-operation--selector">
                        <div class="selector-wrapper"><Selector v-model="playerStore.lyricVisualizerRadialCoreSize" :options="radialCoreControl.options" /></div>
                        <div class="option-add-group">
                            <input v-model="radialCoreControl.input" aria-label="自定义中心圆尺寸" type="number" min="10" max="95" @keyup.enter="radialCoreControl.apply" />
                            <div class="option-add" :class="{ 'option-add--remove': radialCoreControl.action.mode === 'remove' }" @click="radialCoreControl.apply">{{ radialCoreControl.action.mode === 'remove' ? '删除' : '添加' }}</div>
                        </div>
                        <div class="option-reset" @click="radialCoreControl.reset">重置</div>
                    </div>
                </div>
                <div class="option">
                    <div class="option-name">X轴偏移</div>
                    <div class="option-operation option-operation--selector">
                        <div class="selector-wrapper"><Selector v-model="playerStore.lyricVisualizerRadialOffsetX" :options="radialOffsetXControl.options" /></div>
                        <div class="option-add-group">
                            <input v-model="radialOffsetXControl.input" aria-label="自定义X轴偏移" type="number" min="-100" max="100" @keyup.enter="radialOffsetXControl.apply" />
                            <div class="option-add" :class="{ 'option-add--remove': radialOffsetXControl.action.mode === 'remove' }" @click="radialOffsetXControl.apply">{{ radialOffsetXControl.action.mode === 'remove' ? '删除' : '添加' }}</div>
                        </div>
                        <div class="option-reset" @click="radialOffsetXControl.reset">重置</div>
                    </div>
                </div>
                <div class="option">
                    <div class="option-name">Y轴偏移</div>
                    <div class="option-operation option-operation--selector">
                        <div class="selector-wrapper"><Selector v-model="playerStore.lyricVisualizerRadialOffsetY" :options="radialOffsetYControl.options" /></div>
                        <div class="option-add-group">
                            <input v-model="radialOffsetYControl.input" aria-label="自定义Y轴偏移" type="number" min="-100" max="100" @keyup.enter="radialOffsetYControl.apply" />
                            <div class="option-add" :class="{ 'option-add--remove': radialOffsetYControl.action.mode === 'remove' }" @click="radialOffsetYControl.apply">{{ radialOffsetYControl.action.mode === 'remove' ? '删除' : '添加' }}</div>
                        </div>
                        <div class="option-reset" @click="radialOffsetYControl.reset">重置</div>
                    </div>
                </div>
            </template>

            <div class="option">
                <div class="option-name">可视化高度</div>
                <div class="option-operation option-operation--selector">
                    <div class="selector-wrapper"><Selector v-model="playerStore.lyricVisualizerHeight" :options="heightControl.options" /></div>
                    <div class="option-add-group">
                        <input v-model="heightControl.input" aria-label="自定义可视化高度" type="number" min="80" max="480" @keyup.enter="heightControl.apply" />
                        <div class="option-add" :class="{ 'option-add--remove': heightControl.action.mode === 'remove' }" @click="heightControl.apply">{{ heightControl.action.mode === 'remove' ? '删除' : '添加' }}</div>
                    </div>
                    <div class="option-reset" @click="heightControl.reset">重置</div>
                </div>
            </div>
            <div class="option">
                <div class="option-name">柱体数量</div>
                <div class="option-operation option-operation--selector">
                    <div class="selector-wrapper"><Selector v-model="playerStore.lyricVisualizerBarCount" :options="barCountControl.options" /></div>
                    <div class="option-add-group">
                        <input v-model="barCountControl.input" aria-label="自定义柱体数量" type="number" min="8" max="128" @keyup.enter="barCountControl.apply" />
                        <div class="option-add" :class="{ 'option-add--remove': barCountControl.action.mode === 'remove' }" @click="barCountControl.apply">{{ barCountControl.action.mode === 'remove' ? '删除' : '添加' }}</div>
                    </div>
                    <div class="option-reset" @click="barCountControl.reset">重置</div>
                </div>
            </div>
            <div class="option">
                <div class="option-name">柱体宽度</div>
                <div class="option-operation option-operation--selector">
                    <div class="selector-wrapper"><Selector v-model="playerStore.lyricVisualizerBarWidth" :options="barWidthControl.options" /></div>
                    <div class="option-add-group">
                        <input v-model="barWidthControl.input" aria-label="自定义柱体宽度" type="number" min="10" max="100" @keyup.enter="barWidthControl.apply" />
                        <div class="option-add" :class="{ 'option-add--remove': barWidthControl.action.mode === 'remove' }" @click="barWidthControl.apply">{{ barWidthControl.action.mode === 'remove' ? '删除' : '添加' }}</div>
                    </div>
                    <div class="option-reset" @click="barWidthControl.reset">重置</div>
                </div>
            </div>
            <div class="option">
                <div class="option-name">频率范围</div>
                <div class="option-operation option-operation--range">
                    <div class="option-group">
                        <span class="option-group-label">最低</span>
                        <div class="selector-wrapper"><Selector v-model="playerStore.lyricVisualizerFrequencyMin" :options="frequencyMinControl.options" /></div>
                        <div class="option-add-group">
                            <input v-model="frequencyMinControl.input" aria-label="自定义最低频率" type="number" min="20" max="19990" @keyup.enter="frequencyMinControl.apply" />
                            <div class="option-add" :class="{ 'option-add--remove': frequencyMinControl.action.mode === 'remove' }" @click="frequencyMinControl.apply">{{ frequencyMinControl.action.mode === 'remove' ? '删除' : '添加' }}</div>
                        </div>
                        <div class="option-reset" @click="frequencyMinControl.reset">重置</div>
                    </div>
                    <div class="option-group">
                        <span class="option-group-label">最高</span>
                        <div class="selector-wrapper"><Selector v-model="playerStore.lyricVisualizerFrequencyMax" :options="frequencyMaxControl.options" /></div>
                        <div class="option-add-group">
                            <input v-model="frequencyMaxControl.input" aria-label="自定义最高频率" type="number" min="30" max="20000" @keyup.enter="frequencyMaxControl.apply" />
                            <div class="option-add" :class="{ 'option-add--remove': frequencyMaxControl.action.mode === 'remove' }" @click="frequencyMaxControl.apply">{{ frequencyMaxControl.action.mode === 'remove' ? '删除' : '添加' }}</div>
                        </div>
                        <div class="option-reset" @click="frequencyMaxControl.reset">重置</div>
                    </div>
                </div>
            </div>
            <div class="option">
                <div class="option-name">可视化透明度</div>
                <div class="option-operation option-operation--selector">
                    <div class="selector-wrapper"><Selector v-model="playerStore.lyricVisualizerOpacity" :options="opacityControl.options" /></div>
                    <div class="option-add-group">
                        <input v-model="opacityControl.input" aria-label="自定义可视化透明度" type="number" min="0" max="100" @keyup.enter="opacityControl.apply" />
                        <div class="option-add" :class="{ 'option-add--remove': opacityControl.action.mode === 'remove' }" @click="opacityControl.apply">{{ opacityControl.action.mode === 'remove' ? '删除' : '添加' }}</div>
                    </div>
                    <div class="option-reset" @click="opacityControl.reset">重置</div>
                </div>
            </div>
            <div class="option">
                <div class="option-name">可视化颜色</div>
                <div class="option-operation option-operation--selector">
                    <div class="selector-wrapper"><Selector v-model="playerStore.lyricVisualizerColor" :options="visualizerColorOptions" /></div>
                </div>
            </div>
            <div class="option">
                <div class="option-name">过渡延迟</div>
                <div class="option-operation option-operation--selector">
                    <div class="selector-wrapper"><Selector v-model="playerStore.lyricVisualizerTransitionDelay" :options="transitionControl.options" /></div>
                    <div class="option-add-group">
                        <input v-model="transitionControl.input" aria-label="自定义过渡延迟" type="number" min="0" max="0.95" step="0.01" @keyup.enter="transitionControl.apply" />
                        <div class="option-add" :class="{ 'option-add--remove': transitionControl.action.mode === 'remove' }" @click="transitionControl.apply">{{ transitionControl.action.mode === 'remove' ? '删除' : '添加' }}</div>
                    </div>
                    <div class="option-reset" @click="transitionControl.reset">重置</div>
                </div>
            </div>
        </template>

        <div class="option">
            <div class="option-name">搜索下拉条目数量</div>
            <div class="option-operation option-operation--single">
                <input v-model="searchAssistLimit" aria-label="搜索下拉条目数量" />
            </div>
        </div>
        <div class="option">
            <div class="option-name">全局缩放</div>
            <div class="option-operation option-operation--selector">
                <div class="selector-wrapper"><Selector v-model="playerStore.globalZoom" :options="zoomOptions" /></div>
            </div>
        </div>
        <div class="option">
            <div class="option-name">评论区字体大小</div>
            <div class="option-operation option-operation--single">
                <input v-model.number="playerStore.commentFontSize" aria-label="评论区字体大小" type="number" min="8" max="32" @change="normalizeCommentFontSize" />
            </div>
        </div>
        <div class="option">
            <div class="option-name">当前歌词跟随位置</div>
            <div class="option-operation option-operation--selector">
                <div class="selector-wrapper"><Selector v-model="playerStore.lyricFollowPosition" :options="followOptions" /></div>
            </div>
        </div>
    </div>
</template>

<style scoped lang="scss">
.appearance-settings {
    display: contents;
}

.option {
    margin-bottom: 32px;
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
}

.option-name {
    flex: 0 0 auto;
    color: black;
    font-family: SourceHanSansCN-Bold;
    font-size: 16px;
    text-align: left;
}

.option-operation {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
    flex-wrap: wrap;
}

.selector-wrapper {
    width: 200px;

    :deep(.selector) {
        margin-right: 1px;
        width: 100%;
        height: 34px;
        padding: 5px 1px;
        background-color: transparent;
        color: black;
        border: none;
        outline: none;
        appearance: none;
        font: 13px SourceHanSansCN-Bold;
        text-align: center;
        transition: 0.2s;
        box-sizing: border-box;

        &:hover {
            cursor: pointer;
            opacity: 0.8;
            box-shadow: none;
        }
    }

    :deep(.selector-head) {
        padding: 0 10px;
        line-height: 24px;
    }
}

.toggle {
    margin-right: 1px;
    width: 200px;
    height: 34px;
    position: relative;
    overflow: hidden;

    &:hover { cursor: pointer; }
}

.toggle-on,
.toggle-off {
    padding: 5px 10px;
    width: 100%;
    height: 100%;
    font: 13px SourceHanSansCN-Bold;
    line-height: 24px;
    transition: 0.2s;
    box-sizing: border-box;
}

.toggle-off {
    background-color: rgba(255, 255, 255, 0.35);
}

.toggle-on {
    background-color: black;
    position: absolute;
    top: 0;
    left: 0;
    z-index: -1;
}

.toggle-on-in {
    color: white;
    background-color: transparent;
}

.option-operation--selector {
    row-gap: 12px;
}

.option-operation--range {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
}

.option-group {
    width: 100%;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
}

.option-group-label {
    min-width: 34px;
    font: 13px SourceHanSansCN-Bold;
    text-align: right;
}

.option-add-group {
    width: 200px;
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;

    input {
        min-width: 0;
        height: 34px;
        padding: 5px 10px;
        flex: 1;
        color: black;
        background-color: rgba(255, 255, 255, 0.35);
        border: none;
        outline: none;
        appearance: textfield;
        font: 13px SourceHanSansCN-Bold;
        text-align: center;
        transition: 0.2s;
        box-sizing: border-box;

        &:focus { box-shadow: 0 0 0 1px black; }
        &::-webkit-inner-spin-button,
        &::-webkit-outer-spin-button { appearance: none; }
    }
}

.option-add,
.option-reset {
    height: 34px;
    padding: 5px 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: black;
    background-color: rgba(255, 255, 255, 0.35);
    font: 13px SourceHanSansCN-Bold;
    transition: 0.2s;
    box-sizing: border-box;

    &:hover {
        cursor: pointer;
        opacity: 0.8;
        box-shadow: 0 0 0 1px black;
    }
}

.option-add--remove {
    color: white;
    background-color: rgba(220, 53, 69, 0.8);
}

.option-operation--file {
    .option-file-path {
        width: 320px;
        max-width: 100%;
        height: 34px;
        padding: 5px 10px;
        display: flex;
        align-items: center;
        color: black;
        background-color: rgba(255, 255, 255, 0.35);
        font: 13px SourceHanSansCN-Bold;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        box-sizing: border-box;
    }
}

.option-operation--single > input {
    width: 200px;
    height: 34px;
    padding: 5px 10px;
    color: black;
    background-color: rgba(255, 255, 255, 0.35);
    border: none;
    outline: none;
    appearance: textfield;
    font: 13px SourceHanSansCN-Bold;
    text-align: center;
    box-sizing: border-box;

    &::-webkit-inner-spin-button,
    &::-webkit-outer-spin-button { appearance: none; }
}

:global(.dark) .option-add,
:global(.dark) .option-reset,
:global(.dark) .option-file-path {
    background-color: rgba(255, 255, 255, 0.35) !important;
}

:global(.dark) .option-add--remove {
    background-color: rgba(220, 53, 69, 0.8) !important;
}

@media (max-width: 1180px) {
    .option-operation--selector {
        max-width: 424px;
    }

    .option-operation--selector > .option-reset {
        margin-left: auto;
    }
}
</style>
