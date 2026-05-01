// src/hooks/useCryAnalyzer.tsx
//
// Records mic audio with MediaRecorder, decodes it, runs feature extraction
// on the buffer, returns a CryResult. All on-device.
//
// Lifecycle: idle -> recording -> analyzing -> result -> idle

import { useCallback, useRef, useState } from "react";
import { extractFeatures, classify, type CryResult } from "@/lib/cryFeatures";

export type AnalyzerState = "idle" | "recording" | "analyzing" | "result" | "error";

interface UseCryAnalyzerOptions {
  maxDurationMs?: number; // auto-stop after this long
}

export function useCryAnalyzer({ maxDurationMs = 8000 }: UseCryAnalyzerOptions = {}) {
  const [state, setState] = useState<AnalyzerState>("idle");
  const [result, setResult] = useState<CryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0); // live mic level 0-1 for the UI viz
  const [elapsedMs, setElapsedMs] = useState(0);

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
          const ab = await blob.arrayBuffer();
          const ctx = new AudioContext();
          const decoded = await ctx.decodeAudioData(ab);
          await ctx.close();

          // Mix to mono if needed
          const samples =
            decoded.numberOfChannels > 1
              ? mixDownToMono(decoded)
              : decoded.getChannelData(0);

          const features = extractFeatures(samples, decoded.sampleRate);
          const r = classify(features);
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

  const reset = useCallback(() => {
    cleanup();
    setState("idle");
    setResult(null);
    setError(null);
    setLevel(0);
    setElapsedMs(0);
  }, [cleanup]);

  return {
    state,
    result,
    error,
    level,
    elapsedMs,
    isRecording: state === "recording",
    start,
    stop,
    reset,
  };
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
