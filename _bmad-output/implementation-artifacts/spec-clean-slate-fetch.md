---
title: 'Clean slate fetch'
type: 'feature'
created: '2026-10-08'
status: 'in-progress'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Fetch continues after pages already searched, so the same keyword and page count read a later slice each time. A bid that is already stored is skipped and does not appear.

**Approach:** Fetch always starts at the first listing page and replaces the search list with that many pages. A bid that already has a row shows immediately and is not downloaded again. Under that list, Fetch next page loads the single page after the cursor and adds those bids. The cursor follows the list on screen: a successful Fetch of N pages sets it to N, and Fetch next page advances it by one page when that page stores.

</frozen-after-approval>

## Implementation Notes

- Fetch next page stays on screen and is disabled once a listing page includes the final bid (`numFound` and `start`), or the page has no bids. A later Fetch starts from the first page again and enables the button until that run also reaches the end.
