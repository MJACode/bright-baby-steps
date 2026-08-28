/**
 * Curated baby-sign library — a staged, ASL-based program parents work through
 * at their own pace. Static content, same pattern as activityLibrary.ts:
 * typed arrays + pure helper functions. No AI involved anywhere.
 *
 * Voice: celebratory, second person, tired-parent-friendly. The program copy
 * and sign mechanics are SLP-vetted — keep clinical claims, ages, and cutoffs
 * exactly as written.
 */

export interface SignStage {
  /** Stable kebab-case id, e.g. "first-signs" */
  id: string;
  title: string;
  subtitle: string;
  /** Typical earliest age to start modeling this stage's signs */
  fromMonths: number;
}

export interface Sign {
  /** Stable kebab-case slug — stored in child_signs.sign_slug */
  slug: string;
  /** Display label, e.g. "All done" (uppercase as SIGN gloss in copy) */
  label: string;
  emoji: string;
  stageId: string;
  /** How to make the sign — warm second person, mechanics are SLP-vetted */
  howTo: string;
  /** Natural moments to model it */
  whenToUse: string;
  tip?: string;
}

export const SIGNS_WHY =
  "Signing doesn't delay talking — it gives your baby a way to communicate before words come, and can reduce frustration for both of you. Always say the word out loud as you sign it: this builds language, and your voice does the teaching.";

export const SIGNS_HOW_TO_TEACH =
  "Start with 1–3 signs tied to things your baby already cares about. Sign at natural moments — mealtime, bath, bedtime — and celebrate any attempt. Approximations count. When your baby signs, say the word back and give it meaning: \"More! You want more banana.\"";

export const SIGNS_BILINGUAL_NOTE =
  "In a bilingual home, sign while speaking whichever language you're using — signs bridge both. A sign your baby uses on their own counts as a word in their total vocabulary.";

export const SIGNS_EXPECTATIONS =
  "Most babies start signing back between 8 and 14 months, usually after weeks of seeing a sign used consistently. Not signing back isn't a concern by itself — signing is optional, and every baby's timeline is their own.";

export const SIGNS_RED_FLAG =
  "Signing progress doesn't replace milestone checkpoints. If your baby isn't using any gestures (pointing, waving, reaching) by 12 months, has no spoken words by 16 months, or loses skills they had, request a free Early Intervention evaluation — no doctor's referral needed.";

export const SIGNS_SPEECH_VS_LANGUAGE =
  "Signing builds language — expressing wants and ideas. It doesn't change how clearly speech sounds come out; if you're worried about pronunciation, the speech chat can help.";

export const SIGN_STAGES: SignStage[] = [
  {
    id: "first-signs",
    title: "First signs",
    subtitle: "Need-based signs your baby cares most about",
    fromMonths: 6,
  },
  {
    id: "daily-routines",
    title: "Daily routines",
    subtitle: "Signs for the moments that happen every day",
    fromMonths: 7,
  },
  {
    id: "connection",
    title: "Connection",
    subtitle: "People and help — the social signs",
    fromMonths: 8,
  },
  {
    id: "out-in-the-world",
    title: "Out in the world",
    subtitle: "Naming the things your baby points at",
    fromMonths: 9,
  },
  {
    id: "feelings-manners",
    title: "Feelings & manners",
    subtitle: "Social signs that grow with your toddler",
    fromMonths: 10,
  },
];

