type Cb = (t: number) => void;

export class Transport {
  private root: HTMLElement;
  private btnPlay: HTMLButtonElement;
  private btnStop: HTMLButtonElement;
  private elCur: HTMLElement;
  private elDur: HTMLElement;
  private bar:   HTMLElement;
  private fill:  HTMLElement;

  onPlayPause: () => void = () => {};
  onStop: () => void = () => {};
  onSeek: Cb = () => {};

  constructor(audio: HTMLAudioElement) {
    this.root    = document.getElementById("transport")!;
    this.btnPlay = document.getElementById("playBtn") as HTMLButtonElement;
    this.btnStop = document.getElementById("stopBtn") as HTMLButtonElement;
    this.elCur   = document.getElementById("timeCur")!;
    this.elDur   = document.getElementById("timeDur")!;
    this.bar     = document.getElementById("seekBar")!;
    this.fill    = document.getElementById("seekFill")!;

    this.btnPlay.addEventListener("click", () => this.onPlayPause());
    this.btnStop.addEventListener("click", () => this.onStop());
    this.bar.addEventListener("click", (e) => {
      const r = this.bar.getBoundingClientRect();
      const ratio = (e.clientX - r.left) / r.width;
      const dur = audio.duration || 0;
      this.onSeek(Math.max(0, Math.min(dur, ratio * dur)));
    });

    audio.addEventListener("timeupdate", () => this.tick(audio.currentTime, audio.duration || 0));
    audio.addEventListener("loadedmetadata", () => this.tick(0, audio.duration || 0));
    audio.addEventListener("play", () => this.btnPlay.textContent = "⏸");
    audio.addEventListener("pause", () => this.btnPlay.textContent = "▶");
  }

  show(): void { this.root.classList.remove("hidden"); }
  hide(): void { this.root.classList.add("hidden"); }

  private tick(cur: number, dur: number): void {
    this.elCur.textContent = fmt(cur);
    this.elDur.textContent = fmt(dur);
    this.fill.style.width = dur > 0 ? `${(cur / dur) * 100}%` : "0%";
  }
}

const fmt = (t: number): string => {
  if (!Number.isFinite(t)) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t - m * 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};
