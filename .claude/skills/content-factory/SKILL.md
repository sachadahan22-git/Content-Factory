---
name: content-factory
description: Generates, assembles and delivers-for-review one video for a content project (script, voice, visuals, thumbnails, Remotion render, Telegram delivery), checks Telegram for validation/modification replies, and drafts monthly topic calendars. Use when running a project's generate/poll/monthly-plan routine in the Business repo.
---

# Content Factory

## Modes

This skill is invoked with a mode (`generate`, `poll`, or `monthly-plan`) and,
for `generate`/`monthly-plan`, a project slug (the subfolder name, e.g.
`YoutubeStories`).

## Generate mode

Given a project slug:

a. Read `<ProjectFolder>/config.yaml` and the current month's
   `<ProjectFolder>/calendar/YYYY-MM.md`. Take the first line under
   `## À faire`. If there is none, send (via the Telegram send procedure
   below) "⚠️ <telegram_label> — plus de sujets dans le calendrier, lance
   le planning mensuel." and stop — do not proceed to later steps.

b. Write a script matching `niche` and `tone` from the config
   (300-600 words), plus exactly 3 distinct proposals of
   `{title, description, hashtags}` tailored to the project's
   `platforms`.

c. If `config.yaml` has `voice: true`: use ToolSearch
   (`select:mcp__kie-art__generate_tts,mcp__kie-art__generate_gemini_tts`)
   to load the TTS tool schema, synthesize narration audio from the
   script text, and poll `check_task` / `download_result` until the
   audio file is downloaded locally. On failure, retry once; on a
   second failure, send a Telegram error message identifying the topic
   and stop, leaving the calendar line under `## À faire` untouched.

d. Generate visuals: split the script into 4-8 scenes/beats. For each,
   use ToolSearch (`select:mcp__kie-art__generate_image,mcp__kie-art__generate_video`)
   and call the appropriate tool with a scene-specific prompt derived
   from that scene's text. Download each result locally. Same retry/
   failure handling as step c.

e. Generate thumbnails: call `mcp__kie-art__generate_image` 2-3 times
   with prompts derived from the strongest visual hook across the 3
   title proposals from step b. Download results locally. Same retry/
   failure handling as step c.

f. Keep all local file paths from steps c-e in memory for the assembly
   step (see "Generate mode — assembly and delivery" below).

g. For each format in `config.yaml`'s `formats` list, invoke the
   `remotion-render` skill against `<ProjectFolder>/remotion/`,
   composition `Vertical` for `9:16` / `Horizontal` for `16:9`, passing
   props `{ narrationAudioPath, visualClipPaths, title: <winning title
   proposal>, musicPath: undefined }`. Same retry/failure handling as
   step c (Telegram error + stop, leave topic at `À faire`).

h. Save the full script text (from step b) to Google Drive. Use
   ToolSearch (query: "google drive") to load the Drive MCP tools.
   For both the root folder and the month subfolder below, always
   search before creating, so repeated runs reuse the same folders
   instead of scattering duplicates:
   - Root folder: call `search_files` with
     `title = '<config.name>' and mimeType = 'application/vnd.google-apps.folder' and parentId = 'root'`.
     If a result is returned, use its id. Otherwise `create_file` with
     `title: <config.name>` and
     `contentMimeType: "application/vnd.google-apps.folder"` (no
     `parentId` — this places it at Drive root) and use the new file's
     id.
   - Month subfolder: call `search_files` with
     `title = '<YYYY-MM>' and mimeType = 'application/vnd.google-apps.folder' and parentId = '<root folder id>'`.
     If a result is returned, use its id. Otherwise `create_file` with
     `title: <YYYY-MM>`, `contentMimeType:
     "application/vnd.google-apps.folder"`, and `parentId` set to the
     root folder's id, then use the new file's id.
   Then create a text file inside that month folder named
   `<topic-date>-script.txt` via `create_file` with
   `contentMimeType: "text/plain"`, the script text as content, the
   month folder's id as `parentId`, and `disableConversionToGoogleType:
   true`. The response's `viewUrl` is the script's Drive link. Same
   retry/failure handling as step c, except: if it fails twice, don't
   block video delivery — note in the Telegram message (step i) that
   the script archive step failed, and continue.

i. Using the Telegram send procedure: send one text message containing
   `telegram_label`, the topic text, the 3 title/description/hashtags
   proposals, and the Drive script link from step h; then send each
   rendered video as a separate video message; then send each
   thumbnail as a separate photo message. Record the `message_id` of
   the first (text) message.

j. Move the topic's line from `## À faire` to
   `## Généré (en attente de validation Telegram)` in the calendar
   file, appending ` | telegram_message_id: <id>` from step i.

k. Update `state/telegram.json`: set
   `pending["<message_id>"] = {"project": "<slug>", "type": "topic", "topic_date": "<date>"}`.

## Poll mode

No project slug is given — this checks every project.

a. Read `state/telegram.json` for `offset`.

b. `curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getUpdates?offset=$offset"`.
   If the result list is empty, stop.

c. For each update, read its message text and, if present, the
   `message_id` it is a reply to (`reply_to_message.message_id`). Look
   that id up in `state.pending`. If not found, and there is exactly
   one entry in `state.pending` with `"type": "topic"`, use that one
   (single-topic-in-flight fallback). If no match can be resolved,
   skip this update (still counts toward the offset advance in step g).

d. If `pending[id].type == "topic"`: classify the message text.
   - Approval (case-insensitive match on "ok", "valide", "validé", or
     the "👍" emoji): in the project's calendar file, move that topic's
     line from `## Généré...` to `## Validé`, changing `- [ ]` to
     `- [x]` (no extra suffix needed — the videos were already
     delivered as Telegram attachments at generation time, in the
     message referenced by the existing `telegram_message_id`).
     Remove the entry from `state.pending`.
   - Anything else: treat as a modification instruction. Re-run the
     minimal subset of Generate-mode steps b-k implied by the
     instruction (e.g. "change la voix" → redo step c then g-k only;
     "change le titre 2" → redo step b's metadata only then re-send
     just the text message from step i), reusing the same
     `telegram_message_id` context. Leave the calendar entry under
     `## Généré...`.

e. If `pending[id].type == "monthly_plan"`: see "Monthly-plan mode"
   below for how the reply is applied.

f. If a topic modification re-render (step d) fails after 1 retry,
   send a Telegram error message identifying the topic and leave state
   unchanged for that entry — do not advance past it silently.

g. After processing all updates, set `state.offset` to
   `(highest update_id seen) + 1`, so already-seen messages are never
   reprocessed, even the ones skipped in step c.

## Telegram send procedure

To send a text message:
`curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" -d chat_id="$TELEGRAM_CHAT_ID" -d text="<text>"`
The response's `result.message_id` is the Telegram message id to record in state.

To send a photo:
`curl -s -F chat_id="$TELEGRAM_CHAT_ID" -F photo=@<local_path> "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendPhoto"`

To send a video:
`curl -s -F chat_id="$TELEGRAM_CHAT_ID" -F video=@<local_path> "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendVideo"`
Telegram's Bot API caps uploads at 50MB. This must always stream the
video directly from local disk via curl's `@<local_path>` — never read
a video's bytes into a tool call or into the model's own context.

On any non-`"ok":true` response: retry once; on a second failure, let
the routine exit with an error (visible in the routine's run log) —
do not attempt a Telegram error notification for a Telegram failure.
