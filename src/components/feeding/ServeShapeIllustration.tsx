import type { ReactNode } from "react";
import type { ServeShape } from "@/lib/foodCatalog";
import { cn } from "@/lib/utils";

// Line art for the "How to serve" sheet. Strokes are currentColor and fills
// are brand tokens, so each drawing follows light and dark themes. Decorative
// only: the SERVE_SHAPE_* caption next to it carries the meaning.
// Dashed outlines are references (a finger, the food before it's cut), never food.

const FOOD = "fill-feeding/30";
const REFERENCE = "fill-none";
const UTENSIL = "fill-muted";

function Arrow({ x1, x2, y }: { x1: number; x2: number; y: number }) {
  return <path d={`M${x1} ${y} H${x2} M${x2 - 7} ${y - 6} L${x2} ${y} L${x2 - 7} ${y + 6}`} className="fill-none" />;
}

/** A finger seen from above, nail at the right-hand end: the size reference. */
function Finger({ x, y, length, width }: { x: number; y: number; length: number; width: number }) {
  const r = width / 2;
  return (
    <g className="opacity-70" strokeDasharray="4 4">
      <path
        d={`M${x} ${y} H${x + length - r} A${r} ${r} 0 0 1 ${x + length - r} ${y + width} H${x}`}
        className={REFERENCE}
      />
      <rect x={x + length - r - 9} y={y + 3} width={9} height={width - 6} rx={3} className={REFERENCE} />
    </g>
  );
}

const SHAPES: Record<ServeShape, ReactNode> = {
  // Two adult fingers, then a soft strip of the same size that sags as it bends.
  spear: (
    <>
      <Finger x={24} y={4} length={110} width={14} />
      <Finger x={24} y={26} length={110} width={14} />
      <path d="M24 56 C56 48 100 50 134 62 L132 92 C100 80 58 78 26 86 Z" className={FOOD} />
      <path d="M56 64 q4 5 0 10 M80 63 q4 5 0 10 M104 66 q4 5 0 10" className="fill-none opacity-60" />
    </>
  ),
  // A bowl of smooth mash with a spoon resting in it.
  mash: (
    <>
      <path d="M24 46 H136 C132 78 110 92 80 92 C50 92 28 78 24 46 Z" className={UTENSIL} />
      <path d="M34 46 C44 34 58 40 68 34 C80 28 92 40 104 34 C114 30 124 38 126 46 Z" className={FOOD} />
      <path d="M112 36 L150 8" className="fill-none" />
      <ellipse cx="108" cy="40" rx="11" ry="7" transform="rotate(-35 108 40)" className={UTENSIL} />
    </>
  ),
  // A loaded spoon held out by its handle, bowl first toward the baby.
  "pre-loaded-spoon": (
    <>
      <path d="M24 84 L96 42" className="fill-none" strokeWidth={6} />
      <ellipse cx="114" cy="32" rx="22" ry="13" transform="rotate(-30 114 32)" className={UTENSIL} />
      <path d="M98 36 C102 24 118 18 128 22 C132 28 126 38 112 42 Z" className={FOOD} />
      <path d="M142 46 q6 6 4 14 M150 40 q8 8 6 20" className="fill-none opacity-60" />
    </>
  ),
  // Small, moist crumbles heaped on a plate.
  ground: (
    <>
      <ellipse cx="80" cy="76" rx="64" ry="14" className={UTENSIL} />
      <path d="M44 72 C52 52 68 44 80 44 C94 44 108 54 116 72 Z" className={FOOD} />
      {[
        [56, 64], [66, 56], [76, 50], [88, 52], [98, 60], [106, 68], [70, 66], [84, 62], [94, 70], [60, 72], [78, 72],
      ].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={2.2} stroke="none" className="fill-feeding/70" />
      ))}
    </>
  ),
  // A thin, even layer on a flat base, with the knife that spread it.
  "thin-spread": (
    <>
      <rect x="18" y="52" width="110" height="28" rx="6" className={UTENSIL} />
      <path d="M22 52 C40 48 60 50 78 49 C96 48 112 50 124 52 L124 57 C108 56 92 55 76 56 C58 57 40 56 22 57 Z" className={FOOD} />
      <path d="M84 44 L140 22 C146 20 148 28 142 30 L90 50 Z" className={UTENSIL} />
    </>
  ),
  // A round food (dashed, before) pressed flat with a fork.
  flattened: (
    <>
      <circle cx="34" cy="52" r="16" className={REFERENCE} strokeDasharray="4 4" />
      <Arrow x1={58} x2={86} y={52} />
      <ellipse cx="124" cy="66" rx="28" ry="8" className={FOOD} />
      <path d="M112 50 V62 M120 50 V62 M128 50 V62 M136 50 V62 M112 50 H136 M124 50 V22" className="fill-none" />
    </>
  ),
  // A round food (dashed, before) cut along its length into four long slivers.
  quartered: (
    <>
      <ellipse cx="30" cy="50" rx="13" ry="26" className={REFERENCE} strokeDasharray="4 4" />
      <path d="M30 22 V78" className="fill-none opacity-60" strokeDasharray="3 3" />
      <Arrow x1={54} x2={80} y={50} />
      <path d="M92 24 C102 34 102 66 92 76 Z" className={FOOD} />
      <path d="M114 24 C104 34 104 66 114 76 Z" className={FOOD} />
      <path d="M124 24 C134 34 134 66 124 76 Z" className={FOOD} />
      <path d="M146 24 C136 34 136 66 146 76 Z" className={FOOD} />
    </>
  ),
  // Small soft pieces, one squished under a fingertip to show the size and give.
  "bite-size": (
    <>
      {[
        [18, 30], [42, 22], [30, 56], [56, 48], [72, 70], [20, 78],
      ].map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="13" height="13" rx="4" className={FOOD} />
      ))}
      <ellipse cx="112" cy="74" rx="11" ry="5" className={FOOD} />
      <g className="opacity-70" strokeDasharray="4 4">
        <path d="M100 8 V56 A12 12 0 0 0 124 56 V8" className={REFERENCE} />
        <path d="M106 54 Q112 62 118 54" className={REFERENCE} />
      </g>
    </>
  ),
};

export function ServeShapeIllustration({ shape, className }: { shape: ServeShape; className?: string }) {
  return (
    <svg
      viewBox="0 0 160 100"
      aria-hidden="true"
      focusable="false"
      data-shape={shape}
      className={cn("h-24 w-auto text-foreground/80", className)}
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {SHAPES[shape]}
    </svg>
  );
}
