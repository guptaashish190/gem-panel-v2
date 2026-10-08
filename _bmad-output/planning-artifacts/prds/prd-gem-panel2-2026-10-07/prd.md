---
title: GeM Tender Panel
status: draft
created: 2026-10-07
updated: 2026-10-08
---

# GeM Tender Panel

A desktop app for finding GeM tenders, keeping the ones to bid, and preparing their documents. It uses the public bid list. It does not log into GeM and it does not submit the bid.

## Screens

Search, Saved, and Tender Status.

Search takes a keyword and a page limit and lists stored tenders. Saved lists tenders the user saved. Tender Status lists tenders the user has marked filled, and the files uploaded for them.

Filters sit above the list on every screen: ministry or state, evaluation method, MSE, and EMD.

Opening a bid replaces the list with that tender's fields, products, and documents. Back returns to the same list.

A file on this machine is Ready. A file for this bid that is not on this machine is Download. A document the user has not added is Upload. The screen never names storage, sync, machines, folders, or the database.

Each document except the GeM PDF has Download template. Filling that template is not part of this build.

## Fetch

The user enters a keyword and how many pages to search. That step does not download PDFs. The next fetch for that keyword continues after the pages already searched.

A bid number already stored is not downloaded from GeM again, even if its PDF was later removed. A new bid is stored only after its PDF is on disk and its fields are parsed. A failed download leaves no row and is tried again on a later search.

The list, the filters, and an opened tender read stored rows. The screen stays usable while new PDFs download. A new row appears when that PDF has been parsed. The next listing page and the PDF downloads from the page just found run at the same time.

## Saved and downloaded

Stored rows are not capped. Unsaved PDFs on a machine are capped at 1000.

Saving writes the PDF on this machine, outside that cap, and uploads it in the background. Unsaving returns the local PDF to the cap. If the cap is full, that local file is deleted. The tender row and the uploaded PDF remain.

The user can download a missing file. That download does not contact GeM.

Documents the user uploads, including the contract and the CRAC, are stored immediately and a copy is kept on this machine. They do not count toward the unsaved cap.

## Stored fields

Per keyword: how many pages have already been searched.

Per tender:

- Bid number
- Listing id, required to download the PDF. The bid number is not the download key
- Bid end
- Offer validity
- Ministry or state
- Department
- Buyer email
- HOD email
- Evaluation method
- Type of bid
- Bid to RA
- RA qualification rule
- Payment timeline in days
- Whether documents uploaded by bidders are shown to other bidders
- Required document names from the PDF
- MSE and MII preference, including L1-plus percent and quantity percent when printed
- EMD required, and the amount when required
- ePBG required, percentage, and duration in months
- Beneficiary name

Per product: name, quantity, delivery period. Item-wise rows also store the schedule number.

Total value: one row per named product. Quantity is that product's quantity, not the bid header total.

Item wise: one row per schedule. The name is the item code. The same code can be two rows.

Do not store organisation, office, opening date, header total quantity, the raw item-category string, BOQ title, estimated value, inspection, turnover, experience, past performance, consignee, address, advisory bank, shelf life, specification text, GeM legal paragraphs, or a local file path.

## Documents

Every tender has the GeM PDF, each document name printed on that PDF, the contract, and the CRAC.

## Not in this build

- Which unsaved PDF is deleted when a new download needs a free slot. A new download past 1000 is skipped and leaves no row. Unsave already deletes the file just unsaved when the cap is full.
- Template files, and prefilling them with the bid number, the products, and the other stored fields.
- Accounts and billing.
