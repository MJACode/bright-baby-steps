import type { ReactNode } from "react";
import type { ServeShape } from "@/lib/foodCatalog";
import { cn } from "@/lib/utils";

// Line art for the "How to serve" sheet. Strokes are currentColor and fills
// are brand tokens, so each drawing follows light and dark themes. Decorative
// only: the SERVE_SHAPE_* caption next to it carries the meaning.
// Dashed outlines are references (a finger, the food before it's cut), never
// food. They draw in full foreground so they hold up on the dark theme; the
// dash, not a fade, is what marks them as a reference.

const FOOD = "fill-feeding/30";
const REFERENCE = "fill-none stroke-foreground";
const UTENSIL = "fill-muted";

function Arrow({ x1, x2, y }: { x1: number; x2: number; y: number }) {
  return <path d={`M${x1} ${y} H${x2} M${x2 - 7} ${y - 6} L${x2} ${y} L${x2 - 7} ${y + 6}`} className="fill-none" />;
}

/**
 * Two adult fingers held together, seen from above with the tips at the
 * right-hand end: the size reference. One outline and one divider, so the
 * seam doesn't draw as a doubled line.
 */
function TwoFingers({ x, y, length, width }: { x: number; y: number; length: number; width: number }) {
  const r = width / 2;
  const end = x + length - r;
  return (
    <path
      d={`M${x} ${y} H${end} A${r} ${r} 0 0 1 ${end} ${y + width} A${r} ${r} 0 0 1 ${end} ${y + 2 * width} H${x} M${x} ${y + width} H${end}`}
      className={REFERENCE}
      strokeDasharray="4 3"
    />
  );
}

/** A fingertip pressing down from above, ending at `bottom`: the softness cue. */
function Fingertip({ x, bottom }: { x: number; bottom: number }) {
  return <path d={`M${x} 2 V${bottom - 10} A10 10 0 0 0 ${x + 20} ${bottom - 10} V2`} className={REFERENCE} strokeDasharray="4 3" />;
}

// One lengthwise grape quarter seen from the side: a flat cut face (the
// straight edge) and a curved skin side, pointed at both ends.
const WEDGE = "M-4.5 -27 C7.5 -14 7.5 14 -4.5 27 Z";

const SHAPES: Record<ServeShape, ReactNode> = {
  // A flat soft-cooked strip with gently rounded corners, dented by a
  // fingertip to show it squishes, above two adult fingers held together that
  // match its length and width.
  spear: (
    <>
      <Fingertip x={89} bottom={38} />
      <path
        d="M34 34 H89 Q99 43 109 34 H126 Q130 34 130 38 V54 Q130 58 126 58 H34 Q30 58 30 54 V38 Q30 34 34 34 Z"
        className={FOOD}
      />
      <TwoFingers x={30} y={65} length={100} width={12} />
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
      <circle cx="34" cy="52" r="16" className={REFERENCE} strokeDasharray="4 3" />
      <Arrow x1={58} x2={86} y={52} />
      <ellipse cx="124" cy="66" rx="28" ry="8" className={FOOD} />
      <path d="M112 50 V62 M120 50 V62 M128 50 V62 M136 50 V62 M112 50 H136 M124 50 V22" className="fill-none" />
    </>
  ),
  // One whole grape, then that grape cut lengthwise into four narrow wedges,
  // fanned out and spaced well apart so the group can't read as round.
  quartered: (
    <>
      <ellipse cx="26" cy="52" rx="13" ry="24" className={FOOD} />
      <path d="M26 28 q2 -7 6 -9" className="fill-none" />
      <Arrow x1={47} x2={71} y={52} />
      {[
        [92, -10], [111, -4], [130, 4], [149, 10],
      ].map(([cx, angle]) => (
        <path key={cx} d={WEDGE} transform={`translate(${cx} 52) rotate(${angle})`} className={FOOD} />
      ))}
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
      <g strokeDasharray="4 3">
        <path d="M100 8 V56 A12 12 0 0 0 124 56 V8" className={REFERENCE} />
        <path d="M106 54 Q112 62 118 54" className={REFERENCE} />
      </g>
    </>
  ),
  // A baby's open hand (dashed) beside one soft, uneven chunk about the size
  // of that palm, flaking where it was pulled apart and dented by a fingertip
  // so it reads soft.
  "palm-chunk": (
    <>
      <g strokeDasharray="4 3">
        <path d="M24 56 C22 76 34 88 48 88 C62 88 72 78 70 58 L70 44" className={REFERENCE} />
        <path d="M24 56 L24 34 A4.5 4.5 0 0 1 33 34 L33 52 M33 32 L33 26 A4.5 4.5 0 0 1 42 26 L42 50 M42 26 L42 24 A4.5 4.5 0 0 1 51 24 L51 50 M51 28 A4.5 4.5 0 0 1 60 28 L60 52" className={REFERENCE} />
        <path d="M70 44 C74 38 82 40 80 48 L72 64" className={REFERENCE} />
      </g>
      <path
        d="M98 48 C96 36 104 30 112 32 Q122 42 132 32 C142 32 148 42 142 52 C150 62 140 80 126 76 C116 84 98 80 100 68 C90 64 92 54 98 48 Z"
        className={FOOD}
      />
      <Fingertip x={112} bottom={37} />
      <path d="M108 50 q8 5 15 -1 M110 63 q10 4 19 -3" className="fill-none" />
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
