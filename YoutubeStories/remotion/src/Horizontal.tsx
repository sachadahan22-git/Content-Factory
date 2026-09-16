import React from "react";
import { AbsoluteFill } from "remotion";
import { Audio } from "@remotion/media";
import { createCalculateStoryMetadata } from "./lib/story-metadata";
import { CrossfadingVisuals } from "./lib/VisualClips";
import { TitleOverlay } from "./lib/TitleOverlay";
import { BurnedInCaptions } from "./lib/Captions";
import type { StoryProps } from "./lib/types";

export const HORIZONTAL_WIDTH = 1920;
export const HORIZONTAL_HEIGHT = 1080;

export const calculateHorizontalMetadata = createCalculateStoryMetadata({
  width: HORIZONTAL_WIDTH,
  height: HORIZONTAL_HEIGHT,
});

/**
 * Landscape (1920x1080) YoutubeStories composition, for standard YouTube
 * delivery. Same prop shape and behavior as `Vertical`: the narration
 * audio drives the timeline, visual clips cross-fade evenly across it,
 * and captions are burned in - but laid out for landscape, with visuals
 * filling the full width and captions in a lower-third band instead of
 * centered.
 */
export const Horizontal: React.FC<StoryProps> = ({
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
        variant="lower-third"
      />
    </AbsoluteFill>
  );
};
