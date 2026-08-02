const { ipcMain } = require('electron')

function registerDesktopLyricIpc(win, lyricFunctions = {}) {
    const { createLyricWindow, closeLyricWindow, setLyricWindowMovable, getLyricWindow } = lyricFunctions
    let lyricWindowRef = null

    const isLyricWindowDestroyed = lyricWindow => {
        try {
            return !lyricWindow || lyricWindow.isDestroyed?.()
        } catch (_) {
            return true
        }
    }

    const getSafeLyricWindow = () => {
        let lyricWindow = lyricWindowRef
        if (isLyricWindowDestroyed(lyricWindow)) {
            lyricWindowRef = null
            try {
                lyricWindow = getLyricWindow && getLyricWindow()
            } catch (_) {
                lyricWindow = null
            }
        }
        if (isLyricWindowDestroyed(lyricWindow)) return null
        lyricWindowRef = lyricWindow
        return lyricWindow
    }

    const withLyricWindow = (operation, missingFallback = null, errorFallback = missingFallback) => {
        const lyricWindow = getSafeLyricWindow()
        if (!lyricWindow) return missingFallback
        try {
            return operation(lyricWindow)
        } catch (error) {
            return typeof errorFallback === 'function' ? errorFallback(error) : errorFallback
        }
    }

    const sendLyricWindowUpdate = data => withLyricWindow(lyricWindow => {
        if (!lyricWindow.webContents || lyricWindow.webContents.isDestroyed?.()) return false
        lyricWindow.webContents.send('lyric-update', data)
        return true
    }, false)

    ipcMain.handle('create-lyric-window', async () => {
        try {
            if (!createLyricWindow) return { success: false, message: '桌面歌词功能不可用' }
            const lyricWindow = createLyricWindow()
            if (!lyricWindow) return { success: false, message: '创建窗口失败' }

            lyricWindowRef = lyricWindow
            lyricWindow.on('closed', () => {
                lyricWindowRef = null
            })
            return { success: true, message: '桌面歌词窗口已创建' }
        } catch (_) {
            return { success: false, message: '创建失败' }
        }
    })

    ipcMain.handle('close-lyric-window', async () => {
        try {
            if (!closeLyricWindow) return { success: false, message: '桌面歌词功能不可用' }
            closeLyricWindow()
            return { success: true, message: '桌面歌词窗口已关闭' }
        } catch (_) {
            return { success: false, message: '关闭失败' }
        }
    })

    ipcMain.handle('set-lyric-window-movable', async (_event, movable) => {
        try {
            if (!setLyricWindowMovable) return { success: false, message: '桌面歌词功能不可用' }
            setLyricWindowMovable(movable)
            return { success: true, message: '窗口移动状态已更新' }
        } catch (_) {
            return { success: false, message: '设置失败' }
        }
    })

    ipcMain.on('lyric-window-ready', () => {})
    ipcMain.on('update-lyric-data', (_event, data) => sendLyricWindowUpdate(data))
    ipcMain.on('request-lyric-data', () => win.webContents.send('get-current-lyric-data'))
    ipcMain.on('current-lyric-data', (_event, data) => sendLyricWindowUpdate(data))
    ipcMain.handle('is-lyric-window-visible', () => withLyricWindow(lyricWindow => lyricWindow.isVisible(), false))

    ipcMain.handle('resize-lyric-window', (_event, { width, height } = {}) => withLyricWindow(
        lyricWindow => {
            lyricWindow.setSize(width, height)
            return { success: true }
        },
        { success: false, error: '窗口不存在' },
        error => ({ success: false, error: error.message })
    ))

    ipcMain.handle('get-lyric-window-bounds', () => withLyricWindow(lyricWindow => lyricWindow.getBounds(), null))

    ipcMain.on('move-lyric-window', (_event, { x, y } = {}) => {
        if (typeof x !== 'number' || typeof y !== 'number') return
        withLyricWindow(lyricWindow => lyricWindow.setPosition(Math.round(x), Math.round(y)))
    })

    ipcMain.on('move-lyric-window-by', (_event, { dx, dy } = {}) => {
        if (process.platform === 'darwin') return
        if (typeof dx !== 'number' || typeof dy !== 'number') return
        withLyricWindow(lyricWindow => {
            const { x, y } = lyricWindow.getBounds()
            lyricWindow.setPosition(Math.round(x + dx), Math.round(y + dy))
        })
    })

    ipcMain.on('move-lyric-window-to', (_event, { x, y, width, height } = {}) => {
        if (process.platform === 'darwin') return
        if (![x, y, width, height].every(value => typeof value === 'number')) return
        withLyricWindow(lyricWindow => {
            lyricWindow.setBounds({
                x: Math.round(x),
                y: Math.round(y),
                width: Math.round(width),
                height: Math.round(height),
            })
        })
    })

    ipcMain.handle('get-lyric-window-min-max', () => {
        if (process.platform === 'darwin') return null
        return withLyricWindow(lyricWindow => {
            const [minWidth, minHeight] = lyricWindow.getMinimumSize()
            const [maxWidth, maxHeight] = lyricWindow.getMaximumSize()
            return { minWidth, minHeight, maxWidth, maxHeight }
        }, null)
    })

    ipcMain.on('set-lyric-window-min-max', (_event, { minWidth, minHeight, maxWidth, maxHeight } = {}) => {
        if (process.platform === 'darwin') return
        withLyricWindow(lyricWindow => {
            if (typeof minWidth === 'number' && typeof minHeight === 'number') {
                lyricWindow.setMinimumSize(Math.max(0, Math.round(minWidth)), Math.max(0, Math.round(minHeight)))
            }
            if (typeof maxWidth === 'number' && typeof maxHeight === 'number') {
                lyricWindow.setMaximumSize(Math.max(0, Math.round(maxWidth)), Math.max(0, Math.round(maxHeight)))
            }
        })
    })

    ipcMain.on('set-lyric-window-aspect-ratio', (_event, { aspectRatio } = {}) => {
        if (process.platform === 'darwin') return
        withLyricWindow(lyricWindow => {
            const ratio = typeof aspectRatio === 'number' ? aspectRatio : 0
            lyricWindow.setAspectRatio(ratio > 0 ? ratio : 0)
        })
    })

    ipcMain.handle('get-lyric-window-content-bounds', () => {
        if (process.platform === 'darwin') return null
        return withLyricWindow(lyricWindow => lyricWindow.getContentBounds(), null)
    })

    ipcMain.on('move-lyric-window-content-to', (_event, { x, y, width, height } = {}) => {
        if (process.platform === 'darwin') return
        if (![x, y, width, height].every(value => typeof value === 'number')) return
        withLyricWindow(lyricWindow => {
            lyricWindow.setContentBounds({
                x: Math.round(x),
                y: Math.round(y),
                width: Math.round(width),
                height: Math.round(height),
            })
        })
    })

    ipcMain.on('set-lyric-window-resizable', (_event, { resizable } = {}) => {
        if (process.platform !== 'win32') return
        withLyricWindow(lyricWindow => lyricWindow.setResizable(!!resizable))
    })

    ipcMain.on('lyric-window-closed', () => {
        win.webContents.send('desktop-lyric-closed')
    })
}

module.exports = { registerDesktopLyricIpc }
