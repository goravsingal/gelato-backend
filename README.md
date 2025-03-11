# Gelato Backend

## Purpose

This project is for gelato web-service. Its written in Nest.js

## Deployment Details

- Public UI - http://194.195.112.4:3001/
- Swagger Doc - http://194.195.112.4:3000/api#/

## Steps To Run

### Admin API, Check Balance, Mint Tokens to Self

- Open Swagger doc - http://194.195.112.4:3000/api#/
- Goto `Bridge Operator` section
- Check balance by `GET /operator/balance`
- Self mint tokens in both networks by
  - `POST operator/self-mint` (network as `arbitrum` or `optimism`)
- Check balance again, to confirm

### Admin API - Mint Tokens to Test Wallet

- Goto `Bridge Operator` section again
- `POST /operator/mint`, and pass your test wallet address, with network as `arbitrum` and `optimism`

### Check Balance of your Test wallet

- Goto `bridge` section
- `GET /bridge/balance/{your wallet address}`

### Now goto UI

`http://194.195.112.4:3001/`

- Connect your wallet
- Metamask popup will ask to connect, and select your test wallet
- You will see your refreshed balance upfront
- Click on `Refresh Transactions` to see your old transactions
- Fill tokens to burn from which network, and Click on `burn tokens`
- Popup will come to confirm for transaction, click on confirm
- A new ui area will come to show current transaction for this burn
- Its not refreshed in real time, you need to click on `Refresh Transactions`
- If you click multiple times, on `Refresh Transactions`, you will see the status of 2nd transaction from `pending` to `processing` to `completed`

## Migrations

### Generate migration

npx ts-node -r tsconfig-paths/register node_modules/.bin/typeorm migration:generate -d src/data-source.ts src/migrations/CreateBridgeTransactions

### Run migration

npx ts-node -r tsconfig-paths/register -r dotenv/config node_modules/.bin/typeorm migration:run -d src/data-source.ts

## What It Doesnt have

- Authentication to APIs
- Unit tests
- Versioning of APIs

## Sample env file

```sh

PUBLIC_UI_URL=

# Blockchain RPC URLs
ARBITRUM_RPC=https://sepolia-rollup.arbitrum.io/rpc
OPTIMISM_RPC=https://sepolia.optimism.io

# Private key of bridge operator
PRIVATE_KEY=

# Smart Contract Addresses
ARBITRUM_CONTRACT=
OPTIMISM_CONTRACT=

# Gelato API Key
GELATO_API_KEY=

# Redis Configuration
REDIS_HOST=
REDIS_PORT=
REDIS_QUEUE_NAME=

DB_HOST=
DB_PORT=
DB_USER=
DB_PASS=
DB_NAME=
```
