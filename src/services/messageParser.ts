import {
  ParsedMessage,
  TransactionType,
  Category,
  PaymentMethod,
  Account,
} from '../types';
import { logger } from '../utils/logger';

// ─── Dicionários de palavras-chave ────────────────────────────────────────────

const ENTRY_KEYWORDS = [
  'recebi', 'recebido', 'pix recebido', 'entrada', 'depositei', 'deposito',
  'depósito', 'crédito', 'creditado', 'faturei', 'ganhei', 'vendi',
];

const EXIT_KEYWORDS = [
  'paguei', 'pago', 'gastei', 'gasto', 'comprei', 'pix enviado',
  'pix pago', 'saída', 'saida', 'transferi', 'saquei', 'saque',
  'abastecimento', 'abasteci', 'pedágio', 'pedagio', 'lavagem',
  'manutenção', 'manutencao', 'almoço', 'almoco', 'janta', 'lanche',
];

const TRANSFER_KEYWORDS = [
  'transferi', 'transferência', 'transferencia', 'para banco', 'para caixa',
  'depositei no banco',
];

const CATEGORY_MAP: Record<string, Category> = {
  frete: 'Frete', transporte: 'Frete', corrida: 'Frete',
  troco: 'Troco', retorno: 'Troco',
  vanda: 'Venda de avaria', avaria: 'Venda de avaria',
  reembolso: 'Reembolso de descarga', devolução: 'Reembolso de descarga', devolucao: 'Reembolso de descarga', estorno: 'Reembolso de descarga',
  boletos: 'Recebimento', recebimento: 'Recebimento', 'recebimento de terceiros': 'Recebimento',
  combustível: 'Combustível', combustivel: 'Combustível', gasolina: 'Combustível', diesel: 'Combustível',
  descarga: 'Descarga', descarrego: 'Descarga', carga: 'Descarga',
  pernoite: 'Pernoite', diaria: 'Pernoite',
  manutenção: 'Manutenção', manutencao: 'Manutenção', serviço: 'Manutenção', servico: 'Manutenção', prego: 'Manutenção',
  peças: 'Peças', pecas: 'Peças',
  ferramentas: 'Ferramentas', compras: 'Ferramentas',
  oleo: 'Lubrificantes', lubrificante: 'Lubrificantes',
  pedreiro: 'Predial', eletricista: 'Predial', conserto: 'Predial',
  'material de construção': 'Material de construção', cimento: 'Material de construção',
  escritorio: 'Material de escritorio', comprinhas: 'Material de escritorio',
  merenda: 'Marketing', mkt: 'Marketing', marketing: 'Marketing', doação: 'Marketing', doacao: 'Marketing',
  gratificação: 'Gratificação', gratificacao: 'Gratificação', ajuda: 'Gratificação', contribuição: 'Gratificação', contribuicao: 'Gratificação',
  passagens: 'Vale transporte',
  almoço: 'Vale alimentação', almoco: 'Vale alimentação', janta: 'Vale alimentação', cesta: 'Vale alimentação',
  salario: 'Salario', quinzena: 'Salario', dias: 'Salario',
};

const PAYMENT_MAP: Record<string, PaymentMethod> = {
  dinheiro: 'Dinheiro', espécie: 'Dinheiro', especie: 'Dinheiro',
  pix: 'PIX',
  cartão: 'Cartão', cartao: 'Cartão', débito: 'Cartão', debito: 'Cartão',
  crédito: 'Cartão', credito: 'Cartão',
  transferência: 'Transferência', transferencia: 'Transferência',
  ted: 'TED', doc: 'DOC',
  boleto: 'Boleto',
  cheque: 'Cheque',
};

const ACCOUNT_MAP: Record<string, Account> = {
  caixa: 'Caixa Dinheiro', 'caixa dinheiro': 'Caixa Dinheiro',
  banco: 'Banco',
  carteira: 'Carteira',
  'caixa filial': 'Caixa Filial',
};

const CATEGORY_TYPE_MAP: Record<Category, TransactionType> = {
  'Frete': 'Entrada',
  'Troco': 'Entrada',
  'Venda de avaria': 'Entrada',
  'Reembolso de descarga': 'Entrada',
  'Recebimento': 'Entrada',
  'Combustível': 'Saída',
  'Descarga': 'Saída',
  'Pernoite': 'Saída',
  'Manutenção': 'Saída',
  'Peças': 'Saída',
  'Ferramentas': 'Saída',
  'Lubrificantes': 'Saída',
  'Predial': 'Saída',
  'Material de construção': 'Saída',
  'Material de escritorio': 'Saída',
  'Marketing': 'Saída',
  'Gratificação': 'Saída',
  'Vale transporte': 'Saída',
  'Vale alimentação': 'Saída',
  'Salario': 'Saída',
  'Outros': 'Saída',
};

