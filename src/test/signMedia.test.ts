import fs from "node:fs";
import nodePath from "node:path";
import { fileURLToPath } from "node:url";

import { SIGN_LIBRARY } from "@/data/signLibrary";
import { SIGN_MEDIA, SIGN_VIDEO_DIR, resolveSignClip } from "@/data/signMedia";

const SVGS = import.meta.glob<string>("/src/assets/signs/*.svg", {
  query: "?raw",
  import: "default",
  eager: true,
});

const svgEntries = Object.entries(SVGS).map(([path, markup]) => [path.split("/").pop()!, markup] as const);

const SVG_NS = "http://www.w3.org/2000/svg";

// These files are rendered inline with dangerouslySetInnerHTML, so this
// allowlist is the gate that keeps that safe when the designer's files replace
// the placeholders. It is an allowlist on purpose: a denylist of regexes was
// bypassed by `<img/src=x/onerror=…>`, `<style>`, and `<set attributeName="href">`.
const ALLOWED_ELEMENTS = new Set([
  "svg",
  "g",
  "path",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "rect",
  "title",
  "desc",
]);

const ALLOWED_ATTRIBUTES = new Set([
  "xmlns",
  "viewBox",
  "class",
  "d",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "width",
  "height",
  "points",
  "transform",
  "fill",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray",
  "opacity",
]);

const ALLOWED_CLASS = /^sign-(line|ghost|motion|fill)$/;
const TEXT_PARENTS = new Set(["title", "desc"]);

// Applies the element, namespace, attribute, class, and fill rules to `root`
// and everything under it, and rejects any node that isn't an element or text.
function treeProblems(root: Element): string[] {
  const problems: string[] = [];
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const parent = node.parentNode as Element | null;
      if (node.textContent?.trim() && !(parent && TEXT_PARENTS.has(parent.localName))) {
        problems.push(`text outside <title>/<desc>`);
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      // Comments, processing instructions, and CDATA are where XML and HTML
      // parsers disagree, which is how markup hides from one and runs in the other.
      problems.push(`${node.nodeName} node`);
      return;
    }
    const el = node as Element;
    if (el.namespaceURI !== SVG_NS || !ALLOWED_ELEMENTS.has(el.localName)) {
      problems.push(`element <${el.nodeName}>`);
    }
    for (const attr of Array.from(el.attributes)) {
      if (!ALLOWED_ATTRIBUTES.has(attr.name)) {
        problems.push(`attribute ${attr.name} on <${el.nodeName}>`);
      } else if (attr.name === "xmlns" && attr.value !== SVG_NS) {
        problems.push(`xmlns="${attr.value}"`);
      } else if (attr.name === "fill" && attr.value !== "none") {
        // Colour comes from the sign-* classes (asset spec §3), never the file.
        problems.push(`fill="${attr.value}" on <${el.nodeName}>`);
      } else if (attr.name === "class") {
        for (const token of attr.value.split(/\s+/).filter(Boolean)) {
          if (!ALLOWED_CLASS.test(token)) problems.push(`class "${token}" on <${el.nodeName}>`);
        }
      }
    }
    el.childNodes.forEach(visit);
  };
  visit(root);
  return problems;
}

/**
 * Every reason `markup` isn't a safe, theme-able sign illustration. Empty
 * means it passes. The markup is checked twice: as XML for well-formedness,
 * and as the tree innerHTML actually builds, since that is what renders.
 */
function svgProblems(markup: string): string[] {
  const xml = new DOMParser().parseFromString(markup, "image/svg+xml");
  if (xml.getElementsByTagName("parsererror").length > 0) return ["not well-formed XML"];
  const problems = treeProblems(xml.documentElement).map((p) => `xml: ${p}`);

  const host = document.createElement("div");
  host.innerHTML = markup;
  const top = Array.from(host.childNodes).filter(
    (n) => !(n.nodeType === Node.TEXT_NODE && !n.textContent?.trim()),
  );
  const root = top[0] as Element | undefined;
  if (top.length !== 1 || root?.nodeType !== Node.ELEMENT_NODE || root.localName !== "svg" || root.namespaceURI !== SVG_NS) {
    problems.push("rendered tree is not exactly one <svg>");
  }
  if (root?.getAttribute?.("viewBox") !== "0 0 400 300") problems.push('viewBox is not "0 0 400 300"');
  top.forEach((node) => {
    if (node.nodeType === Node.ELEMENT_NODE) problems.push(...treeProblems(node as Element).map((p) => `html: ${p}`));
    else problems.push(`html: top-level ${node.nodeName} node`);
  });
  return problems;
}

