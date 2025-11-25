<template>
  <div 
    class="lyrics-container" 
    :class="{ locked: isLocked }"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
  >
    <div class="toolbar" v-if="showToolbar">
       <div class="drag-handle">::</div>
       <button @click="toggleLock" class="tool-btn">
         {{ isLocked ? 'Unlock' : 'Lock' }}
       </button>
       <button @click="closeLyrics" class="tool-btn">X</button>
    </div>

    <div class="lyrics-content">
      <!-- Current Line -->
      <div class="line-wrapper current-wrapper" ref="currentWrapper">
         <div 
           class="line-text current-text" 
           ref="currentTextRef"
           :style="textStyle"
         >
           {{ currentText || 'Waiting...' }}
         </div>
      </div>

      <!-- Next Line -->
      <div class="line-wrapper next-wrapper">
        <div class="line-text next-text">
          {{ nextText }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, nextTick, computed } from 'vue'

const currentText = ref('')
const nextText = ref('')
const isLocked = ref(false)
const showToolbar = ref(true)
const currentRate = ref(1.0)
const currentDuration = ref(0)
const fontSize = ref(28)
const color = ref('#2effcf')

const textStyle = computed(() => ({
  fontSize: `${fontSize.value}px`,
  color: color.value
}))

// Elements
const currentWrapper = ref(null)
const currentTextRef = ref(null)

let currentAnimation = null

// Electron API
const electron = window.electronAPI

const toggleLock = () => {
  isLocked.value = !isLocked.value
  if (electron && electron.lyricsLock) {
    electron.lyricsLock(isLocked.value)
  }
}

const closeLyrics = () => {
  if (electron && electron.toggleLyricsWindow) {
    electron.toggleLyricsWindow(false)
  }
}

const onMouseEnter = () => {
  if (!isLocked.value) showToolbar.value = true
}

const onMouseLeave = () => {
  showToolbar.value = false
}

// Scrolling Logic
const updateScrolling = async () => {
  await nextTick()
  
  if (currentAnimation) {
    currentAnimation.cancel()
    currentAnimation = null
  }
  
  if (!currentWrapper.value || !currentTextRef.value) return
  
  const containerWidth = currentWrapper.value.clientWidth
  const textWidth = currentTextRef.value.scrollWidth
  
  // Reset position
  currentTextRef.value.style.transform = 'translateX(0)'
  
  // Center if short, left align if long for scrolling
  if (textWidth <= containerWidth) {
      currentWrapper.value.style.justifyContent = 'center'
  } else {
      currentWrapper.value.style.justifyContent = 'flex-start'
      
      // Calculate duration
      let duration
      if (currentDuration.value && currentDuration.value > 0) {
         // Use exact audio duration if available (duration is in seconds)
         duration = currentDuration.value * 1000
      } else {
         // Fallback heuristic
         const charCount = currentText.value.length
         // Duration in seconds
         const durationSec = (charCount * 0.35) / currentRate.value
         duration = durationSec * 1000
      }
      
      const distance = textWidth - containerWidth
      
      currentAnimation = currentTextRef.value.animate([
        { transform: 'translateX(0)' },
        { transform: `translateX(-${distance}px)` }
      ], {
        duration: duration,
        iterations: 1,
        fill: 'forwards',
        easing: 'linear'
      })
  }
}

watch([currentText, currentRate], () => {
  updateScrolling()
})

onMounted(() => {
  if (electron && electron.onLyricsControl) {
    electron.onLyricsControl((event, data) => {
      if (typeof data === 'string') {
        if (data !== currentText.value) {
           currentText.value = data
           nextText.value = ''
        }
        currentRate.value = 1.0
      } else {
        // data is { text, rate, nextText }
        if (data.text !== currentText.value) {
          currentText.value = data.text
          nextText.value = data.nextText || ''
          currentRate.value = data.rate || 1.0
          currentDuration.value = data.duration || 0
        }
      }
    })
  }
  
  if (electron && electron.onLyricsStyle) {
    electron.onLyricsStyle((event, style) => {
      console.log('Lyrics: Received style update', style)
      if (style.fontSize) fontSize.value = Number(style.fontSize)
      if (style.color) color.value = style.color
      // Force update scrolling if needed
      nextTick(updateScrolling)
    })
  } else {
      console.error('Lyrics: electron.onLyricsStyle is missing')
  }

  if (electron && electron.onLyricsLocked) {
    electron.onLyricsLocked((event, locked) => {
      console.log('Lyrics: Received lock update', locked)
      isLocked.value = locked
    })
  }
})
</script>

<style scoped>
:global(body), :global(#app) {
  background-color: transparent !important;
}

.lyrics-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: transparent;
  overflow: hidden;
  position: relative;
  border-radius: 8px;
  transition: background 0.3s;
  -webkit-app-region: drag;
}

.lyrics-container:hover:not(.locked) {
  background: rgba(0, 0, 0, 0.6);
  cursor: move;
}

.lyrics-container.locked {
  background: transparent;
  -webkit-app-region: no-drag;
}

.toolbar {
  height: 24px;
  display: flex;
  align-items: center;
  background: rgba(0, 0, 0, 0.5);
  padding: 0 8px;
  z-index: 20;
}

.drag-handle {
  flex: 1;
  cursor: move;
  color: #aaa;
  -webkit-app-region: drag;
  font-size: 12px;
  line-height: 24px;
}

.tool-btn {
  background: transparent;
  border: 1px solid #666;
  color: #ddd;
  font-size: 10px;
  cursor: pointer;
  margin-left: 4px;
  padding: 1px 4px;
  border-radius: 2px;
  -webkit-app-region: no-drag;
}
.tool-btn:hover {
  background: #555;
  color: white;
}

.lyrics-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 5px 10px;
  overflow: hidden;
}

.line-wrapper {
  width: 100%;
  overflow: hidden;
  display: flex;
  justify-content: center; 
}

.current-wrapper {
  margin-bottom: 4px;
  /* height: 40px; Removed to allow dynamic sizing */
  align-items: center;
  min-height: 40px;
}

.line-text {
  white-space: nowrap;
  font-family: "Microsoft YaHei", sans-serif;
  text-shadow: 
    -1px -1px 0 #000,  
    1px -1px 0 #000,
    -1px 1px 0 #000,
    1px 1px 0 #000,
    0 0 4px rgba(0,0,0,0.8);
}

.current-text {
  font-size: 28px; 
  font-weight: bold;
  color: #2effcf; 
  will-change: transform;
}

.next-text {
  font-size: 16px;
  color: rgba(255, 255, 255, 0.6);
}
</style>
