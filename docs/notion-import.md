# Notion → Homebase import

Bring a **Notion database** into Homebase without a Notion API token.

## Operator path (grocery / Products)

1. In Notion, open the grocery (or other product) **database**.
2. Export → **CSV** (database export, not a page Markdown zip).
3. In Homebase, go to **Settings → Import** (ADMIN only).
4. Target: **Shopping catalog (Products)**.
5. Upload the CSV. Map columns if auto-detect misses your headers:
   - **Name** (required) — aliases: Name, Title, Naam, …
   - **Category** (optional)
   - **Notes / description** (optional)
6. Click **Dry run** and check created / updated / skipped / failed counts.
7. Click **Apply import**. Spot-check `/shopping`.
8. Leave **Also mark … needed** unchecked unless you intentionally want the need list filled.

## Operator path (People / contacts)

1. In Notion, open the **People** database.
2. Export → **CSV**.
3. Settings → Import → target **People / contacts**.
4. Map columns if needed (auto-detect covers the household schema):

   | Notion header | Homebase field |
   |---|---|
   | Name | given name (required) |
   | Achternaam | family name |
   | Geboortedatum | birthday |
   | Telefoon | phone |
   | e-mail | email |
   | Adres | address |
   | Plaats | city |

5. Dry-run, then Apply. Spot-check `/people` (enable the People module first).

### People identity / idempotency

- Match by **case-insensitive email** when present; ambiguous email → row fails.
- Else match by **case-insensitive name + family name** (both required); ambiguous → fail.
- Given name only (no email) → **always create** (never auto-merge).
- Birthday cells: `YYYY-MM-DD`, `DD-MM-YYYY`, or those with a trailing time portion.
- Re-import updates matched rows (blank optional cells clear stored values).

## Limits

- File size ≤ 5 MB
- ≤ 5 000 data rows
- Delimiter: comma (Notion default)
- UTF-8 with optional BOM
- Page Markdown/HTML export is **not** supported in v1

## Products idempotency

Re-running the same CSV upserts by **case-insensitive product name** per household.
Blank category/description cells do **not** clear existing values.
Duplicate names within one file: first row wins; later rows are skipped.

Notion “variants” with different names become separate Products. Same-name rows collapse to one catalog entry (product variants fold-out is a separate parked feature).

## Out of scope

- Live Notion API sync
- Two-way sync
- Store / tags (those live on shopping list slots, not Product)
- MCP / Mimir-driven import
- Face greet photo enroll via import
