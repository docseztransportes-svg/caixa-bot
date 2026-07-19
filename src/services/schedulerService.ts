import cron from 'node-cron';
import TelegramBot from 'node-telegram-bot-api';
import { sheetsService } from '../google/sheetsService';
import { financialService } from './financialService';
import { config } from '../config';
import { formatDailySummary, formatCurrency } from '../utils/formatter';
import { logger } from '../utils/logger';

export class SchedulerService {
  private bot: TelegramBot;
  private chatId: number;

  constructor(bot: TelegramBot, chatId: number) {
    this.bot = bot;
    this.chatId = chatId;
  }

  start(): void {
    this.scheduleDailySummary();
    this.scheduleInactivityAlert();
    logger.info('Agendamentos iniciados');
  }

  /** Resumo diário automático no horário configurado */
  private scheduleDailySummary(): void {
    const { dailySummaryHour, dailySummaryMinute } = config.app;
    const expression = `${dailySummaryMinute} ${dailySummaryHour} * * *`;

    cron.schedule(expression, async () => {
      try {
        logger.info('Enviando resumo diário automático...');
        const summary = await sheetsService.getDailySummary();
        const balance = await financialService.getBalance();

        const message = [
          `🌙 *Resumo do dia — ${summary.date}*`,
          ``,
          formatDailySummary(summary),
          ``,
          `💵 Saldo acumulado do caixa: *${formatCurrency(balance)}*`,
        ].join('\n');

        await this.bot.sendMessage(this.chatId, message, { parse_mode: 'Markdown' });
      } catch (err) {
        logger.error('Erro ao enviar resumo diário', err as Error);
      }
    });

    logger.info(`Resumo diário agendado para ${dailySummaryHour}:${String(dailySummaryMinute).padStart(2, '0')}`);
  }

  /** Alerta quando há muitos dias sem lançamentos */
  private scheduleInactivityAlert(): void {
    // Verifica todo dia às 09:00
    cron.schedule('0 9 * * *', async () => {
      try {
        const days = await financialService.daysSinceLastTransaction();
        if (days >= config.app.alertInactiveDays) {
          await this.bot.sendMessage(
            this.chatId,
            `⚠️ *Alerta:* Já faz *${days} dia(s)* sem lançamentos no caixa!\n\nNão esqueça de registrar suas movimentações.`,
            { parse_mode: 'Markdown' }
          );
        }
      } catch (err) {
        logger.error('Erro ao verificar inatividade', err as Error);
      }
    });
  }
}
