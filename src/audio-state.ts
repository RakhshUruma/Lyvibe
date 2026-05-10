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
};
