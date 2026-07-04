export function calculateIcm(stacks: number[], payouts: number[]): number[] {
  if (stacks.length === 0) {
    return [];
  }

  const normalizedPayouts = payouts.slice(0, stacks.length);
  while (normalizedPayouts.length < stacks.length) {
    normalizedPayouts.push(0);
  }

  const memo = new Map<string, number[]>();

  function solve(mask: number, payoutIndex: number): number[] {
    const key = `${mask}:${payoutIndex}`;
    const cached = memo.get(key);
    if (cached) {
      return [...cached];
    }

    const result = Array(stacks.length).fill(0) as number[];
    if (payoutIndex >= normalizedPayouts.length || mask === 0) {
      return result;
    }

    const remaining = indexesFromMask(mask);
    const total = remaining.reduce((sum, index) => sum + Math.max(0, stacks[index] ?? 0), 0);
    if (total <= 0) {
      const split = normalizedPayouts.slice(payoutIndex).reduce((sum, payout) => sum + payout, 0) / remaining.length;
      for (const index of remaining) {
        result[index] = (result[index] ?? 0) + split;
      }
      memo.set(key, result);
      return [...result];
    }

    for (const winner of remaining) {
      const weight = Math.max(0, stacks[winner] ?? 0) / total;
      const child = solve(mask & ~(1 << winner), payoutIndex + 1);
      result[winner] = (result[winner] ?? 0) + weight * (normalizedPayouts[payoutIndex] ?? 0);
      for (let i = 0; i < child.length; i += 1) {
        result[i] = (result[i] ?? 0) + weight * child[i]!;
      }
    }

    memo.set(key, result);
    return [...result];
  }

  return solve((1 << stacks.length) - 1, 0);
}

export function heroIcmValue(stacks: number[], payouts: number[], heroIndex: number): number {
  if ((stacks[heroIndex] ?? 0) <= 0) {
    return payouts[Math.min(payouts.length - 1, stacks.length - 1)] ?? 0;
  }

  const remaining: number[] = [];
  let remappedHero = -1;
  for (let i = 0; i < stacks.length; i += 1) {
    if ((stacks[i] ?? 0) > 0) {
      if (i === heroIndex) {
        remappedHero = remaining.length;
      }
      remaining.push(stacks[i]!);
    }
  }

  if (remappedHero < 0) {
    return payouts[Math.min(payouts.length - 1, stacks.length - 1)] ?? 0;
  }

  const remainingPayouts = payouts.slice(0, remaining.length);
  return calculateIcm(remaining, remainingPayouts)[remappedHero] ?? 0;
}

function indexesFromMask(mask: number): number[] {
  const indexes: number[] = [];
  for (let i = 0; i < 31; i += 1) {
    if ((mask & (1 << i)) !== 0) {
      indexes.push(i);
    }
  }
  return indexes;
}
