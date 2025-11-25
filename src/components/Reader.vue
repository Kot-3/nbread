<template>
  <div class="reader">
    <div class="sidebar" :class="{ collapsed: !showSidebar }">
      <button @click="showSidebar = !showSidebar" class="toggle-sidebar" :title="showSidebar ? 'Collapse Sidebar' : 'Expand Sidebar'">
        <component :is="showSidebar ? ChevronLeft : ChevronRight" :size="20" />
      </button>
      <ul v-if="showSidebar" ref="sidebarList">
        <li 
          v-for="(chapter, index) in book.chapters" 
          :key="index" 
          :ref="el => chapterRefs[index] = el"
          :class="{ active: currentChapterIndex === index }"
          @click="goToChapter(index)"
        >
          {{ chapter.title }}
        </li>
      </ul>
    </div>
    
    <div class="main-area" ref="mainArea">
      <div class="toolbar">
        <button @click="showSettings = !showSettings" class="settings-btn" title="Settings">
          ⚙️
        </button>
        
        <label v-if="props.ttsActive">
           Speed: 
           <input type="range" v-model.number="ttsRate" min="0.5" max="3" step="0.1"> {{ ttsRate }}x
        </label>
        
        <label v-if="props.ttsActive">
          Voice:
          <select v-model="selectedVoiceURI">
            <option v-for="voice in voices" :key="voice.voiceURI" :value="voice.voiceURI">
              {{ voice.name }}
            </option>
          </select>
        </label>
      </div>

      <div class="settings-panel" v-if="showSettings">
        <div class="setting-item">
           <label>Reader Size:</label>
           <input type="range" v-model.number="readerFontSize" min="12" max="40"> 
           <span>{{ readerFontSize }}px</span>
        </div>
        <div class="setting-item">
           <label>Lyrics Size:</label>
           <input type="range" v-model.number="lyricsFontSize" min="16" max="60">
           <span>{{ lyricsFontSize }}px</span>
        </div>
        <div class="setting-item">
           <label>Lyrics Color:</label>
           <input type="color" v-model="lyricsColor">
        </div>
        <div class="setting-item">
           <label style="cursor: pointer;">
             <input type="checkbox" v-model="lyricsLocked"> Lock Lyrics
           </label>
        </div>
      </div>

      <div 
        class="content-viewer" 
        :class="viewMode" 
        ref="contentRef"
        @scroll="onScroll"
        @click="handleContentClick"
        v-html="currentContent"
        :style="{ fontSize: readerFontSize + 'px' }"
      ></div>
      
      <div v-if="viewMode === 'paging'" class="paging-controls">
        <div class="page-left" @click="prevPage"></div>
        <div class="page-right" @click="nextPage"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, onBeforeUnmount, nextTick } from 'vue'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'

const props = defineProps({
  book: Object,
  ttsActive: Boolean
})

const emit = defineEmits(['stop-tts', 'tts-progress', 'start-tts'])

const showSidebar = ref(true)
const currentChapterIndex = ref(0)
const viewMode = ref('scroll')
const contentRef = ref(null)
const sidebarList = ref(null)
const chapterRefs = ref([])

// Settings
const showSettings = ref(false)
const readerFontSize = ref(18)
const lyricsFontSize = ref(28)
const lyricsColor = ref('#2effcf')
const lyricsLocked = ref(false)

const scrollToActiveChapter = () => {
  nextTick(() => {
    const activeEl = chapterRefs.value[currentChapterIndex.value]
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  })
}

watch(lyricsLocked, (val) => {
  if (window.electronAPI && window.electronAPI.lyricsLock) {
    window.electronAPI.lyricsLock(val)
  }
})

watch([lyricsFontSize, lyricsColor], () => {
  console.log('Reader: Sending lyrics style update', lyricsFontSize.value, lyricsColor.value)
  if (window.electronAPI && window.electronAPI.updateLyricsStyle) {
      window.electronAPI.updateLyricsStyle({
          fontSize: lyricsFontSize.value,
          color: lyricsColor.value
      })
  } else {
      console.error('Reader: electronAPI.updateLyricsStyle is missing')
  }
}, { immediate: true })

