// Single source of truth for the child-context taxonomy. Values must match the
// DB CHECK constraints on children.interests / children.temperament exactly —
// labels are display-only and can change freely.

export const CHILD_INTERESTS: { value: string; label: string }[] = [
  { value: "music", label: "Music" },
  { value: "books", label: "Books & stories" },
  { value: "movement", label: "Movement & climbing" },
  { value: "water_play", label: "Water & bath play" },
  { value: "animals", label: "Animals" },
  { value: "vehicles", label: "Vehicles & wheels" },
  { value: "outdoors", label: "Outdoors & nature" },
  { value: "food_exploring", label: "Exploring foods" },
  { value: "building", label: "Building & stacking" },
  { value: "pretend_play", label: "Pretend play" },
];

export const MAX_INTERESTS = 6;

export const TEMPERAMENTS: { value: string; label: string }[] = [
  { value: "easygoing", label: "Easygoing" },
  { value: "sensitive", label: "Sensitive" },
  { value: "spirited", label: "Spirited" },
  { value: "slow_to_warm", label: "Slow to warm up" },
];
