# LODA Province Agency App

Khmer/English media library and agency directory. Production uses GitHub Pages for `site/` and Google Apps Script/Drive for `drive/`. Public users do not need an app account.

## Current status

Updated source and a working **local preview** are ready. Nothing has been pushed to GitHub, deployed to Apps Script or uploaded to the live Drive by this work. The existing public deployment is unchanged.

- User page: Khmer by default, English toggle with SVG national flags, saved light/dark mode, media search/download/share, and a desktop directory with list + map.
- Admin: server-side password verification and signed two-hour sessions; rename, categorize, replace, hide/restore original media and trash uploaded media.
- Agencies: add/edit name, warehouse code, province, district, salesperson, phone, map link, optional coordinates, profile image and visibility. Save & change photo opens the image uploader.
- Uploads: image/video choice popup, local file preview, drag/drop, required name, collections/subcategories with custom collection creation, progress, retry and cancellation.
- Images: PNG/JPEG/WebP, at most 20 MiB. Videos: MP4/MOV/WebM, **strictly under 1,000,000,000 bytes AND strictly under 60 seconds**. The earlier 30-second rule has been replaced.
- Production video validation: client duration check plus independent Drive duration metadata check before publication. Pending videos stay in a private staging folder.
- Optional aggregate visits/page-view reporting in Admin; disabled until configured. AI generation remains a research proposal only: [AI and analytics notes](reports/ai-and-analytics.md).

## Run the local preview

```powershell
node scripts/configure-admin.cjs
node scripts/preview.cjs
```

The setup command reads a password through hidden stdin and stores only a keyed hash plus a random signing secret in ignored `.local/properties.json`. The user-requested password has already been configured on this computer; it is not included in source or browser code. The old `preview` demonstration password is no longer used.

- User: `http://127.0.0.1:4173/`
- Community uploads: `http://127.0.0.1:4173/gallery`
- Admin: `http://127.0.0.1:4173/gallery?view=admin`

The server binds to loopback only and rejects other hosts/origins. It runs the actual Apps Script functions through a local adapter. Media, edits, hidden items and uploads persist under `.local/`; they do not change the original source folder, Google Drive or the live site. Preview video metadata is simulated using the browser's declared duration, **not independently verified**; only the deployed Drive implementation performs independent video metadata checks. Do not use this preview server for public production hosting.

## Deploy the existing Apps Script project

1. Open the existing Apps Script project associated with `site/config.js`. Preserve its `galleryFolder` property for existing uploads. Replace/add **all `.gs` and `.html` files in `drive/`**, including `Branches.gs`, `Analytics.gs`, `Management.html`, `Preferences.html` and `Theme.html`. Copy `drive/appsscript.json` into the Apps Script manifest.
2. Set the following private Script Properties. Do not add secret values to GitHub, public configuration or browser code.

   | Property | Setting |
   | --- | --- |
   | `ADMIN_SECRET` | Random signing secret, at least 32 characters. |
   | `ADMIN_PASSWORD_HASH` | Keyed password hash matching that secret. Copy **only these two admin properties** from the private local properties file to reuse the configured password; do not copy local folder IDs, upload sessions or preview statistics. Alternatively configure privately with the server-only `setAdminPassword_` helper. |
   | `SITE_URL` | Actual HTTPS site base URL; defaults to `https://l-xi4nggg.github.io/LodaProvinceAgencyAPP/`. Used for original media URLs, return navigation and trusted preference messages. |
   | `CATALOG_URL` | Public HTTPS URL returning `const catalog=...;`; defaults to the repository's raw `main/site/data.js`. |
   | `ANALYTICS_ENABLED` | Optional `true` to start aggregate counting; omitted/false keeps it disabled. |

