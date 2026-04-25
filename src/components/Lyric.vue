<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick, computed, reactive } from 'vue';
import { changeProgress, musicVideoCheck } from '../utils/player';
import { usePlayerStore } from '../store/playerStore';
import { storeToRefs } from 'pinia';
import { syncLyricIndexForSeek } from '../composables/usePlayerRuntime';
import { getLyricVisualizerAudioEnv } from '../utils/lyricVisualizerAudio';

const playerStore = usePlayerStore();
const {
    playing,
    progress,
    lyricsObjArr,
    songList,
    currentIndex,
    currentMusic,
    widgetState,
    lyricShow,
    lyricEle,
    isLyricDelay,
    lyricSize,
    tlyricSize,
    rlyricSize,
    lyricType,
    playerChangeSong,
    lyricInterludeTime,
    lyricBlur,
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
    lyricFollowPosition,
    videoIsPlaying,
} = storeToRefs(playerStore);

const audioEnv = getLyricVisualizerAudioEnv();

// 歌词可视化器画布引用与容器尺寸状态
const lyricVisualizerCanvas = ref(null);
const visualizerContainerSize = reactive({ width: 0, height: 0 });

// 限制数值在范围内，遇到非法输入返回默认值
const clampNumber = (value, min, max, fallback = min) => {
    const numeric = Number(value);
    if (Number.isNaN(numeric)) return fallback;
    return Math.min(Math.max(numeric, min), max);
};

// 解析 HEX/RGB 字符串为 RGB 对象，便于绘制使用
const parseColorToRGB = color => {
    if (!color || typeof color !== 'string') return { r: 0, g: 0, b: 0 };
    const value = color.trim();
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) {
        let hex = value.substring(1);
        if (hex.length === 3) hex = hex.split('').map(ch => ch + ch).join('');
        const intVal = parseInt(hex, 16);
        return {
            r: (intVal >> 16) & 255,
            g: (intVal >> 8) & 255,
            b: intVal & 255,
        };
    }
    const rgbMatch = value.match(/^rgba?\(([^)]+)\)$/i);
    if (rgbMatch) {
        const parts = rgbMatch[1]
            .split(',')
            .map(part => Number.parseFloat(part.trim()))
            .filter((_, index) => index < 3);
        if (parts.length === 3 && parts.every(part => Number.isFinite(part))) {
            return { r: clampNumber(parts[0], 0, 255, 0), g: clampNumber(parts[1], 0, 255, 0), b: clampNumber(parts[2], 0, 255, 0) };
        }
    }
    return { r: 0, g: 0, b: 0 };
};

// 安全解析数值，失败时使用兜底值
const fallbackNumber = (value, fallback) => {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
    return fallback;
};

const DEFAULT_FREQ_MIN = 20;
const DEFAULT_FREQ_MAX = 8000;
const VISUALIZER_HEIGHT_OFFSET = 3;
const VISUALIZER_REFERENCE_CONTAINER_HEIGHT = 720;

const visualizerBaseHeightPx = computed(() => Math.max(0, fallbackNumber(lyricVisualizerHeight.value ?? 220, 220)));
const visualizerHeightPx = computed(() => {
    const baseHeight = visualizerBaseHeightPx.value;
    const containerHeight =
        visualizerContainerSize.height ||
        lyricScroll.value?.clientHeight ||
        lyricVisualizerCanvas.value?.parentElement?.clientHeight ||
        0;
    if (!containerHeight) return baseHeight;
    if (containerHeight <= baseHeight) return containerHeight;
    const scaleFactor = containerHeight / VISUALIZER_REFERENCE_CONTAINER_HEIGHT;
    const scaled = baseHeight * scaleFactor;
    const target = Math.min(containerHeight, Math.max(baseHeight, scaled));
    return Math.round(clampNumber(target, baseHeight, containerHeight, baseHeight));
});
const visualizerCanvasHeightPx = computed(() => Math.max(0, visualizerHeightPx.value + VISUALIZER_HEIGHT_OFFSET));

const normalizeFrequencyRange = (minValue, maxValue) => {
    let min = fallbackNumber(minValue ?? DEFAULT_FREQ_MIN, DEFAULT_FREQ_MIN);
    let max = fallbackNumber(maxValue ?? DEFAULT_FREQ_MAX, DEFAULT_FREQ_MAX);
    min = clampNumber(Math.round(min), 20, 20000, DEFAULT_FREQ_MIN);
    max = clampNumber(Math.round(max), 20, 20000, DEFAULT_FREQ_MAX);
    if (min >= max) {
        if (min >= 19990) { min = 19990; max = 20000; } else { max = Math.min(20000, min + 10); }
    }
    if (max - min < 10) {
        if (min >= 19990) { min = 19990; max = 20000; } else { max = Math.min(20000, min + 10); }
    }
    return { min, max };
};

const visualizerFrequencyRange = computed(() =>
    normalizeFrequencyRange(lyricVisualizerFrequencyMin.value, lyricVisualizerFrequencyMax.value)
);
const visualizerFrequencyMinValue = computed(() => visualizerFrequencyRange.value.min);
const visualizerFrequencyMaxValue = computed(() => visualizerFrequencyRange.value.max);
const visualizerSmoothing = computed(() => {
    const value = Number(lyricVisualizerTransitionDelay.value);
    if (Number.isFinite(value)) return Math.min(Math.max(value, 0), 0.95);
    return 0.75;
});
const visualizerBarCountValue = computed(() => {
    const value = Number(lyricVisualizerBarCount.value);
    if (!Number.isFinite(value) || value <= 0) return 1;
    return Math.round(value);
});
const visualizerBarWidthRatio = computed(() => {
    const value = Number(lyricVisualizerBarWidth.value);
    if (!Number.isFinite(value) || value <= 0) return 0.55;
    return Math.min(value, 100) / 100;
});
const visualizerColorRGB = computed(() => {
    if (lyricVisualizerColor.value === 'white') return { r: 255, g: 255, b: 255 };
    if (lyricVisualizerColor.value === 'black') return { r: 0, g: 0, b: 0 };
    return parseColorToRGB(lyricVisualizerColor.value);
});

const visualizerOpacityValue = computed(() => {
    const value = Number(lyricVisualizerOpacity.value);
    if (!Number.isFinite(value)) return 100;
    return Math.min(Math.max(Math.round(value), 0), 100);
});

const visualizerOpacityRatio = computed(() => {
    const ratio = visualizerOpacityValue.value / 100;
    if (!Number.isFinite(ratio)) return 1;
    return Math.min(Math.max(ratio, 0), 1);
});

const visualizerStyleValue = computed(() => 'bars');

const visualizerRadialSizeValue = computed(() => {
    const value = Number(lyricVisualizerRadialSize.value);
    if (!Number.isFinite(value)) return 100;
    return clampNumber(Math.round(value), 10, 400, 100);
});
const visualizerRadialSizeRatio = computed(() => visualizerRadialSizeValue.value / 100);
const visualizerRadialOffsetXValue = computed(() => {
    const value = Number(lyricVisualizerRadialOffsetX.value);
    if (!Number.isFinite(value)) return 0;
    return clampNumber(Math.round(value), -100, 100, 0);
});
const visualizerRadialOffsetYValue = computed(() => {
    const value = Number(lyricVisualizerRadialOffsetY.value);
    if (!Number.isFinite(value)) return 0;
    return clampNumber(Math.round(value), -100, 100, 0);
});
const visualizerRadialCoreSizeValue = computed(() => {
    const value = Number(lyricVisualizerRadialCoreSize.value);
    if (!Number.isFinite(value)) return 62;
    return clampNumber(Math.round(value), 10, 95, 62);
});
const visualizerRadialCoreSizeRatio = computed(() => visualizerRadialCoreSizeValue.value / 100);

const visualizerCanvasStyle = computed(() => {
    const isRadial = visualizerStyleValue.value === 'radial';
    if (isRadial) {
        return {
            width: 'calc(100% - 3vh)',
            height: 'calc(100% - 3vh)',
            top: '50%',
            left: '50%',
            right: 'auto',
            bottom: 'auto',
            transform: 'translate(-50%, -50%)',
        };
    }
    const height = visualizerCanvasHeightPx.value + 'px';
    const base = { height, top: 'auto' };
    if (shouldShowVisualizerInLyrics.value || shouldShowVisualizerInPlaceholder.value) {
        return { ...base, width: 'calc(100% - 3vh)', left: '50%', right: 'auto', bottom: '1.5vh', transform: 'translateX(-50%)' };
    }
    return { ...base, width: '100%', left: '0', right: '0', bottom: '1.5vh', transform: 'none' };
});

const shouldShowVisualizerInLyrics = computed(() => lyricVisualizer.value && lyricAreaVisible.value);
const shouldShowVisualizerInPlaceholder = computed(() => lyricVisualizer.value && !lyricAreaVisible.value);
const shouldShowVisualizer = computed(
    () => shouldShowVisualizerInLyrics.value || shouldShowVisualizerInPlaceholder.value
);

let analyserDataArray = null;
let canvasCtx = null;
let animationFrameId = null;
let resizeObserver = null;
let resizeHandler = null;
let resizeTarget = null;
let visualizerBarLevels = null;
let visualizerPauseState = false;
let visualizerLastFrameTime = 0; // 上一帧的 performance.now()，用于帧时间补偿
// 缓存画布显示尺寸，避免每帧读取 DOM clientWidth/clientHeight 触发强制布局
let cachedCanvasDisplayWidth = 0;
let cachedCanvasDisplayHeight = 0;

const syncAnalyserConfig = () => {
    const analyser = audioEnv.analyser;
    if (!analyser) return;
    // fftSize 512 → 每帧约 11ms 音频数据，响应更紧跟节拍
    const fftSize = 512;
    if (analyser.fftSize !== fftSize) {
        analyser.fftSize = fftSize;
        analyserDataArray = new Uint8Array(analyser.frequencyBinCount);
    } else if (!analyserDataArray || analyserDataArray.length !== analyser.frequencyBinCount) {
        analyserDataArray = new Uint8Array(analyser.frequencyBinCount);
    }
    // smoothingTimeConstant 降低到 0.5，减少内置平滑带来的延迟
    analyser.smoothingTimeConstant = visualizerSmoothing.value;
};

const ensureVisualizerLevels = size => {
    if (size <= 0) {
        visualizerBarLevels = null;
        return visualizerBarLevels;
    }
    if (!visualizerBarLevels || visualizerBarLevels.length !== size) {
        visualizerBarLevels = new Float32Array(size);
    }
    return visualizerBarLevels;
};

const resetVisualizerLevels = () => {
    visualizerBarLevels = null;
};

