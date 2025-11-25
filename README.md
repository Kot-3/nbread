# NBRead - 沉浸式 PC 阅读器

NBRead 是一款基于 Electron 和 Vue 3 构建的现代化 PC 本地电子书阅读器，专注于提供流畅的阅读体验和强大的听书功能。

## ✨ 核心功能

### 📚 强大的格式支持
- **多格式兼容**: 完美支持 `.txt`, `.epub`, `.mobi` 格式。
- **智能分章**: 针对 TXT 文件内置强大的正则匹配引擎，自动识别目录章节。
- **图文混排**: 完整支持 EPUB 内嵌图片的解析与显示。

### 🎧 沉浸式听书 (TTS)
- **Edge-TTS 集成**: 使用微软 Edge 在线语音引擎，提供接近真人的自然语音。
- **个性化调节**: 支持语速调节 (0.5x - 2.0x) 和多音色选择。
- **断点续听**: 自动记录听书进度，随时继续。

### 🎵 桌面歌词模式
- **挂机神器**: 独特的"歌词模式"悬浮窗，类似音乐播放器的桌面歌词。
- **双向同步**: 悬浮窗文本与主界面阅读进度实时同步。
- **穿透与锁定**: 支持鼠标穿透和位置锁定，不干扰正常工作。

### 📖 舒适阅读
- **阅读模式**: 支持传统的"翻页模式"和现代的"无限滚动模式"。
- **书架管理**: 内置 SQLite 数据库，自动记录阅读进度、章节位置和滚动位置。
- **自动编码**: 智能识别文本编码 (UTF-8, GBK 等)，拒绝乱码。

## 🛠️ 安装与运行

无需复杂的配置，开箱即用。

### 1. 安装依赖
确保已安装 Node.js 环境。

```bash
npm install
```

### 2. 启动开发环境
启动 Vite 开发服务器和 Electron 应用窗口：

```bash
npm run dev
```

### 3. 打包构建
构建用于生产环境的安装包 (支持 Windows/Portable)：

```bash
npm run build
```
构建产物将位于 `release` 目录下。

## 🏗️ 技术栈

- **核心框架**: [Electron](https://www.electronjs.org/) (v29+)
- **前端框架**: [Vue 3](https://vuejs.org/) + [Vite](https://vitejs.dev/)
- **样式方案**: [TailwindCSS](https://tailwindcss.com/) + Lucide Icons
- **数据存储**: SQLite (`sqlite3`) - 本地轻量级数据库，无需额外安装
- **文本解析**: 
  - `epub2` (EPUB 解析)
  - `mobi` (Mobi 解析)
  - `jschardet` & `iconv-lite` (编码检测与转换)
- **语音服务**: `@andresaya/edge-tts` (微软 Edge TTS 接口)

## 📝 目录结构

- `electron/`: 后端主进程代码 (窗口管理、数据库操作、文件解析、TTS)
- `src/`: 前端渲染进程代码 (Vue 组件、UI 界面)
- `dist/`: 前端构建产物
- `release/`: 应用打包产物

## 📂 数据存储
用户的阅读记录和书架数据存储在系统用户目录下的 `AppData/Roaming/NBRead/library.db` (Windows) 中。
