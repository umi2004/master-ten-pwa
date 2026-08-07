import type { EncodedV3Candidate } from './v3Candidates';

/** Local-only V6 hard sample. This remains deliberately unreviewed. */
export const V6_LITE_HARD_SAMPLE: EncodedV3Candidate = {
  displayNumber: 1,
  seed: 'master-v6-lite-23',
  designFamily: 'timing-crossroads',
  prototypeBand: 'MASTER_01_10',
  cells: [
    7, 9, 6, 2, 2, 5, 8, 3, 6, 4, 5, 1, 8, 3, 6, 5, 9, 2,
    9, 2, 7, 4, 5, 1, 8, 3, 6, 5, 4, 1, 8, 3, 6, 5, 9, 2,
    8, 3, 6, 5, 9, 2,
  ],
  solutionKeys: [
    '35-36', '4-12', '5-15', '3-6', '1-11', '8-9', '28-38', 'A',
    '41-51', '52-62', '18-48', '40-50', '59-67', '60-68', '37-46',
    '55-65', '57-66', '45-54', '43-53', '42-44', '49-69', '47-63',
    '17-19', '10-55', '0-20', '7-13', 'A', '52-60', '54-55', '59-69',
    '68-70', '56-64', '32-62', '2-14', '18-54', '40-48', '56-64',
    '52-57', 'A', '14-68', '69-78', '77-79', '73-81', '58-66', '67-75',
    '71-80', 'A', '83-93', '82-84', '85-94', '76-103', '86-95', '70-102',
    '65-72', '74-87', '24-87', '38-88', '30-40', '25-65', '15-35',
    '21-45', '22-46', '27-43', '20-35', '12-32', '17-26', 'A', '28-38',
    '20-36', '16-26', '18-24', '13-25', '7-10',
  ],
  minimumSolutionKeys: [
    '1-11', '3-4', '5-15', '6-24', '8-9', '28-38', '35-36', 'A',
    '27-45', '30-46', '37-47', '29-56', '39-55', '21-48', '34-40',
    '41-50', '44-53', '49-51', '52-61', '43-45', '42-48', '22-46',
    '13-31', '26-32', '33-41', '12-42', '18-38', '23-33', '20-25',
    '10-40', '17-19', '0-30', '14-22', '16-32', '2-18', '7-17',
  ],
  minimumAdditions: 1,
  minimumAdditionsProven: true,
  acceptanceNotes: [
    'V6-Lite local hard sample; the verified recommended route uses all five additions.',
    'Minimum additions is one; the harder-route and deeper-AI goals remain unmet; reviewed remains false.',
  ],
  reviewed: false,
};
