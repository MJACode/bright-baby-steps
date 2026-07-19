/**
 * Curated activity library — evidence-aligned play ideas parents can run with
 * household items in a few minutes. Static content, same pattern as
 * developmentContent.ts: typed array + pure helper functions.
 *
 * Voice: celebratory, second person, tired-parent-friendly. Success signals
 * ("watchFor") are always framed as what's going well — never as deficits.
 *
 * `supportsMilestones` strings match the milestone catalog names exactly
 * (straight ASCII quotes and en-dashes, as stored in the DB catalog) so they can be joined against
 * milestone records without normalization.
 */

export type ActivityDomain = "motor" | "language" | "cognitive" | "social" | "sensory";

export interface Activity {
  /** Stable kebab-case slug, e.g. "mirror-tummy-time" */
  id: string;
  /** Short, celebratory title */
  title: string;
  domain: ActivityDomain;
  /** Inclusive */
  ageMonthsStart: number;
  /** Inclusive */
  ageMonthsEnd: number;
  /** 2–15 */
  durationMinutes: number;
  /** Common household items only; [] means "just you two" */
  materials: string[];
  /** 3–5 short second-person steps */
  steps: string[];
  /** Success signal — never deficit-framed */
  watchFor: string;
  /** Exact milestone names from the milestone catalog (may be empty, esp. sensory) */
  supportsMilestones: string[];
  /** Only when warranted (small parts, water, food, height) */
  safetyNote?: string;
  /** Optional tags from the fixed interests allowlist */
  interests?: string[];
}

export const ACTIVITY_DISCLAIMER =
  "Play ideas, not prescriptions — every child explores at their own pace. These work in any language — talk, sing, and read in whichever language feels most natural to you. Always supervise play, and check with your pediatrician if you have questions.";

export const DOMAIN_ORDER: ActivityDomain[] = ["motor", "language", "cognitive", "social", "sensory"];

export const DOMAIN_LABELS: Record<ActivityDomain, string> = {
  motor: "Motor",
  language: "Language",
  cognitive: "Thinking",
  social: "Social",
  sensory: "Sensory",
};

