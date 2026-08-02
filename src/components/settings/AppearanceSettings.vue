<script setup>
import { watch } from 'vue'
import { usePlayerStore } from '../../store/playerStore'
import { dialogOpen } from '../../utils/dialog'
import Selector from '../Selector.vue'

const playerStore = usePlayerStore()
const PERFORMANCE_MESSAGE = '歌词可视化会持续分析当前音频并绘制动画，可能增加性能消耗，确定开启吗？'
const followOptions = [
    { label: '靠上', value: 'top' },
    { label: '居中', value: 'center' },
    { label: '靠下', value: 'bottom' },
]
const visualizerStyleOptions = [
    { label: '条形', value: 'bars' },
    { label: '环形', value: 'radial' },
]
const visualizerColorOptions = [
    { label: '黑色', value: 'black' },
    { label: '白色', value: 'white' },
]
const backgroundModeOptions = [
    { label: '裁切铺满', value: 'cover' },
    { label: '完整显示', value: 'contain' },
    { label: '拉伸铺满', value: 'stretch' },
    { label: '原始大小居中', value: 'center' },
]

function toggleLyricVisualizer() {
    if (playerStore.lyricVisualizer) {
        playerStore.lyricVisualizer = false
        return
    }
    dialogOpen('确定开启', PERFORMANCE_MESSAGE, confirmed => {
        if (confirmed) playerStore.lyricVisualizer = true
    })
}

async function chooseBackground() {
    try {
        const image = await windowApi?.openImageFile?.()
        if (!image) return
        playerStore.customBackgroundImage = image
        playerStore.customBackgroundEnabled = true
    } catch (_) {}
}

function clearBackground() {
    playerStore.customBackgroundImage = ''
    playerStore.customBackgroundEnabled = false
}

watch(
    () => playerStore.globalZoom,
    factor => {
        try { windowApi?.setZoom?.(factor) } catch (_) {}
    }
)
</script>

<template>
    <section class="appearance-settings">
        <h2>外观与歌词</h2>
        <div class="section-line"></div>

        <div class="setting-row">
            <span>当前歌词跟随位置</span>
            <Selector v-model="playerStore.lyricFollowPosition" :options="followOptions" />
        </div>

        <div class="setting-row">
            <span>歌词可视化</span>
            <button type="button" class="switch" :class="{ active: playerStore.lyricVisualizer }" @click="toggleLyricVisualizer">
                {{ playerStore.lyricVisualizer ? '已开启' : '已关闭' }}
            </button>
        </div>

        <div v-if="playerStore.lyricVisualizer" class="advanced-panel">
            <label class="setting-row">
                <span>显示高度</span>
                <span class="range-control">
                    <input v-model.number="playerStore.lyricVisualizerHeight" type="range" min="80" max="480" step="1" />
                    <output>{{ playerStore.lyricVisualizerHeight }} px</output>
                </span>
            </label>
            <div class="setting-row split-inputs">
                <span>频率范围</span>
                <span>
                    <input v-model.number="playerStore.lyricVisualizerFrequencyMin" type="number" min="20" max="19990" />
                    <b>—</b>
                    <input v-model.number="playerStore.lyricVisualizerFrequencyMax" type="number" min="30" max="20000" />
                    <em>Hz</em>
                </span>
            </div>
            <label class="setting-row">
                <span>动画平滑度</span>
                <span class="range-control">
                    <input v-model.number="playerStore.lyricVisualizerTransitionDelay" type="range" min="0" max="0.95" step="0.05" />
                    <output>{{ Math.round(playerStore.lyricVisualizerTransitionDelay * 100) }}%</output>
                </span>
            </label>
            <label class="setting-row">
                <span>柱条数量</span>
                <span class="range-control">
                    <input v-model.number="playerStore.lyricVisualizerBarCount" type="range" min="8" max="128" step="1" />
                    <output>{{ playerStore.lyricVisualizerBarCount }}</output>
                </span>
            </label>
            <label class="setting-row">
                <span>柱条宽度</span>
                <span class="range-control">
                    <input v-model.number="playerStore.lyricVisualizerBarWidth" type="range" min="10" max="100" step="1" />
                    <output>{{ playerStore.lyricVisualizerBarWidth }}%</output>
                </span>
            </label>
            <label class="setting-row">
                <span>不透明度</span>
                <span class="range-control">
                    <input v-model.number="playerStore.lyricVisualizerOpacity" type="range" min="0" max="100" step="1" />
                    <output>{{ playerStore.lyricVisualizerOpacity }}%</output>
                </span>
            </label>
            <div class="setting-row">
                <span>绘制样式</span>
                <Selector v-model="playerStore.lyricVisualizerStyle" :options="visualizerStyleOptions" />
            </div>
            <div class="setting-row">
                <span>绘制颜色</span>
                <Selector v-model="playerStore.lyricVisualizerColor" :options="visualizerColorOptions" />
            </div>
            <template v-if="playerStore.lyricVisualizerStyle === 'radial'">
                <label class="setting-row">
                    <span>环形尺寸</span>
                    <span class="range-control">
                        <input v-model.number="playerStore.lyricVisualizerRadialSize" type="range" min="20" max="200" step="1" />
                        <output>{{ playerStore.lyricVisualizerRadialSize }}%</output>
                    </span>
                </label>
                <label class="setting-row">
                    <span>环形中心空白</span>
                    <span class="range-control">
                        <input v-model.number="playerStore.lyricVisualizerRadialCoreSize" type="range" min="10" max="95" step="1" />
                        <output>{{ playerStore.lyricVisualizerRadialCoreSize }}%</output>
                    </span>
                </label>
                <div class="setting-row split-inputs">
                    <span>环形位置偏移</span>
                    <span>
                        <input v-model.number="playerStore.lyricVisualizerRadialOffsetX" type="number" min="-100" max="100" />
                        <b>×</b>
                        <input v-model.number="playerStore.lyricVisualizerRadialOffsetY" type="number" min="-100" max="100" />
                        <em>%</em>
                    </span>
                </div>
            </template>
        </div>

        <label class="setting-row">
            <span>评论正文字号</span>
            <span class="range-control">
                <input v-model.number="playerStore.commentFontSize" type="range" min="8" max="32" step="1" />
                <output>{{ playerStore.commentFontSize }} px</output>
            </span>
        </label>

        <label class="setting-row">
            <span>界面缩放</span>
            <span class="range-control">
                <input v-model.number="playerStore.globalZoom" type="range" min="0.5" max="3" step="0.05" />
                <output>{{ Math.round(playerStore.globalZoom * 100) }}%</output>
            </span>
        </label>

        <div class="setting-row">
            <span>自定义背景</span>
            <button type="button" class="switch" :class="{ active: playerStore.customBackgroundEnabled }" @click="playerStore.customBackgroundEnabled = !playerStore.customBackgroundEnabled">
                {{ playerStore.customBackgroundEnabled ? '已开启' : '已关闭' }}
            </button>
        </div>
        <div class="setting-row background-file">
            <span>背景图片</span>
            <span class="file-control">
                <output :title="playerStore.customBackgroundImage">{{ playerStore.customBackgroundImage || '待选择' }}</output>
                <button type="button" @click="chooseBackground">选择</button>
                <button v-if="playerStore.customBackgroundImage" type="button" @click="clearBackground">清除</button>
            </span>
        </div>
        <template v-if="playerStore.customBackgroundEnabled">
            <div class="setting-row">
                <span>背景适配方式</span>
                <Selector v-model="playerStore.customBackgroundMode" :options="backgroundModeOptions" />
            </div>
            <label class="setting-row">
                <span>背景模糊</span>
                <span class="range-control">
                    <input v-model.number="playerStore.customBackgroundBlur" type="range" min="0" max="80" step="1" />
                    <output>{{ playerStore.customBackgroundBlur }} px</output>
                </span>
            </label>
            <label class="setting-row">
                <span>背景亮度</span>
                <span class="range-control">
                    <input v-model.number="playerStore.customBackgroundBrightness" type="range" min="10" max="200" step="1" />
                    <output>{{ playerStore.customBackgroundBrightness }}%</output>
                </span>
            </label>
            <div class="setting-row">
                <span>应用到首页</span>
                <button type="button" class="switch" :class="{ active: playerStore.customBackgroundApplyToChrome }" @click="playerStore.customBackgroundApplyToChrome = !playerStore.customBackgroundApplyToChrome">
                    {{ playerStore.customBackgroundApplyToChrome ? '是' : '否' }}
                </button>
            </div>
            <div class="setting-row">
                <span>应用到播放页</span>
                <button type="button" class="switch" :class="{ active: playerStore.customBackgroundApplyToPlayer }" @click="playerStore.customBackgroundApplyToPlayer = !playerStore.customBackgroundApplyToPlayer">
                    {{ playerStore.customBackgroundApplyToPlayer ? '是' : '否' }}
                </button>
            </div>
        </template>
    </section>
