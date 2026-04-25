<br />
<p align="center">
  <h2 align="center" style="font-weight: 600">Hydrogen Music — acnekot fork</h2>

  <p align="center">
    基于 <a href="https://github.com/ldx123000/Hydrogen-Music" target="blank"><strong>ldx123000/Hydrogen-Music</strong></a> 的个人魔改版本
    <br />
    上游已修复登录/下载/云盘等核心功能，本 fork 在此基础上叠加个人定制特性
    <br />
    <br />
    <a href="https://github.com/acnekot/HydrogenMusic/releases" target="blank"><strong>📦️ 下载安装包</strong></a>
  </p>
</p>

## 🌟 继承自上游的特性

- 修复 **登录** 功能
- 修复 **歌曲下载** 功能
- 修复 **音乐视频** 功能，支持在线播放 MV
- 修复 **云盘** 功能，可正常上传/删除
- 新增 **私人漫游** 功能
- 新增 **桌面歌词** 窗口（可拖动/锁定/调整大小，支持原文/翻译/罗马音切换）
- 新增 **评论区**，播放器界面可自由切换歌词/评论区
- 新增 **电台** 功能
- 支持 **深色模式**

## ✨ 本 fork 新增特性

- **自定义背景** — 可设置任意图片作为全局或播放页背景，支持模糊/亮度/展示模式调节
- **歌词频谱可视化器** — 播放页歌词区域叠加音频频谱动画，支持竖条（bars）和径向（radial）两种样式，可调频率范围、颜色、透明度、条数等
- **歌词激活行位置** — 可将当前歌词行固定在偏上/居中/偏下三种位置
- **MV 检测按钮** — 歌词页一键跳转当前歌曲 MV
- **全局缩放** — 可在设置中调整整体界面缩放比例
- **评论区字体大小** — 可独立调整评论区字号
- **B 站账号** — 支持绑定 B 站账号

## 📦️ 安装

访问 [Releases](https://github.com/acnekot/HydrogenMusic/releases) 页面下载安装包。

## 👷‍♂️ 打包客户端

```shell
npm run dist
```

## 💻 配置开发环境

```shell
# 安装依赖
npm install

# 运行 Vue 服务
npm run dev

# 运行 Electron 客户端
npm start
```

## 📜 开源许可

本项目仅供个人学习研究使用，禁止用于商业及非法用途。

基于 [MIT license](https://opensource.org/licenses/MIT) 许可进行开源。

## 致谢

- 原版：[Kaidesuyo/Hydrogen-Music](https://github.com/Kaidesuyo/Hydrogen-Music)
- 复活上游：[ldx123000/Hydrogen-Music](https://github.com/ldx123000/Hydrogen-Music)

## 🖼️ 截图

![home][home-screenshot]
![lyric][lyric-screenshot]
![desktop-lyric][desktop-lyric-screenshot]
![comment][comment-screenshot]
![privateFM][privateFM-screenshot]
![dark_mode][dark_mode-screenshot]
![music_video][music_video-screenshot]

<!-- MARKDOWN LINKS & IMAGES -->
[home-screenshot]: img/home.png
[lyric-screenshot]: img/lyric.png
[desktop-lyric-screenshot]: img/desktop-lyric.png
[comment-screenshot]: img/comment.png
[privateFM-screenshot]: img/privateFM.png
[dark_mode-screenshot]: img/dark_mode.png
[music_video-screenshot]: img/music_video.png
