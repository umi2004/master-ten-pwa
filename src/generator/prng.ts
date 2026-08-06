import { fnv1a } from '../puzzles/hash';

export interface Prng {
  next(): number;
  integer(maxExclusive: number): number;
  boolean(): boolean;
}

export function createPrng(seed: string): Prng {
  let state = Number.parseInt(fnv1a(seed), 16) >>> 0;
  const next = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
  return {
    next,
    integer(maxExclusive: number): number {
      if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
        throw new RangeError('乱数範囲は正の整数でなければなりません。');
      }
      return Math.floor(next() * maxExclusive);
    },
    boolean(): boolean {
      return next() >= 0.5;
    },
  };
}
