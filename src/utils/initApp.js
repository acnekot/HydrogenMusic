import { usePlayerStore } from '../store/playerStore'
import { useLocalStore } from '../store/localStore'
import { useUserStore } from '../store/userStore'
import { storeToRefs } from 'pinia'
import { getPreferredQuality } from './quality'
import { initializeCurrentAccountSession } from './accountSession'
import { hasStoredBiliSession, migrateLegacyBiliSession } from './biliSession'
import { migrateLegacyAuthSession } from './authority'
import { getSettingsSnapshot, setCachedSettingsSnapshot } from './settingsSnapshot'
import { initPlayerExternalBridge, loadLastSong } from './player/lazy'
import { applyCustomFontStyle, syncDesktopLyricCustomFont } from './setFont'
import { resolveSystemFontOptionAsync, resolveSystemFontValueAsync } from './fontResolver'
import { resolveInitialHifiOutputMode } from './hifiOutputModeMigration'
import settingsSchema from '../shared/settingsSchema.js'

const { normalizeSettings } = settingsSchema

const playerStore = usePlayerStore()
const {
    quality,
    lyricSize,
    tlyricSize,
    rlyricSize,
    lyricInterludeTime,
    searchAssistLimit,
    showSongTranslation,
    gaplessPlayback,
    audioVisualizer,
    localHifiOutput,
    localHifiOutputMode,
    localHifiMpvPath,
    localHifiAudioDevice,
    lyricFollowPosition,
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
    customBackgroundEnabled,
    customBackgroundImage,
    customBackgroundMode,
    customBackgroundBlur,
    customBackgroundBrightness,
    customBackgroundApplyToChrome,
    customBackgroundApplyToPlayer,
    globalZoom,
    commentFontSize,
} = storeToRefs(playerStore)
const localStore = useLocalStore()
const userStore = useUserStore()

let baseInitPromise = null
let deferredInitPromise = null
let deferredInitScheduled = false
let mediaSessionInitialized = false
let sirenDurationPreloadScheduled = false
let lastSongRestoreScheduled = false
let localMusicModulePromise = null
let downloadManagerModulePromise = null
let customFontResolveToken = 0
const APPEARANCE_SETTINGS_MIGRATION_KEY = 'hm.appearanceSettingsMigratedV1'
const LEGACY_MUSIC_SETTING_KEYS = [
    'lyricFollowPosition',
    'lyricVisualizer',
    'lyricVisualizerHeight',
    'lyricVisualizerFrequencyMin',
    'lyricVisualizerFrequencyMax',
    'lyricVisualizerTransitionDelay',
    'lyricVisualizerBarCount',
    'lyricVisualizerBarWidth',
    'lyricVisualizerColor',
    'lyricVisualizerOpacity',
    'lyricVisualizerStyle',
    'lyricVisualizerRadialSize',
    'lyricVisualizerRadialOffsetX',
    'lyricVisualizerRadialOffsetY',
    'lyricVisualizerRadialCoreSize',
    'commentFontSize',
]

function migrateLegacyAppearanceSettings(settings) {
    if (typeof localStorage === 'undefined') return { settings, migrated: false }

    try {
        if (localStorage.getItem(APPEARANCE_SETTINGS_MIGRATION_KEY) === '1') {
            return { settings, migrated: false }
        }

        const rawPlayerStore = localStorage.getItem('playerStore')
        const legacy = rawPlayerStore ? JSON.parse(rawPlayerStore) : null
        if (!legacy || typeof legacy !== 'object') {
            localStorage.setItem(APPEARANCE_SETTINGS_MIGRATION_KEY, '1')
            return { settings, migrated: false }
        }

        const nextMusic = { ...(settings?.music || {}) }
        let migrated = false
        for (const key of LEGACY_MUSIC_SETTING_KEYS) {
            if (!Object.prototype.hasOwnProperty.call(legacy, key)) continue
            nextMusic[key] = legacy[key]
            migrated = true
        }

        const nextOther = { ...(settings?.other || {}) }
        if (Object.prototype.hasOwnProperty.call(legacy, 'globalZoom')) {
            nextOther.globalZoom = legacy.globalZoom
            migrated = true
        }

        const legacyBackground = legacy.customBackground && typeof legacy.customBackground === 'object'
            ? legacy.customBackground
            : null
        const backgroundKeyMap = {
            customBackgroundEnabled: 'enabled',
            customBackgroundImage: 'image',
            customBackgroundMode: 'mode',
            customBackgroundBlur: 'blur',
            customBackgroundBrightness: 'brightness',
            customBackgroundApplyToChrome: 'applyToChrome',
            customBackgroundApplyToPlayer: 'applyToPlayer',
        }
        const nextBackground = {
            ...(nextOther.customBackground || {}),
            ...(legacyBackground || {}),
        }
        if (legacyBackground) migrated = true
        for (const [legacyKey, settingKey] of Object.entries(backgroundKeyMap)) {
            if (!Object.prototype.hasOwnProperty.call(legacy, legacyKey)) continue
            nextBackground[settingKey] = legacy[legacyKey]
            migrated = true
        }
        if (migrated) nextOther.customBackground = nextBackground

        localStorage.setItem(APPEARANCE_SETTINGS_MIGRATION_KEY, '1')
        return {
            settings: migrated
                ? normalizeSettings({ ...settings, music: nextMusic, other: nextOther })
                : settings,
            migrated,
        }
    } catch (_) {
        return { settings, migrated: false }
    }
}

