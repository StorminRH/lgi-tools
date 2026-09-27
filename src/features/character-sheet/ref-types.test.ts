import { describe, expect, it } from 'vitest';
import { journalRefLabel } from './ref-types';

describe('journalRefLabel', () => {
  it.each([
    ['bounty_prizes', 'Bounties'],
    ['market_transaction', 'Market'],
    ['brokers_fee', 'Broker fee'],
    ['transaction_tax', 'Sales tax'],
    ['player_trading', 'Trade'],
    ['ess_escrow_transfer', 'ESS payout'],
    ['planetary_export_tax', 'PI export tax'],
  ])('labels the common ref type %s as %s', (refType, label) => {
    expect(journalRefLabel(refType)).toBe(label);
  });

  it('falls back to Title Case for an unlisted snake_case ref type', () => {
    expect(journalRefLabel('some_new_ccp_thing')).toBe('Some New Ccp Thing');
    expect(journalRefLabel('inheritance')).toBe('Inheritance');
  });

  it('survives odd input without throwing', () => {
    expect(journalRefLabel('')).toBe('');
    expect(journalRefLabel('__double__')).toBe('Double');
  });
});
