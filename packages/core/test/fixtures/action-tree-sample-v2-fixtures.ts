export type ActionTreeSampleSpotFamily = "RFI" | "LIMP" | "FACING_OPEN" | "FACING_LIMP" | "VS_THREE_BET";

const basePlayers = [
  { seat: 1, position: "UTG", stackBb: 25, inHand: true },
  { seat: 2, position: "HJ", stackBb: 25, inHand: true },
  { seat: 3, position: "CO", stackBb: 25, inHand: true },
  { seat: 4, position: "BTN", stackBb: 25, inHand: true },
  { seat: 5, position: "SB", stackBb: 25, inHand: true },
  { seat: 6, position: "BB", stackBb: 25, inHand: true }
] as const;

function spot({
  heroSeat,
  heroPosition,
  actionPath,
  treeConfig
}: {
  heroSeat: number;
  heroPosition: string;
  actionPath: string[];
  treeConfig: string;
}) {
  return {
    gameType: "NLHE_MTT",
    tournamentType: "REGULAR",
    decisionType: "PUSH_FOLD",
    tableSize: 6,
    heroSeat,
    heroPosition,
    potBb: 2.4,
    blinds: {
      smallBb: 0.5,
      bigBb: 1,
      anteBb: 0.125
    },
    players: basePlayers.map((player) => ({
      ...player,
      isHero: player.seat === heroSeat
    })),
    payouts: [50, 30, 20],
    actionPath,
    treeConfig
  };
}

function sourceMetadata(spotFamily: ActionTreeSampleSpotFamily, actionTags: string[]) {
  return {
    sourceLabel: `SAMPLE_TEST_ONLY_${spotFamily}`,
    fileName: `sample-test-only-${spotFamily.toLowerCase().replaceAll("_", "-")}.json`,
    isSample: true,
    testOnly: true,
    calculationModel: "TEST_ONLY_SAMPLE",
    streetScope: "PREFLOP",
    exportShape: "MULTI_ACTION_V2_SAMPLE",
    spotFamily,
    actionTags
  };
}

