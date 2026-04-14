FROM oven/bun:1-debian AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1-debian
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
RUN bunx playwright install --with-deps chromium
EXPOSE 3001
CMD ["bun", "run", "dist/index.js"]
