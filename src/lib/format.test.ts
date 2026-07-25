import { expect, it } from 'vitest';
import { formatAmountWan } from './format';

it('uses 亿元 when a 万元 amount reaches one hundred million yuan', () => {
  expect(formatAmountWan(84_000)).toBe('8.4 亿');
  expect(formatAmountWan(10_000)).toBe('1 亿');
});

it('keeps smaller amounts in 万元', () => {
  expect(formatAmountWan(5_150)).toBe('5,150 万');
});
