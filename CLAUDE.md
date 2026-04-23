# HydrogenMusic - AI 开发说明文档

> 本文档面向 AI 助手（如 Claude），提供项目各模块的深度分析与开发注意事项。

---

## 项目概述

**HydrogenMusic** 是一个基于 Electron + Vue 3 的桌面音乐播放器，主要接入网易云音乐 API。

- **上游仓库**：https://github.com/ldx123000/Hydrogen-Music
- **本地魔改 Fork**：https://github.com/acnekot/HydrogenMusic
- **版本**：0.5.9
- **技术栈**：Vue 3 + Vite + Pinia + Electron + Howler.js

---

## 目录结构

```
HydrogenMusic-main/
├── background.js          # Electron 主进程入口
├── package.json
├── vite.config.js
├── src/
│   ├── main.js            # Vue 应用入口，挂载 App，注册全局 CSS
│   ├── App.vue            # 根组件，全局 CSS 变量注入，布局框架
│   ├── desktop-lyric.js   # 桌面歌词独立渲染入口
│   ├── api/               # 网络请求封装
│   ├── assets/            # 静态资源（字体、CSS、图片、图标）
│   ├── components/        # 全局通用组件
│   ├── composables/       # Vue 组合式函数
│   ├── electron/          # Electron IPC 相关（preload、主进程处理器）
│   ├── router/            # Vue Router 路由定义
│   ├── store/             # Pinia 状态管理
│   ├── utils/             # 工具函数
│   └── views/             # 路由页面组件
└── scripts/               # 构建脚本
```

---

## 核心模块分析

### 1. 应用入口

#### `src/main.js`
- 创建 Vue 应用，注册 Pinia、Router
- 全局引入 `src/assets/css/fonts.css`（字体声明）
- 挂载到 `#app`

#### `background.js`（Electron 主进程）
- 创建 BrowserWindow，加载 Vite 构建产物
- 托管 IPC 事件处理
- 管理系统托盘、窗口状态、全局快捷键
- 启动内嵌 API 服务（`@neteasecloudmusicapienhanced/api`）

---

### 2. 状态管理 (`src/store/`)

使用 **Pinia** + **pinia-plugin-persistedstate**，共 7 个 Store。

#### `playerStore.js` ⭐ 最核心
管理播放器所有状态。

**主要字段：**
| 字段 | 说明 |
|------|------|
| `playing` | 是否正在播放 |
| `progress` | 播放进度（秒） |
| `volume` | 音量 0~1 |
| `playMode` | 0=顺序 1=列表循环 2=单曲循环 3=随机 |
| `songList` | 当前播放列表 |
| `currentIndex` | 当前歌曲索引 |
| `quality` | 当前音质 |
| `lyric` / `lyricsObjArr` | 歌词原始文本 / 解析后的对象数组 |
| `currentLyricIndex` | 当前歌词行索引（桌面歌词同步用） |
| `lyricSize/tlyricSize/rlyricSize` | 歌词/翻译/罗马音字体大小 |
| `lyricInterludeTime` | 歌词间奏等待时间 |
| `showSongTranslation` | 是否显示歌曲翻译名 |
| `isDesktopLyricOpen` | 桌面歌词是否打开 |
| `coverBlur` | 播放页封面模糊背景 |

**魔改新增字段（自定义背景）：**
| 字段 | 说明 |
|------|------|
| `customBackgroundEnabled` | 是否启用自定义背景 |
| `customBackgroundImage` | 背景图片路径 |
| `customBackgroundMode` | 展示模式（cover/contain/...） |
| `customBackgroundBlur` | 模糊强度 |
| `customBackgroundBrightness` | 亮度百分比 |
| `customBackgroundApplyToChrome` | 是否应用到全局界面 |
| `customBackgroundApplyToPlayer` | 是否应用到播放页 |

