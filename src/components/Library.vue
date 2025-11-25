<template>
  <div class="p-5">
    <div class="mb-5 flex gap-2.5 justify-end" v-if="books.length > 0">
      <button @click="toggleManage" class="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80 h-10 px-4 py-2">
        {{ isManaging ? 'Cancel' : 'Manage' }}
      </button>
      <button v-if="isManaging && selectedBooks.size > 0" @click="deleteSelected" class="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-destructive text-destructive-foreground hover:bg-destructive/90 h-10 px-4 py-2">
        <Trash2 class="mr-2 h-4 w-4" />
        Delete Selected ({{ selectedBooks.size }})
      </button>
    </div>

    <div v-if="loading" class="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>
    <div v-else-if="books.length === 0" class="flex items-center justify-center h-64 text-muted-foreground">No books found. Import one!</div>
    <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-5">
      <div 
        v-for="book in books" 
        :key="book.id" 
        class="group relative rounded-lg border border-border bg-card text-card-foreground shadow-sm p-2.5 cursor-pointer transition-all hover:-translate-y-1 hover:shadow-md"
        :class="{ 'ring-2 ring-primary bg-accent': selectedBooks.has(book.id) }"
        @click="handleBookClick(book)"
      >
        <div v-if="isManaging" class="absolute top-2.5 right-2.5 z-10">
          <input type="checkbox" :checked="selectedBooks.has(book.id)" class="h-4 w-4 rounded border-primary text-primary focus:ring-primary" />
        </div>
        <button v-else class="absolute top-1.5 right-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-background/90 border border-border text-destructive opacity-0 transition-opacity hover:bg-destructive hover:text-destructive-foreground group-hover:opacity-100" @click.stop="deleteOne(book)" title="Delete book">
          <X class="h-3 w-3" />
        </button>
        
        <div class="h-[180px] bg-muted flex items-center justify-center text-4xl text-muted-foreground mb-2.5 rounded-md overflow-hidden">
          {{ book.title[0] }}
        </div>
        <div class="space-y-1">
          <h3 class="font-semibold leading-none tracking-tight truncate" :title="book.title">{{ book.title }}</h3>
          <p class="text-xs text-muted-foreground">{{ book.author || 'Unknown' }}</p>
          <div class="flex items-center justify-between">
             <p class="text-[10px] font-bold uppercase text-muted-foreground">{{ book.format }}</p>
             <p v-if="book.last_chapter_index > 0 || book.progress > 0" class="text-[10px] font-medium text-primary">Reading</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { X, Trash2 } from 'lucide-vue-next'

const emit = defineEmits(['open-book'])
const books = ref([])
const loading = ref(true)
const isManaging = ref(false)
const selectedBooks = ref(new Set())

const loadBooks = async () => {
  loading.value = true
  try {
    books.value = await window.electronAPI.getBooks()
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

onMounted(loadBooks)

const toggleManage = () => {
  isManaging.value = !isManaging.value
  selectedBooks.value.clear()
}

const handleBookClick = (book) => {
  if (isManaging.value) {
    if (selectedBooks.value.has(book.id)) {
      selectedBooks.value.delete(book.id)
    } else {
      selectedBooks.value.add(book.id)
    }
  } else {
    emit('open-book', book)
  }
}

const deleteOne = async (book) => {
  if (!confirm(`Are you sure you want to delete "${book.title}"?`)) return
  const success = await window.electronAPI.deleteBook(book.id)
  if (success) loadBooks()
}

const deleteSelected = async () => {
  if (!confirm(`Delete ${selectedBooks.value.size} books?`)) return
  const success = await window.electronAPI.deleteBooks(Array.from(selectedBooks.value))
  if (success) {
    selectedBooks.value.clear()
    isManaging.value = false
    loadBooks()
  }
}
</script>

