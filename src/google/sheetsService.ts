import { google, sheets_v4 } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import { config } from '../config';
import { logger } from '../utils/logger';
import { Transaction, DailySummary, Category } from '../types';
import { nowInTimezone, formatCurrency } from '../utils/formatter';

// ─── Constantes de layout ─────────────────────────────────────────────────────

const SHEETS = {
  MOVIMENTACOES: 'Movimentacoes',
  CATEGORIAS: 'Categorias',
  DASHBOARD: 'Dashboard',
};

const HEADER = [
  'ID', 'Data', 'Hora', 'Tipo', 'Categoria', 'Descrição',
  'Valor', 'Forma Pagamento', 'Conta', 'Usuário', 'Observação',
  'Status Conciliação', 'Saldo',
];

const CATEGORIES: Category[] = [
  'Frete', 'Troco', 'Venda de avaria', 'Reembolso de descarga', 'Recebimento',
  'Combustível', 'Descarga', 'Pernoite', 'Manutenção', 'Peças', 'Ferramentas',
  'Lubrificantes', 'Predial', 'Material de construção', 'Material de escritorio',
  'Marketing', 'Gratificação', 'Vale transporte', 'Vale alimentação', 'Salario',
  'Outros',
];

// ─── Serviço ──────────────────────────────────────────────────────────────────

export class SheetsService {
  private sheets!: sheets_v4.Sheets;
  private spreadsheetId: string;

  constructor() {
    this.spreadsheetId = config.google.spreadsheetId;
  }

