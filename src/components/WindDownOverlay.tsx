import { useEffect, useState } from "react";

export function WindDownOverlay({ onClose }: { onClose: () => void }) {
  const [secs, setSecs] = useState(30);
  useEffect(() => {
    if (secs <= 0) return;
    const t = setTimeout(() => setSecs((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secs]);
  return (
    <div className="fixed inset-0 z-50 bg-sleep/95 flex flex-col items-center justify-center text-white">
      <div className="relative w-48 h-48 flex items-center justify-center">
        <div className="absolute inset-0 rounded-full bg-white/10 animate-pulse-slow" />
        <span className="text-6xl font-display font-bold">{secs > 0 ? secs : "Now"}</span>
      </div>
      <p className="mt-8 text-lg font-display max-w-xs text-center">
        {secs > 0 ? "Breathe slow. Dim the lights." : "Lay them down."}
      </p>
      <button
        className="mt-12 text-sm underline opacity-70 touch-target px-4"
        onClick={onClose}
        aria-label="Close wind-down overlay"
      >
        Close
      </button>
      <style>{`@keyframes pulseSlow { 0%,100% {transform:scale(1);opacity:.6} 50% {transform:scale(1.15);opacity:.3} }
        .animate-pulse-slow { animation: pulseSlow 4s ease-in-out infinite; }`}</style>
    </div>
  );
}
