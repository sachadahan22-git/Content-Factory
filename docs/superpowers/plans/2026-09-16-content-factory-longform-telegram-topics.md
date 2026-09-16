# Content Factory v2 — Format long + Telegram Topics — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "long" sub-flow (20-30 min YouTube script + voice + thumbnails, no visuals/render) alongside the existing "short" sub-flow, both triggered together from one shared calendar per business project, delivered into separate Telegram Topics so two simultaneous pending deliveries are never ambiguous.

**Architecture:** Restructure `YoutubeStories/` into a business folder (shared `config.yaml` + `calendar/`) containing `short/` and `long/` sub-flow folders, each with its own `config.yaml`. `content-factory` SKILL.md's Generate mode iterates every sub-flow folder found under the project, running script/voice/thumbnails (and visuals+render only when the sub-flow doesn't opt out) independently per sub-flow, delivering into that sub-flow's own Telegram Topic (`message_thread_id`). Poll mode matches replies to pending entries by `message_thread_id` first, scoping its existing "most recent pending" fallback to that thread so two sub-flows pending at once never cross-match.

**Tech Stack:** Same as v1 — Claude Code skill (Markdown instructions), kie.ai MCP tools, Remotion (short sub-flow only), Telegram Bot API via curl, Google Drive MCP for script archival.

**Spec:** `docs/superpowers/specs/2026-09-16-content-factory-longform-telegram-topics-design.md` (and the v1 spec it extends, `docs/superpowers/specs/2026-08-19-content-factory-design.md`)

## Global Constraints

