# Gelato UI

## Migrations

### Generate migration

npx ts-node -r tsconfig-paths/register node_modules/.bin/typeorm migration:generate -d src/data-source.ts src/migrations/CreateBridgeTransactions

### Run migration

npx ts-node -r tsconfig-paths/register -r dotenv/config node_modules/.bin/typeorm migration:run -d src/data-source.ts
