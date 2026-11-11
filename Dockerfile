FROM oven/bun:1
WORKDIR /app
COPY package.json ./
RUN bun install --production
COPY src ./src
ENV APP_ENV=production
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --retries=3 CMD ["bun", "-e", "const r = await fetch('http://127.0.0.1:8080/healthz'); process.exit(r.ok ? 0 : 1)"]
CMD ["bun", "run", "src/server/main.ts"]