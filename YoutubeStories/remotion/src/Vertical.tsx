import React from "react";
import { AbsoluteFill } from "remotion";
import { Audio } from "@remotion/media";
import { createCalculateStoryMetadata } from "./lib/story-metadata";
import { CrossfadingVisuals } from "./lib/VisualClips";
import { TitleOverlay } from "./lib/TitleOverlay";
import { BurnedInCaptions } from "./lib/Captions";
import type { StoryProps } from "./lib/types";

export const VERTICAL_WIDTH = 1080;
export const VERTICAL_HEIGHT = 1920;

export const calculateVerticalMetadata = createCalculateStoryMetadata({
  width: VERTICAL_WIDTH,
  height: VERTICAL_HEIGHT,
});

/**
 * Portrait (1080x1920) YoutubeStories composition, for Shorts/Reels/TikTok
 * style delivery. The narration audio drives the timeline: composition
 * duration equals narration duration. Visual clips cross-fade evenly
 * across that duration, the title is shown centered for the first 3
 * seconds, and captions derived from the narration are burned in centered
 * on screen.
 */
export const Vertical: React.FC<StoryProps> = ({
  narrationAudioPath,
  visualClipPaths,
  title,
  musicPath,
}) => {
  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <CrossfadingVisuals clipPaths={visualClipPaths} />
      <Audio src={narrationAudioPath} />
      {musicPath ? <Audio src={musicPath} volume={0.12} /> : null}
      <TitleOverlay title={title} variant="centered" />
      <BurnedInCaptions
        narrationAudioPath={narrationAudioPath}
        variant="centered"
      />
    </AbsoluteFill>
  );
};
