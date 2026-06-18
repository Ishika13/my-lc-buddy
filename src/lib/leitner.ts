// Deterministic Leitner spaced-repetition engine.
// Box intervals (days): 1->1, 2->3, 3->7, 4->14, 5->30, 6->60.

export const BOX_INTERVALS: Record<number, number> = {
  1: 1,
  2: 3,
  3: 7,
  4: 14,
  5: 30,
  6: 60,
};

export const MAX_BOX = 6;
export const MIN_BOX = 1;

export function nextBoxLevel(currentBox: number, rating: number): number {
  const cur = Math.min(MAX_BOX, Math.max(MIN_BOX, currentBox || 1));
  if (rating >= 4) return MIN_BOX; // struggled -> reset toward box 1
  if (rating <= 2) return Math.min(MAX_BOX, cur + 1); // easy -> promote one box
  return cur; // rating 3 -> stay
}

export function todayLocalISO(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDaysISO(baseISO: string, days: number): string {
  const [y, m, d] = baseISO.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return todayLocalISO(dt);
}

export function computeNextDue(newBox: number, todayISO: string): string {
  const interval = BOX_INTERVALS[newBox] ?? 1;
  return addDaysISO(todayISO, interval);
}

// Derive lc_slug from a LeetCode problem URL, e.g.
// https://leetcode.com/problems/two-sum/ -> "two-sum"
export function deriveSlug(url: string): string | null {
  if (!url) return null;
  const m = url.match(/leetcode\.com\/problems\/([a-z0-9-]+)/i);
  return m ? m[1].toLowerCase() : null;
}

// Streak: count consecutive days with at least one solve, ending today
// (or yesterday if today has no solve yet).
export function computeStreak(solvedDates: string[], todayISO: string): number {
  const set = new Set(solvedDates);
  let cursor = todayISO;
  if (!set.has(cursor)) {
    cursor = addDaysISO(cursor, -1);
    if (!set.has(cursor)) return 0;
  }
  let streak = 0;
  while (set.has(cursor)) {
    streak++;
    cursor = addDaysISO(cursor, -1);
  }
  return streak;
}
