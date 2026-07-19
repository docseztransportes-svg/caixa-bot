import { config } from './config';
import { sheetsService } from './google/sheetsService';
import { CaixaBot } from './bot/telegramBot';
import { logger } from './utils/logger';
import * as http from 'http';

async function main(): Promise<void> {
  logger.info('=== CaixaBot - Sistema Financeiro de Transportadora ===');
  logger.info(`Ambiente: ${config.app.env}`);

  // Health check server para Render
  const port = process.env.PORT || 3000;
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  server.listen(port, () => {
    logger.info(`Health check server listening on port ${port}`);
  });

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
  logger.error('Erro fatal na inicialização:', err);
  console.error('Stack trace:', err instanceof Error ? err.stack : err);
  setTimeout(() => process.exit(1), 1000);
});
