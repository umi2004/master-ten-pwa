import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { RULE_VERSION } from '../core';
import type { HumanStrategyId, StrategyTrialMetrics } from '../puzzles/types';

const DEFAULT_CACHE_FLUSH_ENTRY_THRESHOLD = 32;
let atomicWriteSequence = 0;

export interface MasterSearchStoreOptions {
  readonly cacheFlushEntryThreshold?: number;
}

function atomicWriteJson(path: string, value: unknown): void {
  atomicWriteSequence += 1;
  const suffix = `${process.pid}-${atomicWriteSequence}`;
  const temporaryPath = `${path}.tmp-${suffix}`;
  const backupPath = `${path}.bak-${suffix}`;
  writeFileSync(temporaryPath, JSON.stringify(value, null, 2), 'utf8');
  try {
    try {
      renameSync(temporaryPath, path);
      return;
    } catch (renameError) {
      if (!existsSync(path)) throw renameError;
      renameSync(path, backupPath);
      try {
        renameSync(temporaryPath, path);
      } catch (replacementError) {
        try {
          if (existsSync(backupPath) && !existsSync(path)) renameSync(backupPath, path);
        } catch {
          // The durable writers below still surface the original replacement error.
        }
        throw replacementError;
      }
      try {
        rmSync(backupPath, { force: true });
      } catch {
        // A stale backup is harmless once the complete destination is installed.
      }
    }
  } finally {
    try {
      rmSync(temporaryPath, { force: true });
    } catch {
      // Best-effort cleanup; never replace a successful durable write with this error.
    }
  }
}

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
  private readonly cacheFlushEntryThreshold: number;
  private dirtyCacheEntries = 0;
  private nextCacheFlushAt: number;
  private lastCacheFlushError: unknown;
  private warnedAboutCacheFlush = false;

  public constructor(outputDirectory: string, options: MasterSearchStoreOptions = {}) {
    this.outputDirectory = outputDirectory;
    this.cachePath = join(outputDirectory, 'cache.json');
    this.cacheFlushEntryThreshold = options.cacheFlushEntryThreshold
      ?? DEFAULT_CACHE_FLUSH_ENTRY_THRESHOLD;
    if (!Number.isInteger(this.cacheFlushEntryThreshold) || this.cacheFlushEntryThreshold <= 0) {
      throw new RangeError('cacheFlushEntryThreshold must be a positive integer.');
    }
    this.nextCacheFlushAt = this.cacheFlushEntryThreshold;
    mkdirSync(join(outputDirectory, 'traces'), { recursive: true });
    if (existsSync(this.cachePath)) {
      try {
        const entries = JSON.parse(readFileSync(this.cachePath, 'utf8')) as Record<string, StrategyTrialMetrics>;
        for (const [key, value] of Object.entries(entries)) this.cache.set(key, value);
      } catch (error) {
        this.lastCacheFlushError = error;
        console.warn(`Master search disk cache could not be loaded; continuing with memory cache: ${String(error)}`);
      }
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
    this.dirtyCacheEntries += 1;
    if (this.dirtyCacheEntries >= this.nextCacheFlushAt) this.flushCache();
    return { value, cacheHit: false };
  }

  public flushCache(): boolean {
    if (this.dirtyCacheEntries === 0) return true;
    try {
      atomicWriteJson(this.cachePath, Object.fromEntries(this.cache));
      this.dirtyCacheEntries = 0;
      this.nextCacheFlushAt = this.cacheFlushEntryThreshold;
      this.lastCacheFlushError = undefined;
      this.warnedAboutCacheFlush = false;
      return true;
    } catch (error) {
      this.lastCacheFlushError = error;
      this.nextCacheFlushAt = this.dirtyCacheEntries + this.cacheFlushEntryThreshold;
      if (!this.warnedAboutCacheFlush) {
        console.warn(`Master search disk cache flush failed; continuing with memory cache: ${String(error)}`);
        this.warnedAboutCacheFlush = true;
      }
      return false;
    }
  }

  public get cacheFlushError(): unknown {
    return this.lastCacheFlushError;
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
    atomicWriteJson(join(this.outputDirectory, 'checkpoint.json'), checkpoint);
  }

  public readCheckpoint<T>(): T | undefined {
    const path = join(this.outputDirectory, 'checkpoint.json');
    return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) as T : undefined;
  }

  public writeBest(best: unknown): void {
    atomicWriteJson(join(this.outputDirectory, 'best.json'), best);
  }

  public writeTrace(candidateId: string, trace: unknown): string {
    const safeId = candidateId.replace(/[^a-zA-Z0-9_-]/gu, '_');
    const path = join(this.outputDirectory, 'traces', `${safeId}.json`);
    atomicWriteJson(path, trace);
    return path;
  }

  public readTrace<T>(candidateId: string): T | undefined {
    const safeId = candidateId.replace(/[^a-zA-Z0-9_-]/gu, '_');
    const path = join(this.outputDirectory, 'traces', `${safeId}.json`);
    return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) as T : undefined;
  }
}
