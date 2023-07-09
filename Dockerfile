FROM node:17 AS base
RUN add-apt-repository multiverse && apt update && apt install -y mediainfo ffmpeg unrar
WORKDIR /app

FROM base AS dev
COPY package.json /app/package.json
COPY yarn.lock /app/yarn.lock
RUN yarn
COPY . /app/

FROM dev AS prod
RUN npm run build

ENV HOME=/app