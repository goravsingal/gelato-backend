# Gelato Backend

## Purpose

This project is for gelato web-service. Its written in Nest.js

## Migrations

### Generate migration

npx ts-node -r tsconfig-paths/register node_modules/.bin/typeorm migration:generate -d src/data-source.ts src/migrations/CreateBridgeTransactions

### Run migration

npx ts-node -r tsconfig-paths/register -r dotenv/config node_modules/.bin/typeorm migration:run -d src/data-source.ts

## Run unit tests

npm run test web3
or
npx jest src/web3/web3.service.spec.ts --verbose
