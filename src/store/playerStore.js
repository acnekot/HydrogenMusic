import { defineStore } from "pinia";

export const usePlayerStore = defineStore('playerStore', {
    state: () => {
        return {
            widgetState: true,//是否开启widget
            currentMusic: null,//播放列表的索引
            playing: false,//是否正在播放
            progress: 0,//进度条
            volume: 0.3,//音量
            // volumeBeforeMuted: 0,//静音前音量
            playMode: 0,//0为顺序播放，1为列表循环，2为单曲循环，3为随机播放
            listInfo: null,
            songList: null,//播放列表
            shuffledList: null,//随机播放列表
            shuffleIndex: 0,//随机播放列表的索引
            songId: null,
            currentIndex: 0,
            time: 0, //歌曲总时长
            quality: null,
            playlistWidgetShow: false,
            playerChangeSong: false, //player页面切换歌曲更换歌名动画,
            lyric: null,
            lyricsObjArr: null,
            currentLyricIndex: -1, // 当前歌词索引，用于桌面歌词同步
            lyricSize: null,
            tlyricSize: null,
            rlyricSize: null,
            lyricType: ['original'],
            lyricInterludeTime: null, //歌词间奏等待时间
            searchAssistLimit: 8, //搜索下拉面板显示数量
            lyricShow: false, //歌词是否显示
            lyricEle: null,//歌词DOM
            isLyricDelay: true, //调整进度的时候禁止赋予delay属性
            // 自定义背景配置
            customBackgroundEnabled: false, // 是否启用自定义背景
            customBackgroundImage: '', // 自定义背景图片路径
            customBackgroundMode: 'cover', // 展示模式
            customBackgroundBlur: 0, // 模糊强度
            customBackgroundBrightness: 100, // 亮度百分比
            customBackgroundApplyToChrome: true, // 是否应用到全局界面
            customBackgroundApplyToPlayer: true, // 是否应用到播放页
            // 歌词可视化器配置
            lyricVisualizer: false,
            lyricVisualizerHeight: 220,
            lyricVisualizerFrequencyMin: 20,
            lyricVisualizerFrequencyMax: 8000,
            lyricVisualizerTransitionDelay: 0.75,
            lyricVisualizerBarCount: 48,
            lyricVisualizerBarWidth: 55,
            lyricVisualizerColor: 'black',
            lyricVisualizerOpacity: 100,
            lyricVisualizerStyle: 'bars',
            lyricVisualizerRadialSize: 100,
            lyricVisualizerRadialOffsetX: 0,
            lyricVisualizerRadialOffsetY: 0,
            lyricVisualizerRadialCoreSize: 62,
            localBase64Img: null, //如果是本地歌曲，获取封面
            forbidLastRouter: false, //在主动跳转router时禁用回到上次离开的路由的地址功能
            musicVideo: false,
            addMusicVideo: false,
            currentMusicVideo: null,
            musicVideoDOM: null,
            videoIsPlaying: false,
            playerShow: true,
            lyricBlur: false,
            showSongTranslation: true, // 歌曲名是否显示翻译（原名 (翻译)）
            isDesktopLyricOpen: false, // 桌面歌词是否打开
            coverBlur: false, // 播放页使用封面模糊背景
            globalZoom: 1, // 全局缩放比例
            commentFontSize: 13, // 评论区字体大小
        }
    },
    actions: {
    },
    persist: {
        storage: localStorage,
        pick: [
            'progress',
            'volume',
            'playMode',
            'shuffleIndex',
            'listInfo',
            'songId',
            'currentIndex',
            'time',
            'quality',
            'lyricType',
            'musicVideo',
            'lyricBlur',
            'showSongTranslation',
            'coverBlur',
            'customBackgroundEnabled',
            'customBackgroundImage',
            'customBackgroundMode',
            'customBackgroundBlur',
            'customBackgroundBrightness',
            'customBackgroundApplyToChrome',
            'customBackgroundApplyToPlayer',
            'lyricVisualizer',
            'lyricVisualizerHeight',
            'lyricVisualizerFrequencyMin',
            'lyricVisualizerFrequencyMax',
            'lyricVisualizerTransitionDelay',
            'lyricVisualizerBarCount',
            'lyricVisualizerBarWidth',
            'lyricVisualizerColor',
            'lyricVisualizerOpacity',
            'lyricVisualizerStyle',
            'lyricVisualizerRadialSize',
            'lyricVisualizerRadialOffsetX',
            'lyricVisualizerRadialOffsetY',
            'lyricVisualizerRadialCoreSize',
            'globalZoom',
            'commentFontSize',
        ]
    },
})
