import type { TrainerHistoryEntry } from "./trainerHistory.js";

export interface TrainerSummaryByHand {
  hand: string;
  attempts: number;
  correctCount: number;
  incorrectCount: number;
  accuracyPct: number;
}

export interface TrainerSummary {
  totalAttempts: number;
  correctCount: number;
  incorrectCount: number;
  accuracyPct: number | null;
  recentWindowAttempts: number;
  recentWindowAccuracyPct: number | null;
  mistakeCount: number;
  latestResult: TrainerHistoryEntry | null;
  mostRecentMistake: TrainerHistoryEntry | null;
  byHand: TrainerSummaryByHand[];
}

export interface BuildTrainerSummaryOptions {
  recentWindowSize?: number;
  maxByHandRows?: number;
}

const DEFAULT_WINDOW_SIZE = 10;
const DEFAULT_MAX_BY_HAND = 10;

export function buildTrainerSummary(
  recentRecords: TrainerHistoryEntry[],
  mistakeRecords: TrainerHistoryEntry[],
  options: BuildTrainerSummaryOptions = {}
): TrainerSummary {
  const windowSize = Number.isFinite(options.recentWindowSize) && (options.recentWindowSize ?? 0) > 0
    ? Math.trunc(options.recentWindowSize!)
    : DEFAULT_WINDOW_SIZE;
  const maxByHandRows = Number.isFinite(options.maxByHandRows) && (options.maxByHandRows ?? 0) > 0
    ? Math.trunc(options.maxByHandRows!)
    : DEFAULT_MAX_BY_HAND;

  const totalAttempts = recentRecords.length;
  const correctCount = recentRecords.filter((record) => record.isCorrect).length;
  const incorrectCount = totalAttempts - correctCount;
  const accuracyPct = totalAttempts > 0 ? toPct(correctCount, totalAttempts) : null;

  const recentWindow = recentRecords.slice(0, windowSize);
  const recentWindowAttempts = recentWindow.length;
  const recentWindowCorrectCount = recentWindow.filter((record) => record.isCorrect).length;
  const recentWindowAccuracyPct = recentWindowAttempts > 0 ? toPct(recentWindowCorrectCount, recentWindowAttempts) : null;

  const mistakeCount = mistakeRecords.length;
  const latestResult = recentRecords[0] ?? null;
  const mostRecentMistake = mistakeRecords[0] ?? recentRecords.find((record) => !record.isCorrect) ?? null;

  const byHandMap = new Map<string, { attempts: number; correctCount: number; incorrectCount: number }>();
  for (const record of recentRecords) {
    const handKey = record.hand;
    const stats = byHandMap.get(handKey) ?? { attempts: 0, correctCount: 0, incorrectCount: 0 };
    stats.attempts += 1;
    if (record.isCorrect) {
      stats.correctCount += 1;
    } else {
      stats.incorrectCount += 1;
    }
    byHandMap.set(handKey, stats);
  }

  const byHand = [...byHandMap.entries()]
    .map(([hand, stats]) => ({
      hand,
      attempts: stats.attempts,
      correctCount: stats.correctCount,
      incorrectCount: stats.incorrectCount,
      accuracyPct: toPct(stats.correctCount, stats.attempts)
    }))
    .sort((left, right) => {
      if (right.attempts !== left.attempts) {
        return right.attempts - left.attempts;
      }
      return left.hand.localeCompare(right.hand);
    })
    .slice(0, maxByHandRows);

  return {
    totalAttempts,
    correctCount,
    incorrectCount,
    accuracyPct,
    recentWindowAttempts,
    recentWindowAccuracyPct,
    mistakeCount,
    latestResult,
    mostRecentMistake,
    byHand
  };
}

function toPct(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }
  return Number(((numerator / denominator) * 100).toFixed(2));
}
