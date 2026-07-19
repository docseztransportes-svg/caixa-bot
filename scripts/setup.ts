/**
 * Script de setup interativo para configurar o CaixaBot.
 * Execute: npx ts-node scripts/setup.ts
 */
import fs from 'fs';
import path from 'path';
import readline from 'readline';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q: string): Promise<string> => new Promise((resolve) => rl.question(q, resolve));

async function main(): Promise<void> {
  console.log('\n🤖 === CaixaBot — Setup Inicial ===\n');

  // 1. Criar pasta credentials
  const credDir = path.resolve('./credentials');
  if (!fs.existsSync(credDir)) {
    fs.mkdirSync(credDir, { recursive: true });
    console.log('✅ Pasta credentials/ criada.');
  }

  // 2. Coletar dados
  console.log('\n📋 Preencha as informações abaixo:');
  console.log('(Pressione Enter para pular campos opcionais)\n');

  const telegramToken = await ask('Token do Bot Telegram (@BotFather): ');
  const chatId = await ask('Seu Chat ID do Telegram (@userinfobot): ');
  const spreadsheetId = await ask('ID da planilha Google Sheets: ');
  const timezone = (await ask('Fuso horário [America/Sao_Paulo]: ')) || 'America/Sao_Paulo';
  const summaryHour = (await ask('Horário do resumo diário [20]: ')) || '20';
  const inactiveDays = (await ask('Dias sem lançamento para alerta [3]: ')) || '3';

  // 3. Gerar .env
  const envContent = `# Gerado pelo setup em ${new Date().toLocaleDateString('pt-BR')}

TELEGRAM_BOT_TOKEN=${telegramToken}
AUTHORIZED_CHAT_ID=${chatId}

SPREADSHEET_ID=${spreadsheetId}
GOOGLE_SERVICE_ACCOUNT_KEY=./credentials/google-service-account.json

TIMEZONE=${timezone}
DAILY_SUMMARY_HOUR=${summaryHour}
DAILY_SUMMARY_MINUTE=0
ALERT_INACTIVE_DAYS=${inactiveDays}

NODE_ENV=development
`;

  fs.writeFileSync('.env', envContent);
  console.log('\n✅ Arquivo .env criado!');

  // 4. Verificar credentials
  const credFile = path.join(credDir, 'google-service-account.json');
  if (!fs.existsSync(credFile)) {
    console.log('\n⚠️  Você ainda precisa:');
    console.log('   1. Criar uma Service Account no Google Cloud Console');
    console.log('   2. Baixar o arquivo JSON de credenciais');
    console.log('   3. Salvar em: credentials/google-service-account.json');
    console.log('   4. Compartilhar a planilha com o e-mail da Service Account');
    console.log('\n   Veja o README.md para instruções detalhadas.');
  } else {
    console.log('✅ Credenciais Google encontradas!');
  }

  console.log('\n🚀 Para iniciar o bot:');
  console.log('   npm run dev      # desenvolvimento');
  console.log('   npm run build && npm start  # produção\n');

  rl.close();
}

main().catch((err) => {
  console.error('Erro no setup:', err);
  rl.close();
  process.exit(1);
});
