---
title: 'GeM Tender Panel'
type: 'feature'
created: '2026-10-08'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: NO_VCS
context:
  - /Users/ashishgupta/Documents/gem-panel2/_bmad-output/planning-artifacts/prds/prd-gem-panel2-2026-10-07/prd.md
  - /Users/ashishgupta/Documents/gem-panel2/_bmad-output/planning-artifacts/architecture/architecture-gem-panel2-2026-10-07/ARCHITECTURE-SPINE.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** There is no app. The user needs one desktop panel to fetch GeM tenders, save them, and track filled bids and their documents.

**Approach:** Build the Electron app in `app/` with Search, Saved, and Tender Status. The main process fetches GeM, parses each new PDF once, and stores the row. The screens read those rows, save or unsave, and upload record files.

## Boundaries & Constraints

**Always:**
- React talks only to the Electron main process. The main process talks to GeM, disk, and Supabase.
- Search takes a keyword and a page count. That call does not download PDFs. The next search for a keyword continues after pages already searched.
- Skip a GeM download when the bid number already has a row. Write the row only after the PDF is on disk and parsed. A failed download leaves no row.
- Overlap the next listing page with PDF downloads from the page just found. Run 4 downloads at a time. No fixed pause. The list stays usable. A row appears when its PDF is parsed.
- List, filters, and an opened tender read stored rows. Index bid number and the filter fields.
- Filters on every list: ministry or state, evaluation method, MSE, EMD.
- Opening a bid replaces the list with its fields, products, and documents. Back returns to the same list.
- Unsaved PDFs cap at 1000 on this machine. Saving keeps the PDF outside the cap and uploads it in the background. Unsaving returns it to the cap and deletes that local file if the cap is full. The row and the uploaded PDF stay.
- Uploads, including contract and CRAC, go to Supabase immediately and a local copy is written. They are outside the cap.
- A present file is Ready. A stored file missing here is Download. A document not added yet is Upload. Download of a missing file comes from Supabase, not GeM.
- Screen copy never names storage, sync, machines, folders, or the database.
- One folder per bid, slashes replaced by hyphens: `<app data>/<bid>/documents/`.
- Store the PRD tender fields plus the listing id. Do not store a local path or the PRD's excluded columns.
- Total-value products: one row per named block, that product's quantity. Item-wise: one row per schedule, item code as the name, schedule number stored. Same code may be two rows.
- Documents: the GeM PDF, each name printed on that PDF, contract, and CRAC. Each except the GeM PDF shows Download template with no file behind it yet.
- Mark filled is a control on the open tender. Tender Status lists those tenders.
- Supabase URL and service key come from environment variables read by the main process. If they are missing, say the panel cannot reach its records, in those words.

**Never:**
- Copy `gem-panel` or `PANEL-SPEC.md`. No Next.js, no sql.js, no local database, no 1.5s delay, no GeM login, no bid submission.
- Do not delete some other unsaved PDF to free a slot. If the cap is full, skip that new GeM download and leave no row.
- Do not build template prefill, accounts, or billing.
- Do not show developer words on screen.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Known bid | Fetch returns a bid number that already has a row | No GeM PDF download | N/A |
| New bid | Fetch returns a new bid and the cap has room | PDF saved, parsed once, row appears | Failed download or parse leaves no row; later fetch retries |
| Cap full | New bid and 1000 unsaved PDFs | No download, no row | List stays as it was |
| Missing file | Open a saved tender whose PDF is not on this machine | Download. That click gets the stored file | Failure leaves the button as Download |
| Unsave when full | Saved tender, cap already 1000 | Local PDF deleted; row and uploaded PDF remain | N/A |
| Filters | State, evaluation, MSE, or EMD set | List shows only matching stored rows | N/A |

</frozen-after-approval>

## Code Map

- `app/` — does not exist. All application code is created here.
- `/Users/ashishgupta/Documents/gem-panel/packages/ingest/src/gem-client.ts` — public GeM facts only, do not import. Base `https://bidplus.gem.gov.in`. GET `/all-bids` for the `csrf_gem_cookie`. POST `/all-bids-data` with `payload` JSON (`searchBid`, `searchType: fullText`, `bidStatusType: ongoing_bids`, `page` after page 1) and `csrf_bd_gem_nk`. Doc fields: `b_bid_number`, `b_id` (listing id; required to download), `final_end_date_sort`, ministry and department names. PDF: GET `/showbidDocument/{b_id}`, else `/showradocumentPdf/{b_id}`.
- `_bmad-output/planning-artifacts/prds/prd-gem-panel2-2026-10-07/prd.md` — field list and excluded columns.
- `_bmad-output/planning-artifacts/architecture/architecture-gem-panel2-2026-10-07/ARCHITECTURE-SPINE.md` — invariants. Do not reopen them.
- `PANEL-SPEC.md` — do not treat as a source.

