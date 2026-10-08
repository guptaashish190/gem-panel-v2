---
title: 'Merge and download'
type: 'feature'
created: '2026-10-08'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Prepare can merge PDFs onto the document. There is no way to take that same merged PDF without replacing the file already stored on the document.

**Approach:** Add Merge and download beside Merge and save. It merges the same ordered list, asks where to put the PDF, and leaves the document file as it is. Cancelling the save leaves the dialog open with no error.

</frozen-after-approval>

## Implementation Notes

- Merge and download uses the same ordered list as Merge and save. The save dialog opens first. Cancel does not read company files and does not write a PDF. A chosen path is written only after the merge succeeds, and the tender document is left as it is.
- The suggested name is the document name plus the bid number, with one `.pdf` ending. Characters that are unsafe in a file name are replaced.
- Both tabs stay disabled while the download dialog or the merge is in progress. A successful download closes Prepare. Cancel leaves it open with no message.
- Files: `app/electron/main.ts`, `app/electron/merge.ts`, `app/electron/merge.test.ts`, `app/electron/preload.cts`, `app/src/panel.d.ts`, `app/src/components/PdfMerge.tsx`, `app/src/TemplateDialog.tsx`.

## Review Triage Log

- A name that already ended in `.pdf` was offered as `.pdf.pdf` — medium. Patched: the suggested name strips one trailing `.pdf` and adds it back once, and includes the bid number with unsafe characters replaced.
- The merge ran before the save dialog, so cancel could still fetch a company file — medium. Patched: the dialog opens first, and company files are read only after a path is chosen.
- The Templates tab stayed usable during the download — medium. Patched: both tabs are disabled while that work is in progress.
- Several unreachable failures share "Could not merge those PDFs." — false. Prepare does not offer those cases, and a thrown download error uses the same sentence as the other download buttons.
- No test writes the chosen file or proves the tender document is untouched — low, rejected. The suggested name is tested. The download handler does not call the document upload path, and an Electron save-dialog test is more than a simple correction.
- Implementation notes were empty — low. Filled above.
