import { ALL_FORMATS, Input, UrlSource } from "mediabunny";
import type { CalculateMetadataFunction } from "remotion";
import type { StoryProps } from "./types";

// Both YoutubeStories compositions run at 30fps.
const FPS = 30;

/**
 * Builds a `calculateMetadata` function that makes the composition's
 * duration match the narration audio's duration, at a fixed
 * width/height for the given orientation.
 *
 * `calculateMetadata` runs in a browser tab (part of the render/Studio
 * process), so only browser-compatible APIs (fetch, Mediabunny) can be
 * used here - not Node-only APIs like `fs` or `child_process`.
 */
export const createCalculateStoryMetadata = (dimensions: {
  width: number;
  height: number;
}): CalculateMetadataFunction<StoryProps> => {
  return async ({ props }) => {
    const input = new Input({
      formats: ALL_FORMATS,
      source: new UrlSource(props.narrationAudioPath, {
        getRetryDelay: () => null,
      }),
    });

    const durationInSeconds = await input.computeDuration();

    return {
      durationInFrames: Math.max(1, Math.ceil(durationInSeconds * FPS)),
      fps: FPS,
      width: dimensions.width,
      height: dimensions.height,
      props,
    };
  };
};
