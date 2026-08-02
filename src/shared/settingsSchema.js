import settingsDefaults from './settingsDefaults.json'

export const DEFAULT_MUSIC_LEVEL = settingsDefaults.defaultMusicLevel

export const MUSIC_LEVEL_OPTIONS = Object.freeze(settingsDefaults.musicLevelOptions.map(option => Object.freeze({ ...option })))

const AVAILABLE_MUSIC_LEVELS = new Set(MUSIC_LEVEL_OPTIONS.map(option => option.value))
const AVAILABLE_LOCAL_HIFI_OUTPUT_MODES = new Set(['shared', 'exclusive'])
const AVAILABLE_LYRIC_FOLLOW_POSITIONS = new Set(['top', 'center', 'bottom'])
const AVAILABLE_LYRIC_VISUALIZER_STYLES = new Set(['bars', 'radial'])
const AVAILABLE_CUSTOM_BACKGROUND_MODES = new Set(['cover', 'contain', 'stretch', 'center'])
const LEGACY_LOCAL_HIFI_OUTPUT_MODE_MAP = Object.freeze({
    auto: 'shared',
    'wasapi-shared': 'shared',
    'wasapi-exclusive': 'exclusive',
})
const DEFAULT_SETTINGS = Object.freeze(clonePlain(settingsDefaults.defaultSettings))

function clonePlain(value) {
    return JSON.parse(JSON.stringify(value))
}

export function getDefaultSettings() {
    return clonePlain(DEFAULT_SETTINGS)
}

export function normalizeSearchAssistLimit(value) {
    const num = Number.parseInt(value, 10)
    if (!Number.isFinite(num)) return DEFAULT_SETTINGS.music.searchAssistLimit
    return Math.max(1, num)
}

export function normalizeMusicLevel(level) {
    return AVAILABLE_MUSIC_LEVELS.has(level) ? level : DEFAULT_MUSIC_LEVEL
}

export function normalizeLocalHifiOutputMode(mode) {
    const value = typeof mode === 'string' ? mode.trim() : ''
    const migratedValue = LEGACY_LOCAL_HIFI_OUTPUT_MODE_MAP[value] || value
    return AVAILABLE_LOCAL_HIFI_OUTPUT_MODES.has(migratedValue) ? migratedValue : DEFAULT_SETTINGS.music.localHifiOutputMode
}

function normalizeCustomText(value, fallback) {
    if (typeof value !== 'string') return fallback
    return value.replace(/[\n\r\f]/g, ' ').trim().slice(0, 120)
}

function normalizeCustomLongText(value, fallback) {
    if (typeof value !== 'string') return fallback
    return value.replace(/[\n\r\f]/g, ' ').trim().slice(0, 260)
}

function normalizeOptionalPlainText(value, fallback = '') {
    if (typeof value !== 'string') return fallback
    return value.replace(/[\n\r\f]/g, ' ').trim()
}

function normalizeOptionalPathText(value) {
    if (typeof value !== 'string') return null
    const trimmedValue = value.trim()
    return trimmedValue || null
}

function normalizeNumber(value, min, max, fallback, { integer = false } = {}) {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return fallback
    const bounded = Math.min(max, Math.max(min, numeric))
    return integer ? Math.round(bounded) : bounded
}

function normalizeVisualizerColor(value) {
    if (value === 'black' || value === 'white') return value
    if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value.trim())) return value.trim()
    return DEFAULT_SETTINGS.music.lyricVisualizerColor
}

function normalizeCustomBackground(background = {}) {
    const source = background && typeof background === 'object' ? background : {}
    const defaults = DEFAULT_SETTINGS.other.customBackground
    const mode = typeof source.mode === 'string' ? source.mode.trim() : ''

    return {
        enabled: source.enabled === true,
        image: normalizeOptionalPlainText(source.image, defaults.image),
        mode: AVAILABLE_CUSTOM_BACKGROUND_MODES.has(mode) ? mode : defaults.mode,
        blur: normalizeNumber(source.blur, 0, 80, defaults.blur),
        brightness: normalizeNumber(source.brightness, 10, 200, defaults.brightness),
        applyToChrome: source.applyToChrome !== false,
        applyToPlayer: source.applyToPlayer !== false,
    }
}

