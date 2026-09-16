#!/usr/bin/env node
/**
 * Pre-generates a captions JSON file for a narration audio file, using the
 * Whisper.cpp flow documented by Remotion's `remotion-captions` skill
 * (https://www.remotion.dev/docs/install-whisper-cpp).
 *
 * This runs as a separate, one-off Node.js step - NOT inside the Remotion
 * composition - because `calculateMetadata()` and the composition
 * component both execute in a browser tab, which cannot shell out to a
 * native Whisper.cpp binary.
 *
 * The `Vertical`/`Horizontal` compositions look for the resulting JSON
 * file next to the narration audio, by naming convention: for
 * `narration.wav` they fetch `narration.captions.json`. If that file
 * doesn't exist, the compositions simply render without captions.
 *
 * Usage:
 *   node scripts/generate-captions.mjs <path-to-16khz-mono-wav>
 *
 * Input must be a 16-bit, 16kHz, mono WAV file (Whisper.cpp's
 * requirement). See:
 * https://www.remotion.dev/docs/webcodecs/resample-audio-16khz
 *
 * Requires a C/C++ toolchain (to build Whisper.cpp) and network access
 * (to download Whisper.cpp and the model, on first run).
 */

import path from "path";
import fs from "fs";
import {
  downloadWhisperModel,
  installWhisperCpp,
  transcribe,
  toCaptions,
} from "@remotion/install-whisper-cpp";

const WHISPER_CPP_VERSION = "1.5.5";
const MODEL = "medium.en";

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error(
      "Usage: node scripts/generate-captions.mjs <path-to-16khz-mono-wav>",
    );
    process.exit(1);
  }

  const resolvedInput = path.resolve(inputPath);
  if (!fs.existsSync(resolvedInput)) {
    console.error(`Input file not found: ${resolvedInput}`);
    process.exit(1);
  }

  const whisperDir = path.join(process.cwd(), "whisper.cpp");

  await installWhisperCpp({ to: whisperDir, version: WHISPER_CPP_VERSION });
  await downloadWhisperModel({ model: MODEL, folder: whisperDir });

  const { transcription } = await transcribe({
    model: MODEL,
    whisperPath: whisperDir,
    whisperCppVersion: WHISPER_CPP_VERSION,
    inputPath: resolvedInput,
    tokenLevelTimestamps: true,
  });

  const { captions } = toCaptions({ whisperCppOutput: { transcription } });

  const ext = path.extname(resolvedInput);
  const outputPath = `${resolvedInput.slice(0, -ext.length)}.captions.json`;
  fs.writeFileSync(outputPath, JSON.stringify(captions, null, 2));

  console.log(`Wrote ${captions.length} caption(s) to ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
