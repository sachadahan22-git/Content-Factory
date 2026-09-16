/**
 * Strips a trailing `?query` string from a URL/path, e.g. a presigned or
 * temporary URL from a generation/TTS provider, so extension/base-name
 * derivation doesn't get confused by a `.` inside the query params.
 */
export function stripQueryString(src: string): string {
  return src.split("?")[0];
}