// TTS
const ttsRate = ref(1.0)
const voices = ref([])
const selectedVoiceURI = ref('')
const synth = window.speechSynthesis
let ttsQueue = []
let ttsIndex = 0
let isReading = ref(false)
const pendingTTSIndex = ref(null)
let currentAudio = null // For Edge TTS
// let nextAudio = null // Preload for Edge TTS
// let nextAudioUrl = null
// let preloadingIndex = -1
const preloadMap = new Map() // Map<index, Audio>
const PRELOAD_COUNT = 4

// Initialize
const currentContent = computed(() => {
  if (!props.book || !props.book.chapters) return ''
  return props.book.chapters[currentChapterIndex.value].content
})

const goToChapter = (index, initialScroll = 0) => {
  saveProgress.cancel() // Cancel pending saves from previous chapter
  currentChapterIndex.value = index
  scrollToActiveChapter()
  // We don't stop TTS here if it's an auto-advance, handled by caller
  
  // Reset or Restore scroll
  setTimeout(() => {
    if (contentRef.value) {
      contentRef.value.scrollTop = initialScroll
    }
  }, 50)
}

// Progress Saving
const performSaveProgress = () => {
  if (!props.book || !contentRef.value) return
  
  const scrollTop = contentRef.value.scrollTop
  // Calculate rough percentage
  const totalChapters = props.book.chapters.length
  const progressPercent = totalChapters > 0 
    ? Math.round(((currentChapterIndex.value + 1) / totalChapters) * 100)
    : 0
    
  window.electronAPI.saveBookProgress(
    props.book.id,
    currentChapterIndex.value,
    scrollTop,
    progressPercent
  )
}

const debounce = (fn, delay) => {
  let timeout
  const debounced = (...args) => {
    clearTimeout(timeout)
    timeout = setTimeout(() => fn(...args), delay)
  }
  debounced.cancel = () => clearTimeout(timeout)
  return debounced
}

const saveProgress = debounce(performSaveProgress, 1000)

const onScroll = () => {
  saveProgress()
}

// TTS Logic
const loadVoices = async () => {
  // System voices
  const systemVoices = synth.getVoices().filter(v => v.name.includes('Chinese') || v.name.includes('Microsoft') || v.lang.startsWith('zh'))
  
  // Edge voices
  let edgeVoices = []
  if (window.electronAPI && window.electronAPI.getEdgeVoices) {
      edgeVoices = await window.electronAPI.getEdgeVoices()
  }
  
  voices.value = [...edgeVoices, ...systemVoices]
  
  const xiaoxiao = voices.value.find(v => v.name.includes('Xiaoxiao'))
  if (xiaoxiao) {
      selectedVoiceURI.value = xiaoxiao.voiceURI
  } else {
      const msVoice = voices.value.find(v => v.name.includes('Microsoft'))
      if (msVoice) selectedVoiceURI.value = msVoice.voiceURI
      else if (voices.value.length > 0) selectedVoiceURI.value = voices.value[0].voiceURI
  }
}

let currentUtterance = null

