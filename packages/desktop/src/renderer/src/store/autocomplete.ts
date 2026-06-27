/**
 * Pinia store: autocomplete dictionary.
 *
 * Responsibilities:
 *  - Track loaded .txt file metadata (path, name, word count).
 *  - Hold the flat deduplicated word array (`dictionary`).
 *  - Read files via Electron IPC and index them.
 *  - Push the dictionary into the Muya instance whenever it changes.
 */
import { defineStore } from 'pinia'
import { watch } from 'vue'

export interface AutocompleteFile {
  path: string
  name: string
  wordCount: number
}

export const useAutocompleteStore = defineStore('autocomplete', {
  state: () => ({
    files: [] as AutocompleteFile[],
    dictionary: [] as string[],
  }),

  getters: {
    totalIndexed: (state) => state.dictionary.length,
  },

  actions: {
    async addFiles(paths: string[]) {
      for (const filePath of paths) {
        // Avoid duplicates
        if (this.files.find(f => f.path === filePath)) continue

        const content: string = await window.electron.ipcRenderer.invoke(
          'mt::read-autocomplete-file',
          filePath,
        )
        if (!content) continue

        const words = this._tokenize(content)
        this.files.push({
          path: filePath,
          name: filePath.split(/[\/\\]/).pop() ?? filePath,
          wordCount: words.length,
        })

        // Merge into master dictionary (deduplicated)
        this._mergeWords(words)
      }

      this._pushToDictionary()
    },

    removeFile(index: number) {
      this.files.splice(index, 1)
      // Full reindex from remaining files
      this._reindex()
    },

    async _reindex() {
      this.dictionary = []
      const paths = this.files.map(f => f.path)
      this.files = []
      await this.addFiles(paths)
    },

    _tokenize(text: string): string[] {
      // Split on whitespace + punctuation; keep Persian/Arabic/Latin words.
      // Minimum 2 chars, maximum 40 chars.
      return text
        .split(/[\s\p{P}]+/u)
        .map(w => w.trim())
        .filter(w => w.length >= 2 && w.length <= 40)
    },

    _mergeWords(words: string[]) {
      const set = new Set(this.dictionary)
      for (const w of words) set.add(w)
      this.dictionary = [...set]
    },

    /** Send the updated dictionary to the active Muya instance via the bus. */
    _pushToDictionary() {
      // The desktop renderer exposes the Muya instance on the global bus.
      // We emit an event that the editor component picks up.
      import('../bus').then(({ default: bus }) => {
        bus.emit('autocomplete:update-dictionary', this.dictionary)
      })
    },

    /** Persist file paths to user data so they survive app restarts. */
    persist() {
      window.electron.ipcRenderer.send(
        'mt::save-autocomplete-paths',
        this.files.map(f => f.path),
      )
    },

    /** Restore file paths on startup. */
    async restore() {
      const paths: string[] = await window.electron.ipcRenderer.invoke(
        'mt::load-autocomplete-paths',
      )
      if (paths?.length) await this.addFiles(paths)
    },
  },
})
