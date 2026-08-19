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
