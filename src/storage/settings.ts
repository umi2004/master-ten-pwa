import type { AppSettings } from './types';

export const DEFAULT_SETTINGS: AppSettings = {
  fontSize: 'standard',
  soundEnabled: true,
  vibrationEnabled: true,
  reducedMotion: false,
  highContrast: false,
  largeBoard: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseSettings(value: unknown): AppSettings | undefined {
  if (!isRecord(value)) return undefined;
  if (
    value.fontSize !== 'standard' &&
    value.fontSize !== 'large'
  ) return undefined;
  const booleanFields = [
    'soundEnabled',
    'vibrationEnabled',
    'reducedMotion',
    'highContrast',
    'largeBoard',
  ] as const;
  if (booleanFields.some((field) => typeof value[field] !== 'boolean')) {
    return undefined;
  }
  return {
    fontSize: value.fontSize,
    soundEnabled: value.soundEnabled as boolean,
    vibrationEnabled: value.vibrationEnabled as boolean,
    reducedMotion: value.reducedMotion as boolean,
    highContrast: value.highContrast as boolean,
    largeBoard: value.largeBoard as boolean,
  };
}
