import { describe, it, expect, afterEach, vi } from 'vitest';
import { startOfWeek, weekDays, addWeeks, todayDate, isToday } from './week';

/**
 * Pure week/date math (SC-005): Monday-start weeks, seven correct dates across week / month
 * / year boundaries, and today detection.
 */
describe('startOfWeek', () => {
  it('returns the Monday of the containing week', () => {
    // 2026-07-08 is a Wednesday → Monday is 2026-07-06.
    expect(startOfWeek('2026-07-08')).toBe('2026-07-06');
    // A Monday maps to itself.
    expect(startOfWeek('2026-07-06')).toBe('2026-07-06');
    // A Sunday belongs to the week that started the previous Monday.
    expect(startOfWeek('2026-07-12')).toBe('2026-07-06');
  });

  it('crosses a month boundary', () => {
    // 2026-08-01 is a Saturday → its Monday is 2026-07-27.
    expect(startOfWeek('2026-08-01')).toBe('2026-07-27');
  });

  it('crosses a year boundary', () => {
    // 2027-01-01 is a Friday → its Monday is 2026-12-28.
    expect(startOfWeek('2027-01-01')).toBe('2026-12-28');
  });
});

describe('weekDays', () => {
  it('returns seven Monday→Sunday dates', () => {
    expect(weekDays('2026-07-06')).toEqual([
      '2026-07-06',
      '2026-07-07',
      '2026-07-08',
      '2026-07-09',
      '2026-07-10',
      '2026-07-11',
      '2026-07-12',
    ]);
  });

  it('spans a month boundary correctly', () => {
    expect(weekDays('2026-07-27')).toEqual([
      '2026-07-27',
      '2026-07-28',
      '2026-07-29',
      '2026-07-30',
      '2026-07-31',
      '2026-08-01',
      '2026-08-02',
    ]);
  });

  it('spans a year boundary correctly', () => {
    expect(weekDays('2026-12-28')).toEqual([
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
      '2027-01-03',
    ]);
  });
});

describe('addWeeks', () => {
  it('advances and rewinds whole weeks across boundaries', () => {
    expect(addWeeks('2026-07-06', 1)).toBe('2026-07-13');
    expect(addWeeks('2026-07-06', -1)).toBe('2026-06-29');
    expect(addWeeks('2026-12-28', 1)).toBe('2027-01-04');
  });

  it('advances multiple weeks and rewinds across a year boundary (US4)', () => {
    expect(addWeeks('2026-12-28', 2)).toBe('2027-01-11');
    expect(addWeeks('2027-01-04', -2)).toBe('2026-12-21');
    // A round trip returns to the origin.
    expect(addWeeks(addWeeks('2026-07-06', 5), -5)).toBe('2026-07-06');
  });
});

describe('current-week resolution (US4)', () => {
  afterEach(() => vi.useRealTimers());

  it('resolves the current week to the Monday of today (SC-009)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 8, 12, 0)); // Wed 2026-07-08
    expect(startOfWeek(todayDate())).toBe('2026-07-06');
  });
});

describe('todayDate / isToday', () => {
  afterEach(() => vi.useRealTimers());

  it('reports the current calendar date and matches isToday', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 8, 10, 30)); // local 2026-07-08
    expect(todayDate()).toBe('2026-07-08');
    expect(isToday('2026-07-08')).toBe(true);
    expect(isToday('2026-07-07')).toBe(false);
  });
});
