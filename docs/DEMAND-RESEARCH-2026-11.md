# Tool additions: search and demand signals

13 November 2026. Goal: add useful jobs missing from the existing 120-tool catalog without paid services or sending files to a server.

This is directional research, not a claim of verified monthly Google search volumes. Public search results, operator popular-tool lists, a community discussion, technical documentation and third-party keyword estimates were reviewed. No first-party Keyword Planner account or Search Console query data was available. Existing PDF/image compression, QR, word counting, converters and finance tools were not duplicated just to inflate counts.

## Chosen additions

1. **Audio cutter, joiner, conversion to WAV, volume/peak normalization, reversal, smaller speech WAVs, voice recorder.** Cut.audio labels its cutter popular and lists join, gain, conversion and recording. Native Web Audio covers the chosen bounded jobs without a codec download.
2. **Video trimming, compression/resizing, mute, frame capture and WAV extraction.** These recur across media-tool directories. Actual exports are tested, including retained versus removed sound, not only UI appearance.
3. **ZIP creation.** FreeToolOnline names file/folder ZIP creation its most-used tool. Our bounded local version bundles files in store mode, not compressed ZIP or password protection.
4. **Image to Base64.** Repeated image-converter directory offering. Handles PNG/JPEG/WebP/GIF data URLs with a real preview and plain encoding disclosure; no SVG execution or remote image fetch.
5. **Screen colour test.** FreeToolOnline ranks its LCD test among popular tools. Ours is a manual solid-colour inspection panel, not a dead-pixel diagnosis or flashing repair claim.

## What was deferred

- **HEIC to JPG**: a clear signal in a vendor-commissioned Ahrefs estimate, but this does not prove India demand and the codec/licensing/bundle trade-off needs its own review. Existing browser-supported image conversion stays available; do not advertise universal HEIC support.
- **Universal MP3/M4A encoding, video-to-GIF and video merging**: default FFmpeg core size and licence would not fit the current small permissive-dependency build. WAV and native video export labels are honest, not renamed files. No new dependency was added.
- **AI background cleanup, vocal separation, transcription, PDF-to-Word layout reconstruction**: significant model/codec downloads or external services and quality risks. No placeholder buttons.
- **Screen recorder**: community interest is real, but the reviewed thread also documents mobile, stuck-export and WhatsApp-format complaints. Prioritize the bounded recorder/export foundation before adding another cross-browser capture flow.
- **Live currency conversion/link shorteners**: require a current external data service or backend, outside the all-local constraint.

## Source ledger

| Source | Type | Evidence and caveat |
| --- | --- | --- |
| https://cut.audio/ | Operator tool catalog | Cutter marked popular; join/trim/gain/conversion/recording offerings. Operator claims, not independent traffic. |
| https://rendley.com/tools | Operator tool catalog | Recurring trim, compress, mute, audio extract, frame capture, audio join and recorder jobs. Offerings alone do not quantify demand. |
| https://freetoolonline.com/ | Operator popular-tool list | ZIP creation ranked first; LCD and image/base64 converters listed. Self-reported rankings. |
| https://cleanor.app/trends/file-formats | Third-party keyword index | Reports Keyword Planner-based head-format demand; directional only, not exact task-query volume or independent first-party verification. |
| https://lifestyle.thepointnews.com/story/824744/an-estimated-half-a-million-plus-u-s-searches-a-month-look-for-a-way-to-convert-image-files-back-to-jpeg/ | Vendor press release, 20 Aug 2026 | FormatDrop's US Ahrefs model estimates support conversion friction; sponsored commercial provenance and US scope reduce weight. |
| https://www.reddit.com/r/SideProject/comments/1j8rgl2/i_made_a_free_browser_based_screen_studio/ | User/community discussion, 11 Mar 2025 | Interest in private local media tools, plus concrete mobile/export/container complaints. Anecdotal, self-selected, not representative search data. |
| https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder | Technical reference | Native recording, MIME capability detection and bitrate support. Not all MIME types work in every browser. |
| https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData | Technical reference | Complete-file browser decoding and resampling; input codec support depends on browser. |

Next evidence that would change priorities: actual site Search Console queries, local tool-use feedback and failed-format reports. These would be better than claiming a generic popular-tool list is a precise Google trend ranking.