</template>

<style scoped lang="scss">
.appearance-settings {
    width: 100%;
    margin-bottom: 42px;
    color: #000;

    h2 {
        margin: 0;
        font: 24px SourceHanSansCN-Bold;
        text-align: left;
    }

    .section-line {
        width: 100%;
        height: 1px;
        margin: 10px 0 15px;
        background: rgba(0, 0, 0, 0.2);
    }
}

.setting-row {
    min-height: 44px;
    padding: 7px 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 28px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    font: 14px SourceHanSansCN-Bold;

    > span:first-child {
        flex: 1;
        text-align: left;
    }
}

.advanced-panel {
    margin: 6px 0 10px;
    padding: 5px 16px;
    background: rgba(0, 0, 0, 0.035);
    border-left: 3px solid rgba(0, 0, 0, 0.5);
}

.switch,
.file-control button {
    min-width: 72px;
    padding: 7px 12px;
    border: 1px solid rgba(0, 0, 0, 0.2);
    background: rgba(0, 0, 0, 0.08);
    color: rgba(0, 0, 0, 0.55);
    font: 12px SourceHanSansCN-Bold;
    cursor: pointer;
    transition: 0.2s;
}

.switch.active,
.file-control button:hover {
    background: #000;
    color: #fff;
}

.range-control {
    width: min(390px, 52%);
    display: flex;
    align-items: center;
    gap: 12px;

    input {
        flex: 1;
        accent-color: #000;
    }

    output {
        width: 64px;
        text-align: right;
        font: 12px Bender-Bold, monospace;
    }
}

.split-inputs > span:last-child {
    display: flex;
    align-items: center;
    gap: 8px;

    input {
        width: 88px;
        padding: 6px 8px;
        border: 1px solid rgba(0, 0, 0, 0.18);
        background: rgba(255, 255, 255, 0.5);
        outline: none;
    }

    b,
    em {
        color: rgba(0, 0, 0, 0.45);
        font: 11px Bender-Bold, monospace;
    }
}

.file-control {
    width: min(520px, 66%);
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 7px;

    output {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: rgba(0, 0, 0, 0.55);
        font: 12px SourceHanSansCN-Bold;
        text-align: right;
    }
}

@media (max-width: 760px) {
    .setting-row {
        align-items: flex-start;
        flex-direction: column;
        gap: 8px;
    }

    .range-control,
    .file-control {
        width: 100%;
    }
}
</style>
