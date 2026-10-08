---
title: 'Local product search'
type: 'feature'
created: '2026-10-08'
status: 'in-progress'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** After bids are on screen, the only way to narrow them is the ministry, evaluation, MSE, and EMD filters. Finding a bid by what it sells means opening each one.

**Approach:** Add a local text field on every list. It matches product names already stored for those bids and shows the bids whose products contain the typed string. The GeM keyword fetch stays a separate field.

</frozen-after-approval>

## Implementation Notes

- Product names ride on each list row. `listTenders` selects `product(name)` and sets `productNames` plus `productCount` from that array. No schema change.
- The Product field is local state in `App.tsx`. It is separate from the GeM keyword. A bid stays when any product name contains the trimmed query, case-insensitive. An empty field leaves the list as it was.
- The field sits on every list screen. Switching screens or starting a fetch clears it. Ministry, evaluation, MSE, and EMD options still come from the unfiltered rows.
- In-progress bids have no names yet, so a typed query hides them until the stored row arrives.
- Files: `app/src/App.tsx`, `app/src/panel.d.ts`, `app/electron/types.ts`, `app/electron/store.ts`, `app/electron/gem.ts`.
- `npm test` and `npm run typecheck` in `app/` passed. The screen is Electron, so the field was not clicked in a browser.
