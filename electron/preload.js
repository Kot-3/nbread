const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // File operations
  uploadFile: () => ipcRenderer.invoke('dialog:openFile'),
  
  // Database/Book operations
  getBooks: () => ipcRenderer.invoke('db:getBooks'),
  getBookContent: (bookId) => ipcRenderer.invoke('db:getBookContent', bookId),
  saveBookProgress: (bookId, chapterIndex, scrollTop, progress) => ipcRenderer.invoke('db:saveProgress', bookId, chapterIndex, scrollTop, progress),
  deleteBook: (bookId) => ipcRenderer.invoke('db:deleteBook', bookId),
  deleteBooks: (bookIds) => ipcRenderer.invoke('db:deleteBooks', bookIds),
  
  // Lyrics/TTS operations
  toggleLyricsWindow: (show) => ipcRenderer.invoke('lyrics:toggle', show),
  updateLyrics: (text, rate) => ipcRenderer.send('lyrics:update', text, rate),
  updateLyricsStyle: (style) => ipcRenderer.send('lyrics:style', style),
  getLyricsStyle: () => ipcRenderer.invoke('lyrics:getStyle'),
  lyricsLock: (locked) => ipcRenderer.send('lyrics:lock', locked),
  setIgnoreMouseEvents: (ignore, options) => ipcRenderer.send('lyrics:lock', ignore, options),
  
  // Edge TTS
  getEdgeVoices: () => ipcRenderer.invoke('tts:getVoices'),
  speakEdge: (text, voiceId, rate) => ipcRenderer.invoke('tts:speak', text, voiceId, rate),
  
  // Listeners
  onLyricsControl: (callback) => ipcRenderer.on('lyrics:control', callback),
  onLyricsStyle: (callback) => ipcRenderer.on('lyrics:style', callback),
  onLyricsLocked: (callback) => ipcRenderer.on('lyrics:locked', callback)
})
