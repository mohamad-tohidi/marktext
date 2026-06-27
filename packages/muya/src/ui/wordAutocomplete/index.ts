/**
 * WordAutocomplete — inline shadow suggestion plugin for Muya.
 *
 * Behaviour:
 *   - On every keystroke, extract the word immediately before the caret.
 *   - Query the loaded dictionary with Fuse.js (prefix-priority).
 *   - Render the top match as ghost text RIGHT after the caret using a
 *     `<span class="mu-autocomplete-ghost">` injected into the DOM.
 *   - Tab  → accept (insert the completion suffix + remove ghost span).
 *   - Escape / any non-printable that changes the word → remove ghost span.
 *
 * Integration checklist (done separately):
 *   1. Add `suggestionDictionary?: string[]` to IMuyaOptions  (types.ts)
 *   2. Export this class from  packages/muya/src/index.ts
 *   3. Register as a Muya plugin from the desktop shell, same as EmojiSelector.
 *   4. Pipe the word list from the desktop preferences store into muya options.
 */

import Fuse from 'fuse.js';
import type { Muya } from '../../muya';
import BaseFloat from '../baseFloat';
import './index.css';

/** The CSS class placed on the ghost text span injected after the caret. */
const GHOST_CLASS = 'mu-autocomplete-ghost';

/** Minimum prefix length before we show a suggestion. */
const MIN_PREFIX_LEN = 2;

/** Maximum number of Fuse results we inspect (we only show the top one). */
const FUSE_LIMIT = 5;

export class WordAutocomplete extends BaseFloat {
    static pluginName = 'wordAutocomplete';

    /** Tab / Escape do NOT bubble to the content handler when we are active. */
    public override capturesContentKeydown = false; // ghost text — we intercept via DOM keydown directly

    private _fuse: Fuse<string> | null = null;
    private _ghostSpan: HTMLElement | null = null;
    private _currentSuffix = '';
    private _currentEditableEl: HTMLElement | null = null;

    constructor(muya: Muya) {
        // We do not use the BaseFloat popup box at all — we only need the
        // muya reference and the lifecycle hooks.  Pass a placeholder name.
        super(muya, 'mu-word-autocomplete', {});
        this._buildIndex();
        this._listenKeydown();
        this._listenMuyaInput();
    }

    // ─── Public API ────────────────────────────────────────────────────────────

    /**
     * Replace the current dictionary and rebuild the Fuse index.
     * Call this whenever the desktop loads new .txt files.
     */
    setDictionary(words: string[]) {
        const cleaned = [...new Set(words.filter(w => w.length >= MIN_PREFIX_LEN))];
        this._fuse = new Fuse(cleaned, {
            includeScore: true,
            threshold: 0.35,   // tighter = more precise match
            minMatchCharLength: MIN_PREFIX_LEN,
        });
    }

    // ─── Private ────────────────────────────────────────────────────────────────

    private _buildIndex() {
        const words: string[] = (this.muya as any).options?.suggestionDictionary ?? [];
        this.setDictionary(words);
    }

    /** Listen for every keydown on the muya root to intercept Tab / Escape. */
    private _listenKeydown() {
        const { eventCenter, domNode } = this.muya;
        eventCenter.attachDOMEvent(domNode, 'keydown', (e: Event) => {
            if (!(e instanceof KeyboardEvent)) return;
            if (e.key === 'Tab' && this._ghostSpan) {
                e.preventDefault();
                e.stopPropagation();
                this._acceptSuggestion();
            } else if (e.key === 'Escape') {
                this._removeGhost();
            }
        });
    }

    /**
     * Hook into muya's 'content-change' event (fired after every edit).
     * We re-run the suggestion lookup on every change.
     */
    private _listenMuyaInput() {
        const { eventCenter } = this.muya;
        // 'content-change' is the canonical post-edit event in Muya.
        eventCenter.on('content-change', () => {
            this._onInput();
        });
    }

    private _onInput() {
        if (!this._fuse) return;

        const prefix = this._getWordPrefix();
        if (!prefix || prefix.length < MIN_PREFIX_LEN) {
            this._removeGhost();
            return;
        }

        const results = this._fuse.search(prefix, { limit: FUSE_LIMIT });
        if (!results.length) {
            this._removeGhost();
            return;
        }

        const best = results[0].item;
        if (!best.toLowerCase().startsWith(prefix.toLowerCase())) {
            // Fuse found a fuzzy match but it doesn't share the prefix — skip.
            this._removeGhost();
            return;
        }

        const suffix = best.slice(prefix.length);
        if (!suffix) {
            this._removeGhost();
            return;
        }

        this._showGhost(suffix);
    }

    /**
     * Read the text from the beginning of the current word up to the caret.
     * Works by inspecting the browser selection inside the Muya DOM.
     */
    private _getWordPrefix(): string {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return '';
        const range = sel.getRangeAt(0);
        if (!range.collapsed) return '';

        // Walk back through the current text node to extract the word fragment.
        const node = range.startContainer;
        if (node.nodeType !== Node.TEXT_NODE) return '';
        const text = node.textContent ?? '';
        const offset = range.startOffset;
        const before = text.slice(0, offset);
        // A "word" in Persian/Arabic/Latin: anything that is not whitespace.
        const match = before.match(/(\S+)$/);
        return match ? match[1] : '';
    }

    private _showGhost(suffix: string) {
        this._removeGhost(); // clear any previous ghost first

        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0).cloneRange();

        const span = document.createElement('span');
        span.className = GHOST_CLASS;
        span.textContent = suffix;
        span.contentEditable = 'false';
        span.setAttribute('data-ghost', 'true');

        // Insert the ghost span right at the caret position.
        range.collapse(true);
        range.insertNode(span);

        // Restore the caret to before the ghost span (so typing continues).
        range.setStartBefore(span);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);

        this._ghostSpan = span;
        this._currentSuffix = suffix;
        this._currentEditableEl = span.closest('[contenteditable="true"]') as HTMLElement | null;
    }

    private _acceptSuggestion() {
        if (!this._ghostSpan || !this._currentSuffix) return;

        const sel = window.getSelection();
        const ghostParent = this._ghostSpan.parentNode;
        if (!ghostParent) return;

        // Build a text node with the suffix and replace the ghost span.
        const textNode = document.createTextNode(this._currentSuffix);
        ghostParent.replaceChild(textNode, this._ghostSpan);

        // Move caret to the end of the inserted text.
        if (sel) {
            const range = document.createRange();
            range.setStartAfter(textNode);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
        }

        this._ghostSpan = null;
        this._currentSuffix = '';

        // Notify Muya that content changed so it can sync its internal state.
        this._currentEditableEl?.dispatchEvent(new InputEvent('input', { bubbles: true }));
        this._currentEditableEl = null;
    }

    private _removeGhost() {
        if (!this._ghostSpan) return;
        this._ghostSpan.remove();
        this._ghostSpan = null;
        this._currentSuffix = '';
        this._currentEditableEl = null;
    }

    // BaseFloat requires show/hide; ghost text manages its own visibility.
    override show(reference: Element) {
        void reference;
    }

    override hide() {
        this._removeGhost();
    }

    override destroy() {
        this._removeGhost();
        this._fuse = null;
        super.destroy();
    }
}
