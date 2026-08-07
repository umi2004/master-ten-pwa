export const BOARD_WIDTH = 9 as const;
export const MAX_BOARD_ROWS = 48 as const;
export const RULE_VERSION = '2.1.0' as const;
export const GENERATOR_VERSION = '3.0.0' as const;
export const DIFFICULTY_VERSION = '3.0.0' as const;

export type RuleVersion = typeof RULE_VERSION;
export type GeneratorVersion = typeof GENERATOR_VERSION;
export type DifficultyVersion = typeof DIFFICULTY_VERSION;
