/* Geração de planilha (preenche o modelo PLANILHA_DE_PEDIDO.xlsx) e PDF. Funciona no navegador e no Node (testes). */
(function (root) {
  const PRIMEIRA = 27, ULTIMA = 249;            // linhas de itens do modelo (coluna C = ref, F = qtd)
  const CAPACIDADE = ULTIMA - PRIMEIRA + 1;      // 223 linhas por planilha
  const DESCONTO = 0.36;

  // linhas = [{ref, cor, qtd}] ; devolve ArrayBuffer/Buffer do .xlsx preenchido
  async function gerarXlsx(ExcelJS, modeloBuf, { cliente, linhas }) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(modeloBuf);
    const ws = wb.getWorksheet('PEDIDO');
    if (cliente) ws.getCell('D7').value = cliente;
    ws.getCell('AG26').value = 'COR';
    linhas.slice(0, CAPACIDADE).forEach((l, i) => {
      const r = PRIMEIRA + i;
      ws.getCell('C' + r).value = Number(l.ref);   // coluna C: referência
      ws.getCell('F' + r).value = Number(l.qtd);   // coluna F: quantidade
      if (l.cor) ws.getCell('AG' + r).value = l.cor; // cor informada (fora da área de impressão)
    });
    wb.calcProperties = Object.assign(wb.calcProperties || {}, { fullCalcOnLoad: true });
    return wb.xlsx.writeBuffer();
  }

  const moeda = (n) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  // Agrupa itens por ref+cor somando quantidades (para o pedido consolidado)
  function consolidar(pedidos) {
    const m = new Map();
    for (const p of pedidos) for (const i of p.itens) {
      const k = i.ref + '|' + (i.cor || '').trim().toLowerCase();
      const a = m.get(k) || { ref: i.ref, cor: (i.cor || '').trim(), qtd: 0 };
      a.qtd += i.qtd; m.set(k, a);
    }
    return [...m.values()].sort((a, b) => a.ref - b.ref || a.cor.localeCompare(b.cor));
  }

  // PDF no mesmo layout de colunas da planilha: REF, DESCRIÇÃO, COR, QUANT., PREÇO, PREÇO/DESC (-36%), TOTAL s/ desc., TOTAL c/ desc.
  function gerarPdf(jsPDF, { titulo, subtitulo, linhas, produtos }) {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    let totS = 0, totC = 0, qtdT = 0;
    const corpo = linhas.map((l) => {
      const p = produtos.get(Number(l.ref)) || { descricao: '(referência não encontrada)', preco: 0 };
      const s = l.qtd * p.preco, c = s * (1 - DESCONTO);
      totS += s; totC += c; qtdT += l.qtd;
      return [l.ref, p.descricao, l.cor || '', l.qtd, moeda(p.preco), moeda(p.preco * (1 - DESCONTO)), moeda(s), moeda(c)];
    });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text(titulo, 40, 40);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.text(subtitulo, 40, 58);
    doc.autoTable({
      startY: 72, head: [['REF', 'DESCRIÇÃO PRODUTO', 'COR', 'QUANT.', 'PREÇO', 'PREÇO/DESC (-36%)', 'TOTAL S/ DESC.', 'TOTAL C/ DESC.']],
      body: corpo, styles: { fontSize: 8, cellPadding: 3 }, headStyles: { fillColor: [38, 70, 83] },
      columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' } },
      foot: [['', 'TOTAIS (' + linhas.length + ' itens)', '', qtdT, '', '', moeda(totS), moeda(totC)]],
      footStyles: { fillColor: [230, 230, 230], textColor: 20, fontStyle: 'bold', halign: 'right' },
      showFoot: 'lastPage',
    });
    return doc;
  }

  const api = { PRIMEIRA, ULTIMA, CAPACIDADE, DESCONTO, gerarXlsx, gerarPdf, consolidar, moeda };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Exporter = api;
})(typeof window !== 'undefined' ? window : globalThis);
