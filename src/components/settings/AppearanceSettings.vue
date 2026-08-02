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
    <section class="settings-item appearance-settings">
        <h2 class="item-title">外观与歌词</h2>
        <div class="line"></div>

        <div class="item-options">
            <div class="option">
                <div class="option-name">当前歌词跟随位置</div>
                <div class="option-operation">
                    <Selector v-model="playerStore.lyricFollowPosition" :options="followOptions" />
                </div>
            </div>

            <div class="option">
                <div class="option-name">歌词可视化</div>
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
                    <div class="option-name">显示高度</div>
                    <div class="option-operation range-option">
                        <input v-model.number="playerStore.lyricVisualizerHeight" type="range" min="80" max="480" step="1" />
                        <output>{{ playerStore.lyricVisualizerHeight }} px</output>
                    </div>
                </div>
                <div class="option">
                    <div class="option-name">频率范围</div>
                    <div class="option-operation compound-input">
                        <input v-model.number="playerStore.lyricVisualizerFrequencyMin" aria-label="最低频率" type="number" min="20" max="19990" />
                        <b>—</b>
                        <input v-model.number="playerStore.lyricVisualizerFrequencyMax" aria-label="最高频率" type="number" min="30" max="20000" />
                        <em>Hz</em>
                    </div>
                </div>
                <div class="option">
                    <div class="option-name">动画平滑度</div>
                    <div class="option-operation range-option">
                        <input v-model.number="playerStore.lyricVisualizerTransitionDelay" type="range" min="0" max="0.95" step="0.05" />
                        <output>{{ Math.round(playerStore.lyricVisualizerTransitionDelay * 100) }}%</output>
                    </div>
                </div>
                <div class="option">
                    <div class="option-name">柱条数量</div>
                    <div class="option-operation range-option">
                        <input v-model.number="playerStore.lyricVisualizerBarCount" type="range" min="8" max="128" step="1" />
                        <output>{{ playerStore.lyricVisualizerBarCount }}</output>
                    </div>
                </div>
                <div class="option">
                    <div class="option-name">柱条宽度</div>
                    <div class="option-operation range-option">
                        <input v-model.number="playerStore.lyricVisualizerBarWidth" type="range" min="10" max="100" step="1" />
                        <output>{{ playerStore.lyricVisualizerBarWidth }}%</output>
                    </div>
                </div>
                <div class="option">
                    <div class="option-name">不透明度</div>
                    <div class="option-operation range-option">
                        <input v-model.number="playerStore.lyricVisualizerOpacity" type="range" min="0" max="100" step="1" />
                        <output>{{ playerStore.lyricVisualizerOpacity }}%</output>
                    </div>
                </div>
                <div class="option">
                    <div class="option-name">绘制样式</div>
                    <div class="option-operation">
                        <Selector v-model="playerStore.lyricVisualizerStyle" :options="visualizerStyleOptions" />
                    </div>
                </div>
                <div class="option">
                    <div class="option-name">绘制颜色</div>
                    <div class="option-operation">
                        <Selector v-model="playerStore.lyricVisualizerColor" :options="visualizerColorOptions" />
                    </div>
                </div>
                <template v-if="playerStore.lyricVisualizerStyle === 'radial'">
                    <div class="option">
                        <div class="option-name">环形尺寸</div>
                        <div class="option-operation range-option">
                            <input v-model.number="playerStore.lyricVisualizerRadialSize" type="range" min="20" max="200" step="1" />
                            <output>{{ playerStore.lyricVisualizerRadialSize }}%</output>
                        </div>
                    </div>
                    <div class="option">
                        <div class="option-name">环形中心空白</div>
                        <div class="option-operation range-option">
                            <input v-model.number="playerStore.lyricVisualizerRadialCoreSize" type="range" min="10" max="95" step="1" />
                            <output>{{ playerStore.lyricVisualizerRadialCoreSize }}%</output>
                        </div>
                    </div>
                    <div class="option">
                        <div class="option-name">环形位置偏移</div>
                        <div class="option-operation compound-input">
                            <input v-model.number="playerStore.lyricVisualizerRadialOffsetX" aria-label="水平偏移" type="number" min="-100" max="100" />
                            <b>×</b>
                            <input v-model.number="playerStore.lyricVisualizerRadialOffsetY" aria-label="垂直偏移" type="number" min="-100" max="100" />
                            <em>%</em>
                        </div>
                    </div>
                </template>
            </template>

            <div class="option">
                <div class="option-name">评论正文字号</div>
                <div class="option-operation range-option">
                    <input v-model.number="playerStore.commentFontSize" type="range" min="8" max="32" step="1" />
                    <output>{{ playerStore.commentFontSize }} px</output>
                </div>
            </div>

            <div class="option">
                <div class="option-name">界面缩放</div>
                <div class="option-operation range-option">
                    <input v-model.number="playerStore.globalZoom" type="range" min="0.5" max="3" step="0.05" />
                    <output>{{ Math.round(playerStore.globalZoom * 100) }}%</output>
                </div>
            </div>

            <div class="option">
                <div class="option-name">自定义背景</div>
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
            <div class="option">
                <div class="option-name">背景图片</div>
                <div class="option-operation select-download-folder select-background-file">
                    <output class="selected-folder" :title="playerStore.customBackgroundImage">
                        {{ playerStore.customBackgroundImage || '待选择' }}
                    </output>
                    <button type="button" class="select-option" @click="chooseBackground">选择</button>
                    <button v-if="playerStore.customBackgroundImage" type="button" class="select-option" @click="clearBackground">清除</button>
                </div>
            </div>
            <template v-if="playerStore.customBackgroundEnabled">
                <div class="option">
                    <div class="option-name">背景适配方式</div>
                    <div class="option-operation">
                        <Selector v-model="playerStore.customBackgroundMode" :options="backgroundModeOptions" />
                    </div>
                </div>
                <div class="option">
                    <div class="option-name">背景模糊</div>
                    <div class="option-operation range-option">
                        <input v-model.number="playerStore.customBackgroundBlur" type="range" min="0" max="80" step="1" />
                        <output>{{ playerStore.customBackgroundBlur }} px</output>
                    </div>
                </div>
                <div class="option">
                    <div class="option-name">背景亮度</div>
                    <div class="option-operation range-option">
                        <input v-model.number="playerStore.customBackgroundBrightness" type="range" min="10" max="200" step="1" />
                        <output>{{ playerStore.customBackgroundBrightness }}%</output>
                    </div>
                </div>
                <div class="option">
                    <div class="option-name">应用到首页</div>
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
                <div class="option">
                    <div class="option-name">应用到播放页</div>
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
            </template>
        </div>
    </section>
