FROM node:20-alpine AS base
WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/api/package.json packages/api/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/

RUN npm install --workspace=packages/api --workspace=packages/shared --workspace=packages/db

COPY packages/shared packages/shared
COPY packages/api packages/api
COPY packages/db packages/db
COPY tsconfig.base.json ./

RUN npm run build --workspace=packages/api

EXPOSE 4000
CMD ["sh", "-c", "node packages/db/migrate.mjs && node packages/db/seed.mjs && node packages/api/dist/main.js"]
