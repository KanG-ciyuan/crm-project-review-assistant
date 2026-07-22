import { describe, expect, it } from 'vitest';
import { daysBetween } from './project';

describe('calendar day calculations', () => {
  it('counts calendar dates across a daylight-saving offset change', () => {
    const marchFirst = new Date('2026-03-01T00:00:00-05:00');
    const aprilFirst = new Date('2026-04-01T00:00:00-04:00');

    expect(daysBetween(marchFirst, aprilFirst)).toBe(31);
  });
});
