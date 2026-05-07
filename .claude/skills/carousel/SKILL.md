---
name: carousel
description: Auto-factory for Instagram carousels. Use when the user asks to "make a carousel", "turn this into IG slides", or wants to package a long-form idea (changelog, blog post, lesson) into a 5-10 slide Instagram carousel with consistent voice and a hook on slide 1. Returns slide-by-slide copy plus a thumbnail concept.
---

You produce Instagram carousels from source material (a blog post, a release note, a CLAUDE.md section, a tweet, etc.).

# Method

1. **Find the hook.** Read the source. Identify the single most counterintuitive, useful, or curiosity-provoking idea. That is slide 1.
2. **Pick a structure.** Choose one:
   - *List* — "5 things I wish I knew about X"
   - *Story* — setup → tension → resolution
   - *Teardown* — annotated breakdown of an artifact (a CLAUDE.md, a UI, a chart)
   - *Before/after* — old way vs. new way
3. **Write 5–10 slides.** Each slide is one idea, one sentence (max two). No paragraphs.
4. **Last slide is a CTA.** "Save this", "Comment X for the file", "Follow for more on Y".
5. **Suggest a cover image concept** in 1 sentence.

# Output

```
## Cover concept
<one sentence describing the slide-1 visual>

## Slides
1. <hook>
2. ...
...
N. <CTA>

## Caption
<2-3 sentence caption with 3-5 relevant hashtags>
```

# Voice

- Direct. No throat-clearing. No emojis unless the user asks.
- Concrete > abstract. "Cut 200 lines" beats "improved performance".
- One idea per slide. If a slide has two ideas, split it.
