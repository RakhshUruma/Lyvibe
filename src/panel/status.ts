import type { StatusReport, SourceStatus } from "../mood/dispatcher";
import type { ASRStatus } from "../asr/dispatcher";

export const setMoodStatus = (s: StatusReport): void => {
  setOne("anthropic",  s.anthropic);
  setOne("relay",      s.relay);
  setOne("gemini-mood",s.gemini);
};

export const setAsrStatus = (s: ASRStatus): void => {
  setOne("openai",      s.openai);
  setOne("gemini-asr",  s.gemini);
  setOne("assemblyai",  s.assemblyai);
};

export const setMcpStatus = (ok: boolean): void =>
  setOne("mcp", ok ? "ok" : "err");

const setOne = (src: string, status: SourceStatus): void => {
  const el = document.querySelector<HTMLElement>(`[data-src="${src}"]`);
  if (!el) return;
  el.classList.remove("ok", "err", "busy");
  if (status === "ok" || status === "err" || status === "busy") {
    el.classList.add(status);
  }
  const sym = status === "ok" ? "✓" : status === "err" ? "✗" : status === "busy" ? "◐" : "?";
  el.textContent = el.textContent!.replace(/[?✓✗◐]\s*$/, "").trim() + ` ${sym}`;
};

export const setMessage = (msg: string, kind: "ok" | "err" | "busy" | "" = ""): void => {
  const el = document.getElementById("statusMsg")!;
  el.textContent = msg;
  el.classList.remove("ok", "err", "busy");
  if (kind) el.classList.add(kind);
};

export const emphasizePasteMood = (on: boolean): void => {
  document.getElementById("pasteMoodSummary")?.classList.toggle("error-emph", on);
};
