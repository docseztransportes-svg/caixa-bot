import TelegramBot, { Message } from 'node-telegram-bot-api';
import { financialService } from '../services/financialService';
import { sheetsService } from '../google/sheetsService';
import { ParsedMessage, PendingSession, Category, PaymentMethod } from '../types';
import {
  formatConfirmation,
  formatCurrency,
  formatDailySummary,
  formatTransactionList,
} from '../utils/formatter';
import { logger } from '../utils/logger';

// ─── Estado de sessões pendentes (aguardando resposta do usuário) ─────────────

const pendingSessions = new Map<number, PendingSession>();

// ─── Comandos de texto reconhecidos ──────────────────────────────────────────

const COMMANDS: Record<string, (chatId: number, bot: TelegramBot, username: string) => Promise<void>> = {
  'saldo': handleBalance,
  'saldo hoje': handleBalance,
  'saldo mês': handleMonthBalance,
  'saldo mes': handleMonthBalance,
  'últimos 10': handleRecent,
  'ultimos 10': handleRecent,
  'últimos 10 lançamentos': handleRecent,
  'cancelar último': handleCancelLast,
  'cancelar ultimo': handleCancelLast,
  'categorias': handleCategories,
  'dashboard': handleDashboard,
  'relatório hoje': handleTodayReport,
  'relatorio hoje': handleTodayReport,
  'relatório mês': handleMonthReport,
  'relatorio mes': handleMonthReport,
  'auditoria': handleAudit,
  'auditoria caixa': handleAudit,
  'analise categorias': handleCategories,
  'ajuda': handleHelp,
  'help': handleHelp,
};

// ─── Handler principal ────────────────────────────────────────────────────────

