# GeM Tender Panel — build context

Use this with `ARCHITECTURE-SPINE.md` in this folder and the PRD. This file is the implementation fact list. It does not record how the decisions were reached.

## Shape

Electron on each machine. React draws Search, Saved, and Tender Status. Vite only builds the React app. React talks only to the Electron main process. That process talks to GeM, the local disk, and Supabase.

Supabase holds the rows, the keyword page counts, saved PDFs, and uploaded documents. There is no separate server and no local database. There is no GeM login.

| Name | Version |
| --- | --- |
| Electron | 44.7.0 |
| React | 19.3.0 |
| Vite | 8.3.3 |
| TypeScript | 7.0.2 |
| @supabase/supabase-js | 2.117.3 |
| pdfjs-dist | 6.4.299 |

## Files

One local folder per bid number, slashes replaced by hyphens, under the app data directory. Every file for that bid is inside its `documents` folder.

```text
<app data>/GEM-2026-B-8059746/documents/
```

Saved PDFs and uploaded records are also in Supabase Storage. Do not store a local path in Supabase.

## Speed

List, filter, and open are indexed reads on bid number and on the filter fields. Parse the PDF once, when the row is first written. The next listing page overlaps PDF downloads from the page just found. Run several downloads at a time. Do not insert a pause between requests.

## Code

The smallest path that does the job. No repeated structure, no comments that restate the code, no extra layers.

## Do not build yet

Template prefill, accounts, and a rule for which unsaved PDF to drop when a new download needs a free slot. The unsaved cap is 1000. A new download past that cap is skipped and leaves no row. Unsave already deletes the file just unsaved when the cap is full.
