import pinia from '../../store/pinia'
import { storeToRefs } from 'pinia'
import { likeMusic } from '../../api/song'
import { updatePlaylist } from '../../api/playlist'
import { getLikelist, getUserPlaylist } from '../../api/user'
import { useUserStore } from '../../store/userStore'
import { usePlayerStore } from '../../store/playerStore'
import { useLibraryStore } from '../../store/libraryStore'
import { useOtherStore } from '../../store/otherStore'
import { noticeOpen } from '../dialog'
import { schedulePlaylistCacheInvalidation } from '../cacheInvalidation'
import {
    DEFAULT_FAVORITE_PLAYLIST_NAME,
    normalizeFavoritePlaylistMeta,
    resolveFavoritePlaylistMeta as resolveFavoritePlaylistMetaBase,
} from '../favoritePlaylist'

const otherStore = useOtherStore(pinia)
const userStore = useUserStore(pinia)
const libraryStore = useLibraryStore(pinia)
const playerStore = usePlayerStore(pinia)
const { songId } = storeToRefs(playerStore)

const LIKE_SYNC_RETRY_DELAY = 280
const LIKE_SYNC_RETRY_LIMIT = 2
const LIKE_REQUEST_COOLDOWN_MS = 1200
let likeActionToken = 0
let likeRequestQueue = Promise.resolve()
let nextLikeRequestAvailableAt = 0

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

function cloneLikelist(likelist = userStore.likelist) {
    return Array.isArray(likelist) ? likelist.slice() : []
}

export function getLikeActionErrorMessage(result, fallback = '未知错误') {
    return result?.body?.message || result?.body?.msg || result?.message || result?.msg || fallback
}

export function isSongLiked(songId, likelist = userStore.likelist) {
    const targetSongId = String(songId ?? '')
    if (!targetSongId || !Array.isArray(likelist)) return false
    return likelist.some(id => String(id) === targetSongId)
}

export function applyOptimisticLikeState(songId, like, likelist = userStore.likelist) {
    const nextLikelist = cloneLikelist(likelist)
    const likedIndex = nextLikelist.findIndex(id => String(id) === String(songId))

    if (like) {
        if (likedIndex === -1) nextLikelist.unshift(songId)
        return nextLikelist
    }

    if (likedIndex !== -1) nextLikelist.splice(likedIndex, 1)
    return nextLikelist
}

export function createLikeActionToken() {
    likeActionToken += 1
    return likeActionToken
}

export function isActiveLikeActionToken(token) {
    return token === likeActionToken
}

async function fetchLikelistSnapshot() {
    if (!userStore.user?.userId) return null
    const response = await getLikelist(userStore.user.userId)
    return Array.isArray(response?.ids) ? response.ids.slice() : null
}

export async function queueLikeRequest(actionToken, requestFactory) {
    const runTask = async () => {
        const waitMs = Math.max(0, nextLikeRequestAvailableAt - Date.now())
        if (waitMs > 0) await wait(waitMs)
        if (!isActiveLikeActionToken(actionToken)) return { skipped: true }

        let hasRequested = false
        try {
            const result = await requestFactory()
            hasRequested = true
            return result
        } finally {
            if (hasRequested) {
                nextLikeRequestAvailableAt = Date.now() + LIKE_REQUEST_COOLDOWN_MS
            }
        }
    }

    const queuedTask = likeRequestQueue.then(runTask, runTask)
    likeRequestQueue = queuedTask.catch(() => null)
    return queuedTask
}

async function resolveLikelistAfterLikeAction(songId, like, fallbackLikelist) {
    let latestSnapshot = null

    for (let attempt = 0; attempt < LIKE_SYNC_RETRY_LIMIT; attempt++) {
        try {
            const snapshot = await fetchLikelistSnapshot()
            if (Array.isArray(snapshot)) {
                latestSnapshot = snapshot
                if (isSongLiked(songId, snapshot) === !!like) return snapshot
            }
        } catch (error) {
            console.error('刷新喜欢列表失败:', error)
        }

        if (attempt < LIKE_SYNC_RETRY_LIMIT - 1) {
            await wait(LIKE_SYNC_RETRY_DELAY)
        }
    }

    if (Array.isArray(latestSnapshot)) {
        return applyOptimisticLikeState(songId, like, latestSnapshot)
    }

    return cloneLikelist(fallbackLikelist)
}

function cacheFavoritePlaylistMeta(playlist) {
    const meta = normalizeFavoritePlaylistMeta(playlist)
    if (!meta) return null
    userStore.updateFavoritePlaylistMeta(meta)
    return meta
}

