/**
 * Shared Web Audio graph for the <audio> element.
 *
 * Why this exists: createMediaElementSource() may only be called ONCE per
 * HTMLMediaElement. main.ts wants an AnalyserNode (for --bass / --energy CSS
 * vars) and the recorder wants a MediaStreamAudioDestinationNode (for
 * MediaRecorder). Both must share the same source node, otherwise the second
 * caller throws InvalidStateError and export crashes.
 *
 *      src ─┬─▶ analyser ─▶ ctx.destination   (audible + frequency data)
 *           └─▶ streamDest                    (recorder track)
 */

let _ctx: AudioContext | null = null;
let _src: MediaElementAudioSourceNode | null = null;
let _analyser: AnalyserNode | null = null;
let _streamDest: MediaStreamAudioDestinationNode | null = null;
let _data: Uint8Array<ArrayBuffer> | null = null;

export type AudioGraph = {
  ctx: AudioContext;
  analyser: AnalyserNode;
  streamDest: MediaStreamAudioDestinationNode;
  /** Pre-allocated buffer matching analyser.frequencyBinCount. Backed by
   *  ArrayBuffer (not SharedArrayBuffer) so it matches the AnalyserNode API. */
  data: Uint8Array<ArrayBuffer>;
};

export const getAudioGraph = (audio: HTMLAudioElement): AudioGraph => {
  if (!_ctx) {
    _ctx        = new AudioContext();
    _src        = _ctx.createMediaElementSource(audio);
    _analyser   = _ctx.createAnalyser();
    _analyser.fftSize = 256;
    _analyser.smoothingTimeConstant = 0.7;
    _streamDest = _ctx.createMediaStreamDestination();

    _src.connect(_analyser);
    _analyser.connect(_ctx.destination);  // audible
    _src.connect(_streamDest);            // capturable

    // Force ArrayBuffer (not SharedArrayBuffer) so the array type narrows to
    // Uint8Array<ArrayBuffer>, matching analyser.getByteFrequencyData()'s sig.
    _data = new Uint8Array(new ArrayBuffer(_analyser.frequencyBinCount));
  }
  return {
    ctx: _ctx,
    analyser: _analyser!,
    streamDest: _streamDest!,
    data: _data!,
  };
};

/** Some browsers leave the context suspended after construction. */
export const resumeAudioGraph = async (): Promise<void> => {
  if (_ctx && _ctx.state === "suspended") await _ctx.resume();
};
