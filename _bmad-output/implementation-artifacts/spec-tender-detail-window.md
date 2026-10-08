---
title: 'Tender detail window'
type: 'feature'
created: '2026-10-08'
status: 'in-progress'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Opening a tender stays on the list until that tender's records are read. The next screen should appear at once, and each opened tender should have its own window.

**Approach:** A list click opens a new window immediately and leaves the list where it is. That window shows the bid number first. The tender, product, and document reads, and the local file checks, run only after that window is on screen. Opening the same bid again opens another window. Back closes that window.

</frozen-after-approval>

## Implementation Notes
