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
RUN npx eve build

CMD ["npx", "eve", "start", "--host", "0.0.0.0"]
