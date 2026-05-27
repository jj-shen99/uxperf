FROM node:20-alpine AS base
WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/dashboard/package.json packages/dashboard/

RUN npm install --workspace=packages/dashboard

COPY packages/dashboard packages/dashboard

ARG NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN npm run build --workspace=packages/dashboard

EXPOSE 4200
ENV PORT=4200
CMD ["npm", "run", "start", "--workspace=packages/dashboard"]
