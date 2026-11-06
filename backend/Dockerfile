FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY src ./src
COPY migrations ./migrations
COPY tests ./tests
USER node
EXPOSE 8080
CMD ["node", "src/server.js"]