**魔改新增字段（歌词可视化器）：**
| 字段 | 默认值 | 说明 |
|------|--------|------|
| `lyricVisualizer` | false | 是否启用 |
| `lyricVisualizerHeight` | 220 | 可视化区域高度 |
| `lyricVisualizerFrequencyMin/Max` | 20/8000 | 频率范围 |
| `lyricVisualizerTransitionDelay` | 0.75 | 过渡延迟 |
| `lyricVisualizerBarCount` | 48 | 频谱条数量 |
| `lyricVisualizerBarWidth` | 55 | 频谱条宽度百分比 |
| `lyricVisualizerColor` | 'black' | 颜色 |
| `lyricVisualizerOpacity` | 100 | 透明度 |
| `lyricVisualizerStyle` | 'bars' | 样式（bars/radial） |
| `lyricVisualizerRadialSize` | 100 | 径向大小 |
| `lyricVisualizerRadialOffsetX/Y` | 0/0 | 径向偏移 |
| `lyricVisualizerRadialCoreSize` | 62 | 径向核心大小 |

**⚠️ 重要：`persist.pick[]` 数组**

只有在 `pick[]` 数组中的字段才会被 localStorage 持久化。向 playerStore 新增需要持久化的字段时，**必须同时将字段名加入 `pick[]`**，否则刷新/重启后会丢失。

当前未持久化的字段（仅内存）：`currentMusic`、`playing`、`songList`、`lyric`、`lyricsObjArr`、`lyricShow`、`playerShow`、`widgetState` 等。

---

#### `userStore.js`
- 用户登录状态、用户信息、头像
- 功能页面显隐控制：`homePage`、`cloudDiskPage`、`sirenPage`
- B 站账号状态

#### `otherStore.js`
- UI 状态：全局弹窗（`dialogShow`/`dialogHeader`/`dialogText`）、全局通知
- 搜索相关：搜索关键词、搜索结果
- 右键菜单状态
- MV 播放器状态

#### `cloudStore.js`
- 云盘文件列表、分页状态

#### `localStore.js`
- 本地音乐文件列表、分类（专辑/艺术家）
- 下载目录、本地目录配置
- 查找索引（快速检索本地歌曲）
- `quitApp` 关闭行为设置

#### `libraryStore.js`
- 当前打开的歌单/专辑/艺术家详情
- 歌曲列表、分页加载

#### `sirenStore.js`
- Siren HiFi 音源专用状态
- 歌曲时长预加载缓存

---

### 3. 工具函数 (`src/utils/`)

#### `player.js` ⭐ 播放器核心
- 基于 **Howler.js** 实现音频播放
- 管理播放/暂停、切歌、进度、音量
- 歌词加载与解析入口
- 调用 `musicUrlResolver.js` 解析播放链接
- 调用 `quality.js` 选择最优音质
- 与 `player/playlistPersistence.js` 协作持久化播放列表
- 与 `player/externalBridge.js` 协作暴露外部控制（MPRIS/托盘）
- 与 `player/playbackTicker.js` 协作心跳 tick（进度更新）

#### `initApp.js` ⭐ 应用初始化
两阶段初始化：

```
init()
  └─ ensureBaseAppInit()        # 同步、必须、快速
       ├─ migrateLegacyAuthSession()
       ├─ migrateLegacyBiliSession()
       ├─ initPlayerExternalBridge()
       ├─ initDownloadManager()
       └─ initSettings({ hydrateLocalMusic: false })
  └─ scheduleDeferredAppInit()  # 异步、延迟、空闲时执行
       ├─ initSettings({ hydrateLocalMusic: true })
       ├─ initializeCurrentAccountSession()
       ├─ restoreLastSong()
       ├─ scheduleSirenDurationPreload()
       └─ ensureMediaSessionReady()
```

**`applySettingsSnapshot(settings)`**：将 Electron 持久化 settings 对象应用到各 store。**这是 Settings 页保存后更新 store 的标准路径**。

#### `settingsSnapshot.js` ⭐ 设置缓存层
防止 Settings 页重复触发 IPC 调用。

```javascript
getSettingsSnapshot({ forceReload: false })  // 读设置（有缓存则用缓存）
setCachedSettingsSnapshot(settings)           // 写缓存
clearCachedSettingsSnapshot()                 // 清空缓存
```