- No project's file paths are prefixed with `Business/` — the repo root itself is `Business`, everything is written relative to it.
- No generated media (video, image, audio) is ever committed to git — only config/calendar/state text. `.gitignore` already enforces this.
- No file's bytes are ever read back from local disk into a tool call or the model's own context to reach a delivery destination — always stream via `curl -F` (except short text the model itself just generated, e.g. the script, which is fine to send inline to Drive's `create_file`).
- Telegram `sendVideo` calls MUST always pass explicit `width`/`height`/`duration` (probed via ffmpeg) — see the existing "Telegram send procedure" section, unchanged by this plan.
- `state.pending` keys are compared as integers, never as strings, per the existing Poll mode fallback logic.
- The `long` sub-flow never generates scene visuals or invokes Remotion — only script, voice, and thumbnails.

---

### Task 1: Restructure YoutubeStories into a business/short split

**Files:**
- Create: `YoutubeStories/short/config.yaml`
- Modify: `YoutubeStories/config.yaml` (becomes business-level only)
- Move: `YoutubeStories/remotion/` → `YoutubeStories/short/remotion/`

**Interfaces:**
- Consumes: nothing from other tasks (this is the first task).
- Produces: the file layout every later task assumes — `YoutubeStories/config.yaml` (business-level fields only), `YoutubeStories/short/config.yaml` (sub-flow fields), `YoutubeStories/short/remotion/` (unchanged Remotion project, just relocated).

- [ ] **Step 1: Read the current business-level config**

```bash
cat "YoutubeStories/config.yaml"
```

Current content (as of the last commit before this task):

```yaml
name: "YouTube Stories"
slug: youtube-stories
niche: "Histoires business et histoires incroyables (entrepreneurs, retournements de situation, anecdotes vraies bluffantes)"
platforms: [youtube]
formats: [9:16]
voice: true
cadence: "2x/semaine (lundi et jeudi)"
tone: "narratif, immersif, rythmé, avec un twist ou une révélation"
telegram_label: "📺 YT Stories"
```

- [ ] **Step 2: Move the Remotion project into `short/`**

```bash
mkdir -p YoutubeStories/short
git mv YoutubeStories/remotion YoutubeStories/short/remotion
```

- [ ] **Step 3: Write the new business-level `config.yaml`**

Replace `YoutubeStories/config.yaml` with exactly:

```yaml
name: "YouTube Stories"
slug: youtube-stories
niche: "Histoires business et histoires incroyables (entrepreneurs, retournements de situation, anecdotes vraies bluffantes)"
tone: "narratif, immersif, rythmé, avec un twist ou une révélation"
cadence: "1x/semaine (dimanche) — court et long ensemble"
telegram_topic_id: null  # filled in Task 2 once the "Général" Telegram Topic exists
telegram_label: "📺 YT Stories"
```

(Cadence changes from the short sub-flow's previous standalone 2x/semaine — lundi et jeudi — to 1x/semaine now that both sub-flows trigger together on the same shared cadence, per Sacha's explicit request.)

- [ ] **Step 4: Write `YoutubeStories/short/config.yaml`**

```yaml
platforms: [tiktok, youtube]
format: 9:16
voice: true
telegram_topic_id: null  # filled in Task 2 once the "Court" Telegram Topic exists
telegram_label: "📺 YT Stories — Court"
```

- [ ] **Step 5: Fix the stale hardcoded Remotion path in SKILL.md**

`.claude/skills/content-factory/SKILL.md`'s "Telegram send procedure" section has a hardcoded path that predates this restructuring:

```bash
COMPOSITOR_DIR="YoutubeStories/remotion/node_modules/@remotion/compositor-darwin-arm64"
```

This is a project-specific example, not a generic instruction — replace it with a generic placeholder so it doesn't silently break for `long` (which has no Remotion project at all) or for future projects with a different sub-flow layout:

```bash
COMPOSITOR_DIR="<sub-flow folder>/remotion/node_modules/@remotion/compositor-darwin-arm64"
```

- [ ] **Step 6: Verify the moved Remotion project still builds**

```bash
cd YoutubeStories/short/remotion && npx tsc --noEmit && npm run lint
```

Expected: both exit 0, no errors. This confirms the move didn't break any relative imports (there are none referencing paths outside `remotion/`, but this is the real check, not an assumption).

- [ ] **Step 7: Commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add YoutubeStories/config.yaml YoutubeStories/short/config.yaml YoutubeStories/short/remotion .claude/skills/content-factory/SKILL.md
git commit -m "Restructure YoutubeStories into business/short split"
```

---

### Task 2: Telegram group + Topics setup

**Files:**
- Modify: `YoutubeStories/config.yaml`, `YoutubeStories/short/config.yaml` (fill in real `telegram_topic_id` values)
- Create: `YoutubeStories/long/config.yaml`
- Modify: `.env` (not committed — gitignored), `.env.example`

**Interfaces:**
- Consumes: `YoutubeStories/config.yaml` and `YoutubeStories/short/config.yaml` from Task 1 (their `telegram_topic_id: null` placeholders).
- Produces: three real Telegram Topic ids (`message_thread_id` values) wired into the three `config.yaml` files, and a new group `chat_id` in `.env`.

**This task requires Sacha's own action inside the Telegram app — it cannot be done by an implementer subagent.** Whoever executes this task must pause and walk Sacha through the manual steps live (same pattern as the original BotFather setup), not attempt to script around it.

- [ ] **Step 1: Guide Sacha through creating the group and enabling Topics**

Tell Sacha, one step at a time, waiting for confirmation after each:
1. In Telegram, create a new **Group** (not a channel), name it e.g. "Content Factory".
2. Add `@ContentFactorySD_Bot` to the group as a member.
3. Open the group's settings (tap the group name) → **Edit** → enable **Topics**.
4. Create three topics inside the group, using exactly these names: `YT Stories — Général`, `YT Stories — Court`, `YT Stories — Long`.

- [ ] **Step 2: Get the group's chat id**

Ask Sacha to send any message in the group (in any topic), then run:

```bash
set -a && source .env && set +a
curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getUpdates" | python3 -m json.tool
```

Find the `chat.id` field on that update — it will be a negative number for a group (unlike the old private chat's positive id). This is the new `TELEGRAM_CHAT_ID`.

- [ ] **Step 3: Get each topic's thread id**

Ask Sacha to send one distinguishable test message in each of the 3 topics (e.g. "test général", "test court", "test long"), then run the same `getUpdates` call again:

```bash
set -a && source .env && set +a
curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getUpdates" | python3 -m json.tool
```

Each of the 3 new messages will have a `message_thread_id` field (the "Général" topic message may omit it if it's Telegram's default "General" thread — in that case, note that the business-level topic uses no `message_thread_id` at all when sending, i.e. `telegram_topic_id: null` stays intentional and messages to it are sent without the parameter). Match each `message_thread_id` to the topic Sacha said they sent it from, by the message text.

- [ ] **Step 4: Update `.env` with the new group chat id**

Edit the real `.env` file (not `.env.example`):

```
TELEGRAM_BOT_TOKEN=<unchanged>
TELEGRAM_CHAT_ID=<new negative group chat id from Step 2>
```

- [ ] **Step 5: Wire the topic ids into the three config files**

Update `YoutubeStories/config.yaml`'s `telegram_topic_id` to the "Général" topic's thread id (or leave `null` if Step 3 found it has none).

Update `YoutubeStories/short/config.yaml`'s `telegram_topic_id` to the "Court" topic's thread id.

Create `YoutubeStories/long/config.yaml`:

```yaml
platforms: [youtube]
format: 16:9
voice: true
generate_visuals: false
target_duration_minutes: [20, 30]
target_word_count: [3000, 4500]
thumbnail_count: 3
telegram_topic_id: <the "Long" topic's thread id>
telegram_label: "📺 YT Stories — Long"
```

- [ ] **Step 6: Verify each topic id works**

Send one real test message to each topic id (using the new group chat id) and confirm it lands in the right topic in the Telegram app:

```bash
set -a && source .env && set +a
curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
  -d chat_id="$TELEGRAM_CHAT_ID" \
  -d message_thread_id="<court topic id>" \
  -d text="Test — topic Court"
curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
  -d chat_id="$TELEGRAM_CHAT_ID" \
  -d message_thread_id="<long topic id>" \
  -d text="Test — topic Long"
```

Ask Sacha to confirm each test message appeared in the correct topic.

- [ ] **Step 7: Note on the 2 stale pending entries from the old private chat**

`state/telegram.json`'s `pending` map still has entries `"9"` and `"15"` from before this migration (old topic deliveries in the now-abandoned private DM). They can no longer be replied to from the new group. Tell Sacha this explicitly and ask whether to approve/dismiss them from the old private chat before moving on, or just leave them as permanent harmless clutter (same tolerance the system already had for unresolved entries) — do not decide this unilaterally.

- [ ] **Step 8: Commit**

```bash
git add YoutubeStories/config.yaml YoutubeStories/short/config.yaml YoutubeStories/long/config.yaml
git commit -m "Wire up Telegram group + Topics for YoutubeStories sub-flows"
```

(`.env` stays gitignored, never committed.)

---

### Task 3: Generate mode — iterate sub-flows, add the `long` content flow

**Files:**
- Modify: `.claude/skills/content-factory/SKILL.md` (`## Modes` and `## Generate mode` sections, steps a-h)

**Interfaces:**
- Consumes: the business/sub-flow folder layout from Task 1 (`<ProjectFolder>/config.yaml`, `<ProjectFolder>/<sub-flow>/config.yaml`), and the `telegram_topic_id`/`telegram_label` fields from Task 2.
- Produces: per sub-flow, local script text + 3 proposals + narration audio path + (if not `generate_visuals: false`) visual clip paths + thumbnail paths + Drive script link — all consumed by Task 4's delivery step.

- [ ] **Step 1: Update the `## Modes` section**

Replace:

```markdown
This skill is invoked with a mode (`generate`, `poll`, or `monthly-plan`) and,
for `generate`/`monthly-plan`, a project slug (the subfolder name, e.g.
`YoutubeStories`).
```

With:

```markdown
This skill is invoked with a mode (`generate`, `poll`, or `monthly-plan`) and,
for `generate`/`monthly-plan`, a project slug (the business folder name, e.g.
`YoutubeStories`). A project's business folder contains a shared
`config.yaml` and `calendar/`, plus one subfolder per sub-flow (e.g.
`short/`, `long/`) — every direct subfolder of the project folder that
itself contains a `config.yaml` is a sub-flow. `generate` and
`monthly-plan` both operate on every sub-flow present; a project can have
one sub-flow, several, or (for a future project) a completely different
set of sub-flow names — nothing about a sub-flow's name is hardcoded in
this skill.
```

- [ ] **Step 2: Rewrite Generate mode step a (no-topics warning) to loop over sub-flows**

Replace step a:

```markdown
a. Read `<ProjectFolder>/config.yaml` and the current month's
   `<ProjectFolder>/calendar/YYYY-MM.md`. Take the first line under
   `## À faire`. If there is none, send (via the Telegram send procedure
   below) "⚠️ <telegram_label> — plus de sujets dans le calendrier, lance
   le planning mensuel." and stop — do not proceed to later steps.
