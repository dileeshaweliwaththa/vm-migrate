# Stage 1: build React app
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --silent
COPY . .
RUN npm run build

# Stage 2: run Express API + serve static files
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --silent
COPY --from=builder /app/dist ./dist
COPY server.js ./
RUN mkdir -p data
EXPOSE 3000
CMD ["node", "server.js"]
