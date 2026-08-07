import type { EncodedV3Candidate } from './v3Candidates';

const V7_RECOMMENDED_KEYS = [
  '28-38', '35-36', '3-12', '1-11', '5-15', '8-9', '4-6', 'A',
  '59-67', '54-64', '37-46', '42-52', '57-66', '61-69', '60-68',
  '27-45', '34-50', '40-48', '43-53', '49-51', '33-39', '44-62',
  '58-63', '55-65', 'A', '29-69', '71-80', '72-81', '30-70', '31-67',
  '63-73', '26-32', '55-65', '68-77', '57-66', '24-32', '21-61',
  '60-64', 'A', '50-70', '76-84', '71-79', '23-77', '14-86', '73-82',
  '74-90', '65-83', 'A', '7-47', '16-72', '20-60', '2-29', '19-29',
  '18-48', '25-65', '39-69', '40-64', '10-64', '0-13', '22-42',
  '8-24', '4-9', '13-22', '17-26', '18-27', '23-25', '31-39', '32-42',
  '33-41', '35-44', 'A', '8-53', '20-40', '12-28', '7-12', '13-21',
  '11-16', '19-28', '20-23', '18-24', '9-25', '9-11', '7-12',
] as const;

const V7_MINIMUM_KEYS = [
  '1-11', '3-4', '5-15', '6-24', '8-9', '28-38', '35-36', 'A',
  '27-45', '30-46', '37-47', '29-56', '39-55', '21-48', '34-40',
  '41-50', '44-53', '49-51', '52-61', '43-45', '42-48', '22-46',
  '13-31', '26-32', '33-41', '12-42', '18-38', '23-33', '20-25',
  '10-40', '17-19', '0-30', '14-22', '16-32', '2-18', '7-17',
] as const;

/** Local-only V7 harder sample. This remains deliberately unreviewed. */
export const V7_LITE_HARDER_SAMPLE: EncodedV3Candidate = {
  displayNumber: 1,
  seed: 'master-v7-lite-54',
  designFamily: 'timing-crossroads',
  prototypeBand: 'MASTER_01_10',
  cells: [
    7, 9, 6, 2, 2, 5, 8, 3, 6, 4, 5, 1, 8, 3, 6, 5, 9, 2,
    9, 2, 7, 4, 5, 1, 2, 3, 6, 5, 4, 1, 8, 3, 6, 5, 9, 2,
    8, 3, 6, 5, 9, 8,
  ],
  solutionKeys: V7_RECOMMENDED_KEYS,
  minimumSolutionKeys: V7_MINIMUM_KEYS,
  minimumAdditions: 1,
  minimumAdditionsProven: true,
  acceptanceNotes: [
    'V7-Lite local harder sample; the verified recommended route uses all five additions.',
    'Selected from at most 60 V6-local mutations; minimum additions is one and reviewed remains false.',
  ],
  reviewed: false,
};
