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
          // Remover caracteres de controle e quotas escapadas agressivamente
          let cleaned = keyEnv
            .replace(/[\x00-\x1f\x7f]/g, '') // Remove controle chars
            .replace(/\\"/g, '"')              // Unescape quotes
            .replace(/\\\\/g, '\\')            // Unescape backslashes
            .trim();

          // Encontrar primeiro { e último }
          const start = cleaned.indexOf('{');
          const end = cleaned.lastIndexOf('}');
          if (start !== -1 && end > start) {
            cleaned = cleaned.substring(start, end + 1);
          }

          const parsed = JSON.parse(cleaned);
          const jsonString = JSON.stringify(parsed);
          fs.writeFileSync(filePath, jsonString);
          console.log(`✅ JSON parseado: project_id=${parsed.project_id}, client_email=${parsed.client_email}`);
        } catch (e) {
          console.error('❌ ERRO ao parsear JSON:', e instanceof Error ? e.message : e);
          throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY inválido - não pôde ser parseado como JSON');
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
