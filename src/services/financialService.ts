import { Transaction, ParsedMessage, PaymentMethod, Account, Category } from '../types';
import { sheetsService } from '../google/sheetsService';
import { messageParser } from './messageParser';
import { generateId, nowInTimezone } from '../utils/formatter';
import { logger } from '../utils/logger';

export class FinancialService {
  /** Processa uma mensagem e retorna a transação salva (ou null se dados insuficientes) */
  async processMessage(
    text: string,
    username: string
  ): Promise<{ transaction: Transaction | null; parsed: ParsedMessage }> {
    const parsed = messageParser.parse(text);

    if (parsed.missingFields.length > 0 || !parsed.value || !parsed.type) {
      logger.debug(`Campos faltantes: ${parsed.missingFields.join(', ')}`);
      return { transaction: null, parsed };
    }

    const transaction = await this.buildAndSave(parsed, username);
    return { transaction, parsed };
  }

  /** Constrói transação com campos defaults e salva */
  async buildAndSave(
    parsed: ParsedMessage,
    username: string,
    observation = ''
  ): Promise<Transaction> {
    const { date, time } = nowInTimezone();

    const transaction: Transaction = {
      id: generateId(),
      date,
      time,
      type: parsed.type!,
      category: (parsed.category ?? 'Outros') as Category,
      description: parsed.description ?? '',
      value: parsed.value!,
      paymentMethod: (parsed.paymentMethod ?? 'Não informado') as PaymentMethod,
      account: (parsed.account ?? 'Caixa Dinheiro') as Account,
      user: username,
      observation,
      reconciliationStatus: 'Pendente',
      balance: 0, // calculado no sheetsService
    };

    await sheetsService.appendTransaction(transaction);
    return transaction;
  }

  /** Cancela o último lançamento */
  async cancelLast(): Promise<Transaction | null> {
    return sheetsService.deleteLastTransaction();
  }

  /** Retorna saldo atual */
  async getBalance(): Promise<number> {
    return sheetsService.getCurrentBalance();
  }

  /** Retorna últimos N lançamentos */
  async getRecent(count = 10): Promise<Transaction[]> {
    return sheetsService.getRecentTransactions(count);
  }

  /** Verifica se houve lançamentos recentes (para alertas de inatividade) */
  async daysSinceLastTransaction(): Promise<number> {
    const lastDate = await sheetsService.getLastTransactionDate();
    if (!lastDate) return 999;

    const [d, m, y] = lastDate.split('/').map(Number);
    const last = new Date(y, m - 1, d);
    const today = new Date();
    const diff = Math.floor((today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  }
}

export const financialService = new FinancialService();
