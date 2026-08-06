import { indexToPosition, type Cell, type GameMove } from '../core';
import type { DesignFamily, VerifiedPuzzle } from '../puzzles/types';
import { V3_COMPARATIVE_CANDIDATES } from './v3Candidates';
import { V5_LITE_PLAYTEST_CANDIDATE } from './v5LiteCandidate';

export interface PuzzleCandidate {
  readonly displayNumber: number;
  readonly seed: string;
  readonly designFamily: DesignFamily;
  readonly prototypeBand: VerifiedPuzzle['prototypeBand'];
  readonly cells: readonly Cell[];
  readonly additionsAllowed: 5;
  readonly solution: readonly GameMove[];
  readonly minimumAdditionSolution: readonly GameMove[];
  readonly minimumMoveSolutionAtMinimumAdditions: readonly GameMove[];
  readonly lowHeightSolution: readonly GameMove[];
  readonly recommendedHumanSolution: readonly GameMove[];
  readonly minimumAdditions: number;
  readonly minimumAdditionsProven: boolean;
  readonly acceptanceNotes: readonly string[];
  readonly reviewed: boolean;
}

interface EncodedPrototype {
  readonly displayNumber: number;
  readonly seed: string;
  readonly designFamily: DesignFamily;
  readonly prototypeBand: VerifiedPuzzle['prototypeBand'];
  readonly cells: readonly Cell[];
  readonly solutionKeys: readonly string[];
  readonly minimumSolutionKeys?: readonly string[];
  readonly minimumAdditions: number;
  readonly minimumAdditionsProven?: boolean;
  readonly acceptanceNotes?: readonly string[];
  readonly reviewed?: boolean;
}

function decodeMove(key: string): GameMove {
  if (key === 'A') return { type: 'ADD_NUMBERS' };
  const [first, second] = key.split('-').map(Number);
  if (first === undefined || second === undefined) {
    throw new Error(`解答キーが不正です: ${key}`);
  }
  return {
    type: 'PAIR',
    first: indexToPosition(first),
    second: indexToPosition(second),
  };
}