**⚠️ 注意**：修改设置后必须调用 `setCachedSettingsSnapshot` 或 `applySettingsSnapshot` 更新缓存，否则下次 `getSettingsSnapshot` 会返回旧数据。

#### `lyricCore.js`
- 歌词文本解析（LRC 格式 → 时间戳对象数组）
- 翻译歌词、罗马音歌词合并
- 歌词行索引二分查找

#### `lyricVisualizerAudio.js`（魔改新增）
- Web Audio API 音频分析节点封装
- 频谱数据采集，供 `Lyric.vue` 的 Canvas 绘制使用
- 支持频率范围过滤（`frequencyMin/Max`）

#### `desktopLyric.js`
- 桌面歌词窗口控制逻辑
- 通过 `windowApi` IPC 与主进程通信

#### `musicUrlResolver.js`
- 解析歌曲播放 URL
- 根据用户选择的音质尝试获取对应 URL
- 降级逻辑：高音质不可用时自动降至低音质

#### `quality.js`
- 音质等级映射（standard/higher/exhigh/lossless/hires）
- `getPreferredQuality(level)` 从 settings 读取首选音质

#### `settingsSnapshot.js`
见上方说明。

#### `downloadManager.js`
- 下载任务队列管理
- 通过 IPC 与 Electron 主进程下载模块通信

#### `accountSession.js` / `accountState.js`
- 用户账号 Session 维护
- Cookie 管理、登录态检测

#### `biliSession.js`
- B 站账号 Session 管理（魔改功能）

#### `commentScrollMemory.js`
- 记忆评论区滚动位置

---

### 4. Electron IPC (`src/electron/`)

#### `preload.js` ⭐ IPC 桥接层
通过 `contextBridge.exposeInMainWorld` 暴露三个全局对象：

| 全局对象 | 用途 |
|---------|------|
| `window.windowApi` | 窗口控制、设置读写、本地音乐扫描 |
| `window.electronAPI` | 下载管理、歌词控制、系统集成 |
| `window.playerApi` | 播放控制（音量、播放状态通知） |

**常用 `windowApi` 方法：**
```javascript
windowApi.getSettings()           // 读取持久化设置（返回 Promise）
windowApi.setSettings(settings)   // 写入持久化设置
windowApi.openFileDialog()        // 打开文件选择对话框
windowApi.selectBackground()      // 选择背景图片（魔改）
windowApi.getDesktopLyricState()  // 桌面歌词状态
windowApi.openDesktopLyric()      // 开启桌面歌词
windowApi.closeDesktopLyric()     // 关闭桌面歌词
```

#### `ipcMain.js`
- 所有 IPC 事件的主进程处理器
- 对接 `electron-store` 读写 `settingsStore.json`
- 窗口最大化/最小化/关闭
- 下载文件、本地音乐扫描

#### `shortcuts.js`
- 全局快捷键注册（Electron `globalShortcut`）
- 支持媒体键（播放/暂停/上一首/下一首）

#### `tray.js`
- 系统托盘图标与菜单

#### `mpris.js`
- Linux MPRIS2 媒体控制接口（D-Bus）

---

### 5. 组件 (`src/components/`)

#### `Lyric.vue` ⭐ 歌词页面（魔改重点）
- 歌词文本滚动显示，支持主歌词/翻译/罗马音
- **魔改功能 1：Canvas 频谱可视化器**
  - `lyricVisualizerAudio.js` 提供音频分析数据
  - Canvas 绘制 bars 或 radial 两种样式
  - `setupVisualizer()` 初始化，`startVisualizerLoop()` 启动动画
  - 在 `onMounted` 中初始化
- **魔改功能 2：MV 检测按钮**（`musicVideoCheck` 相关）
- 手动滚动模式：使用 `enterManualScrollMode()` + `lyricWheelHandler` ref（上游重构模式，注意不要回退到旧的内联 wheel handler）
- Watch 歌词大小变化 → `recalcLyricLayout()`
- Watch 可视化器配置变化 → 重新初始化可视化器

