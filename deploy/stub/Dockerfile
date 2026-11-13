# the generic HTTP fixture target — 200 face and 403 face.
FROM oven/bun:1.4.4-debian
WORKDIR /app
COPY stub.main.ts ./
EXPOSE 8080
CMD ["bun", "stub.main.ts"]
