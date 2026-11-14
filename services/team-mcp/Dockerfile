FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=npm_ca,required=false \
    if [ -f /run/secrets/npm_ca ]; then NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca npm ci --omit=dev --ignore-scripts --no-audit --no-fund; \
    else npm ci --omit=dev --ignore-scripts --no-audit --no-fund; fi
COPY src ./src
RUN mkdir -p /data && chown -R node:node /app /data
ENV TEAM_MCP_HOST=0.0.0.0 TEAM_MCP_DB=/data/team-mcp.db PORT=4750
USER node
EXPOSE 4750
CMD ["node", "--disable-warning=ExperimentalWarning", "src/main.mjs"]
