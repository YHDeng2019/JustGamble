# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

JustGamble (杰斯刚宝) — a single-page Texas Hold'em poker game. Play against LLM-driven AI opponents, with local multi-user accounts, game history, and a Balatro-inspired neon casino aesthetic. Pure front-end, zero backend: all data lives in `localStorage`. UI text is Chinese.

## Commands

```bash
npm run dev      # Vite dev server (HMR). Note: if 5173 is taken it auto-picks 5174, etc.
npm run build    # Production build to dist/ — USE THIS to verify changes compile
npm run lint     # ESLint
npm run preview  # Preview the production build
```

There is **no test suite**. Verify changes with `npm run build` (it must pass) and by playing in the browser. `npm run lint` reports a set of **pre-existing** errors across nearly every file (`'React' is defined but never used`, `setState in effect`, `Cannot access refs during render`) — these are baseline noise, not regressions. Only worry about *new* lint errors in files you create.

## Architecture

React 19 + Vite. **No router** — `src/App.jsx` holds a `currentPage` state and switches between page components (`SELECT_USER → MENU → GAME → HISTORY → SETTINGS`). Stealth mode and the audio BGM switch are also owned by `App.jsx` and threaded down as props.

Three concern layers:
- `src/game/` — pure game logic (no React): `engine.js` (state machine), `deck.js`, `handEval.js` (7→5 best hand), `pot.js` (side pots), plus cross-cutting `sound.js` and `debugLog.js`.
- `src/ai/` — `personalities.js` (5 AI profiles), `llmPlayer.js` (LLM API call), `localPlayer.js` (rule-based fallback).
- `src/auth/` — `storage.js` (localStorage wrapper), `userManager.js` (CRUD + stats), `session.js` (in-memory current user).
- `src/pages/` + `src/ui/` — React components. `src/styles/` — plain CSS, all `@import`ed through `main.css`.

### Game engine is a mutable class held in a ref — this matters

`GameEngine` (`src/game/engine.js`) is an imperative, mutable state machine: `WAITING → DEALING → PRE_FLOP → FLOP → TURN → RIVER → SHOWDOWN → RESULT`. It mutates `this.players[]` in place. `Game.jsx` drives it.

**CRITICAL — React state closure trap.** `Game.jsx` orchestrates the engine through `processTurn` (a `useCallback`) whose `setTimeout` chains (AI think delays, round-end auto-advance) capture an *old render's* closure. Reading the `game` or `user` **React state** inside those callbacks gives stale/`null` values — this caused repeated "game freezes after opponent folds" bugs. The fix that is now in place and must be preserved:
- The engine instance lives in `gameRef` (a `useRef`), not just `useState`. All delayed callbacks read `gameRef.current`.
- The current user is re-read via `refreshSessionUser()` inside callbacks, never closed-over `user` state.
- When adding any new deferred logic, follow this: **`gameRef.current` + `refreshSessionUser()`, never the state variables.**

`showdown()` stores its result on `engine.lastShowdownResult` and sets stage to `RESULT`. `Game.jsx` reads that field rather than calling `showdown()` again (calling it twice double-pays the pot). When the hand ends by everyone folding, the engine calls `endHand()` which does NOT set `lastShowdownResult` — `Game.jsx` must handle that branch by constructing the winner result manually.

### AI decision flow

On an AI's turn, `Game.jsx` calls `llmAIDecide` (`src/ai/llmPlayer.js`), which POSTs the game state to an OpenAI-compatible `/chat/completions` endpoint and expects a JSON `{action, amount, reasoning}`. On any failure (no API key, timeout, bad JSON, invalid action) it silently falls back to `localAIDecide` (`src/ai/localPlayer.js`), a per-personality rule engine. The returned decision carries `aiType: 'llm' | 'local'` which drives the 🧠/💻 badge.

API config (base URL, key, model) is **per-user**, stored plaintext in that user's `settings` in localStorage. New users get a hardcoded default ByteDance Doubao endpoint in `userManager.createUser`. Think-time is humanized in `Game.jsx` (bell-curve on hand strength × bet pressure) — `llmPlayer.js` deliberately has NO artificial delay so the two don't stack.

### Audio (`src/game/sound.js`)

Hybrid: short SFX (deal, flip, check, fold, win, lose, allin, yourturn) are **synthesized** with Web Audio oscillators; `chip` (call/raise) is a **real sample** (`/audio/poker_chips.wav`); two looping BGM tracks (`welcom_bgm.wav` menu, `gaming.mp3` in-game) cross-fade on page change. `App.jsx` owns BGM switching and must `unlockAudio()` on first user gesture (browser autoplay policy blocks audio before any interaction). `playSound(name, muted)` and the BGM both respect `isSoundEnabled()` and the stealth flag.

### Stealth mode ("摸鱼模式")

A panic-style toggle (👔/🐟) that makes the whole app look like a plain black-and-white document for playing at the office. It is a single boolean in `App.jsx` applied as a `.stealth-mode` class on the root, with extensive overrides at the bottom of `src/styles/main.css` that flatten every color/gradient/glow to white-bg/black-border and **mute all audio including BGM**. Any new colored UI element (badges, toasts, drama effects) needs a matching `.stealth-mode` override or it will leak color and break the disguise.

### Data persistence

`localStorage` keys: `poker_users` (dict of all users), `poker_current_user` (active userId), `poker_sound_enabled`, `poker_debug_log`. A "game record" is saved to a user's `history` (capped at 50) **only on exit** (`handleExit`), not per hand — the per-hand flow uses a lightweight toast + auto-advance, and `sessionHistory` accumulates rounds in component state until exit. Rounds that reached showdown carry a `showdown` snapshot (community + each player's hand/handName/winner) so History can render the revealed cards.

`debugLog.js` records the most recent hand's full event timeline to `localStorage.poker_debug_log` (also `window.__pokerDebug.dump()` in console). This is the bug-diagnosis tool — but localStorage is browser-only and cannot be read from the terminal; ask the user to paste `window.__pokerDebug.dump()` output, or diagnose from code.

## Editing gotcha

Many source files contain Chinese string literals. The `Edit` tool's exact-match sometimes fails on blocks containing them even when the text looks identical. When an edit repeatedly fails to match, anchor on a nearby ASCII-only line, or fall back to a `python3` append / `sed` line-range replace (both used successfully in this repo). Always re-verify with `npm run build` after such edits.

