export const browserV2StrategySample = {
  AKo: {
    hand: "AKo",
    actions: [
      {
        action: "RAISE",
        size: { sizeBb: 2.2, rawSizeLabel: "2.2bb" },
        frequency: 0.55,
        ev: 0.12,
        chipEv: 0.18,
        icmEv: 0.12,
        sourceActionLabel: "Raise 2.2bb",
        warnings: []
      },
      {
        action: "ALL_IN",
        size: { isAllIn: true },
        frequency: 0.45,
        ev: 0.1,
        chipEv: 0.16,
        icmEv: 0.1,
        sourceActionLabel: "Jam",
        warnings: []
      }
    ],
    totalFrequency: 1,
    warnings: []
  },
  KQo: {
    hand: "KQo",
    actions: [
      {
        action: "FOLD",
        size: null,
        frequency: 0.7,
        ev: 0,
        chipEv: null,
        icmEv: null,
        sourceActionLabel: "Fold",
        warnings: []
      },
      {
        action: "RAISE",
        size: { sizeBb: 2.5, rawSizeLabel: "2.5bb" },
        frequency: 0.3,
        ev: 0.04,
        chipEv: null,
        icmEv: 0.04,
        sourceActionLabel: "Raise 2.5bb",
        warnings: []
      }
    ],
    totalFrequency: 1,
    warnings: []
  }
};

export const browserV2LegacyStrategySample = {
  AA: { action: "SHOVE", frequency: 1, evPush: 0.25 },
  "72o": { action: "FOLD", frequency: 1, evFold: 0 }
};
