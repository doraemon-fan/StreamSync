FROM node:20-alpine AS base

WORKDIR /app

COPY package*.json ./

RUN npm install

FROM base AS build

COPY . .

RUN npm run build

RUN npm install -g nodemon tsx

# RUN apk add --no-cache bash ffmpeg

EXPOSE 3000

CMD ["node", "dist/server.js"]
