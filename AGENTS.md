<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project-specific rules

### Branch
Always work on `feat/vietnamese` only. Never commit to `main` or other branches directly.
Use a worktree (`EnterWorktree`) for isolation, then cherry-pick or merge back to `feat/vietnamese`.

### Dataset v4.0 — Tử Vi interpretation data

**674,976 lá số × 13 chủ đề** (2026-10-15).  
Every real solar date 1950–2026 × 12 hour branches × male/female; one chart per line (JSON Lines).  
Fields: `k` key, `y/m/d` solar date, `h` hour index 0–11, `g` gender, `ms` first major star of Mệnh palace, `c` 13 interpretation topics as Markdown.

**Multiple files**: 77 year files `data/dataset-v4/year-YYYY.jsonl.zst` (compressed with zstd `--long=27`).  
Decompression: `zstd -d --long=27 year-1990.jsonl.zst` (the `--long=27` flag is mandatory).

**Lazy loading** (default): Files are **never** pre-loaded at startup.  
- `lookupDataset(chart)` in `lib/ai/dataset-v4.ts` reads the matching year file as a stream, finds the row, and caches it in memory and `data/dataset-v4/cache/<key>.json`.  
- Auto-download only happens when `DATASET_V4_AUTO_DOWNLOAD=1` is set in `.env.local`; otherwise missing year files are silently skipped (returns `null`).  
- Do not change this to eager/startup loading.

**License**: CC BY 4.0 for the dataset structure; Nghê Hải Hạ quotes inside the data remain under CC BY-NC-SA 4.0.

**Known issue**: ~2,520 rows (0.49%) contain non-existent dates (Feb 30, Feb 29 in non-leap years) — engine shifted them to Mar 1–2; from 2026-10-03 the engine rejects such dates outright.