const updateVisualizerLevels = (size, resolveTarget, deltaMultiplier = 1) => {
    const levels = ensureVisualizerLevels(size);
    if (!levels) return 0;
    let peak = 0;

    // 基准 attack/release 按 60fps 设计；帧时间补偿让慢帧追更多、快帧追更少
    // 公式：1 - (1 - rate)^(deltaMultiplier)，在低帧率下等效于多步累加
    const attack = 1 - Math.pow(1 - 0.55, deltaMultiplier);
    const release = 1 - Math.pow(1 - 0.1, deltaMultiplier);
    for (let index = 0; index < size; index++) {
        const target = Math.max(0, Math.min(1, resolveTarget(index) ?? 0));
        const current = levels[index] ?? 0;
        let nextValue;
        if (target >= current) {
            nextValue = current + (target - current) * attack;
        } else {
            const drop = release + current * (0.04 * deltaMultiplier);
            nextValue = current - Math.min(current - target, drop);
        }
        if (!Number.isFinite(nextValue)) nextValue = 0;
        nextValue = Math.max(0, Math.min(1, nextValue));
        levels[index] = nextValue;
        if (nextValue > peak) peak = nextValue;
    }
    return peak;
};

const renderVisualizerPreview = () => {
    if (!shouldShowVisualizer.value || !lyricVisualizerCanvas.value) return;
    if (!animationFrameId) {
        renderVisualizerFrame();
    }
};

const syncVisualizerContainerMetrics = element => {
    if (!element) return;
    const rect = element.getBoundingClientRect?.();
    if (!rect) return;
    const width = Math.max(0, Math.round(rect.width));
    const height = Math.max(0, Math.round(rect.height));
    if (visualizerContainerSize.width !== width || visualizerContainerSize.height !== height) {
        visualizerContainerSize.width = width;
        visualizerContainerSize.height = height;
    }
};

const resetVisualizerContainerMetrics = () => {
    if (visualizerContainerSize.width !== 0 || visualizerContainerSize.height !== 0) {
        visualizerContainerSize.width = 0;
        visualizerContainerSize.height = 0;
    }
};

const updateVisualizerCanvasSize = () => {
    const canvas = lyricVisualizerCanvas.value;
    if (!canvas) {
        resetVisualizerContainerMetrics();
        cachedCanvasDisplayWidth = 0;
        cachedCanvasDisplayHeight = 0;
        return;
    }
    const hostElement = lyricScroll.value || canvas.parentElement || canvas;
    syncVisualizerContainerMetrics(hostElement);
    const displayWidth = Math.max(canvas.clientWidth, visualizerContainerSize.width);
    const displayHeight = Math.max(visualizerCanvasHeightPx.value, canvas.clientHeight || 0);
    if (!displayWidth || !displayHeight) return;
    if (!canvasCtx) return;
    const dpr = window.devicePixelRatio || 1;
    const targetWidth = Math.round(displayWidth * dpr);
    const targetHeight = Math.round(displayHeight * dpr);
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
    }
    if (typeof canvasCtx.resetTransform === 'function') canvasCtx.resetTransform();
    else canvasCtx.setTransform(1, 0, 0, 1, 0, 0);
    canvasCtx.scale(dpr, dpr);
    // 缓存显示尺寸，供 renderVisualizerFrame 热路径使用
    cachedCanvasDisplayWidth = displayWidth;
    cachedCanvasDisplayHeight = displayHeight;
};

const ensureVisualizerSizeTracking = () => {
    updateVisualizerCanvasSize();
    const target =
        (lyricAreaVisible.value && lyricScroll.value) || lyricVisualizerCanvas.value?.parentElement || null;
    if (typeof ResizeObserver !== 'undefined') {
        if (!target) return;
        if (!resizeObserver) {
            resizeObserver = new ResizeObserver(entries => {
                let handled = false;
                for (const entry of entries) {
                    if (!entry) continue;
                    const { contentRect, target: entryTarget } = entry;
                    if (contentRect) {
                        const width = Math.max(0, Math.round(contentRect.width));
                        const height = Math.max(0, Math.round(contentRect.height));
                        if (
                            visualizerContainerSize.width !== width ||
                            visualizerContainerSize.height !== height
                        ) {
                            visualizerContainerSize.width = width;
                            visualizerContainerSize.height = height;
                        }
                        handled = true;
                    } else if (entryTarget) {
                        syncVisualizerContainerMetrics(entryTarget);
                        handled = true;
                    }
                }
                if (!handled && target) syncVisualizerContainerMetrics(target);
                updateVisualizerCanvasSize();
            });
        }
        if (resizeTarget && resizeTarget !== target) {
            resizeObserver.unobserve(resizeTarget);
            resizeTarget = null;
        }
        if (!resizeTarget) {
            resizeObserver.observe(target);
            resizeTarget = target;
        }
    } else if (typeof window !== 'undefined' && !resizeHandler) {
        resizeHandler = () => updateVisualizerCanvasSize();
        window.addEventListener('resize', resizeHandler);
    }
};

const detachVisualizerSizeTracking = () => {
    if (resizeObserver && resizeTarget) {
        resizeObserver.unobserve(resizeTarget);
        resizeTarget = null;
    }
    if (resizeObserver && !resizeTarget && typeof resizeObserver.disconnect === 'function') {
        resizeObserver.disconnect();
        resizeObserver = null;
    }
    if (resizeHandler && typeof window !== 'undefined') {
        window.removeEventListener('resize', resizeHandler);
        resizeHandler = null;
    }
    resetVisualizerContainerMetrics();
};

const setupVisualizer = async () => {
    if (!shouldShowVisualizer.value || !lyricVisualizerCanvas.value) return;
    if (!currentMusic.value || !currentMusic.value._sounds || !currentMusic.value._sounds.length) return;
    const audioNode = currentMusic.value._sounds[0]?._node;
    if (!audioNode) return;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    if (!audioEnv.audioContext) {
        try {
            audioEnv.audioContext = new AudioContextClass();
        } catch (error) {
            console.warn('创建音频上下文失败:', error);
            return;
        }
    }

    const audioContext = audioEnv.audioContext;
    if (audioContext.state === 'suspended') {
        try {
            await audioContext.resume();
        } catch (error) {
            console.warn('恢复音频上下文失败:', error);
        }
    }

    if (!audioEnv.analyser) {
        audioEnv.analyser = audioContext.createAnalyser();
    }
    syncAnalyserConfig();

    const analyser = audioEnv.analyser;
    let source = audioEnv.audioSourceCache.get(audioNode);
    try {
        if (!source) {
            source = audioContext.createMediaElementSource(audioNode);
            audioEnv.audioSourceCache.set(audioNode, source);
        }
    } catch (error) {
        console.warn('创建音频源失败:', error);
        return;
    }

    try { source.disconnect(); } catch (_) {}
    source.connect(analyser);

    if (!audioEnv.analyserConnected) {
        analyser.connect(audioContext.destination);
        audioEnv.analyserConnected = true;
    }

    canvasCtx = lyricVisualizerCanvas.value.getContext('2d');
    if (!canvasCtx) return;

    ensureVisualizerSizeTracking();
};