export const ACTIVITY_LIBRARY: Activity[] = [
  // ── 0–3 months ──────────────────────────────────────────────────────────
  {
    id: "chest-tummy-time",
    title: "Tummy time on your chest",
    domain: "motor",
    ageMonthsStart: 0,
    ageMonthsEnd: 3,
    durationMinutes: 5,
    materials: [],
    steps: [
      "Recline on the couch or bed with your baby lying tummy-down on your chest.",
      "Talk or hum so your baby has a reason to look up at you.",
      "Let them rest their cheek down whenever they need a break.",
      "Repeat in short bursts a few times a day — a little adds up fast.",
    ],
    watchFor:
      "You'll know it's landing when your baby lifts their head, even briefly, to find your face.",
    supportsMilestones: [
      "Pushes up on arms during tummy time",
      "Holds head steady when upright",
    ],
    safetyNote:
      "Stay awake and attentive the whole time — tummy time is always supervised, and move baby to their own safe sleep space if either of you gets drowsy.",
  },
  {
    id: "grip-and-release",
    title: "The finger squeeze",
    domain: "motor",
    ageMonthsStart: 0,
    ageMonthsEnd: 3,
    durationMinutes: 3,
    materials: [],
    steps: [
      "During a calm, alert moment, stroke the back of your baby's hand.",
      "Offer your finger across their palm and let them wrap around it.",
      "Gently wiggle your finger and feel them adjust their grip.",
      "Switch hands so both sides get a turn.",
    ],
    watchFor:
      "You'll know it's landing when their hands spend more time open and the grip around your finger feels stronger.",
    supportsMilestones: ["Opens and closes hands", "Grasps objects placed in hand"],
  },
  {
    id: "hands-together-play",
    title: "Hands meet in the middle",
    domain: "motor",
    ageMonthsStart: 0,
    ageMonthsEnd: 3,
    durationMinutes: 3,
    materials: [],
    steps: [
      "Lay your baby on their back during a calm, alert moment.",
      "Gently guide their hands together at the center of their chest and let them touch.",
      "Play pat-a-cake style claps in slow motion, narrating as you go.",
      "Let go and watch — hands finding each other on their own is the goal.",
    ],
    watchFor:
      "You'll know it's landing when your baby brings their hands together at their chest without your help — often while studying them intently.",
    supportsMilestones: ["Opens and closes hands"],
  },
  {
    id: "coo-conversations",
    title: "Coo conversations",
    domain: "language",
    ageMonthsStart: 0,
    ageMonthsEnd: 3,
    durationMinutes: 5,
    materials: [],
    steps: [
      "Hold your baby about 8–12 inches from your face — their sweet spot for seeing you.",
      "Say something warm and simple, then pause and wait.",
      "When they make any sound, answer it like it meant something: \"Oh really? Tell me more.\"",
      "Keep the back-and-forth going as long as they're enjoying it.",
    ],
    watchFor:
      "You'll know it's landing when your baby starts 'answering' in the pauses you leave.",
    supportsMilestones: [
      "Coos and makes gurgling sounds",
      "Reacts to sounds (startles, calms to voice)",
    ],
  },
  {
    id: "follow-the-face",
    title: "Follow my face",
    domain: "cognitive",
    ageMonthsStart: 0,
    ageMonthsEnd: 3,
    durationMinutes: 3,
    materials: [],
    steps: [
      "Lie your baby on their back and bring your face close, about a foot away.",
      "Once they lock onto you, move your face slowly to one side.",
      "Pause, let them catch up, then drift slowly the other way.",
      "Stop while they're still interested — short and sweet wins.",
    ],
    watchFor:
      "You'll know it's landing when their eyes track you smoothly from one side toward the other.",
    supportsMilestones: ["Follows moving object with eyes"],
  },
  {
    id: "smile-and-pause",
    title: "Smile, pause, repeat",
    domain: "social",
    ageMonthsStart: 0,
    ageMonthsEnd: 3,
    durationMinutes: 3,
    materials: [],
    steps: [
      "Catch a calm, alert moment — right after a feed often works.",
      "Get face-to-face, make eye contact, and give your biggest slow smile.",
      "Hold it and wait a few seconds — babies need time to answer.",
      "When anything comes back — a wiggle, a gaze, a smile — celebrate it out loud.",
    ],
    watchFor:
      "You'll know it's landing when your baby holds your gaze longer and a smile starts coming back to you.",
    supportsMilestones: ["Social smile", "Makes eye contact"],
  },
  {
    id: "gentle-touch-tour",
    title: "The gentle touch tour",
    domain: "sensory",
    ageMonthsStart: 0,
    ageMonthsEnd: 3,
    durationMinutes: 4,
    materials: ["A soft cloth or burp rag", "A fleece blanket or cotton shirt"],
    steps: [
      "During a diaper change or calm cuddle, gather two different soft fabrics.",
      "Slowly stroke one along your baby's arm or leg, naming it: \"soft... fuzzy...\"",
      "Switch to the other texture and narrate the difference.",
      "Watch their face and follow their lead — more of what they like.",
    ],
    watchFor:
      "You'll know it's landing when your baby stills and tunes in, or wiggles happily when a favorite texture returns.",
    supportsMilestones: [],
  },
  {
    id: "kitchen-listening-walk",
    title: "The listening walk",
    domain: "sensory",
    ageMonthsStart: 0,
    ageMonthsEnd: 3,
    durationMinutes: 5,
    materials: [],
    steps: [
      "Carry your baby snugly and stroll slowly around your home.",
      "Pause at everyday sounds — the fridge hum, running water, a ticking clock.",
      "Name each one in a warm voice: \"Hear that? That's the kettle.\"",
      "End somewhere quiet with a cuddle to wind down.",
    ],
    watchFor:
      "You'll know it's landing when your baby quiets or turns their head toward a sound you name.",
    supportsMilestones: ["Reacts to sounds (startles, calms to voice)"],
  },

  // ── 3–6 months ──────────────────────────────────────────────────────────
  {
    id: "mirror-tummy-time",
    title: "Mirror tummy time",
    domain: "motor",
    ageMonthsStart: 3,
    ageMonthsEnd: 6,
    durationMinutes: 5,
    materials: ["A baby-safe (unbreakable) mirror or shiny metal baking sheet", "A blanket"],
    steps: [
      "Spread a blanket on the floor and lay your baby on their tummy.",
      "Prop the mirror upright a short reach in front of them.",
      "Get down on the floor too and point out \"the other baby.\"",
      "Let them push up, study, and chat with their reflection.",
    ],
    watchFor:
      "You'll know it's landing when your baby props up on their arms and holds the position to keep looking.",
    supportsMilestones: ["Pushes up on arms during tummy time"],
    safetyNote: "Stay with your baby for all tummy time, and use only an unbreakable mirror.",
  },
  {
    id: "roll-to-the-rattle",
    title: "Roll toward the fun",
    domain: "motor",
    ageMonthsStart: 3,
    ageMonthsEnd: 6,
    durationMinutes: 5,
    materials: ["A favorite toy, rattle, or crinkly baby toy"],
    steps: [
      "Lay your baby on a blanket on the floor, on their back or tummy.",
      "Hold the toy just out of reach off to one side and give it a shake.",
      "Cheer every lean, reach, and shoulder-turn toward it.",
      "When they make it over — or get close — hand it over with a celebration.",
    ],
    watchFor:
      "You'll know it's landing when a big reach turns into a wobble, and a wobble turns into a roll.",
    supportsMilestones: ["Rolls from tummy to back", "Rolls from back to tummy"],
    safetyNote:
      "Whatever they roll to will go straight in the mouth — use only clean baby toys too large to swallow, never thin plastic film or wrappers.",
  },
  {
    id: "babble-back",
    title: "Babble back and forth",
    domain: "language",
    ageMonthsStart: 3,
    ageMonthsEnd: 6,
    durationMinutes: 5,
    materials: [],
    steps: [
      "Get face-to-face wherever you already are — changing table, couch, floor.",
      "When your baby makes a sound, copy it right back with a smile.",
      "Pause and wait for their next turn, like a real conversation.",
      "Sneak in a new sound of your own and see if they study your mouth.",
    ],
    watchFor:
      "You'll know it's landing when your baby waits for your turn to end, then jumps back in with their own sound.",
    supportsMilestones: ["Takes turns vocalizing (back-and-forth)"],
  },
  {
    id: "sing-and-sway",
    title: "Sing and sway",
    domain: "language",
    ageMonthsStart: 3,
    ageMonthsEnd: 6,
    durationMinutes: 5,
    materials: [],
    steps: [
      "Hold your baby close and pick any song you know — nursery rhyme or your own favorite.",
      "Sing softly while swaying or gently bouncing to the beat.",
      "Stretch out the fun parts and pause before them — wait for a squeal or coo before you finish the line.",
      "Repeat the same songs often — familiarity is the point.",
    ],
    watchFor:
      "You'll know it's landing when your baby perks up at a familiar tune and joins in with squeals or wiggles.",
    supportsMilestones: ["Takes turns vocalizing (back-and-forth)"],
    interests: ["music", "movement"],
  },
  {
    id: "peekaboo-beginnings",
    title: "First peekaboo",
    domain: "cognitive",
    ageMonthsStart: 3,
    ageMonthsEnd: 6,
    durationMinutes: 4,
    materials: ["A burp cloth or small blanket"],
    steps: [
      "Sit face-to-face with your baby settled in a bouncer or on your lap.",
      "Hold the cloth in front of your face for just a second: \"Where did I go?\"",
      "Pop out with a warm \"Peekaboo!\" — keep it gentle, not startling.",
      "Repeat a few times, then let them tug the cloth off your face themselves.",
    ],
    watchFor:
      "You'll know it's landing when your baby starts grinning before you reappear — they're learning you come back.",
    supportsMilestones: ["Object permanence begins"],
  },
  {
    id: "giggle-games",
    title: "Giggle games",
    domain: "social",
    ageMonthsStart: 3,
    ageMonthsEnd: 6,
    durationMinutes: 4,
    materials: [],
    steps: [
      "Find your baby's laugh button — gentle raspberries on the tummy, a slow-build \"I'm gonna get you,\" or a silly sound.",
      "Do it once, then pause and watch their face light up in anticipation.",
      "Repeat the winner — babies adore predictable silliness.",
      "Wind down with cuddles when the giggles taper off.",
    ],
    watchFor:
      "You'll know it's landing when the anticipation alone — before you even do the thing — gets a squeal.",
    supportsMilestones: ["Laughs and squeals", "Enjoys playing with others"],
  },
  {
    id: "texture-touch-basket",
    title: "The texture basket",
    domain: "sensory",
    ageMonthsStart: 3,
    ageMonthsEnd: 6,
    durationMinutes: 6,
    materials: ["A wooden spoon", "A silicone spatula or whisk", "A crinkly clean cloth"],
    steps: [
      "Sit with your baby reclined against you or lying on a blanket.",
      "Offer one item at a time and let them grab, wave, and mouth it.",
      "Narrate the feel: \"smooth,\" \"bumpy,\" \"crinkly.\"",
      "Swap items when interest fades — variety keeps hands busy.",
    ],
    watchFor:
      "You'll know it's landing when your baby reaches for the next item before you've even offered it.",
    supportsMilestones: ["Reaches and grabs objects"],
    safetyNote:
      "Everything goes in the mouth at this age — offer only clean items too large to swallow, with no small or detachable parts, and stay close.",
  },

  // ── 6–9 months ──────────────────────────────────────────────────────────
  {
    id: "cushion-crawl-course",
    title: "The cushion crawl course",
    domain: "motor",
    ageMonthsStart: 6,
    ageMonthsEnd: 9,
    durationMinutes: 8,
    materials: ["Couch cushions or pillows", "A favorite toy"],
    steps: [
      "Lay a couple of cushions flat on the floor to make small, soft hills.",
      "Sit at the far end with the toy where your baby can see it.",
      "Call them over and cheer every scoot, wiggle, and army-crawl.",
      "Trade the toy for a hug when they arrive, then reset and go again.",
    ],
    watchFor:
      "You'll know it's landing when your baby finds their own way across — any style of crawl counts.",
    supportsMilestones: ["Crawls (or bottom-shuffles or commando-crawls)"],
  },
  {
    id: "pillow-nest-sitting",
    title: "The pillow nest",
    domain: "motor",
    ageMonthsStart: 6,
    ageMonthsEnd: 9,
    durationMinutes: 6,
    materials: ["Pillows or a folded blanket", "A toy or two"],
    steps: [
      "Build a ring of pillows on the floor and sit your baby in the middle.",
      "Place a toy in their lap, then one slightly to the side.",
      "Let them practice balancing and reaching — a tumble lands soft.",
      "Sit nearby and chat; your presence is the safety net and the cheering section.",
    ],
    watchFor:
      "You'll know it's landing when your baby sits a little longer and reaches a little farther each time.",
    supportsMilestones: ["Sits without support"],
    safetyNote:
      "Awake, supervised play only — never leave your baby propped in pillows, and clear them away if baby gets sleepy.",
  },
  {
    id: "spoon-swap",
    title: "The great spoon swap",
    domain: "motor",
    ageMonthsStart: 6,
    ageMonthsEnd: 9,
    durationMinutes: 4,
    materials: ["Two baby-safe spoons or teethers"],
    steps: [
      "Hand your baby one spoon and let them get a good grip.",
      "Offer the second spoon to the same hand that's already full.",
      "Watch them work out the puzzle — often by passing the first to the other hand.",
      "Swap sides and repeat; it's a workout disguised as a game.",
    ],
    watchFor:
      "You'll know it's landing when an object travels smoothly from one hand to the other.",
    supportsMilestones: ["Transfers objects hand to hand"],
  },
  {
    id: "narrate-your-day",
    title: "Sportscast your day",
    domain: "language",
    ageMonthsStart: 6,
    ageMonthsEnd: 9,
    durationMinutes: 5,
    materials: [],
    steps: [
      "Pick any routine you're already doing — laundry, dishes, a diaper change.",
      "Narrate it play-by-play in short, warm sentences: \"Up goes the sock! In the basket!\"",
      "Pause after your best lines and let your baby answer with babble.",
      "Echo their sounds back — \"ba-ba? Ball! Yes!\" — and keep the show going.",
    ],
    watchFor:
      "You'll know it's landing when the babble gets longer and new consonant sounds sneak in.",
    supportsMilestones: [
      "Babbles with consonants (ba, da, ma)",
      "Uses a variety of consonants in babble",
    ],
  },
  {
    id: "hide-and-reveal",
    title: "Half-hide, whole surprise",
    domain: "cognitive",
    ageMonthsStart: 6,
    ageMonthsEnd: 9,
    durationMinutes: 5,
    materials: ["A baby-safe toy too big to swallow", "A cloth or burp rag"],
    steps: [
      "Sit with your baby and let them watch you tuck a toy halfway under the cloth.",
      "Ask with big drama: \"Where did it go?\"",
      "Celebrate when they tug the cloth or grab the peeking end.",
      "Once that's easy, hide the toy completely and let them uncover the mystery.",
    ],
    watchFor:
      "You'll know it's landing when your baby goes looking for a toy they can no longer see.",
    supportsMilestones: ["Object permanence begins", "Finds fully hidden object"],
    safetyNote:
      "Hidden treasures get mouthed — choose a toy bigger than a toilet-paper-tube opening, with no small or detachable parts.",
  },
  {
    id: "name-game",
    title: "The name game",
    domain: "social",
    ageMonthsStart: 6,
    ageMonthsEnd: 9,
    durationMinutes: 3,
    materials: [],
    steps: [
      "While your baby plays on the floor, move a few steps to one side.",
      "Say their name once in a warm, happy voice — then wait.",
      "When they turn, light up: big smile, open arms, a little cheer.",
      "Try again from a new spot so the game stays fresh.",
    ],
    watchFor:
      "You'll know it's landing when their name alone earns you a head-turn and a grin.",
    supportsMilestones: ["Looks when you call her name"],
  },
  {
    id: "bath-splash-lab",
    title: "The splash lab",
    domain: "sensory",
    ageMonthsStart: 6,
    ageMonthsEnd: 9,
    durationMinutes: 8,
    materials: ["Bath or a shallow basin of warm water", "Plastic cups"],
    steps: [
      "During bath time, hand your baby a cup and keep one for yourself.",
      "Pour a slow trickle over their hand and narrate: \"drip, drip, drip.\"",
      "Let them slap, splash, and scoop however they like.",
      "Copy their splashes — being imitated is half the fun.",
    ],
    watchFor:
      "You'll know it's landing when your baby experiments on their own — big splash, small splash, pour and repeat.",
    supportsMilestones: [],
    safetyNote:
      "Never leave your baby alone in or near water, even for a moment — keep one hand within reach at all times.",
    interests: ["water_play"],
  },

  // ── 9–12 months ─────────────────────────────────────────────────────────
  {
    id: "cruise-the-couch",
    title: "The couch cruise",
    domain: "motor",
    ageMonthsStart: 9,
    ageMonthsEnd: 12,
    durationMinutes: 8,
    materials: ["A sturdy couch or low table", "A favorite toy"],
    steps: [
      "Place the toy on the couch cushion just out of reach to one side.",
      "Help your baby pull up to standing at the couch if they'd like a boost.",
      "Cheer each sideways step as they cruise toward the prize.",
      "Slide the toy a little farther along to keep the journey going.",
    ],
    watchFor:
      "You'll know it's landing when your baby lets go with one hand — or stands solo for a beat — to grab the toy.",
    supportsMilestones: ["Pulls to standing", "Stands alone briefly"],
    safetyNote:
      "Clear sharp corners and hard objects from the landing zone, use furniture that won't tip, and stay within arm's reach.",
  },
  {
    id: "tiny-bites-pickup",
    title: "Tiny bites, big skills",
    domain: "motor",
    ageMonthsStart: 9,
    ageMonthsEnd: 12,
    durationMinutes: 10,
    materials: ["A few soft finger foods (banana pieces, well-cooked veggie bits)", "High chair"],
    steps: [
      "Seat your baby in the high chair and scatter a few soft pieces on the tray.",
      "Let them work at picking each piece up — the fumbling is the practice.",
      "Name each food as it (eventually) reaches the mouth.",
      "Add a couple more pieces at a time to keep frustration low.",
    ],
    watchFor:
      "You'll know it's landing when the whole-hand rake turns into a neat thumb-and-finger pinch.",
    supportsMilestones: ["Pincer grasp (thumb + finger)", "Feeds self finger foods"],
    safetyNote:
      "Serve only soft, age-appropriate pieces, always with your baby seated upright and you watching — never leave a baby alone while eating.",
    interests: ["food_exploring"],
  },
  {
    id: "board-book-chatter",
    title: "Board book chatter",
    domain: "language",
    ageMonthsStart: 9,
    ageMonthsEnd: 12,
    durationMinutes: 6,
    materials: ["Any board book"],
    steps: [
      "Settle your baby on your lap with a board book — the same one every day is great.",
      "Point to one picture per page and name it simply: \"Dog! Woof woof.\"",
      "Pause on their favorite page and wait for a point, pat, or sound.",
      "Follow their lead — skipping pages and reading backwards totally count.",
    ],
    watchFor:
      "You'll know it's landing when your baby pats a picture or makes a sound for a favorite page before you name it.",
    supportsMilestones: [
      "Looks where you point (joint attention)",
      "Uses 1–3 words besides \"mama\"/\"dada\"",
    ],
    interests: ["books"],
  },
  {
    id: "point-and-name-walk",
    title: "The point-and-name walk",
    domain: "language",
    ageMonthsStart: 9,
    ageMonthsEnd: 12,
    durationMinutes: 8,
    materials: [],
    steps: [
      "Carry your baby on a slow lap around the house or yard.",
      "Point at something interesting, wait for them to look, then name it: \"Light!\"",
      "When your baby points or reaches at anything, treat it as a question and answer it.",
      "Revisit favorites — babies love hearing the same words land in the same places.",
    ],
    watchFor:
      "You'll know it's landing when your baby follows your point with their eyes — and starts pointing to ask you for words.",
    supportsMilestones: [
      "Points to ask for something or get help",
      "Looks where you point (joint attention)",
    ],
    interests: ["outdoors"],
  },
  {
    id: "cup-hide-and-seek",
    title: "Cup hide-and-seek",
    domain: "cognitive",
    ageMonthsStart: 9,
    ageMonthsEnd: 12,
    durationMinutes: 5,
    materials: ["Two plastic cups", "A baby-safe toy that fits underneath but is too big to swallow"],
    steps: [
      "Sit face-to-face and let your baby watch you hide the toy under one cup.",
      "Ask \"Where is it?\" and let them knock over or lift the cup.",
      "Celebrate the discovery like it's magic — because to them, it is.",
      "Once they're winning every time, slide the cups around slowly to raise the stakes.",
    ],
    watchFor:
      "You'll know it's landing when your baby goes straight for the right cup with total confidence.",
    supportsMilestones: ["Finds fully hidden object"],
    safetyNote:
      "The hidden toy will be mouthed — pick one bigger than a toilet-paper-tube opening, with no small or detachable parts.",
  },
  {
    id: "wave-and-clap-copycat",
    title: "Copycat club",
    domain: "social",
    ageMonthsStart: 9,
    ageMonthsEnd: 12,
    durationMinutes: 4,
    materials: [],
    steps: [
      "Sit face-to-face and do one simple action: clap, wave, or pat the floor.",
      "Wait with an expectant smile — give them a real chance to try it.",
      "Celebrate any attempt, even a vague hand flap in the right direction.",
      "Trade turns: copy whatever they do, then offer your move again.",
    ],
    watchFor:
      "You'll know it's landing when your baby starts the game themselves — clapping or waving to get you to join in.",
    supportsMilestones: ["Imitates actions", "Waves bye-bye"],
  },
  {
    id: "basket-of-surprises",
    title: "The basket of surprises",
    domain: "sensory",
    ageMonthsStart: 9,
    ageMonthsEnd: 12,
    durationMinutes: 8,
    materials: ["A laundry basket or box", "Safe household items: wooden spoon, silicone lid, clean sponge, small towel"],
    steps: [
      "Fill the basket with a handful of interesting, safe household objects.",
      "Set it in front of your seated baby and let them dig in.",
      "Narrate what they find: \"A squishy sponge! A cold lid!\"",
      "Rotate in a couple of new items tomorrow to keep the basket exciting.",
    ],
    watchFor:
      "You'll know it's landing when your baby empties the basket item by item, examining each one like a tiny scientist.",
    supportsMilestones: [],
    safetyNote:
      "Choose items too large to be a choking hazard (bigger than a toilet-paper tube opening), with no sharp edges or loose parts, and stay nearby.",
  },

  // ── 12–18 months ────────────────────────────────────────────────────────
  {
    id: "basket-push-walk",
    title: "The basket push",
    domain: "motor",
    ageMonthsStart: 12,
    ageMonthsEnd: 18,
    durationMinutes: 8,
    materials: ["A laundry basket", "A few soft items to weigh it down"],
    steps: [
      "Add a blanket or a few soft toys to the basket for a little resistance.",
      "Stand it on a carpet or rug and show your toddler how to push it.",
      "Walk alongside as they steer their 'delivery' across the room.",
      "Give them drop-off missions: \"Can you drive the teddy to the couch?\"",
    ],
    watchFor:
      "You'll know it's landing when the pushing turns into confident free walking between deliveries.",
    supportsMilestones: ["Walks independently"],
    interests: ["movement"],
  },
  {
    id: "chunky-crayon-scribbles",
    title: "First scribbles",
    domain: "motor",
    ageMonthsStart: 12,
    ageMonthsEnd: 18,
    durationMinutes: 5,
    materials: ["A chunky toddler crayon", "A big piece of paper taped to the table or floor"],
    steps: [
      "Tape the paper down so it stays put and hand over one chunky crayon.",
      "Make a slow scribble of your own and say what you see: \"Round and round!\"",
      "Let them make marks any way they like — fist grip is perfect at this age.",
      "Celebrate every mark and hang a favorite on the fridge.",
    ],
    watchFor:
      "You'll know it's landing when your toddler makes marks on purpose and looks up to show you what appeared.",
    supportsMilestones: ["Scribbles spontaneously"],
    safetyNote:
      "Crayons get mouthed at this age — use chunky, non-toxic toddler crayons and stay within arm's reach.",
    interests: ["building"],
  },
  {
    id: "two-block-towers",
    title: "Tower up, crash down",
    domain: "motor",
    ageMonthsStart: 12,
    ageMonthsEnd: 18,
    durationMinutes: 6,
    materials: ["Blocks, or stackable cups and small boxes"],
    steps: [
      "Sit on the floor and stack two blocks slowly while your toddler watches.",
      "Hand them a block and invite them to add to your tower.",
      "Celebrate every stack — and cheer the crash just as loudly.",
      "Rebuild together, adding one more block than last time.",
    ],
    watchFor:
      "You'll know it's landing when your toddler steadies a block on top all by themselves — then looks up for applause.",
    supportsMilestones: ["Stacks 2 blocks", "Stacks 4+ blocks"],
    interests: ["building"],
  },
  {
    id: "little-helper-requests",
    title: "Little helper missions",
    domain: "language",
    ageMonthsStart: 12,
    ageMonthsEnd: 18,
    durationMinutes: 5,
    materials: ["Everyday objects already lying around"],
    steps: [
      "During play or tidy-up, give one simple request without pointing: \"Bring me the ball.\"",
      "Wait — give them a full beat to process before repeating.",
      "Thank them like they just saved the day, whatever arrives.",
      "Work missions into real routines: \"Put the cup on the table,\" \"Get your shoe.\"",
    ],
    watchFor:
      "You'll know it's landing when your toddler completes a request from your words alone — no pointing needed.",
    supportsMilestones: ["Follows one-step directions without gesture"],
  },
  {
    id: "page-turner-storytime",
    title: "You turn the page",
    domain: "language",
    ageMonthsStart: 12,
    ageMonthsEnd: 18,
    durationMinutes: 8,
    materials: ["A sturdy board book"],
    steps: [
      "Snuggle up with a board book and make your toddler the official page-turner.",
      "Read a line, then wait for them to flip to the next page.",
      "Name what they point at, and add one word to whatever they say: \"Duck! Yellow duck!\"",
      "Let them pick the same book again — repetition is how words stick.",
    ],
    watchFor:
      "You'll know it's landing when your toddler turns pages on cue and chimes in with words for familiar pictures.",
    supportsMilestones: ["Turns pages of a board book", "Uses 10+ different words"],
    interests: ["books"],
  },
  {
    id: "head-shoulders-tap",
    title: "Head, shoulders, tap tap tap",
    domain: "cognitive",
    ageMonthsStart: 12,
    ageMonthsEnd: 18,
    durationMinutes: 4,
    materials: [],
    steps: [
      "Sing a slow \"Head, Shoulders, Knees and Toes\" — or any body-part song in your home language — tapping each part on yourself.",
      "Take their hands and gently guide the taps on their own head and toes.",
      "Then ask playfully: \"Where's your nose?\" and wait.",
      "Cheer every correct tap — and every enthusiastic wrong one too.",
    ],
    watchFor:
      "You'll know it's landing when \"Where's your tummy?\" gets a proud pat without any help.",
    supportsMilestones: ["Points to body parts when asked"],
    interests: ["music", "movement"],
  },
  {
    id: "show-and-share",
    title: "Show me what you found",
    domain: "social",
    ageMonthsStart: 12,
    ageMonthsEnd: 18,
    durationMinutes: 5,
    materials: ["Whatever your toddler is already playing with"],
    steps: [
      "When your toddler holds something up to you, stop and give it your full attention.",
      "Name it, admire it, and hand it back: \"Wow, a red cup! Thank you for showing me.\"",
      "Take a turn: bring them something interesting and show it the same way.",
      "Keep the trading loop going as long as they're delighted.",
    ],
    watchFor:
      "You'll know it's landing when your toddler crosses the room just to show you a treasure — sharing the moment is the whole point.",
    supportsMilestones: ["Shows objects to share interest"],
  },
  {
    id: "pour-and-splash",
    title: "Pour and splash station",
    domain: "sensory",
    ageMonthsStart: 12,
    ageMonthsEnd: 18,
    durationMinutes: 10,
    materials: ["Bath or a shallow basin of water", "Cups and a spoon or ladle"],
    steps: [
      "At bath time, hand over two cups and a big spoon.",
      "Show one slow pour from cup to cup, then hand it all over.",
      "Narrate the physics: \"Full... empty! Big splash... little splash.\"",
      "Let them run the experiments — spills are the curriculum.",
    ],
    watchFor:
      "You'll know it's landing when your toddler pours cup to cup on purpose, watching the water the whole way down.",
    supportsMilestones: [],
    safetyNote:
      "Stay within arm's reach the entire time — never leave a child alone in or near water, even shallow water.",
    interests: ["water_play"],
  },

  // ── 18–24 months ────────────────────────────────────────────────────────
  {
    id: "hallway-soccer",
    title: "Hallway soccer",
    domain: "motor",
    ageMonthsStart: 18,
    ageMonthsEnd: 24,
    durationMinutes: 8,
    materials: ["A soft ball (or rolled-up socks)", "A laundry basket for a goal"],
    steps: [
      "Tip the laundry basket on its side at the end of the hall — that's the goal.",
      "Show one slow kick, then pass the ball to your toddler's feet.",
      "Cheer every kick, chase, and near-miss as they run it down.",
      "Trade jobs: you kick, they fetch — running both ways counts double.",
    ],
    watchFor:
      "You'll know it's landing when your toddler kicks on the move instead of stopping to think about it first.",
    supportsMilestones: ["Kicks a ball", "Runs (stiffly at first)"],
    interests: ["movement"],
  },
  {
    id: "add-a-word",
    title: "The add-a-word game",
    domain: "language",
    ageMonthsStart: 18,
    ageMonthsEnd: 24,
    durationMinutes: 5,
    materials: [],
    steps: [
      "During any play, listen for your toddler's single words: \"car,\" \"milk,\" \"dog.\"",
      "Bounce each one back with exactly one word added: \"Fast car!\" \"More milk?\"",
      "Keep your tone playful — you're echoing, not correcting.",
      "Leave a pause after your version; sometimes the bigger phrase comes right back.",
    ],
    watchFor:
      "You'll know it's landing when two words start arriving together — \"more milk,\" \"daddy go,\" \"big truck.\"",
    supportsMilestones: ["Combines two words (\"more milk\", \"go bye-bye\")"],
  },
  {
    id: "finish-the-song",
    title: "Finish the song",
    domain: "language",
    ageMonthsStart: 18,
    ageMonthsEnd: 24,
    durationMinutes: 4,
    materials: [],
    steps: [
      "Sing a song your toddler knows by heart — \"Twinkle, Twinkle\" or any song in your home language is perfect.",
      "Stop right before the last word of a line: \"Twinkle, twinkle, little...\"",
      "Wait with raised eyebrows and let them fill in the blank.",
      "Celebrate the word, finish the verse together, and pick a new line to leave open.",
    ],
    watchFor:
      "You'll know it's landing when your toddler fills the gap before you can — and starts leaving gaps for you to finish.",
    supportsMilestones: ["Has a vocabulary of about 50 words"],
    interests: ["music"],
  },
  {
    id: "sock-sort-helper",
    title: "The sock sorting crew",
    domain: "cognitive",
    ageMonthsStart: 18,
    ageMonthsEnd: 24,
    durationMinutes: 6,
    materials: ["Clean laundry — socks in two easy-to-tell-apart colors or sizes"],
    steps: [
      "Dump a small pile of socks between you on the floor.",
      "Start two piles: \"Big socks here, little socks there.\"",
      "Hand them one sock at a time and let them choose the pile.",
      "Narrate the wins: \"Yes! Another big one!\" Mixed-up piles are still a win.",
    ],
    watchFor:
      "You'll know it's landing when your toddler sorts a few in a row on their own — and starts correcting your pile.",
    supportsMilestones: ["Sorts shapes and colors (simple sorting)"],
  },
  {
    id: "stuffed-animal-snack-time",
    title: "Snack time for teddy",
    domain: "cognitive",
    ageMonthsStart: 18,
    ageMonthsEnd: 24,
    durationMinutes: 6,
    materials: ["A stuffed animal or doll", "A cup, bowl, and spoon"],
    steps: [
      "Announce that teddy is hungry and set out the cup and spoon.",
      "Pretend to feed teddy a spoonful, with sound effects: \"Mmm, yummy!\"",
      "Hand over the spoon and let your toddler take over the feeding.",
      "Extend the story: teddy is thirsty, teddy is sleepy, teddy needs a burp.",
    ],
    watchFor:
      "You'll know it's landing when your toddler invents the next part of the story — wiping teddy's chin or putting him to bed.",
    supportsMilestones: ["Pretend play (feeds doll, talks on toy phone)"],
    interests: ["pretend_play"],
  },
  {
    id: "double-bin-play",
    title: "Side-by-side play bins",
    domain: "social",
    ageMonthsStart: 18,
    ageMonthsEnd: 24,
    durationMinutes: 10,
    materials: ["Two bins or boxes with matching sets of items (blocks, cups, animals)"],
    steps: [
      "When a sibling or friend is around, set out two matching bins side by side.",
      "Let each child dig into their own bin — no sharing required yet.",
      "Sit nearby and narrate what each is building or doing.",
      "Notice out loud when one copies the other: \"You're both making towers!\"",
    ],
    watchFor:
      "You'll know it's landing when the kids glance at each other's play and start borrowing ideas — playing next to each other is real social learning.",
    supportsMilestones: ["Plays next to other children (parallel play)", "Copies other children"],
  },
  {
    id: "nature-treasure-walk",
    title: "The nature treasure walk",
    domain: "sensory",
    ageMonthsStart: 18,
    ageMonthsEnd: 24,
    durationMinutes: 15,
    materials: ["A small bag or bucket for treasures"],
    steps: [
      "Head to the yard, sidewalk, or park at toddler pace — slow is the point.",
      "Hunt for treasures together: a crunchy leaf, a smooth stone, a stick.",
      "Let them feel each find and name the sensation: \"bumpy,\" \"cold,\" \"crunchy.\"",
      "Collect a few favorites in the bucket to show someone at home.",
    ],
    watchFor:
      "You'll know it's landing when your toddler starts spotting and offering treasures to you before you point them out.",
    supportsMilestones: [],
    safetyNote:
      "Small nature finds like pebbles and acorns can end up in mouths — stay close and choose treasures too big to swallow.",
    interests: ["outdoors"],
  },

  // ── 24–36 months ────────────────────────────────────────────────────────
  {
    id: "animal-walk-parade",
    title: "The animal walk parade",
    domain: "motor",
    ageMonthsStart: 24,
    ageMonthsEnd: 36,
    durationMinutes: 8,
    materials: [],
    steps: [
      "Call out an animal and do the walk together: stomp like a bear, hop like a frog.",
      "Add sounds — every hop deserves a \"ribbit!\"",
      "Let your toddler pick the next animal and copy whatever they invent.",
      "Parade from room to room until somebody (probably you) needs a rest.",
    ],
    watchFor:
      "You'll know it's landing when both feet leave the ground together on those frog jumps.",
    supportsMilestones: ["Jumps with both feet"],
    interests: ["animals", "movement"],
  },
  {
    id: "pillow-jump-landing",
    title: "The big jump landing pad",
    domain: "motor",
    ageMonthsStart: 24,
    ageMonthsEnd: 36,
    durationMinutes: 8,
    materials: ["Couch cushions or a folded comforter"],
    steps: [
      "Lay cushions flat on the floor to make a soft landing pad.",
      "Count down together — \"3, 2, 1, jump!\" — and jump onto the pad from standing.",
      "Cheer two-foot takeoffs and dramatic crash landings alike.",
      "Add flair: jump like a rocket, jump like a kangaroo, biggest jump ever.",
    ],
    watchFor:
      "You'll know it's landing (literally) when your toddler takes off and lands with both feet together.",
    supportsMilestones: ["Jumps with both feet"],
    safetyNote:
      "Jump from floor level only — not from furniture — and keep the landing zone clear of hard toys and table corners.",
    interests: ["movement"],
  },
  {
    id: "story-stretch",
    title: "Stretch the story",
    domain: "language",
    ageMonthsStart: 24,
    ageMonthsEnd: 36,
    durationMinutes: 10,
    materials: ["Any favorite picture book"],
    steps: [
      "Read a familiar book, but pause on each page to wonder out loud: \"What's the bear doing?\"",
      "Give your toddler time to answer, then build on it: \"Yes! The bear is eating honey.\"",
      "Ask one \"what happens next?\" before the page turn.",
      "Let them 'read' a favorite page to you from memory — every version is correct.",
    ],
    watchFor:
      "You'll know it's landing when answers grow into little sentences — \"bear eat honey!\" — and they narrate pages on their own.",
    supportsMilestones: ["Uses 3+ word sentences"],
    interests: ["books"],
  },
  {
    id: "two-step-treasure-hunt",
    title: "The two-step treasure hunt",
    domain: "language",
    ageMonthsStart: 24,
    ageMonthsEnd: 36,
    durationMinutes: 6,
    materials: ["A toy to hide — big enough not to be a mouthing risk"],
    steps: [
      "Hide a toy somewhere easy while your toddler watches you leave the room with it.",
      "Give a two-part mission: \"Look under the pillow, then bring it to me.\"",
      "Wait and let them hold both steps in their head — resist re-explaining too fast.",
      "Celebrate the delivery, then let them hide it and give YOU the two-step mission.",
    ],
    watchFor:
      "You'll know it's landing when both steps happen in order from a single telling.",
    supportsMilestones: ["Follows two-step directions"],
  },
  {
    id: "cereal-box-puzzle",
    title: "The cereal box puzzle",
    domain: "cognitive",
    ageMonthsStart: 24,
    ageMonthsEnd: 36,
    durationMinutes: 8,
    materials: ["An empty cereal or snack box front, cut into 2–4 big pieces"],
    steps: [
      "Cut the colorful front panel of a cereal box into two big pieces (work up to four).",
      "Show the finished picture first, then scramble the pieces.",
      "Let your toddler slide and flip the pieces until the picture comes back together.",
      "Celebrate the solve, then cut a fresh box into one more piece than last time.",
    ],
    watchFor:
      "You'll know it's landing when pieces get rotated and placed with intent — your toddler can see the whole picture in their head.",
    supportsMilestones: ["Completes simple 2–4 piece puzzles"],
  },
  {
    id: "pretend-restaurant",
    title: "The living room restaurant",
    domain: "social",
    ageMonthsStart: 24,
    ageMonthsEnd: 36,
    durationMinutes: 10,
    materials: ["Plastic cups, bowls, and spoons", "Stuffed animals as extra customers"],
    steps: [
      "Sit down as the hungry customer and ask, \"What's cooking today?\"",
      "Order elaborately and wait while your chef prepares invisible food.",
      "React big to every dish: \"Mmm! The best soup in town!\"",
      "Swap roles — you cook, they order — and seat some stuffed-animal customers too.",
    ],
    watchFor:
      "You'll know it's landing when your toddler runs the restaurant in full sentences — taking orders, describing dishes, and inventing the menu.",
    supportsMilestones: ["Uses 3+ word sentences"],
    interests: ["pretend_play"],
  },
  {
    id: "oat-scoop-station",
    title: "The oat scoop station",
    domain: "sensory",
    ageMonthsStart: 24,
    ageMonthsEnd: 36,
    durationMinutes: 10,
    materials: ["A baking tray or big bowl", "Dry oats", "Cups and spoons"],
    steps: [
      "Pour a layer of dry oats into the tray and add cups and spoons.",
      "Show one scoop-and-pour, then hand the tools over.",
      "Narrate the work: \"Scoop... pour... all full! All empty!\"",
      "Bury a toy (too large to swallow) in the oats for a treasure dig before cleanup.",
    ],
    watchFor:
      "You'll know it's landing when your toddler settles into focused scooping, pouring, and digging — deep concentration is the win.",
    supportsMilestones: [],
    safetyNote:
      "Use a taste-safe filler like oats, keep play seated at a table or mat, and stay with your child throughout.",
    interests: ["food_exploring"],
  },
];

/** All activities whose age band includes the given age (inclusive on both ends). */
export function getActivitiesForAge(ageMonths: number): Activity[] {
  return ACTIVITY_LIBRARY.filter((a) => ageMonths >= a.ageMonthsStart && ageMonths <= a.ageMonthsEnd);
}

/** Activities whose band starts soon — within (ageMonths, ageMonths + 3]. */
export function getUpcomingActivities(ageMonths: number): Activity[] {
  return ACTIVITY_LIBRARY.filter(
    (a) => a.ageMonthsStart > ageMonths && a.ageMonthsStart <= ageMonths + 3,
  );
}

/** Activities whose band already ended before the given age. */
export function getEarlierActivities(ageMonths: number): Activity[] {
  return ACTIVITY_LIBRARY.filter((a) => a.ageMonthsEnd < ageMonths);
}
