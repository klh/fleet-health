# fleet-health sidecar image — Bun runs it, nothing else ships.
FROM oven/bun:1.2-slim
WORKDIR /app
COPY package.json bunfig.toml ./
COPY src ./src
RUN bun install --production
ENV HEALTH_SETTINGS=/etc/health/settings.json5
EXPOSE 4112
CMD ["bun", "src/main/health.main.ts"]
