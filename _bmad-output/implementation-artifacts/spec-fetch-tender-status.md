---
title: 'Fetch tender status'
type: 'feature'
created: '2026-10-08'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** While tenders are fetched, the screen only changes the button to Fetching. A row appears only after its PDF is stored, so the user cannot see that bids are being fetched, downloaded, or analyzed.

**Approach:** While a search runs, show Fetching tenders until the first listing page returns, then Downloading tenders until that search finishes. Each bid from the search shows Downloading while its PDF is requested, Analyzing while it is parsed, and Downloaded after the row is stored. A skipped or failed bid does not stay on the list. Stored rows already on screen show Downloaded. The renderer learns this only from the main process. Screen copy is Fetching tenders, Downloading tenders, Downloading, Analyzing, and Downloaded.

</frozen-after-approval>

## Implementation Notes

- Progress is a renderer-only stream. A stored row is still written only after the PDF is saved and parsed. A failed or skipped bid emits `dropped` and leaves no row.
- Phase is `fetching` until the first listing page returns, then `downloading` until the search finishes. Listing of later pages still overlaps downloads.
- A known bid and a bid skipped because the unsaved cap is full never emit a bid status.
- Stored rows show Downloaded. Bids still in this search and not yet stored show Downloading or Analyzing at the top of the Search list, and they are not opened.
- Files: `app/electron/types.ts`, `app/electron/gem.ts`, `app/electron/gem.test.ts`, `app/electron/main.ts`, `app/electron/preload.cts`, `app/src/panel.d.ts`, `app/src/App.tsx`, `app/src/app.css`.
- `npm test` in `app/`: 34 passed. `npm run typecheck`: exit 0.
- The Fetch button uses the same phase words as the status line. A row that has reached Downloaded can be opened even if the stored list has not refreshed yet. The phase line is a polite live region.

## Review Triage Log

- false — in-progress rows skip the list filters. Those rows have no evaluation, MSE, or EMD yet, so the filters would hide every bid that is still downloading.
- false — Saved and Tender Status show Downloaded on every stored row. The spec says stored rows already on screen show Downloaded.
- false — a failed bid appears as Downloading and then leaves the list. The spec says a failed bid does not stay.
- false — the list PDF cell is a label, and Download template has no file. Both match the existing tender panel: the file action is on the open tender, and the template control is shown with nothing behind it.
- low — per-cell live regions were not added. The phase line announces the change; announcing every status cell would talk over the list. Not worth the extra announcements.
- low — `openLocal` failures stay silent. There is no error surface on that click, and adding one is outside this change.
- patch — the Fetch button kept saying Fetching while the line said Downloading tenders. The button now uses the phase words.
- patch — the phase line had no live region. It is now `role="status"` and `aria-live="polite"`.
- patch — a Downloaded row that was not in the stored list yet could not be opened. That row can be opened.
- defer — parser label locking, document lines read from above an empty label, specification blocks replacing labeled products, startup repair, list restats, same-search retry, fetch invoke errors, file open path, filters, and the saved-row color. These are older than this change. See deferred-work.md.
