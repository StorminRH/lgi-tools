export interface DamageBreakdown {
  em: number;
  therm: number;
  kin: number;
  exp: number;
  total: number;
}

export interface CombatStats {
  turret: { dps: DamageBreakdown; alpha: DamageBreakdown };
  missile: { dps: DamageBreakdown; alpha: DamageBreakdown };
  total: { dps: number; alpha: number };
  hp: {
    shield: number;
    armor: number;
    structure: number;
    ehp: number;
    shieldRes: { em: number; exp: number; kin: number; therm: number };
    armorRes: { em: number; exp: number; kin: number; therm: number };
  };
  ewar: {
    scram: number;
    web: number;
    neutAmount: number;
    neutDuration: number;
    neutCount: number;
    rrepAmount: number;
    rrepDuration: number;
    rrepCount: number;
  };
  movement: {
    sigRadius: number;
    maxVelocity: number;
    orbitDistance: number;
    orbitVelocity: number;
  };
}

export interface WaveTotals {
  dpsTotal: number;
  alphaTotal: number;
  ehpTotal: number;
  ewScram: number;
  ewWeb: number;
  ewNeut: number;
  ewRrep: number;
}