const renderVisualizerFrame = (now = performance.now()) => {
    if (!shouldShowVisualizer.value || !canvasCtx || !lyricVisualizerCanvas.value) return false;
    // 使用缓存尺寸，避免每帧读 DOM clientWidth/clientHeight 触发强制布局
    const width = cachedCanvasDisplayWidth;
    const height = cachedCanvasDisplayHeight;
    if (!width || !height) return true;

    // 帧时间补偿：以 16.67ms（60fps）为基准，慢帧追更多、快帧追更少
    const rawDelta = visualizerLastFrameTime > 0 ? now - visualizerLastFrameTime : 16.67;
    // 限制最大补偿倍率为 3（避免页面切回/帧跳跃时过度追赶）
    const deltaMultiplier = Math.min(rawDelta / 16.67, 3);
    visualizerLastFrameTime = now;

    const isPlaying = playing.value;
    const paused = !isPlaying || visualizerPauseState;

    const analyser = audioEnv.analyser;
    if (analyser) {
        // 暂停时把 analyser 自身的平滑关掉，防止 AudioContext suspend/resume 时
        // 内部缓冲残留值在恢复后混入新数据，产生"卡两下"的视觉跳变
        analyser.smoothingTimeConstant = paused ? 0 : visualizerSmoothing.value;
    }
    if (!paused && analyser && analyserDataArray) {
        try { analyser.getByteFrequencyData(analyserDataArray); } catch (_) {}
    }

    // 从响应式对象中提取当前帧所需的值，避免在热路径中反复触发 Vue 依赖追踪
    const { r, g, b } = visualizerColorRGB.value;
    const opacityRatio = visualizerOpacityRatio.value;
    const freqMin = visualizerFrequencyMinValue.value;
    const freqMax = visualizerFrequencyMaxValue.value;
    const barCountRaw = visualizerBarCountValue.value;
    const barWidthRatio = visualizerBarWidthRatio.value;

    const nyquist = audioEnv.audioContext ? audioEnv.audioContext.sampleRate / 2 : 22050;
    const binCount = analyserDataArray ? analyserDataArray.length : 0;
    const frequencyMin = Math.max(0, Math.min(freqMin, nyquist));
    const frequencyMax = Math.max(frequencyMin + 10, Math.min(freqMax, nyquist));
    const minIndex = binCount
        ? Math.min(binCount - 1, Math.max(0, Math.floor((frequencyMin / nyquist) * binCount)))
        : 0;
    const maxIndex = binCount
        ? Math.max(minIndex + 1, Math.min(binCount, Math.floor((frequencyMax / nyquist) * binCount)))
        : 1;
    const rangeSize = Math.max(1, maxIndex - minIndex);
    const maxBars = 96;
    const barCount = Math.max(1, Math.min(barCountRaw, maxBars));
    const step = rangeSize / barCount;

    const levels = ensureVisualizerLevels(barCount);
    if (!levels) return false;

    // 暂停时 target 强制为 0，播放时从 analyser 读数据
    // 两种状态共用同一套 attack/release 平滑逻辑，过渡不会突变
    const peak = updateVisualizerLevels(
        barCount,
        paused
            ? () => 0
            : index => {
                if (!analyserDataArray || !binCount) return 0;
                const samplePosition = minIndex + (index + 0.5) * step;
                const dataIndex = Math.min(binCount - 1, Math.max(0, Math.floor(samplePosition)));
                return analyserDataArray[dataIndex] / 255;
            },
        deltaMultiplier
    );

    canvasCtx.clearRect(0, 0, width, height);

    // 当所有频谱条完全衰减至 0 时跳过绘制
    if (peak < 0.002) return true;

    const barWidth = width / barCount;
    const innerWidth = barWidth * Math.min(Math.max(barWidthRatio, 0.01), 1);
    const offset = (barWidth - innerWidth) / 2;

    // 仅在 alpha 不同时更新 fillStyle，减少字符串分配
    let lastAlpha = -1;
    for (let i = 0; i < barCount; i++) {
        const value = levels[i] ?? 0;
        if (value < 0.002) continue;
        const barHeight = height * value;
        const x = i * barWidth + offset;
        const y = height - barHeight;
        const baseAlpha = 0.15 + value * 0.5;
        const alpha = Math.min(Math.max(baseAlpha * opacityRatio, 0), 1);
        const alphaRounded = Math.round(alpha * 1000) / 1000;
        if (alphaRounded !== lastAlpha) {
            canvasCtx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alphaRounded})`;
            lastAlpha = alphaRounded;
        }
        canvasCtx.fillRect(x, y, innerWidth, barHeight);
    }

    return true;
};

const startVisualizerLoop = ({ force = false } = {}) => {
    if (!shouldShowVisualizer.value || !lyricVisualizerCanvas.value || !canvasCtx) return;
    updateVisualizerCanvasSize();
    visualizerLastFrameTime = 0; // 重置帧时间，防止第一帧 delta 过大
    if (animationFrameId) {
        if (!force) return;
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    const draw = (now) => {
        const keepGoing = renderVisualizerFrame(now);
        if (keepGoing === false) {
            animationFrameId = null;
            return;
        }
        animationFrameId = requestAnimationFrame(draw);
    };
    animationFrameId = requestAnimationFrame(draw);
};

const stopVisualizerLoop = ({ clear = false, teardown = false } = {}) => {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    if (canvasCtx && lyricVisualizerCanvas.value && clear) {
        const width = cachedCanvasDisplayWidth || lyricVisualizerCanvas.value.clientWidth;
        const height = cachedCanvasDisplayHeight || lyricVisualizerCanvas.value.clientHeight;
        canvasCtx.clearRect(0, 0, width, height);
    }
    if (clear || teardown) {
        resetVisualizerLevels();
        visualizerPauseState = false;
        cachedCanvasDisplayWidth = 0;
        cachedCanvasDisplayHeight = 0;
    }
    if (teardown) {
        detachVisualizerSizeTracking();
        canvasCtx = null;
    }
};

const lyricScroll = ref();
const lyricContent = ref();
const isLyricActive = ref(true);
const isManualScrollActive = ref(false);
const lycCurrentIndex = ref(null);
const interludeIndex = ref(null);
const interludeAnimation = ref(false);
const interludeRemainingTime = ref(null);
// 当从有间奏的行切换到下一行时，立即折叠上一行的间奏，避免其收起动画影响高度测量
const interludeFastClose = ref(false);
let interludeInTimer = null;
let interludeOutTimer = null;
// 在“上一句预计结束”时再启动间奏的延迟定时器（启发式）
let interludeDeferStartTimer = null;
let manualScrollReleaseTimer = null;
let lyricWheelHandler = null;

let lyricRevealToken = 0;
let lyricContentAnimation = null;
let lyricScrollAnimationToken = 0;
let lyricScrollAnimationTargetTop = null;

const LYRIC_FONT_READY_TIMEOUT_MS = 900;
const LYRIC_LAYOUT_STABLE_SAMPLE_TARGET = 2;
const LYRIC_LAYOUT_STABLE_MAX_ATTEMPTS = 8;
const MANUAL_SCROLL_IDLE_MS = 1000;
const LYRIC_SCROLL_SYNC_TOLERANCE_PX = 2;
const LYRIC_AUTO_SCROLL_DURATION_MS = 580;
const LYRIC_AUTO_SCROLL_EASING = 'cubic-bezier(0.4, 0, 0.12, 1)';
const LYRIC_FOLLOW_TOP_OFFSET_RATIO = 0.38; // fallback，实际由 lyricFollowPosition 决定
const LYRIC_FOLLOW_BOTTOM_GUTTER_PX = 180;
const LYRIC_FOLLOW_VISIBLE_GUTTER_PX = 24;

// 切回歌词时抑制首帧闪烁（先隐藏，定位完成后再显示）
const suppressLyricFlash = ref(true);
const lyricAreaReady = ref(false);
const lyricTopSpacerHeight = ref(260);
const lyricBottomSpacerHeight = ref(LYRIC_FOLLOW_BOTTOM_GUTTER_PX);

// 在高频同步中避免并发测量
const syncingLayout = ref(false);
const currentSong = computed(() => {
    const list = Array.isArray(songList.value) ? songList.value : [];
    const index = Number.isInteger(currentIndex.value) ? currentIndex.value : -1;

    return index >= 0 && index < list.length ? list[index] : null;
});

// —— 每首歌自适应的演唱时长估计模型 ——
// 以该首歌中“非间奏”的行间间隔，反推每个“文本单位”的平均时长（秒/单位），用于估计单行演唱结束点
const songSecPerUnit = ref(0.22); // 回退默认：每个文本单位约 0.22s

function textUnitCount(text) {
    if (!text || typeof text !== 'string') return 0;
    const trimmed = text.trim();
    if (!trimmed) return 0;
    // 汉字（含扩展、兼容区）
    const han = (trimmed.match(/[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]/g) || []).length;
    // 日文平假名、片假名、片假名扩展、半角片假名
    const hira = (trimmed.match(/[\u3040-\u309F]/g) || []).length;
    const kata = (trimmed.match(/[\u30A0-\u30FF]/g) || []).length; // 含长音符“ー”
    const kataExt = (trimmed.match(/[\u31F0-\u31FF]/g) || []).length;
    const halfKata = (trimmed.match(/[\uFF66-\uFF9D]/g) || []).length;
    // 英文按词估计
    const words = trimmed.split(/\s+/).filter(Boolean).length;
    // 将英文词按 0.6 的权重折算为“单位”，避免对长单词过度计数
    // 假名与汉字都按 1.0 的单位权重计算，避免日文歌词被低估
    return han + hira + kata + kataExt + halfKata + words * 0.6;
}

function median(arr) {
    if (!arr.length) return NaN;
    const a = arr.slice().sort((x, y) => x - y);
    const mid = a.length >> 1;
    return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

function recomputeSongTimingModel() {
    try {
        const arr = Array.isArray(lyricsObjArr.value) ? lyricsObjArr.value : [];
        if (!arr.length) return;
        const candidates = [];
        const thr = Number(lyricInterludeTime.value || 0) || 8; // 用户阈值或回退 8s
        const upper = Math.min(Math.max(thr - 1, 4.5), 10); // 认为 <= upper 的行间隔主要是演唱
        const lower = 0.8; // 过滤极短的间隔
        for (let i = 0; i < arr.length - 1; i++) {
            const cur = arr[i];
            const nextIdx = findNextContentIndex(i);
            if (nextIdx === -1) continue;
            const next = arr[nextIdx];
            if (!cur || !next) continue;
            const t0 = Number(cur.time);
            const t1 = Number(next.time);
            if (!Number.isFinite(t0) || !Number.isFinite(t1)) continue;
            const gap = t1 - t0;
            if (!(gap > lower && gap <= upper)) continue;
            const units = textUnitCount(String(cur.lyric || ''));
            if (!(units > 0)) continue;
            const spUnit = gap / units; // 秒/单位
            if (Number.isFinite(spUnit) && spUnit > 0.05 && spUnit < 0.8) candidates.push(spUnit);
        }
        if (candidates.length) {
            const med = median(candidates);
            // 夹在合理区间，避免异常值
            songSecPerUnit.value = Math.min(0.45, Math.max(0.08, med));
        } else {
            // 回退默认
            songSecPerUnit.value = 0.22;
        }
    } catch (_) {
        // 回退默认
        songSecPerUnit.value = 0.22;
    }
}

const waitForNextFrame = () =>
    new Promise(resolve => {
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => resolve());
        } else {
            setTimeout(resolve, 16);
        }
    });

const waitForLayoutCommit = async () => {
    await nextTick();
    await waitForNextFrame();
};

const sleep = timeout =>
    new Promise(resolve => {
        setTimeout(resolve, timeout);
    });

const withTimeout = async (promise, timeoutMs) => {
    await Promise.race([Promise.resolve(promise).catch(() => {}), sleep(timeoutMs)]);
};

function getLyricLineElements() {
    if (lyricScroll.value && typeof lyricScroll.value.querySelectorAll === 'function') {
        return lyricScroll.value.querySelectorAll('.lyric-line');
    }
    return [];
}

function createLyricRevealToken() {
    lyricRevealToken += 1;
    return lyricRevealToken;
}

function isLyricRevealTokenActive(token) {
    return lyricRevealToken === token;
}

function invalidateLyricReveal() {
    lyricRevealToken += 1;
    lyricAreaReady.value = false;
    suppressLyricFlash.value = true;
}

async function waitForLyricFonts(token) {
    if (typeof document === 'undefined' || !isLyricRevealTokenActive(token)) return;
    const fontSet = document.fonts;
    if (!fontSet) return;

    const lyricFontSize = Math.max(
        Number(lyricSize.value || 0) || 20,
        Number(tlyricSize.value || 0) || 14,
        Number(rlyricSize.value || 0) || 12
    );

    try {
        if (typeof fontSet.load === 'function') {
            await withTimeout(
                Promise.allSettled([
                    fontSet.load(`700 ${lyricFontSize}px SourceHanSansCN-Bold`, '歌词 Lyric'),
                    fontSet.load('700 10px Bender-Bold', 'MUSIC INTERLUDE THE REMAINING TIME'),
                ]),
                LYRIC_FONT_READY_TIMEOUT_MS
            );
            return;
        }

        if (typeof fontSet.ready?.then === 'function') {
            await withTimeout(fontSet.ready, LYRIC_FONT_READY_TIMEOUT_MS);
        }
    } catch (_) {
        // ignore and continue with best-effort layout
    }
}

// 是否存在歌词列表与有效原文内容
const hasLyricsList = computed(() => Array.isArray(lyricsObjArr.value) && lyricsObjArr.value.length > 0);
const isUntimedLyrics = computed(() => {
    if (!Array.isArray(lyricsObjArr.value)) return false;
    return lyricsObjArr.value.some(item => !!item?.untimed);
});
const hasAnyLyricContent = computed(() => {
    if (!Array.isArray(lyricsObjArr.value)) return false;
    return lyricsObjArr.value.some(item => !!(item && item.lyric && String(item.lyric).trim()))
});
const isLyricDataPending = computed(() => lyricsObjArr.value === null);
const showLyricNoData = computed(() => {
    if (lyricType.value.indexOf('original') == -1) return true;
    if (isLyricDataPending.value) return false;
    return !hasLyricsList.value || !hasAnyLyricContent.value;
});
const showLyricArea = computed(() => {
    return !!(hasLyricsList.value && hasAnyLyricContent.value && lyricShow.value && lyricType.value.indexOf('original') != -1);
});

function getLyricScrollElement() {
    return lyricScroll.value || null;
}

function getLyricLineWrapper(index) {
    if (!Number.isInteger(index) || index < 0 || !lyricEle.value || index >= lyricEle.value.length) return null;
    return lyricEle.value[index] || null;
}

function getLyricContentLineElement(index) {
    const wrapper = getLyricLineWrapper(index);
    if (!wrapper) return null;
    return wrapper.querySelector('.line') || wrapper;
}

function getLyricFollowTopOffset(scrollEl, wrapperHeight = 0) {
    if (!scrollEl) return 260;

    const safeWrapperHeight = Math.max(0, wrapperHeight);
    const pos = lyricFollowPosition.value || 'center';
    let ratio;
    if (pos === 'top') ratio = 0.15;
    else if (pos === 'bottom') ratio = 0.62;
    else ratio = LYRIC_FOLLOW_TOP_OFFSET_RATIO; // center
    const targetOffset = Math.round(scrollEl.clientHeight * ratio);
    const maxVisibleTop = Math.max(0, scrollEl.clientHeight - safeWrapperHeight - LYRIC_FOLLOW_VISIBLE_GUTTER_PX);
    return Math.min(targetOffset, maxVisibleTop);
}

function updateLyricScrollSpacers(wrapperHeight = 0) {
    const scrollEl = getLyricScrollElement();
    if (!scrollEl) return;

    const safeWrapperHeight = Math.max(0, wrapperHeight);
    const followTopOffset = getLyricFollowTopOffset(scrollEl, safeWrapperHeight);
    lyricTopSpacerHeight.value = followTopOffset;
    lyricBottomSpacerHeight.value = Math.max(
        LYRIC_FOLLOW_BOTTOM_GUTTER_PX,
        scrollEl.clientHeight - followTopOffset - safeWrapperHeight
    );
}

function getLyricContentMetrics(index) {
    const scrollEl = getLyricScrollElement();
    const wrapper = getLyricLineWrapper(index);
    const lineEl = getLyricContentLineElement(index);
    if (!scrollEl || !wrapper || !lineEl) return null;

    const lineTop = wrapper.offsetTop + (lineEl !== wrapper ? lineEl.offsetTop : 0);
    const lineHeight = lineEl.offsetHeight || wrapper.offsetHeight || 0;
    const wrapperHeight = wrapper.offsetHeight || lineHeight;
    const followTopOffset = getLyricFollowTopOffset(scrollEl, wrapperHeight);
    updateLyricScrollSpacers(wrapperHeight);
    const maxScrollTop = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight);
    const targetScrollTop = Math.min(
        maxScrollTop,
        Math.max(0, wrapper.offsetTop - followTopOffset)
    );

    return {
        lineTop,
        lineHeight,
        wrapperHeight,
        followTopOffset,
        targetScrollTop,
        maxScrollTop,
    };
}

function clearManualScrollReleaseTimer() {
    if (!manualScrollReleaseTimer) return;
    clearTimeout(manualScrollReleaseTimer);
    manualScrollReleaseTimer = null;
}

function getLyricContentVisualShiftY() {
    const contentEl = lyricContent.value;
    if (!contentEl || typeof getComputedStyle !== 'function') return 0;

    const transform = getComputedStyle(contentEl).transform;
    if (!transform || transform === 'none') return 0;

    try {
        if (typeof DOMMatrixReadOnly === 'function') {
            return new DOMMatrixReadOnly(transform).m42 || 0;
        }
        if (typeof WebKitCSSMatrix === 'function') {
            return new WebKitCSSMatrix(transform).m42 || 0;
        }
    } catch (_) {
        // fall through to string parsing
    }

    const matrix3dMatch = transform.match(/^matrix3d\((.+)\)$/);
    if (matrix3dMatch) {
        const values = matrix3dMatch[1].split(',').map(value => Number(value.trim()));
        return Number.isFinite(values[13]) ? values[13] : 0;
    }

    const matrixMatch = transform.match(/^matrix\((.+)\)$/);
    if (matrixMatch) {
        const values = matrixMatch[1].split(',').map(value => Number(value.trim()));
        return Number.isFinite(values[5]) ? values[5] : 0;
    }

    return 0;
}

function cancelLyricScrollAnimation({ preserveVisualPosition = false } = {}) {
    const scrollEl = getLyricScrollElement();
    if (preserveVisualPosition && scrollEl) {
        const visualShiftY = getLyricContentVisualShiftY();
        if (Math.abs(visualShiftY) > 0.1) {
            setLyricScrollTop(scrollEl, Math.max(0, scrollEl.scrollTop - visualShiftY));
        }
    }

    lyricScrollAnimationToken += 1;
    if (lyricContentAnimation) {
        try {
            lyricContentAnimation.cancel();
        } catch (_) {
            // ignore cancellation errors from torn-down animations
        }
        lyricContentAnimation = null;
    }
    lyricScrollAnimationTargetTop = null;
}

function setLyricScrollTop(scrollEl, top) {
    if (!scrollEl) return;
    scrollEl.scrollTop = top;
}

function animateLyricScrollTop(scrollEl, targetTop) {
    if (!scrollEl) return;

    const normalizedTargetTop = Math.max(0, Number(targetTop) || 0);
    if (
        lyricContentAnimation !== null &&
        lyricScrollAnimationTargetTop !== null &&
        Math.abs(lyricScrollAnimationTargetTop - normalizedTargetTop) <= LYRIC_SCROLL_SYNC_TOLERANCE_PX
    ) {
        return;
    }

    if (lyricContentAnimation) {
        cancelLyricScrollAnimation({ preserveVisualPosition: true });
    }

    const startTop = scrollEl.scrollTop;
    const delta = normalizedTargetTop - startTop;

    if (Math.abs(delta) <= LYRIC_SCROLL_SYNC_TOLERANCE_PX) {
        lyricScrollAnimationTargetTop = null;
        setLyricScrollTop(scrollEl, normalizedTargetTop);
        return;
    }

    const contentEl = lyricContent.value;
    lyricScrollAnimationTargetTop = normalizedTargetTop;
    setLyricScrollTop(scrollEl, normalizedTargetTop);

    if (!contentEl || typeof contentEl.animate !== 'function') return;

    const animationToken = lyricScrollAnimationToken;

    try {
        lyricContentAnimation = contentEl.animate(
            [
                { transform: `translate3d(0, ${delta}px, 0)` },
                { transform: 'translate3d(0, 0, 0)' },
            ],
            {
                duration: LYRIC_AUTO_SCROLL_DURATION_MS,
                easing: LYRIC_AUTO_SCROLL_EASING,
                fill: 'both',
            }
        );

        lyricContentAnimation.onfinish = () => {
            if (animationToken !== lyricScrollAnimationToken) return;
            lyricContentAnimation = null;
            lyricScrollAnimationTargetTop = null;
        };
        lyricContentAnimation.oncancel = () => {
            if (animationToken !== lyricScrollAnimationToken) return;
            lyricContentAnimation = null;
            lyricScrollAnimationTargetTop = null;
        };
    } catch (_) {
        lyricContentAnimation = null;
        lyricScrollAnimationTargetTop = null;
    }
}

function syncLyricPosition({ behavior = 'auto', force = false } = {}) {
    const scrollEl = getLyricScrollElement();
    if (!scrollEl) return;
    if (!force && isManualScrollActive.value) return;

    const targetIndex = Number.isInteger(lycCurrentIndex.value) ? lycCurrentIndex.value : -1;
    if (targetIndex < 0) {
        updateLyricScrollSpacers();
        if (force) {
            if (behavior === 'smooth') animateLyricScrollTop(scrollEl, 0);
            else {
                cancelLyricScrollAnimation();
                setLyricScrollTop(scrollEl, 0);
            }
        }
        isLyricActive.value = true;
        return;
    }

    const metrics = getLyricContentMetrics(targetIndex);
    if (!metrics) return;

    if (Math.abs(scrollEl.scrollTop - metrics.targetScrollTop) <= LYRIC_SCROLL_SYNC_TOLERANCE_PX) {
        if (force && behavior !== 'smooth') {
            cancelLyricScrollAnimation();
            setLyricScrollTop(scrollEl, metrics.targetScrollTop);
        }
        isLyricActive.value = true;
        return;
    }

    if (behavior === 'smooth') animateLyricScrollTop(scrollEl, metrics.targetScrollTop);
    else {
        cancelLyricScrollAnimation();
        setLyricScrollTop(scrollEl, metrics.targetScrollTop);
    }
    isLyricActive.value = true;
}

function enterManualScrollMode() {
    cancelLyricScrollAnimation({ preserveVisualPosition: true });
    isLyricActive.value = false;
    isManualScrollActive.value = true;
    clearManualScrollReleaseTimer();
    manualScrollReleaseTimer = setTimeout(() => {
        manualScrollReleaseTimer = null;
        isManualScrollActive.value = false;
        syncLyricPosition({ behavior: 'smooth', force: true });
    }, MANUAL_SCROLL_IDLE_MS);
}

const clearLycAnimation = flag => {
    if (flag) isLyricDelay.value = false;
    const eles = lyricEle.value;
    const hasBlur = lyricBlur.value;
    const zeroSec = '0s';
    for (let i = 0; i < eles.length; i++) {
        eles[i].style.transitionDelay = zeroSec;
        // 当启用歌词模糊时，移除内联 filter 以便使用样式表控制
        if (hasBlur) eles[i].firstChild.style.removeProperty('filter');
    }
    if (flag) {
        const forbidDelayTimer = setTimeout(() => {
            isLyricDelay.value = true;
            clearTimeout(forbidDelayTimer);
        }, 500);
    }
};

const setDefaultStyle = async () => {
    lyricAreaReady.value = false;
    lycCurrentIndex.value = currentLyricIndex.value >= 0 ? currentLyricIndex.value : -1;
    interludeAnimation.value = false;
    lyricEle.value = getLyricLineElements();
    updateLyricScrollSpacers();

    await waitForLayoutCommit();
    lyricEle.value = getLyricLineElements();
    syncLyricPosition({ force: true });

    if (!lyricShow.value && !widgetState.value) {
        const changeTimer = setTimeout(() => {
            lyricShow.value = true;
            playerChangeSong.value = false;
            clearTimeout(changeTimer);
        }, 400);
    }
};

function captureLyricLayoutSignature() {
    const lines = lyricEle.value;
    const activeIndex =
        Number.isInteger(lycCurrentIndex.value) && lycCurrentIndex.value >= 0 && lines?.[lycCurrentIndex.value]?.offsetParent !== null
            ? lycCurrentIndex.value
            : 0;
    const activeLine = getLyricContentLineElement(activeIndex);
    const scrollEl = getLyricScrollElement();

    return {
        areaWidth: Math.round(scrollEl?.clientWidth || 0),
        totalHeight: Math.round(scrollEl?.scrollHeight || 0),
        activeHeight: Math.round(activeLine?.clientHeight || 0),
        activeWidth: Math.round(activeLine?.clientWidth || 0),
    };
}

function isSameLyricLayoutSignature(prev, next) {
    if (!prev || !next) return false;
    return (
        prev.areaWidth === next.areaWidth &&
        prev.totalHeight === next.totalHeight &&
        prev.activeHeight === next.activeHeight &&
        prev.activeWidth === next.activeWidth
    );
}

// 监听歌词数组变化，重新设置样式
watch(
    () => lyricsObjArr.value,
    async newLyrics => {
        if (newLyrics && newLyrics.length > 0) {
            // 重新根据本首歌的行间隔校准演唱速率
            recomputeSongTimingModel();
            if (showLyricArea.value) {
                await prepareLyricReveal();
            }
            return;
        }

        invalidateLyricReveal();
    }
);

// 根据显示配置（翻译/原文/罗马音、字号）动态调整高度与位置
const applyLyricLayout = async ({ waitForPaint = false, syncBehavior = null } = {}) => {
    if (!lyricsObjArr.value || !lyricsObjArr.value.length) return;
    if (syncingLayout.value) return;
    syncingLayout.value = true;
    try {
        await waitForLayoutCommit();
        const syncedIndex = syncLyricIndexForSeek(getSafeSeek());
        if (syncedIndex >= 0) {
            lycCurrentIndex.value = syncedIndex;
        }
        await nextTick();
        lyricEle.value = getLyricLineElements();
        const resolvedSyncBehavior = syncBehavior ?? (
            lyricAreaReady.value && !suppressLyricFlash.value && !isManualScrollActive.value ? 'smooth' : 'auto'
        );
        syncLyricPosition({ behavior: resolvedSyncBehavior, force: true });
        if (waitForPaint) {
            await waitForLayoutCommit();
        }
    } finally {
        syncingLayout.value = false;
    }
};

const recalcLyricLayout = async ({ syncBehavior = 'auto' } = {}) => {
    await applyLyricLayout({ syncBehavior });
};

const waitForStableLyricLayout = async token => {
    let previousSignature = null;
    let stableSamples = 0;

    for (let attempt = 0; attempt < LYRIC_LAYOUT_STABLE_MAX_ATTEMPTS; attempt++) {
        if (!isLyricRevealTokenActive(token) || !showLyricArea.value) return false;
        await applyLyricLayout({ waitForPaint: true });
        if (!isLyricRevealTokenActive(token) || !showLyricArea.value) return false;

        lyricEle.value = getLyricLineElements();
        const signature = captureLyricLayoutSignature();
        if (isSameLyricLayoutSignature(previousSignature, signature)) {
            stableSamples += 1;
            if (stableSamples >= LYRIC_LAYOUT_STABLE_SAMPLE_TARGET) return true;
        } else {
            stableSamples = 0;
        }
        previousSignature = signature;
    }

    return true;
};

const prepareLyricReveal = async () => {
    if (!showLyricArea.value) return;

    const token = createLyricRevealToken();

    // 快速通道：字体已加载完毕时直接显示，趁 fade 渐入动画（250ms）完成位置同步
    // 避免"先隐藏再等待再显示"造成的 250-500ms 可感知延迟
    const fontsAlreadyReady =
        typeof document !== 'undefined' &&
        document.fonts != null &&
        document.fonts.status === 'loaded';

    if (fontsAlreadyReady) {
        suppressLyricFlash.value = false;
        lyricAreaReady.value = true;
        await nextTick();
        if (!isLyricRevealTokenActive(token) || !showLyricArea.value) return;
        // 快速位置同步（不调用 setDefaultStyle 以免其内部 lyricAreaReady=false 触发闪烁）
        lycCurrentIndex.value = currentLyricIndex.value >= 0 ? currentLyricIndex.value : -1;
        interludeAnimation.value = false;
        lyricEle.value = getLyricLineElements();
        updateLyricScrollSpacers();
        await waitForLayoutCommit();
        if (!isLyricRevealTokenActive(token) || !showLyricArea.value) return;
        lyricEle.value = getLyricLineElements();
        syncLyricPosition({ force: true });
        return;
    }

    // 慢速通道：字体尚未加载（通常只在首次打开时触发），保留原有抑制闪烁逻辑
    suppressLyricFlash.value = true;
    lyricAreaReady.value = false;

    await nextTick();
    if (!isLyricRevealTokenActive(token) || !showLyricArea.value) return;

    await waitForLyricFonts(token);
    if (!isLyricRevealTokenActive(token) || !showLyricArea.value) return;

    await setDefaultStyle();
    if (!isLyricRevealTokenActive(token) || !showLyricArea.value) return;

    await waitForStableLyricLayout(token);
    if (!isLyricRevealTokenActive(token) || !showLyricArea.value) return;

    lyricAreaReady.value = true;
    suppressLyricFlash.value = false;
};

// —— 间奏等待动画——
function clearInterludeTimers() {
    try { if (interludeInTimer) clearTimeout(interludeInTimer) } catch (_) {}
    try { if (interludeOutTimer) clearTimeout(interludeOutTimer) } catch (_) {}
    try { if (interludeDeferStartTimer) clearTimeout(interludeDeferStartTimer) } catch (_) {}
    interludeInTimer = null;
    interludeOutTimer = null;
    interludeDeferStartTimer = null;
}

function getSafeSeek() {
    try {
        if (currentMusic.value && typeof currentMusic.value.seek === 'function') {
            const s = currentMusic.value.seek();
            if (typeof s === 'number' && !Number.isNaN(s)) return s;
        }
    } catch (_) {}
    return typeof progress.value === 'number' ? progress.value : 0;
}

// 辅助：查找“下一句有正文内容的歌词”的索引（忽略仅用于时长占位、正文为空的行）
function findNextContentIndex(fromIdx) {
    if (!lyricsObjArr.value || !Array.isArray(lyricsObjArr.value)) return -1;
    for (let i = fromIdx + 1; i < lyricsObjArr.value.length; i++) {
        const it = lyricsObjArr.value[i];
        if (it && typeof it.lyric === 'string' && it.lyric.trim()) return i;
    }
    return -1;
}

// 启发式：估算一行歌词的大致演唱时长（秒）
// 中文字符约 0.25s/字，英文按单词 0.18s/词，基础时长 0.8s，夹在 [1.0s, 6.0s]
function estimateLineDurationSec(text) {
    const units = textUnitCount(text);
    const basePad = 0.5; // 最小基底，避免过短
    const est = basePad + (units > 0 ? units * songSecPerUnit.value : 0);
    return Math.min(7.0, Math.max(0.8, est));
}

// 计算“上一句预计结束时间”：行起始 + 估算时长，但不超过下一行起始
function estimateLineEndTimeSec(index, nextIndex) {
    const cur = lyricsObjArr.value?.[index];
    const nxt = lyricsObjArr.value?.[nextIndex];
    if (!cur || typeof cur.time !== 'number') return NaN;
    const lineStart = Number(cur.time);
    const nextStart = (nxt && typeof nxt.time === 'number') ? Number(nxt.time) : Infinity;
    const estDur = estimateLineDurationSec(String(cur.lyric || ''));
    const estEnd = lineStart + estDur;
    return Math.min(estEnd, nextStart);
}

// 当当前歌词行号变化时，根据阈值决定是否展示/收起间奏
function handleInterludeOnIndexChange(newIdx) {
    if (!lyricsObjArr.value || !Array.isArray(lyricsObjArr.value)) return;
    if (typeof newIdx !== 'number') return;
    if (newIdx < 0) {
        interludeAnimation.value = false;
        clearInterludeTimers();
        interludeIndex.value = null;
        interludeRemainingTime.value = null;
        return;
    }

    // 只对“有下一句正文”的情况启用间奏，否则视为“没有下一句歌词”不展示
    const nextIdx = findNextContentIndex(newIdx);
    if (nextIdx === -1) {
        interludeAnimation.value = false;
        clearInterludeTimers();
        interludeIndex.value = null;
        interludeRemainingTime.value = null;
        return;
    }

    const currentSeek = getSafeSeek();
    const nextLineTime = Number(lyricsObjArr.value[nextIdx]?.time ?? NaN);
    if (!Number.isFinite(nextLineTime)) return;

    const threshold = Number(lyricInterludeTime.value || 0);

    // 先清理任何既有定时器
    clearInterludeTimers();

    // 启发式：以“上一句预计结束时间”为起点计算纯间奏
    const estEnd = estimateLineEndTimeSec(newIdx, nextIdx);
    if (!Number.isFinite(estEnd)) return;
    const pureGap = nextLineTime - estEnd; // 仅“上一句结束”到“下一句开始”的空档

    if (pureGap >= threshold) {
        interludeIndex.value = newIdx;
        interludeAnimation.value = false;
        const delayMs = Math.max(0, Math.round((estEnd - currentSeek) * 1000));
        interludeDeferStartTimer = setTimeout(() => {
            if (lycCurrentIndex.value !== newIdx) return;
            interludeAnimation.value = true;
            interludeDeferStartTimer = null;
        }, delayMs);
    } else {
        // 不满足阈值：确保不展示
        interludeAnimation.value = false;
        interludeFastClose.value = true;
        interludeOutTimer = setTimeout(() => {
            interludeIndex.value = null;
            interludeFastClose.value = false;
            interludeOutTimer = null;
        }, 900);
        interludeRemainingTime.value = null;
    }
}

// 在进度变化时，仅更新倒计时与“<1s 收起”的判断（不做阈值判断，避免提前收起）
function handleInterludeOnProgress() {
    if (!lyricsObjArr.value || !Array.isArray(lyricsObjArr.value)) return;
    if (!playing.value || !lyricShow.value) return;
    const idx = typeof lycCurrentIndex.value === 'number' ? lycCurrentIndex.value : -1;
    if (idx < 0) return;

    // 若没有下一句“有正文内容”的歌词，则不展示/继续间奏
    const nextIdx = findNextContentIndex(idx);
    if (nextIdx === -1) {
        interludeAnimation.value = false;
        clearInterludeTimers();
        interludeIndex.value = null;
        interludeRemainingTime.value = null;
        return;
    }

    const currentSeek = getSafeSeek();
    const nextLineTime = Number(lyricsObjArr.value[nextIdx]?.time ?? NaN);
    if (!Number.isFinite(nextLineTime)) return;
    const estEnd = estimateLineEndTimeSec(idx, nextIdx);
    if (!Number.isFinite(estEnd)) return;

    // 若尚未到“上一句预计结束”时刻，则不应显示动画
    if (currentSeek < estEnd) {
        interludeAnimation.value = false;
        interludeRemainingTime.value = null;
        return;
    }

    const gap = nextLineTime - currentSeek; // 距离下一句开始的剩余秒
    const pureGapRemaining = nextLineTime - Math.max(currentSeek, estEnd); // 仅剩余的纯间奏秒数
    if (gap < 1) {
        interludeAnimation.value = false;
        clearInterludeTimers();
        interludeOutTimer = setTimeout(() => {
            interludeIndex.value = null;
            interludeOutTimer = null;
        }, 900);
        interludeRemainingTime.value = null;
    } else {
        interludeRemainingTime.value = Math.max(0, Math.trunc(pureGapRemaining - 1));
    }
}

// Resize 触发同步：容器尺寸改变后重新测量与同步（debounce 避免动画过程中逐帧重算）
let lyricResizeObserver = null;
let resizeDebounceTimer = 0;
const scheduleLayout = () => {
    if (resizeDebounceTimer) clearTimeout(resizeDebounceTimer);
    resizeDebounceTimer = setTimeout(async () => {
        resizeDebounceTimer = 0;
        const behavior = (lyricAreaReady.value && !suppressLyricFlash.value) ? 'smooth' : 'auto';
        await applyLyricLayout({ syncBehavior: behavior });
    }, 120);
};

// 仅在类型变化时做常规重算（显示/隐藏由可见性观察处理）
watch(
    lyricType,
    async () => {
        await recalcLyricLayout({ syncBehavior: 'auto' });
    },
    { deep: true, flush: 'post' }
);

// 歌词字体大小变化时重新计算布局
watch(
    [lyricSize, tlyricSize, rlyricSize],
    () => recalcLyricLayout({ syncBehavior: 'auto' }),
    { flush: 'post' }
);

// 激活行位置预设变化时重新计算布局
watch(
    lyricFollowPosition,
    () => recalcLyricLayout({ syncBehavior: 'instant' }),
    { flush: 'post' }
);

// 当“间奏阈值”调整时，重新校准本歌演唱速率模型
watch(
    () => lyricInterludeTime.value,
    () => {
        recomputeSongTimingModel();
    }
);

// 观察歌词区域的真实可见性（包含 lyrics 存在、显示开关和原文开关，并且有可显示的原文内容）
const lyricAreaVisible = computed(() => {
    return showLyricArea.value;
});

// 当区域从隐藏 -> 显示时，统一走准备流程；隐藏时立即取消旧的 reveal 任务
watch(
    lyricAreaVisible,
    async (visible) => {
        if (visible) {
            await prepareLyricReveal();
            if (shouldShowVisualizer.value) {
                await nextTick();
                ensureVisualizerSizeTracking();
            }
            return;
        }

        invalidateLyricReveal();
    },
    { flush: 'post' }
);

// 可视化器配置发生变化时，规范输入并刷新画布
watch([visualizerFrequencyMinValue, visualizerFrequencyMaxValue], () => {
    renderVisualizerPreview();
});

watch(
    () => lyricVisualizerHeight.value,
    value => {
        const safe = visualizerBaseHeightPx.value;
        if (value !== safe) lyricVisualizerHeight.value = safe;
    },
    { immediate: true }
);

watch(
    [() => lyricVisualizerFrequencyMin.value, () => lyricVisualizerFrequencyMax.value],
    ([min, max]) => {
        const { min: safeMin, max: safeMax } = normalizeFrequencyRange(min, max);
        if (min !== safeMin) lyricVisualizerFrequencyMin.value = safeMin;
        if (max !== safeMax) lyricVisualizerFrequencyMax.value = safeMax;
    },
    { immediate: true }
);

watch(
    () => lyricVisualizerTransitionDelay.value,
    value => {
        const safe = visualizerSmoothing.value;
        if (value !== safe) lyricVisualizerTransitionDelay.value = safe;
    },
    { immediate: true }
);

watch(visualizerHeightPx, () => {
    nextTick(() => {
        updateVisualizerCanvasSize();
        renderVisualizerPreview();
    });
});

watch(visualizerBarCountValue, () => {
    resetVisualizerLevels();
    renderVisualizerPreview();
});

watch(visualizerBarWidthRatio, () => {
    renderVisualizerPreview();
});

watch(visualizerSmoothing, () => {
    if (audioEnv.analyser) {
        syncAnalyserConfig();
    }
    renderVisualizerPreview();
});

watch(
    () => lyricVisualizerStyle.value,
    value => {
        const safe = visualizerStyleValue.value;
        if (value !== safe) lyricVisualizerStyle.value = safe;
    },
    { immediate: true }
);

watch(visualizerStyleValue, () => {
    resetVisualizerLevels();
    nextTick(() => {
        updateVisualizerCanvasSize();
        renderVisualizerPreview();
    });
});

watch(
    () => lyricVisualizerRadialSize.value,
    value => {
        const safe = visualizerRadialSizeValue.value;
        if (value !== safe) lyricVisualizerRadialSize.value = safe;
        renderVisualizerPreview();
    },
    { immediate: true }
);

watch(
    () => lyricVisualizerRadialOffsetX.value,
    value => {
        const safe = visualizerRadialOffsetXValue.value;
        if (value !== safe) lyricVisualizerRadialOffsetX.value = safe;
        renderVisualizerPreview();
    },
    { immediate: true }
);

watch(
    () => lyricVisualizerRadialOffsetY.value,
    value => {
        const safe = visualizerRadialOffsetYValue.value;
        if (value !== safe) lyricVisualizerRadialOffsetY.value = safe;
        renderVisualizerPreview();
    },
    { immediate: true }
);

watch(
    () => lyricVisualizerRadialCoreSize.value,
    value => {
        const safe = visualizerRadialCoreSizeValue.value;
        if (value !== safe) lyricVisualizerRadialCoreSize.value = safe;
        renderVisualizerPreview();
    },
    { immediate: true }
);

watch(
    () => lyricVisualizerColor.value,
    () => {
        renderVisualizerPreview();
    }
);

watch(
    () => lyricVisualizerOpacity.value,
    value => {
        const safe = visualizerOpacityValue.value;
        if (value !== safe) lyricVisualizerOpacity.value = safe;
        renderVisualizerPreview();
    },
    { immediate: true }
);

watch(
    () => lyricVisualizerCanvas.value,
    async canvas => {
        if (!canvas) {
            stopVisualizerLoop({ clear: true, teardown: true });
            canvasCtx = null;
            return;
        }
        await nextTick();
        updateVisualizerCanvasSize();
        renderVisualizerPreview();
        if (!shouldShowVisualizer.value) return;
        await setupVisualizer();
        visualizerPauseState = !playing.value;
        startVisualizerLoop({ force: true });
    }
);

watch(shouldShowVisualizer, active => {
    if (active) {
        nextTick(async () => {
            await setupVisualizer();
            visualizerPauseState = !playing.value;
            startVisualizerLoop({ force: true });
        });
    } else {
        stopVisualizerLoop({ clear: true, teardown: true });
    }
});

watch(
    () => currentMusic.value,
    () => {
        if (!shouldShowVisualizer.value) return;
        nextTick(async () => {
            await setupVisualizer();
            visualizerPauseState = !playing.value;
            if (playing.value) startVisualizerLoop({ force: true });
            else startVisualizerLoop();
        });
    }
);

watch(playing, isPlaying => {
    visualizerPauseState = !isPlaying;
    if (!shouldShowVisualizer.value) return;
    if (isPlaying) startVisualizerLoop({ force: true });
    else startVisualizerLoop();
});

// 增强版的当前歌词索引监听（统一复用 syncLyricPosition，避免重复逻辑导致状态不一致）
const { currentLyricIndex } = storeToRefs(playerStore);
watch(
    currentLyricIndex,
    async (newIndex) => {
        // 若上一行存在已展开的间奏，为防止其收起过渡影响高度测量，启用快速折叠
        if (interludeIndex.value != null && interludeIndex.value !== newIndex) {
            interludeFastClose.value = true;
        }
        lycCurrentIndex.value = newIndex;
        // 普通播放换句保持旧版节奏：DOM patch 后立即启动跟随动画，避免多等一帧导致“高亮先跳、视图后追”
        await nextTick();
        lyricEle.value = getLyricLineElements();
        syncLyricPosition({ behavior: 'smooth' });
        // 短暂延时后恢复正常过渡（供后续可能的间奏展开使用）
        if (interludeFastClose.value) {
            setTimeout(() => { interludeFastClose.value = false; }, 120);
        }
        // 仅在索引变化时做阈值判断，是否展示/收起间奏
        handleInterludeOnIndexChange(newIndex);
    },
    { immediate: true, flush: 'post' }
); // 添加 immediate 选项确保立即执行

const changeProgressLyc = (time, index, item = null) => {
    if (isUntimedLyrics.value || item?.untimed) return;
    clearManualScrollReleaseTimer();
    isManualScrollActive.value = false;
    isLyricActive.value = true;
    lycCurrentIndex.value = index;
    playerStore.currentLyricIndex = index;
    lyricEle.value = getLyricLineElements();
    syncLyricPosition({ behavior: 'smooth', force: true });
    progress.value = time;
    changeProgress(time);
};

// 检测大幅进度跳转（拖动进度条）时立即恢复歌词同步
watch(
    () => progress.value,
    (newVal, oldVal) => {
        // 仅更新倒计时与 <1s 收起，不做阈值判断
        handleInterludeOnProgress();
        if (typeof oldVal !== 'number') return;
        if (Math.abs(newVal - oldVal) <= 1.2) return;
        syncLyricPosition({ behavior: 'smooth' });
    }
);

onMounted(() => {
    visualizerPauseState = !playing.value;
    if (shouldShowVisualizer.value) {
        nextTick(async () => {
            await setupVisualizer();
            visualizerPauseState = !playing.value;
            startVisualizerLoop({ force: true });
        });
    }

    lyricWheelHandler = () => {
        enterManualScrollMode();
    };
    if (lyricScroll.value) {
        lyricScroll.value.addEventListener('wheel', lyricWheelHandler, { passive: true });
    }

    if (showLyricArea.value) {
        void prepareLyricReveal();
    }

    // 监听容器尺寸变化，变化后重新同步（例如窗口尺寸变化、父容器变化、字体替换等）
    if (typeof ResizeObserver !== 'undefined') {
        lyricResizeObserver = new ResizeObserver(() => scheduleLayout());
        if (lyricScroll.value) lyricResizeObserver.observe(lyricScroll.value);
    } else {
        window.addEventListener('resize', scheduleLayout);
    }
});

onUnmounted(() => {
    invalidateLyricReveal();
    clearInterludeTimers();
    clearManualScrollReleaseTimer();
    cancelLyricScrollAnimation();
    if (lyricWheelHandler && lyricScroll.value) {
        lyricScroll.value.removeEventListener('wheel', lyricWheelHandler);
        lyricWheelHandler = null;
    }
    if (lyricResizeObserver) {
        lyricResizeObserver.disconnect();
        lyricResizeObserver = null;
    } else {
        window.removeEventListener('resize', scheduleLayout);
    }
    if (resizeDebounceTimer) { clearTimeout(resizeDebounceTimer); resizeDebounceTimer = 0; }
    stopVisualizerLoop({ clear: true, teardown: true });
    canvasCtx = null;
    analyserDataArray = null;
});

// 间奏进度同步由 progress watcher 驱动，playing/lyricShow 仅需在停止状态时清理（无额外 interval 需要清理）
watch([playing, lyricShow], ([p, show]) => {
    if (!p || !show) {
        // 间奏状态重置
        interludeAnimation.value = false;
        interludeRemainingTime.value = null;
    }
});
</script>

<template>
    <div class="lyric-container" :class="{ 'blur-enabled': lyricBlur }">
        <canvas
            v-if="shouldShowVisualizer"
            ref="lyricVisualizerCanvas"
            class="lyric-visualizer"
            :style="visualizerCanvasStyle"
        ></canvas>
        <Transition name="fade">
            <div
                v-show="showLyricArea"
                class="lyric-area"
                :class="{ 'no-flash': suppressLyricFlash || !lyricAreaReady }"
                ref="lyricScroll"
            >
                <div class="lyric-content" ref="lyricContent">
                <div class="lyric-spacer" :style="{ height: lyricTopSpacerHeight + 'px' }"></div>
                <div class="lyric-line" v-for="(item, index) in lyricsObjArr" v-show="item.lyric" :key="index">
                    <div class="line" @click="changeProgressLyc(item.time, index, item)" :class="{ 'line-highlight': index == lycCurrentIndex, 'lyric-inactive': !isLyricActive || item.active, 'line-static': isUntimedLyrics || item.untimed }">
                        <span class="roma" :style="{ 'font-size': rlyricSize + 'px' }" v-if="item.rlyric && lyricType.indexOf('roma') != -1">{{ item.rlyric }}</span>
                        <span class="original" :style="{ 'font-size': lyricSize + 'px' }" v-if="lyricType.indexOf('original') != -1">{{ item.lyric }}</span>
                        <span class="trans" :style="{ 'font-size': tlyricSize + 'px' }" v-if="item.tlyric && lyricType.indexOf('trans') != -1">{{ item.tlyric }}</span>
                        <div
                            class="hilight"
                            :class="{ 'hilight-active': index == lycCurrentIndex }"
                            :style="{ backgroundColor: videoIsPlaying ? 'var(--lyric-hilight-bg-dim)' : 'var(--lyric-hilight-bg)' }"
                        ></div>
                    </div>
                    <div v-if="lycCurrentIndex != -1 && interludeIndex == index" class="music-interlude" :class="{ 'music-interlude-in': interludeAnimation, 'music-interlude-fast-close': interludeFastClose }">
                        <div class="interlude-left">
                            <div class="diamond">
                                <div class="diamond-inner"></div>
                            </div>
                        </div>
                        <div class="interlude-right">
                            <div class="triangle"></div>
                            <span class="remaining">THE REMAINING TIME: {{ interludeRemainingTime }}</span>
                            <div class="interlude-title">
                                <span class="title">MUSIC INTERLUDE</span>
                                <div class="title-style">
                                    <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="49" height="50" viewBox="0 0 49 50" fill="none">
                                        <defs><rect id="path_0" x="0" y="0" width="49" height="50" /></defs>
                                        <g opacity="1" transform="translate(0 0)  rotate(0 24.5 25)">
                                            <mask id="bg-mask-0" fill="white"><use xlink:href="#path_0" /></mask>
                                            <g mask="url(#bg-mask-0)">
                                                <path id="line" style="fill: #ffffff" transform="translate(46 0)  rotate(0 0.0005 50)" opacity="1" d="" />
                                                <path
                                                    id="line"
                                                    style="stroke: #ffffff; stroke-width: 1; stroke-opacity: 1; stroke-dasharray: 0 0"
                                                    transform="translate(46 0)  rotate(0 0.0005 50)"
                                                    d="M0,0L0,100 "
                                                />
                                                <path id="line" style="fill: #ffffff" transform="translate(27 0)  rotate(0 0.0005 50)" opacity="1" d="" />
                                                <path
                                                    id="line"
                                                    style="stroke: #ffffff; stroke-width: 1; stroke-opacity: 1; stroke-dasharray: 0 0"
                                                    transform="translate(27 0)  rotate(0 0.0005 50)"
                                                    d="M0,0L0,100 "
                                                />
                                                <path id="line" style="fill: #ffffff" transform="translate(48 0)  rotate(0 0.0005 50)" opacity="1" d="" />
                                                <path
                                                    id="line"
                                                    style="stroke: #ffffff; stroke-width: 1; stroke-opacity: 1; stroke-dasharray: 0 0"
                                                    transform="translate(48 0)  rotate(0 0.0005 50)"
                                                    d="M0,0L0,100 "
                                                />
                                                <path id="line" style="fill: #ffffff" transform="translate(19 0)  rotate(0 0.0005 50)" opacity="1" d="" />
                                                <path
                                                    id="line"
                                                    style="stroke: #ffffff; stroke-width: 2; stroke-opacity: 1; stroke-dasharray: 0 0"
                                                    transform="translate(19 0)  rotate(0 0.0005 50)"
                                                    d="M0,0L0,100 "
                                                />
                                                <path id="line" style="fill: #ffffff" transform="translate(34 0)  rotate(0 0.0005 50)" opacity="1" d="" />
                                                <path
                                                    id="line"
                                                    style="stroke: #ffffff; stroke-width: 1; stroke-opacity: 1; stroke-dasharray: 0 0"
                                                    transform="translate(34 0)  rotate(0 0.0005 50)"
                                                    d="M0,0L0,100 "
                                                />
                                                <path id="line" style="fill: #ffffff" transform="translate(16 0)  rotate(0 0.0005 50)" opacity="1" d="" />
                                                <path
                                                    id="line"
                                                    style="stroke: #ffffff; stroke-width: 1; stroke-opacity: 1; stroke-dasharray: 0 0"
                                                    transform="translate(16 0)  rotate(0 0.0005 50)"
                                                    d="M0,0L0,100 "
                                                />
                                                <path id="line" style="fill: #ffffff" transform="translate(43 0)  rotate(0 0.0005 50)" opacity="1" d="" />
                                                <path
                                                    id="line"
                                                    style="stroke: #ffffff; stroke-width: 1; stroke-opacity: 1; stroke-dasharray: 0 0"
                                                    transform="translate(43 0)  rotate(0 0.0005 50)"
                                                    d="M0,0L0,100 "
                                                />
                                                <path id="line" style="fill: #ffffff" transform="translate(43 0)  rotate(0 0.0005 50)" opacity="1" d="" />
                                                <path
                                                    id="line"
                                                    style="stroke: #ffffff; stroke-width: 1; stroke-opacity: 1; stroke-dasharray: 0 0"
                                                    transform="translate(43 0)  rotate(0 0.0005 50)"
                                                    d="M0,0L0,100 "
                                                />
                                                <path id="line" style="fill: #ffffff" transform="translate(23 0)  rotate(0 0.0005 50)" opacity="1" d="" />
                                                <path
                                                    id="line"
                                                    style="stroke: #ffffff; stroke-width: 2; stroke-opacity: 1; stroke-dasharray: 0 0"
                                                    transform="translate(23 0)  rotate(0 0.0005 50)"
                                                    d="M0,0L0,100 "
                                                />
                                                <path id="line" style="fill: #ffffff" transform="translate(12 0)  rotate(0 0.0005 50)" opacity="1" d="" />
                                                <path
                                                    id="line"
                                                    style="stroke: #ffffff; stroke-width: 2; stroke-opacity: 1; stroke-dasharray: 0 0"
                                                    transform="translate(12 0)  rotate(0 0.0005 50)"
                                                    d="M0,0L0,100 "
                                                />
                                                <path id="line" style="fill: #ffffff" transform="translate(5 0)  rotate(0 0.0005 50)" opacity="1" d="" />
                                                <path
                                                    id="line"
                                                    style="stroke: #ffffff; stroke-width: 1; stroke-opacity: 1; stroke-dasharray: 0 0"
                                                    transform="translate(5 0)  rotate(0 0.0005 50)"
                                                    d="M0,0L0,100 "
                                                />
                                                <path id="line" style="fill: #ffffff" transform="translate(8 0)  rotate(0 0.0005 50)" opacity="1" d="" />
                                                <path
                                                    id="line"
                                                    style="stroke: #ffffff; stroke-width: 2; stroke-opacity: 1; stroke-dasharray: 0 0"
                                                    transform="translate(8 0)  rotate(0 0.0005 50)"
                                                    d="M0,0L0,100 "
                                                />
                                                <path id="line" style="fill: #ffffff" transform="translate(30 0)  rotate(0 0.0005 50)" opacity="1" d="" />
                                                <path
                                                    id="line"
                                                    style="stroke: #ffffff; stroke-width: 2; stroke-opacity: 1; stroke-dasharray: 0 0"
                                                    transform="translate(30 0)  rotate(0 0.0005 50)"
                                                    d="M0,0L0,100 "
                                                />
                                                <path id="line" style="fill: #ffffff" transform="translate(1 0)  rotate(0 0.0005 50)" opacity="1" d="" />
                                                <path
                                                    id="line"
                                                    style="stroke: #ffffff; stroke-width: 3; stroke-opacity: 1; stroke-dasharray: 0 0"
                                                    transform="translate(1 0)  rotate(0 0.0005 50)"
                                                    d="M0,0L0,100 "
                                                />
                                                <path id="line" style="fill: #ffffff" transform="translate(40 0)  rotate(0 0.0005 50)" opacity="1" d="" />
                                                <path
                                                    id="line"
                                                    style="stroke: #ffffff; stroke-width: 3; stroke-opacity: 1; stroke-dasharray: 0 0"
                                                    transform="translate(40 0)  rotate(0 0.0005 50)"
                                                    d="M0,0L0,100 "
                                                />
                                            </g>
                                        </g>
                                    </svg>
                                </div>
                            </div>
                            <div class="interlude-progress"></div>
                        </div>
                    </div>
                </div>
                <div class="lyric-spacer" :style="{ height: lyricBottomSpacerHeight + 'px' }"></div>
                </div>
            </div>
        </Transition>
        <Transition name="fade">
            <div v-show="showLyricNoData" class="lyric-nodata">
                <div class="line1"></div>
                <span class="tip">Lyric-Area</span>
                <div class="line2"></div>
            </div>
        </Transition>

        <span class="song-quality" v-if="currentSong && currentSong.type == 'local'">
            {{ currentSong.sampleRate }}KHz/{{ currentSong.bitsPerSample }}Bits/{{ currentSong.bitrate }}Kpbs
        </span>
        <span class="song-quality" v-if="currentSong && currentSong.level && currentSong.level.sr && currentSong.level.br">
            {{ currentSong.level.sr / 1000 }}KHz/{{ Math.round(currentSong.level.br / 1000) }}Kpbs/{{ (currentSong.actualLevel || currentSong.quality || '').toUpperCase() }}
        </span>
        <div class="border border1"></div>
        <div class="border border2"></div>
        <div class="border border3"></div>
        <div class="border border4"></div>
    </div>
</template>

<style scoped lang="scss">
.lyric-container {
    position: relative;
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1;
    .lyric-visualizer {
        position: absolute;
        pointer-events: none;
        z-index: 1;
        opacity: 0.7;
        transition: opacity 0.35s cubic-bezier(0.3, 0, 0.12, 1);
    }
    .lyric-area {
        width: calc(100% - 3vh);
        height: calc(100% - 3vh);
        box-sizing: border-box;
        overflow-x: hidden;
        overflow-y: auto;
        scrollbar-width: none;
        -ms-overflow-style: none;
        overscroll-behavior: contain;
        transition: opacity 0.3s cubic-bezier(0.3, 0, 0.12, 1);
        &::-webkit-scrollbar {
            width: 0;
            height: 0;
            display: none;
        }
        &.no-flash {
            visibility: hidden;
            opacity: 0;
            pointer-events: none;
        }
        &.no-flash, &.no-flash * {
            transition: none !important;
        }
        .lyric-content {
            width: 100%;
            transform: translate3d(0, 0, 0);
            will-change: transform;
        }
        .lyric-spacer {
            width: 100%;
            flex: none;
            pointer-events: none;
            transition: height 0.3s;
        }
        .lyric-line {
            margin-bottom: 10px;
            width: 100%;
            text-align: left;
            transition: 0.58s cubic-bezier(0.4, 0, 0.12, 1);
            .line {
                padding: 10px 130px 10px 25px;
                width: 100%;
                height: 100%;
                position: relative;
                overflow: hidden;
                display: flex;
                flex-direction: column;
                align-items: flex-start;
                transition: all 0.6s cubic-bezier(0.3, 0, 0.12, 1);
                user-select: text;
                &:hover {
                    cursor: pointer;
                    background-color: rgba(0, 0, 0, 0.045);
                }
                &:active {
                    transform: scale(0.9);
                    filter: blur(0) !important;
                }
                &.line-static {
                    &:hover {
                        cursor: default;
                        background-color: transparent;
                    }
                    &:active {
                        transform: none;
                    }
                }
                .original,
                .trans,
                .roma {
                    font: 20px SourceHanSansCN-Bold;
                    font-weight: bold;
                    color: black;
                    text-align: left;
                    display: inline-block;
                    transition: 0.5s cubic-bezier(0.3, 0, 0.12, 1);
                }
                .hilight {
                    width: 100%;
                    height: 100%;
                    background-color: black;
                    position: absolute;
                    z-index: -1;
                    top: 0;
                    left: 0;
                    transform: translateX(-101%);
                    transition: 0.55s cubic-bezier(0.3, 0, 0.12, 1);
                }
                .hilight-active {
                    transform: translateX(0);
                    transition: 0.62s cubic-bezier(0.3, 0, 0.12, 1);
                }
            }
            .lyric-inactive {
                filter: blur(0) !important;
                span {
                    transform: scale(1.05);
                }
            }
            .line-highlight {
                transition-duration: 0.4s;
                .original,
                .trans,
                .roma {
                    transform-origin: left center;
                    transform: scale(1.15) translateX(26px);
                    color: white;
                    transition: 0.4s cubic-bezier(0.3, 0, 0.12, 1);
                }
            }
            .music-interlude {
                padding-top: 0;
                padding-left: 25px;
                width: 240px;
                height: 0;
                opacity: 0;
                transform: scale(0);
                transition: 0.8s cubic-bezier(1, -0.49, 0.61, 0.36);
                display: flex;
                flex-direction: row;
                justify-content: center;
                align-items: center;
                position: relative;
                left: 0;
                &.music-interlude-fast-close{
                    transition: none !important;
                    height: 0 !important;
                    opacity: 0 !important;
                    transform: scale(0) !important;
                }
                .interlude-left {
                    .diamond {
                        width: 28px;
                        height: 28px;
                        border: 2px solid black;
                        transform: rotate(45deg);
                        animation: diamond-rotate 1.6s 0.6s cubic-bezier(0.3, 0, 0.12, 1) infinite;
                        position: relative;
                        @keyframes diamond-rotate {
                            0% {
                                transform: rotate(45deg);
                            }
                            50% {
                                transform: rotate(135deg);
                            }
                            100% {
                                transform: rotate(135deg);
                            }
                        }
                        .diamond-inner {
                            width: 85%;
                            height: 85%;
                            background-color: black;
                            position: absolute;
                            top: 50%;
                            left: 50%;
                            transform: translate(-50%, -50%);
                        }
                    }
                }
                .interlude-right {
                    margin-left: 15px;
                    width: 100%;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    position: relative;
                    .triangle {
                        width: 0;
                        height: 0;
                        border-top: 6px solid black;
                        border-left: 6px solid transparent;
                        position: absolute;
                        top: 1px;
                        right: 0;
                    }
                    .remaining {
                        font: 8px SourceHanSansCN-Bold;
                        color: black;
                        white-space: nowrap;
                    }
                    .interlude-title {
                        padding: 0 4px;
                        width: 100%;
                        background-color: black;
                        display: flex;
                        flex-direction: row;
                        align-items: center;
                        justify-content: space-between;
                        white-space: nowrap;
                        .title {
                            font: 10px SourceHanSansCN-Bold;
                            color: white;
                        }
                        .title-style {
                            width: 15%;
                            height: 8px;
                            overflow: hidden;
                        }
                    }
                    .interlude-progress {
                        margin-top: 3px;
                        width: 100%;
                        height: 4px;
                        background-color: black;
                    }
                }
            }
            .music-interlude-in {
                padding-top: 10px;
                height: 80px;
                opacity: 1;
                transform: scale(1);
                transition: 0.8s cubic-bezier(0.3, 0, 0.12, 1);
            }
        }
    }

    /* 开启歌词模糊后的样式：默认行模糊，当前高亮行清晰 */
    &.blur-enabled {
        .lyric-line {
            .line {
                filter: blur(2px) !important;
                transition: filter 0.25s ease;
            }
            .line.line-highlight {
                filter: none !important;
            }
        }
    }
    .lyric-area-hidden {
        transition: 0.2s cubic-bezier(0.3, 0, 0.12, 1);
        transform: scale(0.85);
        opacity: 0;
    }
    .lyric-nodata {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: row;
        justify-content: center;
        align-items: center;
        position: relative;
        .line1,
        .line2 {
            width: 0;
            height: 0;
            position: absolute;
            background: linear-gradient(to bottom right, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0) calc(50% - 0.5px), rgba(0, 0, 0, 0.8) 50%, rgba(0, 0, 0, 0) calc(50% + 0.5px), rgba(0, 0, 0, 0) 100%);
            animation: nodata-open1 0.8s 0.5s cubic-bezier(0.32, 0.81, 0.56, 0.98) forwards;
            @keyframes nodata-open1 {
                0% {
                    width: 0;
                    height: 0;
                }
                100% {
                    width: 38%;
                    height: 38%;
                }
            }
        }
        .tip {
            font: 16px Bender-Bold;
            color: black;
            white-space: nowrap;
            opacity: 0;
            animation: nodata-open2 0.1s 1.3s forwards;
            @keyframes nodata-open2 {
                10% {
                    opacity: 0;
                }
                20% {
                    opacity: 1;
                }
                30% {
                    opacity: 1;
                }
                40% {
                    opacity: 0;
                }
                50% {
                    opacity: 0;
                }
                60% {
                    opacity: 1;
                }
                70% {
                    opacity: 1;
                }
                80% {
                    opacity: 0;
                }
                90% {
                    opacity: 0;
                }
                100% {
                    opacity: 1;
                }
            }
        }
        .line1 {
            left: 4%;
            bottom: 4%;
        }
        .line2 {
            top: 4%;
            right: 4%;
        }
    }
    .song-quality {
        font: 1.5vh Bender-Bold;
        color: black;
        position: absolute;
        bottom: -0.9vh;
        right: 1.5vh;
    }

    $boderPosition: -0.75 + vh;
    .border {
        width: 1.5vh;
        height: 1.5vh;
        border: 1px solid black;
        position: absolute;
    }
    .border1 {
        top: $boderPosition;
        left: $boderPosition;
    }
    .border2 {
        top: $boderPosition;
        right: $boderPosition;
    }
    .border3 {
        bottom: $boderPosition;
        right: $boderPosition;
        &::after {
            content: '';
            width: 0.5vh;
            height: 0.5vh;
            background-color: black;
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
        }
    }
    .border4 {
        bottom: $boderPosition;
        left: $boderPosition;
    }
}
.fade-enter-active {
    transition: opacity 0.25s cubic-bezier(0.3, 0.79, 0.55, 0.99) !important;
}
.fade-leave-active {
    transition: opacity 0.2s cubic-bezier(0.3, 0.79, 0.55, 0.99) !important;
}
.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}
</style>
