/**
 * Fractional-index rank helpers (research §4). An `order` is a base-62 string that sorts
 * lexicographically; a task list renders ascending by `order` (ties broken by `id`).
 * Inserting computes a rank *between* neighbors and appending a rank *after* the last, so a
 * move/reorder rewrites only the one moved card — no renumber cascade (SC-004). Repeated
 * inserts between the same pair keep producing valid ranks (the midpoint extends precision
 * with an extra digit rather than collapsing).
 *
 * This mirrors the server's append rule (`tasks.service.appendOrder`); the two only need to
 * agree on the sort order of the strings they produce, which base-62 lexicographic ordering
 * guarantees.
 */
const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE = DIGITS.length;
const BASE_BIG = BigInt(BASE);
/** Base rank for an empty day — the midpoint digit, leaving room on both sides. */
const MID = DIGITS[Math.floor(BASE / 2)];

function strToDigits(order: string, length: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < length; i++) {
    out.push(i < order.length ? DIGITS.indexOf(order[i]) : 0);
  }
  return out;
}

function digitsToBigInt(digits: number[]): bigint {
  return digits.reduce((acc, d) => acc * BASE_BIG + BigInt(d), 0n);
}

function bigIntToDigits(value: bigint, length: number): number[] {
  const out: number[] = [];
  let v = value;
  for (let i = 0; i < length; i++) {
    out.unshift(Number(v % BASE_BIG));
    v /= BASE_BIG;
  }
  return out;
}

function digitsToStr(digits: number[]): string {
  return digits.map((d) => DIGITS[d]).join('');
}

/** Trailing base-0 digits don't change a fraction's value; drop them to keep ranks short. */
function trimTrailingZeros(order: string): string {
  let end = order.length;
  while (end > 1 && order[end - 1] === DIGITS[0]) end--;
  return order.slice(0, end);
}

/**
 * A rank strictly between `lower` (fraction; `''` = 0) and `upper` (fraction string, or
 * `null` meaning 1.0). Computed as the exact base-62 average of the two fractions.
 */
function midpoint(lower: string, upper: string | null): string {
  const length = Math.max(lower.length, upper ? upper.length : 0);
  const lowerBig = digitsToBigInt(strToDigits(lower, length));
  const upperBig = upper === null ? BASE_BIG ** BigInt(length) : digitsToBigInt(strToDigits(upper, length));
  const sum = lowerBig + upperBig;
  const digits =
    sum % 2n === 0n
      ? bigIntToDigits(sum / 2n, length)
      : bigIntToDigits(sum * (BASE_BIG / 2n), length + 1); // extend one digit for the .5
  return trimTrailingZeros(digitsToStr(digits));
}

/**
 * A rank sorting **after** `last` (or a base rank for an empty day). Bumps the rightmost
 * non-maximal digit (keeping ranks short) and only extends when every digit is maxed.
 */
export function append(last?: string): string {
  if (!last) return MID;
  const chars = last.split('');
  for (let i = chars.length - 1; i >= 0; i--) {
    const v = DIGITS.indexOf(chars[i]);
    if (v < BASE - 1) return chars.slice(0, i).join('') + DIGITS[v + 1];
  }
  return last + MID;
}

/**
 * A rank strictly between two neighbors. Either side may be `undefined` at a list edge:
 * no neighbors → a base rank; only `prev` → append after it; only `next` → before it.
 */
export function between(prev?: string, next?: string): string {
  if (prev === undefined && next === undefined) return MID;
  if (next === undefined) return append(prev);
  if (prev === undefined) return midpoint('', next);
  return midpoint(prev, next);
}
