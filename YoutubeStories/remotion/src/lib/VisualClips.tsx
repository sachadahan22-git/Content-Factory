import React from "react";
import { AbsoluteFill, Img, useVideoConfig } from "remotion";
import { Video } from "@remotion/media";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"];

function isImagePath(src: string): boolean {
  const withoutQuery = src.toLowerCase().split("?")[0];
  return IMAGE_EXTENSIONS.some((ext) => withoutQuery.endsWith(ext));
}

const fillStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

const VisualClip: React.FC<{ src: string }> = ({ src }) => {
  if (isImagePath(src)) {
    return <Img src={src} style={fillStyle} />;
  }

  // Video clips carry their own audio track, which we don't want -
  // narration and music are handled as separate, explicit audio tracks.
  return <Video src={src} style={fillStyle} muted />;
};

/**
 * Cross-fades through `clipPaths`, spacing them evenly across the
 * composition's full duration.
 */
export const CrossfadingVisuals: React.FC<{ clipPaths: string[] }> = ({
  clipPaths,
}) => {
  const { durationInFrames } = useVideoConfig();

  if (clipPaths.length === 0) {
    return <AbsoluteFill style={{ backgroundColor: "#111111" }} />;
  }

  if (clipPaths.length === 1) {
    return (
      <AbsoluteFill>
        <VisualClip src={clipPaths[0]} />
      </AbsoluteFill>
    );
  }

  const clipCount = clipPaths.length;
  // Keep transitions short relative to each clip's on-screen time.
  const transitionDurationInFrames = Math.max(
    1,
    Math.min(15, Math.floor(durationInFrames / (clipCount * 4))),
  );
  const sequenceDurationInFrames = Math.max(
    transitionDurationInFrames + 1,
    Math.ceil(
      (durationInFrames + (clipCount - 1) * transitionDurationInFrames) /
        clipCount,
    ),
  );

  const children: React.ReactNode[] = [];
  clipPaths.forEach((src, index) => {
    children.push(
      <TransitionSeries.Sequence
        key={`clip-${index}`}
        durationInFrames={sequenceDurationInFrames}
      >
        <VisualClip src={src} />
      </TransitionSeries.Sequence>,
    );
    if (index < clipPaths.length - 1) {
      children.push(
        <TransitionSeries.Transition
          key={`transition-${index}`}
          timing={linearTiming({
            durationInFrames: transitionDurationInFrames,
          })}
          presentation={fade()}
        />,
      );
    }
  });

  return <TransitionSeries>{children}</TransitionSeries>;
};