function loadLocalMusicModule() {
    if (!localMusicModulePromise) localMusicModulePromise = import('./locaMusic')
    return localMusicModulePromise
}

function loadDownloadManagerModule() {
    if (!downloadManagerModulePromise) downloadManagerModulePromise = import('./downloadManager')
    return downloadManagerModulePromise
}

function scanMusicDeferred(options) {
    void loadLocalMusicModule()
        .then(({ scanMusic }) => scanMusic(options))
        .catch(error => {
            console.error('本地音乐扫描模块加载失败:', error)
        })
}

const idle = typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function'
    ? callback => window.requestIdleCallback(callback, { timeout: 1000 })
    : callback => setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 0 }), 500)

function applyLocalSettings(settings, { hydrateLocalMusic = false } = {}) {
    const nextDownloadFolder = settings?.local?.downloadFolder || null
    const nextLocalFolders = Array.isArray(settings?.local?.localFolder) ? settings.local.localFolder : []

    localStore.downloadedFolderSettings = nextDownloadFolder
    localStore.localFolderSettings = nextLocalFolders
    localStore.quitApp = settings?.other?.quitApp

    if (!nextDownloadFolder && localStore.downloadedMusicFolder) {
        localStore.downloadedMusicFolder = null
        localStore.downloadedFiles = null
        localStore.lookupIndex = {
            ...localStore.lookupIndex,
            downloadedFoldersByName: {},
            songSearchByScope: {
                ...localStore.lookupIndex.songSearchByScope,
                downloaded: {},
            },
        }
        windowApi.clearLocalMusicData('downloaded')
    } else if (hydrateLocalMusic && nextDownloadFolder && !localStore.downloadedMusicFolder) {
        scanMusicDeferred({ type: 'downloaded', refresh: false })
    }

    if (nextLocalFolders.length === 0 && localStore.localMusicFolder) {
        localStore.localMusicFolder = null
        localStore.localMusicList = null
        localStore.localMusicClassify = null
        localStore.lookupIndex = {
            ...localStore.lookupIndex,
            localFoldersByName: {},
            albumsById: {},
            artistsById: {},
            songSearchByScope: {
                ...localStore.lookupIndex.songSearchByScope,
                local: {},
            },
        }
        windowApi.clearLocalMusicData('local')
    } else if (hydrateLocalMusic && nextLocalFolders.length !== 0 && !localStore.localMusicFolder) {
        scanMusicDeferred({ type: 'local', refresh: false })
    }
}

