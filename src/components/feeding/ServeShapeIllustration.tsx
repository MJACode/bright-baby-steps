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

/** An adult finger seen from above, nail at the right-hand end: the size reference. */
function Finger({ x, y, length, width }: { x: number; y: number; length: number; width: number }) {
  const r = width / 2;
  return (
    <g strokeDasharray="4 3">
      <path
        d={`M${x} ${y} H${x + length - r} A${r} ${r} 0 0 1 ${x + length - r} ${y + width} H${x}`}
        className={REFERENCE}
      />
      <rect x={x + length - r - 5} y={y + 3} width={6} height={width - 6} rx={2} className={REFERENCE} strokeDasharray="none" />
    </g>
  );
}

const SHAPES: Record<ServeShape, ReactNode> = {
  // Two adult fingers held together, then one soft-cooked strip as long and
  // as wide as them, rounded at the ends and sagging as soft food does.
  spear: (
    <>
      <Finger x={26} y={6} length={108} width={13} />
      <Finger x={26} y={20} length={108} width={13} />
      <path d="M37 55 Q80 66 123 55 A11.5 11.5 0 0 1 123 78 Q80 89 37 78 A11.5 11.5 0 0 1 37 55 Z" className={FOOD} />
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
  // One whole grape, then that same grape cut along its length into four
  // quarters, pulled apart so every cut shows and no piece stays round.
  quartered: (
    <>
      <ellipse cx="32" cy="52" rx="15" ry="25" className={FOOD} />
      <path d="M32 27 q2 -7 6 -9" className="fill-none" />
      <Arrow x1={56} x2={82} y={52} />
      <path d="M104 22.3 A20 32 0 0 0 104 77.7 Z" className={FOOD} />
      <path d="M108 22.3 A20 32 0 0 1 118 18 L118 82 A20 32 0 0 1 108 77.7 Z" className={FOOD} />
      <path d="M122 18 A20 32 0 0 1 132 22.3 L132 77.7 A20 32 0 0 1 122 82 Z" className={FOOD} />
      <path d="M136 22.3 A20 32 0 0 1 136 77.7 Z" className={FOOD} />
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
  // of that palm: big enough to hold in a fist, flaking where it was pulled apart.
  "palm-chunk": (
    <>
      <g strokeDasharray="4 3">
        <path d="M24 56 C22 76 34 88 48 88 C62 88 72 78 70 58 L70 44" className={REFERENCE} />
        <path d="M24 56 L24 34 A4.5 4.5 0 0 1 33 34 L33 52 M33 32 L33 26 A4.5 4.5 0 0 1 42 26 L42 50 M42 26 L42 24 A4.5 4.5 0 0 1 51 24 L51 50 M51 28 A4.5 4.5 0 0 1 60 28 L60 52" className={REFERENCE} />
        <path d="M70 44 C74 38 82 40 80 48 L72 64" className={REFERENCE} />
      </g>
      <path
        d="M98 48 C96 34 112 28 122 34 C134 30 146 40 142 52 C150 62 140 80 126 76 C116 84 98 80 100 68 C90 64 92 54 98 48 Z"
        className={FOOD}
      />
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
