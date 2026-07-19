import TelegramBot from 'node-telegram-bot-api';
import { config } from '../config';
import { handleMessage } from '../controllers/messageController';
import { SchedulerService } from '../services/schedulerService';
import { logger } from '../utils/logger';

export class CaixaBot {
  private bot: TelegramBot;
  private scheduler: SchedulerService;

  constructor() {
    this.bot = new TelegramBot(config.telegram.token, { polling: true });
    this.scheduler = new SchedulerService(this.bot, config.telegram.authorizedChatId);
  }

  start(): void {
    this.bot.on('message', async (msg) => {
      // Segurança: ignorar mensagens de outros usuários
      if (msg.chat.id !== config.telegram.authorizedChatId) {
        logger.warn(`Mensagem bloqueada de chat não autorizado: ${msg.chat.id}`);
        return;
      }

      try {
        await handleMessage(msg, this.bot);
      } catch (err) {
        logger.error('Erro não tratado no handler de mensagem', err as Error);
        await this.bot.sendMessage(
          msg.chat.id,
          '❌ Ocorreu um erro inesperado. Verifique os logs.'
        );
      }
    });

    this.bot.on('polling_error', (err) => {
      logger.error('Erro de polling do Telegram', err);
    });

    this.bot.on('error', (err) => {
      logger.error('Erro geral do bot', err);
    });

    this.scheduler.start();

    logger.info('🤖 Bot iniciado e aguardando mensagens...');
  }

  async stop(): Promise<void> {
    await this.bot.stopPolling();
    logger.info('Bot encerrado.');
  }
}