3. Enable Google Drive API in the Cloud project linked to Apps Script. The manifest declares Drive and external request scopes. Run `folder_` and `stagingFolder_` as the owner in the editor to initialize storage and authorize the scopes. Keep staging private.
4. Update the existing Web App deployment: execute as owner, access **Anyone**. The owner must approve Google authorization; Workspace policy must allow anonymous web apps and anyone-with-link Drive files. Update the existing deployment to a new version to retain its `/exec` URL.
5. If `/exec` changes, update `sharedGalleryURL` in `site/config.js`. Deploy Apps Script before publishing the updated `site/` to avoid incompatible client/server versions.
6. Publish the updated repository to its GitHub remote. The Pages workflow checks source/tests and publishes on a push to `main`. Copying files locally does not deploy them.

Admin link: `<Apps Script /exec URL>?view=admin`. Tokens stay in browser memory. Logout clears the local token; issued tokens expire in two hours. Rotating `ADMIN_SECRET` revokes all sessions and requires regenerating `ADMIN_PASSWORD_HASH` for the intended password.

## Media and branch behavior

- Deleting original catalog media **hides it in the app**, with restoration in Admin. It does not erase a GitHub file or invalidate existing direct URLs. Uploaded media moves to Drive Trash. Replacements create a new verified upload before removing the prior uploaded item.
- Agency edits and image changes are stored as durable server overrides and synchronize into the public directory. Added agencies receive stable generated IDs; original agencies use stable catalog row IDs. The separate referenced Google My Maps network is an overview and is not automatically edited by this app. Saved coordinates show an exact selected-location map; otherwise the original map link remains available.
- Community uploads become anyone-with-link files and consume the owner's Drive storage/Apps Script quotas. OAuth credentials and resumable Drive session URLs remain server-side.
- Public media uses root categories plus virtual collections stored in metadata; collections are not physical Drive folders. Custom collections are retained once an item is published or saved in them.
- Upload retry works in the same open tab with its selected file. Reloading loses the in-memory upload token. Upload sessions expire after six hours. Stale private completed files are cleaned on a later upload. Cancellation waits for an in-flight chunk to finish before cancelling safely.
- Drive duration metadata/thumbnail/playback may take time. Missing duration metadata never bypasses production validation. Files near 1 GB still require testing on the actual deployed account and network; they were not uploaded to live Drive here.

## Agent Logo import

Examined 483 source image files in `D:/LODA/ChatGPT/LodaProvinceAgencyAPP/Agent Logo`. There were 360 existing normalized names and one duplicate source item; **122 new images** were copied into `site/media/`, bringing the total catalog to **738 media items**. Existing files/URLs remain intact.

Ten previously missing profiles were linked by full normalized salesperson name. Warehouse codes are different from logo/salesperson codes, so numeric matches are not used. One branch remains unmatched: `ឃ្លាំងផ្សារកំពង់ត្របែក`, salesperson `KH895443`. Choose its correct image through Admin. Details: [import report](reports/agent-logo-import.json).

`node scripts/import-agent-logos.cjs` performs a dry run; `--apply` imports new names without overwriting existing media. The current import is local, not a live upload. Rebuilding the entire original catalog with `build.py` can renumber assets; review IDs/overrides and re-run the logo import before publishing such a rebuild.

## Validation

```powershell
node scripts/sync-shared.cjs --check
node scripts/check.cjs
node --test tests/*.test.cjs
```

No package installation is required. `site/preferences.js` and `site/theme.css` are shared sources; run `node scripts/sync-shared.cjs` after changing them to regenerate their Apps Script HTML includes.

24 automated tests cover permissions, password hashing, upload boundaries/reconciliation, private production video validation, collections, agency CRUD/profile updates, analytics opt-in and calendar range, preference trust, popup behavior and local persistence. Browser checks verified Admin login, both languages/themes, desktop map, mobile width without horizontal overflow, popup/file selection, local upload → rename → public visibility → deletion. The test upload was trashed afterward. Screenshots are in `reports/screenshots/`.

Live Google Drive operations, deployment authorization and near-1-GB transfer performance still need production verification. Analytics counts start when enabled and estimate sessions, not individual humans. No AI provider has been activated.