```

With:

```markdown
a. Read `<ProjectFolder>/config.yaml` and the current month's
   `<ProjectFolder>/calendar/YYYY-MM.md`. Take the first line under
   `## À faire`. If there is none, send (via the Telegram send procedure
   below, using the project's own `telegram_topic_id`/`telegram_label` —
   this warning is business-level, not per sub-flow) "⚠️ <telegram_label>
   — plus de sujets dans le calendrier, lance le planning mensuel." and
   stop — do not proceed to later steps.

   Otherwise, list every direct subfolder of `<ProjectFolder>` that
   contains its own `config.yaml` (each is a sub-flow, e.g. `short/`,
   `long/`) and run steps b-k below independently for each one, against
   the same topic line found above. A failure in one sub-flow (per the
   retry/failure handling in steps c/d/e/g) does not stop the others —
   each sub-flow's failure or success is independent and reported
   separately.
```

- [ ] **Step 3: Update step b to size the script per sub-flow**

Replace step b:

```markdown
b. Write a script matching `niche` and `tone` from the config
   (300-600 words), plus exactly 3 distinct proposals of
   `{title, description, hashtags}` tailored to the project's
   `platforms`.
```

With:

```markdown
b. Write a script matching the project's `niche` and `tone` (from
   `<ProjectFolder>/config.yaml`), sized per this sub-flow's own
   `<ProjectFolder>/<sub-flow>/config.yaml`: if it has
   `target_word_count: [min, max]`, write within that range (e.g. `long`:
   3000-4500 words, ~20-30 minutes of narration at a natural reading
   pace); otherwise default to 300-600 words. Plus exactly 3 distinct
   proposals of `{title, description, hashtags}` tailored to this
   sub-flow's own `platforms`.

   Each sub-flow's script is written independently from this same topic
   line — a `long` sub-flow's script is not an expansion of `short`'s
   script (or vice versa); each is drafted fresh from the topic and the
   project's niche/tone. Minor detail differences between a project's
   sub-flows are expected and accepted, not a bug to reconcile.
