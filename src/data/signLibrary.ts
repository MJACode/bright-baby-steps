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
  /** Model / Prompt / Celebrate teaching steps — SLP-reviewed */
  steps: { model: string; prompt: string; celebrate: string };
  /** "If it isn't catching on" — SLP-reviewed */
  stuckTip: string;
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
  "Signing builds language — expressing wants and ideas. It doesn't change how clearly speech sounds come out; if you're worried about pronunciation, talk with your pediatrician or a speech-language pathologist.";

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
    steps: {
      model:
        "Sign MILK as you say \"Milk!\" right before each feed, so your baby sees the sign just before the good stuff arrives.",
      prompt:
        "Hold up the bottle or get ready to nurse, pause with an expectant smile, then feed, whether your baby signs or not.",
      celebrate:
        "Any squeeze of the hand counts: \"Milk! You want milk,\" and start the feed right away.",
    },
    stuckTip:
      "Sign MILK at every feed, not just some. It's the most repeated moment of your baby's day. Keep the sign on your own hand, close to your face so your baby can see it.",
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
    steps: {
      model:
        "When a song or snack pauses, sign MORE and say \"More? More banana!\" before you keep going.",
      prompt:
        "Pause the game or hold up the next bite, look at your baby expectantly, and wait a few seconds, then keep going either way.",
      celebrate:
        "Clapping hands or tapping fists counts: \"More! More tickles!\" and give more right away.",
    },
    stuckTip:
      "Try MORE with your baby's favorite game, like tickles, bubbles, or peekaboo. High-fun moments with a natural pause are where MORE clicks fastest.",
  },
  {
    slug: "all-done",
    label: "All done",
    emoji: "✅",
    stageId: "first-signs",
    howTo: "Hold both hands up, palms facing you, then flip them outward.",
    whenToUse: "At the end of meals, baths, play.",
    tip: "Great frustration-saver — it lets your baby end something without crying about it.",
    steps: {
      model:
        "As a meal or bath wraps up, sign ALL DONE and say \"All done!\" while you clear the tray or lift your baby out.",
      prompt:
        "When your baby starts pushing food away or turning from play, sign ALL DONE and ask \"All done?\" with a curious look.",
      celebrate:
        "Any hand wave or flip counts: \"All done! You're all done eating,\" and end the activity so the sign gets results.",
    },
    stuckTip:
      "Watch for your baby's own \"I'm finished\" cues, like pushing away, arching, or turning, and sign ALL DONE right then. Naming what they already feel helps it stick.",
  },
  {
    slug: "eat",
    label: "Eat",
    emoji: "🥄",
    stageId: "first-signs",
    howTo: "Bring your flattened fingertips to your lips, like putting food in your mouth.",
    whenToUse: "Before and during meals and snacks.",
    tip: "Say the food's name too: \"Eat! We're eating banana.\"",
    steps: {
      model:
        "Sign EAT and say \"Eat! Time to eat\" as you set down the plate or bring your baby to the high chair.",
      prompt:
        "Hold up two snacks and ask \"Want to eat banana or cracker?\" then offer, whether your baby signs, points, or reaches.",
      celebrate:
        "Hand to mouth counts: \"Eat! You want to eat,\" then name the food as you offer it.",
    },
    stuckTip:
      "EAT and MORE can blur at mealtime. Keep EAT for the start of the meal and MORE for seconds, so each sign has its own clear moment.",
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
    steps: {
      model:
        "Sign SLEEP and say \"Sleep time\" softly during your winddown, like right after the last story or song.",
      prompt:
        "When you spot sleepy cues, sign SLEEP and ask gently, \"Sleepy?\" then carry on with the winddown as usual.",
      celebrate:
        "Any hand-to-face movement counts: \"Sleep! You're sleepy,\" and head into your cozy routine together.",
    },
    stuckTip:
      "Make SLEEP the same step in the same spot every night, like at the crib or after lights dim. Predictable placement helps the sign become part of the routine.",
  },
  {
    slug: "bath",
    label: "Bath",
    emoji: "🛁",
    stageId: "daily-routines",
    howTo: "Make two fists and rub them up and down on your chest.",
    whenToUse: "As the tub fills.",
    tip: "Narrate the routine: \"Bath! Time for your bath.\"",
    steps: {
      model:
        "Sign BATH and say \"Bath time!\" as the tub fills, letting your baby watch and hear the water.",
      prompt:
        "Before you lift your baby in, sign BATH, ask \"Bath?\" and pause with a smile, then in you go.",
      celebrate:
        "Any chest rubbing or wiggle counts: \"Bath! You know it's bath time,\" and splash in together.",
    },
    stuckTip:
      "Sign BATH a few times during the bath too, not just before, like while you pour water or play with toys. More repetitions in a fun moment help it click.",
  },
  {
    slug: "change",
    label: "Change",
    emoji: "🧷",
    stageId: "daily-routines",
    howTo: "Make two fists, knuckles touching, and twist them in opposite directions.",
    whenToUse: "Before diaper changes.",
    tip: "A heads-up sign before handling your baby builds trust — they learn what's coming.",
    steps: {
      model:
        "Before you lay your baby down for a diaper change, sign CHANGE and say \"Time to change your diaper.\"",
      prompt:
        "As you head to the changing spot, sign CHANGE and ask \"Change?\" with a pause, giving your baby a moment to respond.",
      celebrate:
        "Any twist or hand movement counts: \"Change! Yes, fresh diaper time,\" and thank your baby for helping.",
    },
    stuckTip:
      "CHANGE is less exciting than food or play, so it often comes later, and that's fine. Keep signing it at every change and pair it with a song to make the moment fun.",
  },
  {
    slug: "water",
    label: "Water",
    emoji: "💧",
    stageId: "daily-routines",
    howTo: "Make a W with three fingers and tap it on your chin.",
    whenToUse: "Offering the cup, washing hands.",
    tip: "Different from MILK — babies distinguish them earlier than you'd expect.",
    steps: {
      model:
        "Sign WATER and say \"Water!\" as you hand over the cup or turn on the tap to wash hands.",
      prompt:
        "Hold up the water cup, pause with an expectant look, and ask \"Water?\" then hand it over whatever your baby does.",
      celebrate:
        "A tap anywhere near the chin counts: \"Water! You want water,\" and give the cup right away.",
    },
    stuckTip:
      "The W handshape is tricky for little fingers, so welcome any chin tap as WATER. Sign it on your own chin at bath and handwashing too, for extra natural practice.",
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
    steps: {
      model:
        "Sign MOMMY and say the name your family uses as Mommy walks in: \"Mama's here!\"",
      prompt:
        "Hold up a photo or point as Mommy comes near, and ask \"Who's that?\" with an expectant pause.",
      celebrate:
        "Any tap near the chin counts: \"Mama! That's Mama!\" and Mommy can light up and wave back.",
    },
    stuckTip:
      "Have your partner or another caregiver sign MOMMY each time Mommy arrives. Seeing it at the exciting reunion moment, from someone else, helps the sign make sense.",
  },
  {
    slug: "daddy",
    label: "Daddy",
    emoji: "👨",
    stageId: "connection",
    howTo: "Spread your hand wide and tap your thumb on your forehead.",
    whenToUse: "Same as MOMMY — greetings, photos, \"who's that?\"",
    tip: "Use whatever name your family uses out loud — the sign carries the meaning.",
    steps: {
      model:
        "Sign DADDY and say the name your family uses as Daddy walks in: \"Dada's home!\"",
      prompt:
        "Hold up a photo or point as Daddy comes near, and ask \"Who's that?\" with an expectant pause.",
      celebrate:
        "Any tap near the forehead counts: \"Dada! That's Dada!\" and Daddy can light up and wave back.",
    },
    stuckTip:
      "Have another caregiver sign DADDY each time Daddy arrives. Seeing it at the exciting reunion moment, from someone else, helps the sign make sense.",
  },
  {
    slug: "help",
    label: "Help",
    emoji: "🤝",
    stageId: "connection",
    howTo: "Place your fist, thumb up, on your flat palm and lift both together.",
    whenToUse: "When your baby is stuck or frustrated with a toy.",
    tip: "HELP is a powerhouse sign — it replaces a lot of crying once it clicks.",
    steps: {
      model:
        "When your baby is stuck with a toy, sign HELP and say \"Help? I can help!\" as you lend a hand.",
      prompt:
        "When a lid won't open or a toy is out of reach, ask \"Need help?\" and sign HELP, then help right away.",
      celebrate:
        "Any hands-together lift counts: \"Help! You asked for help,\" and step in to help straight away.",
    },
    stuckTip:
      "Pick a daily moment that often needs help, like a snack container or a stuck shoe, and sign HELP there each time. A reliable moment makes the sign easy to learn.",
  },
  {
    slug: "up",
    label: "Up",
    emoji: "⬆️",
    stageId: "connection",
    howTo: "Point your index finger up and lift your hand.",
    whenToUse: "When your baby reaches to be picked up.",
    tip: "You're labeling something they already gesture — that's the fastest kind of sign to learn.",
    steps: {
      model:
        "When your baby reaches up for you, sign UP and say \"Up! Up you go!\" as you lift them.",
      prompt:
        "When your baby reaches for you, sign UP and ask \"Up?\" with a quick smile, then scoop them up.",
      celebrate:
        "Raised arms or a pointy finger both count: \"Up! You want up,\" and lift them with a big hug.",
    },
    stuckTip:
      "Your baby's arms-up reach already means UP, so treat it as the sign. Keep saying \"Up!\" and signing on your own hand each time you lift them.",
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
    steps: {
      model:
        "When you see a dog on a walk or in a book, sign DOG and say \"Dog! Woof woof!\"",
      prompt:
        "When a dog appears, point and ask \"What's that?\" with an excited look, then give your baby a moment.",
      celebrate:
        "Any pat counts: \"Dog! You saw the dog!\" and add the bark for extra fun.",
    },
    stuckTip:
      "Use a favorite dog book or stuffed dog and sign DOG on every page or every pat. Lots of quick repetitions during fun play help it stick.",
  },
  {
    slug: "cat",
    label: "Cat",
    emoji: "🐱",
    stageId: "out-in-the-world",
    howTo: "Pinch your thumb and index finger by your cheek and pull outward, like a whisker.",
    whenToUse: "Same as DOG — real cats, book cats.",
    tip: "Pair with the sound: \"Cat! Meow!\"",
    steps: {
      model:
        "When you see a cat, real or in a book, sign CAT and say \"Cat! Meow!\"",
      prompt:
        "Point at a cat and ask \"Who's that?\" with a curious face, then pause and wait.",
      celebrate:
        "Any hand near the cheek counts: \"Cat! Meow! You saw the cat!\"",
    },
    stuckTip:
      "Pair CAT with DOG in the same book or play session, since babies often enjoy comparing animals. Say each sound as you sign to make it memorable.",
  },
  {
    slug: "book",
    label: "Book",
    emoji: "📖",
    stageId: "out-in-the-world",
    howTo: "Press your palms together, then open them like a book.",
    whenToUse: "Announcing storytime, letting your baby choose.",
    tip: "Let the sign start the routine: sign BOOK, then let them pick one.",
    steps: {
      model:
        "Sign BOOK and say \"Book time!\" as you settle in for a story, then open the real book the same way.",
      prompt:
        "Hold up two books, sign BOOK, and ask \"Which book?\" and let your baby choose by pointing, reaching, or signing.",
      celebrate:
        "Any clap or hands opening counts: \"Book! Let's read your book,\" and dive into the story.",
    },
    stuckTip:
      "Sign BOOK before every storytime, not just bedtime. Open and close the real book together while you sign. The movement matches, which helps it make sense.",
  },
  {
    slug: "ball",
    label: "Ball",
    emoji: "⚽",
    stageId: "out-in-the-world",
    howTo: "Curve both hands like you're holding a ball and tap your fingertips together.",
    whenToUse: "Playtime, pointing at balls out in the world.",
    tip: "Roll it back and forth and sign between turns — turn-taking is language practice too.",
    steps: {
      model:
        "Sign BALL and say \"Ball!\" as you roll it to your baby, and again when you spot balls out and about.",
      prompt:
        "Hold the ball, sign BALL, and ask \"Ready?\" with an expectant pause before you roll it over.",
      celebrate:
        "Any curved-hands tap counts: \"Ball! You want the ball,\" and send it rolling their way.",
    },
    stuckTip:
      "Sign BALL between every roll during play. Try different balls, like squishy, bouncy, or light-up, so your baby learns the sign names all of them.",
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
    steps: {
      model:
        "When your baby giggles or grins, sign HAPPY and say \"You're happy! Happy, happy!\"",
      prompt:
        "During a joyful moment, sign HAPPY and ask \"Happy?\" with a big smile, then give your baby a beat to respond.",
      celebrate:
        "Any chest pat or rub counts: \"Happy! You feel happy,\" and share the moment with a smile or hug.",
    },
    stuckTip:
      "Feelings are abstract, so sign HAPPY in the clearest joyful moments, like giggles and play. Sing \"If You're Happy and You Know It\" with the sign for extra practice.",
  },
  {
    slug: "gentle",
    label: "Gentle",
    emoji: "🫶",
    stageId: "feelings-manners",
    howTo: "Softly stroke the back of one hand with the other.",
    whenToUse: "Around pets, babies, and anything squeezable.",
    tip: "This is the classic \"pet nicely\" teaching sign — model it slowly on your own hand, then softly on your baby's if they enjoy it.",
    steps: {
      model:
        "Around pets or a baby doll, sign GENTLE and say \"Gentle, gentle\" softly as you stroke slowly.",
      prompt:
        "Before your baby touches a pet or friend, sign GENTLE and ask \"Gentle touch?\" then show them how.",
      celebrate:
        "Any soft stroke counts: \"Gentle! That's so gentle,\" and praise the soft touch right away.",
    },
    stuckTip:
      "Practice with a stuffed animal first, where it's calm. Sign GENTLE on your own hand, then stroke the toy together if your baby enjoys it.",
  },
  {
    slug: "thank-you",
    label: "Thank you",
    emoji: "🙏",
    stageId: "feelings-manners",
    howTo: "Touch your chin with your flat hand, then move it forward toward the person.",
    whenToUse: "Handing things back and forth, receiving snacks.",
    tip: "Manners signs are social, not need-based — they usually come after the survival signs, and that's fine.",
    steps: {
      model:
        "When someone hands you something, sign THANK YOU and say \"Thank you!\" with a warm smile.",
      prompt:
        "Hand your baby a toy or snack and say \"Thank you?\" with a friendly pause, then carry on either way.",
      celebrate:
        "Any hand-from-chin movement counts: \"Thank you! You said thank you,\" and give a big smile back.",
    },
    stuckTip:
      "Play a simple give-and-take game with a toy, saying and signing THANK YOU each time it changes hands. Social signs often come after need signs, and that's fine.",
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
    steps: {
      model:
        "When your baby bumps a knee, sign HURT near the spot and say \"Ouch, hurt! Your knee hurts.\"",
      prompt:
        "After a bump, sign HURT and ask \"Where does it hurt?\" then offer comfort right away, whatever the answer.",
      celebrate:
        "Any finger tap or point counts: \"Hurt! Your hand hurts,\" and give comfort and a cuddle.",
    },
    stuckTip:
      "Sign HURT during pretend play, like when a teddy bumps its head, so your baby can learn it while calm. Always comfort first, then sign when things settle.",
  },
];

