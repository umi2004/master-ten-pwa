import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { RULE_VERSION } from '../core';
import type { HumanStrategyId, StrategyTrialMetrics } from '../puzzles/types';

export function evaluationCacheKey(
  boardHash: string,
  strategy: HumanStrategyId,
  trials: number,
  seed: string,
): string {
  return [RULE_VERSION, boardHash, strategy, trials, seed].join('|');
}

export class MasterSearchStore {
  public readonly outputDirectory: string;
  private readonly cachePath: string;
  private readonly cache = new Map<string, StrategyTrialMetrics>();

  public constructor(outputDirectory: string) {
    this.outputDirectory = outputDirectory;
    this.cachePath = join(outputDirectory, 'cache.json');
    mkdirSync(join(outputDirectory, 'traces'), { recursive: true });
    if (existsSync(this.cachePath)) {
      const entries = JSON.parse(readFileSync(this.cachePath, 'utf8')) as Record<string, StrategyTrialMetrics>;
      for (const [key, value] of Object.entries(entries)) this.cache.set(key, value);
    }
  }

  public getOrComputeEvaluation(
    key: string,
    compute: () => StrategyTrialMetrics,
  ): { readonly value: StrategyTrialMetrics; readonly cacheHit: boolean } {
    const cached = this.cache.get(key);
    if (cached) return { value: cached, cacheHit: true };
    const value = compute();
    this.cache.set(key, value);
    writeFileSync(this.cachePath, JSON.stringify(Object.fromEntries(this.cache), null, 2), 'utf8');
    return { value, cacheHit: false };
  }

  public appendLedger(entry: unknown): void {
    const path = join(this.outputDirectory, 'ledger.jsonl');
    appendFileSync(path, `${JSON.stringify(entry)}\n`, 'utf8');
  }

  public readLedger<T>(): readonly T[] {
    const path = join(this.outputDirectory, 'ledger.jsonl');
    if (!existsSync(path)) return [];
    return readFileSync(path, 'utf8').split(/\r?\n/u)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as T);
  }

  public writeCheckpoint(checkpoint: unknown): void {
    writeFileSync(join(this.outputDirectory, 'checkpoint.json'), JSON.stringify(checkpoint, null, 2), 'utf8');
  }

  public readCheckpoint<T>(): T | undefined {
    const path = join(this.outputDirectory, 'checkpoint.json');
    return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) as T : undefined;
  }

  public writeBest(best: unknown): void {
    writeFileSync(join(this.outputDirectory, 'best.json'), JSON.stringify(best, null, 2), 'utf8');
  }

  public writeTrace(candidateId: string, trace: unknown): string {
    const safeId = candidateId.replace(/[^a-zA-Z0-9_-]/gu, '_');
    const path = join(this.outputDirectory, 'traces', `${safeId}.json`);
    writeFileSync(path, JSON.stringify(trace, null, 2), 'utf8');
    return path;
  }

  public readTrace<T>(candidateId: string): T | undefined {
    const safeId = candidateId.replace(/[^a-zA-Z0-9_-]/gu, '_');
    const path = join(this.outputDirectory, 'traces', `${safeId}.json`);
    return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) as T : undefined;
  }
}
