---
title: 'Custom company fields as template placeholders'
type: 'feature'
created: '2026-10-09'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 311d9f23dedaa6e74055b3ef449a619ab4f0f776
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Company settings have four fixed fields. Letterheads need more, such as GSTIN, Udyam number, email, and mobile, so users type them into every template by hand or retype them on every Prepare.

**Approach:** Settings → Company gets a list of extra text fields. The user names a field and fills its value. Each field becomes a `{{key}}` chip in Templates and fills like `{{companyName}}` on Prepare.

## Boundaries & Constraints

**Always:**
- A field has a label, a key, and a value. The key is made from the label once, when the field is added: words of letters and digits, camelCase, first word lowercase (`GSTIN` → `gstin`, `Udyam Regn.` → `udyamRegn`, `Mob` → `mob`). A key that would start with a digit gets the prefix `field`.
- Renaming is not offered. Remove and add again. The key never changes after add, so saved templates keep working.
- Add is refused with a notice when the label makes no key, or the key equals a built-in placeholder, `products`, `productRows`, `product`, any `TemplateTender` key, or another custom key (case-insensitive).
- Values are single-line text, trimmed on save. Company Save writes the four fixed fields and the whole custom list together.
- Custom chips show after the built-in chips and before Products. Adding or removing a field and saving updates the chips without reload.
- Prepare prefills each custom token with its saved value and labels it with the field's label. The value stays editable for that document only.
- Settings preview (no bid) leaves custom tokens as `{{key}}`, like the built-ins.
- The app still loads company details when the database column does not exist yet; the list is then empty and Save reports Could not save.

**Never:**
- Do not change or rename the four fixed fields or their columns.
- Do not add a new table or IPC channel for this. Do not write Prepare edits back to the company.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Add | Label `GSTIN`, value `06ABC` | Row appears; chip `{{gstin}}` after Save | N/A |
| Fill | Template `GST: {{gstin}}` on Prepare | Field labelled GSTIN prefilled `06ABC`; document shows it | N/A |
| Multi-word | Label `Udyam Regn.` | Key `udyamRegn` | N/A |
| Clash | Label `Bid number` or `Company name` | Not added | Notice: That field is already listed. |
| Duplicate | Second `gstin` | Not added | Same notice |
| No key | Label `---` | Not added | Notice: Use letters or digits in the field name. |
| Remove | Remove GSTIN, Save | Chip gone; old templates show `{{gstin}}` as an empty editable field on Prepare | N/A |
| Old DB | Column missing | Company loads with no custom fields | Save shows Could not save. |

</frozen-after-approval>

## Code Map