/** Signs belonging to one stage, in library order. */
export function getSignsForStage(stageId: string): Sign[] {
  return SIGN_LIBRARY.filter((s) => s.stageId === stageId);
}

export interface SignPathSet {
  id: string;
  signSlugs: string[];
  fromMonths: number;
}

/**
 * Default path through the library (FR-009), in stage order. Every library
 * slug appears exactly once. First signs has four signs but the opening set
 * is fixed at three, so EAT pairs with WATER (both mealtime) and that one set
 * spans into Daily routines — its fromMonths is the later stage's.
 */
export const SIGN_PATH: SignPathSet[] = [
  { id: "first-needs", signSlugs: ["milk", "more", "all-done"], fromMonths: 6 },
  { id: "mealtime", signSlugs: ["eat", "water"], fromMonths: 7 },
  { id: "care-routines", signSlugs: ["sleep", "bath", "change"], fromMonths: 7 },
  { id: "family", signSlugs: ["mommy", "daddy"], fromMonths: 8 },
  { id: "help-up", signSlugs: ["help", "up"], fromMonths: 8 },
  { id: "animals", signSlugs: ["dog", "cat"], fromMonths: 9 },
  { id: "play", signSlugs: ["book", "ball"], fromMonths: 9 },
  { id: "feelings", signSlugs: ["happy", "gentle"], fromMonths: 10 },
  { id: "manners", signSlugs: ["thank-you", "hurt"], fromMonths: 10 },
];

/**
 * Slugs from the first path set that still has a sign not at "signing".
 * Under-6-month-olds are treated as 6 so they still get first signs.
 * If that next unfinished set isn't age-eligible yet, returns [] rather than
 * skipping ahead — the UI shows a gentle "more signs soon" state. Also []
 * when every sign is signing.
 */
export function getDefaultFocusSet(
  correctedAgeMonths: number,
  statusBySlug: Record<string, string | undefined>,
): string[] {
  const ageMonths = Math.max(correctedAgeMonths, 6);
  const next = SIGN_PATH.find((set) =>
    set.signSlugs.some((slug) => statusBySlug[slug] !== "signing"),
  );
  if (!next || next.fromMonths > ageMonths) return [];
  return next.signSlugs.filter((slug) => statusBySlug[slug] !== "signing");
}
