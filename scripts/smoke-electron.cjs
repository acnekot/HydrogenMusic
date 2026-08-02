const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '..')
const electronPath = require('electron')
const smokeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hydrogenmusic-smoke-'))
const userDataPath = path.join(smokeRoot, 'user-data')
let settled = false

const child = spawn(electronPath, ['.', `--user-data-dir=${userDataPath}`], {
    cwd: projectRoot,
    env: {
        ...process.env,
        HYDROGENMUSIC_SMOKE_TEST: '1',
        ELECTRON_ENABLE_LOGGING: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
})

let stdout = ''
let stderr = ''
child.stdout.on('data', chunk => {
    const text = chunk.toString()
    stdout += text
    process.stdout.write(text)
})
child.stderr.on('data', chunk => {
    const text = chunk.toString()
    stderr += text
    process.stderr.write(text)
})

function cleanup() {
    try { fs.rmSync(smokeRoot, { recursive: true, force: true }) } catch (_) {}
}

const timeout = setTimeout(() => {
    if (settled) return
    settled = true
    child.kill()
    cleanup()
    console.error('Electron smoke test timed out')
    process.exitCode = 1
}, 30000)

child.on('error', error => {
    if (settled) return
    settled = true
    clearTimeout(timeout)
    cleanup()
    console.error(error)
    process.exitCode = 1
})

child.on('exit', code => {
    if (settled) return
    settled = true
    clearTimeout(timeout)
    cleanup()

    const ready = stdout.includes('ELECTRON_SMOKE_READY') || stderr.includes('ELECTRON_SMOKE_READY')
    if (code !== 0 || !ready) {
        console.error(`Electron smoke test failed (exit ${code}, ready ${ready})`)
        process.exitCode = 1
        return
    }
    console.log('Electron smoke test passed')
})