const buildTTSQueue = () => {
  if (!contentRef.value) return
  ttsQueue = []
  
  // Check if already processed (look for span.tts-sentence)
  const existingSpans = contentRef.value.querySelectorAll('.tts-sentence')
  if (existingSpans.length > 0) {
    existingSpans.forEach(span => {
       ttsQueue.push({ text: span.innerText, element: span })
    })
    console.log('buildTTSQueue: Reused existing spans', ttsQueue.length)
    return
  }
  
  // Find all speakable block elements
  let elements = Array.from(contentRef.value.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li'))
  if (elements.length === 0) {
    elements = Array.from(contentRef.value.children)
  }
  if (elements.length === 0) {
    elements = [contentRef.value]
  }

  const segmenter = (window.Intl && Intl.Segmenter) 
    ? new Intl.Segmenter(undefined, { granularity: 'sentence' })
    : null

  for (const el of elements) {
    const text = el.innerText
    if (!text || !text.trim()) continue
    
    let segments = []
    if (segmenter) {
      segments = Array.from(segmenter.segment(text)).map(s => s.segment)
    } else {
      // Regex fallback - try to keep delimiters
      segments = text.match(/[^.!?。！？\n]+[.!?。！？\n]*/g) || [text]
    }
    
    // Clear element content to replace with spans
    el.innerHTML = ''
    
    for (const seg of segments) {
      // Skip empty segments or segments with only punctuation/symbols
      if (seg.trim().length > 0 && /[^\p{P}\p{S}\s]/u.test(seg)) {
        const span = document.createElement('span')
        span.className = 'tts-sentence'
        span.innerText = seg
        el.appendChild(span)
        
        ttsQueue.push({ text: seg, element: span })
      } else if (seg.length > 0) {
        // Append non-speakable text as plain text node to preserve layout
        el.appendChild(document.createTextNode(seg))
      }
    }
  }
  console.log('buildTTSQueue: Created new spans', ttsQueue.length)
}

const startTTS = (startIndex = 0) => {
  stopTTS(false)
  
  if (ttsQueue.length === 0) {
    buildTTSQueue()
  }
  
  if (ttsQueue.length === 0) return

  ttsIndex = startIndex
  isReading.value = true
  speakNext()
}

const handleContentClick = (event) => {
  const target = event.target
  // Capture block before potential DOM destruction (buildTTSQueue replaces innerHTML)
  const clickedBlock = target.closest('p, h1, h2, h3, h4, h5, h6, li')
  const isSpan = target.classList.contains('tts-sentence')

  if (!props.ttsActive && !isSpan && !clickedBlock) return

  // Let's try to build queue first.
  if (ttsQueue.length === 0) buildTTSQueue()
  
  let index = -1
  
  if (target.classList.contains('tts-sentence') && target.isConnected) {
    index = ttsQueue.findIndex(item => item.element === target)
  } else if (clickedBlock && clickedBlock.isConnected) {
    // Fallback: Find first span in this block
    const firstSpan = clickedBlock.querySelector('.tts-sentence')
    if (firstSpan) {
         index = ttsQueue.findIndex(item => item.element === firstSpan)
    }
  }
  
  if (index !== -1) {
    // Avoid restarting if clicking the currently reading sentence
    if (props.ttsActive && isReading.value && index === ttsIndex) {
      return
    }

    if (!props.ttsActive) {
      pendingTTSIndex.value = index
      emit('start-tts')
    } else {
      startTTS(index)
    }
  }
}

// Preload function
const preloadNextBatch = async (startIndex, voice, rate) => {
  for (let i = 0; i < PRELOAD_COUNT; i++) {
      const index = startIndex + i
      if (index >= ttsQueue.length) break
      if (preloadMap.has(index)) continue // Already preloaded
      
      const item = ttsQueue[index]
      // Mark as pending (use a placeholder or promise?)
      // Simplified: Just fire async, let it populate map
      
      window.electronAPI.speakEdge(item.text, voice.voiceURI, rate).then(result => {
          if (result.success) {
              const audio = new Audio(result.audio)
              audio.preload = 'auto'
              preloadMap.set(index, audio)
          }
      }).catch(e => console.error('Preload error for index', index, e))
  }
  
  // Cleanup old preloads
  for (const key of preloadMap.keys()) {
      if (key < startIndex) {
          preloadMap.delete(key)
      }
  }
}

const speakNext = async () => {
  if (!isReading.value || ttsIndex >= ttsQueue.length) {
    if (ttsIndex >= ttsQueue.length) {
      if (currentChapterIndex.value < props.book.chapters.length - 1) {
         // Auto advance
         console.log('speakNext: Auto advancing to next chapter')
         goToChapter(currentChapterIndex.value + 1)
         ttsQueue = []
         
         // Use nextTick to wait for Vue to update DOM with new chapter content
         nextTick(() => {
             // Give a small buffer for browser rendering/painting
             setTimeout(() => {
                 startTTS(0)
             }, 100)
         })
      } else {
         emit('stop-tts')
      }
    }
    return
  }
  
  const item = ttsQueue[ttsIndex]
  
  // Highlight logic
  // Remove highlight from previous
  if (ttsIndex > 0) {
      const prev = ttsQueue[ttsIndex - 1]
      if (prev.element) prev.element.classList.remove('tts-highlight')
  }
  // Add to current
  if (item.element) {
      item.element.classList.add('tts-highlight')
      item.element.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
  
  const sentence = item.text
  const nextItem = ttsQueue[ttsIndex + 1]
  const nextSentence = nextItem ? nextItem.text : ''
  
  const voice = voices.value.find(v => v.voiceURI === selectedVoiceURI.value)
  
  // Emit progress moved to specific handlers to include duration if possible

  if (voice && voice.localService === false) {
      // Edge TTS
      try {
          let audioToPlay = null
          
          // Check if preloaded
          if (preloadMap.has(ttsIndex)) {
              console.log('Using preloaded audio for index', ttsIndex)
              audioToPlay = preloadMap.get(ttsIndex)
              preloadMap.delete(ttsIndex)
          } else {
              // Not preloaded
              console.log('Not preloaded, fetching...', ttsIndex)
              const result = await window.electronAPI.speakEdge(sentence, voice.voiceURI, ttsRate.value)
              if (result.success) {
                  audioToPlay = new Audio(result.audio)
              } else {
                  console.error('Edge TTS failed, skipping sentence', sentence)
                  ttsIndex++
                  speakNext()
                  return
              }
          }
          
          // Trigger preload for NEXT batch immediately
          preloadNextBatch(ttsIndex + 1, voice, ttsRate.value)

          if (!isReading.value) return 

          let duration = 0
          if (audioToPlay) {
             // Wait for duration
             if (audioToPlay.readyState >= 1 && Number.isFinite(audioToPlay.duration)) {
                 duration = audioToPlay.duration
             } else {
                 await new Promise(resolve => {
                     audioToPlay.addEventListener('loadedmetadata', () => resolve(), { once: true })
                     // Timeout fallback
                     setTimeout(() => resolve(), 1000)
                 })
                 duration = audioToPlay.duration || 0
             }
          }
          
          // Emit with duration
          emit('tts-progress', { 
              text: sentence, 
              rate: ttsRate.value, 
              nextText: nextSentence,
              duration: duration
          })
          
          if (audioToPlay && isReading.value) { 
              if (currentAudio) {
                  currentAudio.pause()
                  currentAudio = null
              }
              
              currentAudio = audioToPlay
              
              currentAudio.onended = () => {
                  if (item.element) item.element.classList.remove('tts-highlight')
                  currentAudio = null
                  ttsIndex++
                  speakNext()
              }
              currentAudio.onerror = (e) => {
                  console.error('Audio playback error', e)
                  if (item.element) item.element.classList.remove('tts-highlight')
                  // Try to skip this sentence instead of stopping?
                  // emit('stop-tts')
                  // Let's try next
                  ttsIndex++
                  speakNext()
              }
              currentAudio.play().catch(e => console.error('Play error', e))
          }
      } catch (e) {
          console.error('Edge TTS error', e)
          emit('stop-tts')
      }
  } else {
      // System TTS
      emit('tts-progress', { text: sentence, rate: ttsRate.value, nextText: nextSentence })

      currentUtterance = new SpeechSynthesisUtterance(sentence)
      
      currentUtterance.rate = ttsRate.value
      if (voice) currentUtterance.voice = voice
      
      // onstart handled above via manual emit for consistency (Edge doesn't have onstart easily)
      // currentUtterance.onstart = ... 
      
      currentUtterance.onend = () => {
        if (item.element) item.element.classList.remove('tts-highlight')
        currentUtterance = null
        ttsIndex++
        speakNext()
      }
      
      currentUtterance.onerror = (e) => {
        console.error('TTS Error', e)
        if (item.element) item.element.classList.remove('tts-highlight')
        if (e.error !== 'interrupted') {
          emit('stop-tts')
        }
      }
      
      synth.speak(currentUtterance)
  }
}

const stopTTS = (reset = true) => {
  // Clear highlights
  ttsQueue.forEach(item => {
      if (item.element) item.element.classList.remove('tts-highlight')
  })

  if (currentUtterance) {
    currentUtterance.onend = null
    currentUtterance = null
  }
  synth.cancel()
  
  if (currentAudio) {
      currentAudio.pause()
      currentAudio = null
  }
  
  // Clear preload
  preloadMap.clear()
  
  isReading.value = false
  if (reset) ttsQueue = []
}

watch(() => props.ttsActive, (val) => {
  if (val) {
    const startIndex = pendingTTSIndex.value !== null ? pendingTTSIndex.value : 0
    pendingTTSIndex.value = null
    startTTS(startIndex)
  } else {
    stopTTS()
  }
})

watch(ttsRate, () => {
  if (props.ttsActive) {
    // Store current index
    const savedIndex = ttsIndex
    stopTTS(false)
    // ttsIndex is preserved because stopTTS(false) doesn't reset it? 
    // Wait, stopTTS(false) doesn't clear queue. 
    // But we need to restart speakNext.
    // And startTTS accepts index.
    startTTS(savedIndex)
  }
})

watch(selectedVoiceURI, () => {
   if (props.ttsActive) {
    const savedIndex = ttsIndex
    stopTTS(false)
    startTTS(savedIndex)
   }
})

watch(lyricsLocked, (val) => {
  if (window.electronAPI && window.electronAPI.lyricsLock) {
    window.electronAPI.lyricsLock(val)
  }
})

onMounted(() => {
  loadVoices()
  if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = loadVoices
  }
  
  // Listen for external lock updates
  if (window.electronAPI && window.electronAPI.onLyricsLocked) {
    window.electronAPI.onLyricsLocked((event, locked) => {
      console.log('Reader: Received lyrics locked update', locked)
      if (lyricsLocked.value !== locked) {
        lyricsLocked.value = locked
      }
    })
  }
  
  // Restore progress
  if (props.book) {
     const lastChapter = props.book.chapter_index || 0
     const lastScroll = props.book.scroll_top || 0
     if (lastChapter > 0 || lastScroll > 0) {
       goToChapter(lastChapter, lastScroll)
     } else {
       scrollToActiveChapter()
     }
  }
})

onBeforeUnmount(() => {
  performSaveProgress()
})

onUnmounted(() => {
  stopTTS()
})

// Paging logic
const nextPage = () => {
  if (contentRef.value) {
    if (viewMode.value === 'scroll') {
      contentRef.value.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' })
    } else {
      contentRef.value.scrollBy({ left: contentRef.value.clientWidth, behavior: 'smooth' })
    }
  }
}

const prevPage = () => {
  if (contentRef.value) {
     if (viewMode.value === 'scroll') {
      contentRef.value.scrollBy({ top: -window.innerHeight * 0.8, behavior: 'smooth' })
    } else {
      contentRef.value.scrollBy({ left: -contentRef.value.clientWidth, behavior: 'smooth' })
    }
  }
}
</script>

<style scoped>
.reader {
  display: flex;
  height: 100%;
  overflow: hidden;
}

.sidebar {
  width: 250px;
  flex-shrink: 0;
  border-right: 1px solid #ccc;
  display: flex;
  flex-direction: column;
  background: #f9f9f9;
  transition: width 0.3s;
}
.sidebar.collapsed {
  width: 30px;
}
.sidebar ul {
  list-style: none;
  padding: 0;
  margin: 0;
  overflow-y: auto;
  flex: 1;
}
.sidebar li {
  padding: 10px;
  cursor: pointer;
  border-bottom: 1px solid #eee;
}
.sidebar li:hover {
  background: #eee;
}
.sidebar li.active {
  background: #ddd;
  font-weight: bold;
}
.toggle-sidebar {
  width: 100%;
  height: 40px;
  border: none;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #666;
  border-bottom: 1px solid #eee;
  transition: background 0.2s, color 0.2s;
}
.toggle-sidebar:hover {
  background: #eaeaea;
  color: #333;
}

.main-area {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  position: relative;
}

.toolbar {
  padding: 10px;
  background: #fff;
  border-bottom: 1px solid #eee;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 15px;
}

.content-viewer {
  flex: 1;
  padding: 40px;
  font-size: 18px;
  line-height: 1.6;
  font-family: 'Georgia', serif;
  overflow-y: auto;
}

.settings-btn {
  background: none;
  border: 1px solid #ccc;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
  padding: 2px 6px;
}

.settings-panel {
  padding: 10px;
  background: #f0f0f0;
  border-bottom: 1px solid #ccc;
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
}

.setting-item {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 14px;
}

.content-viewer.paging {
  overflow-y: hidden;
  overflow-x: hidden; /* Hidden because we scroll programmatically */
  height: calc(100vh - 100px); /* Approximate */
  column-width: calc(100vw - 300px); /* Adjust for sidebar */
  column-gap: 40px;
  width: 100%;
}

.paging-controls {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
}
.page-left, .page-right {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 20%;
  pointer-events: auto;
  cursor: pointer;
}
.page-left { left: 0; }
.page-right { right: 0; }
.page-left:hover { background: linear-gradient(to right, rgba(0,0,0,0.05), transparent); }
.page-right:hover { background: linear-gradient(to left, rgba(0,0,0,0.05), transparent); }

:deep(.tts-highlight) {
  background-color: yellow;
  color: black;
}
</style>