export function normalizeMusicSettings(music = {}) {
    const normalized = { ...music }
    normalized.searchAssistLimit = normalizeSearchAssistLimit(normalized.searchAssistLimit)
    normalized.level = normalizeMusicLevel(normalized.level)
    normalized.showSongTranslation = normalized.showSongTranslation !== false
    normalized.gaplessPlayback = normalized.gaplessPlayback === true
    normalized.audioVisualizer = normalized.audioVisualizer === true
    normalized.lyricFollowPosition = AVAILABLE_LYRIC_FOLLOW_POSITIONS.has(normalized.lyricFollowPosition)
        ? normalized.lyricFollowPosition
        : DEFAULT_SETTINGS.music.lyricFollowPosition
    normalized.lyricVisualizer = normalized.lyricVisualizer === true
    normalized.lyricVisualizerHeight = normalizeNumber(normalized.lyricVisualizerHeight, 80, 480, DEFAULT_SETTINGS.music.lyricVisualizerHeight, { integer: true })
    normalized.lyricVisualizerFrequencyMin = normalizeNumber(normalized.lyricVisualizerFrequencyMin, 20, 19990, DEFAULT_SETTINGS.music.lyricVisualizerFrequencyMin, { integer: true })
    normalized.lyricVisualizerFrequencyMax = normalizeNumber(normalized.lyricVisualizerFrequencyMax, 30, 20000, DEFAULT_SETTINGS.music.lyricVisualizerFrequencyMax, { integer: true })
    if (normalized.lyricVisualizerFrequencyMax <= normalized.lyricVisualizerFrequencyMin) {
        normalized.lyricVisualizerFrequencyMax = Math.min(20000, normalized.lyricVisualizerFrequencyMin + 10)
    }
    normalized.lyricVisualizerTransitionDelay = normalizeNumber(normalized.lyricVisualizerTransitionDelay, 0, 0.95, DEFAULT_SETTINGS.music.lyricVisualizerTransitionDelay)
    normalized.lyricVisualizerBarCount = normalizeNumber(normalized.lyricVisualizerBarCount, 8, 128, DEFAULT_SETTINGS.music.lyricVisualizerBarCount, { integer: true })
    normalized.lyricVisualizerBarWidth = normalizeNumber(normalized.lyricVisualizerBarWidth, 10, 100, DEFAULT_SETTINGS.music.lyricVisualizerBarWidth, { integer: true })
    normalized.lyricVisualizerColor = normalizeVisualizerColor(normalized.lyricVisualizerColor)
    normalized.lyricVisualizerOpacity = normalizeNumber(normalized.lyricVisualizerOpacity, 0, 100, DEFAULT_SETTINGS.music.lyricVisualizerOpacity, { integer: true })
    normalized.lyricVisualizerStyle = AVAILABLE_LYRIC_VISUALIZER_STYLES.has(normalized.lyricVisualizerStyle)
        ? normalized.lyricVisualizerStyle
        : DEFAULT_SETTINGS.music.lyricVisualizerStyle
    normalized.lyricVisualizerRadialSize = normalizeNumber(normalized.lyricVisualizerRadialSize, 20, 200, DEFAULT_SETTINGS.music.lyricVisualizerRadialSize, { integer: true })
    normalized.lyricVisualizerRadialOffsetX = normalizeNumber(normalized.lyricVisualizerRadialOffsetX, -100, 100, DEFAULT_SETTINGS.music.lyricVisualizerRadialOffsetX, { integer: true })
    normalized.lyricVisualizerRadialOffsetY = normalizeNumber(normalized.lyricVisualizerRadialOffsetY, -100, 100, DEFAULT_SETTINGS.music.lyricVisualizerRadialOffsetY, { integer: true })
    normalized.lyricVisualizerRadialCoreSize = normalizeNumber(normalized.lyricVisualizerRadialCoreSize, 10, 95, DEFAULT_SETTINGS.music.lyricVisualizerRadialCoreSize, { integer: true })
    normalized.commentFontSize = normalizeNumber(normalized.commentFontSize, 8, 32, DEFAULT_SETTINGS.music.commentFontSize, { integer: true })
    normalized.localHifiOutput = normalized.localHifiOutput === true
    normalized.localHifiOutputMode = normalizeLocalHifiOutputMode(normalized.localHifiOutputMode)
    normalized.localHifiMpvPath = normalizeOptionalPlainText(normalized.localHifiMpvPath, DEFAULT_SETTINGS.music.localHifiMpvPath)
    normalized.localHifiAudioDevice = normalizeCustomLongText(normalized.localHifiAudioDevice, DEFAULT_SETTINGS.music.localHifiAudioDevice) || 'auto'
    delete normalized.levelMigratedToLosslessV1
    return normalized
}

function normalizeOtherSettings(other = {}) {
    const normalized = { ...other }
    normalized.customFont = normalizeCustomText(normalized.customFont, DEFAULT_SETTINGS.other.customFont)
    normalized.customFontLabel = normalizeCustomText(normalized.customFontLabel, DEFAULT_SETTINGS.other.customFontLabel)
    if (!normalized.customFont) normalized.customFontLabel = DEFAULT_SETTINGS.other.customFontLabel
    normalized.globalZoom = normalizeNumber(normalized.globalZoom, 0.5, 3, DEFAULT_SETTINGS.other.globalZoom)
    normalized.customBackground = normalizeCustomBackground(normalized.customBackground)
    return normalized
}

export function normalizeSettings(settings = {}) {
    const defaults = getDefaultSettings()
    const source = settings && typeof settings === 'object' ? settings : {}
    const legacyBackground = source.customBackground && typeof source.customBackground === 'object'
        ? source.customBackground
        : null
    const sourceOther = source.other && typeof source.other === 'object' ? source.other : {}
    const normalized = {
        ...defaults,
        ...source,
        music: normalizeMusicSettings({
            ...defaults.music,
            ...(source.music && typeof source.music === 'object' ? source.music : {}),
        }),
        local: {
            ...defaults.local,
            ...(source.local && typeof source.local === 'object' ? source.local : {}),
        },
        shortcuts: Array.isArray(source.shortcuts) ? clonePlain(source.shortcuts) : defaults.shortcuts,
        other: normalizeOtherSettings({
            ...defaults.other,
            ...sourceOther,
            customBackground: sourceOther.customBackground || legacyBackground || defaults.other.customBackground,
        }),
    }

    normalized.local.localFolder = Array.isArray(normalized.local.localFolder)
        ? Array.from(new Set(normalized.local.localFolder.map(normalizeOptionalPathText).filter(Boolean)))
        : []
    normalized.local.videoFolder = normalizeOptionalPathText(normalized.local.videoFolder)
    normalized.local.downloadFolder = normalizeOptionalPathText(normalized.local.downloadFolder)
    return normalized
}

export default {
    DEFAULT_MUSIC_LEVEL,
    MUSIC_LEVEL_OPTIONS,
    getDefaultSettings,
    normalizeLocalHifiOutputMode,
    normalizeMusicLevel,
    normalizeMusicSettings,
    normalizeSearchAssistLimit,
    normalizeSettings,
}
