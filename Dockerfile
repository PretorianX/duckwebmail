FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:24-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/dist ./dist
COPY server.mjs ./server.mjs

EXPOSE 8002

CMD ["node", "server.mjs"]


