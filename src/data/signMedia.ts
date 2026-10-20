import { SIGN_LIBRARY } from "@/data/signLibrary";

export type SignMedia = {
  /** Raw SVG markup from src/assets/signs/{slug}.svg, or null until the file is delivered */
  illustration: string | null;
  /** Describes how to make the sign (FR-002). Read by VoiceOver in place of the image */
  illustrationAlt: string;
  /**
   * Bundled clip URL for this slug (`src/assets/signs/video/{slug}.mp4`, else `.webm`).
   * Omitted when that file is not in the build, so the illustration / emoji still show.
   */
  video?: string;
  /**
   * Optional still (`{slug}-poster.webp`, else jpg / jpeg / png). `<video poster>` needs
   * an image URL, so this is never the raw SVG. Omitted when no poster file is bundled.
   */
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

/** Drop-in folder. Adding `{slug}.mp4` (or `.webm`) is enough — no edit here. */
export const SIGN_VIDEO_DIR = "/src/assets/signs/video";

// mp4 first: the Capacitor iOS shell is WKWebView, which plays H.264 reliably.
// WebM is used only when that slug has no mp4. Poster: smallest still first.
const VIDEO_EXTENSIONS = ["mp4", "webm"] as const;
const POSTER_EXTENSIONS = ["webp", "jpg", "jpeg", "png"] as const;

// Patterns are literals on purpose — Vite only analyzes static globs.
// An empty folder yields {}. See src/assets/signs/video/README.md.
const CLIP_ASSETS = import.meta.glob<string>(
  [
    "/src/assets/signs/video/*.mp4",
    "/src/assets/signs/video/*.webm",
    "/src/assets/signs/video/*-poster.webp",
    "/src/assets/signs/video/*-poster.jpg",
    "/src/assets/signs/video/*-poster.jpeg",
    "/src/assets/signs/video/*-poster.png",
  ],
  { query: "?url", import: "default", eager: true },
);

function firstBundled(slug: string, suffix: string, extensions: readonly string[], assets: Record<string, string>) {
  for (const ext of extensions) {
    const url = assets[`${SIGN_VIDEO_DIR}/${slug}${suffix}.${ext}`];
    if (url) return url;
  }
  return undefined;
}

/**
 * Map a sign slug to clip and poster URLs. `assets` is the Vite `?url` glob
 * (or a test double). A missing file leaves that field off the result.
 */
export function resolveSignClip(slug: string, assets: Record<string, string>): Pick<SignMedia, "video" | "videoPoster"> {
  const video = firstBundled(slug, "", VIDEO_EXTENSIONS, assets);
  const videoPoster = firstBundled(slug, "-poster", POSTER_EXTENSIONS, assets);
  return {
    ...(video ? { video } : {}),
    ...(videoPoster ? { videoPoster } : {}),
  };
}

// The alt text is built from the SLP-vetted howTo so the two can never drift.
export const SIGN_MEDIA: Record<string, SignMedia> = Object.fromEntries(
  SIGN_LIBRARY.map((sign) => [
    sign.slug,
    {
      illustration: ILLUSTRATIONS[`/src/assets/signs/${sign.slug}.svg`] ?? null,
      illustrationAlt: `How to sign ${sign.label.toUpperCase()}: ${sign.howTo}`,
      ...resolveSignClip(sign.slug, CLIP_ASSETS),
    },
  ]),
);