describe("svgProblems (the illustration allowlist)", () => {
  const good = `<svg xmlns="${SVG_NS}" viewBox="0 0 400 300" fill="none" stroke-width="4">
    <title>More</title>
    <circle class="sign-line" cx="200" cy="105" r="45"/>
    <polygon class="sign-motion" stroke-width="2" points="1,2 3,4 5,6"/>
  </svg>`;

  it("accepts a placeholder-shaped illustration", () => {
    expect(svgProblems(good)).toEqual([]);
  });

  it.each([
    ["an HTML img with slash-separated onerror", '<svg viewBox="0 0 400 300"><img/src=x/onerror=alert(1)></svg>'],
    ["a quoted HTML img with onerror", `<svg xmlns="${SVG_NS}" viewBox="0 0 400 300"><img src="x" onerror="alert(1)"/></svg>`],
    ["an inline style block", `<svg xmlns="${SVG_NS}" viewBox="0 0 400 300"><style>body{display:none}</style></svg>`],
    [
      "an animated javascript: href",
      `<svg xmlns="${SVG_NS}" viewBox="0 0 400 300"><a><set attributeName="href" to="javascript:alert(1)"/></a></svg>`,
    ],
    ["a style attribute", `<svg xmlns="${SVG_NS}" viewBox="0 0 400 300"><path style="stroke:#000" d="M0 0"/></svg>`],
    ["a hardcoded stroke", `<svg xmlns="${SVG_NS}" viewBox="0 0 400 300"><path stroke="#000" d="M0 0"/></svg>`],
    ["a hardcoded fill", `<svg xmlns="${SVG_NS}" viewBox="0 0 400 300"><path fill="#000" d="M0 0"/></svg>`],
    ["a script element", `<svg xmlns="${SVG_NS}" viewBox="0 0 400 300"><script>alert(1)</script></svg>`],
    ["an event handler attribute", `<svg xmlns="${SVG_NS}" viewBox="0 0 400 300" onload="alert(1)"/>`],
    ["an embedded image", `<svg xmlns="${SVG_NS}" viewBox="0 0 400 300"><image href="https://x/y.png"/></svg>`],
    ["a use element", `<svg xmlns="${SVG_NS}" viewBox="0 0 400 300"><use href="https://x/y.svg#a"/></svg>`],
    ["foreignObject", `<svg xmlns="${SVG_NS}" viewBox="0 0 400 300"><foreignObject/></svg>`],
    ["an XHTML-namespaced element", `<svg xmlns="${SVG_NS}" viewBox="0 0 400 300"><h:p xmlns:h="http://www.w3.org/1999/xhtml"/></svg>`],
    ["a wrong viewBox", `<svg xmlns="${SVG_NS}" viewBox="0 0 24 24"/>`],
    ["a non-SVG root", '<html viewBox="0 0 400 300"/>'],
    [
      "an img hidden in a processing instruction (A)",
      `<svg xmlns="${SVG_NS}" viewBox="0 0 400 300"><?x ><img src=x onerror=alert(1)>?></svg>`,
    ],
    [
      "an img hidden in CDATA inside <title> (B)",
      `<svg xmlns="${SVG_NS}" viewBox="0 0 400 300"><title><![CDATA[><img src=x onerror=alert(1)>]]></title></svg>`,
    ],
    [
      "an img hidden in root-level CDATA",
      `<svg xmlns="${SVG_NS}" viewBox="0 0 400 300"><![CDATA[><img src=x onerror=alert(1)>]]></svg>`,
    ],
    [
      "an img hidden in a comment inside <title>",
      `<svg xmlns="${SVG_NS}" viewBox="0 0 400 300"><title><!--</title><img src=x onerror=alert(1)>--></title></svg>`,
    ],
    ["a DOCTYPE with an entity", `<!DOCTYPE svg [<!ENTITY e "x">]><svg xmlns="${SVG_NS}" viewBox="0 0 400 300"><title>&e;</title></svg>`],
    ["a second top-level element", `<svg xmlns="${SVG_NS}" viewBox="0 0 400 300"/><svg xmlns="${SVG_NS}" viewBox="0 0 400 300"/>`],
    ["an app/Tailwind class", `<svg xmlns="${SVG_NS}" viewBox="0 0 400 300"><rect class="fixed inset-0" width="1" height="1"/></svg>`],
    ["an unknown sign-* class", `<svg xmlns="${SVG_NS}" viewBox="0 0 400 300"><rect class="sign-line sign-glow" width="1" height="1"/></svg>`],
  ])("rejects %s", (_name, markup) => {
    expect(svgProblems(markup)).not.toEqual([]);
  });
});

