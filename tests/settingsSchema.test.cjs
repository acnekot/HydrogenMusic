const test = require('node:test')
const assert = require('node:assert/strict')
const {
    getDefaultSettings,
    normalizeSettings,
} = require('../src/shared/settingsSchema.cjs')

test('appearance settings use stable defaults', () => {
    const settings = normalizeSettings()

    assert.equal(settings.music.lyricFollowPosition, 'center')
    assert.equal(settings.music.lyricVisualizer, false)
    assert.equal(settings.music.commentFontSize, 13)
    assert.equal(settings.other.globalZoom, 1)
    assert.deepEqual(settings.other.customBackground, {
        enabled: false,
        image: '',
        mode: 'cover',
        blur: 0,
        brightness: 100,
        applyToChrome: true,
        applyToPlayer: true,
    })
})

test('appearance numeric values are bounded', () => {
    const settings = normalizeSettings({
        music: {
            lyricVisualizerHeight: 900,
            lyricVisualizerFrequencyMin: 19990,
            lyricVisualizerFrequencyMax: 30,
            lyricVisualizerTransitionDelay: -4,
            lyricVisualizerBarCount: 500,
            lyricVisualizerBarWidth: 0,
            lyricVisualizerOpacity: 101,
            lyricVisualizerRadialOffsetX: -400,
            lyricVisualizerRadialCoreSize: 100,
            commentFontSize: 3,
        },
        other: {
            globalZoom: 10,
            customBackground: {
                blur: 100,
                brightness: 0,
            },
        },
    })

    assert.equal(settings.music.lyricVisualizerHeight, 480)
    assert.equal(settings.music.lyricVisualizerFrequencyMin, 19990)
    assert.equal(settings.music.lyricVisualizerFrequencyMax, 20000)
    assert.equal(settings.music.lyricVisualizerTransitionDelay, 0)
    assert.equal(settings.music.lyricVisualizerBarCount, 128)
    assert.equal(settings.music.lyricVisualizerBarWidth, 10)
    assert.equal(settings.music.lyricVisualizerOpacity, 100)
    assert.equal(settings.music.lyricVisualizerRadialOffsetX, -100)
    assert.equal(settings.music.lyricVisualizerRadialCoreSize, 95)
    assert.equal(settings.music.commentFontSize, 8)
    assert.equal(settings.other.globalZoom, 3)
    assert.equal(settings.other.customBackground.blur, 80)
    assert.equal(settings.other.customBackground.brightness, 10)
})

test('invalid enum and color values fall back safely', () => {
    const settings = normalizeSettings({
        music: {
            lyricFollowPosition: 'sideways',
            lyricVisualizerStyle: 'wave',
            lyricVisualizerColor: 'url(javascript:alert(1))',
        },
        other: {
            customBackground: { mode: 'tile' },
        },
    })

    assert.equal(settings.music.lyricFollowPosition, 'center')
    assert.equal(settings.music.lyricVisualizerStyle, 'bars')
    assert.equal(settings.music.lyricVisualizerColor, 'black')
    assert.equal(settings.other.customBackground.mode, 'cover')
})

test('legacy top-level custom background migrates into other settings', () => {
    const settings = normalizeSettings({
        customBackground: {
            enabled: true,
            image: 'D:\\Pictures\\背景 #1.png',
            mode: 'contain',
            blur: 12,
            brightness: 88,
            applyToChrome: false,
            applyToPlayer: true,
        },
    })

    assert.equal(settings.other.customBackground.enabled, true)
    assert.equal(settings.other.customBackground.image, 'D:\\Pictures\\背景 #1.png')
    assert.equal(settings.other.customBackground.mode, 'contain')
    assert.equal(settings.other.customBackground.blur, 12)
    assert.equal(settings.other.customBackground.brightness, 88)
    assert.equal(settings.other.customBackground.applyToChrome, false)
    assert.equal(settings.other.customBackground.applyToPlayer, true)
})

test('normalization does not mutate default settings', () => {
    const defaultsBefore = getDefaultSettings()
    const customized = normalizeSettings({
        music: { lyricVisualizer: true },
        other: { customBackground: { enabled: true } },
    })

    customized.other.customBackground.image = 'changed.png'
    assert.deepEqual(getDefaultSettings(), defaultsBefore)
})
