---
title: 'Settings template preview fills company values'
type: 'feature'
created: '2026-10-09'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
baseline_commit: 042ee4c7188d824b89f6f7196804c784a1fbaaae
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Settings → Templates → Preview leaves company placeholders as `{{companyName}}`, `{{gstin}}`, `{{logo}}`, and custom fields, even though those values are already saved in Company settings. Letterhead templates cannot be checked without Prepare.

**Approach:** Settings text preview loads the saved company row and fills every company token (built-ins, custom fields, and logo). Tender and product tokens stay as placeholders because there is no bid.

</frozen-after-approval>

## Implementation Notes

- Extracted `companyValues(company)` in `template.ts`; `templateValues` spreads it then adds tender keys.
- `preview-template-text` loads company via `store.loadCompany`, renders with `companyValues(company)` and `company.logo`.
- Tender/product tokens stay as placeholders because company values omit those keys.
- If there is no DB or load fails, preview falls back to rendering with empty values (previous behavior) instead of failing the dialog.
- Uses last saved company only; unsaved Company form edits are out of scope.
- Tests updated for fill of company/custom/logo and leave of bid/product tokens.
- Commit skipped: working tree mixes this change with unrelated uncommitted logo/custom-field work.

## Review Triage Log

| Finding | Verdict | Evidence / route |
|---|---|---|
| Older specs still say preview leaves company/custom/logo tokens | medium | Real doc drift; frozen blocks must not be edited here. defer |
| Spec lacks Boundaries/I/O/AC | false | Oneshot route intentionally keeps Intent + Implementation Notes only |
| Empty company values blank tokens | false | Same as Prepare/Download; `companyValues` always emits keys |
| No DB / load failure returns null (regression) | medium | Confirmed; patched to fall back to empty-values render |
| No IPC wiring test for loadCompany path | low | Same as other main handlers; defer |
| Happy-path omits some built-ins / mixed product body | low | Rejected — `companyValues` covers all keys; product leave already tested |
| Unsaved Company form edits not in preview | false | Intent is saved company; noted in Implementation Notes |
| Full loadCompany heavier than needed | low | Rejected — acceptable; not a user-facing defect |