export const V2_PROTOTYPES: readonly EncodedPrototype[] = [
  {
    displayNumber: 1,
    seed: 'master-v2-01-distributed-weave',
    designFamily: 'distributed-weave',
    prototypeBand: 'MASTER_01_10',
    cells: [
      6, 4, 8, 5, 7, 4, 7, 8, 2,
      2, 9, 8, 1, 9, 4, 4, 3, 1,
      9, 5, 6, 7, 7, 3, 1, 6, 4,
      4, 1, 3, 9, 9, 3, 3, 5, 5,
      8, 2, 3, 4, 4, 1, 9, 5, 6,
      6, 6, 7, 5, 9, 4, 3, 8, 4,
    ],
    solutionKeys: [
      '22-32', '44-45', '6-16', '5-15', '30-31', '34-35', '26-27',
      '7-8', '41-42', '36-37', '38-47', '21-29', 'A', '20-40', '2-11',
      '65-66', '62-63', '14-46', '18-28', '10-12', '60-70', '55-64',
      '0-50', '53-54', '73-81', '74-83', '71-80', '57-67', '51-69',
      '43-48', '13-17', '52-61', '3-19', '39-75', '24-40', '23-33',
      '9-29', '1-41', '16-32', '22-24', '18-25', '14-19', '4-13',
    ],
    minimumSolutionKeys: [
      '41-49', '15-25', '22-32', '23-33', '10-18', '6-16', '35-43',
      '5-14', '0-20', '45-46', '13-17', '30-31', '8-9', '12-28',
      '38-47', '21-51', '26-27', '44-53', '36-37', '39-40', '2-11',
      '4-20', '1-41', '3-39', '15-33', '10-25', '7-16',
    ],
    minimumAdditions: 0,
  },
  {
    displayNumber: 2,
    seed: 'master-v2-02-timing-crossroads',
    designFamily: 'timing-crossroads',
    prototypeBand: 'MASTER_01_10',
    cells: [
      9, 9, 3, 8, 2, 8, 2, 3, 2,
      1, 6, 7, 9, 5, 3, 9, 4, 1,
      6, 9, 9, 6, 8, 8, 2, 7, 4,
      1, 4, 5, 6, 2, 2, 9, 6, 2,
      4, 2, 5, 9, 1, 3, 6, 2, 6,
      4, 3, 5, 3, 3, 7, 2, 5, 8,
      4, 3, 3, 7, 1, 8, 4, 3, 5,
    ],
    solutionKeys: [
      '23-24', '18-28', '49-57', '19-27', '46-56', '36-45', '0-1',
      '4-5', '2-11', '22-31', 'A', '34-44', '68-76', '63-64', '97-105',
      '87-88', '39-40', '35-37', '43-53', '73-83', '96-98', '67-75',
      '51-59', '95-104', '70-79', '84-85', '15-33', '60-92', '25-41',
      '55-65', '50-77', '72-82', '38-47', '17-20', '3-6', '16-21',
      '30-80', '8-32', '52-62', '7-61', '81-90', '17-33', '54-64',
      '67-73', '47-74', '5-21', '4-11', '1-9', '26-44', '41-48',
      '0-3', '12-30', '4-15', '6-13',
    ],
    minimumAdditions: 1,
  },
  {
    displayNumber: 11,
    seed: 'master-v2-11-complement-switchback',
    designFamily: 'complement-switchback',
    prototypeBand: 'MASTER_11_20',
    cells: [
      6, 2, 3, 3, 1, 1, 8, 9, 8,
      7, 1, 2, 6, 7, 3, 8, 7, 1,
      1, 3, 5, 6, 3, 9, 5, 6, 7,
      3, 2, 7, 2, 6, 5, 4, 9, 9,
      6, 2, 9, 9, 9, 4, 3, 1, 6,
      8, 1, 2, 1, 9, 7, 5, 7, 2,
      5, 7, 6, 7, 3, 2, 9, 3, 8,
    ],
    solutionKeys: [
      '33-41', '39-40', '19-29', '28-30', 'A', '62-71', '7-17', '80-81',
      '59-69', '92-101', '1-11', '24-32', '50-58', '6-15', '68-70',
      '88-89', '57-65', '26-27', '37-47', '22-42', '82-91', '93-103',
      '52-61', '38-46', '83-99', '100-108', '105-113', '12-21', '49-67',
      '66-72', '97-107', '79-84', '64-74', '96-98', '10-18', '63-90',
      '9-13', '23-43', '4-5', '2-3', '36-44', '51-55', '14-16',
      '60-67', '35-51', '16-22', '59-79', '49-89', '33-36', '27-90',
      '68-75', '26-30', '39-66', '25-70', '0-20', '19-32', '38-40',
      '22-32', '8-24', '2-10',
    ],
    minimumAdditions: 1,
  },
  {
    displayNumber: 12,
    seed: 'master-v2-12-row-boundary-lattice',
    designFamily: 'row-boundary-lattice',
    prototypeBand: 'MASTER_11_20',
    cells: [
      1, 5, 8, 3, 9, 6, 7, 3, 5,
      2, 7, 6, 5, 9, 3, 2, 2, 5,
      3, 7, 5, 1, 9, 7, 4, 8, 4,
      4, 4, 6, 9, 1, 8, 2, 1, 1,
      1, 7, 8, 7, 9, 6, 9, 8, 8,
      9, 2, 7, 8, 9, 8, 6, 1, 9,
      9, 8, 5, 4, 9, 5, 2, 7, 4,
      7, 7, 1, 8, 5, 6, 3, 2, 7,
    ],
    solutionKeys: [
      '16-25', '4-13', '49-58', '22-31', '50-66', '6-7', 'A', '41-51',
      '102-112', '24-26', '79-89', '85-86', '38-48', '95-104', '101-111',
      '99-109', '18-19', '114-115', '30-40', '34-42', '32-33', '28-29',
      '52-53', '8-17', '119-128', '14-23', '61-69', '11-27', '43-70',
      '74-83', '106-116', '60-78', '62-94', '90-91', '63-64', '121-130',
      '118-120', '39-47', '92-93', '122-131', '107-108', '105-123', '96-97',
      '36-45', '46-55', '115-116', '79-89', '58-68', '71-95', '45-63',
      '20-50', '59-67', '21-35', '3-19', '57-60', '48-93', '46-54',
      '9-72', '15-26', '10-37', '0-54', '12-20', '20-28', '5-12',
      '2-29', '1-28', '8-13',
    ],
    minimumAdditions: 1,
  },
  {
    displayNumber: 21,
    seed: 'master-v2-21-multi-add-realignment',
    designFamily: 'multi-add-realignment',
    prototypeBand: 'MASTER_21_30',
    cells: [
      7, 6, 9, 2, 3, 1, 4, 1, 7,
      7, 6, 4, 2, 8, 1, 2, 1, 3,
      4, 5, 3, 2, 1, 5, 5, 7, 1,
      3, 3, 1, 5, 8, 8, 1, 2, 5,
      5, 6, 6, 1, 6, 3, 9, 3, 3,
      6, 1, 9, 2, 5, 8, 6, 1, 5,
      2, 8, 3, 9, 2, 3, 2, 8, 2,
      1, 2, 7, 2, 6, 8, 2, 1, 1,
    ],
    solutionKeys: [
      '12-13', '20-28', '48-58', '47-57', '8-9', '60-61', '52-70',
      '1-11', '37-67', '33-42', 'A', '96-97', '54-64', '104-114',
      '112-121', '105-115', '113-116', '2-22', '88-89', '102-110',
      '93-101', '10-18', '50-66', '16-26', '23-24', '83-103', '85-94',
      '25-41', '32-34', '100-106', '95-122', 'A', '144-153', '78-87',
      '65-75', '140-150', '82-91', '172-181', '176-185', '127-136',
      '77-79', '129-130', '99-108', '120-138', '63-73', '137-139',
      '76-80', '109-118', '141-149', '154-162', '107-123', '62-86',
      '157-166', '122-149', '136-154', '155-164', '90-110', '15-31',
      '68-69', '175-177', '134-137', '29-39', '133-138', '143-151',
      '170-178', '56-59', '156-158', '98-102', '160-162', '38-40',
      '43-44', '133-151', '141-150', '108-138', '106-114', '107-116',
      '35-53', '30-36', '5-14', '3-21', '0-4', '62-134', '6-42',
      '56-63', '54-74', '123-128', '40-94', '81-111', '19-79',
      '54-74', '48-56', '37-49', '28-44', '17-18', '9-18', '7-12',
    ],
    minimumSolutionKeys: [
      'A', '75-84', '73-82', '1-10', '140-141', '56-65', '142-143',
      '115-116', '111-119', '67-83', '89-97', '33-42', '109-117',
      '126-136', '114-124', '0-9', '54-64', '76-92', '14-22', '47-74',
      '70-71', '132-133', '57-77', '95-96', '55-58', '31-32', '128-137',
      '103-127', '3-13', '12-21', '8-17', '60-61', '37-38', '2-52',
      '69-85', '25-41', '20-28', '29-39', '16-26', '106-122', '110-112',
      '48-68', '99-100', '104-120', '80-81', '51-78', '88-98', '86-94',
      '43-59', '66-93', '19-49', '113-131', '30-102', '101-105',
      '34-50', '91-107', '121-125', '23-53', '46-109', '99-112',
      '7-79', '90-105', '6-11', '102-108', '40-103', '35-36', '27-44',
      '5-45', '44-60', '4-36', '9-18', '15-26', '6-12',
    ],
    minimumAdditions: 1,
    acceptanceNotes: [
      '選定解は2回追加・96手だが、1回追加・73手の別解があるため、最上位帯の最小追加2回目標は未達。',
      '人間の実プレイ承認前の試作として公開し、承認または再設計判断を待つ。',
    ],
  },
];

