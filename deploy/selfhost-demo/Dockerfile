# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
# Optional public CA for build environments with an HTTPS proxy; TLS verification stays enabled.
RUN --mount=type=secret,id=npm_ca if [ -f /run/secrets/npm_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca; fi && npm ci --omit=dev --ignore-scripts --no-audit --no-fund && mkdir /app/demo-state && chown node:node /app/demo-state
# Dockerfile-specific allowlist includes only packages, server code and this demo; no .env/state/catalog.
COPY --chown=node:node . .
USER node
EXPOSE 4765
CMD ["node", "--disable-warning=ExperimentalWarning", "deploy/selfhost-demo/start.mjs"]
