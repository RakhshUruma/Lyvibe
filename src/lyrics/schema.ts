export type Word = { start: number; end: number; word: string };

export type Section =
  | "intro" | "verse" | "preChorus" | "chorus" | "bridge" | "outro";

export type Segment = {
  start: number;
  end: number;
  text: string;
  words?: Word[];
  section?: Section;
  /** User-pinned anchor in viewport %, set via drag. Overrides random position. */
  anchorX?: number;
  anchorY?: number;
  /** User-pinned rotation in degrees. Overrides random tilt. */
  anchorR?: number;
  /** Per-character layout — when set, characters fly to positions on an
   *  arc/spiral/scatter pattern instead of stacking horizontally.
   *  - "arc":     characters distributed along upward-curving arc
   *  - "spiral":  characters spiral inward to center
   *  - "scatter": each character lands at a random offset
   *  - "rise":    characters rise from bottom to position with stagger
   *  - "constellation": positions read from `charPositions` array directly */
  layout?: "arc" | "spiral" | "scatter" | "rise" | "constellation";
  /** When layout === "constellation", absolute positions per visible
   *  character in viewport %. Length should match visible chars count. */
  charPositions?: { x: number; y: number; rot?: number }[];
  /** Indices of visible characters to emphasize (size↑, glow↑, separate
   *  font/color). Applied via the `.ch.emph` class. */
  emphasis?: number[];
};

export type Lyrics = {
  segments: Segment[];
  language?: string;
};

export const sortLyrics = (l: Lyrics): Lyrics => ({
  ...l,
  segments: [...l.segments].sort((a, b) => a.start - b.start),
});

export const indexAt = (segs: Segment[], t: number): number => {
  // last segment that has started at or before t (and not yet ended)
  let idx = -1;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]!;
    if (s.start <= t) idx = i;
    else break;
  }
  return idx;
};