export function applySettingsSnapshot(settings, options = {}) {
    if (!settings) return null

    const migration = migrateLegacyAppearanceSettings(normalizeSettings(settings))
    const normalizedSettings = setCachedSettingsSnapshot(migration.settings)
    quality.value = getPreferredQuality(normalizedSettings?.music?.level)
    lyricSize.value = normalizedSettings?.music?.lyricSize
    tlyricSize.value = normalizedSettings?.music?.tlyricSize
    rlyricSize.value = normalizedSettings?.music?.rlyricSize
    lyricInterludeTime.value = normalizedSettings?.music?.lyricInterlude
    searchAssistLimit.value = normalizedSettings?.music?.searchAssistLimit
    showSongTranslation.value = normalizedSettings?.music?.showSongTranslation !== false
    gaplessPlayback.value = normalizedSettings?.music?.gaplessPlayback === true
    audioVisualizer.value = normalizedSettings?.music?.audioVisualizer === true
    localHifiOutput.value = normalizedSettings?.music?.localHifiOutput === true
    localHifiOutputMode.value = resolveInitialHifiOutputMode(normalizedSettings?.music?.localHifiOutputMode)
    localHifiMpvPath.value = normalizedSettings?.music?.localHifiMpvPath || ''
    localHifiAudioDevice.value = normalizedSettings?.music?.localHifiAudioDevice || 'auto'
    lyricFollowPosition.value = normalizedSettings?.music?.lyricFollowPosition
    lyricVisualizer.value = normalizedSettings?.music?.lyricVisualizer === true
    lyricVisualizerHeight.value = normalizedSettings?.music?.lyricVisualizerHeight
    lyricVisualizerFrequencyMin.value = normalizedSettings?.music?.lyricVisualizerFrequencyMin
    lyricVisualizerFrequencyMax.value = normalizedSettings?.music?.lyricVisualizerFrequencyMax
    lyricVisualizerTransitionDelay.value = normalizedSettings?.music?.lyricVisualizerTransitionDelay
    lyricVisualizerBarCount.value = normalizedSettings?.music?.lyricVisualizerBarCount
    lyricVisualizerBarWidth.value = normalizedSettings?.music?.lyricVisualizerBarWidth
    lyricVisualizerColor.value = normalizedSettings?.music?.lyricVisualizerColor
    lyricVisualizerOpacity.value = normalizedSettings?.music?.lyricVisualizerOpacity
    lyricVisualizerStyle.value = normalizedSettings?.music?.lyricVisualizerStyle
    lyricVisualizerRadialSize.value = normalizedSettings?.music?.lyricVisualizerRadialSize
    lyricVisualizerRadialOffsetX.value = normalizedSettings?.music?.lyricVisualizerRadialOffsetX
    lyricVisualizerRadialOffsetY.value = normalizedSettings?.music?.lyricVisualizerRadialOffsetY
    lyricVisualizerRadialCoreSize.value = normalizedSettings?.music?.lyricVisualizerRadialCoreSize
    commentFontSize.value = normalizedSettings?.music?.commentFontSize
    const customBackground = normalizedSettings?.other?.customBackground || {}
    customBackgroundEnabled.value = customBackground.enabled === true
    customBackgroundImage.value = customBackground.image || ''
    customBackgroundMode.value = customBackground.mode || 'cover'
    customBackgroundBlur.value = customBackground.blur ?? 0
    customBackgroundBrightness.value = customBackground.brightness ?? 100
    customBackgroundApplyToChrome.value = customBackground.applyToChrome !== false
    customBackgroundApplyToPlayer.value = customBackground.applyToPlayer !== false
    globalZoom.value = normalizedSettings?.other?.globalZoom ?? 1
    try {
        windowApi?.setZoom?.(globalZoom.value)
    } catch (_) {}
    if (migration.migrated) {
        try {
            windowApi?.setSettings?.(JSON.stringify(normalizedSettings))
        } catch (_) {}
    }
    applyCustomFontSetting(normalizedSettings)

    applyLocalSettings(normalizedSettings, options)
    return normalizedSettings
}

function persistResolvedCustomFont(settings, resolvedCustomFont, resolvedCustomFontLabel = '') {
    if (!settings || !resolvedCustomFont) return

    const previousOther = settings.other || {}
    const previousCustomFont = previousOther.customFont || ''
    const previousCustomFontLabel = previousOther.customFontLabel || ''
    const customFontLabel = resolvedCustomFontLabel || previousCustomFontLabel || previousCustomFont
    if (
        previousCustomFont === resolvedCustomFont
        && previousCustomFontLabel === customFontLabel
    ) return

    const nextSettings = normalizeSettings({
        ...settings,
        other: {
            ...previousOther,
            customFont: resolvedCustomFont,
            customFontLabel,
        },
    })

    setCachedSettingsSnapshot(nextSettings)
    try {
        if (typeof windowApi !== 'undefined') windowApi?.setSettings?.(JSON.stringify(nextSettings))
    } catch (_) {}
}

