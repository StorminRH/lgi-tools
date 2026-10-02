import { z } from 'zod';

/**
 * Structure bonuses a pilot typed in, as the in-game industry window shows
 * them. These are final numbers: hull, rigs and security are already folded in
 * by the game, so the planner applies them as-is and never recomputes them.
 * Used for structures whose fit the pilot cannot see (public structures).
 */
const bonusPct = z.number().min(0).max(99);

export const enteredBonusesSchema = z.strictObject({
  manufacturing: z.strictObject({ me: bonusPct, te: bonusPct, cost: bonusPct }),
  reactions: z.strictObject({ me: bonusPct, te: bonusPct }),
});

export type EnteredBonuses = z.infer<typeof enteredBonusesSchema>;
