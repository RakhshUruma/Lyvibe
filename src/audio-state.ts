/**
 * Shared, mutable audio analysis snapshot.
 * main.ts writes here every animation frame; particle-engine and any other
 * module reads from it directly (cheaper than getComputedStyle per frame).
 *
 *   bass / mid / treble / energy :  0..1, normalised levels
 *   kick                          :  0..1 envelope; spikes to 1 at onset,
 *                                    decays to 0 over ~250ms
 */
export const audioState = {
  bass:   0,
  mid:    0,
  treble: 0,
  energy: 0,
  kick:   0,
  /** 32-band FFT magnitudes, 0..1. Bands logarithmically spaced from
   *  ~40Hz (band 0) to ~16kHz (band 31). Written by main.ts each tick. */
  spectrum: new Float32Array(32),
  /** BPM-driven beat phase 0..1. 0 = on the beat, 0.5 = halfway between.
   *  bpm is whatever main.ts decides (default 120 if no detection runs). */
  beat:   0,
  bpm:    120,
};
