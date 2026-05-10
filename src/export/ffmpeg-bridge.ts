/**
 * Lazy-loaded ffmpeg.wasm: webm → mp4 transcode.
 * Only imported when the user clicks "convert to mp4".
 */

export const webmToMp4 = async (webm: Blob, onLog?: (m: string) => void): Promise<Blob> => {
  const { FFmpeg } = await import("@ffmpeg/ffmpeg");
  const { fetchFile } = await import("@ffmpeg/util");
  const ff = new FFmpeg();
  ff.on("log", ({ message }) => onLog?.(message));
  await ff.load();
  await ff.writeFile("in.webm", await fetchFile(webm));
  await ff.exec(["-i", "in.webm", "-c:v", "libx264", "-preset", "fast", "-crf", "22", "-c:a", "aac", "out.mp4"]);
  const data = await ff.readFile("out.mp4");
  // ffmpeg returns FileData (Uint8Array<ArrayBufferLike>); copy into a fresh
  // Uint8Array<ArrayBuffer> so Blob's BlobPart accepts it under TS 5.7+.
  const bytes = data instanceof Uint8Array ? new Uint8Array(data) : new TextEncoder().encode(String(data));
  return new Blob([bytes], { type: "video/mp4" });
};
