<template>
  <div class="autocomplete-panel">
    <h3 class="panel-title">{{ t('Word Autocomplete') }}</h3>

    <!-- File drop zone -->
    <div
      class="drop-zone"
      :class="{ 'drop-zone--over': isDragging }"
      @dragover.prevent="isDragging = true"
      @dragleave="isDragging = false"
      @drop.prevent="onDrop"
      @click="openFilePicker"
    >
      <span class="drop-zone__icon">📄</span>
      <span>{{ t('Drop .txt files here or click to browse') }}</span>
    </div>

    <!-- Loaded files list -->
    <ul v-if="files.length" class="file-list">
      <li v-for="(f, i) in files" :key="f.path" class="file-list__item">
        <span class="file-list__name" :title="f.path">{{ f.name }}</span>
        <span class="file-list__count">{{ f.wordCount.toLocaleString() }} words</span>
        <button class="file-list__remove" @click="removeFile(i)" :title="t('Remove')">✕</button>
      </li>
    </ul>

    <!-- Stats bar -->
    <div class="stats-bar">
      <span>{{ t('Total indexed') }}:</span>
      <strong>{{ totalIndexed.toLocaleString() }}</strong>
      <span>{{ t('items') }}</span>
    </div>

    <!-- Preview -->
    <div v-if="preview.length" class="preview">
      <p class="preview__label">{{ t('Sample suggestions') }}</p>
      <div class="preview__chips">
        <span v-for="w in preview" :key="w" class="preview__chip">{{ w }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAutocompleteStore } from '../../store/autocomplete'

const { t } = useI18n({ useScope: 'global' })
const store = useAutocompleteStore()

const isDragging = ref(false)

const files = computed(() => store.files)
const totalIndexed = computed(() => store.totalIndexed)
const preview = computed(() => store.dictionary.slice(0, 30))

async function openFilePicker() {
  const paths = await window.electron.ipcRenderer.invoke('mt::pick-autocomplete-files')
  if (paths?.length) store.addFiles(paths)
}

function onDrop(e: DragEvent) {
  isDragging.value = false
  const droppedPaths: string[] = []
  const items = e.dataTransfer?.items ?? []
  for (const item of Array.from(items)) {
    const entry = item.webkitGetAsEntry()
    if (entry?.isFile && entry.name.endsWith('.txt')) {
      droppedPaths.push((item.getAsFile() as File & { path?: string }).path ?? entry.name)
    }
  }
  if (droppedPaths.length) store.addFiles(droppedPaths)
}

function removeFile(index: number) {
  store.removeFile(index)
}
</script>

<style scoped>
.autocomplete-panel {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.panel-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}
.drop-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 20px;
  border: 2px dashed var(--sideBarBorderColor, #ccc);
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--editorColor60, #888);
  transition: background 0.15s;
}
.drop-zone--over,
.drop-zone:hover {
  background: var(--floatHoverColor, rgba(0,0,0,0.04));
}
.drop-zone__icon { font-size: 24px; }
.file-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.file-list__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  font-size: 13px;
  background: var(--floatHoverColor, rgba(0,0,0,0.03));
}
.file-list__name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-list__count { color: var(--editorColor60, #888); white-space: nowrap; }
.file-list__remove {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--editorColor60, #888);
  font-size: 12px;
  padding: 2px 4px;
  border-radius: 4px;
}
.file-list__remove:hover { color: var(--deleteColor, #e55); }
.stats-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--editorColor60, #888);
}
.stats-bar strong { color: var(--editorColor, inherit); }
.preview__label { margin: 0 0 6px; font-size: 12px; color: var(--editorColor60, #888); }
.preview__chips { display: flex; flex-wrap: wrap; gap: 6px; }
.preview__chip {
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  background: var(--floatHoverColor, rgba(0,0,0,0.06));
}
</style>
