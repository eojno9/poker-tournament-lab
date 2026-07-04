export const RESULT_SOURCES = {
  HRC_PRECOMPUTED_DB: "HRC_PRECOMPUTED_DB",
  FALLBACK_ICM: "FALLBACK_ICM",
  NOT_SOLVED: "NOT_SOLVED"
} as const;

export type ResultSource = (typeof RESULT_SOURCES)[keyof typeof RESULT_SOURCES];

export type GameType = "NLHE_MTT";
export type TournamentType = "REGULAR";
export type DecisionType = "PUSH_FOLD";
export type RangePreset = "tight" | "standard" | "loose";
export type Street = "PREFLOP" | "FLOP" | "TURN" | "RIVER";
export type DatabaseStreetScope = "PREFLOP_ONLY" | "ANY_STREET" | "UNKNOWN";

export interface BlindStructure {
  smallBb: number;
  bigBb: number;
  anteBb: number;
}

export interface PlayerState {
  seat: number;
  position: string;
  stackBb: number;
  inHand: boolean;
  isHero?: boolean;
  name?: string;
  rangePreset?: RangePreset;
  callRangePct?: number;
}

export interface SpotInput {
  gameType: GameType;
  tournamentType: TournamentType;
  decisionType: DecisionType;
  street?: Street;
  tableSize: number;
  heroSeat: number;
  heroPosition: string;
  potBb: number;
  blinds: BlindStructure;
  players: PlayerState[];
  payouts: number[];
  actionPath: string[];
}

export type HandAction = "SHOVE" | "FOLD" | "MIXED";

export interface HandStrategy {
  action: HandAction;
  frequency: number;
  evPush?: number;
  evFold?: number;
  equityWhenCalled?: number;
  label?: string;
}

export type StrategyMatrix = Record<string, HandStrategy>;

export interface EvSummary {
  bestAction?: HandAction;
  shoveEv?: number;
  foldEv?: number;
  deltaEv?: number;
  unit: "prize" | "chips" | "unknown";
  notes?: string[];
}

export interface ImportedSolutionRecord {
  spot: SpotInput;
  strategy: StrategyMatrix;
  evSummary?: EvSummary;
  sourceLabel?: string;
  externalId?: string;
}

export interface HrcImportPayload {
  format: "json" | "csv";
  content: string;
  fileName?: string;
  sourceLabel?: string;
  databaseFeatures?: HrcDatabaseFeatures;
}

export interface HrcDatabaseFeatures {
  fileName: string;
  playerCount: number | null;
  stackDepthBb: number | null;
  treeDepth: number | null;
  calculationModel: "ChipEV" | "ICM" | "Unknown";
  spotFamily: string;
  actionTags: string[];
  streetScope: DatabaseStreetScope;
  preflopOnly: boolean;
  preflopOnlyReason: string | null;
  exportShape: "complete_export" | "single_root" | "hrcz_project" | "unknown";
  warnings: string[];
}

export interface RangeOverride {
  seat: number;
  preset?: RangePreset;
  callRangePct?: number;
}

export interface AnalyzeRequest {
  spot: SpotInput;
  villainRanges?: RangeOverride[];
  fallbackOptions?: {
    equitySamples?: number;
  };
}

export type FallbackPresetName = RangePreset | "custom";
export type FallbackRangeSource = "preset" | "user_override";

export interface FallbackVillainRange {
  seat: number;
  position: string;
  presetName: FallbackPresetName;
  editedByUser: boolean;
  callRangePct: number;
  rangeSource: FallbackRangeSource;
}

export interface FallbackMetadata {
  modelVersion: string;
  villainRanges: FallbackVillainRange[];
  limitations: string[];
}

export interface AnalyzeResult {
  source: ResultSource;
  sourceLabel: string;
  canonicalKey: string;
  assumptions: string[];
  limitations: string[];
  strategy: StrategyMatrix | null;
  evSummary: EvSummary | null;
  missingRequirements?: string[];
  metadata?: Record<string, unknown>;
  fallbackMetadata?: FallbackMetadata;
}
