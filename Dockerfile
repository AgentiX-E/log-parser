FROM node:22-alpine AS builder
WORKDIR /app

# Copy root config files for pnpm install
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc tsconfig.base.json ./

# Copy package.json files for dependency resolution
COPY packages/log-parser-core/package.json ./packages/log-parser-core/
COPY packages/log-parser-node/package.json ./packages/log-parser-node/
COPY packages/log-parser-llm/package.json ./packages/log-parser-llm/
COPY packages/log-parser-server/package.json ./packages/log-parser-server/
COPY packages/log-parser-cli/package.json ./packages/log-parser-cli/
COPY packages/log-parser-browser/package.json ./packages/log-parser-browser/
COPY packages/log-parser-webllm/package.json ./packages/log-parser-webllm/

# Install dependencies
RUN corepack enable && pnpm install --frozen-lockfile

# Copy source code and build
COPY . .
RUN pnpm build

# Production image
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Copy only production dependencies and built artifacts
COPY --from=builder /app/node_modules/.pnpm ./node_modules/.pnpm
COPY --from=builder /app/packages/log-parser-server/dist ./dist
COPY --from=builder /app/packages/log-parser-server/package.json ./

EXPOSE 3000
USER node
CMD ["node", "dist/server.js"]
