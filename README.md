# Business

Automated content generation pipeline for Sacha's video projects.

- Design: `docs/superpowers/specs/2026-08-19-content-factory-design.md`
- Plan: `docs/superpowers/plans/2026-08-19-content-factory.md`
- Shared engine: `.claude/skills/content-factory/`
- Projects: one subfolder each (e.g. `YoutubeStories/`), containing `config.yaml` and `calendar/`.

Generated media (video, images, audio) is delivered directly via Telegram, never committed here.

## Running the pipeline

Generation is triggered manually (not on an unattended cloud schedule — see
"Why no scheduled routines" below). Ask Claude, in a normal Claude Code
session with the `kie-art` MCP server and Telegram credentials configured
(the setup used throughout this project), to run one of:

- **Generate**: "Run the content-factory skill in Generate mode for project
  YoutubeStories." — writes the next queued topic's script, voice, visuals,
  thumbnails, and both video formats, archives the script to Google Drive,
  and delivers everything via Telegram for review.
- **Poll**: "Run the content-factory skill in Poll mode." — checks Telegram
  for validation/modification replies since the last check and processes
  them.
- **Monthly-plan**: "Run the content-factory skill in Monthly-plan mode for
  project YoutubeStories." — proposes 8 new topics for Telegram approval.

### Why no scheduled routines

Three Claude Code cloud routines (`youtube-stories-generate`,
`youtube-stories-monthly-plan`, `content-factory-telegram-poll`) were built
and are still present (disabled) at https://claude.ai/code/routines, but two
platform limitations of the available cloud environment ("Goûteur") block
them from actually working end-to-end:

1. Its egress network policy denies outbound connections to
   `api.telegram.org` (`connect_rejected`, "organization policy" — confirmed
   by real test runs against all 3 routines), so no Telegram message can be
   sent from a routine.
2. The `kie-art` MCP server (voice/image/video generation) is a local-only
   MCP connection, not a claude.ai connector, so it isn't available to cloud
   routines at all regardless of the network issue above.

If either limitation is lifted in the future (an environment network
allowlist becomes configurable, or kie.ai becomes available as a claude.ai
connector), the 3 routines can simply be re-enabled at the link above — no
rework needed, they're fully configured and were verified to run correctly
up to the point of the blocked call.