export const SIGN_LIBRARY: Sign[] = [
  // ── Stage 1 — First signs ─────────────────────────────────────────────
  {
    slug: "milk",
    label: "Milk",
    emoji: "🍼",
    stageId: "first-signs",
    howTo: "Open and squeeze your fist, like milking a cow.",
    whenToUse: "Right before and during feeds.",
    tip: "A specific sign like MILK often becomes a true first sign — it names something your baby wants many times a day.",
  },
  {
    slug: "more",
    label: "More",
    emoji: "➕",
    stageId: "first-signs",
    howTo:
      "Flatten your fingertips against your thumb on each hand (like two duck beaks), then tap your hands together.",
    whenToUse: "When a bite, game, or song ends and your baby wants it to keep going.",
    tip: "Pair MORE with the specific thing — \"more MILK\" — so it doesn't become a catch-all for everything.",
  },
  {
    slug: "all-done",
    label: "All done",
    emoji: "✅",
    stageId: "first-signs",
    howTo: "Hold both hands up, palms facing you, then flip them outward.",
    whenToUse: "At the end of meals, baths, play.",
    tip: "Great frustration-saver — it lets your baby end something without crying about it.",
  },
  {
    slug: "eat",
    label: "Eat",
    emoji: "🥄",
    stageId: "first-signs",
    howTo: "Bring your flattened fingertips to your lips, like putting food in your mouth.",
    whenToUse: "Before and during meals and snacks.",
    tip: "Say the food's name too: \"Eat! We're eating banana.\"",
  },

  // ── Stage 2 — Daily routines ──────────────────────────────────────────
  {
    slug: "sleep",
    label: "Sleep",
    emoji: "😴",
    stageId: "daily-routines",
    howTo:
      "Draw your open hand down over your face, closing your fingers together as you tilt your head.",
    whenToUse: "At winddown and nap cues.",
    tip: "Signing SLEEP in the bedtime routine becomes a cue itself — part of the winddown.",
  },
  {
    slug: "bath",
    label: "Bath",
    emoji: "🛁",
    stageId: "daily-routines",
    howTo: "Make two fists and rub them up and down on your chest.",
    whenToUse: "As the tub fills.",
    tip: "Narrate the routine: \"Bath! Time for your bath.\"",
  },
  {
    slug: "change",
    label: "Change",
    emoji: "🧷",
    stageId: "daily-routines",
    howTo: "Make two fists, knuckles touching, and twist them in opposite directions.",
    whenToUse: "Before diaper changes.",
    tip: "Warning signs before handling your baby builds trust — they learn what's coming.",
  },
  {
    slug: "water",
    label: "Water",
    emoji: "💧",
    stageId: "daily-routines",
    howTo: "Make a W with three fingers and tap it on your chin.",
    whenToUse: "Offering the cup, washing hands.",
    tip: "Different from MILK — babies distinguish them earlier than you'd expect.",
  },

  // ── Stage 3 — Connection ──────────────────────────────────────────────
  {
    slug: "mommy",
    label: "Mommy",
    emoji: "👩",
    stageId: "connection",
    howTo: "Spread your hand wide and tap your thumb on your chin.",
    whenToUse: "Naming who's here, who's coming.",
    tip: "Use whatever name your family uses out loud — the sign carries the meaning.",
  },
  {
    slug: "daddy",
    label: "Daddy",
    emoji: "👨",
    stageId: "connection",
    howTo: "Spread your hand wide and tap your thumb on your forehead.",
    whenToUse: "Same as MOMMY — greetings, photos, \"who's that?\"",
    tip: "Use whatever name your family uses out loud — the sign carries the meaning.",
  },
  {
    slug: "help",
    label: "Help",
    emoji: "🤝",
    stageId: "connection",
    howTo: "Place your fist, thumb up, on your flat palm and lift both together.",
    whenToUse: "When your baby is stuck or frustrated with a toy.",
    tip: "HELP is a powerhouse sign — it replaces a lot of crying once it clicks.",
  },
  {
    slug: "up",
    label: "Up",
    emoji: "⬆️",
    stageId: "connection",
    howTo: "Point your index finger up and lift your hand.",
    whenToUse: "When your baby reaches to be picked up.",
    tip: "You're labeling something they already gesture — that's the fastest kind of sign to learn.",
  },

  // ── Stage 4 — Out in the world ────────────────────────────────────────
  {
    slug: "dog",
    label: "Dog",
    emoji: "🐶",
    stageId: "out-in-the-world",
    howTo: "Pat your thigh (add a finger snap if you can).",
    whenToUse: "Real dogs, dogs in books, barking sounds.",
    tip: "Animals are high-excitement — high-excitement words get learned fast.",
  },
  {
    slug: "cat",
    label: "Cat",
    emoji: "🐱",
    stageId: "out-in-the-world",
    howTo: "Pinch your thumb and index finger by your cheek and pull outward, like a whisker.",
    whenToUse: "Same as DOG — real cats, book cats.",
    tip: "Pair with the sound: \"Cat! Meow!\"",
  },
  {
    slug: "book",
    label: "Book",
    emoji: "📖",
    stageId: "out-in-the-world",
    howTo: "Press your palms together, then open them like a book.",
    whenToUse: "Announcing storytime, letting your baby choose.",
    tip: "Let the sign start the routine: sign BOOK, then let them pick one.",
  },
  {
    slug: "ball",
    label: "Ball",
    emoji: "⚽",
    stageId: "out-in-the-world",
    howTo: "Curve both hands like you're holding a ball and tap your fingertips together.",
    whenToUse: "Playtime, pointing at balls out in the world.",
    tip: "Roll it back and forth and sign between turns — turn-taking is language practice too.",
  },

  // ── Stage 5 — Feelings & manners ──────────────────────────────────────
  {
    slug: "happy",
    label: "Happy",
    emoji: "😊",
    stageId: "feelings-manners",
    howTo: "Brush your flat hand upward on your chest, twice.",
    whenToUse: "Naming the feeling in the moment: \"You're so happy!\"",
    tip: "Feeling words now become self-regulation words later.",
  },
  {
    slug: "gentle",
    label: "Gentle",
    emoji: "🫶",
    stageId: "feelings-manners",
    howTo: "Softly stroke the back of one hand with the other.",
    whenToUse: "Around pets, babies, and anything squeezable.",
    tip: "This is the classic \"pet nicely\" teaching sign — model it slowly on your baby's own hand.",
  },
  {
    slug: "thank-you",
    label: "Thank you",
    emoji: "🙏",
    stageId: "feelings-manners",
    howTo: "Touch your chin with your flat hand, then move it forward toward the person.",
    whenToUse: "Handing things back and forth, receiving snacks.",
    tip: "Manners signs are social, not need-based — they usually come after the survival signs, and that's fine.",
  },
  {
    slug: "hurt",
    label: "Hurt",
    emoji: "🤕",
    stageId: "feelings-manners",
    howTo:
      "Point your index fingers toward each other and tap them together with a little twist, near where it hurts.",
    whenToUse: "Bumps, teething, \"show me where.\"",
    tip: "A baby who can show you WHERE it hurts changes sick days entirely.",
  },
];

/** Signs belonging to one stage, in library order. */
export function getSignsForStage(stageId: string): Sign[] {
  return SIGN_LIBRARY.filter((s) => s.stageId === stageId);
}
