let bridgeInitialized = false
let bridgeDisposers = []

function addWindowListener(eventName, handler, options) {
    window.addEventListener(eventName, handler, options)
    return () => {
        window.removeEventListener(eventName, handler, options)
    }
}

function pushDisposable(candidate) {
    if (typeof candidate !== 'function') return
    bridgeDisposers.push(candidate)
}

function resetBridgeDisposers() {
    while (bridgeDisposers.length > 0) {
        const dispose = bridgeDisposers.pop()
        try {
            dispose()
        } catch (_) {}
    }
}

export function initPlayerExternalBridge(handlers = {}) {
    if (bridgeInitialized) return
    bridgeInitialized = true

    pushDisposable(addWindowListener('mousedown', event => {
        handlers.onMouseDown?.(event)
    }))
    pushDisposable(addWindowListener('mouseup', event => {
        handlers.onMouseUp?.(event)
    }))
    pushDisposable(addWindowListener('click', event => {
        handlers.onWindowClick?.(event)
    }))

    if (typeof windowApi !== 'undefined') {
        pushDisposable(windowApi.playOrPauseMusic((event) => handlers.onPlayOrPause?.(event)))
        pushDisposable(windowApi.lastOrNextMusic((event, option) => handlers.onLastOrNext?.(event, option)))
        pushDisposable(windowApi.changeMusicPlaymode((event, mode) => handlers.onPlayModeChange?.(event, mode)))
        pushDisposable(windowApi.volumeUp(() => handlers.onVolumeUp?.()))
        pushDisposable(windowApi.volumeDown(() => handlers.onVolumeDown?.()))
        pushDisposable(windowApi.musicProcessControl((event, mode) => handlers.onProgressControl?.(event, mode)))
        pushDisposable(windowApi.beforeQuit(() => handlers.onBeforeQuit?.()))
    }

}

export function destroyPlayerExternalBridge() {
    if (!bridgeInitialized) return
    bridgeInitialized = false
    resetBridgeDisposers()
}
