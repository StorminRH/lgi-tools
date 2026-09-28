const REF_TYPE_LABELS: Readonly<Record<string, string>> = {
  agent_mission_reward: 'Mission reward',
  agent_mission_time_bonus_reward: 'Mission bonus',
  asset_safety_recovery_tax: 'Asset safety fee',
  bounty_prize_corporation_tax: 'Bounty corp tax',
  bounty_prizes: 'Bounties',
  brokers_fee: 'Broker fee',
  clone_activation: 'Clone activation',
  contract_brokers_fee: 'Contract broker fee',
  contract_collateral: 'Contract collateral',
  contract_deposit: 'Contract deposit',
  contract_price: 'Contract',
  contract_reward: 'Contract reward',
  corporation_account_withdrawal: 'Corp withdrawal',
  daily_goal_payouts: 'Daily goal',
  docking_fee: 'Docking fee',
  ess_escrow_transfer: 'ESS payout',
  industry_job_tax: 'Industry tax',
  insurance: 'Insurance',
  jump_clone_activation_fee: 'Jump clone fee',
  jump_clone_installation_fee: 'Jump clone install',
  lp_store: 'LP store',
  market_escrow: 'Market escrow',
  market_transaction: 'Market',
  office_rental_fee: 'Office rent',
  planetary_export_tax: 'PI export tax',
  planetary_import_tax: 'PI import tax',
  player_donation: 'Donation',
  player_trading: 'Trade',
  project_discovery_reward: 'Project Discovery',
  reprocessing_tax: 'Reprocessing tax',
  skill_purchase: 'Skill purchase',
  structure_gate_jump: 'Gate jump fee',
  transaction_tax: 'Sales tax',
  war_fee: 'War fee',
};

function titleCase(snake: string): string {
  return snake
    .split('_')
    .filter((word) => word.length > 0)
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(' ');
}

export function journalRefLabel(refType: string): string {
  return REF_TYPE_LABELS[refType] ?? titleCase(refType);
}
