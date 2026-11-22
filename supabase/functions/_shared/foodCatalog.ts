// Curated solid-food catalog for generate-meal-plan (founder decision
// 2026-11-22: the model PICKS foods from this vetted list; every
// safety-critical string a parent sees about a food — its allergens, size,
// shape and texture — comes from here, never from model prose).
//
// SINGLE SOURCE OF TRUTH. The edge function imports this file directly; the
// client imports it through src/lib/foodCatalog.ts (a re-export, not a copy),
// and src/test/foodCatalog.test.ts locks the invariants below. Edit content
// here only, in one PR, with nutrition review.
//
// Content: drafted by the nutrition advisor on 2026-11-22 (102 entries;
// sources AAP / CDC / WHO / FDA-EPA fish advice / NIAID 2017 / FASTER Act).
// Reviewer judgement calls worth knowing before editing:
//   * Prep text never names another allergen-containing food (no "spread on
//     toast"): prep is shown verbatim whatever the family's leave-out list is.
//   * Allergen tags are conservative: toast-strips carries wheat, milk, egg,
//     soy and sesame; pancakes wheat, milk, egg. Oats and infant oat cereal
//     carry none (label caveats in `notes`).
//   * Hazard foods (round fruit, firm legumes, carrot, apple, parsnip,
//     prunes, firm cheese, nut butters, meat strips) say "until at least age
//     4" in their 12+ baby-led strings.
//   * tempeh has minAgeMonths 9; its "6-8" strings read "Not offered at this
//     age." and must never be shown — eligibleFoods() filters by
//     minAgeMonths, so they can't be.
//   * Deliberately absent: honey, cow's milk to drink, whole nuts and seeds,
//     popcorn, hot dogs / sausages, ham, bacon, raw hard vegetables, lychee,
//     corn kernels, string cheese, imitation crab, liver, juice, processed
//     cheese.
// Open questions for a pediatric dietitian are in the PR / legal log (berry
// sizes, peas at 12+, peanut amount and high-risk path, tuna / rice / cottage
// cheese frequency, cassava and kidney-bean safety, brand allergen tags).
//
// Engineering edits after review (2026-11-22, flagged for the advisor): six
// prep strings named an allergen food the entry isn't tagged with, breaking
// the reviewer's own "no other allergen foods in prep" rule or reading
// ambiguously: almonds-ground 12+ "bake into soft muffins" -> "stir it into
// porridge"; ricotta 12+ "stirred into pasta or vegetables" -> "soft
// vegetables"; pinto-beans / corn-tortilla "soft tortilla" -> "soft corn
// tortilla"; rice-noodles "noodles" -> "rice noodles". Locked by
// foodCatalog.test.ts ("prep never names an allergen the food isn't tagged
// with").
//
// `notes` are for reviewers only; they are not shown or sent to the model.

import type { AllergenSlug, FoodCategory } from "./mealPlan.ts";

export const AGE_BANDS = ["6-8", "9-11", "12+"] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

export type CatalogFood = {
  slug: string;
  name: string;
  category: FoodCategory;
  allergens: AllergenSlug[];
  minAgeMonths: number;
  prep: {
    blw: Record<AgeBand, string>;
    traditional: Record<AgeBand, string>;
  };
  notes?: string;
};

/**
 * Engineering classification for the prompt's "at least 2 iron-rich foods"
 * rule: heme-iron meats and fish, legumes and tofu, and the iron-fortified
 * infant cereals (per the catalog notes and AAP iron guidance). Not shown to
 * parents.
 */
export const IRON_RICH_SLUGS: readonly string[] = [
  "ground-beef", "beef-strips-slow-cooked", "ground-lamb", "ground-turkey", "chicken-thigh",
  "sardines-boneless", "red-lentils", "brown-lentils", "black-beans", "kidney-beans",
  "pinto-beans", "white-beans", "chickpeas", "moong-dal", "tofu-firm",
  "oat-infant-cereal", "rice-infant-cereal", "wheat-infant-cereal",
];

/**
 * Per-plan frequency limits from the catalog review (arsenic in rice, mercury
 * in tuna): at most `maxIdeas` ideas in one weekly plan may contain any of
 * `slugs`. Enforced by sanitizePlan, and stated in the prompt.
 */
export const PLAN_LIMITS: readonly { id: string; slugs: readonly string[]; maxIdeas: number }[] = [
  { id: "canned_tuna", slugs: ["canned-light-tuna"], maxIdeas: 1 },
  { id: "rice", slugs: ["rice-infant-cereal", "rice", "congee", "rice-noodles", "idli"], maxIdeas: 1 },
];

/** No single food may appear in more than this many ideas of one plan. */
export const MAX_FOOD_REPEATS = 2;