// ─── Parser principal ─────────────────────────────────────────────────────────

export class MessageParser {
  /** Interpreta uma mensagem de texto livre e retorna os campos extraídos */
  parse(text: string): ParsedMessage {
    const normalized = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const result: ParsedMessage = {
      confidence: 0,
      missingFields: [],
    };

    result.value = this.extractValue(text);
    result.category = this.extractCategory(normalized);
    result.type = this.extractType(normalized, result.category as Category);
    result.paymentMethod = this.extractPaymentMethod(normalized);
    result.account = this.extractAccount(normalized, result.type);
    result.description = this.buildDescription(text, result);

    // Calcula campos faltantes
    if (!result.type) result.missingFields.push('tipo');
    if (!result.value) result.missingFields.push('valor');
    if (!result.category) result.missingFields.push('categoria');

    // Confiança baseada nos campos encontrados
    const totalFields = 5;
    const found = [result.type, result.value, result.category, result.paymentMethod, result.account]
      .filter(Boolean).length;
    result.confidence = found / totalFields;

    logger.debug(`Parser: texto="${text}" type=${result.type} value=${result.value} category=${result.category} conf=${result.confidence}`);

    return result;
  }

  private extractType(norm: string, category?: Category): TransactionType | undefined {
    // Se temos uma categoria, usar o mapa para determinar o tipo automaticamente
    if (category && CATEGORY_TYPE_MAP[category]) {
      return CATEGORY_TYPE_MAP[category];
    }

    // Caso contrário, usar keywords
    if (TRANSFER_KEYWORDS.some((k) => norm.includes(k))) {
      if (norm.includes('saquei') || norm.includes('paguei')) {
        return 'Saída';
      }
      if (norm.includes('transferi') || norm.includes('para banco')) return 'Transferência';
    }
    if (ENTRY_KEYWORDS.some((k) => norm.includes(k))) return 'Entrada';
    if (EXIT_KEYWORDS.some((k) => norm.includes(k))) return 'Saída';
    return undefined;
  }

  private extractValue(text: string): number | undefined {
    // Padrões: 1.250, 1250, 1.250,50, 1250.50, 2705
    const patterns = [
      /R\$\s*([\d.,]+)/i,
      /([\d.,]+)/,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        // Remove pontos (separadores de milhares) e converte vírgula em ponto (decimal)
        let raw = match[1].replace(/\./g, '').replace(',', '.');
        const value = parseFloat(raw);
        if (!isNaN(value) && value > 0) return value;
      }
    }
    return undefined;
  }

  private extractCategory(norm: string): Category | undefined {
    // Tenta match de expressões compostas primeiro
    for (const [key, cat] of Object.entries(CATEGORY_MAP)) {
      if (norm.includes(key)) return cat;
    }
    return undefined;
  }

  private extractPaymentMethod(norm: string): PaymentMethod {
    for (const [key, method] of Object.entries(PAYMENT_MAP)) {
      if (norm.includes(key)) return method;
    }
    // Inferência por tipo de operação
    if (norm.includes('pix')) return 'PIX';
    return 'Não informado';
  }

  private extractAccount(norm: string, type?: TransactionType): Account {
    for (const [key, account] of Object.entries(ACCOUNT_MAP)) {
      if (norm.includes(key)) return account;
    }
    // Inferência padrão: caixa para entradas em dinheiro, banco para transferências
    if (norm.includes('banco')) return 'Banco';
    if (type === 'Transferência') return 'Banco';
    return 'Caixa Dinheiro';
  }

  private buildDescription(original: string, parsed: Partial<ParsedMessage>): string {
    // Remove o valor da string e usa o restante como descrição
    let desc = original
      .replace(/R\$\s*[\d.,]+/gi, '')
      .replace(/[\d]{1,3}(?:\.[\d]{3})*(?:,[\d]{1,2})?/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Remove palavras-chave de tipo já classificadas
    const stopWords = [...ENTRY_KEYWORDS, ...EXIT_KEYWORDS, 'pix', 'pago', 'recebido'];
    stopWords.forEach((w) => {
      desc = desc.replace(new RegExp(`\\b${w}\\b`, 'gi'), '');
    });

    return desc.replace(/\s+/g, ' ').trim() || original.trim();
  }
}

export const messageParser = new MessageParser();
