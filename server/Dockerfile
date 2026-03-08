FROM node:20-slim

WORKDIR /app

# Copy package config
COPY package*.json ./

# Install production dependencies
RUN npm ci --omit=dev

# Copy compiled output and public assets
COPY dist/ ./dist/
COPY public/ ./public/

# Necessary for firebase admin connection if not injected by environment
# COPY serviceAccountKey.json ./

ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

CMD ["node", "dist/index.js"]
