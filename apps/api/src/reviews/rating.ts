/**
 * Rating arithmetic shared by the course page and the "rate it" button.
 *
 * A post already carries a source rating (4.5 from 1,646 votes). Local stars
 * are appended to that baseline instead of replacing it, so the first learner
 * to vote no longer turns a 4.5 into a single 5. Keeping the math in one place
 * makes the detail page and the cached `Course` columns agree.
 */
export interface CombinedRating {
  avg: number;
  count: number;
}

export function combineRating(input: {
  baseAvg: number | null | undefined;
  baseCount: number | null | undefined;
  localCount: number;
  localSum: number;
}): CombinedRating {
  const baseCount = Math.max(0, Math.trunc(input.baseCount ?? 0));
  const baseAvg = Number.isFinite(input.baseAvg ?? NaN) ? Math.max(0, input.baseAvg ?? 0) : 0;
  const localCount = Math.max(0, Math.trunc(input.localCount));
  const localSum = Number.isFinite(input.localSum) ? input.localSum : 0;
  const count = baseCount + localCount;
  if (count === 0) return { avg: 0, count: 0 };
  const sum = baseAvg * baseCount + localSum;
  return { avg: +(sum / count).toFixed(2), count };
}
