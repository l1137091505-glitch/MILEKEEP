# MILEKEEP

MILEKEEP is a goal-or-date savings checkpoint protocol for BOT Chain. A vault unlocks when its date arrives or its target is reached. An early exit returns 90% of principal and distributes the remaining 10%, plus forfeited bonus, across active savers.

## Included

- Original React/Vite interface with a bright control-board layout.
- Wallet connection plus account and network change handling.
- Solidity 0.8.24 contract with date/goal unlocks, public contributions, withdrawals and early exits.
- Preview data when no contract address is configured.
- Vercel SPA configuration and a Chinese deployment guide.

## Environment

`VITE_MILEKEEP_ADDRESS=0x...`

## BOT Chain

- Chain ID: `677`
- RPC: `https://rpc.botchain.ai`
- Explorer: `https://scan.botchain.ai`