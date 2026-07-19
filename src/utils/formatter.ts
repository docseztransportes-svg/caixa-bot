import { config } from '../config';
import { Transaction, DailySummary } from '../types';

/** Retorna data e hora atuais (local) */
export function nowInTimezone(): { date: string; time: string; dateObj: Date } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');

  const day = pad(now.getDate());
  const month = pad(now.getMonth() + 1);
  const year = now.getFullYear();
  const hours = pad(now.getHours());
  const mins = pad(now.getMinutes());
  const secs = pad(now.getSeconds());

  return {
    date: `${day}/${month}/${year}`,
    time: `${hours}:${mins}:${secs}`,
    dateObj: now,
  };
}

/** Formata valor monetário em BRL */
export function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Gera ID único para lançamento */
export function generateId(): string {
  const { date } = nowInTimezone();
  const parts = date.split('/');
  const dateStr = `${parts[2]}${parts[1]}${parts[0]}`;
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `LAN-${dateStr}-${rand}`;
}

/** Monta a mensagem de confirmação de um lançamento */
export function formatConfirmation(t: Transaction): string {
  const emoji = t.type === 'Entrada' ? '🟢' : t.type === 'Saída' ? '🔴' : '🔵';
  return [
    `${emoji} *Lançamento registrado!*`,
    ``,
    `📋 *ID:* \`${t.id}\``,
    `📅 *Data:* ${t.date} ${t.time}`,
    `📂 *Tipo:* ${t.type}`,
    `🏷️ *Categoria:* ${t.category}`,
    `📝 *Descrição:* ${t.description || '-'}`,
    `💰 *Valor:* ${formatCurrency(t.value)}`,
    `💳 *Pagamento:* ${t.paymentMethod}`,
    `🏦 *Conta:* ${t.account}`,
    ``,
    `_Use "cancelar último" para desfazer._`,
  ].join('\n');
}

/** Monta mensagem de resumo diário */
export function formatDailySummary(s: DailySummary): string {
  const lines = [
    `📊 *Resumo do dia — ${s.date}*`,
    ``,
    `🟢 Entradas: ${formatCurrency(s.totalIn)}`,
    `🔴 Saídas:   ${formatCurrency(s.totalOut)}`,
    `💵 Saldo:    ${formatCurrency(s.balance)}`,
    `📑 Lançamentos: ${s.transactionCount}`,
  ];

  if (s.topCategories.length > 0) {
    lines.push(``, `*Por categoria:*`);
    s.topCategories.forEach(({ category, total }) => {
      lines.push(`  • ${category}: ${formatCurrency(total)}`);
    });
  }

  return lines.join('\n');
}

/** Tabela resumida de lançamentos */
export function formatTransactionList(transactions: Transaction[]): string {
  if (transactions.length === 0) return '_Nenhum lançamento encontrado._';

  const lines = [`*Últimos lançamentos:*`, ``];
  transactions.forEach((t) => {
    const emoji = t.type === 'Entrada' ? '🟢' : t.type === 'Saída' ? '🔴' : '🔵';
    lines.push(
      `${emoji} ${t.date} ${t.time.slice(0, 5)} | ${formatCurrency(t.value)} | ${t.category} | ${t.description || '-'}`
    );
  });

  return lines.join('\n');
}
