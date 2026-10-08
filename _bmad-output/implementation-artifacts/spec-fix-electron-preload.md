---
title: 'Fix Electron preload startup'
type: 'bugfix'
created: '2026-10-08'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Electron cannot load the renderer bridge because the sandboxed preload script is emitted as an ES module, leaving `window.panel` unavailable and the app blocked.

**Approach:** Emit the preload entry as CommonJS and point the BrowserWindow at that output while preserving context isolation and sandboxing.

</frozen-after-approval>

## Implementation Notes

- Renamed the preload source to `app/electron/preload.cts` so TypeScript emits `preload.cjs`.
- Updated `app/electron/main.ts` to load the CommonJS preload while retaining context isolation and the default sandbox.
- Included `.cts` sources in `app/tsconfig.electron.json`; verified the generated bridge exists and contains the expected exposure call.

## Review Triage Log

- `high` (patched): `.cts` was initially excluded by the TypeScript include pattern; the build now includes it and emits `dist-electron/preload.cjs`.
- `high` (patched, same root cause): a successful build could initially leave only stale `preload.js`; verification now confirmed the required `.cjs` artifact.
- `low` (rejected): an Electron startup integration test would improve coverage, but the generated preload and full build are directly verified and a new harness is disproportionate here.
- `false`: the emission claim is now supported by a successful clean output check.
- `false`: the configuration-file change predates this fix and implements the user's explicit configuration request.
- `low` (rejected): older environment-variable documentation may need later cleanup but does not affect the preload repair.
- `low` (rejected): broader malformed-config diagnostics predate this fix and are outside its runtime failure.
- `low` (rejected): unrelated lockfiles and root dependency artifacts were preserved as requested and do not affect preload loading.