#### `Player.vue` ⭐ 播放器底部控制栏
- 进度条、音量、播放控制按钮
- 封面图、歌曲名、艺术家
- **魔改功能：自定义背景** 通过 CSS 变量 + 伪元素实现

#### `GlobalDialog.vue`
- 全局确认对话框
- 从 `otherStore` 读取 `dialogShow/dialogHeader/dialogText`
- `dialogCancel()` / `dialogConfirm()` 触发 Promise resolve/reject

#### `DesktopLyric.vue`（魔改新增/扩展）
- 独立窗口渲染的桌面歌词组件
- 通过 `currentLyricIndex` store 字段同步歌词行

#### `MusicWidget.vue`
- 迷你播放器小组件（悬浮在其他页面上方）

#### `Comments.vue` / `CommentText.vue`
- 评论区展示
- 支持表情渲染（`emojiParser.js`）

---

### 6. 页面 (`src/views/`)

#### `Settings.vue` ⭐ 设置页面（有修改）
**关键流程：**
```
onActivated → getSettingsSnapshot() → applySettingsToForm(settings)
onBeforeRouteLeave → setAppSettings() → windowApi.setSettings() + applySettingsSnapshot()
```

**`applySettingsToForm(settings)`**：将持久化 settings 填充到所有表单 ref。  
**`setAppSettings()`**：收集所有表单 ref，构建 settings 对象，写入 Electron store 并更新 Pinia。

**设置字段分组：**
- `music.level` 音质
- `music.lyricSize/tlyricSize/rlyricSize` 歌词字体
- `music.lyricInterlude` 间奏等待
- `music.searchAssistLimit` 搜索建议数量
- `music.showSongTranslation` 翻译名显示
- `local.downloadFolder` 下载目录
- `local.localFolder[]` 本地音乐目录
- `other.globalShortcuts` 全局快捷键开关
- `other.quitApp` 关闭行为
- `other.theme` 主题
- `customBackground.*` 自定义背景（魔改）

**⚠️ 注意**：新增设置项需要同时在以下三处修改：
1. `Settings.vue` - `applySettingsToForm()` 读取
2. `Settings.vue` - `setAppSettings()` 写入
3. `initApp.js` - `applySettingsSnapshot()` 应用到 store（如需影响 store）

---

### 7. 路由 (`src/router/router.js`)

使用 **Hash History**（适配 Electron file:// 协议）。

| 路由 | 组件 | 认证要求 |
|------|------|---------|
| `/` | HomePage | `userStore.homePage` 为 true |
| `/mymusic` | MyMusic | 需登录 |
| `/mymusic/playlist/:id` | LibraryDetail | 需登录 |
| `/cloud` | CloudDisk | 需登录 |
| `/personalfm` | PersonalFMPage | 需登录 |
| `/search` | SearchResult | 无 |
| `/siren` | SirenPage | 无 |
| `/settings` | Settings | 无 |

所有路由组件均为**懒加载**（`() => import(...)`）。

导航到 `/mymusic`、`/cloud`、`/personalfm`、`/siren` 时自动触发 `ensureDeferredAppInit()`。

---

### 8. API 模块 (`src/api/`)

| 文件 | 说明 |
|------|------|
| `song.js` | 歌曲信息、URL、歌词、喜欢 |
| `playlist.js` | 歌单操作（获取/更新） |
| `user.js` | 用户信息、喜欢列表 |
| `album.js` | 专辑信息 |
| `artist.js` | 艺术家信息 |
| `cloud.js` | 云盘文件 |
| `mv.js` | MV 信息 |
| `dj.js` | DJ 电台 |
| `siren.js` | Siren HiFi 音源接口 |
| `login.js` | 登录接口（扫码/账号密码） |
| `base.js` | Axios 实例，baseURL 指向内嵌 API 服务 |
| `params.js` | 公共请求参数 |
| `errorHandler.js` | 统一错误处理 |
| `other.js` | 杂项接口（搜索、banner 等） |

---

### 9. 组合式函数 (`src/composables/`)

