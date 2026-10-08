---
title: 'Merge PDFs while preparing a document'
type: 'feature'
created: '2026-10-08'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Prepare has a PDFs tab with nothing on it. A required document is often several PDFs — company files already kept in Settings, files picked for this tender, or both — and there is no way to put them together onto that document.

**Approach:** On the PDFs tab, the user builds one ordered list from company documents that already have a file and from PDFs they upload for this merge. Merge and save copies every page in that order into one PDF and stores it on the document being prepared, replacing any file already there.

</frozen-after-approval>

## Implementation Notes

- The PDFs tab keeps one ordered list. Company documents that already have a file can be added, including a file that is only stored and is fetched when merging. Uploaded PDFs are for this merge only. The list stays put when the user switches to Templates.
- Merge copies every page with pdf-lib and saves `{document name}.pdf` through the same stored upload and local write as other document files. That replaces the file already on the document. The GeM PDF cannot be the target.
- A file that is not a PDF, or a protected PDF, stops the merge and names that file. Nothing is saved in that case.
- The file picker copies the chosen files before clearing the input. Close, Escape, and the backdrop stay closed while a file is being read or the merge is saving.
- Files: `app/electron/merge.ts`, `app/electron/merge.test.ts`, `app/electron/main.ts`, `app/electron/preload.cts`, `app/src/components/PdfMerge.tsx`, `app/src/TemplateDialog.tsx`, `app/src/panel.d.ts`, `app/src/app.css`, `app/package.json`, `app/package-lock.json`, `app/electron/gem.test.ts`.

## Review Triage Log

- File input cleared before the files were copied — high. A live FileList is emptied by `value = ''`. Patched by copying the `File` objects first.
- A failed pick was silent, and merge could run while files were still being read — medium. Patched with a read error message and `busy` for the whole read.
- Company files that are only stored can be added — false. That state means a file exists and merge reads it, fetching it first when it is not local. A non-PDF is named when merge runs, because the list has no file type.
- The dialog could close while a merge was saving and hide a failure — medium. Patched: Close is disabled, and Escape and the backdrop do nothing, while a read or save is in progress. A successful merge still closes.
- Replacing the document drops the previous file — false. Replacement is the intended save. The local replace uses the same write already used for uploads. An older stored object is left only when the previous file had a different extension; it is not shown, and deleting it is more than a simple correction, so that leftover is rejected as low.
- A merge could report success when no document row matches — false. Prepare opens only for a document row that already exists, so the update matches that row.
- Merged PDFs drop interactive form fields — low, rejected. Page content is what merge copies. Copying form dictionaries across files is not a simple correction, and flat company PDFs do not need it.
- An empty merge could succeed, and there is no size cap — false for the dialog, which refuses an empty list before merging. A zero-page PDF and a size cap were rejected as low: they are outside the requested merge, and a cap would be new behavior.
- Tests do not cover every IPC argument or an encrypted fixture — low, rejected. Order is tested across two files, which is the same page copy used inside one file. pdf-lib cannot write the encrypted fixture, and the protected-file message is checked against the library's own error text.
- The PDFs pane had no tab label, the row buttons had no file name, and a failed company load had no message — low. Patched: tab panel labelling, button names, a loading line, and a failure message.
- Root lockfiles and `app/yarn.lock` — false. Those files were already untracked and are not part of this change.
- Implementation notes were empty — low. Filled in this section.
