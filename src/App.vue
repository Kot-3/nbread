<template>
  <Lyrics v-if="isLyricsMode" />
  <div v-else class="h-screen flex flex-col bg-background text-foreground font-sans relative">
    <LoadingOverlay v-if="isLoading" :message="loadingMessage" />
    
    <header class="h-14 border-b border-border bg-card flex items-center px-4 justify-between select-none draggable" v-if="currentView === 'library'">
      <span class="font-semibold text-lg">NBRead Library</span>
      <button @click="importBook" class="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2 no-drag">
        <Upload class="mr-2 h-4 w-4" />
        Import Book
      </button>
    </header>
    <header class="h-14 border-b border-border bg-card flex items-center px-4 gap-4 select-none draggable" v-else-if="currentView === 'reader'">
      <button @click="closeReader" class="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 w-9 p-0 no-drag">
        <ArrowLeft class="h-4 w-4" />
      </button>
      <span class="font-semibold truncate flex-1 text-center">{{ currentBook?.title }}</span>
      <div class="flex items-center gap-2 ml-auto">
         <button @click="toggleTTS" class="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3 no-drag">
           <component :is="ttsActive ? Square : Play" class="mr-2 h-4 w-4" />
           {{ ttsActive ? 'Stop TTS' : 'Start TTS' }}
         </button>
         <button @click="toggleLyrics" class="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3 no-drag" :class="{ 'bg-accent text-accent-foreground': showLyrics }">
            <Music class="mr-2 h-4 w-4" />
            Lyrics
         </button>
      </div>
    </header>

    <main class="flex-1 overflow-hidden relative">
      <Library v-if="currentView === 'library'" @open-book="openBook" class="h-full overflow-auto" />
      <Reader 
        v-if="currentView === 'reader'" 
        :book="currentBook" 
        :ttsActive="ttsActive"
        @tts-progress="onTTSProgress"
        @stop-tts="ttsActive = false"
        @start-tts="ttsActive = true"
        ref="readerRef"
      />
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import Library from './components/Library.vue'
import Reader from './components/Reader.vue'
import Lyrics from './components/Lyrics.vue'
import LoadingOverlay from './components/LoadingOverlay.vue'
import { ArrowLeft, Play, Square, Music, Upload } from 'lucide-vue-next'

const isLyricsMode = ref(new URLSearchParams(window.location.search).get('type') === 'lyrics')
const currentView = ref('library')
const currentBook = ref(null)
const ttsActive = ref(false)
const readerRef = ref(null)
const isLoading = ref(false)
const loadingMessage = ref('')

const importBook = async () => {
  try {
    // Note: file dialog blocks, but once file is selected, processing starts.
    // We can't easily know when the dialog opens vs closes unless we split the API,
    // but showing 'Importing...' immediately is acceptable feedback for the user click.
    isLoading.value = true
    loadingMessage.value = 'Importing book...'
    
    const result = await window.electronAPI.uploadFile()
    
    if (result && result.success) {
      loadingMessage.value = 'Book imported!'
      // Short delay to show success message
      setTimeout(() => {
        window.location.reload()
      }, 500)
    } else if (result?.error) {
      isLoading.value = false
      // Only alert if it wasn't cancelled
      if (result.error !== 'Canceled') {
        alert('Import failed: ' + result.error)
      }
    } else {
        // Canceled or other empty result
        isLoading.value = false
    }
  } catch (e) {
    console.error(e)
    isLoading.value = false
    alert('Import error occurred')
  }
}

const openBook = async (book) => {
  try {
    isLoading.value = true
    loadingMessage.value = 'Loading book content...'
    
    // Small delay to ensure UI renders loading state
    await new Promise(resolve => setTimeout(resolve, 10))
    
    const fullBook = await window.electronAPI.getBookContent(book.id)
    if (fullBook) {
      currentBook.value = fullBook
      currentView.value = 'reader'
    }
  } catch (e) {
    console.error(e)
    alert('Failed to open book')
  } finally {
    isLoading.value = false
  }
}

const closeReader = () => {
  currentView.value = 'library'
  currentBook.value = null
  ttsActive.value = false
  window.electronAPI.updateLyrics('')
}

const toggleTTS = () => {
  ttsActive.value = !ttsActive.value
}

const showLyrics = ref(false)

const toggleLyrics = () => {
  showLyrics.value = !showLyrics.value
  window.electronAPI.toggleLyricsWindow(showLyrics.value)
}

const onTTSProgress = (data) => {
  // Handle both old string format (if any) and new object format
  if (typeof data === 'string') {
    window.electronAPI.updateLyrics({ text: data, rate: 1.0 })
  } else {
    // Pass full data object (text, rate, nextText)
    window.electronAPI.updateLyrics(data)
  }
}
</script>

