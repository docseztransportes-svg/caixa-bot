// =============================================
// TIPOS CENTRAIS DO SISTEMA FINANCEIRO
// =============================================

export type TransactionType = 'Entrada' | 'Saída' | 'Transferência';

export type PaymentMethod =
  | 'Dinheiro'
  | 'PIX'
  | 'Cartão'
  | 'Transferência'
  | 'TED'
  | 'DOC'
  | 'Boleto'
  | 'Cheque'
  | 'Não informado';

export type Account =
  | 'Caixa Dinheiro'
  | 'Banco'
  | 'Carteira'
  | 'Caixa Filial'
  | 'Outros';

export type ReconciliationStatus = 'Pendente' | 'Conciliado' | 'Divergente';

export type Category =
  | 'Frete'
  | 'Troco'
  | 'Venda de avaria'
  | 'Reembolso de descarga'
  | 'Recebimento'
  | 'Combustível'
  | 'Descarga'
  | 'Pernoite'
  | 'Manutenção'
  | 'Peças'
  | 'Ferramentas'
  | 'Lubrificantes'
  | 'Predial'
  | 'Material de construção'
  | 'Material de escritorio'
  | 'Marketing'
  | 'Gratificação'
  | 'Vale transporte'
  | 'Vale alimentação'
  | 'Salario'
  | 'Outros';

export interface Transaction {
  id: string;
  date: string;          // DD/MM/YYYY
  time: string;          // HH:MM:SS
  type: TransactionType;
  category: Category | string;
  description: string;
  value: number;
  paymentMethod: PaymentMethod;
  account: Account;
  user: string;
  observation: string;
  reconciliationStatus: ReconciliationStatus;
  balance: number;       // calculado em runtime
}

export interface ParsedMessage {
  type?: TransactionType;
  value?: number;
  category?: Category | string;
  description?: string;
  paymentMethod?: PaymentMethod;
  account?: Account;
  observation?: string;
  confidence: number;    // 0-1 — confiança da interpretação
  missingFields: string[];
}

export interface PendingSession {
  chatId: number;
  partial: Partial<ParsedMessage>;
  step: 'awaiting_category' | 'awaiting_payment' | 'awaiting_account' | 'awaiting_value' | 'confirm';
  originalMessage: string;
}

export interface DailySummary {
  date: string;
  totalIn: number;
  totalOut: number;
  balance: number;
  transactionCount: number;
  topCategories: { category: string; total: number }[];
}

export interface MonthSummary extends DailySummary {
  month: string;
  previousBalance: number;
}