describe("SIGN_MEDIA", () => {
  it.each(SIGN_LIBRARY.map((s) => [s.slug] as const))("%s has media with alt text", (slug) => {
    const media = SIGN_MEDIA[slug];
    expect(media).toBeDefined();
    expect(media.illustrationAlt.trim()).not.toBe("");
  });

  it("has an illustration file for every sign, and no file without a sign", () => {
    const fileSlugs = svgEntries.map(([file]) => file.replace(/\.svg$/, "")).sort();
    expect(fileSlugs).toEqual(SIGN_LIBRARY.map((s) => s.slug).sort());
    for (const sign of SIGN_LIBRARY) expect(SIGN_MEDIA[sign.slug].illustration).not.toBeNull();
  });
});

describe("resolveSignClip", () => {
  const clip = (file: string, url: string) => [`${SIGN_VIDEO_DIR}/${file}`, url] as const;

  it("returns nothing when the slug has no clip or poster", () => {
    expect(resolveSignClip("milk", {})).toEqual({});
    expect(resolveSignClip("milk", Object.fromEntries([clip("more.mp4", "/assets/more.mp4")]))).toEqual({});
  });

  it("prefers an mp4 clip over webm", () => {
    expect(
      resolveSignClip(
        "milk",
        Object.fromEntries([clip("milk.webm", "/assets/milk.webm"), clip("milk.mp4", "/assets/milk.mp4")]),
      ),
    ).toEqual({ video: "/assets/milk.mp4" });
  });

  it("uses webm when that is the only clip", () => {
    expect(resolveSignClip("all-done", Object.fromEntries([clip("all-done.webm", "/assets/all-done.webm")]))).toEqual({
      video: "/assets/all-done.webm",
    });
  });

  it("prefers a webp poster over jpg, jpeg, and png", () => {
    expect(
      resolveSignClip(
        "eat",
        Object.fromEntries([
          clip("eat.mp4", "/v.mp4"),
          clip("eat-poster.png", "/p.png"),
          clip("eat-poster.jpeg", "/p.jpeg"),
          clip("eat-poster.jpg", "/p.jpg"),
          clip("eat-poster.webp", "/p.webp"),
        ]),
      ),
    ).toEqual({ video: "/v.mp4", videoPoster: "/p.webp" });
  });

  it("uses jpeg ahead of png when webp and jpg are absent", () => {
    expect(
      resolveSignClip(
        "eat",
        Object.fromEntries([clip("eat-poster.jpeg", "/p.jpeg"), clip("eat-poster.png", "/p.png")]),
      ),
    ).toEqual({ videoPoster: "/p.jpeg" });
  });

  it("does not treat a poster file as the clip", () => {
    expect(resolveSignClip("more", Object.fromEntries([clip("more-poster.webp", "/p.webp")]))).toEqual({
      videoPoster: "/p.webp",
    });
  });
});

describe("bundled sign clips", () => {
  const videoDir = fileURLToPath(new URL("../assets/signs/video", import.meta.url));

  it("sets video and videoPoster only when the matching file is in the drop-in folder", () => {
    const names = new Set(fs.readdirSync(videoDir));
    for (const sign of SIGN_LIBRARY) {
      const media = SIGN_MEDIA[sign.slug];
      if (names.has(`${sign.slug}.mp4`) || names.has(`${sign.slug}.webm`)) {
        expect(media.video).toEqual(expect.any(String));
        expect(media.video!.length).toBeGreaterThan(0);
      } else {
        expect(media.video).toBeUndefined();
      }
      const hasPoster = ["webp", "jpg", "jpeg", "png"].some((ext) => names.has(`${sign.slug}-poster.${ext}`));
      if (hasPoster) expect(media.videoPoster).toEqual(expect.any(String));
      else expect(media.videoPoster).toBeUndefined();
    }
  });

  it("allows only a library slug's clip or poster, and keeps each clip within 600 KB", () => {
    const slugs = new Set(SIGN_LIBRARY.map((s) => s.slug));
    for (const name of fs.readdirSync(videoDir)) {
      if (name === "README.md") continue;
      const clip = /^(.+)\.(mp4|webm)$/.exec(name);
      const poster = /^(.+)-poster\.(webp|jpg|jpeg|png)$/.exec(name);
      const slug = clip?.[1] ?? poster?.[1];
      expect(slug != null && slugs.has(slug), name).toBe(true);
      if (clip) {
        expect(fs.statSync(nodePath.join(videoDir, name)).size).toBeLessThanOrEqual(600 * 1024);
      }
    }
  });
});

describe.each(svgEntries)("%s", (_file, markup) => {
  it("passes the illustration allowlist (400×300, allowed elements and attributes only, no colours)", () => {
    expect(svgProblems(markup)).toEqual([]);
  });
});
