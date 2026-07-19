import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Variável de ambiente obrigatória não definida: ${key}`);
  return value;
}

export const config = {
  telegram: {
    token: required('TELEGRAM_BOT_TOKEN'),
    authorizedChatId: parseInt(required('AUTHORIZED_CHAT_ID'), 10),
  },
  google: {
    spreadsheetId: required('SPREADSHEET_ID'),
    serviceAccountKeyPath: (() => {
      const keyEnv = process.env.GOOGLE_SERVICE_ACCOUNT_KEY ?? './credentials/google-service-account.json';
      // Se começar com { é um JSON, senão é um caminho
      if (keyEnv.trim().startsWith('{')) {
        const fs = require('fs');
        const filePath = path.join('/tmp', 'service-account-key.json');

        try {
          // Tentar parsear e reescrever (remove caracteres extras)
          const cleaned = keyEnv.replace(/[\r\n\t]/g, '').trim();
          const parsed = JSON.parse(cleaned);
          const jsonString = JSON.stringify(parsed);
          fs.writeFileSync(filePath, jsonString);
          console.log(`✅ JSON parseado e limpo: project_id=${parsed.project_id}, client_email=${parsed.client_email}`);
        } catch (e) {
          console.error('❌ ERRO ao parsear JSON:', e instanceof Error ? e.message : e);
          // Salvar JSON como-está mesmo com erro (pode funcionar)
          fs.writeFileSync(filePath, keyEnv);
          console.warn('⚠️  JSON salvo como-está (pode ter erros)');
        }

        return filePath;
      }
      return path.resolve(keyEnv);
    })(),
  },
  app: {
    timezone: process.env.TIMEZONE ?? 'America/Sao_Paulo',
    env: process.env.NODE_ENV ?? 'development',
    dailySummaryHour: parseInt(process.env.DAILY_SUMMARY_HOUR ?? '20', 10),
    dailySummaryMinute: parseInt(process.env.DAILY_SUMMARY_MINUTE ?? '0', 10),
    alertInactiveDays: parseInt(process.env.ALERT_INACTIVE_DAYS ?? '3', 10),
  },
};
