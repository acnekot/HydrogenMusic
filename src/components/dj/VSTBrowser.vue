<template>
    <div class="vst-browser-overlay" @click.self="djStore.closeVstBrowser()">
        <div class="vst-browser">
            <div class="vst-header">
                <div class="vst-title">VST3 插件浏览器</div>
                <button class="vst-close" @click="djStore.closeVstBrowser()">×</button>
            </div>

            <div class="vst-scan-bar">
                <div class="vst-scan-paths">
                    <div class="scan-path" v-for="(p, i) in djStore.vst3ScanPaths" :key="i">
                        <span>{{ p }}</span>
                        <button class="remove-path" @click="removePath(i)">×</button>
                    </div>
                </div>
                <div class="vst-scan-actions">
                    <button class="dj-btn" @click="addScanPath">添加目录</button>
                    <button
                        class="dj-btn"
                        :disabled="djStore.vst3Scanning || djStore.vst3ScanPaths.length === 0"
                        @click="djStore.scanVst3()"
                    >
                        {{ djStore.vst3Scanning ? '扫描中...' : '扫描' }}
                    </button>
                </div>
            </div>

            <div class="vst-search">
                <input
                    type="text"
                    v-model="searchQuery"
                    placeholder="搜索插件..."
                    class="vst-search-input"
                />
            </div>

            <div class="vst-list">
                <div
                    class="vst-item"
                    v-for="plugin in filteredPlugins"
                    :key="plugin.id"
                    @click="selectPlugin(plugin)"
                >
                    <div class="vst-item-name">{{ plugin.name }}</div>
                    <div class="vst-item-vendor">{{ plugin.vendor || '—' }}</div>
                </div>
                <div v-if="filteredPlugins.length === 0" class="vst-empty">
                    {{ djStore.vst3Plugins.length === 0 ? '请添加目录并扫描 VST3 插件' : '无匹配插件' }}
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useDjStore } from '../../store/djStore'

const djStore = useDjStore()
const searchQuery = ref('')

const filteredPlugins = computed(() => {
    const q = searchQuery.value.toLowerCase().trim()
    if (!q) return djStore.vst3Plugins
    return djStore.vst3Plugins.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.vendor && p.vendor.toLowerCase().includes(q))
    )
})

async function addScanPath() {
    try {
        const result = await window.windowApi.openFile()
        if (result) {
            // 取目录部分
            const dir = result.replace(/[/\\][^/\\]*$/, '')
            if (!djStore.vst3ScanPaths.includes(dir)) {
                djStore.vst3ScanPaths.push(dir)
            }
        }
    } catch (_) {}
}

function removePath(index) {
    djStore.vst3ScanPaths.splice(index, 1)
}

async function selectPlugin(plugin) {
    const target = djStore.vstBrowserTarget
    if (!target) return

    try {
        await djStore.loadFx(target.deck, target.slot, plugin.id, plugin.name)
        djStore.closeVstBrowser()
    } catch (e) {
        console.error('[VST3] Load failed:', e)
    }
}
</script>

<style lang="scss" scoped>
.vst-browser-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 999;
}

.vst-browser {
    width: 480px;
    max-height: 70vh;
    background: var(--panel);
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.vst-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
}

.vst-title {
    font-size: 14px;
    font-weight: bold;
}

.vst-close {
    background: none;
    border: none;
    color: var(--muted-text);
    font-size: 20px;
    cursor: pointer;
    padding: 0 4px;

    &:hover {
        color: var(--text);
    }
}

.vst-scan-bar {
    padding: 8px 16px;
    border-bottom: 1px solid var(--border);
}

.vst-scan-paths {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-bottom: 6px;
}

.scan-path {
    display: flex;
    align-items: center;
    gap: 4px;
    background: var(--layer);
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;

    .remove-path {
        background: none;
        border: none;
        color: var(--muted-text);
        cursor: pointer;
        font-size: 12px;
        padding: 0;

        &:hover { color: #ff4444; }
    }
}

.vst-scan-actions {
    display: flex;
    gap: 6px;
}

.dj-btn {
    background: var(--layer);
    border: none;
    color: var(--text);
    padding: 4px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;

    &:hover { background: var(--border); }
    &:disabled { opacity: 0.4; cursor: default; }
}

.vst-search {
    padding: 8px 16px;
}

.vst-search-input {
    width: 100%;
    background: var(--layer);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 13px;
    color: var(--text);
    outline: none;
    box-sizing: border-box;

    &::placeholder { color: var(--muted-text); }
    &:focus { border-color: rgba(255, 255, 255, 0.3); }
}

.vst-list {
    flex: 1;
    overflow-y: auto;
    padding: 4px 8px 8px;
}

.vst-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.15s;

    &:hover {
        background: var(--layer);
    }
}

.vst-item-name {
    font-size: 13px;
}

.vst-item-vendor {
    font-size: 11px;
    color: var(--muted-text);
}

.vst-empty {
    text-align: center;
    padding: 24px;
    color: var(--muted-text);
    font-size: 13px;
}
</style>
