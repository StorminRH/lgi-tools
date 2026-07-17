// Real `industry_blueprints.activities` blobs captured read-only from the local
// SDE Docker DB (psql, 2026-06-25), kept VERBATIM — including CCP's raw `typeID`
// key (capital D), which the parser normalizes to `typeId`. Shared by the pure
// parser test and the real-Postgres query test so both assert against the same
// genuine stored shapes.

/**
 * 681 — a T1 module blueprint: manufacturing + copying + research, NO invention.
 * Manufacturing carries no skills; copy/research carry only `time`.
 */
export const MFG_681 = {
  copying: { time: 480 },
  manufacturing: {
    time: 600,
    products: [{ typeID: 165, quantity: 1 }],
    materials: [{ typeID: 38, quantity: 86 }],
  },
  research_time: { time: 210 },
  research_material: { time: 210 },
};

/**
 * 683 — carries invention (skills + a product with probability + datacore
 * materials) alongside manufacturing (with one skill), copying, and research.
 */
export const INV_683 = {
  copying: { time: 4800 },
  invention: {
    time: 63900,
    skills: [
      { level: 1, typeID: 11442 },
      { level: 1, typeID: 11454 },
      { level: 1, typeID: 21790 },
    ],
    products: [{ typeID: 39581, quantity: 1, probability: 0.3 }],
    materials: [
      { typeID: 20416, quantity: 2 },
      { typeID: 25887, quantity: 2 },
    ],
  },
  manufacturing: {
    time: 6000,
    skills: [{ level: 1, typeID: 3380 }],
    products: [{ typeID: 582, quantity: 1 }],
    materials: [
      { typeID: 34, quantity: 24000 },
      { typeID: 35, quantity: 4500 },
      { typeID: 36, quantity: 1875 },
      { typeID: 37, quantity: 375 },
    ],
  },
  research_time: { time: 2100 },
  research_material: { time: 2100 },
};

/** 46175 — a reaction formula: a single `reaction` activity. */
export const RXN_46175 = {
  reaction: {
    time: 10800,
    skills: [{ level: 2, typeID: 45746 }],
    products: [{ typeID: 16666, quantity: 200 }],
    materials: [
      { typeID: 4051, quantity: 5 },
      { typeID: 16642, quantity: 100 },
      { typeID: 16652, quantity: 100 },
    ],
  },
};
