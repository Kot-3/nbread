<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
    <div class="bg-card text-card-foreground p-6 rounded-lg shadow-lg flex flex-col items-center gap-4 min-w-[200px]">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      <p class="text-sm font-medium">{{ message || 'Loading...' }}</p>
    </div>
  </div>
</template>

<script setup>
defineProps({
  message: String
})
</script>
