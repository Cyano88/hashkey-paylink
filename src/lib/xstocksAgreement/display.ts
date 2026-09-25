import { formatUnits } from 'viem';
// Round only the display. All API values and signing amounts remain exact strings.
export function stockDisplayAmount(units: string, decimals: number) {
  const value = BigInt(units);
  if (decimals <= 6) return { text: formatUnits(value, decimals), approximate: false };
  const scale = 10n ** BigInt(decimals - 6);
  const rounded = (value + scale / 2n) / scale;
  return { text: value > 0n && rounded === 0n ? '<0.000001' : formatUnits(rounded, 6), approximate: value % scale !== 0n };
}
