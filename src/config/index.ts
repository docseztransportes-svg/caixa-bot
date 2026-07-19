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
    serviceAccountKeyPath: path.resolve(
      process.env.GOOGLE_SERVICE_ACCOUNT_KEY ?? './credentials/google-service-account.json'
    ),
  },
  app: {
    timezone: process.env.TIMEZONE ?? 'America/Sao_Paulo',
    env: process.env.NODE_ENV ?? 'development',
    dailySummaryHour: parseInt(process.env.DAILY_SUMMARY_HOUR ?? '20', 10),
    dailySummaryMinute: parseInt(process.env.DAILY_SUMMARY_MINUTE ?? '0', 10),
    alertInactiveDays: parseInt(process.env.ALERT_INACTIVE_DAYS ?? '3', 10),
  },
};
