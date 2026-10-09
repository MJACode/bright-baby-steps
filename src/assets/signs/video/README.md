# Baby Signs clips

Drop a file in this folder and the matching sign plays it. No edit to
`src/data/signMedia.ts`. The map is a Vite glob over this directory
(`resolveSignClip` in `src/data/signMedia.ts`).

While this folder has no clip for a slug, that sign keeps its SVG illustration,
then the emoji in `signLibrary.ts`. A clip that fails to load does the same.

## File names

| File | Field | Notes |
|---|---|---|
| `{slug}.mp4` | `video` | Preferred. H.264, no audio. Used whenever it exists |
| `{slug}.webm` | `video` | Used only when that slug has no `.mp4` |
| `{slug}-poster.webp` | `videoPoster` | Optional still, shown before play |
| `{slug}-poster.jpg` / `.jpeg` / `.png` | `videoPoster` | Used in that order when no `.webp` poster exists |

`{slug}` is the sign's slug in `src/data/signLibrary.ts` (`milk`, `all-done`,
`thank-you`). Same slugs as the SVGs next to this folder.

## Format

From `specs/001-baby-signs-v2/contracts/illustration-asset-spec.md` §4:

- 3–5 second seamless loop
- 4:3, same framing as `{slug}.svg` (the clip replaces the illustration in place)
- ≤ 600 KB per clip (`signMedia.test.ts` fails CI above that)
- No audio track

`SignIllustration` plays the clip muted, looping, inline, with controls, and
does not autoplay.

These files are bundled with the app (Vite `?url`), the same way the SVGs are.
`vite.config.ts` keeps this folder out of the asset inliner, so a clip is its
own file and is fetched when the sign sheet plays it, not copied into the
page script. They are static teaching media, not child data — do not put them
in `milestone-photos` or `feedback-screenshots`.
