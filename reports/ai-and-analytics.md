# AI image generation and visitor analytics

Research checked 11 November 2026. AI generation is a proposal only; no provider account, API key, paid service, or generation feature has been activated.

## Suggested first choice: Cloudflare Workers AI + FLUX.1 Schnell

[Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) lists a free allocation of **10,000 neurons per day**, shared across the account's AI usage. Free-plan requests stop at the limit; a paid upgrade is needed to exceed it. [FLUX.1 Schnell](https://developers.cloudflare.com/workers-ai/models/flux-1-schnell/) is a hosted text-to-image model supported by the REST API and Worker binding. The number of free images depends on resolution, diffusion steps and other account usage; it is not unlimited image generation.

Suggested flow: write a prompt → choose a style → generate → preview → download or explicitly publish into a collection. Generate backgrounds/product scenes first; add the exact LODA logo and Khmer promotional text as overlays rather than expecting the model to reproduce them accurately. Test quality and model licensing for the intended commercial use before launch.

Keep API credentials on the server. Start with a hard shared daily cap and a small per-session allowance. No paid fallback should run automatically. The existing Apps Script backend can call a provider through UrlFetchApp, but an internet-facing anonymous image generation feature will need stronger anti-abuse controls than the media library.

## Other options

- **Hugging Face Inference Providers:** its [current pricing](https://huggingface.co/docs/inference-providers/pricing) lists **no included monthly credit for Free users**. Do not rely on older statements about recurring free credits. Individual demo Spaces are not a dependable anonymous production API.
- **Run an open image model on owned hardware:** avoids a per-image hosted API charge, but uses your computer/GPU, electricity and maintenance. It is not zero-cost public hosting and needs a separate service and model/license evaluation.

## Analytics delivered and optional managed alternative

An Admin analytics tab and optional aggregate backend counters are implemented. Set `ANALYTICS_ENABLED=true` in Apps Script Properties to enable recording. It is disabled by default, including in the local preview, until explicitly enabled.

- Page views: library, directory and standalone community gallery views.
- Estimated visits: anonymous random session identifiers, deduplicated in a six-hour cache window on each Bangkok calendar day.
- Admin cards/table show available data in the latest 30 Bangkok calendar days. Records older than 90 days are pruned.
- No IP address, email, browsing URL, prompt or personal contact information is stored by these counters.
- Counts start when enabled; past traffic cannot be reconstructed. Cache eviction, bots, blocked scripts and different tabs/devices affect accuracy. Visits are not unique people and this is not a fraud-resistant analytics system.

For more reliable reporting, [Cloudflare Web Analytics](https://developers.cloudflare.com/web-analytics/about/) is a free managed option that can work without changing DNS or proxying the site. It requires an account, registering the actual live hostname and installing its site-specific JavaScript beacon. It has not been connected here. Keep local preview metrics separate from production.
