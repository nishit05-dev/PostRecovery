FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
COPY README.md ./

RUN npm ci
RUN npm run build:web
RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "scripts/start-web.mjs"]
