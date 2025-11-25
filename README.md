# NBRead - Immersive PC Reader

NBRead is a modern PC e-book reader built with Electron and Vue 3, focusing on a smooth reading experience and powerful Text-to-Speech (TTS) capabilities.

## ✨ Key Features

### 📚 Robust Format Support
- **Multi-format Compatibility**: Perfect support for `.txt`, `.epub`, and `.mobi` formats.
- **Smart Chapter Splitting**: Built-in regex engine for TXT files to automatically identify chapters and generate a Table of Contents.
- **Image Support**: Full support for parsing and displaying images embedded in EPUB files.

### 🎧 Immersive TTS (Text-to-Speech)
- **Edge-TTS Integration**: Powered by Microsoft Edge's online voice engine for natural, human-like speech.
- **Customizable**: Adjustable speed (0.5x - 2.0x) and multiple voice options.
- **Resume Playback**: Automatically remembers your listening progress.

### 🎵 Desktop Lyrics Mode
- **Background Listening**: A unique "Lyrics Mode" floating window that displays text like a music player's desktop lyrics.
- **Bi-directional Sync**: Real-time synchronization between the floating window and the main reader interface.
- **Click-through & Lock**: Supports mouse click-through and position locking to avoid interfering with your work.

### 📖 Comfortable Reading
- **Reading Modes**: Supports both traditional "Page Turning" and modern "Infinite Scroll" modes.
- **Library Management**: Built-in SQLite database to automatically save reading progress, chapter positions, and scroll states.
- **Auto-Encoding**: Smart detection of text encoding (UTF-8, GBK, etc.) to prevent garbled text.

## 🛠️ Installation & Usage

Works out of the box with no complex configuration required.

### 1. Install Dependencies
Ensure you have Node.js installed.

```bash
npm install
```

### 2. Start Development
Start the Vite development server and the Electron app window:

```bash
npm run dev
```

### 3. Build
Build the installer for production (supports Windows/Portable):

```bash
npm run build
```
The build artifacts will be located in the `release` directory.

## 🏗️ Tech Stack

- **Core**: [Electron](https://www.electronjs.org/) (v29+)
- **Frontend**: [Vue 3](https://vuejs.org/) + [Vite](https://vitejs.dev/)
- **Styling**: [TailwindCSS](https://tailwindcss.com/) + Lucide Icons
- **Database**: SQLite (`sqlite3`) - Local lightweight database, zero configuration.
- **Parsing**:
  - `epub2` (EPUB parsing)
  - `mobi` (Mobi parsing)
  - `jschardet` & `iconv-lite` (Encoding detection & conversion)
- **TTS Service**: `@andresaya/edge-tts` (Microsoft Edge TTS Interface)

## 📝 Directory Structure

- `electron/`: Backend main process (Window management, Database, File parsing, TTS)
- `src/`: Frontend renderer process (Vue components, UI)
- `dist/`: Frontend build artifacts
- `release/`: Application build artifacts

## 📂 Data Storage
User reading records and library data are stored in `AppData/Roaming/NBRead/library.db` (on Windows).