#### `usePlayer.js`
- 对 `player.js` 中函数的 Vue 组合式封装
- 在组件中使用：`const { play, pause, next, prev } = usePlayer()`

#### `usePlayerRuntime.js`
- 200ms 心跳 tick，同步当前歌词行索引
- `syncLyricIndexForSeek(time)` 跳转后立即同步歌词索引
- 由 `player.js` 调用 `subscribePlaybackTick` 驱动

#### `useSongList.js`
- 歌曲列表通用操作（添加到队列、播放等）

---

### 10. 资源 (`src/assets/`)

#### 字体（全部本地 `@font-face`，无外部依赖）
| 字体名 | 文件 | 用途 |
|--------|------|------|
| SourceHanSansCN-Heavy | `.otf` | 标题、重要文字 |
| SourceHanSansCN-Bold | `.otf` | 正文、按钮 |
| Bender-Bold | `.woff` | 时间数字显示 |
| Geometos | `.woff` | 装饰性英文 |
| Gilroy-ExtraBold | `.woff` | 装饰性英文 |

在 `src/assets/css/fonts.css` 中声明，`src/main.js` 全局引入。  
**⚠️ 不要用 Google Fonts 或 CDN 字体**，项目完全离线运行。

#### CSS 文件
| 文件 | 说明 |
|------|------|
| `fonts.css` | @font-face 声明 |
| `reset.css` | 浏览器样式重置 |
| `common.css` | 全局通用样式 |
| `style.css` | 主要布局样式 |
| `theme.css` | 主题色 CSS 变量 |
| `slider.css` | 滑块组件样式 |
| `plyr.css` | 视频播放器样式 |

---

## 设置持久化双层架构

```
用户修改设置
    │
    ▼
Settings.vue setAppSettings()
    │
    ├─► windowApi.setSettings(settings)
    │       └─► IPC → ipcMain.js → electron-store → settingsStore.json
    │                                                  （持久化到磁盘）
    │
    └─► applySettingsSnapshot(settings)
            ├─► setCachedSettingsSnapshot()  // 更新内存缓存
            └─► 更新各 Pinia store 字段      // 即时生效
```

**读取设置：**
```
组件 onActivated
    │
    ▼
getSettingsSnapshot()
    ├─► 有缓存 → 直接返回（无 IPC）
    └─► 无缓存 → windowApi.getSettings() → IPC → 读 settingsStore.json
```

**⚠️ 注意**：Pinia localStorage 持久化（`pinia-plugin-persistedstate`）和 Electron `settingsStore.json` 是**两套独立存储**，不要混淆。
- Pinia persist：存播放状态、用户偏好（快速重启恢复）
- Electron store：存应用设置（音质、目录、快捷键等）

---

## 魔改功能清单（acnekot fork）

### 1. 自定义背景
- **Store**：`playerStore.customBackground*` 系列字段
- **应用位置**：`App.vue` 或 `Player.vue` 中监听 store，通过 CSS 变量 + 伪元素 filter 实现
- **设置入口**：`Settings.vue`

### 2. 歌词频谱可视化器
- **Store**：`playerStore.lyricVisualizer*` 系列字段
- **实现**：`src/utils/lyricVisualizerAudio.js` + `Lyric.vue` Canvas 绘制
- **样式**：bars（竖条）和 radial（径向）两种
- **配置**：频率范围、颜色、透明度、条数、高度等

### 3. 桌面歌词增强
- **Store**：`playerStore.isDesktopLyricOpen`、`playerStore.currentLyricIndex`
- **同步机制**：`usePlayerRuntime.js` 200ms tick 更新 `currentLyricIndex`

### 4. MV 检测
- `Lyric.vue` 引入 `musicVideoCheck` 相关逻辑

---

## 开发注意事项

### ⚠️ 高优先级

1. **新增持久化字段必须加入 `playerStore.pick[]`**
   - 不加 `pick` 的字段仅在内存中，重启后丢失

2. **设置项三处同步修改**
   - `Settings.vue applySettingsToForm()`
   - `Settings.vue setAppSettings()`
   - `initApp.js applySettingsSnapshot()`（如果影响 store）

