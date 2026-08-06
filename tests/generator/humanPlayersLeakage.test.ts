import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { HUMAN_PLAYER_AUDIT } from '../../src/generator/humanPlayers';

describe('human-player information boundary', () => {
  it('does not import a complete solver or post-hoc answer metadata', () => {
    const source = readFileSync(new URL('../../src/generator/humanPlayers.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/solveWith|solveMultiObjective|VerifiedPuzzle|verifiedSolution/);
    expect(source).not.toMatch(/minimumAdditions|OPTIMAL_SAFE|RECOVERABLE|LOSING|trapMoveCount/);
  });

  it('declares exact depth 2, 3, and 4 and never complete-solver use', () => {
    for (const depth of [2, 3, 4]) {
      const model = HUMAN_PLAYER_AUDIT.find((entry) => entry.strategy === `lookahead-${depth}`);
      expect(model?.depth).toBe(depth);
      expect(model?.usesCompleteSolver).toBe(false);
    }
  });
});
