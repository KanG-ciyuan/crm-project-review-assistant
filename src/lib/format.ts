const numberFormat = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });

export function formatAmountWan(value: number): string {
  if (Math.abs(value) >= 10_000) return `${numberFormat.format(value / 10_000)} 亿`;
  return `${numberFormat.format(value)} 万`;
}
