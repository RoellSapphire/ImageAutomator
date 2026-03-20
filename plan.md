# Implementation Plan: PixProof Proof Gallery + Novo Portfolio Publishing

## Overview
Add two new publish targets alongside the existing WordPress Post:
1. **Proof Gallery** (PixProof plugin) — primary use case
2. **Portfolio Gallery** (Novo theme) — secondary

## PHP Snippet (user must add to WordPress)

A small mu-plugin that exposes both CPTs to REST API and registers their meta fields. This is a prerequisite — we'll generate the file for the user.

```php
// wp-content/mu-plugins/imageautomator-rest.php
```

Registers:
- `proof_gallery` CPT with `show_in_rest` + rest_base `proof-galleries`
- `pt-portfolio` CPT with `show_in_rest` + rest_base `portfolio`
- All `_pixproof_*` meta keys for REST
- All Novo portfolio meta keys for REST

---

## Step 1: Extend Schema (`shared/schema.ts`)

Add to `wordpressConfigSchema`:
```
publishTarget: "post" | "proof_gallery" | "portfolio"  (default: "post")

// PixProof Proof Gallery fields
proofClientName: string (optional)
proofEventDate: string (optional)
proofDisplayName: "unique_ids" | "consecutive_ids" | "file_name" | ... (default: "unique_ids")
proofDisableArchive: boolean (default: false)

// Novo Portfolio fields
portfolioType: "gallery" (default)
portfolioCols: number (optional, default 3)
```

---

## Step 2: Update Backend Publish Route (`server/routes.ts`)

Modify `POST /api/publish`:

### Media Upload (shared across all targets)
- Same as current: upload all images to `/wp-json/wp/v2/media`
- **New for proof_gallery**: After creating the proof gallery post, update each uploaded media's `post_parent` to the gallery post ID

### Post Creation (branched by publishTarget)

**proof_gallery:**
- POST to `/wp-json/wp/v2/proof-galleries` (PixProof REST base)
- Body: title, content, status, featured_media
- After post creation, update meta via separate POST:
  - `_pixproof_main_gallery`: comma-separated media IDs
  - `_pixproof_client_name`: from config
  - `_pixproof_event_date`: from config
  - `_pixproof_photo_display_name`: from config
  - `_pixproof_disable_archive_download`: from config
- Update each media item's `post_parent` to gallery post ID

**portfolio:**
- POST to `/wp-json/wp/v2/portfolio` (Novo REST base)
- Body: title, content, status, featured_media
- After post creation, update meta:
  - `portfolio_type`: "gallery"
  - `items_list` or `item_slider`: array of media IDs
  - `gallery_cols`: from config

**post (existing):**
- No changes to current behavior

### ARMember Restrictions
- Same logic for all three targets, but adjust the endpoint URL:
  - Posts: `/wp-json/wp/v2/posts/{id}`
  - Proof galleries: `/wp-json/wp/v2/proof-galleries/{id}`
  - Portfolio: `/wp-json/wp/v2/portfolio/{id}`

---

## Step 3: Update Verify Route (`server/routes.ts`)

Modify `POST /api/wordpress/verify`:
- After verifying credentials, also check which CPTs are available by hitting `/wp-json/wp/v2/types`
- Return `availableTargets` array: always includes "post", conditionally includes "proof_gallery" and "portfolio" if those types are REST-enabled
- This lets the UI show only the targets the site actually supports

---

## Step 4: Update Frontend (`client/src/components/workflow/publish-step.tsx`)

### Publish Target Selector (new, shown after verification)
- Three-option selector (similar to post status buttons):
  - WordPress Post (FileText icon) — current behavior
  - Proof Gallery (Camera icon) — PixProof
  - Portfolio Gallery (Layout icon) — Novo theme
- Only show targets returned by verify as `availableTargets`
- Default to "proof_gallery" if available

### Conditional Fields
When **Proof Gallery** selected, show extra card:
- Client Name (text input)
- Event Date (date input)
- Photos Display Name (dropdown: Unique ID, Consecutive, Filename, etc.)
- Disable Archive Download (switch/checkbox)

When **Portfolio** selected, show extra card:
- Gallery Columns (number input, 1-6)

### Post Details Card
- Rename "Post Title" → dynamic label based on target ("Gallery Title" / "Portfolio Title" / "Post Title")
- Same for content

### Publish Summary
- Show selected publish target
- Show proof-specific fields if applicable

---

## Step 5: Update Auto-Mode & Presets

- Add `publishTarget` to auto-mode settings so it persists
- Add proof gallery fields to workflow presets schema
- Ensure folder mappings can specify publishTarget per folder

---

## File Changes Summary

| File | Changes |
|------|---------|
| `shared/schema.ts` | Add publishTarget + proof/portfolio fields to wordpressConfigSchema |
| `server/routes.ts` | Branch publish logic by target, update verify to detect CPTs |
| `client/src/components/workflow/publish-step.tsx` | Target selector, conditional proof/portfolio fields |
| `client/src/lib/types.ts` | Re-export updated types (auto from schema) |
| NEW: `wordpress-plugin/imageautomator-rest.php` | PHP snippet for user to install |

---

## Testing Approach
- Without a live WP site, we ensure:
  - Schema validation works for all three targets
  - Backend correctly branches API calls by target
  - Frontend renders correct fields per target
  - Type safety throughout
