import { getAgeInMonths, getAgeInWeeks } from "@/hooks/useChildren";

export type DevDomain = "motor" | "sensory" | "language" | "cognitive" | "social" | "feeding";

export interface DevBullet {
  domain: DevDomain;
  text: string;
}

export interface DevContentEntry {
  /** Unit of the age bucket */
  unit: "week" | "month";
  /** The bucket value, e.g. 3 for "Week 3", 5 for "Month 5" */
  value: number;
  /** Short display label, e.g. "Week 3" or "Month 5" */
  ageLabel: string;
  /** Warm, short title */
  title: string;
  bullets: DevBullet[];
  /** One practical try-this-week tip */
  tip: string;
}

export const DEV_CONTENT_DISCLAIMER =
  "Every baby grows on their own timeline — these are gentle ideas of what's ahead, not a checklist.";

export const DEVELOPMENT_CONTENT: DevContentEntry[] = [
  {
    unit: "week",
    value: 1,
    ageLabel: "Week 1",
    title: "Hello, world",
    bullets: [
      { domain: "motor", text: "Your baby moves in reflexes — startles, grasps a finger, turns toward a cheek touch." },
      { domain: "sensory", text: "They see best about 8–12 inches away, just far enough to find your face." },
      { domain: "social", text: "Your voice and smell are already familiar and calming." },
    ],
    tip: "Hold your baby close and let them study your face during quiet, alert moments. No props needed.",
  },
  {
    unit: "week",
    value: 2,
    ageLabel: "Week 2",
    title: "Settling in",
    bullets: [
      { domain: "motor", text: "Brief, jerky arm and leg movements smooth out a little day by day." },
      { domain: "sensory", text: "High-contrast patterns and your face hold their gaze longest." },
      { domain: "social", text: "Your baby may quiet to a familiar voice mid-cry." },
    ],
    tip: "Try a few minutes of tummy time on your chest while you recline — your face is the reward.",
  },
  {
    unit: "week",
    value: 3,
    ageLabel: "Week 3",
    title: "Tuning in",
    bullets: [
      { domain: "motor", text: "On their tummy, your baby may briefly lift and turn their head to clear their nose." },
      { domain: "sensory", text: "They track a slow-moving face or object a short way side to side." },
      { domain: "social", text: "Crying may start to have different 'flavors' — hungry, tired, uncomfortable." },
    ],
    tip: "Move your face slowly side to side during cuddles and let them follow you.",
  },
  {
    unit: "week",
    value: 4,
    ageLabel: "Week 4",
    title: "One month in",
    bullets: [
      { domain: "motor", text: "Bursts of arm and leg movement; hands stay mostly fisted." },
      { domain: "sensory", text: "Your baby holds eye contact a little longer each day." },
      { domain: "language", text: "First throaty, gurgly sounds beyond crying may appear." },
    ],
    tip: "Talk through your routine out loud — narrating diaper changes builds the rhythm of conversation.",
  },
  {
    unit: "week",
    value: 5,
    ageLabel: "Week 5",
    title: "Warming up",
    bullets: [
      { domain: "social", text: "Your baby may settle when picked up or spoken to — early signs of being soothed by you." },
      { domain: "sensory", text: "They begin to prefer your face over other objects." },
      { domain: "motor", text: "Tummy time head-lifts get a touch higher and steadier." },
    ],
    tip: "Get face-to-face on the floor during tummy time so there's something wonderful to look up at.",
  },
  {
    unit: "week",
    value: 6,
    ageLabel: "Week 6",
    title: "The first smiles",
    bullets: [
      { domain: "social", text: "Your baby may flash their first real social smile in response to you." },
      { domain: "language", text: "Cooing — soft vowel sounds like 'ahh' and 'ooh' — may begin." },
      { domain: "sensory", text: "They follow your face past the midline now." },
    ],
    tip: "Smile, pause, and wait. Give your baby a few seconds to 'answer' — that pause teaches turn-taking.",
  },
  {
    unit: "week",
    value: 7,
    ageLabel: "Week 7",
    title: "Finding their voice",
    bullets: [
      { domain: "language", text: "More cooing; your baby may 'talk back' when you speak to them." },
      { domain: "social", text: "Smiles come more easily and more often." },
      { domain: "motor", text: "Hands open more and bat loosely toward things in view." },
    ],
    tip: "Have a back-and-forth 'chat' — you say something, wait, then respond to their coo as if it meant something.",
  },
  {
    unit: "week",
    value: 8,
    ageLabel: "Week 8",
    title: "Two months strong",
    bullets: [
      { domain: "motor", text: "During tummy time, your baby may lift their head to about 45 degrees." },
      { domain: "sensory", text: "They watch faces intently and follow movement smoothly." },
      { domain: "social", text: "Smiling at people is becoming a favorite activity." },
    ],
    tip: "Lay your baby under a play gym or dangle a soft item just within reach to invite batting.",
  },
  {
    unit: "week",
    value: 9,
    ageLabel: "Week 9",
    title: "Reaching out",
    bullets: [
      { domain: "motor", text: "Swipes at hanging objects become more frequent, if not yet accurate." },
      { domain: "language", text: "Coos turn into longer 'conversations' with squeals mixed in." },
      { domain: "cognitive", text: "Your baby starts to notice their own hands." },
    ],
    tip: "Hold a lightweight rattle or scrunched paper near their hand and let them swat and connect.",
  },
  {
    unit: "week",
    value: 10,
    ageLabel: "Week 10",
    title: "Steadier and stronger",
    bullets: [
      { domain: "motor", text: "Head control improves; less wobble when held upright against your shoulder." },
      { domain: "sensory", text: "Bright colors and faces draw long, focused looks." },
      { domain: "social", text: "Your baby may smile and 'chat' to get your attention." },
    ],
    tip: "Carry your baby upright facing out for short stretches so they can take in the room.",
  },
  {
    unit: "week",
    value: 11,
    ageLabel: "Week 11",
    title: "Discovering hands",
    bullets: [
      { domain: "motor", text: "Hands meet at the middle of the body and may travel to the mouth." },
      { domain: "cognitive", text: "Your baby studies their own fingers like a new toy." },
      { domain: "language", text: "Vowel sounds get more varied and musical." },
    ],
    tip: "Gently bring their hands together at the midline during play to support this discovery.",
  },
  {
    unit: "week",
    value: 12,
    ageLabel: "Week 12",
    title: "Three months of you",
    bullets: [
      { domain: "motor", text: "Steady head control when upright; pushes up on forearms during tummy time." },
      { domain: "social", text: "Big, easy smiles and even early belly laughs may appear." },
      { domain: "language", text: "Cooing is in full swing, with squeals and gurgles." },
    ],
    tip: "Read aloud daily — it doesn't matter that they don't understand the words; your voice and the rhythm are the gift.",
  },
  {
    unit: "month",
    value: 4,
    ageLabel: "Month 4",
    title: "Rolling into action",
    bullets: [
      { domain: "motor", text: "Your baby may start rolling from tummy to back and pushing up on straight arms." },
      { domain: "sensory", text: "They reach for and grab toys, often bringing them to the mouth to explore." },
      { domain: "language", text: "Babbling begins — 'ah-goo,' raspberries, and copying tones." },
    ],
    tip: "Place a favorite item just out of reach to one side to invite rolling and reaching.",
  },
  {
    unit: "month",
    value: 5,
    ageLabel: "Month 5",
    title: "Grab and explore",
    bullets: [
      { domain: "motor", text: "Reaching becomes purposeful; your baby may pass a toy hand to hand." },
      { domain: "cognitive", text: "Everything goes in the mouth — that's how babies investigate the world." },
      { domain: "social", text: "They respond to their name and to familiar faces with delight." },
    ],
    tip: "Offer safe, varied textures — a wooden spoon, a silicone whisk, a crinkly cloth — for hands-on discovery.",
  },
  {
    unit: "month",
    value: 6,
    ageLabel: "Month 6",
    title: "Sitting up to the world",
    bullets: [
      { domain: "motor", text: "Your baby may sit with support, or briefly on their own, propped on hands." },
      { domain: "feeding", text: "Many babies show signs of readiness for first foods — sitting with support, interest in your plate, no more tongue-thrust." },
      { domain: "language", text: "Babbling adds consonants — 'ba,' 'da,' 'ma.'" },
    ],
    tip: "Try short, supported sitting sessions surrounded by pillows so a tumble is a soft landing.",
  },
  {
    unit: "month",
    value: 7,
    ageLabel: "Month 7",
    title: "On the move",
    bullets: [
      { domain: "motor", text: "Sitting gets steadier; some babies start rocking on hands and knees." },
      { domain: "cognitive", text: "Your baby looks for a toy they watched you hide — early object permanence." },
      { domain: "social", text: "Stranger awareness may begin; you are clearly the safe base." },
    ],
    tip: "Play peekaboo — it's a joyful first lesson that things (and you) come back.",
  },
  {
    unit: "month",
    value: 8,
    ageLabel: "Month 8",
    title: "Pincer practice",
    bullets: [
      { domain: "motor", text: "Crawling may emerge; a raking grasp starts refining toward thumb-and-finger." },
      { domain: "feeding", text: "Self-feeding soft finger foods becomes great fine-motor practice." },
      { domain: "language", text: "Strings of repeated babble — 'bababa,' 'mamama.'" },
    ],
    tip: "Offer a few soft, gummable finger foods so picking up small pieces becomes daily practice.",
  },
  {
    unit: "month",
    value: 9,
    ageLabel: "Month 9",
    title: "Pulling up",
    bullets: [
      { domain: "motor", text: "Your baby may pull to stand at furniture and sit themselves up from lying down." },
      { domain: "cognitive", text: "They look for dropped or hidden objects and copy gestures." },
      { domain: "social", text: "Waving and lifting arms to be picked up may appear." },
    ],
    tip: "Create a safe, sturdy surface at standing height to pull up on — a low couch cushion works.",
  },
  {
    unit: "month",
    value: 10,
    ageLabel: "Month 10",
    title: "Cruising along",
    bullets: [
      { domain: "motor", text: "Your baby may cruise sideways along furniture, holding on." },
      { domain: "language", text: "They may understand 'no' and respond to simple words like their name." },
      { domain: "social", text: "Games like clapping, peekaboo, and pat-a-cake become favorites." },
    ],
    tip: "Arrange stable furniture close together so there's a safe 'cruise route' across a room.",
  },
  {
    unit: "month",
    value: 11,
    ageLabel: "Month 11",
    title: "Almost there",
    bullets: [
      { domain: "motor", text: "Standing alone for a moment and squatting to pick things up may appear." },
      { domain: "cognitive", text: "Your baby puts objects in containers and takes them back out — endlessly." },
      { domain: "language", text: "A first clear word like 'mama' or 'dada' with meaning may emerge." },
    ],
    tip: "Give a cup and a few large blocks for filling and dumping — a deeply satisfying cognitive workout.",
  },
  {
    unit: "month",
    value: 12,
    ageLabel: "Month 12",
    title: "First birthday milestones",
    bullets: [
      { domain: "motor", text: "Many babies stand alone and may take their first independent steps." },
      { domain: "language", text: "One or a few meaningful words; lots of pointing and gesturing to communicate." },
      { domain: "social", text: "Your baby plays back-and-forth games and shows things to share interest." },
    ],
    tip: "Celebrate gestures as much as words — pointing and waving are real communication. Name what they point at.",
  },
  {
    unit: "month",
    value: 15,
    ageLabel: "Month 15",
    title: "Words and wobbles",
    bullets: [
      { domain: "motor", text: "Walking steadies; your baby may stoop, stand back up, and climb onto low furniture." },
      { domain: "language", text: "A handful of words and strong understanding of simple requests like 'give me the ball.'" },
      { domain: "cognitive", text: "Stacking two blocks and scribbling with a crayon may begin." },
    ],
    tip: "Hand over a chunky crayon and paper and let them scribble freely — process over picture.",
  },
  {
    unit: "month",
    value: 18,
    ageLabel: "Month 18",
    title: "Little explorer",
    bullets: [
      { domain: "motor", text: "Your baby may walk well, run a little stiffly, and walk up stairs holding a hand." },
      { domain: "language", text: "Vocabulary grows; pointing to name body parts or wants is common." },
      { domain: "social", text: "Pretend play begins — feeding a doll, 'talking' on a toy phone." },
    ],
    tip: "Join in pretend play — pretend to sip from an empty cup and pass it back. Imagination is learning.",
  },
  {
    unit: "month",
    value: 21,
    ageLabel: "Month 21",
    title: "Climbing and chatting",
    bullets: [
      { domain: "motor", text: "Kicking a ball forward and climbing on and off furniture may appear." },
      { domain: "language", text: "Two-word combinations like 'more milk' may start to emerge." },
      { domain: "social", text: "Your toddler notices other children and may play alongside them (parallel play)." },
    ],
    tip: "Set up a safe cushion-and-pillow course to climb over and crawl through indoors.",
  },
  {
    unit: "month",
    value: 24,
    ageLabel: "Month 24",
    title: "Full of words and wonder",
    bullets: [
      { domain: "motor", text: "Running, jumping in place, and walking up and down stairs may appear; building a tower of 4–6 blocks." },
      { domain: "language", text: "A vocabulary explosion — many words and two-word phrases come together." },
      { domain: "social", text: "Showing independence ('me do it'), copying others, and growing pretend play." },
    ],
    tip: "Narrate and expand — when they say 'doggie,' reply 'yes, a big brown doggie!' Stretching their words grows language.",
  },
];

