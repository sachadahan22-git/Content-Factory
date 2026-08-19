# Content Factory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable Claude Code skill + scheduled routines that automatically write, voice, illustrate, and edit short-form/long-form videos for Sacha's content projects (starting with "YouTube Stories"), and deliver them on Telegram for validation — no auto-posting.

**Architecture:** One Git repo (named `Business`, all paths below are relative to its root) holds a shared `content-factory` skill (three modes: generate / poll / monthly-plan) plus one config+calendar subfolder per project. Scheduled Claude Code routines invoke the skill per project on its own cadence. Generated media is delivered directly as Telegram attachments (streamed from local disk, never routed through the model's context); only text/config/state is committed to Git.

**Tech Stack:** Claude Code skills (Markdown + tool calls), kie.ai MCP tools (`mcp__kie-art__*`) for TTS/images/video, Remotion (TS/React) for video assembly, Telegram Bot HTTP API via `curl` (including direct video/photo delivery), Claude Code `schedule` skill for cron routines.

**Spec:** `docs/superpowers/specs/2026-08-19-content-factory-design.md`

## Global Constraints

- No secrets (Telegram bot token, etc.) are ever committed to Git — routine secrets only, plus a local gitignored `.env` for manual testing.
- No generated media binaries (mp4, jpg, png, mp3) are committed to Git — they are delivered directly as Telegram attachments and never persisted anywhere else.
- Every kie.ai / Remotion render call gets exactly 1 automatic retry on failure; a second failure sends a Telegram error message and leaves the topic at status `À faire` (never fails silently).
- Calendar and state files use the exact schemas defined in Task 3 — every task that reads/writes them must conform to those schemas verbatim.
- No file's bytes are ever routed through the model's own context (e.g. read into a tool call as base64/text) to get from local disk into a delivery destination — always stream from disk via `curl -F` (as Telegram delivery does) or an equivalent direct mechanism. This constraint exists because Task 6 discovered the Google Drive MCP tool's inline-base64-only upload does not scale to real render sizes and risks silent corruption; it was dropped from this plan for that reason (see Task 6).

---

## Task 1: Repo skeleton

**Files:**
- Create: `.gitignore`
- Create: `README.md`
- Create: `state/telegram.json`

**Interfaces:**
- Produces: `state/telegram.json` with schema `{"offset": number, "pending": {"<telegram_message_id>": {"project": string, "type": "topic"|"monthly_plan", "topic_date"?: string, "topics"?: string[]}}}` — consumed by Tasks 6, 7, 8.

- [ ] **Step 1: Create `.gitignore`**

```gitignore
node_modules/
.env
*.mp4
*.mov
*.mp3
*.wav
/tmp-render/
.DS_Store
```

- [ ] **Step 2: Create `README.md`**

```markdown
# Business

Automated content generation pipeline for Sacha's video projects.

- Design: `docs/superpowers/specs/2026-08-19-content-factory-design.md`
- Plan: `docs/superpowers/plans/2026-08-19-content-factory.md`
- Shared engine: `.claude/skills/content-factory/`
- Projects: one subfolder each (e.g. `YoutubeStories/`), containing `config.yaml` and `calendar/`.

Generated media (video, images, audio) is delivered directly via Telegram, never committed here.
```

- [ ] **Step 3: Create seed state file**

```json
{
  "offset": 0,
  "pending": {}
}
```

Save as `state/telegram.json`.

- [ ] **Step 4: Verify**

Run: `git status --short`
Expected: three new untracked files listed (`.gitignore`, `README.md`, `state/telegram.json`), spec file from prior commit not listed as changed.

- [ ] **Step 5: Commit**

```bash
git add .gitignore README.md state/telegram.json
git commit -m "Add repo skeleton and telegram state seed file"
```

---

## Task 2: Telegram bot setup

**Files:**
- Create: `.env` (gitignored, local only)
- Create: `.env.example`

**Interfaces:**
- Produces: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` — consumed by every later task that sends/reads Telegram messages.

- [ ] **Step 1: Create the bot via @BotFather (manual, done by Sacha)**

In Telegram, message **@BotFather**:
1. Send `/newbot`
2. Choose a display name (e.g. `Content Factory`)
3. Choose a username ending in `bot` (e.g. `sacha_content_factory_bot`)
4. Copy the token BotFather returns (format `123456789:AAExampleTokenValue`)

- [ ] **Step 2: Establish the chat**

Ask Sacha to open the new bot in Telegram and send it any message (e.g. "salut").

- [ ] **Step 3: Retrieve the chat_id**

Run (replace `<TOKEN>` with the real token):
```bash
curl -s "https://api.telegram.org/bot<TOKEN>/getUpdates" | python3 -m json.tool
```
Expected: JSON containing `"message":{"chat":{"id": <NUMBER>, ...}}`. That `<NUMBER>` is the chat_id.

- [ ] **Step 4: Store credentials locally**

Create `.env`:
```
TELEGRAM_BOT_TOKEN=<TOKEN>
TELEGRAM_CHAT_ID=<NUMBER>
```

Create `.env.example`:
```
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

- [ ] **Step 5: Verify end-to-end send**

```bash
source .env
curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
  -d chat_id="$TELEGRAM_CHAT_ID" \
  -d text="✅ Content Factory bot connecté."
```
Expected: `"ok":true` in the response, and Sacha confirms the message arrived in Telegram.

- [ ] **Step 6: Commit**

```bash
git add .env.example
git commit -m "Add Telegram bot env template"
```
(`.env` itself stays untracked — verify with `git status --short` that it does not appear.)

---

## Task 3: Project config, calendar and schema definitions for YoutubeStories

**Files:**
- Create: `YoutubeStories/config.yaml`
- Create: `YoutubeStories/calendar/2026-08.md`

**Interfaces:**
- Produces: `config.yaml` schema (`name`, `slug`, `niche`, `platforms`, `formats`, `voice`, `cadence`, `tone`, `telegram_label`) and calendar Markdown schema — both consumed by Tasks 5-8.

- [ ] **Step 1: Create `config.yaml`**

```yaml
name: "YouTube Stories"
slug: youtube-stories
niche: "Histoires business et histoires incroyables (entrepreneurs, retournements de situation, anecdotes vraies bluffantes)"
platforms: [youtube]
formats: [9:16, 16:9]
voice: true
cadence: "2x/semaine (lundi et jeudi)"
tone: "narratif, immersif, rythmé, avec un twist ou une révélation"
telegram_label: "📺 YT Stories"
```

- [ ] **Step 2: Create the calendar file with the exact section format**

```markdown
# Calendrier — YouTube Stories — 2026-08

## À faire
- [ ] 2026-08-19 | Le livreur de pizza qui a refusé de vendre son idée à 2h du matin — et qui a fini par racheter la chaîne qui l'a viré
- [ ] 2026-08-19 | La femme de ménage qui a repéré une erreur comptable à 40M$ que personne n'avait vue

## Généré (en attente de validation Telegram)

## Validé
```

Rules for this format (documented here for consistency across all later tasks):
- Three fixed sections, in this order: `## À faire`, `## Généré (en attente de validation Telegram)`, `## Validé`.
- Each topic is one line: `- [ ] YYYY-MM-DD | <sujet>` while pending, `- [x] YYYY-MM-DD | <sujet>` once validated.
- Once a topic is picked up for generation, its line moves from `À faire` to `Généré...` and gets a ` | telegram_message_id: <id>` suffix appended.
- Once validated, the line moves to `Validé`, keeping the `telegram_message_id` suffix — no extra suffix is added (the rendered video files were already delivered as Telegram attachments at generation time, in the message referenced by that id).

- [ ] **Step 3: Verify**

Run: `cat "YoutubeStories/calendar/2026-08.md"`
Expected: exactly the three sections above, two seed topics under `À faire`, both other sections empty.

- [ ] **Step 4: Commit**

```bash
git add YoutubeStories/config.yaml YoutubeStories/calendar/2026-08.md
git commit -m "Add YoutubeStories project config and seed calendar"
```

---

## Task 4: Remotion template for YoutubeStories

**Files:**
- Create: `YoutubeStories/remotion/` (scaffolded project)
- Create: `YoutubeStories/remotion/src/Vertical.tsx`
- Create: `YoutubeStories/remotion/src/Horizontal.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks (uses placeholder assets for its own verification).
- Produces: two Remotion compositions, `Vertical` (1080x1920) and `Horizontal` (1920x1080), both accepting props `{ narrationAudioPath: string, visualClipPaths: string[], title: string, musicPath?: string }` — consumed by Task 6's render step.

- [ ] **Step 1: Scaffold the project**

Invoke the `remotion-create` skill to scaffold a new Remotion project at `YoutubeStories/remotion/`, TypeScript template.

- [ ] **Step 2: Read caption and multimedia conventions**

Invoke the `remotion-captions` skill and the `remotion-multimedia` skill to learn the current best-practice APIs for burning in captions and embedding audio/video/image sequences before writing composition code.

- [ ] **Step 3: Implement the `Vertical` composition**

`YoutubeStories/remotion/src/Vertical.tsx` — 1080x1920 composition that:
- Accepts props `{ narrationAudioPath, visualClipPaths, title, musicPath }`.
- Plays `narrationAudioPath` as the timeline's driving audio track (composition duration = audio duration).
- Cross-fades through `visualClipPaths` evenly spaced across that duration.
- Renders `title` as an animated on-screen text overlay for the first 3 seconds.
- If `musicPath` is provided, plays it underneath the narration at low volume.
- Uses the caption approach documented by `remotion-captions` to burn in captions derived from the narration audio.

- [ ] **Step 4: Implement the `Horizontal` composition**

`YoutubeStories/remotion/src/Horizontal.tsx` — same prop shape and behavior as `Vertical`, at 1920x1080, with layout adapted to landscape (visuals filling width, captions lower-third instead of centered).

- [ ] **Step 5: Register both compositions**

Update the project's root/index file so `Vertical` and `Horizontal` are both registered and selectable by `id`.

- [ ] **Step 6: Verify with a studio preview**

Invoke the `remotion-studio` skill against `YoutubeStories/remotion/` with placeholder props (a short silent local mp3 and one local placeholder jpg repeated 3x as `visualClipPaths`, `title: "Test"`).
Expected: both compositions preview without runtime errors.

- [ ] **Step 7: Verify with a real render**

Invoke the `remotion-render` skill to render both `Vertical` and `Horizontal` with the same placeholder props to `/tmp-render/`.
Expected: two mp4 files produced, non-zero size, correct resolutions (`ffprobe -v error -show_entries stream=width,height <file>` reports 1080x1920 and 1920x1080 respectively).

- [ ] **Step 8: Commit**

```bash
git add YoutubeStories/remotion/
git commit -m "Add Remotion Vertical and Horizontal compositions for YoutubeStories"
```
(`node_modules/` and `/tmp-render/` stay untracked per `.gitignore`.)

---

## Task 5: `content-factory` skill — Generate mode, content creation steps

**Files:**
- Create: `.claude/skills/content-factory/SKILL.md`

**Interfaces:**
- Consumes: `config.yaml` schema and calendar Markdown schema from Task 3.
- Produces: "Generate mode — content creation" procedure, steps (a)-(f) below — consumed by Task 6, which appends the assembly/delivery steps to the same file/section.

- [ ] **Step 1: Write the skill frontmatter and mode dispatch**

Follow `superpowers:writing-skills` conventions. `SKILL.md` frontmatter:

```yaml
---
name: content-factory
description: Generates, assembles and delivers-for-review one video for a content project (script, voice, visuals, thumbnails, Remotion render, Telegram delivery), checks Telegram for validation/modification replies, and drafts monthly topic calendars. Use when running a project's generate/poll/monthly-plan routine in the Business repo.
---
```

Body opens with a "Modes" section: this skill is invoked with a mode (`generate`, `poll`, or `monthly-plan`) and, for `generate`/`monthly-plan`, a project slug (the subfolder name, e.g. `YoutubeStories`).

- [ ] **Step 2: Write the "Generate mode — content creation" section**

Add to `SKILL.md`, under a `## Generate mode` heading:

```markdown
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
```

- [ ] **Step 3: Verify — dry run against the first seed topic**

Manually execute steps a-e of the Generate-mode procedure above (as a session, not yet via a routine) against `YoutubeStories`, using its first `## À faire` topic from Task 3.
Expected: a script and 3 metadata proposals exist in the transcript; one local narration audio file exists; 4-8 local visual asset files exist; 2-3 local thumbnail image files exist.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/content-factory/SKILL.md
git commit -m "Add content-factory skill: generate mode content creation"
```

---

## Task 6: `content-factory` skill — Generate mode, assembly and delivery

**Files:**
- Modify: `.claude/skills/content-factory/SKILL.md`

**Interfaces:**
- Consumes: local asset paths from Task 5 step f; `Vertical`/`Horizontal` Remotion compositions and their prop shape from Task 4; `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` from Task 2; calendar/state schemas from Tasks 1 and 3.
- Produces: completed `## Generate mode` procedure; a documented Telegram-send procedure reused by Tasks 7 and 8.

- [ ] **Step 1: Write the Telegram-send procedure (shared reference)**

Add a `## Telegram send procedure` section to `SKILL.md`:

```markdown
To send a text message:
`curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" -d chat_id="$TELEGRAM_CHAT_ID" -d text="<text>"`
The response's `result.message_id` is the Telegram message id to record in state.

To send a photo:
`curl -s -F chat_id="$TELEGRAM_CHAT_ID" -F photo=@<local_path> "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendPhoto"`

To send a video (streamed directly from local disk — never read the
file's bytes into a tool call or the model's own context first):
`curl -s -F chat_id="$TELEGRAM_CHAT_ID" -F video=@<local_path> "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendVideo"`
Telegram's Bot API caps uploads at 50MB per file; Remotion renders for
this kind of short-form content comfortably fit (~15MB observed).

On any non-`"ok":true` response: retry once; on a second failure, let
the routine exit with an error (visible in the routine's run log) —
do not attempt a Telegram error notification for a Telegram failure.
```

- [ ] **Step 2: Write the "Generate mode — assembly and delivery" section**

Append to `## Generate mode` in `SKILL.md`:

```markdown
g. For each format in `config.yaml`'s `formats` list, invoke the
   `remotion-render` skill against `<ProjectFolder>/remotion/`,
   composition `Vertical` for `9:16` / `Horizontal` for `16:9`, passing
   props `{ narrationAudioPath, visualClipPaths, title: <winning title
   proposal>, musicPath: undefined }`. Same retry/failure handling as
   step c (Telegram error + stop, leave topic at `À faire`).

h. Using the Telegram send procedure: send one text message containing
   `telegram_label`, the topic text, and the 3 title/description/
   hashtags proposals; then send each rendered video as a separate
   video message; then send each thumbnail as a separate photo
   message. Record the `message_id` of the first (text) message.
   (No upload step: every file is streamed straight from local disk to
   Telegram — see Global Constraints on never routing file bytes
   through the model's own context.)

i. Move the topic's line from `## À faire` to
   `## Généré (en attente de validation Telegram)` in the calendar
   file, appending ` | telegram_message_id: <id>` from step h.

j. Update `state/telegram.json`: set
   `pending["<message_id>"] = {"project": "<slug>", "type": "topic", "topic_date": "<date>"}`.
```

- [ ] **Step 3: Verify — full generate cycle**

Run the complete Generate-mode procedure (steps a-j) for `YoutubeStories` using the real bot from Task 2.
Expected: a Telegram text message arrives containing the label, topic, and 3 metadata proposals; the 2 rendered videos (9:16 and 16:9) arrive as separate video messages; thumbnail photos arrive as separate photo messages; `YoutubeStories/calendar/2026-08.md` shows the topic under `## Généré...` with a `telegram_message_id`; `state/telegram.json` has a matching `pending` entry.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/content-factory/SKILL.md YoutubeStories/calendar/2026-08.md state/telegram.json
git commit -m "Add content-factory skill: generate mode assembly and delivery"
```

---

## Task 7: `content-factory` skill — Poll mode

**Files:**
- Modify: `.claude/skills/content-factory/SKILL.md`

**Interfaces:**
- Consumes: `state/telegram.json` schema (Task 1), calendar schema (Task 3), Telegram-send procedure (Task 6).
- Produces: "Poll mode" procedure — invoked standalone by its own routine (Task 9) and referenced by Task 8's monthly-plan validation flow.

- [ ] **Step 1: Write the "Poll mode" section**

Add to `SKILL.md`:

```markdown
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
     minimal subset of Generate-mode steps b-j implied by the
     instruction (e.g. "change la voix" → redo step c then g-j only;
     "change le titre 2" → redo step b's metadata only then re-send
     just the text message from step h), reusing the same
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
```

- [ ] **Step 2: Verify — approval path**

Reply "ok" (in Telegram, to the message from Task 6's verification) and run Poll mode once.
Expected: the topic's calendar line moves to `## Validé` with `- [x]`; its entry is removed from `state.pending`; `state.offset` increased.

- [ ] **Step 3: Verify — offset advances even without a match**

Send an unrelated message to the bot with no reply context and no topic currently pending, then run Poll mode again.
Expected: no crash, no calendar change, `state.offset` still advances past that message's `update_id`.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/content-factory/SKILL.md
git commit -m "Add content-factory skill: poll mode"
```

---

## Task 8: `content-factory` skill — Monthly-plan mode

**Files:**
- Modify: `.claude/skills/content-factory/SKILL.md`

**Interfaces:**
- Consumes: `config.yaml` schema (Task 3), Telegram-send procedure (Task 6), `state/telegram.json` schema (Task 1).
- Produces: "Monthly-plan mode" procedure; extends Poll mode's step e.

- [ ] **Step 1: Write the "Monthly-plan mode" section**

Add to `SKILL.md`:

```markdown
## Monthly-plan mode

Given a project slug:

a. Read `<ProjectFolder>/config.yaml`, and every `## À faire` /
   `## Généré...` / `## Validé` line from the last 2 months of calendar
   files (to avoid duplicate topics).

b. Propose 8 new topic ideas fitting `niche` and `tone`, none
   duplicating or closely resembling an existing entry.

c. Using the Telegram send procedure, send a numbered list of the 8
   proposed topics with `telegram_label`, asking for validation or
   edits. Record the returned `message_id`.

d. Update `state/telegram.json`:
   `pending["<message_id>"] = {"project": "<slug>", "type": "monthly_plan", "topics": [<the 8 strings>]}`.
```

- [ ] **Step 2: Fill in Poll mode's monthly-plan branch**

Replace the placeholder reference in Poll mode step e (Task 7) with:

```markdown
e. If `pending[id].type == "monthly_plan"`:
   - Approval ("ok"/"valide"/"validé"/"👍"): append every topic in
     `pending[id].topics` to the current month's calendar file under
     `## À faire`, each as `- [ ] <today's date> | <topic>`. Remove
     the entry from `state.pending`.
   - Anything else: treat as edits (e.g. "enlève le 3 et le 6, ajoute
     une histoire sur ..."). Recompute the topic list accordingly,
     re-send the updated numbered list via the Telegram send
     procedure reusing the same `pending` entry (update its `topics`
     array), do not append anything to the calendar yet.
```

- [ ] **Step 3: Verify**

Run Monthly-plan mode for `YoutubeStories`.
Expected: a numbered list of 8 topics arrives on Telegram, none duplicating the two seed topics from Task 3; `state/telegram.json` has a `pending` entry with `type: monthly_plan` and 8 `topics`.

Reply "ok" and run Poll mode.
Expected: all 8 topics appended under `## À faire` in `YoutubeStories/calendar/2026-08.md`; the `pending` entry removed.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/content-factory/SKILL.md YoutubeStories/calendar/2026-08.md state/telegram.json
git commit -m "Add content-factory skill: monthly-plan mode"
```

---

## Task 9: Wire up scheduled routines

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: all three modes from Tasks 5-8; `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` from Task 2.
- Produces: three live Claude Code routines.

- [ ] **Step 1: Create the generate routine**

Use the `schedule` skill to create a routine:
- Name: `youtube-stories-generate`
- Schedule: every Monday and Thursday, 08:00 Europe/Paris
- Prompt: `Run the content-factory skill (.claude/skills/content-factory/SKILL.md) in Generate mode for project YoutubeStories, in the Business repo.`
- Secrets: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (values from `.env`)

- [ ] **Step 2: Create the monthly-plan routine**

Use the `schedule` skill to create a routine:
- Name: `youtube-stories-monthly-plan`
- Schedule: 1st of every month, 08:00 Europe/Paris
- Prompt: `Run the content-factory skill (.claude/skills/content-factory/SKILL.md) in Monthly-plan mode for project YoutubeStories, in the Business repo.`
- Secrets: same as Step 1

- [ ] **Step 3: Create the poll routine**

Use the `schedule` skill to create a routine:
- Name: `content-factory-telegram-poll`
- Schedule: every 15 minutes
- Prompt: `Run the content-factory skill (.claude/skills/content-factory/SKILL.md) in Poll mode across every project in the Business repo.`
- Secrets: same as Step 1

- [ ] **Step 4: Verify each routine fires cleanly**

Use `RemoteTrigger` (`action: "run"`) once per routine to fire it manually, then `list_runs` / `get_run_log` for each.
Expected: each run completes with the outcome already verified manually in Tasks 6-8 (generate produces a Telegram delivery; poll processes any pending reply; monthly-plan produces a proposal message), and no run ends in an unhandled error.

- [ ] **Step 5: Document the routines**

Append to `README.md`:

```markdown
## Scheduled routines

- `youtube-stories-generate` — Mon & Thu 08:00 Europe/Paris — generates and delivers the next YoutubeStories topic.
- `youtube-stories-monthly-plan` — 1st of month, 08:00 Europe/Paris — proposes next month's YoutubeStories topics.
- `content-factory-telegram-poll` — every 15 min — processes Telegram replies (validation/modification) across all projects.
```

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "Document scheduled routines"
```

---

## Task 10: End-to-end sign-off

**Files:** none (verification only).

**Interfaces:** none — this task exercises Tasks 1-9 together.

- [ ] **Step 1: Full real-topic cycle**

Let `youtube-stories-generate` fire on its real schedule (or trigger it manually via `RemoteTrigger`) for the next real `## À faire` topic.
Expected: Telegram delivery arrives with the 2 rendered videos (9:16 and 16:9) as video attachments, 2-3 thumbnails as photo attachments, and 3 title/description/hashtags proposals in the text message, matching Task 6's verified format.

- [ ] **Step 2: Modification round-trip**

Reply on Telegram with a concrete change request (e.g. "change le titre 3"). Wait for (or manually trigger) the next `content-factory-telegram-poll` run.
Expected: an updated Telegram message arrives reflecting only the requested change; the calendar entry is still under `## Généré...`.

- [ ] **Step 3: Approval round-trip**

Reply "ok". Wait for (or manually trigger) the next poll run.
Expected: the calendar entry moves to `## Validé`.

- [ ] **Step 4: Confirm with Sacha**

Ask Sacha to confirm the delivered video/thumbnails/metadata are usable as-is for manual posting. Note any follow-up requests as new, separately-scoped work (not a reopening of this plan).