// V3 remains imported and exported as a comparison corpus. Only the single
// V5-Lite playtest is exposed in the local catalog for this iteration.
void V3_COMPARATIVE_CANDIDATES;
const PROTOTYPES: readonly EncodedPrototype[] = [V5_LITE_PLAYTEST_CANDIDATE];

export const PROTOTYPE_DISPLAY_NUMBERS = PROTOTYPES.map((prototype) => prototype.displayNumber);

export function generateCandidate(index: number): PuzzleCandidate {
  if (!Number.isInteger(index) || index < 0 || index >= PROTOTYPES.length) {
    throw new RangeError(`試作問題インデックスは0から${PROTOTYPES.length - 1}でなければなりません。`);
  }
  const prototype = PROTOTYPES[index];
  if (!prototype) throw new RangeError('試作問題が見つかりません。');
  const solution = prototype.solutionKeys.map(decodeMove);
  return {
    displayNumber: prototype.displayNumber,
    seed: prototype.seed,
    designFamily: prototype.designFamily,
    prototypeBand: prototype.prototypeBand,
    cells: prototype.cells,
    additionsAllowed: 5,
    solution,
    minimumAdditionSolution: (prototype.minimumSolutionKeys ?? prototype.solutionKeys).map(decodeMove),
    minimumMoveSolutionAtMinimumAdditions: (prototype.minimumSolutionKeys ?? prototype.solutionKeys).map(decodeMove),
    lowHeightSolution: (prototype.minimumSolutionKeys ?? prototype.solutionKeys).map(decodeMove),
    recommendedHumanSolution: prototype.solutionKeys.map(decodeMove),
    minimumAdditions: prototype.minimumAdditions,
    minimumAdditionsProven: prototype.minimumAdditionsProven ?? true,
    acceptanceNotes: prototype.acceptanceNotes ?? ['実プレイ承認待ちの試作問題。'],
    reviewed: prototype.reviewed ?? true,
  };
}
