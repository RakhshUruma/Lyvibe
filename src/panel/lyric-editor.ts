import type { Lyrics, Segment } from "../lyrics/schema";
import { sortLyrics } from "../lyrics/schema";

type SeekFn = (t: number) => void;
type ChangeFn = (lyrics: Lyrics) => void;

export class LyricEditor {
  private root: HTMLElement;
  private elText:  HTMLTextAreaElement;
  private elStart: HTMLInputElement;
  private elEnd:   HTMLInputElement;
  private elIdx:   HTMLInputElement;
  private btnApply: HTMLButtonElement;
  private btnPrev:  HTMLButtonElement;
  private btnNext:  HTMLButtonElement;
  private btnSplit: HTMLButtonElement;
  private btnDel:   HTMLButtonElement;
  private btnInsB:  HTMLButtonElement;
  private btnInsA:  HTMLButtonElement;
  private btnClose: HTMLButtonElement;

  private lyrics: Lyrics = { segments: [] };
  private idx = -1;
  private currentT = 0;

  constructor(
    root: HTMLElement,
    private onSeek: SeekFn,
    private onChange: ChangeFn,
  ) {
    this.root = root;
    this.elText  = root.querySelector("#editText")  as HTMLTextAreaElement;
    this.elStart = root.querySelector("#editStart") as HTMLInputElement;
    this.elEnd   = root.querySelector("#editEnd")   as HTMLInputElement;
    this.elIdx   = root.querySelector("#editIdx")   as HTMLInputElement;
    this.btnApply = root.querySelector("#eApply")     as HTMLButtonElement;
    this.btnPrev  = root.querySelector("#ePrev")      as HTMLButtonElement;
    this.btnNext  = root.querySelector("#eNext")      as HTMLButtonElement;
    this.btnSplit = root.querySelector("#eSplit")     as HTMLButtonElement;
    this.btnDel   = root.querySelector("#eDel")       as HTMLButtonElement;
    this.btnInsB  = root.querySelector("#eInsBefore") as HTMLButtonElement;
    this.btnInsA  = root.querySelector("#eInsAfter")  as HTMLButtonElement;
    this.btnClose = root.querySelector("#editorClose") as HTMLButtonElement;

    this.btnApply.addEventListener("click", () => this.apply());
    this.btnPrev .addEventListener("click", () => this.move(-1));
    this.btnNext .addEventListener("click", () => this.move(+1));
    this.btnSplit.addEventListener("click", () => this.split());
    this.btnDel  .addEventListener("click", () => this.del());
    this.btnInsB .addEventListener("click", () => this.insert(-1));
    this.btnInsA .addEventListener("click", () => this.insert(+1));
    this.btnClose.addEventListener("click", () => this.close());

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !this.root.classList.contains("hidden")) this.close();
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !this.root.classList.contains("hidden")) this.apply();
    });
  }

  open(lyrics: Lyrics, idx: number, t: number): void {
    this.lyrics = lyrics;
    this.currentT = t;
    if (lyrics.segments.length === 0) {
      this.idx = -1;
      this.fill({ start: t, end: t + 2, text: "" });
    } else {
      this.idx = Math.max(0, Math.min(idx, lyrics.segments.length - 1));
      this.fill(lyrics.segments[this.idx]!);
    }
    this.root.classList.remove("hidden");
    this.elText.focus();
  }

  close(): void {
    this.root.classList.add("hidden");
  }

  private fill(s: Segment): void {
    this.elText.value  = s.text;
    this.elStart.value = String(s.start);
    this.elEnd.value   = String(s.end);
    this.elIdx.value   = String(this.idx);
  }

  private gather(): Segment {
    return {
      text:  this.elText.value,
      start: parseFloat(this.elStart.value) || 0,
      end:   parseFloat(this.elEnd.value)   || 0,
    };
  }

  private apply(): void {
    const updated = this.gather();
    if (this.idx >= 0) {
      this.lyrics.segments[this.idx] = { ...this.lyrics.segments[this.idx]!, ...updated };
    } else {
      this.lyrics.segments.push(updated);
    }
    this.lyrics = sortLyrics(this.lyrics);
    // re-find by start time (since sort may have moved it)
    this.idx = this.lyrics.segments.findIndex(s => s.start === updated.start && s.text === updated.text);
    this.onChange(this.lyrics);
  }

  private move(d: number): void {
    if (!this.lyrics.segments.length) return;
    this.idx = Math.max(0, Math.min(this.lyrics.segments.length - 1, this.idx + d));
    const s = this.lyrics.segments[this.idx]!;
    this.fill(s);
    this.onSeek(s.start);
  }

  private split(): void {
    if (this.idx < 0) return;
    const s = this.lyrics.segments[this.idx]!;
    const t = this.currentT > s.start && this.currentT < s.end ? this.currentT : (s.start + s.end) / 2;
    const halfText = Math.floor(s.text.length / 2);
    const a: Segment = { ...s, end: t, text: s.text.slice(0, halfText).trim() };
    const b: Segment = { ...s, start: t, text: s.text.slice(halfText).trim() };
    this.lyrics.segments.splice(this.idx, 1, a, b);
    this.onChange(this.lyrics);
    this.fill(a);
  }

  private del(): void {
    if (this.idx < 0) return;
    this.lyrics.segments.splice(this.idx, 1);
    if (this.idx >= this.lyrics.segments.length) this.idx = this.lyrics.segments.length - 1;
    this.onChange(this.lyrics);
    if (this.idx >= 0) this.fill(this.lyrics.segments[this.idx]!);
    else this.close();
  }

  private insert(dir: -1 | 1): void {
    const ref = this.idx >= 0 ? this.lyrics.segments[this.idx]! : { start: this.currentT, end: this.currentT + 2, text: "" };
    const at  = dir < 0 ? ref.start - 1 : ref.end + 0.01;
    const seg: Segment = { start: at, end: at + 2, text: "" };
    this.lyrics.segments.push(seg);
    this.lyrics = sortLyrics(this.lyrics);
    this.idx = this.lyrics.segments.findIndex(s => s === seg);
    this.fill(seg);
    this.onChange(this.lyrics);
  }
}