export function resolveFavoritePlaylistMeta(playlists) {
    return resolveFavoritePlaylistMetaBase(playlists, userStore.user?.userId)
}

export async function getFavoritePlaylistId() {
    const cachedId = userStore.favoritePlaylistId
    const cachedName = typeof userStore.favoritePlaylistName == 'string' ? userStore.favoritePlaylistName.trim() : ''

    if (cachedId && cachedName) {
        return {
            id: cachedId,
            name: cachedName,
        }
    }

    const cachedFavoritePlaylist = resolveFavoritePlaylistMeta(libraryStore.playlistUserCreated)
    if (cachedFavoritePlaylist) return cacheFavoritePlaylistMeta(cachedFavoritePlaylist)

    if (cachedId) {
        return {
            id: cachedId,
            name: cachedName || DEFAULT_FAVORITE_PLAYLIST_NAME,
        }
    }

    if (!userStore.user?.userId) {
        return cachedName ? { id: null, name: cachedName } : null
    }

    try {
        const params = {
            uid: userStore.user.userId,
            limit: 50,
            offset: 0,
            timestamp: Date.now()
        }

        const result = await getUserPlaylist(params)
        if (result && result.playlist && result.playlist.length > 0) {
            const favoritePlaylist = resolveFavoritePlaylistMeta(result.playlist)
            if (favoritePlaylist) return cacheFavoritePlaylistMeta(favoritePlaylist)
        }
    } catch (error) {
    }

    if (cachedName) return { id: cachedId || null, name: cachedName }
    if (cachedId) return { id: cachedId, name: DEFAULT_FAVORITE_PLAYLIST_NAME }
    return null
}

export async function getFavoritePlaylistNoticeText(like) {
    if (!like) return '已取消喜欢'

    const favoritePlaylist = await getFavoritePlaylistId()
    return `已添加到${favoritePlaylist?.name || DEFAULT_FAVORITE_PLAYLIST_NAME}`
}

function applyFavoritePlaylistDetailStale(playlistId, like) {
    if (!playlistId) return
    libraryStore.invalidatePlaylistDetailCache(playlistId)
    if (typeof like == 'boolean') {
        libraryStore.updatePlaylistOverviewTrackCount(playlistId, like ? 1 : -1)
    }
}

async function markFavoritePlaylistDetailStale(like = null) {
    schedulePlaylistCacheInvalidation()
    libraryStore.markPlaylistOverviewStale()

    try {
        const favoritePlaylist = await getFavoritePlaylistId()
        applyFavoritePlaylistDetailStale(favoritePlaylist?.id, like)
    } catch (_) {
        applyFavoritePlaylistDetailStale(userStore.favoritePlaylistId, like)
    }
}

export function isPlaylistTrackOperationSuccess(result) {
    return !!(result && (
        (result.status === 200 && result.body && result.body.code === 200) ||
        result.code === 200 ||
        result.status === 200
    ))
}

export async function updateFavoritePlaylistTrack(songId, like) {
    const favoritePlaylist = await getFavoritePlaylistId()
    if (!favoritePlaylist?.id) {
        return {
            success: false,
            result: null,
            favoritePlaylist: null,
            message: '未找到我喜欢的音乐歌单',
        }
    }

    const params = {
        op: like ? 'add' : 'del',
        pid: favoritePlaylist.id,
        tracks: songId,
        timestamp: Date.now(),
    }

    const result = await updatePlaylist(params)
    return {
        success: isPlaylistTrackOperationSuccess(result),
        result,
        favoritePlaylist,
        message: getLikeActionErrorMessage(result, '未知错误'),
    }
}

export async function syncLikelistAfterLikeAction({ songId, like, actionToken, fallbackLikelist, refreshFavoritePlaylist = true } = {}) {
    const nextLikelist = await resolveLikelistAfterLikeAction(songId, like, fallbackLikelist)
    if (!isActiveLikeActionToken(actionToken)) return cloneLikelist(nextLikelist)

    userStore.updateLikelist(nextLikelist)
    if (refreshFavoritePlaylist) await updateFavoritePlaylistIfViewing()
    return nextLikelist
}

function finalizeLikeActionSideEffects({ clickMyPlaylist = true, closeAddPlaylist = true } = {}) {
    if (closeAddPlaylist) otherStore.addPlaylistShow = false
    schedulePlaylistCacheInvalidation()

    if (!clickMyPlaylist) return

    try {
        if (libraryStore.listType1 == 0 && libraryStore.listType2 == 0) {
            const myPlaylistElement = document.getElementById('myPlaylist')
            if (myPlaylistElement) {
                myPlaylistElement.click()
            }
        }
    } catch (e) {
        console.error('点击myPlaylist失败，忽略:', e)
    }
}

