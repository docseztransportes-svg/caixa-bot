FROM node:20-alpine

WORKDIR /app

# Instalar todas as dependências
COPY package*.json ./
RUN npm ci

# Build TypeScript
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Remover devDependencies para produção
RUN npm prune --production

# Diretórios necessários em runtime
RUN mkdir -p logs credentials

COPY .env.example .env.example

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
