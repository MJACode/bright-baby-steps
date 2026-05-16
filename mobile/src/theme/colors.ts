// Brand tokens copied from src/index.css :root variables, converted from
// HSL to hex once at build time so RN can use them directly.

function hslToHex(h: number, s: number, l: number): string {
  const sN = s / 100;
  const lN = l / 100;
  const c = (1 - Math.abs(2 * lN - 1)) * sN;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lN - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export const colors = {
  primary: hslToHex(152, 45, 48),       // Forest Teal
  accent: hslToHex(30, 70, 55),         // Warm Orange
  background: hslToHex(30, 40, 98),     // Warm Cream
  foreground: hslToHex(240, 10, 20),    // Deep Slate
  card: '#ffffff',
  border: hslToHex(30, 20, 90),
  destructive: hslToHex(0, 72, 55),
  mutedForeground: hslToHex(240, 8, 46),

  // Module accents (not used in spike, included for parity)
  sleep: hslToHex(230, 65, 62),
  feeding: hslToHex(152, 50, 48),
  diapers: hslToHex(35, 85, 58),
  milestones: hslToHex(280, 55, 60),
  finance: hslToHex(172, 50, 42),
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
};
