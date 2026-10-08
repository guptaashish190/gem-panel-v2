---
title: 'PDF context menu'
type: 'feature'
created: '2026-10-08'
status: 'in-progress'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Every list spends a column on PDF Ready, Download, or Upload. Opening or saving that PDF should not need the column.

**Approach:** Drop the PDF column from Search, Saved, and Tender Status. Right-clicking a list row opens a menu with Open PDF and Save PDF. Open PDF does what the opened tender's Open PDF button does. Save PDF does what that tender's Save button does, and reads Unsave when the bid is already saved. A normal click still opens the tender. The opened tender keeps its buttons.

</frozen-after-approval>

## Implementation Notes
