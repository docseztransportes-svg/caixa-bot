# 🤖 CaixaBot — Controle de Caixa via Telegram

Sistema de registro financeiro para transportadoras. Envie uma mensagem no Telegram e ela é
automaticamente interpretada e lançada no Google Sheets.

---

## 📋 Índice

1. [Como funciona](#como-funciona)
2. [Pré-requisitos](#pré-requisitos)
3. [Instalação no Windows](#instalação-no-windows)
4. [Criar Bot Telegram](#criar-bot-telegram)
5. [Configurar Google Sheets](#configurar-google-sheets)
6. [Executar o bot](#executar-o-bot)
7. [Usar Docker](#usar-docker)
8. [Comandos disponíveis](#comandos-disponíveis)
9. [Exemplos de lançamentos](#exemplos-de-lançamentos)
10. [Estrutura da planilha](#estrutura-da-planilha)
11. [Colocar em produção](#colocar-em-produção)
12. [Backup](#backup)
13. [Solução de problemas](#solução-de-problemas)

---

## Como funciona

```
Você (Telegram) → Bot interpreta → Google Sheets
      ↑                                   |
      └─── Confirmação imediata ──────────┘
```

1. Você envia uma mensagem no Telegram para o bot
2. O sistema extrai: tipo, valor, categoria, forma de pagamento
3. O lançamento é gravado na planilha Google Sheets
4. Você recebe confirmação imediata com todos os dados

---

## Pré-requisitos

- Node.js 18 ou superior → https://nodejs.org
- Conta Google (para Google Sheets)
- Conta Telegram

---

## Instalação no Windows

### 1. Instalar Node.js

Baixe em https://nodejs.org e instale a versão LTS.

Verifique:
```
node --version
npm --version
```

### 2. Baixar o projeto

```
cd C:\Users\SeuUsuario\
# Extraia o projeto aqui ou clone o repositório
cd caixa-bot
```

### 3. Instalar dependências

```
npm install
```

### 4. Executar o setup

```
npm run setup
```

O script irá guiá-lo passo a passo.

---

## Criar Bot Telegram

1. Abra o Telegram e pesquise por **@BotFather**
2. Envie `/newbot`
3. Escolha um nome: ex. `Caixa Transportadora`
4. Escolha um username: ex. `caixa_transp_bot`
5. Copie o **Token** fornecido (formato: `123456789:AAxxxxxxx`)
6. Coloque no `.env`: `TELEGRAM_BOT_TOKEN=seu_token`

### Descobrir seu Chat ID

1. Pesquise por **@userinfobot** no Telegram
2. Envie qualquer mensagem
3. Ele responde com seu `id`
4. Coloque no `.env`: `AUTHORIZED_CHAT_ID=seu_id`

---

## Configurar Google Sheets

### Passo 1 — Criar projeto no Google Cloud

1. Acesse https://console.cloud.google.com
2. Clique em **"Novo Projeto"** → dê um nome (ex: CaixaBot)
3. Selecione o projeto criado

### Passo 2 — Ativar a API do Google Sheets

1. No menu lateral: **APIs e Serviços → Biblioteca**
2. Pesquise por **"Google Sheets API"**
3. Clique em **Ativar**

### Passo 3 — Criar Service Account

1. No menu: **APIs e Serviços → Credenciais**
2. Clique em **"+ Criar Credenciais" → Service Account**
3. Nome: `caixabot-sheets`
4. Clique em **Criar e continuar**
5. Na etapa de permissão, clique em **Continuar**
6. Clique em **Concluir**

### Passo 4 — Baixar chave JSON

1. Na lista de Service Accounts, clique na que você criou
2. Aba **"Chaves"** → **"Adicionar chave" → "Criar nova chave"**
3. Formato: **JSON** → Criar
4. O arquivo JSON será baixado automaticamente
5. Renomeie para `google-service-account.json`
6. Coloque na pasta `credentials/` do projeto

### Passo 5 — Criar e compartilhar a planilha

1. Acesse https://sheets.google.com
2. Crie uma nova planilha em branco
3. Copie o ID da URL (parte entre `/d/` e `/edit`):
   ```
   https://docs.google.com/spreadsheets/d/[ESTE-É-O-ID]/edit
   ```
4. Coloque no `.env`: `SPREADSHEET_ID=seu_id`
5. Abra o arquivo JSON de credenciais e copie o campo `client_email`
6. Na planilha, clique em **Compartilhar** e adicione esse e-mail como **Editor**

---

## Executar o bot

### Modo desenvolvimento (com reinício automático)

```
npm run dev
```

### Modo produção

```
npm run build
npm start
```

### Rodar testes

```
npm test
```

---

## Usar Docker

### Build e start

```
docker-compose up -d
```

### Ver logs

```
docker-compose logs -f
```

### Parar

```
docker-compose down
```

> **Atenção:** o arquivo `.env` e a pasta `credentials/` precisam existir antes de subir o container.

---

## Comandos disponíveis

Envie no Telegram:

| Comando | Descrição |
|---------|-----------|
| `saldo` | Saldo atual + movimentações do dia |
| `dashboard` | Resumo completo com categorias |
| `últimos 10` | Últimos 10 lançamentos |
| `relatório hoje` | Resumo financeiro do dia |
| `cancelar último` | Remove o último lançamento |
| `categorias` | Lista todas as categorias |
| `ajuda` | Mostra os comandos |

---

## Exemplos de lançamentos

O bot entende linguagem natural:

```
Recebi 350 frete João
→ Entrada | R$ 350,00 | Frete

Paguei 120 combustível
→ Saída | R$ 120,00 | Combustível

Pix recebido 950
→ Entrada | R$ 950,00 | PIX

Transferi 500 para banco
→ Transferência | R$ 500,00

Saquei 300 banco
→ Saída | R$ 300,00 | Saque

Abastecimento 680 diesel
→ Saída | R$ 680,00 | Combustível

Pedágio 52
→ Saída | R$ 52,00 | Pedágio

Lavagem 120
→ Saída | R$ 120,00 | Lavagem

Manutenção 850 troca de óleo
→ Saída | R$ 850,00 | Manutenção

Pix enviado 410 fornecedor
→ Saída | R$ 410,00 | Fornecedor | PIX

Recebi 1.250 cliente XPTO
→ Entrada | R$ 1.250,00 | Recebimento Cliente

Paguei 38 almoço motorista
→ Saída | R$ 38,00 | Alimentação
```

Quando o bot não conseguir identificar alguma informação, ele pergunta automaticamente.

---

## Estrutura da planilha

O bot cria automaticamente 3 abas:

### Aba: Movimentações

| ID | Data | Hora | Tipo | Categoria | Descrição | Valor | Forma Pagamento | Conta | Usuário | Observação | Status Conciliação | Saldo |
|----|------|------|------|-----------|-----------|-------|-----------------|-------|---------|------------|-------------------|-------|

### Aba: Categorias

Lista de todas as categorias disponíveis.

### Aba: Dashboard

Indicadores calculados automaticamente com fórmulas do Sheets:
- Entradas/Saídas do dia
- Saldo do dia e do mês
- Total de lançamentos

---

## Colocar em produção

### Opção 1: VPS (recomendado)

1. Contrate uma VPS (DigitalOcean, Hostinger, Vultr — a partir de R$ 20/mês)
2. Instale Docker no servidor
3. Transfira o projeto via SFTP ou Git
4. Configure `.env` e `credentials/`
5. Execute: `docker-compose up -d`

### Opção 2: Raspberry Pi / PC ligado 24h

1. Instale Node.js
2. Configure como serviço Windows:
   ```
   npm install -g pm2
   npm run build
   pm2 start dist/index.js --name caixa-bot
   pm2 startup
   pm2 save
   ```

### Opção 3: Render.com (grátis com limitações)

1. Crie conta em render.com
2. Novo Web Service → conecte seu repositório
3. Build Command: `npm install && npm run build`
4. Start Command: `npm start`
5. Configure as variáveis de ambiente

---

## Backup

### Backup da planilha

O Google Sheets mantém histórico automático de versões. Para backup manual:
- Arquivo → Download → .xlsx

### Backup das configurações

Guarde em local seguro:
- Arquivo `.env`
- Pasta `credentials/`

> ⚠️ **NUNCA** compartilhe o arquivo `google-service-account.json` ou o token do Telegram.

---

## Solução de problemas

### Bot não responde

1. Verifique o token: `TELEGRAM_BOT_TOKEN` no `.env`
2. Confirme o `AUTHORIZED_CHAT_ID`
3. Veja os logs: `npm run dev` ou `docker-compose logs -f`

### Erro de autenticação Google

1. Verifique se o arquivo `credentials/google-service-account.json` existe
2. Confirme que a planilha foi compartilhada com o e-mail da Service Account
3. Verifique se a API do Google Sheets está ativa no projeto

### Planilha não encontrada

1. Confirme o `SPREADSHEET_ID` no `.env`
2. O ID fica na URL entre `/d/` e `/edit`

### Erro "chat not found"

1. Inicie uma conversa com o bot no Telegram antes de executar
2. Envie qualquer mensagem para o bot

---

## Estrutura do projeto

```
caixa-bot/
├── src/
│   ├── bot/
│   │   └── telegramBot.ts       # Inicialização do bot Telegram
│   ├── config/
│   │   └── index.ts             # Configurações centralizadas
│   ├── controllers/
│   │   └── messageController.ts # Lógica de comandos e sessões
│   ├── google/
│   │   └── sheetsService.ts     # Toda integração com Google Sheets
│   ├── services/
│   │   ├── financialService.ts  # Regras de negócio financeiro
│   │   ├── messageParser.ts     # Interpretação de linguagem natural
│   │   ├── messageParser.test.ts
│   │   └── schedulerService.ts  # Resumos automáticos (cron)
│   ├── types/
│   │   └── index.ts             # Tipos TypeScript centrais
│   ├── utils/
│   │   ├── formatter.ts         # Formatação de valores e mensagens
│   │   └── logger.ts            # Sistema de logs
│   └── index.ts                 # Ponto de entrada
├── scripts/
│   └── setup.ts                 # Assistente de configuração inicial
├── credentials/                 # Chave da Service Account (não commitar)
├── logs/                        # Logs automáticos (rotação diária)
├── .env                         # Variáveis de ambiente (não commitar)
├── .env.example                 # Modelo do .env
├── docker-compose.yml
├── Dockerfile
├── package.json
└── tsconfig.json
```
