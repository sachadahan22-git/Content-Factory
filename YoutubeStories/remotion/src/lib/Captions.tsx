import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useDelayRender,
  useVideoConfig,
} from "remotion";
import { createTikTokStyleCaptions } from "@remotion/captions";
import type { Caption, TikTokPage } from "@remotion/captions";
import type { StoryVariant } from "./types";

// How often the caption page switches, in milliseconds. Higher = more
// words shown at once, lower = closer to word-by-word.
const SWITCH_CAPTIONS_EVERY_MS = 1200;
const HIGHLIGHT_COLOR = "#ffdd33";

/**
 * Captions are pre-transcribed (see `scripts/generate-captions.mjs`, which
 * implements the Whisper.cpp flow documented by the remotion-captions
 * skill) and written as a JSON file next to the narration audio, e.g.
 * `narration.wav` -> `narration.captions.json`. Transcription itself can't
 * happen inside the composition: `calculateMetadata` and the component
 * both run in a browser tab, which can't shell out to Whisper.cpp.
 *
 * `narrationAudioPath` may be a URL with a query string (e.g. a presigned/
 * temporary URL from a TTS provider) - strip it before deriving the base,
 * the same way `isImagePath` in `VisualClips.tsx` does, so we don't
 * accidentally split on a `.` that appears inside query params.
 */
function deriveCaptionsUrl(narrationAudioPath: string): string {
  const withoutQuery = narrationAudioPath.split("?")[0];
  const dotIndex = withoutQuery.lastIndexOf(".");
  const base =
    dotIndex === -1 ? withoutQuery : withoutQuery.slice(0, dotIndex);
  return `${base}.captions.json`;
}

/**
 * Fetches and burns in captions derived from the narration audio. If no
 * matching `*.captions.json` file exists (e.g. for placeholder assets used
 * during template verification), renders nothing instead of failing.
 */
export const BurnedInCaptions: React.FC<{
  narrationAudioPath: string;
  variant: StoryVariant;
}> = ({ narrationAudioPath, variant }) => {
  const [captions, setCaptions] = useState<Caption[] | null>(null);
  const { delayRender, continueRender } = useDelayRender();
  const [handle] = useState(() =>
    delayRender(`Loading captions for ${narrationAudioPath}`),
  );
  const { fps } = useVideoConfig();

  const fetchCaptions = useCallback(async () => {
    const captionsUrl = deriveCaptionsUrl(narrationAudioPath);
    try {
      const response = await fetch(captionsUrl);
      if (!response.ok) {
        // No pre-generated captions available - burn in nothing rather
        // than failing the whole render, but log it so a broken caption
        // pipeline (e.g. a bad URL from Task 6) is discoverable in render
        // logs instead of silently producing videos with no captions.
        console.warn(
          `[Captions] No captions found at ${captionsUrl} (status ${response.status}) - rendering without captions.`,
        );
        setCaptions([]);
        return;
      }
      const data = (await response.json()) as Caption[];
      setCaptions(data);
    } catch (err) {
      console.warn(
        `[Captions] Failed to fetch/parse captions at ${captionsUrl} - rendering without captions.`,
        err,
      );
      setCaptions([]);
    } finally {
      continueRender(handle);
    }
  }, [narrationAudioPath, continueRender, handle]);

  useEffect(() => {
    fetchCaptions();
  }, [fetchCaptions]);

  const { pages } = useMemo(() => {
    if (!captions || captions.length === 0) {
      return { pages: [] as TikTokPage[] };
    }
    return createTikTokStyleCaptions({
      captions,
      combineTokensWithinMilliseconds: SWITCH_CAPTIONS_EVERY_MS,
    });
  }, [captions]);

  if (pages.length === 0) {
    return null;
  }

  return (
    <AbsoluteFill>
      {pages.map((page, index) => {
        const nextPage = pages[index + 1] ?? null;
        const startFrame = Math.round((page.startMs / 1000) * fps);
        const endFrame = Math.min(
          nextPage ? Math.round((nextPage.startMs / 1000) * fps) : Infinity,
          startFrame + Math.round((SWITCH_CAPTIONS_EVERY_MS / 1000) * fps),
        );
        const durationInFrames = endFrame - startFrame;

        if (durationInFrames <= 0) {
          return null;
        }

        return (
          <Sequence
            key={page.startMs}
            from={startFrame}
            durationInFrames={durationInFrames}
          >
            <CaptionPage page={page} variant={variant} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

const CaptionPage: React.FC<{ page: TikTokPage; variant: StoryVariant }> = ({
  page,
  variant,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTimeMs = (frame / fps) * 1000;
  const absoluteTimeMs = page.startMs + currentTimeMs;

  return (
    <AbsoluteFill
      style={{
        justifyContent: variant === "centered" ? "center" : "flex-end",
        alignItems: "center",
        padding: variant === "centered" ? "0 100px" : "0 80px 60px",
      }}
    >
      <div
        style={{
          whiteSpace: "pre-wrap",
          textAlign: "center",
          fontFamily: "Helvetica, Arial, sans-serif",
          fontWeight: 700,
          fontSize: variant === "centered" ? 60 : 44,
          lineHeight: 1.3,
          backgroundColor: "rgba(0,0,0,0.45)",
          borderRadius: 16,
          padding: "12px 24px",
        }}
      >
        {page.tokens.map((token) => {
          const isActive =
            token.fromMs <= absoluteTimeMs && token.toMs > absoluteTimeMs;
          return (
            <span
              key={token.fromMs}
              style={{ color: isActive ? HIGHLIGHT_COLOR : "white" }}
            >
              {token.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
