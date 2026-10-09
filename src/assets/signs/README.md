# Baby Signs illustrations

One SVG per sign, named `{slug}.svg`, where `{slug}` is the sign's `slug` in
`src/data/signLibrary.ts` (for example `all-done.svg`, `thank-you.svg`).

The format, color classes (`sign-line`, `sign-ghost`, `sign-motion`,
`sign-fill`), and safety rules are in
[`specs/001-baby-signs-v2/contracts/illustration-asset-spec.md`](../../../specs/001-baby-signs-v2/contracts/illustration-asset-spec.md).

`src/test/signMedia.test.ts` fails CI unless every file here:

- is well-formed SVG that renders to exactly one `<svg>` with `viewBox="0 0 400 300"`
- uses only `svg`, `g`, `path`, `circle`, `ellipse`, `line`, `polyline`, `polygon`,
  `rect`, `title`, `desc` elements and geometry attributes (no `style`, `stroke`,
  `href`, or `on*` attributes; `fill` may only be `"none"`)
- uses only the classes `sign-line`, `sign-ghost`, `sign-motion`, `sign-fill`
- contains no `<?xml ?>` header, comments, CDATA, or `<style>` block

Run files through SVGO (default preset) before adding them; that strips the
header and comments.

## Video clips

Looping Sign-Speak clips do not go in this folder next to the SVGs. Drop them
in [`video/`](./video/README.md) as `{slug}.mp4` (or `{slug}.webm`). Until a
clip is there, the sign keeps this SVG, then the emoji.
