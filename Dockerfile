FROM node:24-trixie-slim AS base
RUN sed -i 's/^Components: main$/Components: main non-free/' /etc/apt/sources.list.d/debian.sources \
    && apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg unrar \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS dev
COPY package.json /app/package.json
COPY package-lock.json /app/package-lock.json
RUN npm ci
COPY . /app/

FROM dev AS prod
RUN npm run build

ENV HOME=/app