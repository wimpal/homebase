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

## Limits

- File size ≤ 5 MB
- ≤ 5 000 data rows
- Delimiter: comma (Notion default)
- UTF-8 with optional BOM
- Page Markdown/HTML export is **not** supported in v1

## Idempotency

Re-running the same CSV upserts by **case-insensitive product name** per household.
Blank category/description cells do **not** clear existing values.
Duplicate names within one file: first row wins; later rows are skipped.

Notion “variants” with different names become separate Products. Same-name rows collapse to one catalog entry (product variants fold-out is a separate parked feature).

## People / contacts

The Import UI has a **People** target hook for later. It stays disabled until the People SoT exists (**T-097**). Do not invent a second upload flow — plug a mapper into the same pipe.

## Out of scope

- Live Notion API sync
- Two-way sync
- Store / tags (those live on shopping list slots, not Product)
- MCP / Mimir-driven import
