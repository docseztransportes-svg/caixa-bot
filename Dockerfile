FROM node:20-alpine

WORKDIR /app

# Dependências de produção primeiro (cache de layers)
COPY package*.json ./
RUN npm ci --only=production

# Build TypeScript
COPY tsconfig.json ./
COPY src ./src
RUN npm install --include=dev && npm run build && npm prune --production

# Diretórios necessários em runtime
RUN mkdir -p logs credentials

COPY .env.example .env.example

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
