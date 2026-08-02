const test = require('node:test')
const assert = require('node:assert/strict')
const { isNewerVersion } = require('../src/electron/ipc/updateIpc')

test('update version comparison handles equal, older, and newer releases', () => {
    assert.equal(isNewerVersion('0.6.2', '0.6.2'), false)
    assert.equal(isNewerVersion('0.6.1', '0.6.2'), false)
    assert.equal(isNewerVersion('0.6.3', '0.6.2'), true)
    assert.equal(isNewerVersion('1.0.0', '0.9.9'), true)
    assert.equal(isNewerVersion('0.6.2.1', '0.6.2'), true)
})
