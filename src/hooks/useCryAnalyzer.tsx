// src/hooks/useCryAnalyzer.tsx
//
// Two ways in, one analysis path:
//   * start()/stop()      — record mic audio with MediaRecorder
//   * analyzeFile(file)   — decode an audio or video file the parent picked
//
// Either way we decode to PCM, take the loudest 8s window, run feature
// extraction, and return a CryResult. All on-device — nothing is uploaded.
//
// Lifecycle: idle -> recording -> analyzing -> result -> idle
//            idle -> analyzing -> result -> idle   (file path)

import { useCallback, useRef, useState } from "react";
import {
  extractFeatures,
  classify,
  pickLoudestWindow,
  ANALYSIS_WINDOW_S,
  type CryResult,
} from "@/lib/cryFeatures";

export type AnalyzerState = "idle" | "recording" | "analyzing" | "result" | "error";
export type AnalyzerSource = "mic" | "file";

/** Bigger than this and we'd rather the parent trimmed the clip first. */
export const MAX_FILE_BYTES = 100 * 1024 * 1024;

/** Anything a browser might hand us with a blank or odd MIME type. */
const MEDIA_EXTENSIONS =
  /\.(mp3|m4a|m4b|aac|wav|wave|ogg|oga|opus|flac|weba|webm|caf|amr|aiff?|mp4|m4v|mov|3gp|3g2|mkv|avi)$/i;

export const FILE_ACCEPT = "audio/*,video/*";

interface UseCryAnalyzerOptions {
  maxDurationMs?: number; // auto-stop after this long
}

export function useCryAnalyzer({
  maxDurationMs = ANALYSIS_WINDOW_S * 1000,
}: UseCryAnalyzerOptions = {}) {
  const [state, setState] = useState<AnalyzerState>("idle");
  const [result, setResult] = useState<CryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0); // live mic level 0-1 for the UI viz
  const [elapsedMs, setElapsedMs] = useState(0);
  const [source, setSource] = useState<AnalyzerSource>("mic");
  const [fileName, setFileName] = useState<string | null>(null);
  // When the cry actually happened. "Now" for the mic; the clip's own
  // timestamp for an upload, so the history list stays honest.
  const [capturedAt, setCapturedAt] = useState<Date>(() => new Date());

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const stopTimerRef = useRef<number | null>(null);

  const cleanup = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    rafRef.current = null;
    stopTimerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      void audioContextRef.current.close();
    }
    audioContextRef.current = null;
    analyserRef.current = null;
    mediaRecorderRef.current = null;
    chunksRef.current = [];
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setResult(null);
    setLevel(0);
    setElapsedMs(0);
    setSource("mic");
    setFileName(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      chunksRef.current = [];

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = async () => {
        setState("analyzing");
        try {
          const blob = new Blob(chunksRef.current, { type: "audio/webm" });
          const r = await analyzeArrayBuffer(await blob.arrayBuffer());
          setCapturedAt(new Date());
          setResult(r);
          setState("result");
        } catch (e) {
          setError(e instanceof Error ? e.message : "Couldn't analyze audio");
          setState("error");
        } finally {
          cleanup();
        }
      };

      // Live level meter via AnalyserNode
      const ac = new AudioContext();
      audioContextRef.current = ac;
      const src = ac.createMediaStreamSource(stream);
      const analyser = ac.createAnalyser();
      analyser.fftSize = 1024;
      src.connect(analyser);
      analyserRef.current = analyser;
      const buf = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteTimeDomainData(buf);
        let peak = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = Math.abs(buf[i] - 128) / 128;
          if (v > peak) peak = v;
        }
        setLevel(peak);
        setElapsedMs(Date.now() - startedAtRef.current);
        rafRef.current = requestAnimationFrame(tick);
      };

      mr.start();
      startedAtRef.current = Date.now();
      setState("recording");
      tick();

      stopTimerRef.current = window.setTimeout(() => {
        if (mediaRecorderRef.current?.state === "recording") {
          mediaRecorderRef.current.stop();
        }
      }, maxDurationMs);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Couldn't access microphone. Please grant permission."
      );
      setState("error");
      cleanup();
    }
  }, [maxDurationMs, cleanup]);

  const stop = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  /**
   * Analyze an audio or video file straight off the parent's device. The
   * browser's own decoder pulls the audio track out of a video container, so
   * an .mp4 or .mov from the camera roll works the same as an .m4a voice memo.
   */
  const analyzeFile = useCallback(
    async (file: File) => {
      cleanup();
      setError(null);
      setResult(null);
      setLevel(0);
      setElapsedMs(0);
      setSource("file");
      setFileName(file.name);

      const looksLikeMedia =
        file.type.startsWith("audio/") ||
        file.type.startsWith("video/") ||
        MEDIA_EXTENSIONS.test(file.name);

      if (!looksLikeMedia) {
        setError("Pick an audio or video file — that one doesn't look like either.");
        setState("error");
        return;
      }

      if (file.size > MAX_FILE_BYTES) {
        setError(
          "That file is over 100 MB. Trim it down to the crying part and try again."
        );
        setState("error");
        return;
      }

      setState("analyzing");
      try {
        const r = await analyzeArrayBuffer(await file.arrayBuffer());
        setCapturedAt(fileCapturedAt(file));
        setResult(r);
        setState("result");
      } catch {
        // decodeAudioData throws for silent-video / DRM / codecs this browser
        // can't open. Nothing to retry automatically — point at what works.
        setError(
          "We couldn't read any audio from that file. Try an .m4a, .mp3, or .wav, or a video that has sound."
        );
        setState("error");
      }
    },
    [cleanup]
  );

  const reset = useCallback(() => {
    cleanup();
    setState("idle");
    setResult(null);
    setError(null);
    setLevel(0);
    setElapsedMs(0);
    setSource("mic");
    setFileName(null);
  }, [cleanup]);

  return {
    state,
    result,
    error,
    level,
    elapsedMs,
    source,
    fileName,
    capturedAt,
    isRecording: state === "recording",
    start,
    stop,
    analyzeFile,
    reset,
  };
}

/** Decode → mono → loudest window → features → bucket. Shared by both inputs. */
async function analyzeArrayBuffer(data: ArrayBuffer): Promise<CryResult> {
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData(data);
    const samples =
      decoded.numberOfChannels > 1 ? mixDownToMono(decoded) : decoded.getChannelData(0);
    const window = pickLoudestWindow(samples, decoded.sampleRate);
    return classify(extractFeatures(window, decoded.sampleRate));
  } finally {
    if (ctx.state !== "closed") void ctx.close();
  }
}

/**
 * A clip's mtime is usually when it was recorded. Reject stamps we can't
 * trust — pickers that rewrite it to "now" on copy, or anything in the
 * future — and fall back to the moment of analysis.
 */
function fileCapturedAt(file: File): Date {
  const now = Date.now();
  const oneYearMs = 365 * 24 * 60 * 60 * 1000;
  const modified = file.lastModified;
  if (!modified || modified > now || now - modified > oneYearMs) return new Date(now);
  return new Date(modified);
}

function mixDownToMono(buf: AudioBuffer): Float32Array {
  const len = buf.length;
  const out = new Float32Array(len);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) out[i] += data[i];
  }
  for (let i = 0; i < len; i++) out[i] /= buf.numberOfChannels;
  return out;
}
