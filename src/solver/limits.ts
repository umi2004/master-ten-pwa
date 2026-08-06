import type { SolverLimits } from './types';

export interface ResolvedSolverLimits {
  readonly nodeLimit: number;
  readonly timeLimitMs: number;
  readonly maxDepth: number;
  readonly now: () => number;
}

const DEFAULT_NODE_LIMIT = 100_000;
const DEFAULT_TIME_LIMIT_MS = 5_000;
const DEFAULT_MAX_DEPTH = 512;

function nonNegativeNumber(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name}は0以上の有限数でなければなりません。`);
  }
  return value;
}

export function resolveLimits(limits: SolverLimits = {}): ResolvedSolverLimits {
  const nodeLimit = nonNegativeNumber(
    limits.nodeLimit ?? DEFAULT_NODE_LIMIT,
    'ノード上限',
  );
  const timeLimitMs = nonNegativeNumber(
    limits.timeLimitMs ?? DEFAULT_TIME_LIMIT_MS,
    '時間上限',
  );
  const maxDepth = nonNegativeNumber(
    limits.maxDepth ?? DEFAULT_MAX_DEPTH,
    '最大深度',
  );

  if (!Number.isInteger(nodeLimit) || !Number.isInteger(maxDepth)) {
    throw new RangeError('ノード上限と最大深度は整数でなければなりません。');
  }

  return {
    nodeLimit,
    timeLimitMs,
    maxDepth,
    now: limits.now ?? (() => performance.now()),
  };
}
