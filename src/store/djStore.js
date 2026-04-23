import { defineStore } from 'pinia'

function createDefaultDeck() {
    return {
        loaded: false,
        path: null,
        title: null,
        artist: null,
        cover: null,
        bpm: null,
        position: 0,
        duration: 0,
        playing: false,
        gain: 1.0,
        eq: { low: 0, mid: 0, high: 0 },
        cues: [null, null, null, null],
        loopStart: null,
        loopEnd: null,
        fxChain: [
            { pluginId: null, pluginName: null, active: false, dryWet: 1.0 },
            { pluginId: null, pluginName: null, active: false, dryWet: 1.0 },
            { pluginId: null, pluginName: null, active: false, dryWet: 1.0 },
            { pluginId: null, pluginName: null, active: false, dryWet: 1.0 },
        ],
        waveform: null,
    }
}

export const useDjStore = defineStore('djStore', {
    state: () => ({
        // 引擎状态
        engineRunning: false,
        engineError: null,

        // 双 Deck
        decks: [createDefaultDeck(), createDefaultDeck()],

        // Crossfader
        crossfader: 0.5,
        crossfaderCurve: 'equal-power',

        // Master
        masterVolume: 1.0,

        // 耳机监听
        headphonesDeck: null, // null / 0 / 1 / 'both'

        // BPM 同步
        bpmSyncEnabled: false,

        // VST3 相关
        vst3ScanPaths: [],
        vst3Plugins: [],
        vst3Scanning: false,

        // UI 状态
        vstBrowserOpen: false,
        vstBrowserTarget: null, // { deck: 0, slot: 0 }
        activeDeck: 0, // 当前选中的 Deck（移动端/小屏切换用）

        // 位置更新定时器 ID（不持久化）
        _positionPollTimer: null,
    }),

    getters: {
        deckA: (state) => state.decks[0],
        deckB: (state) => state.decks[1],

        deckABpm: (state) => state.decks[0].bpm,
        deckBBpm: (state) => state.decks[1].bpm,
    },

    actions: {
        // ===== 引擎生命周期 =====

        async startEngine() {
            if (this.engineRunning) return
            try {
                const result = await window.djApi.start()
                if (result.ok) {
                    this.engineRunning = true
                    this.engineError = null
                    window.djApi.subscribe()
                    this._startPositionPolling()
                } else {
                    this.engineError = result.error || 'Unknown error'
                }
            } catch (e) {
                this.engineError = e.message
            }
        },

        async stopEngine() {
            this._stopPositionPolling()
            try {
                await window.djApi.stop()
            } catch (_) {}
            this.engineRunning = false
        },

        // ===== Deck 操作 =====

        async loadTrack(deck, { path, title, artist, cover }) {
            if (!this.engineRunning) await this.startEngine()
            try {
                await window.djApi.call('deck.load', { deck, path })
                this.decks[deck].loaded = true
                this.decks[deck].path = path
                this.decks[deck].title = title || path.split(/[/\\]/).pop()
                this.decks[deck].artist = artist || ''
                this.decks[deck].cover = cover || null
                this.decks[deck].playing = false
                this.decks[deck].position = 0
                this.decks[deck].cues = [null, null, null, null]
                this.decks[deck].loopStart = null
                this.decks[deck].loopEnd = null

                // 请求波形
                const wf = await window.djApi.call('waveform.request', { deck, width: 1024 })
                this.decks[deck].waveform = wf.data

                // 获取时长
                const pos = await window.djApi.call('deck.getPosition', { deck })
                this.decks[deck].duration = pos.durationSamples

                // 分析 BPM
                try {
                    const bpmResult = await window.djApi.call('bpm.analyze', { deck })
                    this.decks[deck].bpm = bpmResult.bpm
                } catch (_) {}
            } catch (e) {
                console.error(`[DJ] Load track failed for deck ${deck}:`, e)
                throw e
            }
        },

        async playDeck(deck) {
            await window.djApi.call('deck.play', { deck })
            this.decks[deck].playing = true
        },

        async pauseDeck(deck) {
            await window.djApi.call('deck.pause', { deck })
            this.decks[deck].playing = false
        },

        async stopDeck(deck) {
            await window.djApi.call('deck.stop', { deck })
            this.decks[deck].playing = false
            this.decks[deck].position = 0
        },

        async seekDeck(deck, positionSamples) {
            await window.djApi.call('deck.seek', { deck, positionSamples })
            this.decks[deck].position = positionSamples
        },

        async setDeckGain(deck, gain) {
            await window.djApi.call('deck.setGain', { deck, gain })
            this.decks[deck].gain = gain
        },

        // ===== Cue =====

        async setCue(deck, cueIndex) {
            const pos = this.decks[deck].position
            await window.djApi.call('deck.setCue', { deck, cueIndex, positionSamples: pos })
            this.decks[deck].cues[cueIndex] = pos
        },

        async jumpToCue(deck, cueIndex) {
            await window.djApi.call('deck.jumpToCue', { deck, cueIndex })
            const cuePos = this.decks[deck].cues[cueIndex]
            if (cuePos !== null) {
                this.decks[deck].position = cuePos
            }
        },

        async setLoop(deck, startSamples, endSamples) {
            await window.djApi.call('deck.setLoop', { deck, startSamples, endSamples })
            this.decks[deck].loopStart = startSamples
            this.decks[deck].loopEnd = endSamples
        },

        async clearLoop(deck) {
            await window.djApi.call('deck.setLoop', { deck, startSamples: null, endSamples: null })
            this.decks[deck].loopStart = null
            this.decks[deck].loopEnd = null
        },

        // ===== Crossfader =====

        async setCrossfader(value) {
            await window.djApi.call('crossfader.set', { value })
            this.crossfader = value
        },

        async setCrossfaderCurve(curve) {
            await window.djApi.call('crossfader.setCurve', { curve })
            this.crossfaderCurve = curve
        },

        // ===== EQ =====

        async setEq(deck, band, gainDb) {
            await window.djApi.call('eq.set', { deck, band, gainDb })
            this.decks[deck].eq[band] = gainDb
        },

        // ===== FX Chain =====

        async loadFx(deck, slot, pluginId, pluginName) {
            await window.djApi.call('vst3.load', { deck, slot, pluginId })
            this.decks[deck].fxChain[slot].pluginId = pluginId
            this.decks[deck].fxChain[slot].pluginName = pluginName
            this.decks[deck].fxChain[slot].active = true
        },

        async unloadFx(deck, slot) {
            await window.djApi.call('vst3.unload', { deck, slot })
            this.decks[deck].fxChain[slot].pluginId = null
            this.decks[deck].fxChain[slot].pluginName = null
            this.decks[deck].fxChain[slot].active = false
            this.decks[deck].fxChain[slot].dryWet = 1.0
        },

        async setFxParam(deck, slot, paramId, value) {
            await window.djApi.call('fx.setParam', { deck, slot, paramId, value })
        },

        async setFxDryWet(deck, slot, value) {
            await window.djApi.call('fx.setDryWet', { deck, slot, value })
            this.decks[deck].fxChain[slot].dryWet = value
        },

        // ===== VST3 扫描 =====

        async scanVst3() {
            if (this.vst3ScanPaths.length === 0) return
            this.vst3Scanning = true
            try {
                const plugins = await window.djApi.call('vst3.scan', { paths: this.vst3ScanPaths })
                this.vst3Plugins = plugins
            } catch (e) {
                console.error('[DJ] VST3 scan failed:', e)
            } finally {
                this.vst3Scanning = false
            }
        },

        // ===== BPM Sync =====

        async syncBpm(sourceDeck, targetDeck) {
            await window.djApi.call('bpm.sync', { deck: sourceDeck, targetDeck })
        },

        // ===== Master =====

        async setMasterVolume(volume) {
            await window.djApi.call('master.setVolume', { volume })
            this.masterVolume = volume
        },

        // ===== 位置轮询 =====

        _startPositionPolling() {
            this._stopPositionPolling()
            this._positionPollTimer = setInterval(async () => {
                for (let d = 0; d < 2; d++) {
                    if (!this.decks[d].loaded) continue
                    try {
                        const pos = await window.djApi.call('deck.getPosition', { deck: d })
                        this.decks[d].position = pos.positionSamples
                        if (pos.bpm && !this.decks[d].bpm) {
                            this.decks[d].bpm = pos.bpm
                        }
                    } catch (_) {}
                }
            }, 50) // 50ms = 20fps 位置更新
        },

        _stopPositionPolling() {
            if (this._positionPollTimer) {
                clearInterval(this._positionPollTimer)
                this._positionPollTimer = null
            }
        },

        // ===== VST 浏览器 =====

        openVstBrowser(deck, slot) {
            this.vstBrowserTarget = { deck, slot }
            this.vstBrowserOpen = true
        },

        closeVstBrowser() {
            this.vstBrowserOpen = false
            this.vstBrowserTarget = null
        },
    },

    persist: {
        storage: localStorage,
        pick: [
            'crossfaderCurve',
            'masterVolume',
            'vst3ScanPaths',
        ],
    },
})