- `supabase/schema.sql` -- `company` table. Add `alter table company add column if not exists fields jsonb not null default '[]'::jsonb;` after it.
- `app/electron/store.ts` -- `loadCompany` selects named columns: switch to `select('*')` so a missing column does not fail, parse `fields` into `{ key, label, value }[]` dropping malformed items. `saveCompany` upserts `fields`.
- `app/electron/types.ts`, `app/src/panel.d.ts` -- `CompanyFields` gains `fields: CompanyField[]`; export `CompanyField = { key: string; label: string; value: string }`.
- `app/electron/main.ts` -- `companyFieldsOf` validates `fields` array (string key matching `^[A-Za-z][A-Za-z0-9]*$`, string label/value, unique keys, not reserved). `template-placeholders` returns `PLACEHOLDERS` plus custom fields from `store.loadCompany`, falling back to `PLACEHOLDERS` on error.
- `app/electron/template.ts` -- export `fieldKey(label)` and `RESERVED_KEYS`. `templateValues` merges custom values (built-ins win). `templateFields` takes an optional label map so custom labels show on Prepare; `store.previewTemplate` passes it.
- `app/src/SettingsPanel.tsx` -- Company card: list of custom rows (label, value input, Remove) plus an add form (label input, Add). Save sends `fields`. Bump a counter after a successful save and pass it to `TemplatesCard`.
- `app/src/components/TemplatesCard.tsx` -- take a `refreshKey` prop; reload placeholders when it changes.
- `app/src/app.css` -- reuse `.doc-add`, `.btn-remove`, `.settings-form` styles; add only what the row layout needs.
- `app/electron/template.test.ts` -- `company` fixtures gain `fields: []`.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/schema.sql` -- add the `fields` column -- storage.
- [x] `app/electron/types.ts`, `app/src/panel.d.ts` -- add `CompanyField`, extend `CompanyFields` -- shared shape.
- [x] `app/electron/template.ts` -- `fieldKey`, `RESERVED_KEYS`, merge custom values, label map in `templateFields` -- fill path.
- [x] `app/electron/store.ts` -- tolerant load, save `fields`, pass labels in `previewTemplate` -- persistence.
- [x] `app/electron/main.ts` -- validate `fields`, custom chips in `template-placeholders` -- IPC.
- [x] `app/src/SettingsPanel.tsx`, `app/src/components/TemplatesCard.tsx`, `app/src/app.css` -- add/remove UI and chip refresh -- UI.
- [x] `app/electron/template.test.ts` -- cover `fieldKey` cases, reserved clash, custom fill and label on Prepare, built-in wins over custom, Settings preview leaves the token.

**Acceptance Criteria:**
- Given a saved custom field GSTIN, when the user restarts the app, then Settings still lists it with its value and the `{{gstin}}` chip shows.
- Given unsaved custom-field edits, when the user leaves Settings without Save, then nothing is stored.

## Implementation Notes

- Custom-list validation lives in `template.ts` as `customFieldsOf` so `main.ts` and tests share it.
- User follow-up: GSTIN (`gstin`), Email (`email`), Phone number (`phone`), and Udyam certificate number (`udyamNumber`) are built-in company fields with their own columns, inputs, and chips. They are reserved, so a custom field can no longer use those keys.

## Review Triage Log

| Finding | Verdict | Evidence / route |
|---|---|---|
| Load keeps reserved keys; Save then always fails and chips duplicate (blind, edge, vgap) | medium | `storedCompanyFields` had no reserved check while `customFieldsOf` rejects; made real by built-in `gstin`. patch: skip reserved on load |
| Duplicate chips in `template-placeholders` (blind, edge) | medium | Same root cause as above; fixed by load filter. patch |
| Empty label accepted by `customFieldsOf` (blind, edge) | low | Trim then no check. patch |
| Enter during Save adds a field that is then dropped (edge) | low | `onAddField` ignored `busy`; `load(true)` replaces list. patch |
| Remove buttons share one accessible name (blind) | low | Plain "Remove" per row. patch: aria-label |
| Prepare label map untested (vgap) | medium | Gap pre-verified. patch: `companyFieldLabels` + test |
| Custom chips untested (vgap) | medium | Gap pre-verified. patch: `placeholdersFor` + test |
| Old-DB load untested beyond parser (vgap) | medium | Needs a fake Supabase client. defer |
| Settings add checks only text-matched (vgap, blind) | medium | Renderer cannot import electron code; needs shared module. defer |
| `fieldKey` toString sync test fragile (blind) | low | Breaks only on build-output change; fix is new shared module. reject |
| Reserved-key text test is one-way (blind) | low | Extra UI keys only over-refuse. reject |
| Newlines / no length cap in values (blind) | false | Inputs are single-line; value only renders as escaped text |
| `template-placeholders` loads full company (blind) | low | One small row plus a few file checks per load. reject |
| No message for missing column (blind) | false | Spec accepts Could not save |
| Unsaved-change hint, label wraps button, refresh `.catch` (blind) | low | Cosmetic; handler already falls back. reject |
| Working tree fails to compile (vgap) | false | Mid-edit snapshot; fixtures updated, 77/77 pass |

## Verification

**Commands:**
- `npm test` in `app/` -- expected: all tests pass
- `npm run typecheck` in `app/` -- expected: exit 0

**Manual checks:**
- Run the `schema.sql` alter in Supabase, add GSTIN in Settings, insert its chip, Prepare a tender, confirm the value is in the Word file.
