FROM node:24-alpine

WORKDIR /app

COPY package.json ./

# No lockfile in repo yet; keep install straightforward.
RUN npm install

COPY . .

EXPOSE 8002

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "8002"]


