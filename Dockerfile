FROM node:24-bookworm-slim AS builder

WORKDIR /app

# Build the VM binary
RUN apt-get update && apt-get install -y --no-install-recommends gcc make \
  && rm -rf /var/lib/apt/lists/*

COPY Makefile ./Makefile
COPY cli ./cli
RUN make -C cli

# Build Next.js app
COPY web/package.json web/package-lock.json ./web/
RUN cd web && npm ci

COPY web ./web
RUN cd web && npm run build

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/cli/vm_riskxvii /app/cli/vm_riskxvii
COPY --from=builder /app/web /app/web

WORKDIR /app/web
EXPOSE 3000
CMD ["npm", "run", "start"]
