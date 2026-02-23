# Build stage
FROM node:22-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Serve stage — custom colourised static server
FROM node:22-alpine AS runner

WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY server.js ./

EXPOSE 4173
CMD ["node", "server.js"]
