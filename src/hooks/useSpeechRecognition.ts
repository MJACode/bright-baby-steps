import { useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { SpeechRecognition } from "@capacitor-community/speech-recognition";

interface UseSpeechRecognitionOptions {
  onResult: (transcript: string) => void;
  onInterim?: (transcript: string) => void;
}

/**
 * Unified speech recognition hook.
 * Uses the Capacitor community plugin on iOS (WKWebView doesn't support Web Speech API).
 * Falls back to the Web Speech API in the browser.
 */
export function useSpeechRecognition({ onResult, onInterim }: UseSpeechRecognitionOptions) {
  const [isListening, setIsListening] = useState(false);
  const webRecognitionRef = useRef<any>(null);

  const isSupported = Capacitor.isNativePlatform()
    ? true // plugin always available on native
    : typeof window !== "undefined" &&
      ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const start = async () => {
    if (isListening) return;

    if (Capacitor.isNativePlatform()) {
      const { available } = await SpeechRecognition.available();
      if (!available) return;

      const permission = await SpeechRecognition.requestPermissions();
      if (permission.speechRecognition !== "granted") return;

      setIsListening(true);

      let finalTranscript = "";

      await SpeechRecognition.removeAllListeners();

      SpeechRecognition.addListener("partialResults", (data: { matches: string[] }) => {
        finalTranscript = data.matches?.[0] ?? "";
        onInterim?.(finalTranscript);
      });

      SpeechRecognition.addListener("listeningState", async (data: { status: string }) => {
        if (data.status === "stopped") {
          setIsListening(false);
          if (finalTranscript.trim()) onResult(finalTranscript.trim());
          await SpeechRecognition.removeAllListeners();
        }
      });

      await SpeechRecognition.start({
        language: "en-US",
        maxResults: 1,
        popup: false,
        partialResults: true,
      });
    } else {
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SR) return;

      const recognition = new SR();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = "en-US";
      webRecognitionRef.current = recognition;

      let finalTranscript = "";

      recognition.onresult = (event: any) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const t = event.results[i][0].transcript;
          if (event.results[i].isFinal) finalTranscript += t;
          else interim += t;
        }
        onInterim?.(finalTranscript + interim);
      };

      recognition.onend = () => {
        setIsListening(false);
        if (finalTranscript.trim()) onResult(finalTranscript.trim());
      };

      recognition.onerror = () => setIsListening(false);

      recognition.start();
      setIsListening(true);
    }
  };

  const stop = async () => {
    if (!isListening) return;
    if (Capacitor.isNativePlatform()) {
      await SpeechRecognition.stop();
      // listeningState listener sets isListening to false
    } else {
      webRecognitionRef.current?.stop();
    }
  };

  return { isListening, isSupported, start, stop };
}
