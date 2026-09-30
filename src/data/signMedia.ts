import { SIGN_LIBRARY } from "@/data/signLibrary";

export type SignMedia = {
  /** Raw SVG markup from src/assets/signs/{slug}.svg, or null until the file is delivered */
  illustration: string | null;
  /** Describes how to make the sign (FR-002). Read by VoiceOver in place of the image */
  illustrationAlt: string;
  /** Future: a muted, looping clip that takes the illustration's place (FR-003, FR-005) */
  video?: string;
  /** Future: defaults to the illustration */
  videoPoster?: string;
};

// Bundled and trusted: these files ship with the app, and signMedia.test.ts
// fails unless each is well-formed XML and, in the tree innerHTML builds from
// it, is exactly one <svg viewBox="0 0 400 300"> containing only allowlisted
// SVG shape elements and attributes, no style attribute, fill only "none",
// class tokens only sign-line/ghost/motion/fill, and no comment, processing
// instruction, or CDATA node.
// Raw markup rather than a URL so the sign-* classes pick up theme tokens.
const ILLUSTRATIONS = import.meta.glob<string>("/src/assets/signs/*.svg", {
  query: "?raw",
  import: "default",
  eager: true,
});

// The alt text is built from the SLP-vetted howTo so the two can never drift.
export const SIGN_MEDIA: Record<string, SignMedia> = Object.fromEntries(
  SIGN_LIBRARY.map((sign) => [
    sign.slug,
    {
      illustration: ILLUSTRATIONS[`/src/assets/signs/${sign.slug}.svg`] ?? null,
      illustrationAlt: `How to sign ${sign.label.toUpperCase()}: ${sign.howTo}`,
    },
  ]),
);