3. **不要直接调用 `windowApi.getSettings()` 替代 `getSettingsSnapshot()`**
   - 前者每次触发 IPC，后者有缓存
   - Settings 页 `onActivated` 中才使用 `getSettingsSnapshot({ forceReload: true })`

4. **Lyric.vue wheel handler 不要回退**
   - 上游重构为 `lyricWheelHandler` ref + `{ passive: true }`（通过 `enterManualScrollMode()`）
   - 不要改回旧的内联 wheel handler 写法

5. **字体全部本地化**
   - 不要引入 Google Fonts 或任何外部字体 CDN
   - 新增字体需放入 `src/assets/fonts/` 并在 `fonts.css` 声明

### ⚠️ 中优先级

6. **CSS 单位注意 `Px` vs `px`**
   - 项目中 Electron 环境使用 `Px`（大写，Vite/postcss 不转换）防止 autoprefixer 处理
   - 普通响应式布局用 `px`（小写）

7. **Electron IPC 调用只能在渲染进程中（Vue 组件/utils）**
   - `window.windowApi`、`window.electronAPI`、`window.playerApi` 仅 preload 注入后可用
   - 在 SSR 或测试环境中不存在

8. **Pinia store 在 `player.js` 等工具文件中通过 `pinia` 实例直接初始化**
   - `usePlayerStore(pinia)` 而非 `usePlayerStore()`
   - 因为工具文件在 Vue 组件树之外

9. **路由使用 Hash History**
   - Electron 不支持 HTML5 History，所有路由跳转基于 `#/`

10. **懒加载路由**
    - 所有 views 均懒加载，不要改为直接 import（影响首屏性能）

### ⚠️ 低优先级

11. **API 服务是内嵌的**
    - 不依赖外部 API 服务，`background.js` 启动时会在本地启动 `@neteasecloudmusicapienhanced/api`

12. **Linux 平台特有功能**
    - `mpris.js`（D-Bus MPRIS2）、`mediaSession.js` 仅在非 Windows 平台初始化
    - `ensureMediaSessionReady()` 中有平台检测

13. **B 站功能**
    - `biliSession.js`、`userStore.biliUser` 是魔改扩展功能
    - 迁移逻辑在 `initApp.js` 中

---

## 常见开发模式

### 读取设置
```javascript
import { getSettingsSnapshot } from '../utils/settingsSnapshot'
const settings = await getSettingsSnapshot()
const lyricSize = settings?.music?.lyricSize
```

### 保存设置
```javascript
import { applySettingsSnapshot } from '../utils/initApp'
const newSettings = { ...currentSettings, music: { ...currentSettings.music, lyricSize: 16 } }
await windowApi.setSettings(newSettings)
applySettingsSnapshot(newSettings)  // 同步到 store 和缓存
```

### 显示全局弹窗
```javascript
import { dialogOpen } from '../utils/dialog'
const confirmed = await dialogOpen('确认删除', '此操作不可撤销')
```

### 显示全局通知
```javascript
import { noticeOpen } from '../utils/dialog'
noticeOpen('操作成功', 2)  // 2秒后消失
```

### 在工具文件中使用 store
```javascript
import pinia from '../store/pinia'
import { usePlayerStore } from '../store/playerStore'
const playerStore = usePlayerStore(pinia)  // 注意传入 pinia 实例
```

---

## 依赖关键版本

| 依赖 | 版本 | 备注 |
|------|------|------|
| vue | ^3.5.22 | Composition API |
| vite | ^7.1.10 | 构建工具 |
| pinia | ^3.0.3 | 状态管理 |
| pinia-plugin-persistedstate | ^4.5.0 | localStorage 持久化 |
| electron | ^38.3.0 | 桌面运行时 |
| electron-store | ^11.0.2 | 设置持久化 |
| howler | ^2.2.4 | 音频播放 |
| vue-router | ^4.6.0 | 路由 |
| sass | ^1.93.2 | SCSS 编译 |

---

*此文档由 Claude 根据代码库分析自动生成，最后更新：2026-04-23*
