export const actionTreeClassifierSamples = [
  {
    name: "RFI / Open Raise",
    expectedSpotType: "RFI",
    expectedActionNode: "OPEN_RAISE",
    expectedActions: ["FOLD", "RAISE", "ALL_IN"],
    expectedSizes: ["2.2bb", "all-in"],
    input: {
      source: "SAMPLE_TEST_ONLY_RFI",
      heroPosition: "BTN",
      tableSize: 6,
      remainingPlayers: 6,
      heroStackBb: 25,
      actionPath: ["RFI_OPEN_RAISE", "BTN_DECISION"],
      treeConfig: "SAMPLE_TEST_ONLY_RFI_OPEN_RAISE",
      sourceFile: "sample-test-only-rfi.json",
      sourceMetadata: {
        isSample: true,
        testOnly: true,
        calculationModel: "TEST_ONLY_SAMPLE",
        streetScope: "PREFLOP",
        exportShape: "MULTI_ACTION_V2_SAMPLE",
        spotFamily: "RFI",
        actionTags: ["SAMPLE", "TEST_ONLY", "RFI", "OPEN_RAISE", "FOLD", "RAISE", "ALL_IN"]
      },
      actions: [
        { action: "FOLD", frequency: 0.1 },
        { action: "RAISE", sizeBb: 2.2, rawSizeLabel: "2.2bb", frequency: 0.55 },
        { action: "ALL_IN", isAllIn: true, frequency: 0.35 }
      ]
    }
  },
  {
    name: "Limp",
    expectedSpotType: "LIMP",
    expectedActionNode: "OPEN_LIMP",
    expectedActions: ["FOLD", "LIMP", "RAISE", "ALL_IN"],
    expectedSizes: ["2.5bb", "all-in", "limp"],
    input: {
      source: "SAMPLE_TEST_ONLY_LIMP",
      heroPosition: "SB",
      tableSize: 6,
      remainingPlayers: 6,
      heroStackBb: 25,
      actionPath: ["FIRST_IN_LIMP", "OPEN_LIMP", "SB_DECISION"],
      treeConfig: "SAMPLE_TEST_ONLY_OPEN_LIMP",
      sourceFile: "sample-test-only-limp.json",
      sourceMetadata: {
        isSample: true,
        testOnly: true,
        calculationModel: "TEST_ONLY_SAMPLE",
        streetScope: "PREFLOP",
        exportShape: "MULTI_ACTION_V2_SAMPLE",
        spotFamily: "LIMP",
        actionTags: ["SAMPLE", "TEST_ONLY", "LIMP", "OPEN_LIMP", "FOLD", "RAISE", "ALL_IN"]
      },
      actions: [
        { action: "FOLD", frequency: 0.1 },
        { action: "LIMP", rawSizeLabel: "limp", frequency: 0.35 },
        { action: "RAISE", sizeBb: 2.5, rawSizeLabel: "2.5bb", frequency: 0.35 },
        { action: "ALL_IN", isAllIn: true, frequency: 0.2 }
      ]
    }
  },
  {
    name: "Facing Open",
    expectedSpotType: "FACING_OPEN",
    expectedActionNode: "VS_OPEN",
    expectedActions: ["FOLD", "CALL", "RAISE", "ALL_IN"],
    expectedSizes: ["7.5bb", "all-in", "call 2.2bb"],
    input: {
      source: "SAMPLE_TEST_ONLY_FACING_OPEN",
      heroPosition: "BB",
      tableSize: 6,
      remainingPlayers: 6,
      heroStackBb: 25,
      actionPath: ["BTN_OPEN_2.2BB", "FACING_OPEN", "BB_DECISION"],
      treeConfig: "SAMPLE_TEST_ONLY_FACING_OPEN_VS_OPEN",
      sourceFile: "sample-test-only-facing-open.json",
      sourceMetadata: {
        isSample: true,
        testOnly: true,
        calculationModel: "TEST_ONLY_SAMPLE",
        streetScope: "PREFLOP",
        exportShape: "MULTI_ACTION_V2_SAMPLE",
        spotFamily: "FACING_OPEN",
        actionTags: ["SAMPLE", "TEST_ONLY", "FACING_OPEN", "VS_OPEN", "FOLD", "CALL", "RAISE", "ALL_IN"]
      },
      actions: [
        { action: "FOLD", frequency: 0.15 },
        { action: "CALL", rawSizeLabel: "call 2.2bb", frequency: 0.45 },
        { action: "RAISE", sizeBb: 7.5, rawSizeLabel: "7.5bb", frequency: 0.25 },
        { action: "ALL_IN", isAllIn: true, frequency: 0.15 }
      ]
    }
  },
  {
    name: "Facing Limp",
    expectedSpotType: "FACING_LIMP",
    expectedActionNode: "VS_LIMP",
    expectedActions: ["FOLD", "CHECK", "RAISE", "ALL_IN"],
    expectedSizes: ["3.5bb", "all-in"],
    input: {
      source: "SAMPLE_TEST_ONLY_FACING_LIMP",
      heroPosition: "BB",
      tableSize: 6,
      remainingPlayers: 6,
      heroStackBb: 25,
      actionPath: ["SB_OPEN_LIMP", "FACING_LIMP", "VS_LIMP", "BB_DECISION"],
      treeConfig: "SAMPLE_TEST_ONLY_FACING_LIMP_VS_LIMP",
      sourceFile: "sample-test-only-facing-limp.json",
      sourceMetadata: {
        isSample: true,
        testOnly: true,
        calculationModel: "TEST_ONLY_SAMPLE",
        streetScope: "PREFLOP",
        exportShape: "MULTI_ACTION_V2_SAMPLE",
        spotFamily: "FACING_LIMP",
        actionTags: ["SAMPLE", "TEST_ONLY", "FACING_LIMP", "VS_LIMP", "CHECK", "FOLD", "RAISE", "ALL_IN"]
      },
      actions: [
        { action: "CHECK", frequency: 0.45 },
        { action: "FOLD", frequency: 0.1 },
        { action: "RAISE", sizeBb: 3.5, rawSizeLabel: "3.5bb", frequency: 0.3 },
        { action: "ALL_IN", isAllIn: true, frequency: 0.15 }
      ]
    }
  },
  {
    name: "vs 3bet",
    expectedSpotType: "VS_THREE_BET",
    expectedActionNode: "VS_THREE_BET",
    expectedActions: ["FOLD", "CALL", "RAISE", "ALL_IN"],
    expectedSizes: ["16bb", "all-in", "call 7.5bb"],
    input: {
      source: "SAMPLE_TEST_ONLY_VS_THREE_BET",
      heroPosition: "BTN",
      tableSize: 6,
      remainingPlayers: 6,
      heroStackBb: 25,
      actionPath: ["BTN_OPEN_2.2BB", "BB_3BET_7.5BB", "FACING_3BET", "BTN_DECISION"],
      treeConfig: "SAMPLE_TEST_ONLY_VS_3BET",
      sourceFile: "sample-test-only-vs-three-bet.json",
      sourceMetadata: {
        isSample: true,
        testOnly: true,
        calculationModel: "TEST_ONLY_SAMPLE",
        streetScope: "PREFLOP",
        exportShape: "MULTI_ACTION_V2_SAMPLE",
        spotFamily: "VS_THREE_BET",
        actionTags: ["SAMPLE", "TEST_ONLY", "VS_THREE_BET", "FACING_3BET", "FOLD", "CALL", "RAISE", "ALL_IN"]
      },
      actions: [
        { action: "FOLD", frequency: 0.25 },
        { action: "CALL", rawSizeLabel: "call 7.5bb", frequency: 0.4 },
        { action: "RAISE", sizeBb: 16, rawSizeLabel: "16bb", frequency: 0.15 },
        { action: "ALL_IN", isAllIn: true, frequency: 0.2 }
      ]
    }
  }
] as const;
