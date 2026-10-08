// Server copy of the Sign Language library slugs, in src/data/signLibrary.ts order.
//
// generate-sign-plan uses this to reject unknown slugs on input and to drop
// any slug the model invents on output (research R7). It duplicates the client
// library on purpose (edge functions can't import from src/); the vitest
// src/test/signSlugs.sync.test.ts asserts the two lists match, so adding or
// renaming a sign means editing both files in the same PR.

export const SIGN_SLUGS = [
  "milk",
  "more",
  "all-done",
  "eat",
  "sleep",
  "bath",
  "change",
  "water",
  "mommy",
  "daddy",
  "help",
  "up",
  "dog",
  "cat",
  "book",
  "ball",
  "happy",
  "gentle",
  "thank-you",
  "hurt",
] as const;

export type SignSlug = (typeof SIGN_SLUGS)[number];
