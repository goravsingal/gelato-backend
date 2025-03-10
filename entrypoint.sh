#!/bin/sh

echo "🚀 Running TypeORM Migrations..."
npx ts-node -r tsconfig-paths/register -r dotenv/config node_modules/.bin/typeorm migration:run -d src/data-source.ts

echo "✅ Migrations completed! Starting NestJS app..."
exec node dist/main
