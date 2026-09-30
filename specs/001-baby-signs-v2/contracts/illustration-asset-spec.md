# Designer Brief: Baby Signs Illustrations (v2)

**For**: Grace Flare's designer · **Deliverable**: 20 sign illustrations · **Blocks**: Story 1 launch (spec SC-001)

You can hand this page to the designer on its own. Engineering builds against placeholders, so final files drop in with no code change as long as they follow the naming and format rules below.

---

## 1. What each illustration must show

Each illustration is **one image per sign** that shows the whole sign: the start position, the movement, and the end position.

- **Start pose**: the hands drawn lighter, at about 35% opacity, or dashed.
- **End pose**: the hands drawn solid.
- **Motion**: 1–2 curved arrows from start to end. Use small repeat ticks (〃) for signs that tap or repeat, such as MORE, WATER, and HAPPY.
- **Framing**: the signer's head, shoulders, and hands, seen from the front, as the parent would see someone signing to them. Right hand dominant.
- Where the sign touches the body (chin, forehead, chest, lips, cheek, thigh), show that body part clearly enough to read the location.
- **Hands**: simplified but anatomically clear. Finger count and handshape must be readable at 300 px wide. The handshape is the whole point.
- **Style reference**: calm, rounded, single-weight line art with curved motion arrows, like the [How We Feel breathing step](https://mobbin.com/screens/026e6052-47e6-40b9-9066-c0857b9e0ba6). Friendly, not clinical, not cartoonish.
- **People**: use a neutral, stylized signer. If the style includes skin tone, vary it across the set.
- No text, letters, or labels inside the image. The app adds all words.

## 2. File format

| Property | Requirement |
|---|---|
| Format | **SVG**, optimized with SVGO (default preset). No `<?xml ?>` header, comments, `<style>` blocks, inline `style`/`stroke` attributes, embedded raster images, fonts, `<script>`, or external references. Colors come only from the classes in §3 |
| Canvas | `viewBox="0 0 400 300"` (4:3). Keep all important content 16 units inside the edges |
| Size | ≤ 40 KB per file after optimization |
| Line weight | 3–4 units at the 400-wide canvas, consistent across all 20 |
| Background | **Transparent.** The app places the image on a tinted card in light and dark mode |

## 3. Color: use classes, not fixed colors

The app changes color for dark mode, so the SVGs must not hard-code colors for the main parts. Use exactly these class names and leave `stroke` and `fill` unset on them:

| Element | SVG class | What the app renders |
|---|---|---|
| Body and hand outlines (end pose) | `sign-line` | Text color (dark slate in light mode, cream in dark mode) |
| Start-pose ghost | `sign-ghost` | Text color at 35% opacity |
| Motion arrows and repeat ticks | `sign-motion` | Brand accent (warm orange) |
| Optional soft fills (skin, sleeve) | `sign-fill` | Soft brand tint |

For design comps, preview with Deep Slate `hsl(240 10% 20%)` lines, Warm Orange `hsl(30 70% 55%)` arrows, and a Warm Cream `hsl(30 40% 98%)` background. Also check a dark background of about `hsl(280 30% 14%)`. Deliver the files with the class names only, not these colors.

## 4. File naming and delivery

- **Name**: `{slug}.svg`, using exactly the slugs in the table below, e.g. `all-done.svg`, `thank-you.svg`.
- **Where**: one zipped folder, or a PR adding the files to `src/assets/signs/`.
- **Also include** a 1-page contact sheet PNG of all 20 for sign-off.
- **Future video (not now)**: `{slug}.mp4` or `{slug}.webm`, 3–5 s seamless loop, 4:3, ≤ 600 KB, no audio. Same framing, so the video can replace the illustration in place.

## 5. The 20 signs

The descriptions are the app's SLP-reviewed how-to text. **The illustration must match it.** If a description seems ambiguous, ask before drawing rather than guessing.

| # | Slug (file name) | Sign | How it's made |
|---|---|---|---|
| 1 | `milk` | MILK | Open and squeeze your fist, like milking a cow. |
| 2 | `more` | MORE | Flatten your fingertips against your thumb on each hand (like two duck beaks), then tap your hands together. |
| 3 | `all-done` | ALL DONE | Hold both hands up, palms facing you, then flip them outward. |
| 4 | `eat` | EAT | Bring your flattened fingertips to your lips, like putting food in your mouth. |
| 5 | `sleep` | SLEEP | Draw your open hand down over your face, closing your fingers together as you tilt your head. |
| 6 | `bath` | BATH | Make two fists and rub them up and down on your chest. |
| 7 | `change` | CHANGE | Make two fists, knuckles touching, and twist them in opposite directions. |
| 8 | `water` | WATER | Make a W with three fingers and tap it on your chin. |
| 9 | `mommy` | MOMMY | Spread your hand wide and tap your thumb on your chin. |
| 10 | `daddy` | DADDY | Spread your hand wide and tap your thumb on your forehead. |
| 11 | `help` | HELP | Place your fist, thumb up, on your flat palm and lift both together. |
| 12 | `up` | UP | Point your index finger up and lift your hand. |
| 13 | `dog` | DOG | Pat your thigh (add a finger snap if you can). |
| 14 | `cat` | CAT | Pinch your thumb and index finger by your cheek and pull outward, like a whisker. |
| 15 | `book` | BOOK | Press your palms together, then open them like a book. |
| 16 | `ball` | BALL | Curve both hands like you're holding a ball and tap your fingertips together. |
| 17 | `happy` | HAPPY | Brush your flat hand upward on your chest, twice. |
| 18 | `gentle` | GENTLE | Softly stroke the back of one hand with the other. *(A baby-sign adaptation, not standard ASL.)* |
| 19 | `thank-you` | THANK YOU | Touch your chin with your flat hand, then move it forward toward the person. |
| 20 | `hurt` | HURT | Point your index fingers toward each other and tap them together with a little twist, near where it hurts. |

## 6. Review and acceptance

1. **First batch**: MILK, MORE, ALL DONE, and EAT, used to lock the style. Engineering checks them in the app in both light and dark mode.
2. **Full set**: all 20, plus the contact sheet.
3. **Accuracy check**: every image is checked against its how-to text by the SLP reviewer (the `slp` review agent, with founder sign-off). If an image and the text disagree, the image is fixed. The text doesn't change.
4. **Accessibility**: engineering writes the alt text, not the designer. The image must be clear without color. The arrows must read by shape as well as by orange.

**Done when**: all 20 files are named correctly, follow the classes and canvas in §2–§3, are ≤ 40 KB each, pass the SLP accuracy check, and look right in light and dark mode.
