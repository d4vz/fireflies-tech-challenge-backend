FROM oven/bun:1.3-debian

USER root
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json bun.lock ./
ENV HUSKY=0
RUN bun install --frozen-lockfile --production --ignore-scripts

COPY config.yaml tsconfig.json ./
COPY src ./src

RUN chown -R bun:bun /app
USER bun

EXPOSE 3000
CMD ["bun", "src/server.ts"]