interface ChildAgeInput {
  date_of_birth: string;
  is_premature?: boolean | null;
  due_date?: string | null;
}

const MONTHLY_BUCKETS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 18, 21, 24];

/**
 * Picks the developmental "what to expect" entry for a child's current age.
 * 0–12 weeks → weekly buckets (week 1 covers the first 7 days).
 * 13+ weeks → nearest monthly bucket at or below the child's age in months,
 * capped at the last available month. Returns null for not-yet-born children
 * or ages past the last bucket window.
 */
export function getDevelopmentContentForChild(
  child: ChildAgeInput | null | undefined,
): DevContentEntry | null {
  if (!child) return null;

  // Expected (not-yet-born) babies have no "this week" content yet.
  if (new Date(child.date_of_birth) > new Date()) return null;

  const isPremature = child.is_premature ?? false;
  const weeks = getAgeInWeeks(child.date_of_birth, isPremature, child.due_date);
  const months = getAgeInMonths(child.date_of_birth, isPremature, child.due_date);

  if (months < 4) {
    // differenceInWeeks of 0 means the baby is in their first week, so add 1.
    const weekBucket = Math.min(Math.max(weeks + 1, 1), 12);
    return (
      DEVELOPMENT_CONTENT.find((e) => e.unit === "week" && e.value === weekBucket) ?? null
    );
  }

  if (months > 24) return null;

  const monthBucket = MONTHLY_BUCKETS.filter((m) => m <= months).pop();
  if (monthBucket == null) return null;
  return (
    DEVELOPMENT_CONTENT.find((e) => e.unit === "month" && e.value === monthBucket) ?? null
  );
}
