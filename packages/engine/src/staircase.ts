/**
 * Adaptive Schwierigkeit für den Training-Modus (§7.4): 3-up-1-down.
 * Nach drei aufeinanderfolgenden Runs mit accuracy >= 0.80 steigt das Level um 1,
 * nach einem Run darunter sinkt es um 1. Ungültige Runs verändern nichts.
 *
 * Referenzimplementierung – die maßgebliche Anpassung passiert serverseitig
 * (`apps/api/src/domain/staircase.rs`) und muss dieser Logik entsprechen.
 */

export const SUCCESS_THRESHOLD = 0.8;
export const UPS_REQUIRED = 3;

export type StaircaseState = {
  level: number;
  consecutiveUp: number;
  runsPlayed: number;
};

export type StaircaseRun = {
  accuracy: number;
  valid: boolean;
};

export const INITIAL_STAIRCASE: StaircaseState = { level: 1, consecutiveUp: 0, runsPlayed: 0 };

export function clampLevel(level: number, maxLevel: number): number {
  return Math.min(Math.max(1, level), Math.max(1, maxLevel));
}

export function applyStaircase(
  state: StaircaseState,
  run: StaircaseRun,
  maxLevel: number,
): StaircaseState {
  const runsPlayed = state.runsPlayed + 1;
  if (!run.valid) return { ...state, runsPlayed };
  if (run.accuracy >= SUCCESS_THRESHOLD) {
    const ups = state.consecutiveUp + 1;
    if (ups >= UPS_REQUIRED) {
      return { level: clampLevel(state.level + 1, maxLevel), consecutiveUp: 0, runsPlayed };
    }
    return { level: state.level, consecutiveUp: ups, runsPlayed };
  }
  return { level: clampLevel(state.level - 1, maxLevel), consecutiveUp: 0, runsPlayed };
}
