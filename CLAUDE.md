# CLAUDE.md

An EPUB reader with an AI reading companion (Next.js 15, React 19, Supabase, epub.js, Mistral). `HANDOFF.md` is the full architecture and design document; read it before larger changes. This file holds the points that are easy to get wrong.

## Commands

```bash
npm run dev        # local server (needs .env.local, see .env.example)
npm test           # vitest: unit, component (jsdom) and database (PGlite) tests
npm run typecheck
npm run lint
```

Every push to `main` deploys to production (Vercel).

## Reader layout

- `components/reader/reader-shell.tsx`: the reader screen. It owns the drawers, the keyboard shortcuts and the text size.
- `components/reader/epub-viewer.tsx`: the epub.js rendition. It sets the theme rules, the chapter content hooks, page turns, and position save and sync.
- `components/reader/summon-controls.tsx`: the drawer buttons.
- `lib/reader/*`: helpers that run on each chapter document: `content-security.ts` (CSP lockdown, a spine hook), `fonts.ts`, `image-pages.ts`, `scrollbars.ts`, `tap-select.ts`, `text-size.ts`.

## Drawer triggers

The drawers slide over the page, so it never re-paginates. Contents and library are on the left; notes and the assistant are on the right. They open from:

1. **A corner button** (`SummonControls`). The left button shows Penguin-banded books (`BooksIcon`); the right one shows speech bubbles (`DialogueIcon`). Each is always rendered but faint while reading. It comes up to full strength for 4 s when a book opens, when the mouse enters its corner zone, or for 3.5 s after a tap on the page (`revealToken`). The buttons are hidden while a drawer is open.
2. **A swipe in from the edge**, on touch screens only (`onEdgeSwipe` in the viewer).
3. **The keyboard**: ⌘/ (Ctrl+/) toggles the assistant and ⌘⇧H toggles the notes (`readerShortcut`). When the book has focus, key presses arrive from its iframe through `onFrameKeyDown`.

There are no edge hover zones and no mid-edge tabs; both were removed. Pages turn with the arrow keys, with invisible margin buttons (`PageButton`), or with touch swipes.

## Do not

- **Never put `overflow: hidden` on the chapter's `html` or `body`**, whether in the epub.js theme or in any CSS injected into the iframe. It clips epub.js's column layout, so every page after the first comes up blank. Scrollbars are hidden visually instead: `scrollbar-width: none` and `::-webkit-scrollbar` rules, in `lib/reader/scrollbars.ts` (inside the chapter) and `app/globals.css` (the page and `.epub-container`). Overflow-hidden on the app's own wrapper `div`s is fine.
- Don't put `::-webkit-scrollbar` or other browser-specific selectors in `rendition.themes.default`. epub.js inserts theme rules with `insertRule`, which throws on a selector the browser doesn't know (Firefox) and stops the rest of the theme being applied. Inject a `<style>` element from a content hook instead.
- Don't change the iframe sandbox or the order of the content hooks without re-testing on a real iPhone or iPad (see HANDOFF.md, "Chapter sandbox (CSP)").
- Don't leave `console.log` debugging in client code. `console.warn` and `console.error` for real failures are fine.
