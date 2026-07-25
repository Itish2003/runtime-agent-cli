# Project-agent container — same artifact a Railway/Fly deploy would run.
# The rac tool execFiles `node <RAC_REPO_DIR>/src/cli.ts`; node 24 strips
# TS types natively, matching how it runs on the host. The CLI repo and its
# read-only target are runtime mounts (RAC_REPO_DIR / RAC_TARGET_DIR).
FROM node:24-alpine
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY agent ./agent
COPY front.mjs ./
RUN npx eve build

# eve binds only the internal port; front.mjs owns the public port and
# rewrites "/" to "/chat" (see front.mjs for why this can't live in eve).
ENV EVE_INTERNAL_PORT=2002
CMD sh -c "npx eve start --host 127.0.0.1 --port $EVE_INTERNAL_PORT & node front.mjs"
