import React from "react";
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { StoryVariant } from "./types";

const TITLE_VISIBLE_SECONDS = 3;

/**
 * Renders `title` as an animated overlay for the first
 * `TITLE_VISIBLE_SECONDS` seconds of the composition.
 */
export const TitleOverlay: React.FC<{
  title: string;
  variant: StoryVariant;
}> = ({ title, variant }) => {
  const { fps } = useVideoConfig();
  const durationInFrames = Math.round(TITLE_VISIBLE_SECONDS * fps);

  if (!title) {
    return null;
  }

  return (
    <Sequence durationInFrames={durationInFrames} name="Title">
      <AnimatedTitle
        title={title}
        variant={variant}
        durationInFrames={durationInFrames}
      />
    </Sequence>
  );
};

const AnimatedTitle: React.FC<{
  title: string;
  variant: StoryVariant;
  durationInFrames: number;
}> = ({ title, variant, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entrance = spring({ frame, fps, config: { damping: 200 } });
  const exitStartFrame = durationInFrames - Math.round(0.4 * fps);
  const exitProgress = interpolate(
    frame,
    [exitStartFrame, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const opacity = Math.min(entrance, exitProgress);
  const translateY = interpolate(entrance, [0, 1], [24, 0]);
  const scale = interpolate(entrance, [0, 1], [0.92, 1]);

  return (
    <AbsoluteFill
      style={{
        justifyContent: variant === "centered" ? "center" : "flex-end",
        alignItems: "center",
        padding: variant === "centered" ? "0 80px" : "0 60px 140px",
      }}
    >
      <div
        style={{
          opacity,
          transform: `translateY(${translateY}px) scale(${scale})`,
          background:
            "linear-gradient(135deg, rgba(15,15,20,0.82), rgba(15,15,20,0.62))",
          borderRadius: 28,
          padding: variant === "centered" ? "36px 56px" : "24px 44px",
          borderLeft: "8px solid #FFC93C",
          boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
          maxWidth: "92%",
        }}
      >
        <div
          style={{
            fontFamily: "Helvetica, Arial, sans-serif",
            fontWeight: 800,
            fontSize: variant === "centered" ? 84 : 60,
            lineHeight: 1.12,
            letterSpacing: -0.5,
            color: "white",
            textAlign: "center",
            textShadow: "0 4px 24px rgba(0,0,0,0.6)",
          }}
        >
          {title}
        </div>
      </div>
    </AbsoluteFill>
  );
};
