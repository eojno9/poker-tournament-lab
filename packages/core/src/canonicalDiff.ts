import { canonicalSpotKey, normalizeSpot } from "./canonical.js";
import type {
  CanonicalDiffInput,
  CanonicalKeyDifference,
  CanonicalKeyDiffResult,
  SpotInput
} from "./types.js";

const DIFF_SEVERITY = "key_affecting" as const;

export function diffCanonicalInputs(leftInput: CanonicalDiffInput, rightInput: CanonicalDiffInput): CanonicalKeyDiffResult {
  const leftSpot = normalizeSpot(leftInput.spot);
  const rightSpot = normalizeSpot(rightInput.spot);
  const leftCanonicalKey = canonicalSpotKey(leftSpot);
  const rightCanonicalKey = canonicalSpotKey(rightSpot);

  const differences: CanonicalKeyDifference[] = [];
  pushDiff(differences, "gameType", leftSpot.gameType, rightSpot.gameType);
  pushDiff(differences, "tournamentType", leftSpot.tournamentType, rightSpot.tournamentType);
  pushDiff(differences, "decisionType", leftSpot.decisionType, rightSpot.decisionType);
  pushDiff(differences, "tableSize", leftSpot.tableSize, rightSpot.tableSize);
  pushDiff(differences, "remainingPlayers", leftSpot.players.length, rightSpot.players.length);
  pushDiff(differences, "heroPosition", leftSpot.heroPosition, rightSpot.heroPosition);
  pushDiff(differences, "actionPath", leftSpot.actionPath, rightSpot.actionPath);
  pushDiff(differences, "blinds.smallBb", leftSpot.blinds.smallBb, rightSpot.blinds.smallBb);
  pushDiff(differences, "blinds.bigBb", leftSpot.blinds.bigBb, rightSpot.blinds.bigBb);
  pushDiff(differences, "ante", leftSpot.blinds.anteBb, rightSpot.blinds.anteBb);
  pushDiff(differences, "payouts", leftSpot.payouts, rightSpot.payouts);
  pushDiff(differences, "treeConfig", normalizeTreeConfig(leftInput.treeConfig), normalizeTreeConfig(rightInput.treeConfig));

  const allSeats = new Set<number>();
  for (const player of leftSpot.players) {
    allSeats.add(player.seat);
  }
  for (const player of rightSpot.players) {
    allSeats.add(player.seat);
  }

  for (const seat of Array.from(allSeats).sort((a, b) => a - b)) {
    const leftPlayer = leftSpot.players.find((player) => player.seat === seat);
    const rightPlayer = rightSpot.players.find((player) => player.seat === seat);
    const leftPosition = leftPlayer?.position ?? null;
    const rightPosition = rightPlayer?.position ?? null;
    pushDiff(differences, `positions.seat${seat}`, leftPosition, rightPosition);

    const stackLabelPosition = leftPosition ?? rightPosition ?? `SEAT${seat}`;
    pushDiff(differences, `stacks.${stackLabelPosition}`, leftPlayer?.stackBb ?? null, rightPlayer?.stackBb ?? null);
  }

  const sameCanonicalKey = leftCanonicalKey === rightCanonicalKey;
  const explanation = buildExplanation(differences, sameCanonicalKey);
  return {
    sameCanonicalKey,
    leftCanonicalKey,
    rightCanonicalKey,
    differences,
    explanation
  };
}

export function asCanonicalDiffInput(value: SpotInput | CanonicalDiffInput): CanonicalDiffInput {
  const candidate = value as CanonicalDiffInput;
  if (candidate && typeof candidate === "object" && "spot" in candidate) {
    return {
      spot: candidate.spot,
      treeConfig: candidate.treeConfig ?? null
    };
  }
  return {
    spot: value as SpotInput
  };
}

function pushDiff(differences: CanonicalKeyDifference[], field: string, left: unknown, right: unknown): void {
  if (sameValue(left, right)) {
    return;
  }
  differences.push({
    field,
    left,
    right,
    severity: DIFF_SEVERITY
  });
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function normalizeTreeConfig(input: string | null | undefined): string | null {
  if (typeof input !== "string") {
    return null;
  }
  const normalized = input.trim();
  return normalized.length > 0 ? normalized : null;
}

function buildExplanation(differences: CanonicalKeyDifference[], sameCanonicalKey: boolean): string[] {
  if (sameCanonicalKey) {
    return ["두 입력은 정규화 후 동일하여 canonical key가 같습니다."];
  }
  if (differences.length === 0) {
    return ["정규화 전후 비교에서 핵심 필드 차이를 찾지 못했지만 canonical key는 다릅니다."];
  }
  return differences.map((difference) => {
    if (difference.field.startsWith("stacks.")) {
      const seatLabel = difference.field.slice("stacks.".length);
      return `${seatLabel} stack 값이 달라 canonical key가 달라졌습니다.`;
    }
    if (difference.field === "ante") {
      return "ante 값이 달라 canonical key가 달라졌습니다.";
    }
    if (difference.field === "payouts") {
      return "payouts 값이 달라 canonical key가 달라졌습니다.";
    }
    if (difference.field === "actionPath") {
      return "action path가 달라 canonical key가 달라졌습니다.";
    }
    if (difference.field === "heroPosition") {
      return "hero position이 달라 canonical key가 달라졌습니다.";
    }
    if (difference.field === "treeConfig") {
      return "tree config가 달라 canonical key가 달라졌습니다.";
    }
    return `${difference.field} 값이 달라 canonical key가 달라졌습니다.`;
  });
}
