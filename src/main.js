import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

// Mock Electron API for browser development
if (!window.electronAPI) {
  console.warn('Running in browser mode - Electron API mocked')
  window.electronAPI = {
    uploadFile: async () => { alert('Upload not available in browser'); return { success: false } },
    getBooks: async () => [
      { id: 1, title: 'Mock Book', author: 'Test Author', format: 'txt' }
    ],
    getBookContent: async (id) => ({
      id, title: 'Mock Book', 
      chapters: [
        { title: 'Chapter 1', content: '<p>This is a mock chapter content for testing in browser.</p><p>Second paragraph.</p>' },
        { title: 'Chapter 2', content: '<p>Chapter 2 content.</p>' }
      ]
    }),
    saveBookProgress: async () => {},
    toggleLyricsWindow: () => console.log('Toggle lyrics'),
    updateLyrics: (text, rate) => console.log('Lyrics:', text, 'Rate:', rate),
    onLyricsControl: (cb) => { 
      // Mock lyrics updates
      setInterval(() => cb(null, { text: 'Mock Lyrics Text ' + Date.now(), rate: 1.0 }), 3000)
    }
  }
}

createApp(App).mount('#app')
