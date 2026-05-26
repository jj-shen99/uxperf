FROM node:20-alpine AS base
WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/dashboard/package.json packages/dashboard/

RUN npm install --workspace=packages/dashboard

COPY packages/dashboard packages/dashboard

RUN npm run build --workspace=packages/dashboard

EXPOSE 3000
CMD ["npm", "run", "start", "--workspace=packages/dashboard"]
