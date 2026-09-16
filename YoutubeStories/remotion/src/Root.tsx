import "./index.css";
import React from "react";
import { Composition, staticFile } from "remotion";
import {
  Vertical,
  VERTICAL_WIDTH,
  VERTICAL_HEIGHT,
  calculateVerticalMetadata,
} from "./Vertical";
import {
  Horizontal,
  HORIZONTAL_WIDTH,
  HORIZONTAL_HEIGHT,
  calculateHorizontalMetadata,
} from "./Horizontal";
import type { StoryProps } from "./lib/types";

// Placeholder props used for Studio preview and for the `remotion-render`
// verification render (see YoutubeStories/remotion/public/). Task 6's
// render step overrides these with real generated assets via
// renderMedia()'s `inputProps`.
const placeholderProps: StoryProps = {
  narrationAudioPath: staticFile("placeholder-narration.wav"),
  visualClipPaths: [
    staticFile("placeholder.jpg"),
    staticFile("placeholder.jpg"),
    staticFile("placeholder.jpg"),
  ],
  title: "Test",
  musicPath: staticFile("placeholder-music.wav"),
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Vertical"
        component={Vertical}
        width={VERTICAL_WIDTH}
        height={VERTICAL_HEIGHT}
        fps={30}
        durationInFrames={150}
        defaultProps={placeholderProps}
        calculateMetadata={calculateVerticalMetadata}
      />
      <Composition
        id="Horizontal"
        component={Horizontal}
        width={HORIZONTAL_WIDTH}
        height={HORIZONTAL_HEIGHT}
        fps={30}
        durationInFrames={150}
        defaultProps={placeholderProps}
        calculateMetadata={calculateHorizontalMetadata}
      />
    </>
  );
};