export const actionTreeSampleImportV2Records = [
  {
    schemaVersion: "multi-action-v2",
    spot: spot({
      heroSeat: 4,
      heroPosition: "BTN",
      actionPath: ["FIRST_IN", "RFI_OPEN_RAISE", "BTN_DECISION"],
      treeConfig: "SAMPLE_TEST_ONLY_RFI_OPEN_RAISE"
    }),
    strategy: {
      AA: {
        actions: [
          {
            action: "RAISE",
            sizeBb: 2.2,
            rawSizeLabel: "2.2bb",
            frequency: 0.55,
            ev: 0.42,
            chipEV: 0.51,
            icmEV: 0.42,
            sourceActionLabel: "TEST_ONLY Raise 2.2bb"
          },
          {
            action: "ALL_IN",
            isAllIn: true,
            frequency: 0.45,
            ev: 0.39,
            chipEV: 0.48,
            icmEV: 0.39,
            sourceActionLabel: "TEST_ONLY All-in"
          }
        ]
      },
      KQo: {
        actions: [
          {
            action: "FOLD",
            frequency: 1,
            ev: null,
            chipEV: null,
            icmEV: null,
            sourceActionLabel: "TEST_ONLY Fold"
          }
        ]
      }
    },
    sourceMetadata: sourceMetadata("RFI", ["SAMPLE", "TEST_ONLY", "RFI", "OPEN_RAISE", "FOLD", "RAISE", "ALL_IN"])
  },
  {
    schemaVersion: "multi-action-v2",
    spot: spot({
      heroSeat: 5,
      heroPosition: "SB",
      actionPath: ["FIRST_IN_LIMP", "OPEN_LIMP", "SB_DECISION"],
      treeConfig: "SAMPLE_TEST_ONLY_OPEN_LIMP"
    }),
    strategy: {
      A5s: {
        actions: [
          {
            action: "CALL",
            rawSizeLabel: "limp",
            frequency: 0.35,
            ev: 0.05,
            chipEV: 0.07,
            icmEV: 0.05,
            sourceActionLabel: "TEST_ONLY Limp represented as CALL until LIMP schema support"
          },
          {
            action: "RAISE",
            sizeBb: 2.5,
            rawSizeLabel: "2.5bb",
            frequency: 0.4,
            ev: 0.08,
            chipEV: 0.1,
            icmEV: 0.08,
            sourceActionLabel: "TEST_ONLY Raise 2.5bb"
          },
          {
            action: "ALL_IN",
            isAllIn: true,
            frequency: 0.25,
            ev: 0.04,
            chipEV: 0.06,
            icmEV: 0.04,
            sourceActionLabel: "TEST_ONLY All-in"
          }
        ]
      },
      QJs: {
        actions: [
          {
            action: "FOLD",
            frequency: 1,
            ev: null,
            chipEV: null,
            icmEV: null,
            sourceActionLabel: "TEST_ONLY Fold"
          }
        ]
      }
    },
    sourceMetadata: sourceMetadata("LIMP", ["SAMPLE", "TEST_ONLY", "LIMP", "OPEN_LIMP", "FOLD", "RAISE", "ALL_IN"])
  },
  {
    schemaVersion: "multi-action-v2",
    spot: spot({
      heroSeat: 6,
      heroPosition: "BB",
      actionPath: ["BTN_OPEN_2.2BB", "FACING_OPEN", "BB_DECISION"],
      treeConfig: "SAMPLE_TEST_ONLY_FACING_OPEN_VS_OPEN"
    }),
    strategy: {
      AKs: {
        actions: [
          {
            action: "CALL",
            rawSizeLabel: "call 2.2bb",
            frequency: 0.45,
            ev: 0.12,
            chipEV: 0.15,
            icmEV: 0.12,
            sourceActionLabel: "TEST_ONLY Call open"
          },
          {
            action: "RAISE",
            sizeBb: 7.5,
            rawSizeLabel: "7.5bb",
            frequency: 0.35,
            ev: 0.15,
            chipEV: 0.19,
            icmEV: 0.15,
            sourceActionLabel: "TEST_ONLY 3bet"
          },
          {
            action: "FOLD",
            frequency: 0.2,
            ev: 0,
            chipEV: 0,
            icmEV: 0,
            sourceActionLabel: "TEST_ONLY Fold"
          }
        ]
      },
      KQs: {
        actions: [
          {
            action: "ALL_IN",
            isAllIn: true,
            frequency: 1,
            ev: 0.11,
            chipEV: 0.14,
            icmEV: 0.11,
            sourceActionLabel: "TEST_ONLY All-in"
          }
        ]
      }
    },
    sourceMetadata: sourceMetadata("FACING_OPEN", ["SAMPLE", "TEST_ONLY", "FACING_OPEN", "VS_OPEN", "FOLD", "CALL", "RAISE", "ALL_IN"])
  },
  {
    schemaVersion: "multi-action-v2",
    spot: spot({
      heroSeat: 6,
      heroPosition: "BB",
      actionPath: ["SB_OPEN_LIMP", "FACING_LIMP", "VS_LIMP", "BB_DECISION"],
      treeConfig: "SAMPLE_TEST_ONLY_FACING_LIMP_VS_LIMP"
    }),
    strategy: {
      KQs: {
        actions: [
          {
            action: "CHECK",
            frequency: 0.5,
            ev: 0.06,
            chipEV: 0.07,
            icmEV: 0.06,
            sourceActionLabel: "TEST_ONLY Check option"
          },
          {
            action: "RAISE",
            sizeBb: 3.5,
            rawSizeLabel: "3.5bb",
            frequency: 0.3,
            ev: 0.08,
            chipEV: 0.1,
            icmEV: 0.08,
            sourceActionLabel: "TEST_ONLY Iso raise"
          },
          {
            action: "ALL_IN",
            isAllIn: true,
            frequency: 0.2,
            ev: 0.04,
            chipEV: 0.05,
            icmEV: 0.04,
            sourceActionLabel: "TEST_ONLY All-in"
          }
        ]
      },
      "76s": {
        actions: [
          {
            action: "FOLD",
            frequency: 1,
            ev: null,
            chipEV: null,
            icmEV: null,
            sourceActionLabel: "TEST_ONLY Fold"
          }
        ]
      }
    },
    sourceMetadata: sourceMetadata("FACING_LIMP", ["SAMPLE", "TEST_ONLY", "FACING_LIMP", "VS_LIMP", "CHECK", "FOLD", "RAISE", "ALL_IN"])
  },
  {
    schemaVersion: "multi-action-v2",
    spot: spot({
      heroSeat: 4,
      heroPosition: "BTN",
      actionPath: ["BTN_OPEN_2.2BB", "BB_3BET_7.5BB", "FACING_3BET", "BTN_DECISION"],
      treeConfig: "SAMPLE_TEST_ONLY_VS_3BET"
    }),
    strategy: {
      AKo: {
        actions: [
          {
            action: "CALL",
            rawSizeLabel: "call 7.5bb",
            frequency: 0.4,
            ev: 0.13,
            chipEV: 0.16,
            icmEV: 0.13,
            sourceActionLabel: "TEST_ONLY Call 3bet"
          },
          {
            action: "ALL_IN",
            isAllIn: true,
            frequency: 0.35,
            ev: 0.12,
            chipEV: 0.15,
            icmEV: 0.12,
            sourceActionLabel: "TEST_ONLY 4bet all-in"
          },
          {
            action: "FOLD",
            frequency: 0.25,
            ev: 0,
            chipEV: 0,
            icmEV: 0,
            sourceActionLabel: "TEST_ONLY Fold"
          }
        ]
      },
      QJs: {
        actions: [
          {
            action: "RAISE",
            sizeBb: 16,
            rawSizeLabel: "16bb",
            frequency: 0.25,
            ev: 0.02,
            chipEV: 0.03,
            icmEV: 0.02,
            sourceActionLabel: "TEST_ONLY 4bet"
          },
          {
            action: "FOLD",
            frequency: 0.75,
            ev: 0,
            chipEV: 0,
            icmEV: 0,
            sourceActionLabel: "TEST_ONLY Fold"
          }
        ]
      }
    },
    sourceMetadata: sourceMetadata("VS_THREE_BET", ["SAMPLE", "TEST_ONLY", "VS_THREE_BET", "FACING_3BET", "FOLD", "CALL", "RAISE", "ALL_IN"])
  }
] as const;

export function findActionTreeSampleImportV2Record(spotFamily: ActionTreeSampleSpotFamily) {
  const record = actionTreeSampleImportV2Records.find((candidate) => candidate.sourceMetadata.spotFamily === spotFamily);
  if (!record) {
    throw new Error(`Missing action tree sample fixture: ${spotFamily}`);
  }
  return record;
}