export async function handleMessage(
  msg: Message,
  bot: TelegramBot
): Promise<void> {
  const chatId = msg.chat.id;
  const text = msg.text?.trim() ?? '';
  const username = msg.from?.username ?? msg.from?.first_name ?? 'usuário';

  if (!text) return;

  logger.info(`Mensagem recebida de ${username} (${chatId}): "${text}"`);

  // Verificar se há sessão pendente aguardando resposta
  if (pendingSessions.has(chatId)) {
    await handlePendingSession(chatId, text, bot, username);
    return;
  }

  // Verificar se é um comando
  const lower = text.toLowerCase().trim().replace(/^\//, '');
  const commandFn = COMMANDS[lower];
  if (commandFn) {
    await commandFn(chatId, bot, username);
    return;
  }

  // Processar como lançamento financeiro
  await handleFinancialEntry(chatId, text, bot, username);
}

// ─── Lançamento financeiro ────────────────────────────────────────────────────

async function handleFinancialEntry(
  chatId: number,
  text: string,
  bot: TelegramBot,
  username: string
): Promise<void> {
  try {
    const { transaction, parsed } = await financialService.processMessage(text, username);

    if (transaction) {
      await bot.sendMessage(chatId, formatConfirmation(transaction), { parse_mode: 'Markdown' });
      return;
    }

    // Dados insuficientes — iniciar sessão de pergunta
    await startPendingSession(chatId, parsed, text, bot, username);
  } catch (err) {
    logger.error('Erro ao processar lançamento', err as Error);
    await bot.sendMessage(chatId, '❌ Erro ao registrar lançamento. Tente novamente.');
  }
}

// ─── Sessões pendentes ─────────────────────────────────────────────────────────

async function startPendingSession(
  chatId: number,
  parsed: ParsedMessage,
  originalMessage: string,
  bot: TelegramBot,
  username: string
): Promise<void> {
  // Se não tem valor, pedir primeiro
  if (!parsed.value) {
    pendingSessions.set(chatId, {
      chatId,
      partial: parsed,
      step: 'awaiting_value',
      originalMessage,
    });
    await bot.sendMessage(chatId, '💰 Qual é o valor da movimentação?');
    return;
  }

  // Se não tem categoria, pedir
  if (!parsed.category) {
    pendingSessions.set(chatId, {
      chatId,
      partial: parsed,
      step: 'awaiting_category',
      originalMessage,
    });
    await askCategory(chatId, bot);
    return;
  }

  // Se não tem tipo (entrada/saída)
  if (!parsed.type) {
    pendingSessions.set(chatId, {
      chatId,
      partial: parsed,
      step: 'awaiting_category',
      originalMessage,
    });
    await bot.sendMessage(
      chatId,
      '↕️ É uma *entrada* ou *saída*?\n\nResponda: entrada / saída / transferência',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // Tudo ok, salvar
  const transaction = await financialService.buildAndSave(parsed, username);
  await bot.sendMessage(chatId, formatConfirmation(transaction), { parse_mode: 'Markdown' });
}

async function handlePendingSession(
  chatId: number,
  text: string,
  bot: TelegramBot,
  username: string
): Promise<void> {
  const session = pendingSessions.get(chatId)!;
  const lower = text.toLowerCase().trim();

  if (lower === 'cancelar' || lower === 'cancel') {
    pendingSessions.delete(chatId);
    await bot.sendMessage(chatId, '❌ Operação cancelada.');
    return;
  }

  switch (session.step) {
    case 'awaiting_value': {
      const value = parseFloat(text.replace(',', '.').replace(/[^0-9.]/g, ''));
      if (isNaN(value) || value <= 0) {
        await bot.sendMessage(chatId, '⚠️ Valor inválido. Digite apenas o número, ex: 350');
        return;
      }
      session.partial.value = value;
      session.step = 'awaiting_category';
      pendingSessions.set(chatId, session);
      await askCategory(chatId, bot);
      break;
    }

    case 'awaiting_category': {
      // Aceitar número (índice) ou texto
      const categories: Category[] = [
        'Frete', 'Troco', 'Venda de avaria', 'Reembolso de descarga', 'Recebimento',
        'Combustível', 'Descarga', 'Pernoite', 'Manutenção', 'Peças', 'Ferramentas',
        'Lubrificantes', 'Predial', 'Material de construção', 'Material de escritorio',
        'Marketing', 'Gratificação', 'Vale transporte', 'Vale alimentação', 'Salario', 'Outros',
      ];
      const index = parseInt(text, 10) - 1;
      let category: Category | undefined;

      if (!isNaN(index) && index >= 0 && index < categories.length) {
        category = categories[index];
      } else {
        category = categories.find((c) => c.toLowerCase() === lower) ?? 'Outros';
      }

      session.partial.category = category;

      // Se ainda não tem tipo, perguntar
      if (!session.partial.type) {
        session.step = 'awaiting_payment';
        pendingSessions.set(chatId, session);
        await bot.sendMessage(chatId, '↕️ É uma *entrada* ou *saída*?\n\nResponda: entrada / saída', {
          parse_mode: 'Markdown',
        });
      } else {
        await finalizePendingSession(chatId, bot, username);
      }
      break;
    }

    case 'awaiting_payment': {
      if (lower.includes('entrada') || lower.includes('receb')) {
        session.partial.type = 'Entrada';
      } else if (lower.includes('transfer')) {
        session.partial.type = 'Transferência';
      } else {
        session.partial.type = 'Saída';
      }
      pendingSessions.set(chatId, session);
      await finalizePendingSession(chatId, bot, username);
      break;
    }
  }
}

async function finalizePendingSession(chatId: number, bot: TelegramBot, username: string): Promise<void> {
  const session = pendingSessions.get(chatId);
  if (!session) return;

  pendingSessions.delete(chatId);

  try {
    const transaction = await financialService.buildAndSave(session.partial as ParsedMessage, username);
    await bot.sendMessage(chatId, formatConfirmation(transaction), { parse_mode: 'Markdown' });
  } catch (err) {
    logger.error('Erro ao finalizar sessão pendente', err as Error);
    await bot.sendMessage(chatId, '❌ Erro ao salvar lançamento.');
  }
}

async function askCategory(chatId: number, bot: TelegramBot): Promise<void> {
  const cats = [
    '1. Frete', '2. Combustível', '3. Pedágio', '4. Alimentação',
    '5. Manutenção', '6. Transferência', '7. PIX', '8. Depósito',
    '9. Saque', '10. Recebimento Cliente', '11. Fornecedor',
    '12. Lavagem', '13. Seguro', '14. Salário', '15. Outros',
  ];
  await bot.sendMessage(
    chatId,
    `🏷️ *Qual categoria?*\n\n${cats.join('\n')}\n\n_Responda com o número ou o nome_`,
    { parse_mode: 'Markdown' }
  );
}

// ─── Handlers de comandos ─────────────────────────────────────────────────────

async function handleBalance(chatId: number, bot: TelegramBot): Promise<void> {
  const balance = await financialService.getBalance();
  const summary = await sheetsService.getDailySummary();
  await bot.sendMessage(
    chatId,
    [
      `💵 *Saldo atual do caixa:* ${formatCurrency(balance)}`,
      ``,
      `📅 *Hoje (${summary.date}):*`,
      `  🟢 Entradas: ${formatCurrency(summary.totalIn)}`,
      `  🔴 Saídas: ${formatCurrency(summary.totalOut)}`,
    ].join('\n'),
    { parse_mode: 'Markdown' }
  );
}

async function handleMonthBalance(chatId: number, bot: TelegramBot): Promise<void> {
  const summary = await sheetsService.getDailySummary();
  await bot.sendMessage(chatId, formatDailySummary(summary), { parse_mode: 'Markdown' });
}

async function handleRecent(chatId: number, bot: TelegramBot): Promise<void> {
  const transactions = await financialService.getRecent(10);
  await bot.sendMessage(chatId, formatTransactionList(transactions), { parse_mode: 'Markdown' });
}

async function handleCancelLast(chatId: number, bot: TelegramBot): Promise<void> {
  const deleted = await financialService.cancelLast();
  if (!deleted) {
    await bot.sendMessage(chatId, '⚠️ Nenhum lançamento para cancelar.');
    return;
  }
  await bot.sendMessage(
    chatId,
    `✅ Lançamento cancelado:\n\`${deleted.id}\` — ${deleted.type} — ${formatCurrency(deleted.value)}`,
    { parse_mode: 'Markdown' }
  );
}

async function handleDashboard(chatId: number, bot: TelegramBot): Promise<void> {
  const dash = await sheetsService.getDashboardData();
  const today = new Date().toLocaleDateString('pt-BR');

  await bot.sendMessage(
    chatId,
    [
      `📊 *Dashboard Financeiro*`,
      ``,
      `📅 *Hoje (${today})*`,
      `  🟢 Entradas: ${formatCurrency(dash.entriesToday)}`,
      `  🔴 Saídas: ${formatCurrency(dash.exitsToday)}`,
      `  💰 Saldo do dia: *${formatCurrency(dash.balanceToday)}*`,
      `  📝 Lançamentos: ${dash.transactionsToday}`,
      ``,
      `📆 *Mês Atual*`,
      `  🟢 Entradas: ${formatCurrency(dash.entriesMonth)}`,
      `  🔴 Saídas: ${formatCurrency(dash.exitsMonth)}`,
      `  💰 Saldo do mês: *${formatCurrency(dash.balanceMonth)}*`,
      `  📝 Total: ${dash.totalTransactions} lançamentos`,
      ``,
      `💳 *Saldo da Conta*`,
      `  Caixa Dinheiro: *${formatCurrency(dash.currentBalance)}*`,
    ].join('\n'),
    { parse_mode: 'Markdown' }
  );
}

async function handleTodayReport(chatId: number, bot: TelegramBot): Promise<void> {
  const summary = await sheetsService.getDailySummary();
  await bot.sendMessage(chatId, formatDailySummary(summary), { parse_mode: 'Markdown' });
}

async function handleMonthReport(chatId: number, bot: TelegramBot): Promise<void> {
  await handleTodayReport(chatId, bot);
}

async function handleAudit(chatId: number, bot: TelegramBot): Promise<void> {
  const audit = await sheetsService.auditBalance();

  let message = [
    `🔍 *Auditoria de Caixa*`,
    ``,
    `Total de lançamentos: ${audit.totalRows}`,
    `Saldo calculado: ${formatCurrency(audit.calculatedBalance)}`,
    `Saldo registrado: ${formatCurrency(audit.recordedBalance)}`,
    `Diferença: ${formatCurrency(audit.difference)}`,
    ``,
  ];

  if (audit.discrepancies.length === 0) {
    message.push(`✅ *Caixa íntegro! Nenhuma discrepância encontrada.*`);
  } else {
    message.push(`⚠️ *Discrepâncias encontradas:*`);
    message.push(``);
    audit.discrepancies.slice(0, 5).forEach((d) => {
      message.push(`Linha ${d.line}: ${d.description}`);
      message.push(`  Calculado: ${formatCurrency(d.calculated)}`);
      message.push(`  Registrado: ${formatCurrency(d.recorded)}`);
      message.push(`  Diferença: ${formatCurrency(d.diff)}`);
      message.push(``);
    });
  }

  await bot.sendMessage(chatId, message.join('\n'), { parse_mode: 'Markdown' });
}

async function handleCategories(chatId: number, bot: TelegramBot): Promise<void> {
  const analysis = await sheetsService.getCategoryAnalysis();

  const message: string[] = ['🏆 *Análise por Categoria*', ''];

  if (analysis.entries.length > 0) {
    message.push('📥 *ENTRADAS*');
    message.push(`Total: ${formatCurrency(analysis.totalEntries)}`);
    message.push('');
    analysis.entries.forEach((item, idx) => {
      const bar = '█'.repeat(Math.round(item.percentage / 5));
      message.push(
        `${idx + 1}. ${item.category}\n   ${formatCurrency(item.total)} (${item.percentage.toFixed(1)}%) ${bar}`
      );
    });
    message.push('');
  }

  if (analysis.exits.length > 0) {
    message.push('📤 *SAÍDAS*');
    message.push(`Total: ${formatCurrency(analysis.totalExits)}`);
    message.push('');
    analysis.exits.forEach((item, idx) => {
      const bar = '█'.repeat(Math.round(item.percentage / 5));
      message.push(
        `${idx + 1}. ${item.category}\n   ${formatCurrency(item.total)} (${item.percentage.toFixed(1)}%) ${bar}`
      );
    });
  }

  await bot.sendMessage(chatId, message.join('\n'), { parse_mode: 'Markdown' });
}

async function handleHelp(chatId: number, bot: TelegramBot): Promise<void> {
  await bot.sendMessage(
    chatId,
    [
      `🤖 *Comandos disponíveis:*`,
      ``,
      `*💰 Consultas:*`,
      `• \`saldo\` — saldo atual do caixa`,
      `• \`dashboard\` — resumo completo`,
      `• \`categorias\` — análise por categoria`,
      `• \`últimos 10\` — últimos lançamentos`,
      `• \`relatório hoje\` — resumo do dia`,
      `• \`auditoria\` — verificar integridade`,
      ``,
      `*✏️ Ações:*`,
      `• \`cancelar último\` — remove o último lançamento`,
      ``,
      `*📝 Lançamentos (linguagem natural):*`,
      `• "Recebi 500 frete João"`,
      `• "Paguei 120 combustível"`,
      `• "Pix recebido 950 cliente"`,
      `• "Saquei 300 banco"`,
      `• "Pedágio 52"`,
    ].join('\n'),
    { parse_mode: 'Markdown' }
  );
}
