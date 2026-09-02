import { simulateAnagram } from './anagram';
import { simulateCorsi } from './corsi';
import { simulateGoNoGo } from './go-nogo';
import { simulateLightsOut } from './lights-out';
import { simulateMentalChain } from './mental-chain';
import { simulateMentalRotation } from './mental-rotation';
import { simulateNBack } from './n-back';
import { simulateNumberSequence } from './number-sequence';
import { simulateSchulte } from './schulte';
import { simulateStroop } from './stroop';
import type { Simulator } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */
export const SIMULATORS: Record<string, Simulator<any, any, any>> = {
  stroop: simulateStroop,
  'go-nogo': simulateGoNoGo,
  'n-back': simulateNBack,
  'mental-chain': simulateMentalChain,
  'number-sequence': simulateNumberSequence,
  corsi: simulateCorsi,
  schulte: simulateSchulte,
  'lights-out': simulateLightsOut,
  anagram: simulateAnagram,
  'mental-rotation': simulateMentalRotation,
};
/* eslint-enable @typescript-eslint/no-explicit-any */