  async init(): Promise<void> {
    const auth = new GoogleAuth({
      keyFile: config.google.serviceAccountKeyPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const authClient = await auth.getClient();
    this.sheets = google.sheets({ version: 'v4', auth: authClient as never });
    logger.info('Google Sheets: autenticado com sucesso');
  }

  // ── Setup inicial da planilha ──────────────────────────────────────────────

  async ensureSheetStructure(): Promise<void> {
    try {
      const meta = await this.sheets.spreadsheets.get({ spreadsheetId: this.spreadsheetId });
      const existingTitles = meta.data.sheets?.map((s) => s.properties?.title) ?? [];

      const requests: sheets_v4.Schema$Request[] = [];

      for (const sheetName of Object.values(SHEETS)) {
        if (!existingTitles.includes(sheetName)) {
          requests.push({ addSheet: { properties: { title: sheetName } } });
        }
      }

      if (requests.length > 0) {
        await this.sheets.spreadsheets.batchUpdate({
          spreadsheetId: this.spreadsheetId,
          requestBody: { requests },
        });
        logger.info(`Abas criadas: ${requests.map((r) => r.addSheet?.properties?.title).join(', ')}`);
      }

      await this.setupMovimentacoesHeader();
      await this.setupCategorias();
      await this.setupDashboard();
      await this.createCategoryCharts();

      logger.info('Estrutura da planilha verificada/criada com sucesso');
    } catch (err) {
      logger.error('Erro ao configurar planilha', err as Error);
      throw err;
    }
  }

  private async setupMovimentacoesHeader(): Promise<void> {
    const range = `${SHEETS.MOVIMENTACOES}!A1:M1`;
    const existing = await this.getValues(range);
    if (existing && existing[0]?.[0] === 'ID') return;

    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADER] },
    });

    // Formatar cabeçalho
    const sheetId = await this.getSheetId(SHEETS.MOVIMENTACOES);
    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: {
        requests: [
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.18, green: 0.38, blue: 0.65 },
                  textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
                  horizontalAlignment: 'CENTER',
                },
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
            },
          },
          {
            updateSheetProperties: {
              properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
              fields: 'gridProperties.frozenRowCount',
            },
          },
        ],
      },
    });
  }

  private async setupCategorias(): Promise<void> {
    const range = `${SHEETS.CATEGORIAS}!A1:B1`;
    const existing = await this.getValues(range);
    if (existing && existing[0]?.[0] === 'Categoria') return;

    const values = [['Categoria', 'Tipo'], ...CATEGORIES.map((c) => [c, ''])];
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEETS.CATEGORIAS}!A1:B${values.length}`,
      valueInputOption: 'RAW',
      requestBody: { values },
    });
  }

  private async setupDashboard(): Promise<void> {
    const range = `${SHEETS.DASHBOARD}!A1:B1`;
    const existing = await this.getValues(range);
    if (existing && existing[0]?.[0] === '📊 Dashboard Financeiro') return;

    const today = new Date().toLocaleDateString('pt-BR');
    const values = [
      ['📊 Dashboard Financeiro', ''],
      ['Atualizado em:', today],
      ['', ''],
      ['📅 HOJE', 'Valor'],
      ['Entradas Hoje', `=SOMA.SE.S(Movimentacoes!G:G;Movimentacoes!D:D;"Entrada";Movimentacoes!B:B;TEXT(HOJE();"DD/MM/YYYY"))`],
      ['Saídas Hoje', `=SOMA.SE.S(Movimentacoes!G:G;Movimentacoes!D:D;"Saída";Movimentacoes!B:B;TEXT(HOJE();"DD/MM/YYYY"))`],
      ['Saldo do Dia', '=B5-B6'],
      ['Lançamentos Hoje', `=CONTAR.SE.S(Movimentacoes!B:B;TEXT(HOJE();"DD/MM/YYYY"))`],
      ['', ''],
      ['📆 MÊS ATUAL', 'Valor'],
      ['Entradas Mês', `=SOMA.SE.S(Movimentacoes!G:G;Movimentacoes!D:D;"Entrada")`],
      ['Saídas Mês', `=SOMA.SE.S(Movimentacoes!G:G;Movimentacoes!D:D;"Saída")`],
      ['Saldo do Mês', '=B12-B13'],
      ['Total de Lançamentos', `=COUNTA(Movimentacoes!A:A)-1`],
    ];

    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEETS.DASHBOARD}!A1:B${values.length}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values },
    });
  }

  private async createCategoryCharts(): Promise<void> {
    try {
      const analysisTab = 'Análise Categorias';

      // Verificar se aba já existe
      const meta = await this.sheets.spreadsheets.get({ spreadsheetId: this.spreadsheetId });
      const existingTitles = meta.data.sheets?.map((s) => s.properties?.title) ?? [];

      // Criar aba se não existir
      if (!existingTitles.includes(analysisTab)) {
        await this.sheets.spreadsheets.batchUpdate({
          spreadsheetId: this.spreadsheetId,
          requestBody: {
            requests: [{ addSheet: { properties: { title: analysisTab } } }],
          },
        });
      }

      // Preparar fórmulas automáticas para categorias
      const entriesFormulas: any[] = [['Categoria', 'Valor']];
      const exitsFormulas: any[] = [['Categoria', 'Valor']];

      // CATEGORIAS: todas as 21 categorias
      const allCategories = [
        'Frete', 'Troco', 'Venda de avaria', 'Reembolso de descarga', 'Recebimento',
        'Combustível', 'Descarga', 'Pernoite', 'Manutenção', 'Peças', 'Ferramentas',
        'Lubrificantes', 'Predial', 'Material de construção', 'Material de escritorio',
        'Marketing', 'Gratificação', 'Vale transporte', 'Vale alimentação', 'Salario',
      ];

      const entryCategories = [
        'Frete', 'Troco', 'Venda de avaria', 'Reembolso de descarga', 'Recebimento',
      ];
      const exitCategories = [
        'Combustível', 'Descarga', 'Pernoite', 'Manutenção', 'Peças', 'Ferramentas',
        'Lubrificantes', 'Predial', 'Material de construção', 'Material de escritorio',
        'Marketing', 'Gratificação', 'Vale transporte', 'Vale alimentação', 'Salario',
      ];

      // Criar fórmulas para ENTRADAS
      entryCategories.forEach((cat) => {
        entriesFormulas.push([cat, `=SOMASES(Movimentacoes!G:G;Movimentacoes!E:E;"${cat}";Movimentacoes!D:D;"Entrada")`]);
      });

      // Criar fórmulas para SAÍDAS
      exitCategories.forEach((cat) => {
        exitsFormulas.push([cat, `=SOMASES(Movimentacoes!G:G;Movimentacoes!E:E;"${cat}";Movimentacoes!D:D;"Saída")`]);
      });

      // Atualizar aba com fórmulas (atualizam automaticamente!)
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${analysisTab}!A1:B${entriesFormulas.length + exitsFormulas.length + 5}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [
            ['📥 ENTRADAS', ''],
            ...entriesFormulas,
            ['', ''],
            ['📤 SAÍDAS', ''],
            ...exitsFormulas,
          ],
        },
      });

      logger.info('Aba de análise de categorias criada com sucesso');
    } catch (err) {
      logger.debug('Nota: aba de análise de categorias não foi criada', err as Error);
    }
  }

  // ── CRUD de transações ─────────────────────────────────────────────────────

  async appendTransaction(t: Transaction): Promise<void> {
    const balance = await this.calculateCurrentBalance(t);
    t.balance = balance;

    const row = [
      t.id, t.date, t.time, t.type, t.category, t.description,
      t.value, t.paymentMethod, t.account, t.user, t.observation,
      t.reconciliationStatus, balance,
    ];

    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEETS.MOVIMENTACOES}!A:M`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });

    logger.info(`Lançamento registrado: ${t.id} | ${t.type} | R$ ${t.value}`);
  }

  async getLastTransaction(): Promise<Transaction | null> {
    const rows = await this.getAllRows();
    if (!rows || rows.length === 0) return null;
    return this.rowToTransaction(rows[rows.length - 1]);
  }

  async deleteLastTransaction(): Promise<Transaction | null> {
    const meta = await this.sheets.spreadsheets.get({ spreadsheetId: this.spreadsheetId });
    const sheet = meta.data.sheets?.find((s) => s.properties?.title === SHEETS.MOVIMENTACOES);
    if (!sheet) return null;

    const rows = await this.getAllRows();
    if (!rows || rows.length === 0) return null;

    const lastRow = rows.length + 1; // +1 para cabeçalho
    const lastTransaction = this.rowToTransaction(rows[rows.length - 1]);

    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId: sheet.properties?.sheetId,
              dimension: 'ROWS',
              startIndex: lastRow - 1,
              endIndex: lastRow,
            },
          },
        }],
      },
    });

    logger.info(`Último lançamento removido: ${lastTransaction.id}`);
    return lastTransaction;
  }

  async getRecentTransactions(count: number = 10): Promise<Transaction[]> {
    const rows = await this.getAllRows();
    if (!rows) return [];
    return rows.slice(-count).reverse().map((r) => this.rowToTransaction(r));
  }

  async getDailySummary(date?: string): Promise<DailySummary> {
    const target = date ?? nowInTimezone().date;
    const rows = await this.getAllRows();
    const dayRows = (rows ?? []).filter((r) => r[1] === target);

    const totalIn = dayRows
      .filter((r) => r[3] === 'Entrada')
      .reduce((sum, r) => sum + parseFloat(String(r[6]).replace(',', '.') || '0'), 0);

    const totalOut = dayRows
      .filter((r) => r[3] === 'Saída')
      .reduce((sum, r) => sum + parseFloat(String(r[6]).replace(',', '.') || '0'), 0);

    const catMap: Record<string, number> = {};
    dayRows.forEach((r) => {
      const cat = String(r[4] || 'Outros');
      const val = parseFloat(String(r[6]).replace(',', '.') || '0');
      catMap[cat] = (catMap[cat] ?? 0) + val;
    });

    const topCategories = Object.entries(catMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([category, total]) => ({ category, total }));

    return {
      date: target,
      totalIn,
      totalOut,
      balance: totalIn - totalOut,
      transactionCount: dayRows.length,
      topCategories,
    };
  }

  async getCurrentBalance(): Promise<number> {
    const rows = await this.getAllRows();
    if (!rows || rows.length === 0) return 0;
    const lastRow = rows[rows.length - 1];
    return parseFloat(String(lastRow[12]).replace(',', '.') || '0');
  }

  async getLastTransactionDate(): Promise<string | null> {
    const rows = await this.getAllRows();
    if (!rows || rows.length === 0) return null;
    return String(rows[rows.length - 1][1]);
  }

  async getCategoryAnalysis(month?: string): Promise<{
    entries: Array<{ category: string; total: number; percentage: number }>;
    exits: Array<{ category: string; total: number; percentage: number }>;
    totalEntries: number;
    totalExits: number;
  }> {
    const rows = await this.getAllRows();
    if (!rows) {
      return { entries: [], exits: [], totalEntries: 0, totalExits: 0 };
    }

    const entriesMap = new Map<string, number>();
    const exitsMap = new Map<string, number>();
    let totalIn = 0;
    let totalOut = 0;

    const currentMonth = month || `${new Date().getMonth() + 1}/${new Date().getFullYear()}`;

    rows.forEach((row) => {
      const date = String(row[1] || '');
      const type = String(row[3] || '');
      const category = String(row[4] || 'Outros');
      const value = parseFloat(String(row[6]).replace(',', '.') || '0');

      // Filtrar por mês se necessário
      const [day, m, y] = date.split('/').map(Number);
      const rowMonth = `${m}/${y}`;
      if (rowMonth !== currentMonth) return;

      if (type === 'Entrada') {
        entriesMap.set(category, (entriesMap.get(category) || 0) + value);
        totalIn += value;
      } else if (type === 'Saída') {
        exitsMap.set(category, (exitsMap.get(category) || 0) + value);
        totalOut += value;
      }
    });

    const entries = Array.from(entriesMap.entries())
      .map(([cat, total]) => ({ category: cat, total, percentage: (total / totalIn) * 100 }))
      .sort((a, b) => b.total - a.total);

    const exits = Array.from(exitsMap.entries())
      .map(([cat, total]) => ({ category: cat, total, percentage: (total / totalOut) * 100 }))
      .sort((a, b) => b.total - a.total);

    return { entries, exits, totalEntries: totalIn, totalExits: totalOut };
  }

  async auditBalance(): Promise<{
    totalRows: number;
    calculatedBalance: number;
    recordedBalance: number;
    difference: number;
    discrepancies: Array<{ line: number; description: string; calculated: number; recorded: number; diff: number }>;
  }> {
    const rows = await this.getAllRows();
    if (!rows) return { totalRows: 0, calculatedBalance: 0, recordedBalance: 0, difference: 0, discrepancies: [] };

    let calculatedBalance = 0;
    const discrepancies: Array<{ line: number; description: string; calculated: number; recorded: number; diff: number }> = [];

    rows.forEach((row, idx) => {
      const type = String(row[3] || '');
      const value = parseFloat(String(row[6]).replace(',', '.') || '0');
      const recorded = parseFloat(String(row[12]).replace(',', '.') || '0');

      if (type === 'Entrada') calculatedBalance += value;
      if (type === 'Saída') calculatedBalance -= value;

      const diff = Math.abs(calculatedBalance - recorded);
      if (diff > 0.01) {
        discrepancies.push({
          line: idx + 2,
          description: String(row[5] || ''),
          calculated: calculatedBalance,
          recorded,
          diff,
        });
      }
    });

    const recordedBalance = rows.length > 0 ? parseFloat(String(rows[rows.length - 1][12]).replace(',', '.') || '0') : 0;

    return {
      totalRows: rows.length,
      calculatedBalance,
      recordedBalance,
      difference: calculatedBalance - recordedBalance,
      discrepancies,
    };
  }

  async getDashboardData(): Promise<{
    entriesToday: number;
    exitsToday: number;
    balanceToday: number;
    transactionsToday: number;
    entriesMonth: number;
    exitsMonth: number;
    balanceMonth: number;
    totalTransactions: number;
    currentBalance: number;
  }> {
    const rows = await this.getAllRows();
    if (!rows) {
      return {
        entriesToday: 0,
        exitsToday: 0,
        balanceToday: 0,
        transactionsToday: 0,
        entriesMonth: 0,
        exitsMonth: 0,
        balanceMonth: 0,
        totalTransactions: 0,
        currentBalance: 0,
      };
    }

    const today = new Date().toLocaleDateString('pt-BR');
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();

    let entriesToday = 0;
    let exitsToday = 0;
    let transactionsToday = 0;
    let entriesMonth = 0;
    let exitsMonth = 0;

    rows.forEach((row) => {
      const date = String(row[1] || '');
      const type = String(row[3] || '');
      const value = parseFloat(String(row[6]).replace(',', '.') || '0');

      // Verificar se é de hoje
      if (date === today) {
        transactionsToday++;
        if (type === 'Entrada') entriesToday += value;
        if (type === 'Saída') exitsToday += value;
      }

      // Verificar se é do mês atual
      const [day, month, year] = date.split('/').map(Number);
      if (month === currentMonth && year === currentYear) {
        if (type === 'Entrada') entriesMonth += value;
        if (type === 'Saída') exitsMonth += value;
      }
    });

    const currentBalance = await this.getCurrentBalance();

    return {
      entriesToday,
      exitsToday,
      balanceToday: entriesToday - exitsToday,
      transactionsToday,
      entriesMonth,
      exitsMonth,
      balanceMonth: entriesMonth - exitsMonth,
      totalTransactions: rows.length,
      currentBalance,
    };
  }

  // ── Helpers internos ───────────────────────────────────────────────────────

  private async calculateCurrentBalance(t: Transaction): Promise<number> {
    const current = await this.getCurrentBalance();
    if (t.type === 'Entrada') return current + t.value;
    if (t.type === 'Saída') return current - t.value;
    return current; // Transferência não altera saldo de caixa
  }

  private async getAllRows(): Promise<string[][] | null> {
    const result = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${SHEETS.MOVIMENTACOES}!A2:M10000`,
    });
    return (result.data.values as string[][]) ?? null;
  }

  private async getValues(range: string): Promise<string[][] | null> {
    const result = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range,
    });
    return (result.data.values as string[][]) ?? null;
  }

  private async getSheetId(title: string): Promise<number> {
    const meta = await this.sheets.spreadsheets.get({ spreadsheetId: this.spreadsheetId });
    const sheet = meta.data.sheets?.find((s) => s.properties?.title === title);
    return sheet?.properties?.sheetId ?? 0;
  }

  private rowToTransaction(row: string[]): Transaction {
    return {
      id: row[0] ?? '',
      date: row[1] ?? '',
      time: row[2] ?? '',
      type: (row[3] as Transaction['type']) ?? 'Saída',
      category: row[4] ?? 'Outros',
      description: row[5] ?? '',
      value: parseFloat(String(row[6]).replace(',', '.') || '0'),
      paymentMethod: (row[7] as Transaction['paymentMethod']) ?? 'Não informado',
      account: (row[8] as Transaction['account']) ?? 'Caixa Dinheiro',
      user: row[9] ?? '',
      observation: row[10] ?? '',
      reconciliationStatus: (row[11] as Transaction['reconciliationStatus']) ?? 'Pendente',
      balance: parseFloat(String(row[12]).replace(',', '.') || '0'),
    };
  }
}

export const sheetsService = new SheetsService();