function applyCustomFontSetting(settings) {
    const customFont = settings?.other?.customFont
    const customFontLabel = settings?.other?.customFontLabel || ''
    const insertedFont = applyCustomFontStyle(customFont, customFontLabel)
    const token = ++customFontResolveToken

    if (!insertedFont) {
        syncDesktopLyricCustomFont('', '')
        return
    }

    const needsDisplayLabelResolve = !customFontLabel || customFontLabel === insertedFont
    const resolveFont = needsDisplayLabelResolve
        ? resolveSystemFontOptionAsync(insertedFont, customFontLabel || insertedFont)
        : resolveSystemFontValueAsync(insertedFont).then(value => ({ value, label: customFontLabel }))

    void resolveFont
        .then(({ value: resolvedFont, label: resolvedFontLabel }) => {
            if (token !== customFontResolveToken) return
            if (!resolvedFont) return

            applyCustomFontStyle(resolvedFont, resolvedFontLabel)
            syncDesktopLyricCustomFont(resolvedFont, resolvedFontLabel)
            persistResolvedCustomFont(settings, resolvedFont, resolvedFontLabel)
        })
        .catch(() => {})
}

export async function initSettings(options = {}) {
    const settings = options.settings || await getSettingsSnapshot({ forceReload: options.forceReload === true })
    const shouldHydrateLocalMusic = options.hydrateLocalMusic !== false
    return applySettingsSnapshot(settings, { hydrateLocalMusic: shouldHydrateLocalMusic })
}

function restoreLastSongOnce() {
    if (lastSongRestoreScheduled) return
    lastSongRestoreScheduled = true
    void loadLastSong().catch(error => {
        lastSongRestoreScheduled = false
        console.error('恢复上次播放失败:', error)
    })
}

function resetStartupPlayerState() {
    if (playerStore.listInfo && playerStore.listInfo.type === 'personalfm') {
        playerStore.listInfo = null
        playerStore.songList = null
        playerStore.currentIndex = 0
        playerStore.songId = null
    }
}

async function ensureMediaSessionReady() {
    if (mediaSessionInitialized) return

    try {
        const { initMediaSession } = await import('./mediaSession')
        initMediaSession()
        mediaSessionInitialized = true
    } catch (_) {}
}

function scheduleSirenDurationPreload() {
    if (sirenDurationPreloadScheduled || !userStore.sirenPage) return
    sirenDurationPreloadScheduled = true

    idle(async () => {
        try {
            const { useSirenStore } = await import('../store/sirenStore')
            const sirenStore = useSirenStore()
            await sirenStore.preloadAllDurations()
        } catch (_) {}
    })
}

async function runBaseAppInit() {
    migrateLegacyAuthSession()
    migrateLegacyBiliSession()
    if (!hasStoredBiliSession() && userStore.biliUser) {
        userStore.clearBiliAccountState()
    }

    await initPlayerExternalBridge()
    const { initDownloadManager } = await loadDownloadManagerModule()
    initDownloadManager()
    await initSettings({ hydrateLocalMusic: false })
    resetStartupPlayerState()
}

function ensureBaseAppInit() {
    if (!baseInitPromise) {
        baseInitPromise = runBaseAppInit().catch(error => {
            baseInitPromise = null
            throw error
        })
    }

    return baseInitPromise
}

async function runDeferredAppInit() {
    await ensureBaseAppInit()
    const settings = await initSettings({ hydrateLocalMusic: true })
    const mediaSessionReadyPromise = ensureMediaSessionReady()

    try {
        await initializeCurrentAccountSession()
    } catch (error) {
        console.error('用户信息加载失败:', error)
    } finally {
        restoreLastSongOnce()
    }

    scheduleSirenDurationPreload()
    await mediaSessionReadyPromise
    return settings
}

export function ensureDeferredAppInit() {
    if (!deferredInitPromise) {
        deferredInitPromise = runDeferredAppInit().catch(error => {
            deferredInitPromise = null
            throw error
        })
    }

    return deferredInitPromise
}

export function scheduleDeferredAppInit() {
    if (deferredInitScheduled) return
    deferredInitScheduled = true

    idle(() => {
        void ensureDeferredAppInit()
    })
}

export const init = async () => {
    await ensureBaseAppInit()
    scheduleDeferredAppInit()
}
