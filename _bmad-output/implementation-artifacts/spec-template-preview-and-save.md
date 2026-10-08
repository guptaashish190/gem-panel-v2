---
title: 'Template preview and save to document'
type: 'feature'
created: '2026-10-08'
status: 'in-progress'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** On a tender, Download template fills the fields and can save a Word file somewhere the user picks. It never shows what the filled template looks like, and it does not put that file on the document row that was opened.

**Approach:** Add a Preview button that renders the fields as they are now and opens the same iframe dialog Settings uses. Add Save to document, which writes that same Word file onto the selected document so the row shows Ready. Download stays as the separate export. A later save replaces the file already stored for that document.

</frozen-after-approval>

## Implementation Notes

- Preview calls `render-template`, which fills the current field values and returns the same Word HTML Download writes. The iframe opens only when Preview is clicked.
- Save to document calls `save-template-document`. It stores that HTML as `{document file name}.doc` through `uploadStored` and `writeDocument`, then `notifyRows` reloads the tender so the row shows Ready. A later save replaces the previous file for that document name.
- Enter in the form submits Save to document. Download stays a separate button and still uses the save dialog.
- Escape closes Preview when it is open, and closes the template dialog otherwise.
- Files: `app/electron/main.ts`, `app/electron/preload.cts`, `app/src/panel.d.ts`, `app/src/TemplateDialog.tsx`.
