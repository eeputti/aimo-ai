# syntax=docker/dockerfile:1
FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY server ./server
COPY public/whatsapp-demo.html ./public/whatsapp-demo.html
COPY scripts/whatsapp-preflight.mjs ./scripts/whatsapp-preflight.mjs
COPY deploy/whatsapp/start.mjs ./deploy/whatsapp/start.mjs
RUN mkdir -p /app/data/whatsapp && chown -R node:node /app/data
ENV NODE_ENV=production WHATSAPP_PORT=4749
USER node
EXPOSE 4749
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node --input-type=module -e "const r = await fetch('http://127.0.0.1:' + process.env.WHATSAPP_PORT + '/healthz'); const j = await r.json(); if (!r.ok || j.ok !== true || j.channel !== 'whatsapp') process.exit(1)"
CMD ["node", "--disable-warning=ExperimentalWarning", "deploy/whatsapp/start.mjs"]