## Tasks & Acceptance

**Execution:**
- [x] `app/package.json` — Electron, React, Vite, TypeScript, `@supabase/supabase-js`, `pdfjs-dist` at the spine versions — one app, Vite only builds the renderer.
- [x] `app/electron/main.ts` — window and the only IPC surface the screens call — keeps React off GeM, disk, and Supabase.
- [x] `app/electron/gem.ts` — listing pages and PDF bytes, 4 at a time, next page overlapped with downloads — no fixed delay.
- [x] `app/electron/parse.ts` — read a PDF once into the PRD fields and product rows — total-value and item-wise shapes differ.
- [x] `app/electron/files.ts` — bid folder, cap 1000, save, unsave, Ready versus missing — path is never sent to Supabase.
- [x] `app/electron/store.ts` — rows, page cursor, storage upload and download — listing id stored, local path not stored.
- [x] `supabase/schema.sql` — tender, product, document, keyword page cursor, indexes on bid number and the four filter fields — applied by the operator, not by the screen.
- [x] `app/src/App.tsx` — Search, Saved, Tender Status, filters, and the open tender — screen copy is Ready, Download, Upload, Download template.
- [x] `app/electron/gem.test.ts` — the I/O matrix rows for known bid, failed download, and cap full — locks the skip and no-row rules.

**Acceptance Criteria:**
- Given a keyword and a page count, when Fetch runs, then stored tenders stay on screen and new rows appear one PDF at a time.
- Given a saved tender, when this machine has no local PDF, then the file action is Download and the click does not call GeM.
- Given a tender marked filled, when Tender Status is open, then that tender and its uploaded files are listed.
- Given any screen, when it renders, then the words Supabase, machine, folder, sync, and database are absent.

## Implementation Notes

- Unsaved cap is `UNSAVED_CAP = 1000` in `app/electron/files.ts`. A new download at the cap is skipped and writes no row.
- Records connection uses `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the main process. Missing values show "the panel cannot reach its records".
- `npm test` in `app/`: 26 passed, 0 failed. `npm run typecheck`: exit 0.
- No git repository, so the post-implementation diff was reviewed from the source files and the test run.

## Spec Change Log

## Review Triage Log

- high — page cursor advanced past bids that were not stored, so a later search never retried them. Patched: `searchKeyword` advances only when no hit returned retry. Test: failed download and failed insert leave the cursor unchanged.
- medium — two workers could ingest the same bid number and the loser deleted the winner's PDF. Patched: a bid number is claimed once per search before download.
- medium — a late list or open response could replace the screen the user is looking at. Patched: list and open ignore a response that is no longer the latest.
- low — `.env` was not ignored. Patched: `app/.gitignore` ignores `.env`.
- false — Download template does nothing. The spec says the control is shown and the template file is not part of this build.
- false — a missing GeM PDF must be fetched from GeM again. A bid that already has a row is not downloaded from GeM. Download reads the stored file only.
- defer — row-level security and accounts. The build uses the service key and accounts are out of this build.
- defer — a timing assertion for the no-pause rule. The source check and the overlap test cover it; a sleep-based test would be brittle.
- low — remaining review notes (ILIKE versus btree, PDF worker cleanup, unbounded page count, parser line layout, storage policies). They do not break the fetch, save, or status paths that the tests cover. Left as-is.

## Design Notes

GeM listing needs the cookie from `/all-bids` before `/all-bids-data`. The download key is `b_id`, not the bid number. Ongoing bids only.

Parse looks for the English labels in the PRD field list. Item-wise rows come from schedule blocks. Total-value rows come from each named product block and that block's consignee quantity.

## Verification

**Commands:**
- `npm test` in `app/` -- expected: gem tests pass, including known-bid skip, failed download leaves no row, and cap-full skip.
- `npm run typecheck` in `app/` -- expected: exit 0.
