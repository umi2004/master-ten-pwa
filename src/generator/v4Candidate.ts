import type { EncodedV3Candidate } from './v3Candidates';

/**
 * V4 local-only comparison prototype. It deliberately remains reviewed=false:
 * exact search proves minimum additions is 1, so it cannot satisfy the V4
 * mandatory five-addition gate even though its planted route uses four.
 */
export const V4_COMPARATIVE_CANDIDATE: EncodedV3Candidate = {
  displayNumber: 1,
  seed: 'master-v4-critical-1-2703',
  designFamily: 'timing-crossroads',
  prototypeBand: 'MASTER_01_10',
  cells: [
    9, 2, 7, 4, 5, 1, 8, 3, 6, 4, 5, 1, 8, 3, 6, 5, 9, 2,
    9, 2, 7, 4, 5, 1, 8, 3, 6, 4, 5, 1, 8, 3, 6, 5, 9, 2,
    8, 3, 6, 5, 9, 2, 7, 4, 5, 5, 9, 2, 7, 4, 5, 1, 8, 3,
  ],
  solutionKeys: [
    '8-9', '0-18', '17-19', '10-28', '26-27', '35-36', '44-45', 'A',
    '51-61', '41-71', '42-60', '33-69', '52-62', '55-63', '56-64',
    '46-66', '48-72', '39-57', '54-74', '58-82', '38-68', '50-90',
    '40-70', '67-75', '49-76', '59-83', '29-69', '24-78', '34-82',
    '70-79', '71-80', '68-72', '75-84', 'A', '30-93', '25-31', '83-85',
    '77-101', '53-109', '86-94', '32-95', '14-34', '5-23', '15-47',
    '20-28', '49-60', '7-55', '16-56', '22-52', '6-54', '37-53', '21-51',
    '12-20', '2-32', '4-24', '25-41', '13-26', '19-29', 'A', '22-42',
    '21-25', '18-26', '11-21', '1-9', '3-13', '6-7', '8-17', 'A',
    '0-10', '1-11', '2-12', '3-13', '4-14', '5-15', '7-16', '0-8',
  ],
  minimumSolutionKeys: [
    '8-9', '0-18', '17-19', '10-28', '26-27', '35-36', '44-45', 'A',
    '51-61', '41-71', '42-60', '33-69', '52-62', '55-63', '56-64',
    '46-66', '48-72', '39-57', '54-74', '58-82', '38-68', '50-90',
    '40-70', '67-75', '49-76', '59-83', '29-69', '24-78', '64-82',
    '56-68', '31-61', '21-71', '12-30', '13-37', '4-22', '20-70',
    '16-23', '14-32', '5-68', '47-74', '15-63', '3-43', '25-57',
    '11-25', '7-17', '17-22', '2-12', '1-6',
  ],
  minimumAdditions: 1,
  acceptanceNotes: [
    'V4 local comparison prototype; reviewed=false because minimum additions is proven to be 1, not 5.',
    'The constrained Critical-State family reduced simple-player clears and produced late near misses, but exact optimal-move classification remains unproved.',
  ],
  reviewed: false,
};
