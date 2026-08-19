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
   Find or create a folder named `<config.name>` at Drive root, then
   find or create a `<YYYY-MM>` subfolder inside it (`create_file` with
   `contentMimeType: "application/vnd.google-apps.folder"` and,
   for the subfolder, `parentId` set to the parent folder's id).
   Create a text file inside that month folder named
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
