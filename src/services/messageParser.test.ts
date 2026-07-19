import { MessageParser } from './messageParser';

const parser = new MessageParser();

describe('MessageParser', () => {
  describe('Entradas', () => {
    test('frete simples', () => {
      const r = parser.parse('Recebi 350 frete João');
      expect(r.type).toBe('Entrada');
      expect(r.value).toBe(350);
      expect(r.category).toBe('Frete');
    });

    test('pix recebido', () => {
      const r = parser.parse('Pix recebido 950');
      expect(r.type).toBe('Entrada');
      expect(r.value).toBe(950);
      expect(r.paymentMethod).toBe('PIX');
    });

    test('valor com ponto de milhar', () => {
      const r = parser.parse('Recebi 1.250 cliente XPTO');
      expect(r.value).toBe(1250);
      expect(r.type).toBe('Entrada');
    });
  });

  describe('Saídas', () => {
    test('combustível', () => {
      const r = parser.parse('Paguei 120 combustível');
      expect(r.type).toBe('Saída');
      expect(r.value).toBe(120);
      expect(r.category).toBe('Combustível');
    });

    test('abastecimento diesel', () => {
      const r = parser.parse('Abastecimento 680 diesel');
      expect(r.type).toBe('Saída');
      expect(r.value).toBe(680);
      expect(r.category).toBe('Combustível');
    });

    test('pedágio', () => {
      const r = parser.parse('Pedágio 52');
      expect(r.type).toBe('Saída');
      expect(r.value).toBe(52);
      expect(r.category).toBe('Pedágio');
    });

    test('alimentação', () => {
      const r = parser.parse('Paguei 38 almoço motorista');
      expect(r.type).toBe('Saída');
      expect(r.value).toBe(38);
      expect(r.category).toBe('Alimentação');
    });

    test('manutenção', () => {
      const r = parser.parse('Manutenção 850 troca de óleo');
      expect(r.type).toBe('Saída');
      expect(r.value).toBe(850);
      expect(r.category).toBe('Manutenção');
    });

    test('pix enviado', () => {
      const r = parser.parse('Pix enviado 410 fornecedor');
      expect(r.type).toBe('Saída');
      expect(r.paymentMethod).toBe('PIX');
      expect(r.category).toBe('Fornecedor');
    });

    test('lavagem', () => {
      const r = parser.parse('Lavagem 120');
      expect(r.type).toBe('Saída');
      expect(r.category).toBe('Lavagem');
    });
  });

  describe('Transferências', () => {
    test('para banco', () => {
      const r = parser.parse('Transferi 500 para banco');
      expect(r.type).toBe('Transferência');
      expect(r.value).toBe(500);
    });

    test('saque banco', () => {
      const r = parser.parse('Saquei 300 banco');
      expect(r.type).toBe('Saída');
      expect(r.value).toBe(300);
    });
  });

  describe('Confiança', () => {
    test('mensagem completa tem alta confiança', () => {
      const r = parser.parse('Recebi 500 frete dinheiro');
      expect(r.confidence).toBeGreaterThan(0.5);
    });

    test('mensagem vaga tem baixa confiança', () => {
      const r = parser.parse('alguma coisa aconteceu');
      expect(r.confidence).toBeLessThan(0.4);
    });
  });
});
