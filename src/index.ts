import { config } from './config';
import { sheetsService } from './google/sheetsService';
import { CaixaBot } from './bot/telegramBot';
import { logger } from './utils/logger';

async function main(): Promise<void> {
  logger.info('=== CaixaBot - Sistema Financeiro de Transportadora ===');
  logger.info(`Ambiente: ${config.app.env}`);

  // Inicializar Google Sheets
  logger.info('Conectando ao Google Sheets...');
  await sheetsService.init();
  await sheetsService.ensureSheetStructure();

  // Iniciar bot
  const bot = new CaixaBot();
  bot.start();

  // Graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('Encerrando...');
    await bot.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Encerrando (SIGTERM)...');
    await bot.stop();
    process.exit(0);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Promise não tratada', reason as Error);
  });
}

main().catch((err) => {
  logger.error('Erro fatal na inicialização', err);
  process.exit(1);
});
