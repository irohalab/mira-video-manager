FROM node:20-bullseye AS base
RUN apt update
RUN apt install software-properties-common -y && apt-add-repository non-free && apt update
RUN apt install -y mediainfo ffmpeg unrar
WORKDIR /app

FROM base AS dev
COPY package.json /app/package.json
COPY package-lock.json /app/package-lock.json
RUN npm ci
COPY . /app/

FROM dev AS prod
RUN npm run build

ENV HOME=/app