```

- [ ] **Step 4: Update step d to skip visuals for `generate_visuals: false`**

Replace the start of step d:

```markdown
d. Generate visuals: split the script into 12-20 scenes/beats (roughly
```

With:

```markdown
d. If this sub-flow's `config.yaml` has `generate_visuals: false`, skip
   this entire step (no scene visuals at all) and also skip step g below
   (no Remotion render) — this sub-flow's local output for the delivery
   step is only the narration audio (step c) and thumbnails (step e).

   Otherwise, generate visuals: split the script into 12-20 scenes/beats
   (roughly
```

(Keep the rest of step d's existing text — the ToolSearch call, retry handling — unchanged after this point, just re-flow the paragraph so "roughly double-to-triple..." etc. continues to read naturally as the continuation of "Otherwise, generate visuals: split the script into 12-20 scenes/beats (roughly".)

- [ ] **Step 5: Update step e for a per-sub-flow thumbnail count**

Replace step e:

```markdown
e. Generate thumbnails: call `mcp__kie-art__generate_image` 2-3 times
   with prompts derived from the strongest visual hook across the 3
   title proposals from step b. Download results locally. Same retry/
   failure handling as step c.
```

With:

```markdown
e. Generate thumbnails: call `mcp__kie-art__generate_image` N times,
   where N is this sub-flow's `thumbnail_count` from its `config.yaml`
   if set, otherwise 2-3 (default, unchanged from before). Prompts
   derived from the strongest visual hook across the 3 title proposals
   from step b — for a sub-flow with `generate_visuals: false`, this is
   the only image generation that happens for it. Download results
   locally. Same retry/failure handling as step c.
```

- [ ] **Step 6: Update step g to be conditional and use the sub-flow's own format/remotion folder**

Replace step g:

```markdown
g. For each format in `config.yaml`'s `formats` list, invoke the
   `remotion-render` skill against `<ProjectFolder>/remotion/`,
   composition `Vertical` for `9:16` / `Horizontal` for `16:9`, passing
   props `{ narrationAudioPath, visualClipPaths, title: <winning title
   proposal>, musicPath: undefined }`. Same retry/failure handling as
   step c (Telegram error + stop, leave topic at `À faire`).
```

With:

```markdown
g. Skip this step entirely if this sub-flow's `config.yaml` has
   `generate_visuals: false` (per step d).

   Otherwise, invoke the `remotion-render` skill against
   `<ProjectFolder>/<sub-flow>/remotion/`, composition `Vertical` if
   this sub-flow's `config.yaml` has `format: 9:16` / `Horizontal` if
   `format: 16:9`, passing props `{ narrationAudioPath, visualClipPaths,
   title: <winning title proposal>, musicPath: undefined }`. Same
   retry/failure handling as step c (Telegram error + stop, leave topic
   at `À faire`).
```

- [ ] **Step 7: Update step h's Drive archive filename to include the sub-flow**

Replace:

```markdown
   Then create a text file inside that month folder named
   `<topic-date>-script.txt` via `create_file` with
```

With:

```markdown
   Then create a text file inside that month folder named
   `<topic-date>-<sub-flow>-script.txt` (e.g.
   `2026-10-05-long-script.txt`) via `create_file` with
```

- [ ] **Step 8: Verify by reading the updated file back**

```bash
grep -n "generate_visuals\|sub-flow\|thumbnail_count\|target_word_count" .claude/skills/content-factory/SKILL.md
```

Expected: every edit from Steps 1-7 is present and reads coherently in context (no orphaned sentence fragments from the step d re-flow in Step 4 — re-read steps d and g in full to confirm they read as complete instructions).

- [ ] **Step 9: Commit**

```bash
git add .claude/skills/content-factory/SKILL.md
git commit -m "Generate mode: iterate sub-flows, add long-form (script/voice/thumbnails only)"
```

---

### Task 4: Generate mode — per-sub-flow Telegram delivery and calendar/state tracking

**Files:**
- Modify: `.claude/skills/content-factory/SKILL.md` (`## Generate mode` steps i-k, `## Telegram send procedure`)

**Interfaces:**
- Consumes: per-sub-flow local outputs from Task 3 (script, 3 proposals, narration audio path, optional visual/video paths, thumbnail paths, Drive link); each sub-flow's `telegram_topic_id`/`telegram_label` from Task 2.
- Produces: per-sub-flow calendar lines and `state/telegram.json` pending entries with a `sous_flux` field, consumed by Task 5's Poll mode.

- [ ] **Step 1: Update step i for per-sub-flow topic delivery**

Replace step i:

```markdown
i. Using the Telegram send procedure: send one text message containing
   `telegram_label`, the topic text, the 3 title/description/hashtags
   proposals, and the Drive script link from step h; then send each
   rendered video as a separate video message; then send each
   thumbnail as a separate photo message. Record the `message_id` of
   the first (text) message.
```

With:

```markdown
i. Using the Telegram send procedure, with `message_thread_id` set to
   this sub-flow's own `telegram_topic_id` on every call below (so
   delivery lands in this sub-flow's Telegram Topic, never mixed with
   another sub-flow's): send one text message containing this
   sub-flow's `telegram_label`, the topic text, the 3
   title/description/hashtags proposals, and the Drive script link
   from step h; then, only if this sub-flow rendered a video in step g
   (i.e. `generate_visuals` isn't `false`), send each rendered video as
   a separate video message; then send each thumbnail as a separate
   photo message. Record the `message_id` of the first (text) message.
```

- [ ] **Step 2: Update step j for a per-sub-flow calendar line**

Replace step j:

```markdown
j. Move the topic's line from `## À faire` to
   `## Généré (en attente de validation Telegram)` in the calendar
   file, appending ` | telegram_message_id: <id>` from step i.
```

With:

```markdown
j. On the FIRST sub-flow processed for this topic: remove the topic's
   line from `## À faire` (it's about to be replaced by one line per
   sub-flow, not carried forward as-is). For THIS sub-flow, append a new
   line under `## Généré (en attente de validation Telegram)`:
   `- [ ] <date> | <topic text> | sous_flux: <sub-flow name> |
   telegram_message_id: <id>` (using the `message_id` from step i). Each
   sub-flow gets its own independent line — do not create one shared
   line for multiple sub-flows.
```

- [ ] **Step 3: Update step k for the `sous_flux` field**

Replace step k:

```markdown
k. Update `state/telegram.json`: set
   `pending["<message_id>"] = {"project": "<slug>", "type": "topic", "topic_date": "<date>"}`.
```

With:

```markdown
k. Update `state/telegram.json`: set
   `pending["<message_id>"] = {"project": "<slug>", "sous_flux":
   "<sub-flow name>", "type": "topic", "topic_date": "<date>"}`.
```

- [ ] **Step 4: Add `message_thread_id` to the Telegram send procedure templates**

In the `## Telegram send procedure` section, update the three curl templates to accept an optional thread id. Replace:

```markdown
To send a text message:
`curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" -d chat_id="$TELEGRAM_CHAT_ID" -d text="<text>"`
The response's `result.message_id` is the Telegram message id to record in state.

To send a photo:
`curl -s -F chat_id="$TELEGRAM_CHAT_ID" -F photo=@<local_path> "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendPhoto"`
```

With:

```markdown
Whenever the caller has a `telegram_topic_id` (a project's or a
sub-flow's), add `-d message_thread_id="<telegram_topic_id>"` (or
`-F message_thread_id="<telegram_topic_id>"` for multipart calls) to
every one of the three calls below. Omit it entirely when
`telegram_topic_id` is `null` (the message goes to the group's default
thread).

To send a text message:
`curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" -d chat_id="$TELEGRAM_CHAT_ID" -d text="<text>"`
The response's `result.message_id` is the Telegram message id to record in state.

To send a photo:
`curl -s -F chat_id="$TELEGRAM_CHAT_ID" -F photo=@<local_path> "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendPhoto"`
```

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/content-factory/SKILL.md
git commit -m "Generate mode: per-sub-flow Telegram Topic delivery and calendar/state tracking"
```

---

### Task 5: Poll mode — thread-scoped matching, business-level monthly-plan routing

**Files:**
- Modify: `.claude/skills/content-factory/SKILL.md` (`## Poll mode` steps c, d, e; `## Monthly-plan mode` step c)

**Interfaces:**
- Consumes: `pending[id].sous_flux` field from Task 4; each sub-flow's/project's `telegram_topic_id` from Task 2.
- Produces: correctly-scoped calendar/state updates — no change to the shapes later tasks or Task 6's verification rely on beyond what Task 4 already defined.

- [ ] **Step 1: Scope the pending-entry fallback to the update's own thread**

Replace step c:

```markdown
c. For each update, read its message text and, if present, the
   `message_id` it is a reply to (`reply_to_message.message_id`). Look
   that id up in `state.pending`. If not found (no reply-to, or it
   doesn't match a pending entry — e.g. Sacha typed a fresh message
   instead of using Telegram's reply-swipe), fall back to the pending
   entry with the highest key that is still less than this update's own
   `message_id` — `state.pending`'s keys are JSON string keys (e.g.
   `"9"`, `"170687081"`), so this comparison MUST be done on the keys
   parsed as integers, never as strings (lexicographic string
   comparison would put `"9"` after `"170687081"` and pick the wrong,
   much older entry). The intent is: the most recently delivered
   pending item that this update could plausibly be replying to
   (Telegram message ids increase monotonically per chat). This
   most-recent-pending fallback
   replaces an earlier, narrower version that only applied when exactly
   one entry was pending — real usage regularly has several pending at
   once (e.g. a topic delivery and a monthly-plan proposal open
   simultaneously), and a plain "ok" with no reply-to should resolve to
   whichever was sent last, not silently fail to match. The
   greater-than-key check still exists as a recency guard: it's what
   filters out old backlog in the update queue (e.g. bot-setup test
   messages sent before any pending entry existed) so that backlog
   isn't misread as a modification instruction for whatever happens to
   be pending. If no pending entry has a key below this update's
   `message_id`, no match can be resolved — skip this update (still
   counts toward the offset advance in step g).
```

With:

```markdown
c. For each update, read its message text and, if present, the
   `message_id` it is a reply to (`reply_to_message.message_id`). Look
   that id up in `state.pending`. If not found (no reply-to, or it
   doesn't match a pending entry — e.g. Sacha typed a fresh message
   instead of using Telegram's reply-swipe), fall back within the SAME
   Telegram Topic the update was posted in: read the update's own
   `message_thread_id` (absent means the group's default/General
   thread), find every `pending` entry whose sub-flow's
   `telegram_topic_id` (or the owning project's `telegram_topic_id`,
   for a `monthly_plan` entry) equals that `message_thread_id`, and
   among those pick the one with the highest key that is still less
   than this update's own `message_id` — `state.pending`'s keys are
   JSON string keys (e.g. `"9"`, `"170687081"`), so this comparison MUST
   be done on the keys parsed as integers, never as strings
   (lexicographic string comparison would put `"9"` after
   `"170687081"` and pick the wrong, much older entry).

   Scoping the fallback to the update's own thread (rather than
   searching every pending entry across every sub-flow, as an earlier
   version of this fallback did) is what makes two sub-flows' pending
   deliveries — routine after this plan's changes, since `short` and
   `long` are always generated together — never cross-match: a plain
   "ok" typed in the "Court" topic can only ever resolve to a `short`
   pending entry, never a `long` one, regardless of which was delivered
   more recently. The greater-than-key check within that thread still
   exists as a recency guard against old backlog (e.g. bot-setup test
   messages sent before any pending entry existed in that thread). If
   no pending entry in this update's thread has a key below this
   update's `message_id`, no match can be resolved — skip this update
   (still counts toward the offset advance in step g).
```

- [ ] **Step 2: Update step d's calendar-move to target the right sub-flow line**

In step d's approval branch, replace:

```markdown
   - Approval (case-insensitive match on "ok", "valide", "validé", or
     the "👍" emoji): in the project's calendar file, move that topic's
     line from `## Généré...` to `## Validé`, changing `- [ ]` to
     `- [x]` (no extra suffix needed — the videos were already
     delivered as Telegram attachments at generation time, in the
     message referenced by the existing `telegram_message_id`).
     Remove the entry from `state.pending`.
```

With:

```markdown
   - Approval (case-insensitive match on "ok", "valide", "validé", or
     the "👍" emoji): in the project's calendar file, move the line
     that matches BOTH `pending[id].topic_date` AND
     `pending[id].sous_flux` (via the ` | sous_flux: <name> |` suffix
     each line carries since Task 4) from `## Généré...` to
     `## Validé`, changing `- [ ]` to `- [x]` (no extra suffix needed —
     the content was already delivered as Telegram attachments at
     generation time, in the message referenced by the existing
     `telegram_message_id`). This moves only this ONE sub-flow's line —
     a sibling sub-flow's line for the same topic (if any) is untouched
     and keeps its own independent state until its own approval
     arrives. Remove the entry from `state.pending`.
```

And in the same step's modification branch, replace:

```markdown
   - Anything else: treat as a modification instruction. Re-run the
     minimal subset of Generate-mode steps b-k implied by the
     instruction (e.g. "change la voix" → redo step c then g-k only;
     "change le titre 2" → redo step b's metadata only then re-send
     just the text message from step i), reusing the same
     `telegram_message_id` context. Leave the calendar entry under
     `## Généré...`.
```

With:

```markdown
   - Anything else: treat as a modification instruction, scoped to
     THIS ONE sub-flow only (`pending[id].sous_flux`) — never regenerate
     a sibling sub-flow because of a reply in this one's topic. Re-run
     the minimal subset of Generate-mode steps b-k implied by the
     instruction, for this sub-flow only (e.g. "change la voix" → redo
     step c then g-k only; "change le titre 2" → redo step b's metadata
     only then re-send just the text message from step i), reusing the
     same `telegram_message_id` context. Leave the calendar entry under
     `## Généré...`.
```

- [ ] **Step 3: Update step e's monthly-plan handling to note it's business-level**

Replace the start of step e:

```markdown
e. If `pending[id].type == "monthly_plan"`:
```

With:

```markdown
e. If `pending[id].type == "monthly_plan"` (these are business-level,
   not scoped to a sub-flow — sent to the project's own
   `telegram_topic_id`, matched via step c the same way as any other
   pending entry):
```

- [ ] **Step 4: Update Monthly-plan mode step c to use the project's own topic**

Replace:

```markdown
c. Using the Telegram send procedure, send a numbered list of the 8
   proposed topics with `telegram_label`, asking for validation or
   edits. Record the returned `message_id`.
```

With:

```markdown
c. Using the Telegram send procedure, with `message_thread_id` set to
   the project's own `telegram_topic_id` (from `<ProjectFolder>/config.yaml`,
   not any sub-flow's), send a numbered list of the 8 proposed topics
   with the project's `telegram_label`, asking for validation or edits.
   Record the returned `message_id`.
```

- [ ] **Step 5: Verify by reading the updated sections**

```bash
grep -n "message_thread_id\|sous_flux" .claude/skills/content-factory/SKILL.md
```

Expected: every reference is consistent — `sous_flux` always means the sub-flow name (`short`/`long`), `message_thread_id` always means a Telegram Topic id. Re-read Poll mode steps c-e in full to confirm they read coherently after the edits.

- [ ] **Step 6: Commit**

```bash
git add .claude/skills/content-factory/SKILL.md
git commit -m "Poll mode: scope pending-entry matching to the update's Telegram Topic"
```

---

### Task 6: End-to-end live verification

**Files:** none (verification only).

**Interfaces:** none — this task exercises Tasks 1-5 together.

- [ ] **Step 1: Full real dual-generation cycle**

Run Generate mode for project `YoutubeStories` (or trigger the routine if one exists) for the next real `## À faire` topic.
Expected: two independent deliveries appear in the Telegram group — one in the "Court" topic (script + 3 proposals + Drive link + video(s) + thumbnails, same as v1's verified format) and one in the "Long" topic (script + 3 proposals + Drive link + narration audio + 3 thumbnails, NO video). The calendar file shows two separate lines under `## Généré...`, one per sub-flow, both referencing the same topic date/text but different `telegram_message_id`s.

- [ ] **Step 2: Independent approval — short only**

Reply "ok" in the "Court" topic only. Run Poll mode.
Expected: only the `short` calendar line moves to `## Validé`; the `long` line stays under `## Généré...` untouched; `state.pending` still has the `long` entry.

- [ ] **Step 3: Modification round-trip — long only**

Reply with a concrete change request (e.g. "raccourcis le script") in the "Long" topic. Run Poll mode.
Expected: an updated script/audio is generated and re-delivered in the "Long" topic only; the `short` topic and its now-`## Validé` line are untouched.

- [ ] **Step 4: Approval round-trip — long**

Reply "ok" in the "Long" topic. Run Poll mode.
Expected: the `long` calendar line also moves to `## Validé`. Both sub-flow lines for this topic are now validated, independently, as designed.

- [ ] **Step 5: Monthly-plan sanity check**

If the shared calendar is close to empty, run Monthly-plan mode for `YoutubeStories`.
Expected: the 8-topic proposal arrives in the "Général" topic, not in "Court" or "Long".

- [ ] **Step 6: Confirm with Sacha**

Ask Sacha to confirm: the two deliveries were clearly separated by topic with no confusion, the long-form script/audio is usable as a basis for his own manual edit, and the independent validation behaved as expected. Note any follow-up requests as new, separately-scoped work (not a reopening of this plan).