export async function likeSong(like, targetSongId = songId.value) {
    const songIdValue = targetSongId
    const isExplicitTargetSong = arguments.length > 1
    const noticeLikeFailure = message => {
        if (!isExplicitTargetSong) noticeOpen(message, 2)
    }

    // 检查前置条件
    if (!songIdValue) {
        console.error('likeSong失败: 没有当前歌曲ID')
        noticeLikeFailure("操作失败：没有选中的歌曲")
        return
    }

    if (!userStore.user || !userStore.user.userId) {
        console.error('likeSong失败: 用户信息未加载')
        noticeLikeFailure("操作失败：用户信息未加载，请稍后重试")
        return
    }

    if (!Array.isArray(userStore.likelist)) {
        console.error('likeSong失败: 喜欢列表未加载')
        noticeLikeFailure("操作失败：喜欢列表未加载，请稍后重试")
        return
    }

    const actionToken = createLikeActionToken()
    const finalizeLikeActionForTarget = () => {
        const useCurrentPlayerSideEffects = !isExplicitTargetSong && songIdValue == songId.value
        finalizeLikeActionSideEffects({
            clickMyPlaylist: useCurrentPlayerSideEffects,
            closeAddPlaylist: useCurrentPlayerSideEffects,
        })
    }
    const applySuccessfulLikeAction = async noticeText => {
        if (!isActiveLikeActionToken(actionToken)) return false
        await markFavoritePlaylistDetailStale(like)
        if (!isActiveLikeActionToken(actionToken)) return false
        const fallbackLikelist = applyOptimisticLikeState(songIdValue, like)
        userStore.updateLikelist(fallbackLikelist)
        noticeOpen(noticeText, 2)
        await syncLikelistAfterLikeAction({
            songId: songIdValue,
            like,
            actionToken,
            fallbackLikelist,
        })
        if (!isActiveLikeActionToken(actionToken)) return false
        finalizeLikeActionForTarget()
        return true
    }
    const applyFavoritePlaylistFallback = async failureReason => {
        if (!isActiveLikeActionToken(actionToken)) return false
        console.warn('官方 /like API 失败，尝试使用歌单 tracks:', failureReason)
        try {
            const fallbackResult = await updateFavoritePlaylistTrack(songIdValue, like)
            if (fallbackResult.success) {
                const noticeText = like ? `已添加到${fallbackResult.favoritePlaylist?.name || DEFAULT_FAVORITE_PLAYLIST_NAME}` : '已取消喜欢'
                return applySuccessfulLikeAction(noticeText)
            }

            console.error('歌单 tracks 降级也失败:', fallbackResult.result || fallbackResult.message)
            const errorMsg = fallbackResult.message || failureReason || '未知错误'
            noticeLikeFailure(`喜欢/取消喜欢 音乐失败：${errorMsg}`)
        } catch (fallbackError) {
            console.error('歌单 tracks 降级异常:', fallbackError)
            const errorMsg = fallbackError?.response?.data?.message || fallbackError?.message || failureReason || '网络错误'
            noticeLikeFailure(`喜欢/取消喜欢 音乐失败：${errorMsg}`)
        }
        return false
    }

    try {
        const result = await queueLikeRequest(actionToken, () => likeMusic(songIdValue, like))
        if (result?.skipped) return

        if (result && result.code == 200) {
            await applySuccessfulLikeAction(await getFavoritePlaylistNoticeText(like))
        } else {
            await applyFavoritePlaylistFallback(getLikeActionErrorMessage(result))
        }
    } catch (error) {
        console.error('调用 /like API 异常:', error)
        const errorMsg = error?.response?.data?.message || error?.message || '网络错误'
        await applyFavoritePlaylistFallback(errorMsg)
    }
}

async function updateFavoritePlaylistIfViewing() {
    const favoritePlaylist = await getFavoritePlaylistId()
    const favoritePlaylistId = favoritePlaylist?.id || userStore.favoritePlaylistId
    if (!favoritePlaylistId) return

    // 检查当前是否在查看"我喜欢的音乐"歌单
    if (libraryStore.libraryInfo && libraryStore.libraryInfo.id == favoritePlaylistId) {
        try {
            schedulePlaylistCacheInvalidation()
            libraryStore.invalidatePlaylistDetailCache(favoritePlaylistId)
            // 重新获取歌单详情
            await libraryStore.updatePlaylistDetail(favoritePlaylistId, { deferRemaining: true })
        } catch (error) {
            console.error('更新我喜欢的音乐歌单失败:', error)
        }
    }
}