</template>

<style scoped lang="scss">
.settings-item {
    margin-top: 45px;
    width: 100%;
}

.item-title {
    margin: 0;
    color: black;
    font: 20px SourceHanSansCN-Bold;
    text-align: left;
}

.line {
    margin-top: 8px;
    margin-bottom: 25px;
    width: 100%;
    height: 0.5px;
    background-color: rgba(0, 0, 0, 0.2);
}

.item-options {
    outline: none;
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
    color: black;
    font-family: SourceHanSansCN-Bold;
    font-size: 16px;
    text-align: left;
}

.option-operation {
    flex: 0 0 auto;

    :deep(.selector) {
        margin-right: 1px;
        width: 200px;
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

    &:hover {
        cursor: pointer;
    }
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

.range-option,
.compound-input {
    margin-right: 1px;
    width: 200px;
    height: 34px;
    padding: 5px 8px;
    display: flex;
    align-items: center;
    background-color: rgba(255, 255, 255, 0.35);
    box-sizing: border-box;
}

.range-option {
    gap: 8px;

    input {
        min-width: 0;
        flex: 1;
        accent-color: black;
        cursor: pointer;
    }

    output {
        width: 58px;
        flex: 0 0 auto;
        font: 13px SourceHanSansCN-Bold;
        text-align: right;
    }
}

.compound-input {
    justify-content: space-between;
    gap: 4px;

    input {
        min-width: 0;
        width: 58px;
        padding: 0;
        background: transparent;
        border: none;
        outline: none;
        appearance: textfield;
        font: 13px SourceHanSansCN-Bold;
        text-align: center;

        &::-webkit-inner-spin-button,
        &::-webkit-outer-spin-button {
            appearance: none;
        }
    }

    b,
    em {
        font: 11px SourceHanSansCN-Bold;
    }
}

.select-background-file {
    display: flex;
    flex-direction: row;
    align-items: center;

    .selected-folder {
        width: min(50vw, 520px);
        height: 30px;
        padding: 0 8px;
        background-color: rgba(255, 255, 255, 0.35);
        color: black;
        font: 13px SourceHanSansCN-Bold;
        line-height: 30px;
        text-align: left;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        box-sizing: border-box;
    }

    .select-option {
        margin-right: 2px;
        margin-left: 15px;
        padding: 5px 15px;
        color: black;
        background-color: rgba(255, 255, 255, 0.35);
        border: none;
        outline: none;
        font: 13px SourceHanSansCN-Bold;
        transition: 0.2s;

        &:hover {
            cursor: pointer;
            opacity: 0.8;
            box-shadow: 0 0 0 1px black;
        }
    }
}

:global(.dark) .range-option,
:global(.dark) .compound-input,
:global(.dark) .select-background-file .selected-folder,
:global(.dark) .select-background-file .select-option {
    background-color: var(--layer) !important;
}

:global(.dark) .range-option input {
    accent-color: var(--text);
}
</style>
