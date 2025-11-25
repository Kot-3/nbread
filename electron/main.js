const { app, BrowserWindow, ipcMain, dialog, screen } = require('electron')
const path = require('path')
const db = require('./db')
const parser = require('./parser')

let mainWindow
let lyricsWindow
let currentLyricsStyle = { fontSize: 28, color: '#2effcf' }

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  mainWindow.setMenu(null)
  
  mainWindow.on('closed', () => {
    app.quit()
  })

  // In dev, load from vite server. In prod, load index.html
  // Check if env is dev.
  // Simple check: if process.env.VITE_DEV_SERVER_URL exists (from electron-builder/vite plugin if configured)
  // Or we can just try to load localhost:5173
  
  const isDev = !app.isPackaged
  
  if (isDev) {
    await mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

function createLyricsWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  
  lyricsWindow = new BrowserWindow({
    width: 1024,
    height: 200,
    x: (width - 1024) / 2,
    y: height - 250,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  // Load a specific route for lyrics or just the same app with a query param
  const isDev = !app.isPackaged
  const lyricsUrl = isDev 
    ? 'http://localhost:5173/#/lyrics' 
    : `file://${path.join(__dirname, '../dist/index.html')}#/lyrics`
    
  if (isDev) {
    lyricsWindow.loadURL('http://localhost:5173?type=lyrics')
  } else {
    lyricsWindow.loadFile(path.join(__dirname, '../dist/index.html'), { query: { type: 'lyrics' } })
  }
  
  lyricsWindow.setIgnoreMouseEvents(false) // Allow dragging
  
  lyricsWindow.webContents.on('did-finish-load', () => {
    if (currentLyricsStyle) {
      lyricsWindow.webContents.send('lyrics:style', currentLyricsStyle)
    }
  })
  
  lyricsWindow.on('closed', () => {
    lyricsWindow = null
  })
  
  lyricsWindow.hide()
}

app.whenReady().then(async () => {
  const dbPath = path.join(app.getPath('userData'), 'library.db')
  await db.initDB(dbPath)
  await createWindow()
  createLyricsWindow()
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// IPC Handlers

ipcMain.on('lyrics:lock', (event, locked) => {
  if (lyricsWindow) {
    if (locked) {
      lyricsWindow.setIgnoreMouseEvents(true, { forward: true })
    } else {
      lyricsWindow.setIgnoreMouseEvents(false)
    }
    // Notify ALL windows so UI can sync
    lyricsWindow.webContents.send('lyrics:locked', locked)
  }
  if (mainWindow) {
    mainWindow.webContents.send('lyrics:locked', locked)
  }
})


ipcMain.handle('dialog:openFile', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Books', extensions: ['txt', 'epub', 'mobi'] }
    ]
  })
  
  if (canceled) return
  
  try {
    const filePath = filePaths[0]
    const parsedBook = await parser.parseBook(filePath)
    // Add path to metadata
    parsedBook.path = filePath
    parsedBook.format = path.extname(filePath).slice(1)
    
    const bookId = await db.saveBook(parsedBook, parsedBook.chapters)
    return { success: true, bookId }
  } catch (e) {
    console.error(e)
    return { success: false, error: e.message }
  }
})

ipcMain.handle('db:getBooks', async () => {
  return await db.getBooks()
})

ipcMain.handle('db:getBookContent', async (event, bookId) => {
  return await db.getBookContent(bookId)
})

ipcMain.handle('db:saveProgress', async (event, bookId, chapterIndex, scrollTop, progress) => {
  return await db.saveProgress(bookId, chapterIndex, scrollTop, progress)
})

ipcMain.handle('db:deleteBook', async (event, bookId) => {
  return await db.deleteBook(bookId)
})

ipcMain.handle('db:deleteBooks', async (event, bookIds) => {
  return await db.deleteBooks(bookIds)
})

ipcMain.handle('lyrics:toggle', (event, show) => {
  if (!lyricsWindow) createLyricsWindow()
  if (show) {
    lyricsWindow.show()
  } else {
    lyricsWindow.hide()
  }
})

const { EdgeTTS } = require('@andresaya/edge-tts')

// ... existing code ...

ipcMain.on('lyrics:update', (event, arg1, arg2) => {
  if (lyricsWindow) {
    // Support both both old (text, rate) and new (object) formats
    const payload = (typeof arg1 === 'object') ? arg1 : { text: arg1, rate: arg2 }
    lyricsWindow.webContents.send('lyrics:control', payload)
  }
})

ipcMain.on('lyrics:style', (event, style) => {
  console.log('Main: Received lyrics style', style)
  currentLyricsStyle = { ...currentLyricsStyle, ...style }
  if (lyricsWindow) {

    
    lyricsWindow.webContents.send('lyrics:style', currentLyricsStyle)
  } else {
    
    console.log('Main: lyricsWindow is null, style saved')
  }
})

ipcMain.handle('lyrics:getStyle', () => {
  return currentLyricsStyle
})

// TTS Handlers
ipcMain.handle('tts:getVoices', async () => {
  try {
    const tts = new EdgeTTS()
    const voices = await tts.getVoices()
    // Filter or map to a simpler format if needed, but raw is fine
    return voices.map(v => ({
      name: `${v.FriendlyName} - Microsoft Edge Online (${v.ShortName})`,
      voiceURI: v.ShortName, // Use ShortName as ID
      lang: v.Locale,
      localService: false // Flag to distinguish from system voices
    }))
  } catch (e) {
    console.error('TTS getVoices error:', e)
    return []
  }
})

ipcMain.handle('tts:speak', async (event, text, voiceId, rate = 1.0) => {
  const maxRetries = 3
  let lastError = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const tts = new EdgeTTS()
      
      // Convert rate to percentage string
      // 1.0 -> +0%
      // 0.5 -> -50%
      // 2.0 -> +100%
      const ratePercent = Math.round((rate - 1) * 100)
      const rateStr = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`
      
      const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${voiceId.split('-').slice(0,2).join('-')}"><voice name="${voiceId}"><prosody rate="${rateStr}">${text}</prosody></voice></speak>`
      
      await tts.synthesize(ssml, voiceId)
      const base64 = tts.toBase64()
      
      return { success: true, audio: `data:audio/mp3;base64,${base64}` }
    } catch (e) {
      console.error(`TTS speak error (attempt ${attempt}/${maxRetries}):`, e.message)
      lastError = e
      
      // If it's the last attempt, break and return error
      if (attempt === maxRetries) break
      
      // Wait before retry (exponential backoff: 1s, 2s, etc.)
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
    }
  }
  
  return { success: false, error: lastError ? lastError.message : 'Unknown error' }
})

