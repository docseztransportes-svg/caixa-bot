import { config } from './config';
import { sheetsService } from './google/sheetsService';
import { CaixaBot } from './bot/telegramBot';
import { logger } from './utils/logger';
import * as http from 'http';

let botInstance: CaixaBot | null = null;

async function main(): Promise<void> {
  logger.info('=== CaixaBot - Sistema Financeiro de Transportadora ===');
  logger.info(`Ambiente: ${config.app.env}`);

  // Health check server para Render (PRIMEIRO, para abrir porta)
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

  await new Promise<void>((resolve) => {
    server.listen(port, () => {
      logger.info(`✅ Health check server listening on port ${port}`);
      resolve();
    });
  });

  // Inicializar Google Sheets
  logger.info('Conectando ao Google Sheets...');
  try {
    await sheetsService.init();
    await sheetsService.ensureSheetStructure();
    logger.info('✅ Google Sheets conectado');
  } catch (err) {
    logger.error('❌ Erro ao conectar Google Sheets:', err);
    throw err;
  }

  // Iniciar bot
  try {
    logger.info('Iniciando bot Telegram...');
    botInstance = new CaixaBot();
    botInstance.start();
    logger.info('✅ Bot Telegram iniciado');
  } catch (err) {
    logger.error('❌ Erro ao iniciar bot Telegram:', err);
    throw err;
  }

  // Graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('Encerrando...');
    if (botInstance) await botInstance.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Encerrando (SIGTERM)...');
    if (botInstance) await botInstance.stop();
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
