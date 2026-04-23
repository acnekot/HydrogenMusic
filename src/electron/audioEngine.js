const { spawn } = require('child_process')
const path = require('path')
const readline = require('readline')

let engineProc = null
let pendingCalls = new Map()
let callId = 0
let eventListeners = []
let lineReader = null

/**
 * 获取音频引擎可执行文件路径
 */
function getEnginePath(app) {
    const exeName = process.platform === 'win32'
        ? 'hydrogen-audio-engine.exe'
        : 'hydrogen-audio-engine'

    if (app && app.isPackaged) {
        return path.join(process.resourcesPath, exeName)
    }

    // 开发模式：从 cargo target 目录获取
    const profile = process.env.AUDIO_ENGINE_DEBUG ? 'debug' : 'release'
    return path.join(__dirname, '..', '..', 'audio-engine', 'target', profile, exeName)
}

/**
 * 启动音频引擎子进程
 * @param {Electron.App} app - Electron app 实例
 * @returns {Promise<void>} 引擎就绪后 resolve
 */
function startEngine(app) {
    return new Promise((resolve, reject) => {
        if (engineProc) {
            resolve()
            return
        }

        const enginePath = getEnginePath(app)
        console.log('[AudioEngine] Starting:', enginePath)

        try {
            engineProc = spawn(enginePath, [], {
                stdio: ['pipe', 'pipe', 'pipe'],
                windowsHide: true,
            })
        } catch (err) {
            reject(new Error(`Failed to spawn audio engine: ${err.message}`))
            return
        }

        // 解析 stdout（newline-delimited JSON）
        lineReader = readline.createInterface({
            input: engineProc.stdout,
            crlfDelay: Infinity,
        })

        let readyResolved = false

        lineReader.on('line', (line) => {
            if (!line.trim()) return

            let msg
            try {
                msg = JSON.parse(line)
            } catch (e) {
                console.warn('[AudioEngine] Invalid JSON from engine:', line)
                return
            }

            // Ready 事件
            if (msg.event === 'ready' && !readyResolved) {
                readyResolved = true
                console.log('[AudioEngine] Ready, version:', msg.version)
                resolve()
                return
            }

            // RPC 响应（有 id）
            if (msg.id !== undefined && msg.id !== null) {
                const pending = pendingCalls.get(msg.id)
                if (pending) {
                    pendingCalls.delete(msg.id)
                    if (msg.error) {
                        pending.reject(new Error(msg.error.message || JSON.stringify(msg.error)))
                    } else {
                        pending.resolve(msg.result)
                    }
                }
                return
            }

            // 事件推送（无 id，有 event）
            if (msg.event) {
                for (const listener of eventListeners) {
                    try {
                        listener(msg)
                    } catch (e) {
                        console.error('[AudioEngine] Event listener error:', e)
                    }
                }
            }
        })

        // stderr 转发到控制台
        engineProc.stderr.on('data', (data) => {
            console.warn('[AudioEngine STDERR]', data.toString().trim())
        })

        engineProc.on('error', (err) => {
            console.error('[AudioEngine] Process error:', err)
            if (!readyResolved) {
                readyResolved = true
                reject(err)
            }
        })

        engineProc.on('exit', (code, signal) => {
            console.log(`[AudioEngine] Exited with code=${code} signal=${signal}`)
            cleanup()
            if (!readyResolved) {
                readyResolved = true
                reject(new Error(`Engine exited unexpectedly: code=${code}`))
            }
        })

        // 5 秒超时
        setTimeout(() => {
            if (!readyResolved) {
                readyResolved = true
                reject(new Error('Audio engine startup timeout (5s)'))
            }
        }, 5000)
    })
}

/**
 * 调用引擎 RPC 方法
 * @param {string} method - 方法名
 * @param {object} params - 参数
 * @returns {Promise<any>} 结果
 */
function call(method, params = {}) {
    return new Promise((resolve, reject) => {
        if (!engineProc || !engineProc.stdin.writable) {
            reject(new Error('Audio engine not running'))
            return
        }

        const id = ++callId
        const msg = JSON.stringify({ id, method, params })

        pendingCalls.set(id, { resolve, reject })

        // 10 秒超时
        const timeout = setTimeout(() => {
            if (pendingCalls.has(id)) {
                pendingCalls.delete(id)
                reject(new Error(`RPC timeout: ${method}`))
            }
        }, 10000)

        // 实际 resolve/reject 时清除超时
        const origResolve = resolve
        const origReject = reject
        pendingCalls.set(id, {
            resolve: (val) => { clearTimeout(timeout); origResolve(val) },
            reject: (err) => { clearTimeout(timeout); origReject(err) },
        })

        engineProc.stdin.write(msg + '\n')
    })
}

/**
 * 注册引擎事件监听
 * @param {function} callback - 回调函数，接收事件对象
 * @returns {function} 取消注册函数
 */
function onEvent(callback) {
    eventListeners.push(callback)
    return () => {
        const idx = eventListeners.indexOf(callback)
        if (idx !== -1) eventListeners.splice(idx, 1)
    }
}

/**
 * 停止音频引擎
 */
function stopEngine() {
    if (engineProc) {
        try {
            engineProc.stdin.end()
            engineProc.kill('SIGTERM')
        } catch (_) {}

        // 强制杀死（1秒后）
        setTimeout(() => {
            try {
                if (engineProc) engineProc.kill('SIGKILL')
            } catch (_) {}
        }, 1000)
    }
    cleanup()
}

function cleanup() {
    engineProc = null
    if (lineReader) {
        lineReader.close()
        lineReader = null
    }
    // 拒绝所有待处理的调用
    for (const [id, pending] of pendingCalls) {
        pending.reject(new Error('Engine stopped'))
    }
    pendingCalls.clear()
}

/**
 * 检查引擎是否正在运行
 */
function isRunning() {
    return engineProc !== null && !engineProc.killed
}

module.exports = {
    startEngine,
    call,
    onEvent,
    stopEngine,
    isRunning,
}
