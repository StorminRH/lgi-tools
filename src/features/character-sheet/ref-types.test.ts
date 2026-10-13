import { expect, test } from 'vitest';
import { journalRefLabel } from './ref-types';

test('labels known journal ref types and sentence-cases an unlisted one', () => {
  expect(journalRefLabel('bounty_prizes')).toBe('Bounties');
  expect(journalRefLabel('market_transaction')).toBe('Market');
  expect(journalRefLabel('brokers_fee')).toBe('Broker fee');
  expect(journalRefLabel('transaction_tax')).toBe('Sales tax');
  expect(journalRefLabel('player_trading')).toBe('Trade');
  expect(journalRefLabel('ess_escrow_transfer')).toBe('ESS payout');
  expect(journalRefLabel('planetary_export_tax')).toBe('PI export tax');
  expect(journalRefLabel('some_new_ccp_thing')).toBe('Some new ccp thing');
  expect(journalRefLabel('inheritance')).toBe('Inheritance');
  expect(journalRefLabel('')).toBe('');
  expect(journalRefLabel('__double__')).toBe('Double');
});
