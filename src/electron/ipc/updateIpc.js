const { ipcMain } = require('electron')
const axios = require('axios')

function isNewerVersion(candidate, current) {
    const candidateParts = String(candidate).split('.').map(value => parseInt(value, 10) || 0)
    const currentParts = String(current).split('.').map(value => parseInt(value, 10) || 0)
    for (let index = 0; index < Math.max(candidateParts.length, currentParts.length); index += 1) {
        const candidatePart = candidateParts[index] || 0
        const currentPart = currentParts[index] || 0
        if (candidatePart > currentPart) return true
        if (candidatePart < currentPart) return false
    }
    return false
}

function registerUpdateIpc(win, app) {
    let removeActiveCheckListeners = null

    ipcMain.on('check-for-update', async () => {
        if (process.platform === 'darwin') {
            try {
                const current = app.getVersion()
                const api = 'https://api.github.com/repos/ldx123000/Hydrogen-Music/releases/latest'
                const { data } = await axios.get(api, { headers: { 'User-Agent': 'HydrogenMusic-Updater' } })
                let latest = data.tag_name || data.name || ''
                if (typeof latest === 'string' && latest.startsWith('v')) latest = latest.slice(1)

                if (latest && isNewerVersion(latest, current)) {
                    const pageUrl = data.html_url || `https://github.com/ldx123000/Hydrogen-Music/releases/tag/v${latest}`
                    console.log('手动检查更新完成（macOS），发现新版本:', latest, pageUrl)
                    win.webContents.send('manual-update-available', latest, pageUrl)
                } else {
                    console.log('手动检查更新完成（macOS），当前已是最新版本')
                    win.webContents.send('update-not-available')
                }
            } catch (error) {
                console.error('手动检查更新失败（macOS）:', error)
                win.webContents.send('update-error', error.message || '检查更新失败')
            }
            return
        }

        const { autoUpdater } = require('electron-updater')
        removeActiveCheckListeners?.()

        const cleanup = () => {
            autoUpdater.removeListener('update-available', handleUpdateAvailable)
            autoUpdater.removeListener('update-not-available', handleUpdateNotAvailable)
            autoUpdater.removeListener('error', handleUpdateError)
            if (removeActiveCheckListeners === cleanup) removeActiveCheckListeners = null
        }
        const handleUpdateAvailable = info => {
            cleanup()
            console.log('手动检查更新完成，发现新版本:', info.version)
            win.webContents.send('manual-update-available', info.version)
        }
        const handleUpdateNotAvailable = () => {
            cleanup()
            console.log('手动检查更新完成，当前已是最新版本')
            win.webContents.send('update-not-available')
        }
        const handleUpdateError = error => {
            cleanup()
            console.error('手动检查更新失败:', error)
            win.webContents.send('update-error', error.message)
        }

        removeActiveCheckListeners = cleanup
        autoUpdater.once('update-available', handleUpdateAvailable)
        autoUpdater.once('update-not-available', handleUpdateNotAvailable)
        autoUpdater.once('error', handleUpdateError)
        autoUpdater.checkForUpdates().catch(error => {
            cleanup()
            console.error('检查更新失败:', error)
            win.webContents.send('update-error', error.message)
        })
    })

    ipcMain.on('download-update', () => {
        const { autoUpdater } = require('electron-updater')
        console.log('开始下载更新...')
        autoUpdater.downloadUpdate().catch(error => {
            console.error('下载更新失败:', error)
            win.webContents.send('update-error', error.message)
        })
    })

    ipcMain.on('install-update', () => {
        const { autoUpdater } = require('electron-updater')
        console.log('开始安装更新并重启应用...')
        autoUpdater.quitAndInstall()
    })

    ipcMain.on('cancel-update', () => {
        console.log('用户取消了更新')
        win.setProgressBar(-1)
    })
}

module.exports = { isNewerVersion, registerUpdateIpc }
