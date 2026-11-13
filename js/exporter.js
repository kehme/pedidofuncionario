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

  // PDF: uma seção (página/s) por funcionário, com nome, mesmas colunas da planilha + COR, e um resumo geral no fim.
  // pedidos = [{nome, usuario, finalizadoTxt, itens:[{ref, cor, qtd}]}]
  function gerarPdf(jsPDF, { titulo, subtitulo, pedidos, produtos }) {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const num = { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' } };
    const resumo = []; let gS = 0, gC = 0, gQ = 0, gL = 0;
    pedidos.forEach((p, k) => {
      if (k > 0) doc.addPage();
      let totS = 0, totC = 0, qtdT = 0;
      const corpo = p.itens.map((l) => {
        const pr = produtos.get(Number(l.ref)) || { descricao: '(referência não encontrada)', preco: 0 };
        const s = l.qtd * pr.preco, c = s * (1 - DESCONTO);
        totS += s; totC += c; qtdT += l.qtd;
        return [l.ref, pr.descricao, l.cor || '', l.qtd, moeda(pr.preco), moeda(pr.preco * (1 - DESCONTO)), moeda(s), moeda(c)];
      });
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text(titulo, 40, 34);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(subtitulo, 40, 48);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text('Funcionário: ' + p.nome, 40, 76);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.text('Login: ' + p.usuario + '   |   Pedido finalizado em: ' + (p.finalizadoTxt || '-'), 40, 92);
      doc.autoTable({
        startY: 104, head: [['REF', 'DESCRIÇÃO PRODUTO', 'COR', 'QUANT.', 'PREÇO', 'PREÇO/DESC (-36%)', 'TOTAL S/ DESC.', 'TOTAL C/ DESC.']],
        body: corpo, styles: { fontSize: 9, cellPadding: 3 }, headStyles: { fillColor: [0, 0, 0] }, columnStyles: num,
        foot: [['', 'TOTAL DE ' + p.nome.toUpperCase() + ' (' + p.itens.length + ' itens)', '', qtdT, '', '', moeda(totS), moeda(totC)]],
        footStyles: { fillColor: [230, 230, 230], textColor: 20, fontStyle: 'bold', halign: 'right' }, showFoot: 'lastPage',
      });
      resumo.push([p.nome, p.itens.length, qtdT, moeda(totS), moeda(totC)]);
      gS += totS; gC += totC; gQ += qtdT; gL += p.itens.length;
    });
    // resumo geral
    doc.addPage();
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text('Resumo geral', 40, 76);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(subtitulo, 40, 48);
    doc.autoTable({
      startY: 92, head: [['FUNCIONÁRIO', 'ITENS', 'UNIDADES', 'TOTAL S/ DESC.', 'TOTAL C/ DESC.']], body: resumo,
      styles: { fontSize: 10, cellPadding: 4 }, headStyles: { fillColor: [0, 0, 0] },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
      foot: [['TOTAL GERAL (' + pedidos.length + ' funcionários)', gL, gQ, moeda(gS), moeda(gC)]],
      footStyles: { fillColor: [230, 230, 230], textColor: 20, fontStyle: 'bold', halign: 'right' }, showFoot: 'lastPage',
    });
    const n = doc.getNumberOfPages(), w = doc.internal.pageSize.getWidth(), h = doc.internal.pageSize.getHeight();
    for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(110); doc.text('Página ' + i + ' de ' + n, w - 40, h - 20, { align: 'right' }); }
    return doc;
  }

  const api = { PRIMEIRA, ULTIMA, CAPACIDADE, DESCONTO, gerarXlsx, gerarPdf, consolidar, moeda };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Exporter = api;
})(typeof window !== 'undefined' ? window : globalThis);
