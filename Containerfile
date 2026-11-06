# Dev/build image for canvas-reader. The source tree is bind-mounted at /app;
# node_modules lives in the bind mount (Linux binaries — don't run npm on the host).
FROM node:24-bookworm-slim
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_FUND=false
EXPOSE 5173