export const FOOD_CATALOG: readonly CatalogFood[] = [
  {
    "slug": "avocado",
    "name": "Avocado",
    "category": "fruit",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Offer ripe avocado in thick spears about the width of two adult fingers. Leave a strip of skin on one end so your baby can grip it.",
        "9-11": "Cut ripe avocado into soft pea-size cubes your baby can pick up with thumb and finger. They should squish easily when pressed.",
        "12+": "Offer small, soft cubes or thin slices of ripe avocado, or mash it into a spread."
      },
      "traditional": {
        "6-8": "Mash ripe avocado with a fork until smooth, thinning with breast milk, formula or water if needed.",
        "9-11": "Mash ripe avocado, leaving soft lumps, or offer small soft cubes for your baby to pick up.",
        "12+": "Serve small, soft cubes of ripe avocado, or mash it as a spread."
      }
    },
    "notes": "Must be fully ripe; underripe avocado is firm and slippery."
  },
  {
    "slug": "banana",
    "name": "Banana",
    "category": "fruit",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Cut a ripe banana in half and peel the top part, leaving peel on the bottom as a handle. It should squish easily between your fingers.",
        "9-11": "Cut ripe banana into small soft pieces about the size of a chickpea for your baby to pick up.",
        "12+": "Offer bite-size soft pieces or coins cut in half. Ripe banana should squish easily when pressed."
      },
      "traditional": {
        "6-8": "Mash ripe banana until smooth, thinning with breast milk, formula or water if needed.",
        "9-11": "Mash ripe banana with a fork, leaving soft lumps, or offer small soft pieces.",
        "12+": "Serve bite-size soft pieces, or mash and stir into porridge."
      }
    }
  },
  {
    "slug": "pear",
    "name": "Pear",
    "category": "fruit",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Use a very ripe pear that squishes between your thumb and finger, or steam firm pear until soft. Peel and cut into finger-length wedges.",
        "9-11": "Peel very ripe or steamed pear and cut into small soft pieces. Firm raw pear is too hard, so cook it until it squishes.",
        "12+": "Offer small soft pieces of very ripe pear. Steam or finely grate firm pear until at least age 4."
      },
      "traditional": {
        "6-8": "Peel, core and steam pear until very soft, then purée until smooth.",
        "9-11": "Mash very ripe or steamed pear, leaving soft lumps.",
        "12+": "Serve small soft pieces of ripe or steamed pear, or finely grated pear."
      }
    },
    "notes": "Firm raw pear is treated like raw apple (hard fruit)."
  },
  {
    "slug": "apple",
    "name": "Apple (cooked or grated)",
    "category": "fruit",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Raw apple is a choking hazard. Peel, core and steam or bake apple wedges until they squish easily between your thumb and finger.",
        "9-11": "Cook apple until soft, then cut into small pieces, or finely grate raw apple. Never offer raw apple slices or chunks.",
        "12+": "Keep apple cooked soft or finely grated until at least age 4. Raw slices and chunks are a choking hazard."
      },
      "traditional": {
        "6-8": "Peel, core and steam apple until very soft, then purée until smooth.",
        "9-11": "Mash cooked apple, leaving soft lumps, or stir in finely grated raw apple.",
        "12+": "Serve soft-cooked pieces or finely grated raw apple. Avoid raw chunks until at least age 4."
      }
    },
    "notes": "CDC lists raw apple as a choking hazard."
  },
  {
    "slug": "applesauce-unsweetened",
    "name": "Unsweetened applesauce",
    "category": "fruit",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Pre-load a spoon with thick, unsweetened applesauce and hand it to your baby to bring to their mouth.",
        "9-11": "Offer unsweetened applesauce on a pre-loaded spoon, or let your baby practice dipping soft finger foods.",
        "12+": "Let your baby practice scooping unsweetened applesauce with their own spoon."
      },
      "traditional": {
        "6-8": "Serve smooth, unsweetened applesauce from a spoon. Check the label for no added sugar.",
        "9-11": "Serve thick unsweetened applesauce, or stir it into porridge for a new texture.",
        "12+": "Offer unsweetened applesauce as a side, or stirred into porridge."
      }
    },
    "notes": "Label check: no added sugar or juice concentrate."
  },
  {
    "slug": "peach",
    "name": "Peach",
    "category": "fruit",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Choose a very ripe peach that squishes easily. Remove the pit and skin and offer large wedges your baby can hold. Steam firm peaches first.",
        "9-11": "Peel ripe or steamed peach and cut into small soft pieces your baby can pick up.",
        "12+": "Offer small, soft bite-size pieces of ripe peach. Always remove the pit."
      },
      "traditional": {
        "6-8": "Peel and pit a very ripe or steamed peach, then purée until smooth.",
        "9-11": "Mash ripe peach with a fork, leaving soft lumps.",
        "12+": "Serve small soft pieces of ripe peach with the pit removed."
      }
    }
  },
  {
    "slug": "plum",
    "name": "Plum",
    "category": "fruit",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Use a very ripe plum that squishes easily, or steam it soft. Remove the pit and offer large wedges your baby can hold.",
        "9-11": "Peel ripe plum, remove the pit and cut into small soft pieces.",
        "12+": "Offer small, soft bite-size pieces of ripe plum. Always remove the pit."
      },
      "traditional": {
        "6-8": "Peel, pit and steam plum until soft, then purée until smooth.",
        "9-11": "Mash ripe or steamed plum, leaving soft lumps.",
        "12+": "Serve small soft pieces of ripe plum with the pit removed."
      }
    }
  },
  {
    "slug": "mango",
    "name": "Mango",
    "category": "fruit",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Peel a ripe mango and cut thick spears about the width of two adult fingers. It should be soft enough to squish when pressed.",
        "9-11": "Cut ripe mango into small soft pieces your baby can pick up with thumb and finger.",
        "12+": "Offer bite-size pieces or thin slices of ripe, soft mango."
      },
      "traditional": {
        "6-8": "Purée ripe mango until smooth.",
        "9-11": "Mash ripe mango with a fork, leaving soft lumps.",
        "12+": "Serve small soft pieces of ripe mango."
      }
    },
    "notes": "Rare mango-skin contact rash (urushiol); peel fully."
  },
  {
    "slug": "papaya",
    "name": "Papaya",
    "category": "fruit",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Scoop out all seeds, peel ripe papaya and cut into thick spears about the width of two adult fingers. It should squish easily.",
        "9-11": "Cut ripe papaya into small soft pieces with all seeds removed.",
        "12+": "Offer bite-size pieces of ripe papaya with all seeds removed."
      },
      "traditional": {
        "6-8": "Remove seeds and purée ripe papaya until smooth.",
        "9-11": "Mash ripe papaya with a fork, leaving soft lumps.",
        "12+": "Serve small soft pieces of ripe papaya, seeds removed."
      }
    }
  },
  {
    "slug": "kiwi",
    "name": "Kiwi",
    "category": "fruit",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Peel a ripe kiwi and cut into wedges or halves your baby can hold. It should squish easily between your fingers.",
        "9-11": "Cut peeled ripe kiwi into small soft pieces your baby can pick up.",
        "12+": "Offer bite-size pieces of peeled, ripe kiwi."
      },
      "traditional": {
        "6-8": "Mash peeled ripe kiwi until smooth. The tiny seeds are fine.",
        "9-11": "Mash ripe kiwi with a fork, leaving soft lumps.",
        "12+": "Serve small soft pieces of peeled ripe kiwi."
      }
    },
    "notes": "Acidic; mild mouth redness is common. Kiwi is a less common allergen (not top 9)."
  },
  {
    "slug": "strawberries",
    "name": "Strawberries",
    "category": "fruit",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Remove the green tops. Flatten ripe strawberries with your palm, or cut very large ones in half lengthwise so your baby can hold them.",
        "9-11": "Quarter ripe strawberries lengthwise or chop them into small pieces about the size of a chickpea.",
        "12+": "Quarter strawberries lengthwise or chop them small. Keep cutting them until at least age 4."
      },
      "traditional": {
        "6-8": "Purée ripe strawberries until smooth, or stir into a thicker fruit purée.",
        "9-11": "Mash ripe strawberries, leaving soft lumps, or offer small soft pieces.",
        "12+": "Serve strawberries quartered lengthwise or chopped small."
      }
    },
    "notes": "Contact rash around the mouth is common and usually not allergy."
  },
  {
    "slug": "blueberries",
    "name": "Blueberries",
    "category": "fruit",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Flatten each blueberry between your thumb and finger until it bursts, or mash them. Never offer whole round blueberries.",
        "9-11": "Flatten each blueberry or quarter it lengthwise so it is no longer round. Your baby can practice picking them up.",
        "12+": "Keep flattening or quartering blueberries lengthwise until at least age 4. Whole round berries are a choking hazard."
      },
      "traditional": {
        "6-8": "Purée or mash blueberries until smooth. Cooking them briefly softens the skins.",
        "9-11": "Mash blueberries, or flatten each one so it is no longer round.",
        "12+": "Serve blueberries flattened or quartered lengthwise until at least age 4."
      }
    },
    "notes": "Round-food hazard; prep must always say flattened or quartered."
  },
  {
    "slug": "raspberries",
    "name": "Raspberries",
    "category": "fruit",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Flatten ripe raspberries gently between your fingers, or mash them. They should squish easily.",
        "9-11": "Tear or flatten ripe raspberries into small soft pieces for your baby to pick up.",
        "12+": "Offer ripe raspberries torn in half or lightly flattened."
      },
      "traditional": {
        "6-8": "Mash or purée ripe raspberries until smooth.",
        "9-11": "Mash raspberries with a fork, leaving soft lumps.",
        "12+": "Serve ripe raspberries torn in half or lightly flattened."
      }
    }
  },
  {
    "slug": "blackberries",
    "name": "Blackberries",
    "category": "fruit",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Flatten ripe blackberries with your palm, or mash them. Never offer them whole.",
        "9-11": "Quarter ripe blackberries lengthwise or flatten them so they are no longer round.",
        "12+": "Keep quartering blackberries lengthwise or flattening them until at least age 4."
      },
      "traditional": {
        "6-8": "Mash or purée ripe blackberries until smooth.",
        "9-11": "Mash blackberries, leaving soft lumps.",
        "12+": "Serve blackberries quartered lengthwise or flattened until at least age 4."
      }
    }
  },
  {
    "slug": "grapes",
    "name": "Grapes (quartered)",
    "category": "fruit",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Quarter grapes lengthwise (top to bottom) and remove any seeds, or flatten them. Never offer whole or halved grapes.",
        "9-11": "Quarter grapes lengthwise into four thin pieces and remove any seeds. Your baby can pick these up with thumb and finger.",
        "12+": "Keep quartering grapes lengthwise until at least age 4. Whole and halved grapes are a choking hazard."
      },
      "traditional": {
        "6-8": "Quarter grapes lengthwise, remove seeds, then mash or purée until smooth.",
        "9-11": "Quarter grapes lengthwise and remove seeds. Mash lightly if your baby is still learning.",
        "12+": "Serve grapes quartered lengthwise, never whole or halved, until at least age 4."
      }
    },
    "notes": "AAP/CDC top choking hazard. Never relax this text."
  },
  {
    "slug": "cherries",
    "name": "Cherries (pitted, quartered)",
    "category": "fruit",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Remove stems and pits, then quarter ripe cherries lengthwise or flatten them. Never offer whole cherries.",
        "9-11": "Pit cherries and quarter them lengthwise so they are no longer round.",
        "12+": "Keep pitting and quartering cherries lengthwise until at least age 4."
      },
      "traditional": {
        "6-8": "Pit ripe cherries and purée until smooth.",
        "9-11": "Pit cherries and mash, leaving soft lumps.",
        "12+": "Serve cherries pitted and quartered lengthwise until at least age 4."
      }
    },
    "notes": "Pits are a choking hazard; prep always says remove pits."
  },
  {
    "slug": "watermelon",
    "name": "Watermelon",
    "category": "fruit",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Cut ripe watermelon into finger-length sticks about the width of two adult fingers, rind and black seeds removed.",
        "9-11": "Cut watermelon into small soft pieces with all black seeds removed.",
        "12+": "Offer bite-size pieces of watermelon with all black seeds removed."
      },
      "traditional": {
        "6-8": "Remove seeds and blend watermelon, then stir into a thicker fruit purée.",
        "9-11": "Mash seedless watermelon with a fork, leaving soft pieces.",
        "12+": "Serve small soft pieces with all black seeds removed."
      }
    }
  },
  {
    "slug": "cantaloupe",
    "name": "Cantaloupe",
    "category": "fruit",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Cut very ripe cantaloupe into finger-length strips about the width of two adult fingers, rind removed. It should squish when pressed.",
        "9-11": "Cut ripe cantaloupe into small soft pieces. Firm, unripe melon is too hard.",
        "12+": "Offer bite-size pieces of ripe, soft cantaloupe, rind removed."
      },
      "traditional": {
        "6-8": "Purée very ripe cantaloupe until smooth.",
        "9-11": "Mash ripe cantaloupe, leaving soft lumps.",
        "12+": "Serve small soft pieces of ripe cantaloupe."
      }
    },
    "notes": "Wash rind before cutting (Listeria/Salmonella outbreaks linked to cantaloupe)."
  },
  {
    "slug": "prunes-rehydrated",
    "name": "Prunes (soaked)",
    "category": "fruit",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Soak pitted prunes in hot water until very soft, then mash into a paste on a pre-loaded spoon. Never offer whole dried prunes.",
        "9-11": "Soak pitted prunes until soft, then chop finely or mash and stir into porridge.",
        "12+": "Keep soaking and finely chopping prunes. Whole dried fruit is a choking hazard until at least age 4."
      },
      "traditional": {
        "6-8": "Soak pitted prunes in hot water until very soft, then purée until smooth.",
        "9-11": "Mash soaked prunes, leaving soft lumps.",
        "12+": "Serve soaked prunes finely chopped or mashed into porridge."
      }
    },
    "notes": "Useful for constipation. Dried fruit only rehydrated and chopped; check for stray pits."
  },
  {
    "slug": "plantain-ripe",
    "name": "Ripe plantain (cooked)",
    "category": "fruit",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Steam, boil or bake ripe plantain (yellow with black spots) until very soft. Cut into finger-length spears about two adult fingers wide.",
        "9-11": "Cook ripe plantain until soft and cut into small pieces your baby can pick up.",
        "12+": "Offer bite-size soft pieces of cooked ripe plantain. Skip hard, crispy chips."
      },
      "traditional": {
        "6-8": "Boil or steam ripe plantain until very soft, then mash with breast milk, formula or water until smooth.",
        "9-11": "Mash cooked ripe plantain, leaving soft lumps.",
        "12+": "Serve small soft pieces of cooked ripe plantain."
      }
    },
    "notes": "Never raw. Green plantain is starchy and firm; use ripe for softness."
  },
  {
    "slug": "sweet-potato",
    "name": "Sweet potato",
    "category": "vegetable",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Roast or steam sweet potato until it squishes easily, then cut into finger-length wedges about two adult fingers wide.",
        "9-11": "Cut soft-cooked sweet potato into small cubes about the size of a chickpea.",
        "12+": "Offer bite-size soft cubes of cooked sweet potato, or mash it."
      },
      "traditional": {
        "6-8": "Steam or bake sweet potato until very soft, then purée with breast milk, formula or water until smooth.",
        "9-11": "Mash cooked sweet potato with a fork, leaving soft lumps.",
        "12+": "Serve soft cooked cubes or mash."
      }
    }
  },
  {
    "slug": "potato",
    "name": "Potato",
    "category": "vegetable",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Peel and boil or roast potato until it squishes easily, then cut into finger-length wedges about two adult fingers wide.",
        "9-11": "Cut soft-cooked potato into small cubes your baby can pick up.",
        "12+": "Offer bite-size soft pieces of cooked potato, or mash it."
      },
      "traditional": {
        "6-8": "Boil peeled potato until very soft and mash with breast milk, formula or water until smooth. Don't blend; it turns gluey.",
        "9-11": "Mash cooked potato, leaving soft lumps.",
        "12+": "Serve soft cooked pieces or mash."
      }
    },
    "notes": "No added salt or butter-heavy prep implied. Discard green-tinged potatoes (solanine)."
  },
  {
    "slug": "carrot",
    "name": "Carrot (cooked or grated)",
    "category": "vegetable",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Raw carrot is a choking hazard. Steam or roast finger-length carrot sticks until they squish easily between your thumb and finger.",
        "9-11": "Cook carrot until very soft, then cut into small pieces, or finely grate raw carrot.",
        "12+": "Keep carrot cooked soft or finely grated until at least age 4. Avoid raw sticks, rounds and baby carrots."
      },
      "traditional": {
        "6-8": "Steam carrot until very soft, then purée until smooth.",
        "9-11": "Mash cooked carrot, leaving soft lumps.",
        "12+": "Serve soft-cooked pieces or finely grated raw carrot."
      }
    },
    "notes": "CDC choking-hazard list: raw carrot."
  },
  {
    "slug": "butternut-squash",
    "name": "Butternut squash",
    "category": "vegetable",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Peel and roast or steam butternut squash until it squishes easily, then cut into finger-length strips about two adult fingers wide.",
        "9-11": "Cut soft-cooked squash into small cubes your baby can pick up.",
        "12+": "Offer bite-size soft cubes of cooked squash."
      },
      "traditional": {
        "6-8": "Steam or roast squash until very soft, then purée until smooth.",
        "9-11": "Mash cooked squash, leaving soft lumps.",
        "12+": "Serve soft cooked cubes or mash."
      }
    },
    "notes": "Kabocha and acorn squash prep the same way."
  },
  {
    "slug": "pumpkin",
    "name": "Pumpkin",
    "category": "vegetable",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Pre-load a spoon with plain pumpkin purée (not pie filling), or offer finger-length strips of steamed fresh pumpkin that squish easily.",
        "9-11": "Offer small soft cubes of cooked pumpkin, or thick plain purée on a spoon.",
        "12+": "Offer soft cooked cubes, or let your baby scoop plain pumpkin purée."
      },
      "traditional": {
        "6-8": "Serve plain canned pumpkin purée or steamed fresh pumpkin blended smooth. Pie filling has added sugar.",
        "9-11": "Mash cooked pumpkin, leaving soft lumps.",
        "12+": "Serve soft cooked pieces or stir purée into porridge."
      }
    }
  },
  {
    "slug": "zucchini",
    "name": "Zucchini",
    "category": "vegetable",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Cut zucchini into finger-length spears and steam or roast until very soft. Leave the skin on for grip.",
        "9-11": "Cut soft-cooked zucchini into small pieces your baby can pick up.",
        "12+": "Offer bite-size soft-cooked pieces of zucchini."
      },
      "traditional": {
        "6-8": "Steam zucchini until very soft, then purée until smooth.",
        "9-11": "Mash cooked zucchini, leaving soft lumps.",
        "12+": "Serve small soft-cooked pieces."
      }
    }
  },
  {
    "slug": "broccoli",
    "name": "Broccoli",
    "category": "vegetable",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Steam large broccoli florets with a bit of stalk as a handle, until soft enough to squish easily between your fingers.",
        "9-11": "Cut soft-steamed broccoli into small florets your baby can pick up.",
        "12+": "Offer small, soft-steamed florets. Raw broccoli is too hard."
      },
      "traditional": {
        "6-8": "Steam broccoli until very soft, then purée until smooth.",
        "9-11": "Mash or finely chop soft-steamed broccoli.",
        "12+": "Serve small soft-steamed pieces."
      }
    }
  },
  {
    "slug": "cauliflower",
    "name": "Cauliflower",
    "category": "vegetable",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Steam or roast large cauliflower florets until they squish easily, keeping a bit of stalk as a handle.",
        "9-11": "Cut soft-cooked cauliflower into small pieces your baby can pick up.",
        "12+": "Offer small soft-cooked florets. Raw cauliflower is too hard."
      },
      "traditional": {
        "6-8": "Steam cauliflower until very soft, then purée until smooth.",
        "9-11": "Mash soft-cooked cauliflower, leaving soft lumps.",
        "12+": "Serve small soft-cooked pieces or mash."
      }
    }
  },
  {
    "slug": "green-beans",
    "name": "Green beans",
    "category": "vegetable",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Trim the ends and steam whole green beans until very soft and bendy. Your baby can hold them like a stick.",
        "9-11": "Cut soft-cooked green beans into small pieces your baby can pick up.",
        "12+": "Offer short, soft-cooked pieces. Raw green beans are too hard."
      },
      "traditional": {
        "6-8": "Steam green beans until very soft, then purée until smooth.",
        "9-11": "Finely chop or mash soft-cooked green beans.",
        "12+": "Serve short soft-cooked pieces."
      }
    }
  },
  {
    "slug": "peas",
    "name": "Peas",
    "category": "vegetable",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Cook peas until soft and mash them, then pre-load a spoon or press onto a soft food your baby can hold.",
        "9-11": "Cook peas soft and lightly squash each one so it is flat. Your baby can practice picking them up.",
        "12+": "Serve soft-cooked peas, lightly squashed if your baby is still learning to chew."
      },
      "traditional": {
        "6-8": "Cook peas until soft and purée until smooth.",
        "9-11": "Mash cooked peas, leaving soft lumps.",
        "12+": "Serve soft-cooked peas, lightly squashed."
      }
    }
  },
  {
    "slug": "spinach",
    "name": "Spinach (cooked)",
    "category": "vegetable",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Cook spinach until wilted, chop it finely and stir it into a soft food your baby can scoop or hold, like mashed potato.",
        "9-11": "Stir finely chopped cooked spinach into soft foods. Whole leaves can stick to the roof of your baby's mouth.",
        "12+": "Serve finely chopped cooked spinach mixed into other soft foods."
      },
      "traditional": {
        "6-8": "Cook spinach until soft and purée it into another vegetable purée.",
        "9-11": "Finely chop cooked spinach and mix into a lumpy mash.",
        "12+": "Serve finely chopped cooked spinach mixed into meals."
      }
    },
    "notes": "Non-heme iron; pair with vitamin C food. Nitrate concern is for under 3 months only."
  },
  {
    "slug": "asparagus",
    "name": "Asparagus",
    "category": "vegetable",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Snap off the tough ends and steam whole spears until very soft. Your baby can hold them like a stick.",
        "9-11": "Cut soft-steamed asparagus tips and stalks into small pieces.",
        "12+": "Offer short, soft-cooked pieces of asparagus."
      },
      "traditional": {
        "6-8": "Steam asparagus until very soft, then purée until smooth.",
        "9-11": "Finely chop or mash soft-cooked asparagus.",
        "12+": "Serve short soft-cooked pieces."
      }
    }
  },
  {
    "slug": "beets",
    "name": "Beets (cooked)",
    "category": "vegetable",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Roast or steam peeled beets until they squish easily, then cut into finger-length wedges about two adult fingers wide.",
        "9-11": "Cut soft-cooked beets into small pieces your baby can pick up.",
        "12+": "Offer bite-size soft-cooked pieces. Raw beets are too hard; grate finely if raw."
      },
      "traditional": {
        "6-8": "Steam or roast beets until very soft, then purée until smooth.",
        "9-11": "Mash soft-cooked beets, leaving soft lumps.",
        "12+": "Serve small soft-cooked pieces."
      }
    },
    "notes": "Red stool/urine is expected; consider a parent-facing tip elsewhere."
  },
  {
    "slug": "parsnip",
    "name": "Parsnip (cooked)",
    "category": "vegetable",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Peel, core and roast or steam parsnip sticks until they squish easily between your thumb and finger.",
        "9-11": "Cut soft-cooked parsnip into small pieces your baby can pick up.",
        "12+": "Offer bite-size soft-cooked pieces. Keep parsnip cooked soft until at least age 4."
      },
      "traditional": {
        "6-8": "Steam parsnip until very soft, then purée until smooth.",
        "9-11": "Mash soft-cooked parsnip, leaving soft lumps.",
        "12+": "Serve small soft-cooked pieces."
      }
    }
  },
  {
    "slug": "cherry-tomatoes",
    "name": "Cherry tomatoes (quartered)",
    "category": "vegetable",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Quarter ripe cherry tomatoes lengthwise or flatten them. Never offer whole round cherry tomatoes.",
        "9-11": "Quarter cherry tomatoes lengthwise so your baby can pick up the soft pieces.",
        "12+": "Keep quartering cherry tomatoes lengthwise until at least age 4. Whole ones are a choking hazard."
      },
      "traditional": {
        "6-8": "Cook tomatoes until soft, then purée smooth into another vegetable.",
        "9-11": "Quarter lengthwise and mash, or cook into a chunky sauce.",
        "12+": "Serve cherry tomatoes quartered lengthwise until at least age 4."
      }
    },
    "notes": "Acidic; mouth redness common. Round-food hazard."
  },
  {
    "slug": "bell-pepper",
    "name": "Bell pepper (roasted)",
    "category": "vegetable",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Roast bell pepper until very soft, peel off the skin and cut into finger-length strips your baby can hold.",
        "9-11": "Cut soft roasted, peeled pepper into small pieces.",
        "12+": "Offer small pieces of soft-cooked pepper. Raw pepper is crunchy, so keep it cooked soft."
      },
      "traditional": {
        "6-8": "Roast and peel pepper, then purée until smooth.",
        "9-11": "Finely chop or mash roasted, peeled pepper.",
        "12+": "Serve small soft-cooked pieces."
      }
    },
    "notes": "Good vitamin C pairing for iron."
  },
  {
    "slug": "okra",
    "name": "Okra (cooked)",
    "category": "vegetable",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Trim the stem and steam or roast whole okra pods until very soft. Your baby can hold them like a stick.",
        "9-11": "Slice soft-cooked okra into small pieces your baby can pick up.",
        "12+": "Offer small soft-cooked pieces of okra."
      },
      "traditional": {
        "6-8": "Cook okra until very soft and purée into another vegetable.",
        "9-11": "Finely chop soft-cooked okra into a lumpy mash or stew.",
        "12+": "Serve small soft-cooked pieces."
      }
    }
  },
  {
    "slug": "bok-choy",
    "name": "Bok choy (cooked)",
    "category": "vegetable",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Steam baby bok choy until very soft and offer a halved head, with the stem as a handle.",
        "9-11": "Finely chop soft-cooked bok choy leaves and stems.",
        "12+": "Serve finely chopped cooked bok choy. Whole leaves can stick to the roof of your baby's mouth."
      },
      "traditional": {
        "6-8": "Steam bok choy until soft and purée into another vegetable purée.",
        "9-11": "Finely chop cooked bok choy into a lumpy mash or congee.",
        "12+": "Serve finely chopped cooked bok choy."
      }
    }
  },
  {
    "slug": "cassava",
    "name": "Cassava / yuca (cooked)",
    "category": "vegetable",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Never serve raw. Peel fully, remove the woody center cord and boil until very soft, then cut into finger-length strips.",
        "9-11": "Boil peeled cassava until very soft and cut into small pieces, center cord removed.",
        "12+": "Offer bite-size pieces of fully cooked, soft cassava. Skip hard fried pieces."
      },
      "traditional": {
        "6-8": "Boil peeled cassava until very soft, remove the center cord and mash with breast milk, formula or water until smooth.",
        "9-11": "Mash fully cooked cassava, leaving soft lumps.",
        "12+": "Serve small soft pieces of fully cooked cassava."
      }
    },
    "notes": "Raw or undercooked cassava contains cyanogenic glycosides. Use sweet cassava (U.S. grocery/frozen yuca) only."
  },
  {
    "slug": "eggplant",
    "name": "Eggplant (cooked)",
    "category": "vegetable",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Roast eggplant until very soft and creamy, then peel and offer finger-length strips your baby can hold.",
        "9-11": "Cut soft roasted, peeled eggplant into small pieces.",
        "12+": "Offer small soft-cooked pieces of eggplant with tough skin removed."
      },
      "traditional": {
        "6-8": "Roast eggplant until very soft, scoop out the flesh and purée until smooth.",
        "9-11": "Mash roasted eggplant, leaving soft lumps.",
        "12+": "Serve small soft-cooked pieces."
      }
    }
  },
  {
    "slug": "mushrooms",
    "name": "Mushrooms (cooked)",
    "category": "vegetable",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Sauté or roast large mushroom slices until soft, then offer thick strips your baby can hold. Never serve whole small mushrooms.",
        "9-11": "Finely chop cooked mushrooms into small soft pieces.",
        "12+": "Offer finely chopped or thinly sliced cooked mushrooms. Whole button mushrooms are slippery."
      },
      "traditional": {
        "6-8": "Cook mushrooms until soft and purée into another vegetable.",
        "9-11": "Finely chop cooked mushrooms into a lumpy mash.",
        "12+": "Serve finely chopped cooked mushrooms."
      }
    },
    "notes": "Store-bought culinary mushrooms only; always cooked."
  },
  {
    "slug": "oat-infant-cereal",
    "name": "Iron-fortified oat cereal",
    "category": "grain_cereal",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Mix iron-fortified oat cereal with breast milk, formula or water into a thick porridge, then pre-load a spoon for your baby to hold.",
        "9-11": "Make the porridge thick enough to stay on a spoon, or stir it into mashed fruit.",
        "12+": "Stir oat cereal into porridge or mashed fruit for extra iron, and let your baby feed themselves with a spoon."
      },
      "traditional": {
        "6-8": "Mix with breast milk, formula or water to a smooth texture, starting runny and thickening as your baby learns.",
        "9-11": "Make it thicker and stir in mashed fruit for texture.",
        "12+": "Serve as thick porridge or stir into other foods."
      }
    },
    "notes": "Check label: some oat cereals add milk or soy. Oats may have wheat cross-contact."
  },
  {
    "slug": "rice-infant-cereal",
    "name": "Iron-fortified rice cereal",
    "category": "grain_cereal",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Mix iron-fortified rice cereal with breast milk, formula or water into a thick porridge, then pre-load a spoon for your baby to hold.",
        "9-11": "Make it thick enough to stay on a spoon, or stir it into mashed vegetables.",
        "12+": "Stir into porridge or mashes and let your baby feed themselves with a spoon."
      },
      "traditional": {
        "6-8": "Mix with breast milk, formula or water to a smooth texture, starting runny and thickening as your baby learns.",
        "9-11": "Make it thicker and stir in mashed fruit or vegetables.",
        "12+": "Serve as thick porridge or stir into other foods."
      }
    },
    "notes": "Inorganic arsenic: AAP/FDA advise rotating grains, not rice cereal as the only cereal. Plan generator should not repeat daily."
  },
  {
    "slug": "wheat-infant-cereal",
    "name": "Iron-fortified wheat cereal",
    "category": "grain_cereal",
    "allergens": [
      "wheat"
    ],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Mix iron-fortified wheat cereal with breast milk, formula or water into a thick porridge, then pre-load a spoon for your baby to hold.",
        "9-11": "Make it thick enough to stay on a spoon, or stir it into mashed fruit.",
        "12+": "Stir into porridge or mashed fruit and let your baby feed themselves with a spoon."
      },
      "traditional": {
        "6-8": "Mix with breast milk, formula or water to a smooth texture, starting runny and thickening as your baby learns.",
        "9-11": "Make it thicker and stir in mashed fruit for texture.",
        "12+": "Serve as thick porridge or stir into other foods."
      }
    },
    "notes": "Simple early wheat introduction. Some multigrain/wheat cereals add milk or soy; label check. Consider tagging milk/soy if a specific product is recommended."
  },
  {
    "slug": "oatmeal",
    "name": "Oatmeal",
    "category": "grain_cereal",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Cook rolled oats in water, breast milk or formula until soft and thick. Pre-load a spoon, or chill until set and cut into soft finger-length strips.",
        "9-11": "Serve thick, soft oatmeal for your baby to scoop with hands or a pre-loaded spoon.",
        "12+": "Let your baby feed themselves soft oatmeal with a spoon. No added sugar needed; stir in mashed fruit."
      },
      "traditional": {
        "6-8": "Cook oats until very soft, then blend with breast milk, formula or water until smooth.",
        "9-11": "Serve soft-cooked oats with some texture, unblended.",
        "12+": "Serve soft oatmeal with mashed or chopped soft fruit."
      }
    },
    "notes": "Oats may have wheat cross-contact; choose certified gluten-free if wheat allergy. Cooking with cow's milk is fine at 6+ (milk tag would then apply; we default to water)."
  },
  {
    "slug": "wheat-pasta",
    "name": "Wheat pasta (plain, not egg)",
    "category": "grain_cereal",
    "allergens": [
      "wheat"
    ],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Cook large shapes like fusilli or rigatoni until very soft. The big shapes are easy for your baby to grip.",
        "9-11": "Cook small pasta shapes until soft, or cut cooked pasta into small pieces.",
        "12+": "Offer bite-size soft-cooked pasta your baby can pick up or spear."
      },
      "traditional": {
        "6-8": "Cook small pasta like orzo until very soft, then blend or mash into a vegetable purée.",
        "9-11": "Mash soft-cooked small pasta into a lumpy vegetable mash.",
        "12+": "Serve soft-cooked small pasta."
      }
    },
    "notes": "Dried durum pasta is wheat only. Fresh/egg pasta contains egg; this entry is plain dried pasta. Cook without salt in the water."
  },
  {
    "slug": "toast-strips",
    "name": "Toast strips",
    "category": "grain_cereal",
    "allergens": [
      "wheat",
      "milk",
      "egg",
      "soy",
      "sesame"
    ],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Lightly toast soft bread and cut into finger-length strips about two adult fingers wide. Light toasting stops it turning gummy.",
        "9-11": "Cut lightly toasted bread into small squares with a thin, soft topping.",
        "12+": "Offer small pieces of lightly toasted bread. Choose bread without whole seeds or nuts, and skip hard, crusty breads."
      },
      "traditional": {
        "6-8": "Soak small pieces of bread in breast milk, formula or water until mushy, then mash smooth.",
        "9-11": "Offer small pieces of soft, lightly toasted bread.",
        "12+": "Serve small pieces of lightly toasted bread."
      }
    },
    "notes": "Tagged conservatively: many breads contain milk, egg, soy, and sesame (FASTER Act era). Use wheat-pasta or wheat-infant-cereal as the wheat-only intro path. Breads vary in sodium."
  },
  {
    "slug": "couscous",
    "name": "Couscous",
    "category": "grain_cereal",
    "allergens": [
      "wheat"
    ],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Cook couscous until soft and fluffy, then press it into small soft balls or pre-load a spoon for your baby.",
        "9-11": "Let your baby rake and scoop soft couscous from a bowl.",
        "12+": "Serve soft, fluffy couscous for your baby to eat with hands or a spoon."
      },
      "traditional": {
        "6-8": "Cook couscous until very soft and blend into a vegetable purée.",
        "9-11": "Stir soft couscous into a lumpy vegetable mash.",
        "12+": "Serve soft couscous as a side."
      }
    },
    "notes": "Plain couscous only; boxed flavored mixes are high in sodium."
  },
  {
    "slug": "quinoa",
    "name": "Quinoa",
    "category": "grain_cereal",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Rinse and cook quinoa until very soft, then pre-load a spoon or press it into a soft food your baby can hold.",
        "9-11": "Let your baby scoop soft-cooked quinoa with their hands or a spoon.",
        "12+": "Serve soft-cooked quinoa mixed into meals."
      },
      "traditional": {
        "6-8": "Cook quinoa until very soft and blend into a smooth porridge or purée.",
        "9-11": "Serve soft-cooked quinoa stirred into a lumpy mash.",
        "12+": "Serve soft-cooked quinoa as a side."
      }
    }
  },
  {
    "slug": "rice",
    "name": "Rice",
    "category": "grain_cereal",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Cook sticky or short-grain rice until very soft and press into small balls or logs your baby can hold.",
        "9-11": "Offer small soft rice balls, or let your baby scoop soft rice.",
        "12+": "Serve soft-cooked rice for your baby to eat with hands or a spoon."
      },
      "traditional": {
        "6-8": "Cook rice until very soft and blend with breast milk, formula or water until smooth.",
        "9-11": "Mash soft-cooked rice into a lumpy mash.",
        "12+": "Serve soft-cooked rice."
      }
    },
    "notes": "Arsenic: rotate grains; cook in extra water and drain to reduce arsenic."
  },
  {
    "slug": "congee",
    "name": "Congee (rice porridge)",
    "category": "grain_cereal",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Simmer rice in plenty of water until it breaks down into a thick porridge. Pre-load a spoon for your baby to hold.",
        "9-11": "Serve thick congee with small, soft pieces of cooked vegetable or meat stirred in.",
        "12+": "Serve congee with soft, finely chopped add-ins for your baby to spoon up."
      },
      "traditional": {
        "6-8": "Simmer rice in water until very soft, then blend until smooth. Use no-salt-added broth or water.",
        "9-11": "Serve thick congee with soft lumps.",
        "12+": "Serve congee with finely chopped soft add-ins."
      }
    },
    "notes": "Avoid salted broth, soy sauce, century egg. Arsenic: rotate grains."
  },
  {
    "slug": "polenta",
    "name": "Polenta / grits",
    "category": "grain_cereal",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Cook polenta or grits until thick, chill until set, then cut into soft finger-length strips your baby can hold.",
        "9-11": "Cut set polenta into small soft cubes, or serve thick and soft for scooping.",
        "12+": "Serve soft polenta or grits for your baby to eat with a spoon."
      },
      "traditional": {
        "6-8": "Cook polenta or grits in water until very smooth and creamy.",
        "9-11": "Serve thick, soft polenta with a little texture.",
        "12+": "Serve soft polenta or grits."
      }
    },
    "notes": "Instant grits often salted; use plain cornmeal. Cheese grits would add milk."
  },
  {
    "slug": "millet",
    "name": "Millet porridge",
    "category": "grain_cereal",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Cook millet in extra water until very soft and porridge-like, then pre-load a spoon for your baby to hold.",
        "9-11": "Serve thick, soft millet for your baby to scoop.",
        "12+": "Serve soft-cooked millet with a spoon."
      },
      "traditional": {
        "6-8": "Cook millet until very soft, then blend with breast milk, formula or water until smooth.",
        "9-11": "Serve soft-cooked millet with some texture.",
        "12+": "Serve soft-cooked millet as porridge or a side."
      }
    }
  },
  {
    "slug": "barley",
    "name": "Barley",
    "category": "grain_cereal",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Cook pearl barley until very soft, then mash and pre-load a spoon for your baby to hold.",
        "9-11": "Serve soft-cooked barley for your baby to scoop, lightly mashed.",
        "12+": "Serve soft-cooked barley mixed into soups or mashes."
      },
      "traditional": {
        "6-8": "Cook barley until very soft, then blend with water until smooth.",
        "9-11": "Lightly mash soft-cooked barley into a lumpy porridge.",
        "12+": "Serve soft-cooked barley."
      }
    },
    "notes": "Contains gluten but is not wheat; not a top-9 allergen."
  },
  {
    "slug": "corn-tortilla",
    "name": "Corn tortilla (soft)",
    "category": "grain_cereal",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Warm a soft corn tortilla and cut into finger-length strips your baby can hold. Never offer hard corn tortilla chips.",
        "9-11": "Tear a warm, soft corn tortilla into small pieces.",
        "12+": "Offer small pieces of soft corn tortilla. Skip hard, crunchy shells and chips."
      },
      "traditional": {
        "6-8": "Soak small pieces of corn tortilla in breast milk, formula or water and mash smooth.",
        "9-11": "Offer small pieces of warm, soft corn tortilla.",
        "12+": "Serve small pieces of soft corn tortilla."
      }
    },
    "notes": "Label check: some corn tortillas blend in wheat flour."
  },
  {
    "slug": "flour-tortilla",
    "name": "Flour tortilla (soft)",
    "category": "grain_cereal",
    "allergens": [
      "wheat"
    ],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Warm a soft flour tortilla and cut into finger-length strips your baby can hold.",
        "9-11": "Tear a warm, soft flour tortilla into small pieces.",
        "12+": "Offer small pieces of soft flour tortilla, plain or with a thin soft filling."
      },
      "traditional": {
        "6-8": "Soak small pieces of tortilla in breast milk, formula or water and mash smooth.",
        "9-11": "Offer small pieces of warm, soft tortilla.",
        "12+": "Serve small pieces of soft flour tortilla."
      }
    },
    "notes": "Some brands add milk or soy flour; consider adding milk/soy tags conservatively. Moderate sodium."
  },
  {
    "slug": "arepa",
    "name": "Arepa (plain)",
    "category": "grain_cereal",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Make plain arepas with precooked corn flour and water. Cook until soft inside, trim crispy edges, and cut into finger-length strips.",
        "9-11": "Cut soft arepa into small pieces, crispy edges removed.",
        "12+": "Offer small pieces of soft arepa with a thin, soft filling."
      },
      "traditional": {
        "6-8": "Mash soft arepa with breast milk, formula or water until smooth.",
        "9-11": "Mash soft arepa into a lumpy texture, or offer small soft pieces.",
        "12+": "Serve small pieces of soft arepa."
      }
    },
    "notes": "Plain masarepa only; no cheese (milk) or salt added to dough."
  },
  {
    "slug": "idli",
    "name": "Idli (steamed rice cake)",
    "category": "grain_cereal",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Offer a soft, steamed idli whole or cut into thick strips. It's spongy and easy for your baby to gum.",
        "9-11": "Tear soft idli into small pieces your baby can pick up.",
        "12+": "Offer small pieces of soft idli, plain or dipped in a mild, smooth dal."
      },
      "traditional": {
        "6-8": "Mash idli with breast milk, formula or water until smooth.",
        "9-11": "Mash idli, leaving soft lumps.",
        "12+": "Serve small pieces of soft idli."
      }
    },
    "notes": "Rice + urad dal batter; no top-9 allergens. Skip salt in batter and spicy chutneys/sambar for infants."
  },
  {
    "slug": "rice-noodles",
    "name": "Rice noodles",
    "category": "grain_cereal",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Cook rice noodles until very soft and offer a small bundle your baby can grab with their whole hand.",
        "9-11": "Cut soft-cooked rice noodles into short pieces your baby can pick up.",
        "12+": "Offer short pieces of soft-cooked rice noodles."
      },
      "traditional": {
        "6-8": "Cook rice noodles until very soft, then chop finely and blend into a purée.",
        "9-11": "Finely chop soft-cooked rice noodles into a lumpy mash.",
        "12+": "Serve short pieces of soft-cooked rice noodles."
      }
    },
    "notes": "Plain rice noodles only (check label for wheat). Arsenic: rotate grains."
  },
  {
    "slug": "pancakes",
    "name": "Pancakes (no added sugar)",
    "category": "grain_cereal",
    "allergens": [
      "wheat",
      "milk",
      "egg"
    ],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Make pancakes with no added sugar, cook through, and cut into finger-length strips your baby can hold.",
        "9-11": "Cut soft, fully cooked pancakes into small pieces.",
        "12+": "Offer small pieces of soft pancake with mashed fruit on top."
      },
      "traditional": {
        "6-8": "Soak small pieces of cooked pancake in breast milk, formula or water and mash smooth.",
        "9-11": "Offer small soft pieces of fully cooked pancake.",
        "12+": "Serve small pieces of soft pancake."
      }
    },
    "notes": "Assumes standard wheat/milk/egg batter. No syrup; no honey."
  },
  {
    "slug": "ground-beef",
    "name": "Ground beef",
    "category": "protein",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Cook ground beef all the way through, then shape into soft finger-length logs, or stir fine crumbles into a soft food your baby can scoop.",
        "9-11": "Offer small, soft crumbles of fully cooked beef mixed into a soft food.",
        "12+": "Offer soft crumbles or small pieces of soft meatball, fully cooked."
      },
      "traditional": {
        "6-8": "Cook beef all the way through, then purée with water, breast milk or formula until smooth.",
        "9-11": "Finely mince cooked beef and mix into a lumpy vegetable mash.",
        "12+": "Serve small soft crumbles of fully cooked beef."
      }
    },
    "notes": "Iron-rich (heme). Cook to 160°F. Logs may need a binder; AI combos supply it, allergen-tagged separately."
  },
  {
    "slug": "beef-strips-slow-cooked",
    "name": "Slow-cooked beef strips",
    "category": "protein",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Slow-cook beef until very tender. Offer a strip about the size of an adult finger for your baby to suck and gnaw. It should shred with a fork.",
        "9-11": "Shred slow-cooked beef into thin, soft shreds your baby can pick up.",
        "12+": "Offer thin shreds or thin strips. Avoid chunks or tough cubes of meat until at least age 4."
      },
      "traditional": {
        "6-8": "Slow-cook beef until very tender, then purée with cooking liquid or water until smooth.",
        "9-11": "Finely shred tender beef into a lumpy mash.",
        "12+": "Serve thin, tender shreds of beef."
      }
    },
    "notes": "Iron-rich. Use no-salt cooking liquid. Gagging likely with strips; that's normal learning, not choking."
  },
  {
    "slug": "ground-turkey",
    "name": "Ground turkey (dark meat)",
    "category": "protein",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Cook ground turkey all the way through and shape into soft finger-length logs, or stir crumbles into a soft food your baby can scoop.",
        "9-11": "Offer small, soft crumbles of fully cooked turkey mixed into a soft food.",
        "12+": "Offer soft crumbles or small pieces of soft meatball, fully cooked."
      },
      "traditional": {
        "6-8": "Cook turkey all the way through, then purée with water, breast milk or formula until smooth.",
        "9-11": "Finely mince cooked turkey into a lumpy vegetable mash.",
        "12+": "Serve small soft crumbles of fully cooked turkey."
      }
    },
    "notes": "Dark-meat blends have more iron than breast. Cook to 165°F."
  },
  {
    "slug": "chicken-thigh",
    "name": "Chicken thigh",
    "category": "protein",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Cook skinless, boneless chicken thigh until very tender. Offer finger-length strips that shred easily, or shred finely.",
        "9-11": "Shred tender chicken thigh into thin, soft shreds your baby can pick up.",
        "12+": "Offer thin shreds or thin strips of tender chicken. Avoid chunks until at least age 4."
      },
      "traditional": {
        "6-8": "Cook chicken thigh until tender, then purée with water, breast milk or formula until smooth.",
        "9-11": "Finely shred cooked chicken into a lumpy mash.",
        "12+": "Serve thin, tender shreds of chicken."
      }
    },
    "notes": "Dark meat = more iron. Cook to 165°F. Check for small bones/cartilage."
  },
  {
    "slug": "pork-shoulder-shredded",
    "name": "Pulled pork (plain)",
    "category": "protein",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Slow-cook pork shoulder until it falls apart. Offer finger-length pieces that shred easily, or soft shreds mixed into a soft food.",
        "9-11": "Shred tender pork into thin, soft shreds your baby can pick up.",
        "12+": "Offer thin, tender shreds of pork. Avoid chunks until at least age 4."
      },
      "traditional": {
        "6-8": "Slow-cook pork until very tender, then purée with cooking liquid or water until smooth.",
        "9-11": "Finely shred tender pork into a lumpy mash.",
        "12+": "Serve thin, tender shreds of pork."
      }
    },
    "notes": "Plain, unseasoned; no BBQ sauce (sugar/salt). Excludes ham, bacon, sausage (sodium, nitrites)."
  },
  {
    "slug": "ground-lamb",
    "name": "Ground lamb",
    "category": "protein",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Cook ground lamb all the way through and shape into soft finger-length logs your baby can hold.",
        "9-11": "Offer small, soft crumbles of fully cooked lamb mixed into a soft food.",
        "12+": "Offer soft crumbles or small pieces of soft lamb kofta, fully cooked."
      },
      "traditional": {
        "6-8": "Cook lamb all the way through, then purée with water until smooth.",
        "9-11": "Finely mince cooked lamb into a lumpy vegetable mash.",
        "12+": "Serve small soft crumbles of fully cooked lamb."
      }
    },
    "notes": "Iron-rich. Cook to 160°F. Mild spices (cumin, cinnamon) fine; no salt."
  },
  {
    "slug": "salmon",
    "name": "Salmon",
    "category": "protein",
    "allergens": [
      "fish"
    ],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Bake or poach skinless salmon until it flakes easily. Check carefully for bones, then offer large soft flakes your baby can grab.",
        "9-11": "Flake cooked salmon into small pieces, checking carefully for bones.",
        "12+": "Offer small, soft flakes of cooked salmon. Check carefully for bones every time."
      },
      "traditional": {
        "6-8": "Cook salmon through, check carefully for bones, then mash with breast milk, formula or water until smooth.",
        "9-11": "Flake cooked salmon finely, check carefully for bones, and mix into a lumpy mash.",
        "12+": "Serve small flakes of cooked salmon, checked carefully for bones."
      }
    },
    "notes": "Low mercury (FDA/EPA Best Choice). Avoid shark, swordfish, king mackerel, tilefish, bigeye tuna, marlin, orange roughy."
  },
  {
    "slug": "cod",
    "name": "Cod",
    "category": "protein",
    "allergens": [
      "fish"
    ],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Bake or steam cod until it flakes easily. Check carefully for bones, then offer large soft flakes your baby can grab.",
        "9-11": "Flake cooked cod into small pieces, checking carefully for bones.",
        "12+": "Offer small, soft flakes of cooked cod. Check carefully for bones every time."
      },
      "traditional": {
        "6-8": "Cook cod through, check carefully for bones, then mash with breast milk, formula or water until smooth.",
        "9-11": "Flake cooked cod finely, check carefully for bones, and mix into a lumpy mash.",
        "12+": "Serve small flakes of cooked cod, checked carefully for bones."
      }
    },
    "notes": "Low mercury. Not breaded (breading adds wheat/egg/milk)."
  },
  {
    "slug": "tilapia",
    "name": "Tilapia",
    "category": "protein",
    "allergens": [
      "fish"
    ],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Bake or steam tilapia until it flakes easily. Check carefully for bones, then offer large soft flakes your baby can grab.",
        "9-11": "Flake cooked tilapia into small pieces, checking carefully for bones.",
        "12+": "Offer small, soft flakes of cooked tilapia. Check carefully for bones every time."
      },
      "traditional": {
        "6-8": "Cook tilapia through, check carefully for bones, then mash with breast milk, formula or water until smooth.",
        "9-11": "Flake cooked tilapia finely, check carefully for bones, and mix into a lumpy mash.",
        "12+": "Serve small flakes of cooked tilapia, checked carefully for bones."
      }
    },
    "notes": "Low mercury."
  },
  {
    "slug": "canned-light-tuna",
    "name": "Canned light tuna",
    "category": "protein",
    "allergens": [
      "fish"
    ],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Choose light tuna in water with no salt added. Check carefully for bones, then mash with avocado and pre-load a spoon.",
        "9-11": "Mash tuna with a soft food and offer small soft clumps. Check carefully for bones.",
        "12+": "Offer flaked tuna mixed into soft foods. Check carefully for bones."
      },
      "traditional": {
        "6-8": "Mash light tuna in water until smooth, checking carefully for bones, and blend into a vegetable purée.",
        "9-11": "Flake tuna finely, check carefully for bones, and mix into a lumpy mash.",
        "12+": "Serve flaked tuna mixed into soft foods, checked carefully for bones."
      }
    },
    "notes": "Light/skipjack only (Best Choice). Albacore is Good Choice; limit. FDA: 1 oz child serving, 2–3 servings/week of Best Choices. Plan generator should cap frequency."
  },
  {
    "slug": "sardines-boneless",
    "name": "Sardines (boneless, canned)",
    "category": "protein",
    "allergens": [
      "fish"
    ],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Choose boneless, skinless sardines in water or olive oil, no salt added. Check carefully for bones, then mash onto a pre-loaded spoon.",
        "9-11": "Mash sardines and offer small soft clumps. Check carefully for bones.",
        "12+": "Offer mashed or flaked sardines on soft foods. Check carefully for bones."
      },
      "traditional": {
        "6-8": "Mash boneless sardines until smooth, checking carefully for bones, and blend into a vegetable purée.",
        "9-11": "Mash sardines, check carefully for bones, and mix into a lumpy mash.",
        "12+": "Serve mashed sardines, checked carefully for bones."
      }
    },
    "notes": "Low mercury, iron and omega-3. Sodium varies widely; prep says no salt added."
  },
  {
    "slug": "shrimp-minced",
    "name": "Shrimp (finely minced)",
    "category": "protein",
    "allergens": [
      "shellfish"
    ],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Peel and cook shrimp until opaque, then mince very finely and mix into a soft mash shaped into a patty your baby can hold.",
        "9-11": "Mince cooked, peeled shrimp finely and stir into a soft food your baby can scoop.",
        "12+": "Chop cooked shrimp into pieces no bigger than a pea. Whole shrimp are too chewy until at least age 4."
      },
      "traditional": {
        "6-8": "Cook peeled shrimp through, then blend very finely into a vegetable purée.",
        "9-11": "Finely mince cooked shrimp into a lumpy mash.",
        "12+": "Serve cooked shrimp chopped smaller than a pea."
      }
    },
    "notes": "Only crustacean entry; crab/lobster could be added the same way. Imitation crab excluded (wheat, egg, fish, sodium)."
  },
  {
    "slug": "tofu-firm",
    "name": "Firm tofu",
    "category": "protein",
    "allergens": [
      "soy"
    ],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Press firm tofu, then cut into finger-length sticks about two adult fingers wide. Bake or pan-cook lightly; it should still squish.",
        "9-11": "Cut soft-cooked firm tofu into small cubes your baby can pick up.",
        "12+": "Offer bite-size soft cubes of cooked tofu."
      },
      "traditional": {
        "6-8": "Blend firm tofu with a little water, breast milk or formula until smooth.",
        "9-11": "Mash tofu with a fork into soft crumbles.",
        "12+": "Serve small soft cubes of cooked tofu."
      }
    },
    "notes": "Calcium-set tofu adds calcium; some iron."
  },
  {
    "slug": "tofu-silken",
    "name": "Silken tofu",
    "category": "protein",
    "allergens": [
      "soy"
    ],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Pre-load a spoon with silken tofu, plain or blended with fruit, and hand it to your baby.",
        "9-11": "Offer silken tofu for your baby to scoop with a spoon or hands.",
        "12+": "Let your baby feed themselves silken tofu with a spoon."
      },
      "traditional": {
        "6-8": "Blend silken tofu until smooth, or mix into a fruit or vegetable purée.",
        "9-11": "Mash silken tofu into a lumpy fruit or vegetable mash.",
        "12+": "Serve silken tofu plain or with soft fruit."
      }
    }
  },
  {
    "slug": "tempeh",
    "name": "Tempeh",
    "category": "protein",
    "allergens": [
      "soy"
    ],
    "minAgeMonths": 9,
    "prep": {
      "blw": {
        "6-8": "Not offered at this age.",
        "9-11": "Steam tempeh 10 minutes until soft, then crumble into small soft pieces mixed into a soft food.",
        "12+": "Steam tempeh until soft and offer thin strips or small crumbles."
      },
      "traditional": {
        "6-8": "Not offered at this age.",
        "9-11": "Steam tempeh until soft and mash finely into a vegetable mash.",
        "12+": "Serve steamed tempeh crumbled or in thin strips."
      }
    },
    "notes": "minAge 9 because it's dense and firm. Some tempeh contains barley/grain or wheat; label check. Consumers should hide 6-8 strings when minAge > band."
  },
  {
    "slug": "edamame",
    "name": "Edamame (shelled)",
    "category": "protein",
    "allergens": [
      "soy"
    ],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Cook shelled edamame until very soft and mash into a paste on a pre-loaded spoon. Never offer whole beans or pods.",
        "9-11": "Flatten each soft-cooked edamame bean between your fingers, or halve it.",
        "12+": "Keep flattening or halving edamame until at least age 4. Never offer the pods."
      },
      "traditional": {
        "6-8": "Cook shelled edamame until very soft and purée until smooth.",
        "9-11": "Mash cooked edamame, leaving soft lumps.",
        "12+": "Serve cooked edamame flattened or halved."
      }
    },
    "notes": "Round, firm bean; treat as hazard food."
  },
  {
    "slug": "red-lentils",
    "name": "Red lentils",
    "category": "protein",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Cook red lentils until very soft and thick, then pre-load a spoon or let your baby scoop with their hands.",
        "9-11": "Serve thick, soft lentils for your baby to scoop, or mix into soft finger foods.",
        "12+": "Serve soft-cooked red lentils as a thick dal or stew."
      },
      "traditional": {
        "6-8": "Cook red lentils until very soft, then blend until smooth.",
        "9-11": "Serve soft-cooked lentils lightly mashed.",
        "12+": "Serve soft lentil dal or stew."
      }
    },
    "notes": "Iron-rich (non-heme); pair with vitamin C food. Mild spices fine; no salt."
  },
  {
    "slug": "brown-lentils",
    "name": "Green or brown lentils",
    "category": "protein",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Cook lentils until very soft, then mash and pre-load a spoon for your baby to hold.",
        "9-11": "Offer very soft-cooked lentils, lightly mashed, for your baby to pick up or scoop.",
        "12+": "Serve soft-cooked lentils mixed into soft foods."
      },
      "traditional": {
        "6-8": "Cook lentils until very soft, then blend until smooth.",
        "9-11": "Mash soft-cooked lentils, leaving soft lumps.",
        "12+": "Serve soft-cooked lentils."
      }
    },
    "notes": "Iron-rich; pair with vitamin C."
  },
  {
    "slug": "black-beans",
    "name": "Black beans",
    "category": "protein",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Use no-salt-added canned beans, rinsed, or home-cooked beans. Mash into a thick paste and pre-load a spoon.",
        "9-11": "Flatten each soft-cooked bean between your fingers so it is no longer round.",
        "12+": "Serve very soft-cooked beans, flattening any firm ones."
      },
      "traditional": {
        "6-8": "Blend soft-cooked black beans with water until smooth.",
        "9-11": "Mash beans with a fork, leaving soft lumps.",
        "12+": "Serve soft-cooked beans, lightly mashed."
      }
    },
    "notes": "Iron-rich; rinse canned beans to cut sodium."
  },
  {
    "slug": "kidney-beans",
    "name": "Kidney beans",
    "category": "protein",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Use rinsed no-salt-added canned kidney beans or fully cooked dried ones. Mash into a thick paste and pre-load a spoon.",
        "9-11": "Flatten each soft-cooked bean between your fingers so it is no longer round.",
        "12+": "Serve very soft-cooked beans, flattening any firm ones."
      },
      "traditional": {
        "6-8": "Blend fully cooked kidney beans with water until smooth.",
        "9-11": "Mash beans with a fork, leaving soft lumps.",
        "12+": "Serve soft-cooked beans, lightly mashed."
      }
    },
    "notes": "Dried kidney beans must be boiled 10+ min (phytohaemagglutinin); slow-cooker-only is unsafe. Canned is safest."
  },
  {
    "slug": "pinto-beans",
    "name": "Pinto beans / refried",
    "category": "protein",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Mash soft-cooked pinto beans into a thick paste with no salt added, then pre-load a spoon or spread on a soft corn tortilla strip.",
        "9-11": "Offer mashed beans to scoop, or flatten each soft-cooked bean.",
        "12+": "Serve soft mashed beans or very soft whole beans, flattening firm ones."
      },
      "traditional": {
        "6-8": "Blend soft-cooked pinto beans with water until smooth.",
        "9-11": "Mash beans with a fork, leaving soft lumps.",
        "12+": "Serve soft mashed or whole beans."
      }
    },
    "notes": "Store refried beans are often salted and may contain lard; prefer homemade or low-sodium."
  },
  {
    "slug": "chickpeas",
    "name": "Chickpeas",
    "category": "protein",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Mash soft-cooked chickpeas into a thick paste and pre-load a spoon. Never offer whole chickpeas.",
        "9-11": "Flatten each soft-cooked chickpea between your fingers so it is no longer round.",
        "12+": "Keep flattening or mashing chickpeas until at least age 4. Whole ones are firm and round."
      },
      "traditional": {
        "6-8": "Blend soft-cooked chickpeas with water until smooth.",
        "9-11": "Mash chickpeas with a fork, leaving soft lumps.",
        "12+": "Serve chickpeas flattened or mashed."
      }
    },
    "notes": "Rinse canned; firm round legume, treated as hazard."
  },
  {
    "slug": "white-beans",
    "name": "White beans (cannellini)",
    "category": "protein",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Mash soft-cooked white beans into a thick paste and pre-load a spoon for your baby.",
        "9-11": "Flatten each soft-cooked bean between your fingers so it is no longer round.",
        "12+": "Serve very soft-cooked beans, flattening any firm ones."
      },
      "traditional": {
        "6-8": "Blend soft-cooked white beans with water until smooth.",
        "9-11": "Mash beans with a fork, leaving soft lumps.",
        "12+": "Serve soft-cooked beans, lightly mashed."
      }
    },
    "notes": "Rinse canned to cut sodium."
  },
  {
    "slug": "moong-dal",
    "name": "Moong dal (split mung beans)",
    "category": "protein",
    "allergens": [],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Cook split mung dal until very soft and thick, or with rice as khichdi. Pre-load a spoon for your baby to hold.",
        "9-11": "Serve thick, soft dal or khichdi for your baby to scoop.",
        "12+": "Serve soft dal or khichdi for your baby to eat with a spoon."
      },
      "traditional": {
        "6-8": "Cook moong dal until very soft, then blend until smooth.",
        "9-11": "Serve soft dal or khichdi lightly mashed.",
        "12+": "Serve soft dal or khichdi."
      }
    },
    "notes": "Mild spices (turmeric, cumin) fine. Ghee would add milk; not assumed."
  },
  {
    "slug": "hummus",
    "name": "Hummus (homemade)",
    "category": "protein",
    "allergens": [
      "sesame"
    ],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Make smooth hummus from chickpeas and tahini with no salt added. Pre-load a spoon or spread thinly on a soft finger food.",
        "9-11": "Offer smooth hummus for dipping soft vegetables, or spread thinly on soft foods.",
        "12+": "Offer smooth hummus as a dip or thin spread."
      },
      "traditional": {
        "6-8": "Thin smooth hummus with water and serve from a spoon.",
        "9-11": "Serve smooth hummus stirred into a vegetable mash.",
        "12+": "Serve smooth hummus as a dip or spread."
      }
    },
    "notes": "Contains sesame via tahini. Store-bought is often salty."
  },
  {
    "slug": "egg-hard-boiled",
    "name": "Hard-boiled egg",
    "category": "protein",
    "allergens": [
      "egg"
    ],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Boil an egg until the yolk is fully firm, peel, and cut into quarters lengthwise for your baby to hold.",
        "9-11": "Chop a fully cooked hard-boiled egg into small soft pieces.",
        "12+": "Offer chopped or sliced hard-boiled egg, cooked until the yolk is fully firm."
      },
      "traditional": {
        "6-8": "Mash a fully cooked hard-boiled egg with breast milk, formula or water until smooth.",
        "9-11": "Mash hard-boiled egg with a fork, leaving soft lumps.",
        "12+": "Serve chopped hard-boiled egg."
      }
    },
    "notes": "Well-cooked egg for allergen introduction. Pasteurized/fully cooked only."
  },
  {
    "slug": "egg-scrambled",
    "name": "Scrambled egg",
    "category": "protein",
    "allergens": [
      "egg"
    ],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Scramble egg until fully cooked with no runny parts, and offer large soft clumps your baby can grab.",
        "9-11": "Offer small pieces of fully cooked scrambled egg your baby can pick up.",
        "12+": "Serve fully cooked scrambled egg in small soft pieces."
      },
      "traditional": {
        "6-8": "Scramble egg until fully cooked, then mash with breast milk, formula or water until smooth.",
        "9-11": "Serve soft scrambled egg, fully cooked, in small pieces.",
        "12+": "Serve fully cooked scrambled egg."
      }
    },
    "notes": "If scrambled with cow's milk, milk tag would apply; default prep uses none."
  },
  {
    "slug": "egg-omelet-strips",
    "name": "Omelet strips",
    "category": "protein",
    "allergens": [
      "egg"
    ],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Cook a thin omelet all the way through and cut into finger-length strips your baby can hold.",
        "9-11": "Cut a fully cooked thin omelet into small squares.",
        "12+": "Offer small pieces of fully cooked omelet with finely chopped soft vegetables."
      },
      "traditional": {
        "6-8": "Mash a fully cooked omelet with breast milk, formula or water until smooth.",
        "9-11": "Chop fully cooked omelet into small soft pieces.",
        "12+": "Serve small pieces of fully cooked omelet."
      }
    }
  },
  {
    "slug": "peanut-butter-thinned",
    "name": "Smooth peanut butter (thinned)",
    "category": "other",
    "allergens": [
      "peanut"
    ],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Thin 2 teaspoons of smooth peanut butter with warm water, breast milk or formula until runny, then pre-load a spoon. Never offer it thick.",
        "9-11": "Stir thinned smooth peanut butter into porridge, or spread a very thin layer on a soft finger food.",
        "12+": "Spread smooth peanut butter thinly or stir it in. No whole peanuts or chunky peanut butter until at least age 4."
      },
      "traditional": {
        "6-8": "Stir 2 teaspoons of smooth peanut butter, thinned with warm water, into a purée your baby already eats.",
        "9-11": "Stir thinned smooth peanut butter into porridge or a mash.",
        "12+": "Stir in or spread thinly. Never by the spoonful."
      }
    },
    "notes": "AAP/NIAID: ~2 g peanut protein (about 2 tsp PB) ~3x/week to maintain. High-risk infants (severe eczema/egg allergy) should see pediatrician first. Look for no-salt, no-sugar-added."
  },
  {
    "slug": "peanut-powder",
    "name": "Peanut powder",
    "category": "other",
    "allergens": [
      "peanut"
    ],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Stir about 2 teaspoons of peanut powder into a purée or porridge your baby already eats, mixing until smooth.",
        "9-11": "Stir peanut powder into porridge or a soft mash until fully mixed.",
        "12+": "Stir peanut powder into porridge, soft mashes or batters until fully mixed."
      },
      "traditional": {
        "6-8": "Mix about 2 teaspoons of peanut powder into a smooth purée your baby already eats.",
        "9-11": "Stir peanut powder into porridge or a lumpy mash.",
        "12+": "Stir peanut powder into soft foods."
      }
    },
    "notes": "Choose 100% peanut powder (no sugar). Never dry powder by itself (inhalation)."
  },
  {
    "slug": "almond-butter-thinned",
    "name": "Smooth almond butter (thinned)",
    "category": "other",
    "allergens": [
      "tree-nuts"
    ],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Thin 2 teaspoons of smooth almond butter with warm water, breast milk or formula until runny, then pre-load a spoon. Never offer it thick.",
        "9-11": "Stir thinned almond butter into porridge, or spread a very thin layer on a soft finger food.",
        "12+": "Spread smooth almond butter thinly or stir it in. No whole nuts until at least age 4."
      },
      "traditional": {
        "6-8": "Stir thinned smooth almond butter into a purée your baby already eats.",
        "9-11": "Stir thinned almond butter into porridge or a mash.",
        "12+": "Stir in or spread thinly. Never by the spoonful."
      }
    },
    "notes": "Tree nuts are introduced individually; a reaction to one doesn't mean all."
  },
  {
    "slug": "cashew-butter-thinned",
    "name": "Smooth cashew butter (thinned)",
    "category": "other",
    "allergens": [
      "tree-nuts"
    ],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Thin 2 teaspoons of smooth cashew butter with warm water, breast milk or formula until runny, then pre-load a spoon. Never offer it thick.",
        "9-11": "Stir thinned cashew butter into porridge, or spread a very thin layer on a soft finger food.",
        "12+": "Spread smooth cashew butter thinly or stir it in. No whole nuts until at least age 4."
      },
      "traditional": {
        "6-8": "Stir thinned smooth cashew butter into a purée your baby already eats.",
        "9-11": "Stir thinned cashew butter into porridge or a mash.",
        "12+": "Stir in or spread thinly. Never by the spoonful."
      }
    },
    "notes": "Cashew and pistachio are cross-reactive."
  },
  {
    "slug": "walnuts-ground",
    "name": "Finely ground walnuts",
    "category": "other",
    "allergens": [
      "tree-nuts"
    ],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Grind walnuts into a fine powder with no visible pieces, then stir into a purée or porridge your baby already eats.",
        "9-11": "Stir finely ground walnuts into porridge or roll soft finger foods in it for grip.",
        "12+": "Sprinkle finely ground walnuts on soft foods. No whole or chopped nuts until at least age 4."
      },
      "traditional": {
        "6-8": "Stir finely ground walnut powder into a smooth purée your baby already eats.",
        "9-11": "Stir finely ground walnuts into porridge or a mash.",
        "12+": "Stir finely ground walnuts into soft foods."
      }
    },
    "notes": "Grind to flour consistency; no chunks."
  },
  {
    "slug": "almonds-ground",
    "name": "Ground almonds / almond flour",
    "category": "other",
    "allergens": [
      "tree-nuts"
    ],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Stir finely ground almonds or almond flour into a purée or porridge your baby already eats.",
        "9-11": "Stir almond flour into porridge, or roll soft, slippery finger foods in it for grip.",
        "12+": "Sprinkle almond flour on soft foods or stir it into porridge. No whole nuts until at least age 4."
      },
      "traditional": {
        "6-8": "Stir almond flour into a smooth purée your baby already eats.",
        "9-11": "Stir almond flour into porridge or a mash.",
        "12+": "Stir almond flour into soft foods."
      }
    }
  },
  {
    "slug": "tahini-thinned",
    "name": "Tahini (thinned)",
    "category": "other",
    "allergens": [
      "sesame"
    ],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Thin smooth tahini with warm water until runny, then drizzle thinly over a soft food or pre-load a spoon. Never offer it thick.",
        "9-11": "Stir thinned tahini into porridge or a mash, or spread very thinly on a soft finger food.",
        "12+": "Spread tahini thinly or stir it in. Avoid whole sesame seeds sprinkled on top."
      },
      "traditional": {
        "6-8": "Stir thinned smooth tahini into a purée your baby already eats.",
        "9-11": "Stir thinned tahini into porridge or a mash.",
        "12+": "Stir in or spread thinly. Never by the spoonful."
      }
    },
    "notes": "Sesame is top-9 since 2023 (FASTER Act). Whole seeds excluded per spec."
  },
  {
    "slug": "yogurt-whole-milk",
    "name": "Plain whole-milk yogurt",
    "category": "dairy",
    "allergens": [
      "milk"
    ],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Pre-load a spoon with plain, unsweetened whole-milk yogurt and hand it to your baby.",
        "9-11": "Let your baby practice scooping plain whole-milk yogurt with a spoon or hands.",
        "12+": "Let your baby feed themselves plain whole-milk yogurt with a spoon, with soft fruit stirred in."
      },
      "traditional": {
        "6-8": "Serve plain, unsweetened whole-milk yogurt from a spoon, or stir into a fruit purée.",
        "9-11": "Stir mashed fruit into plain whole-milk yogurt.",
        "12+": "Serve plain whole-milk yogurt with soft chopped fruit."
      }
    },
    "notes": "Pasteurized, plain, no added sugar. Fine at 6 months; cow's milk as a drink is not in catalog."
  },
  {
    "slug": "greek-yogurt-whole-milk",
    "name": "Plain whole-milk Greek yogurt",
    "category": "dairy",
    "allergens": [
      "milk"
    ],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Pre-load a spoon with thick, plain whole-milk Greek yogurt. It stays on the spoon well for your baby.",
        "9-11": "Offer plain Greek yogurt as a thick dip for soft finger foods, or to scoop.",
        "12+": "Let your baby feed themselves plain Greek yogurt with a spoon."
      },
      "traditional": {
        "6-8": "Serve plain whole-milk Greek yogurt, thinned with a little breast milk, formula or water if very thick.",
        "9-11": "Stir mashed fruit into plain Greek yogurt.",
        "12+": "Serve plain Greek yogurt with soft chopped fruit."
      }
    },
    "notes": "Higher protein; plain, unsweetened."
  },
  {
    "slug": "cottage-cheese",
    "name": "Cottage cheese",
    "category": "dairy",
    "allergens": [
      "milk"
    ],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Pre-load a spoon with small-curd, full-fat cottage cheese for your baby to hold.",
        "9-11": "Let your baby scoop or pick up small curds of full-fat cottage cheese.",
        "12+": "Serve full-fat cottage cheese with soft chopped fruit."
      },
      "traditional": {
        "6-8": "Blend full-fat cottage cheese until smooth, or stir into a fruit purée.",
        "9-11": "Serve small-curd cottage cheese lightly mashed.",
        "12+": "Serve cottage cheese with soft fruit."
      }
    },
    "notes": "Sodium is moderate-high; choose low-sodium/no-salt-added and limit frequency."
  },
  {
    "slug": "ricotta",
    "name": "Whole-milk ricotta",
    "category": "dairy",
    "allergens": [
      "milk"
    ],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Pre-load a spoon with whole-milk ricotta, or spread it thickly on a soft finger food.",
        "9-11": "Offer ricotta to scoop, or spread on soft finger foods.",
        "12+": "Serve ricotta with soft fruit, or stirred into soft vegetables."
      },
      "traditional": {
        "6-8": "Serve smooth whole-milk ricotta from a spoon, or stir into a fruit or vegetable purée.",
        "9-11": "Stir ricotta into a lumpy fruit or vegetable mash.",
        "12+": "Serve ricotta mixed into soft foods."
      }
    },
    "notes": "Pasteurized. Naturally lower sodium."
  },
  {
    "slug": "mozzarella",
    "name": "Mozzarella (shredded or thin)",
    "category": "dairy",
    "allergens": [
      "milk"
    ],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Offer thin, finger-length strips of fresh mozzarella, or melt shredded mozzarella onto a soft food. Never offer cubes.",
        "9-11": "Offer shredded mozzarella or thin small pieces your baby can pick up.",
        "12+": "Offer shredded or thinly sliced mozzarella. Avoid cubes and string-cheese sticks until at least age 4."
      },
      "traditional": {
        "6-8": "Melt shredded mozzarella into a hot vegetable purée and stir until smooth.",
        "9-11": "Stir shredded mozzarella into a lumpy mash.",
        "12+": "Serve shredded or thinly sliced mozzarella."
      }
    },
    "notes": "Pasteurized. Fresh mozzarella is lower sodium."
  },
  {
    "slug": "cheddar",
    "name": "Cheddar (shredded or thin)",
    "category": "dairy",
    "allergens": [
      "milk"
    ],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Finely shred mild cheddar and melt it onto a soft food, or offer very thin, finger-length slices. Never offer cubes.",
        "9-11": "Offer finely shredded cheddar for your baby to pick up, or melted onto soft foods.",
        "12+": "Offer shredded or thinly sliced cheddar. Avoid cubes until at least age 4."
      },
      "traditional": {
        "6-8": "Melt finely shredded cheddar into a hot vegetable purée and stir until smooth.",
        "9-11": "Stir shredded cheddar into a lumpy mash.",
        "12+": "Serve shredded or melted cheddar."
      }
    },
    "notes": "Pasteurized; moderate sodium, use small amounts. Not processed cheese slices."
  },
  {
    "slug": "paneer",
    "name": "Paneer",
    "category": "dairy",
    "allergens": [
      "milk"
    ],
    "minAgeMonths": 6,
    "prep": {
      "blw": {
        "6-8": "Simmer paneer in water until soft, then offer thin finger-length strips, or crumble it into a soft food. Never offer cubes.",
        "9-11": "Crumble soft paneer into small pieces your baby can pick up.",
        "12+": "Offer crumbled paneer or thin strips. Avoid cubes until at least age 4."
      },
      "traditional": {
        "6-8": "Simmer paneer until soft, then blend into a vegetable purée until smooth.",
        "9-11": "Crumble soft paneer into a lumpy vegetable mash.",
        "12+": "Serve crumbled soft paneer."
      }
    },
    "notes": "Pasteurized; naturally low sodium. Firm cheese, so thin strips only."
  }
];

export const FOOD_BY_SLUG: ReadonlyMap<string, CatalogFood> = new Map(FOOD_CATALOG.map((f) => [f.slug, f]));
