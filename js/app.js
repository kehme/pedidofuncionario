/* Ke Home - Pedido do Funcionário */
(() => {
  const CFG = window.KEHOME_CONFIG || {};
  const E = window.Exporter;
  const LIMITE = 100, DESC = E.DESCONTO, PAGINAS = 527;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const brl = E.moeda;
  const fmtDt = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
  const toLocalInput = (iso) => { if (!iso) return ''; const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  const MSG = {
    CREDENCIAIS_INVALIDAS: 'Usuário ou senha inválidos.', SESSAO_INVALIDA: 'Sua sessão expirou. Entre novamente.',
    SEM_PERMISSAO: 'Sem permissão.', FORA_PERIODO: 'O pedido funcionário ainda não está disponível, tente novamente dentro do período autorizado.',
    LIMITE_EXCEDIDO: 'O pedido ultrapassa o limite de R$ 100,00.', PEDIDO_FINALIZADO: 'Este pedido já foi finalizado.', PEDIDO_VAZIO: 'Adicione ao menos um item antes de finalizar.',
    REFERENCIA_INVALIDA: 'Referência inválida.', QUANTIDADE_INVALIDA: 'Quantidade inválida.', USUARIO_DUPLICADO: 'Já existe um usuário com esse login.',
    SENHA_OBRIGATORIA: 'Informe uma senha para o novo usuário.', DADOS_INCOMPLETOS: 'Preencha usuário e nome.', PERIODO_INVALIDO: 'A data/hora de término deve ser depois do início.',
    NAO_PODE_EXCLUIR_A_SI_MESMO: 'Você não pode excluir a própria conta.',
  };
  const S = { sess: null, produtos: new Map(), pedido: null, idx: {}, view: 'catalogo', prefill: null,
              adm: { tab: 'pedidos', periodos: [], periodoId: null, pedidos: [], usuarios: [], editU: null }, tpl: null };
  let sb;
  S.pos = null; S.catOnly = false;

  const toast = (m, bad) => { const t = $('#toast'); t.textContent = m; t.className = 'show' + (bad ? ' bad' : ''); clearTimeout(toast.t); toast.t = setTimeout(() => (t.className = ''), 3500); };
  const root = $('#app');

  async function rpc(fn, args = {}, auth = true) {
    const { data, error } = await sb.rpc(fn, auth ? { p_token: S.sess.token, ...args } : args);
    if (error) {
      const code = Object.keys(MSG).find((k) => (error.message || '').includes(k));
      if (code === 'SESSAO_INVALIDA') sair(false);
      throw Object.assign(new Error(code ? MSG[code] : error.message), { code });
    }
    return data;
  }
  const guard = (fn) => async (...a) => { try { return await fn(...a); } catch (e) { if (e.code === 'FORA_PERIODO' && S.sess && !S.sess.is_admin) { S.sess.periodo_aberto = false; S.catOnly = false; render(); } else toast(e.message, true); } };

  function confirmar(titulo, texto, okTxt = 'Confirmar') {
    return new Promise((res) => {
      const m = document.createElement('div'); m.className = 'modal';
      m.innerHTML = `<div class="card"><h2>${esc(titulo)}</h2><p>${texto}</p><div class="actions"><button class="btn sec" data-r="0">Cancelar</button><button class="btn" data-r="1">${esc(okTxt)}</button></div></div>`;
      m.addEventListener('click', (e) => { const b = e.target.closest('[data-r]'); if (b) { m.remove(); res(b.dataset.r === '1'); } });
      document.body.appendChild(m);
    });
  }
  function baixar(blob, nome) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome.replace(/[^\w.\- ]+/g, '_'); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
  const calc = (itens) => { let s = 0; for (const i of itens) { const p = S.produtos.get(i.ref); if (p) s += p.preco * i.qtd; } return { sem: s, com: s * (1 - DESC) }; };

  // ---------------------------------------------------------------- sessão
  function sair(render_ = true) { try { if (S.sess) sb.rpc('app_logout', { p_token: S.sess.token }); } catch (_) {} sessionStorage.removeItem('kh'); S.sess = null; S.pedido = null; S.catOnly = false; S.produtos = new Map(); if (render_) render(); else setTimeout(render, 0); }
  async function entrar(usuario, senha) {
    const r = await rpc('app_login', { p_usuario: usuario, p_senha: senha }, false);
    S.sess = r; sessionStorage.setItem('kh', JSON.stringify(r)); await iniciar();
  }
  async function iniciar() {
    if (S.sess.is_admin) { S.adm.tab = 'pedidos'; await carregarAdmin(); }
    else if (S.sess.periodo_aberto) { await carregarFuncionario(); }
    render();
  }

  // ---------------------------------------------------------------- telas
  function render() {
    if (!CFG.SUPABASE_URL || CFG.SUPABASE_URL.includes('SEU-PROJETO')) { root.innerHTML = '<div class="center"><div class="card"><h2>Configuração pendente</h2><p>Edite <b>js/config.js</b> com a URL e a chave anon do seu projeto Supabase.</p></div></div>'; return; }
    if (!S.sess) return telaLogin();
    if (S.sess.is_admin) return telaAdmin();
    if (!S.sess.periodo_aberto) return S.catOnly ? telaSoCatalogo() : telaBloqueio();
    telaFuncionario();
  }

  function telaLogin() {
    root.innerHTML = `<div class="center"><div class="card"><h1>Ke Home</h1><p class="mut">Pedido mensal do funcionário</p>
      <label for="u">Usuário</label><input id="u" autocomplete="username" autocapitalize="none">
      <label for="s">Senha</label><input id="s" type="password" autocomplete="current-password">
      <p id="le" class="err"></p><button class="btn" id="go" style="width:100%">Entrar</button></div></div>`;
    const go = async () => { $('#le').textContent = ''; $('#go').disabled = true;
      try { await entrar($('#u').value, $('#s').value); } catch (e) { const le = $('#le'); if (le) le.textContent = e.message; } const g = $('#go'); if (g) g.disabled = false; };
    $('#go').onclick = go; root.querySelectorAll('input').forEach((i) => i.addEventListener('keydown', (e) => e.key === 'Enter' && go())); $('#u').focus();
  }

  const topo = (extra = '') => `<div class="top"><b>Ke Home</b><span>${esc(S.sess.nome)}</span><span class="sp"></span>${extra}<button class="btn sec sm" data-a="sair">Sair</button></div>`;

  function telaBloqueio() {
    root.innerHTML = topo() + `<main><div class="card" style="text-align:center;margin-top:3rem"><h2>${esc(MSG.FORA_PERIODO)}</h2>
      ${S.sess.inicio ? `<p class="mut">Período configurado: ${fmtDt(S.sess.inicio)} até ${fmtDt(S.sess.fim)}</p>` : ''}
      <button class="btn" data-a="vercat">Visualizar Catálogo</button></div></main>`;
  }

  // ---------------------------------------------------------------- catálogo somente leitura (fora do período)
  async function abrirSoCatalogo() {
    if (!Object.keys(S.idx).length) S.idx = await fetch('catalogo/index.json').then((r) => r.json()).catch(() => ({}));
    S.catOnly = true; S.view = 'catalogo'; S.pos = null; render(); window.scrollTo(0, 0);
  }
  function telaSoCatalogo() {
    root.innerHTML = `<div class="hd">` + topo(`<button class="btn sec sm" data-a="voltarbloq">Voltar</button>`) + `</div><main id="main"></main>`;
    viewCatalogo();
  }

  // ---------------------------------------------------------------- funcionário
  async function carregarFuncionario() {
    const [prods, ped, idx] = await Promise.all([rpc('app_produtos'), rpc('app_meu_pedido'), fetch('catalogo/index.json').then((r) => r.json()).catch(() => ({}))]);
    S.produtos = new Map(prods.map(([ref, descricao, preco, cx, estoque]) => [ref, { ref, descricao, preco: Number(preco), cx, estoque }]));
    S.pedido = ped; S.idx = idx;
  }

  function telaFuncionario() {
    const tabs = `<div class="tabs"><button data-a="view" data-v="catalogo" class="${S.view === 'catalogo' ? 'on' : ''}">Catálogo</button><button data-a="view" data-v="pedido" class="${S.view === 'pedido' ? 'on' : ''}">Meu pedido</button></div>`;
    const t = calc(S.pedido.itens);
    root.innerHTML = `<div class="hd">` + topo(`<span class="pill ${t.com > LIMITE ? 'over' : ''}">Total c/ desconto: <b>${brl(t.com)}</b> / ${brl(LIMITE)}</span>`) + tabs + `</div><main id="main"></main>`;
    S.view === 'catalogo' ? viewCatalogo() : viewPedido();
  }

  function viewCatalogo() {
    const pages = [];
    for (let n = 1; n <= PAGINAS; n++) pages.push(`<div class="pg" id="pg-${n}" data-a="zoom" data-n="${n}"><small>${n}</small><img loading="lazy" decoding="async" alt="Catálogo, página ${n}" src="catalogo/p${String(n).padStart(3, '0')}.webp"></div>`);
    const ro = S.catOnly && !S.sess.periodo_aberto;   // fora do período: só visualizar
    $('#main').innerHTML = `${ro ? '<div class="warn">O pedido não está disponível no momento. Você pode apenas visualizar o catálogo.</div>' : ''}<div class="card"><label for="q">${ro ? 'Ir para referência ou página' : 'Buscar produto (referência ou nome)'}</label><input id="q" placeholder="${ro ? 'ex.: 88642 ou página 120' : 'ex.: 3010 ou concha'}" autocomplete="off"><div id="hits"></div>
      <p class="mut" style="margin:.5rem 0 0">Role para ver o catálogo. No celular, deslize o dedo para o lado para trocar de página. Toque em uma página para ampliar.</p></div>${pages.join('')}`;
    $('#q').addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase(); const box = $('#hits'); if (q.length < 2 && !(ro && q)) { box.innerHTML = ''; return; }
      if (ro) {   // sem lista de produtos: acha a página pela referência (índice) ou pelo número da página
        const num = parseInt(q.replace(/\D/g, ''), 10), hits = [];
        if (S.idx[num]) hits.push(`<div class="hit"><span>Referência <b>${num}</b> está na página <b>${S.idx[num]}</b></span><button class="btn sec sm" data-a="goto" data-n="${S.idx[num]}">Ver página</button></div>`);
        if (num >= 1 && num <= PAGINAS) hits.push(`<div class="hit"><span>Página <b>${num}</b></span><button class="btn sec sm" data-a="goto" data-n="${num}">Ir</button></div>`);
        box.innerHTML = hits.length ? `<div class="hits">${hits.join('')}</div>` : '<p class="mut">Nada encontrado.</p>'; return;
      }
      const r = []; for (const p of S.produtos.values()) { if (String(p.ref).startsWith(q) || p.descricao.toLowerCase().includes(q)) { r.push(p); if (r.length >= 8) break; } }
      box.innerHTML = r.length ? `<div class="hits">${r.map((p) => `<div class="hit"><span><b>${p.ref}</b> ${esc(p.descricao)}<br><small class="mut">${brl(p.preco * (1 - DESC))} c/ desconto</small></span>
        ${S.idx[p.ref] ? `<button class="btn sec sm" data-a="goto" data-n="${S.idx[p.ref]}">Ver página</button>` : ''}<button class="btn sm" data-a="pedir" data-ref="${p.ref}">Pedir</button></div>`).join('')}</div>` : '<p class="mut">Nada encontrado.</p>';
    });
  }

  function viewPedido() {
    const p = S.pedido, fin = p.status === 'finalizado', t = calc(p.itens), pct = Math.min(100, (t.com / LIMITE) * 100);
    const linhas = p.itens.map((i, k) => { const pr = S.produtos.get(i.ref) || { descricao: '?', preco: 0 }; const un = pr.preco * (1 - DESC);
      return `<tr><td>${i.ref}</td><td>${esc(pr.descricao)}</td><td>${esc(i.cor) || '—'}</td><td class="n">${i.qtd}</td><td class="n">${brl(un)}</td><td class="n">${brl(un * i.qtd)}</td>${fin ? '' : `<td class="n"><button class="btn danger sm" data-a="rm" data-k="${k}">Remover</button></td>`}</tr>`; }).join('');
    $('#main').innerHTML = `
      ${fin ? `<div class="card"><h2 class="ok">Pedido finalizado ✔</h2><p>Finalizado em ${fmtDt(p.finalizado_em)}. Não é mais possível alterá-lo.</p></div>`
            : `<div class="warn">⚠ É necessário o usuário finalizar o pedido, ou o pedido não será enviado.</div>`}
      ${fin ? '' : `<div class="card"><h2>Adicionar item</h2><div class="row">
        <div><label for="ref">Referência</label><input id="ref" inputmode="numeric" autocomplete="off" value="${esc(S.prefill || '')}"></div>
        <div style="flex:2 1 240px"><label for="desc">Descrição</label><input id="desc" readonly placeholder="Preenchida ao informar a referência"></div>
        <div><label for="cor">Cor</label><input id="cor" placeholder="ex.: Azul" maxlength="60"></div>
        <div><label for="qtd">Quantidade</label><input id="qtd" type="number" min="1" step="1" value="1"></div>
        <div class="fix"><button class="btn" data-a="add">Adicionar</button></div></div><p id="hint" class="mut"></p></div>`}
      <div class="card"><h2>Itens do pedido</h2>
        ${p.itens.length ? `<div class="scroll"><table><thead><tr><th>Ref.</th><th>Descrição</th><th>Cor</th><th class="n">Qtd</th><th class="n">Unit. c/ desc.</th><th class="n">Subtotal</th>${fin ? '' : '<th></th>'}</tr></thead><tbody>${linhas}</tbody></table></div>` : '<p class="mut">Nenhum item adicionado.</p>'}
        <div style="margin-top:1rem"><div class="row"><div>Total sem desconto: <b>${brl(t.sem)}</b></div><div class="total ${t.com > LIMITE ? 'over' : ''}">Total com desconto (36%)<br><b>${brl(t.com)}</b></div><div>Saldo restante: <b class="${LIMITE - t.com < 0 ? 'err' : ''}">${brl(Math.max(0, LIMITE - t.com))}</b></div></div>
        <div class="bar ${t.com > LIMITE ? 'over' : ''}"><i style="width:${pct}%"></i></div></div>
        ${fin ? '' : `<div class="actions"><button class="btn" data-a="fin" ${p.itens.length ? '' : 'disabled'}>Finalizar pedido</button></div>`}
      </div>`;
    if (!fin) { const r = $('#ref'); r.addEventListener('input', atualizaRef); atualizaRef(); if (S.prefill) { S.prefill = null; $('#cor').focus(); } }
  }
  function atualizaRef() {
    const raw = $('#ref').value.trim(), ref = parseInt(raw, 10), p = S.produtos.get(ref), h = $('#hint');
    $('#desc').value = p ? p.descricao : (raw ? 'Sem descrição' : '');
    if (p) { h.className = 'mut'; h.textContent = `Preço com desconto: ${brl(p.preco * (1 - DESC))} por unidade${p.estoque ? ' | Estoque: ' + (isNaN(p.estoque) ? p.estoque.toLowerCase() : p.estoque) : ''}`; }
    else if (raw) { h.className = 'warn'; h.textContent = '⚠ Referência sem descrição: este produto está sem saldo (não disponível para pedido).'; }
    else { h.className = 'mut'; h.textContent = ''; }
  }

  const salvarItens = guard(async (itens) => { S.pedido = await rpc('app_salvar_itens', { p_itens: itens }); render(); });
  const addItem = guard(async () => {
    const ref = parseInt($('#ref').value, 10), qtd = parseInt($('#qtd').value, 10), cor = $('#cor').value.trim(), p = S.produtos.get(ref);
    if (!p) return toast($('#ref').value.trim() ? 'Referência sem descrição: produto sem saldo.' : 'Informe a referência.', true);
    if (!(qtd >= 1)) return toast('Informe uma quantidade válida.', true);
    const itens = S.pedido.itens.map((i) => ({ ...i })); const ex = itens.find((i) => i.ref === ref && i.cor.toLowerCase() === cor.toLowerCase());
    if (ex) ex.qtd += qtd; else itens.push({ ref, cor, qtd });
    const t = calc(itens); if (Math.round(t.com * 100) / 100 > LIMITE) return toast(`Limite excedido. Saldo restante: ${brl(LIMITE - calc(S.pedido.itens).com)}`, true);
    await salvarItens(itens);
  });
  const finalizar = guard(async () => {
    if (!(await confirmar('Finalizar pedido?', 'Tem certeza de que deseja <b>finalizar</b> o pedido? Depois de finalizado ele será enviado e <b>não poderá mais ser alterado</b>.', 'Sim, finalizar'))) return;
    S.pedido = await rpc('app_finalizar'); render(); toast('Pedido finalizado com sucesso!');
  });

  // ---------------------------------------------------------------- admin
  async function carregarAdmin() {
    const [per, prods] = await Promise.all([rpc('app_admin_periodos'), rpc('app_produtos')]);
    S.produtos = new Map(prods.map(([ref, descricao, preco, cx, estoque]) => [ref, { ref, descricao, preco: Number(preco), cx, estoque }]));
    S.adm.periodos = per; if (!per.find((p) => p.id === S.adm.periodoId)) S.adm.periodoId = per.length ? per[0].id : null;
    await carregarPedidosAdmin(); S.adm.usuarios = await rpc('app_admin_usuarios');
  }
  async function carregarPedidosAdmin() { S.adm.pedidos = S.adm.periodoId ? await rpc('app_admin_pedidos', { p_periodo: S.adm.periodoId }) : []; }

  function telaAdmin() {
    const A = S.adm, T = [['pedidos', 'Pedidos'], ['planilhas', 'Planilhas'], ['pdf', 'Emitir PDF'], ['usuarios', 'Cadastros'], ['periodo', 'Período']];
    const sel = `<select id="per" style="width:auto;color:#000">${A.periodos.map((p) => `<option value="${p.id}" ${p.id === A.periodoId ? 'selected' : ''}>${fmtDt(p.inicio)} → ${fmtDt(p.fim)}</option>`).join('') || '<option>Nenhum período</option>'}</select>`;
    root.innerHTML = `<div class="hd">` + topo(`<span>Período:</span>${sel}`) + `<div class="tabs">${T.map(([k, n]) => `<button data-a="atab" data-t="${k}" class="${A.tab === k ? 'on' : ''}">${n}</button>`).join('')}</div></div><main id="main"></main>`;
    $('#per').onchange = guard(async (e) => { A.periodoId = Number(e.target.value); await carregarPedidosAdmin(); render(); });
    ({ pedidos: admPedidos, planilhas: admPlanilhas, pdf: admPdf, usuarios: admUsuarios, periodo: admPeriodo })[A.tab]();
  }
  const fins = () => S.adm.pedidos.filter((p) => p.status === 'finalizado');
  const badge = (s) => `<span class="badge ${s === 'finalizado' ? 'f' : 'r'}">${s === 'finalizado' ? 'Finalizado' : 'Em andamento'}</span>`;
  const tabelaItens = (itens) => `<div class="scroll"><table><thead><tr><th>Ref.</th><th>Descrição</th><th>Cor</th><th class="n">Qtd</th><th class="n">Subtotal c/ desc.</th></tr></thead><tbody>${itens.map((i) => { const p = S.produtos.get(i.ref) || { descricao: '?', preco: 0 };
    return `<tr><td>${i.ref}</td><td>${esc(p.descricao)}</td><td>${esc(i.cor) || '—'}</td><td class="n">${i.qtd}</td><td class="n">${brl(p.preco * (1 - DESC) * i.qtd)}</td></tr>`; }).join('')}</tbody></table></div>`;

  function admPedidos() {
    const P = S.adm.pedidos;
    $('#main').innerHTML = `<div class="card"><h2>Pedidos do período</h2><p class="mut">${P.length} pedido(s) | ${fins().length} finalizado(s) | total finalizado: <b>${brl(fins().reduce((s, p) => s + Number(p.total), 0))}</b></p>
      ${P.length ? P.map((p) => `<details class="card"><summary>${esc(p.nome)} <span class="mut">(${esc(p.usuario)})</span> ${badge(p.status)} — ${p.itens.length} item(ns) — ${brl(p.total)}</summary>
        <p class="mut">Finalizado em: ${fmtDt(p.finalizado_em)}</p>${p.itens.length ? tabelaItens(p.itens) : '<p class="mut">Sem itens.</p>'}
        ${p.status === 'finalizado' ? `<div class="actions"><button class="btn sec sm" data-a="reabrir" data-id="${p.id}">Reabrir pedido</button></div>` : ''}</details>`).join('') : '<p class="mut">Nenhum pedido neste período.</p>'}</div>`;
  }

  async function modelo() { if (!S.tpl) S.tpl = await fetch('assets/PLANILHA_DE_PEDIDO.xlsx').then((r) => r.arrayBuffer()); return S.tpl.slice(0); }
  const dataTag = () => { const p = S.adm.periodos.find((x) => x.id === S.adm.periodoId); return p ? new Date(p.inicio).toISOString().slice(0, 7) : 'periodo'; };

  function admPlanilhas() {
    const F = fins();
    $('#main').innerHTML = `<div class="card"><h2>Planilhas dos funcionários</h2><p class="mut">Cada pedido finalizado gera uma cópia da planilha de pedido preenchida (coluna C = referência, coluna F = quantidade; a cor vai na coluna AG).</p>
      ${F.length ? `<div class="scroll"><table><thead><tr><th>Funcionário</th><th>Finalizado em</th><th class="n">Itens</th><th class="n">Total c/ desc.</th><th></th></tr></thead><tbody>${F.map((p) => `<tr><td>${esc(p.nome)}</td><td>${fmtDt(p.finalizado_em)}</td><td class="n">${p.itens.length}</td><td class="n">${brl(p.total)}</td>
        <td class="n"><button class="btn sm" data-a="xlsx1" data-id="${p.id}">Baixar planilha (.xlsx)</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="mut">Nenhum pedido finalizado neste período.</p>'}</div>`;
  }
  const xlsxUm = guard(async (id) => {
    const p = S.adm.pedidos.find((x) => x.id === Number(id)); toast('Gerando planilha…');
    const buf = await E.gerarXlsx(ExcelJS, await modelo(), { cliente: p.nome, linhas: p.itens });
    baixar(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Pedido_${p.nome}_${dataTag()}.xlsx`);
  });

  function admPdf() {
    const L = E.consolidar(fins()), tot = L.reduce((s, l) => s + l.qtd * (S.produtos.get(l.ref)?.preco || 0), 0);
    $('#main').innerHTML = `<div class="card"><h2>Emitir pedido (PDF)</h2><p>Gera um PDF com o pedido de <b>cada funcionário em páginas separadas</b> (nome, referência, descrição, cor, quantidade, preços e totais) e um resumo geral no final. Pedidos finalizados no período: <b>${fins().length}</b> | total com desconto: <b>${brl(tot * (1 - DESC))}</b>.</p>
      <div class="actions" style="justify-content:flex-start"><button class="btn" data-a="pdf" ${L.length ? '' : 'disabled'}>Gerar PDF</button><button class="btn sec" data-a="xlsxAll" ${L.length ? '' : 'disabled'}>Baixar planilha preenchida única (.xlsx)</button></div>
      ${L.length > E.CAPACIDADE ? `<p class="mut">A planilha comporta ${E.CAPACIDADE} linhas; serão geradas ${Math.ceil(L.length / E.CAPACIDADE)} planilhas (partes).</p>` : ''}</div>`;
  }
  const emitirPdf = guard(async () => {
    const per = S.adm.periodos.find((p) => p.id === S.adm.periodoId);
    const pedidos = fins().map((p) => ({ nome: p.nome, usuario: p.usuario, finalizadoTxt: fmtDt(p.finalizado_em), itens: [...p.itens].sort((x, y) => x.ref - y.ref || (x.cor || '').localeCompare(y.cor || '')) }));
    const doc = E.gerarPdf(window.jspdf.jsPDF, { titulo: 'Ke Home - Pedido de funcionarios', subtitulo: `Periodo: ${fmtDt(per?.inicio)} a ${fmtDt(per?.fim)} | ${pedidos.length} pedido(s) | emitido em ${fmtDt(new Date())}`, pedidos, produtos: S.produtos });
    doc.save(`Pedido_funcionarios_${dataTag()}.pdf`);
  });
  const xlsxTodos = guard(async () => {
    const L = E.consolidar(fins()); toast('Gerando planilha(s)…');
    for (let i = 0, n = 1; i < L.length; i += E.CAPACIDADE, n++) {
      const buf = await E.gerarXlsx(ExcelJS, await modelo(), { cliente: 'PEDIDO FUNCIONÁRIOS', linhas: L.slice(i, i + E.CAPACIDADE) });
      baixar(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Pedido_funcionarios_${dataTag()}_parte${n}.xlsx`);
    }
  });

  function admUsuarios() {
    const u = S.adm.editU || { usuario: '', nome: '', is_admin: false, ativo: true };
    $('#main').innerHTML = `<div class="card"><h2>${u.id ? 'Editar conta' : 'Nova conta'}</h2><div class="row">
      <div><label>Usuário (login)</label><input id="uu" value="${esc(u.usuario)}" autocapitalize="none"></div><div><label>Nome do funcionário</label><input id="un" value="${esc(u.nome)}"></div>
      <div><label>Senha ${u.id ? '(vazio = manter)' : ''}</label><input id="us" type="text" autocomplete="off"></div></div>
      <div class="row" style="margin-top:.5rem"><label style="font-weight:400"><input type="checkbox" id="ua" style="width:auto" ${u.ativo ? 'checked' : ''}> Ativo</label><label style="font-weight:400"><input type="checkbox" id="uadm" style="width:auto" ${u.is_admin ? 'checked' : ''}> Administrador</label></div>
      <div class="actions"><button class="btn" data-a="usave">Salvar</button>${u.id ? '<button class="btn sec" data-a="ucancel">Cancelar</button>' : ''}</div></div>
      <div class="card"><h2>Contas</h2><div class="scroll"><table><thead><tr><th>Usuário</th><th>Nome</th><th>Perfil</th><th>Situação</th><th></th></tr></thead><tbody>${S.adm.usuarios.map((x) => `<tr><td>${esc(x.usuario)}</td><td>${esc(x.nome)}</td><td>${x.is_admin ? 'Admin' : 'Funcionário'}</td><td>${x.ativo ? 'Ativo' : 'Inativo'}</td>
      <td class="n"><button class="btn sec sm" data-a="uedit" data-id="${x.id}">Editar</button> <button class="btn danger sm" data-a="udel" data-id="${x.id}">Excluir</button></td></tr>`).join('')}</tbody></table></div></div>`;
  }
  const salvarUsuario = guard(async () => {
    const u = S.adm.editU;
    await rpc('app_admin_usuario_salvar', { p_id: u?.id || null, p_usuario: $('#uu').value, p_nome: $('#un').value, p_senha: $('#us').value, p_ativo: $('#ua').checked, p_admin: $('#uadm').checked });
    S.adm.editU = null; S.adm.usuarios = await rpc('app_admin_usuarios'); render(); toast('Conta salva.');
  });

  function admPeriodo() {
    const cur = S.adm.periodos.find((p) => p.id === S.adm.periodoId), agora = new Date(), aberto = cur && agora >= new Date(cur.inicio) && agora <= new Date(cur.fim);
    $('#main').innerHTML = `<div class="card"><h2>Período de pedidos</h2><p>${cur ? `Período vigente: <b>${fmtDt(cur.inicio)}</b> até <b>${fmtDt(cur.fim)}</b> — ${S.adm.periodos[0].id === cur.id ? (aberto ? '<span class="ok">ABERTO agora</span>' : '<span class="err">FECHADO agora</span>') : '(período antigo)'}` : 'Nenhum período definido: os funcionários não conseguem pedir.'}</p>
      <div class="row"><div><label>Início (data e hora)</label><input id="pi" type="datetime-local" value="${toLocalInput(cur?.inicio)}"></div><div><label>Término (data e hora)</label><input id="pf" type="datetime-local" value="${toLocalInput(cur?.fim)}"></div></div>
      <div class="actions" style="justify-content:flex-start">${cur ? '<button class="btn" data-a="psave" data-m="upd">Atualizar período selecionado</button>' : ''}<button class="btn sec" data-a="psave" data-m="new">Criar novo período</button>${cur ? `<button class="btn danger" data-a="pdel" data-id="${cur.id}">Excluir período selecionado</button>` : ''}</div>
      <p class="mut">O pedido liberado é sempre o do período mais recente. Criar um novo período libera um novo pedido (limite de R$ 100,00) para cada funcionário. Horários no fuso do seu navegador.</p></div>
      <div class="card"><h2>Períodos cadastrados</h2>${S.adm.periodos.length ? `<div class="scroll"><table><thead><tr><th>Início</th><th>Término</th><th>Situação</th><th></th></tr></thead><tbody>${S.adm.periodos.map((p, k) => { const ini = new Date(p.inicio), fim = new Date(p.fim), st = agora < ini ? 'Futuro' : agora > fim ? 'Encerrado' : 'Aberto';
        return `<tr><td>${fmtDt(p.inicio)}</td><td>${fmtDt(p.fim)}</td><td>${st}${k === 0 ? ' (vigente)' : ''}${p.id === S.adm.periodoId ? ' | selecionado' : ''}</td><td class="n"><button class="btn danger sm" data-a="pdel" data-id="${p.id}">Excluir</button></td></tr>`; }).join('')}</tbody></table></div>` : '<p class="mut">Nenhum período cadastrado.</p>'}</div>`;
  }
  const salvarPeriodo = guard(async (modo) => {
    const i = $('#pi').value, f = $('#pf').value; if (!i || !f) return toast('Informe início e término.', true);
    const r = await rpc('app_admin_periodo_salvar', { p_id: modo === 'upd' ? S.adm.periodoId : null, p_inicio: new Date(i).toISOString(), p_fim: new Date(f).toISOString() });
    S.adm.periodoId = r.id; await carregarAdmin(); render(); toast('Período salvo.');
  });

  // ---------------------------------------------------------------- navegação do catálogo
  const alturaCab = () => { const h = $('.hd'); return h ? h.offsetHeight : 0; };
  // página do catálogo que está no topo da tela (0 = ainda acima das páginas)
  function paginaAtual() {
    const lim = alturaCab() + 30; let cur = 0;
    for (const el of document.querySelectorAll('.pg')) { if (el.getBoundingClientRect().top <= lim) cur = Number(el.dataset.n); else break; }
    return cur;
  }
  function irPagina(n, suave = true) {
    n = Math.max(1, Math.min(PAGINAS, n)); const el = $('#pg-' + n); if (!el) return;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - alturaCab() - 8, behavior: suave ? 'smooth' : 'auto' });
  }
  // guarda em que ponto do catálogo o usuário parou (página + fração já rolada dela)
  function salvarPosicao() {
    const n = paginaAtual();
    if (!n) { S.pos = { y: window.scrollY }; return; }
    const r = $('#pg-' + n).getBoundingClientRect();
    S.pos = { n, frac: (alturaCab() + 8 - r.top) / r.height };
  }
  function restaurarPosicao() {
    const p = S.pos; if (!p) return window.scrollTo(0, 0);
    if (p.n) { const el = $('#pg-' + p.n), r = el.getBoundingClientRect(); window.scrollTo(0, r.top + window.scrollY + p.frac * r.height - alturaCab() - 8); }
    else window.scrollTo(0, p.y || 0);
  }
  function setView(v) {
    if (v === S.view) return;
    if (S.view === 'catalogo') salvarPosicao();
    S.view = v; render();
    if (v === 'catalogo') restaurarPosicao(); else window.scrollTo(0, 0);
  }

  // Deslizar para o lado (celular) troca de página do catálogo
  let toque = null;
  document.addEventListener('touchstart', (e) => {
    toque = null;
    if (e.touches.length !== 1 || !S.sess || S.sess.is_admin || S.view !== 'catalogo' || document.querySelector('.modal')) return;
    if (e.target.closest('input,button,.hits')) return;
    if (window.visualViewport && window.visualViewport.scale > 1.02) return;       // página com zoom (pinça): não interfere
    const t = e.touches[0];
    if (t.clientX < 24 || t.clientX > window.innerWidth - 24) return;               // bordas: gestos do sistema (voltar)
    toque = { x: t.clientX, y: t.clientY, t: Date.now() };
  }, { passive: true });
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) toque = null; }, { passive: true });
  document.addEventListener('touchcancel', () => { toque = null; }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (!toque) return; const t = e.changedTouches[0], dx = t.clientX - toque.x, dy = t.clientY - toque.y, dt = Date.now() - toque.t; toque = null;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.8 || dt > 700) return;  // só gesto horizontal, firme e rápido
    irPagina(paginaAtual() + (dx < 0 ? 1 : -1));
  }, { passive: true });

  // ---------------------------------------------------------------- períodos (excluir)
  const excluirPeriodo = guard(async (id) => {
    const p = S.adm.periodos.find((x) => x.id === Number(id)); if (!p) return;
    if (!(await confirmar('Excluir período?', `O período <b>${fmtDt(p.inicio)} → ${fmtDt(p.fim)}</b> e <b>todos os pedidos</b> feitos nele (finalizados ou não) serão apagados definitivamente. Não é possível desfazer.`, 'Excluir'))) return;
    await rpc('app_admin_periodo_excluir', { p_id: Number(id) });
    if (S.adm.periodoId === Number(id)) S.adm.periodoId = null;
    await carregarAdmin(); render(); toast('Período excluído.');
  });

  // ---------------------------------------------------------------- eventos
  document.addEventListener('click', guard(async (e) => {
    const b = e.target.closest('[data-a]'); if (!b) return; const d = b.dataset;
    switch (d.a) {
      case 'sair': return sair();
      case 'vercat': return abrirSoCatalogo();
      case 'voltarbloq': S.catOnly = false; return render();
      case 'recheck': { const r = await rpc('app_sessao'); S.sess = { ...S.sess, ...r }; sessionStorage.setItem('kh', JSON.stringify(S.sess)); await iniciar(); return; }
      case 'view': return setView(d.v);
      case 'goto': return irPagina(Number(d.n));
      case 'zoom': { const m = document.createElement('div'); m.className = 'modal zoom'; m.innerHTML = `<img src="catalogo/p${String(d.n).padStart(3, '0')}.webp" alt="">`; m.onclick = () => m.remove(); document.body.appendChild(m); return; }
      case 'pedir': S.prefill = d.ref; return setView('pedido');
      case 'add': return addItem();
      case 'rm': return salvarItens(S.pedido.itens.filter((_, k) => k !== Number(d.k)));
      case 'fin': return finalizar();
      case 'atab': S.adm.tab = d.t; return render();
      case 'reabrir': if (await confirmar('Reabrir pedido?', 'O funcionário poderá editar e finalizar novamente (dentro do período).', 'Reabrir')) { await rpc('app_admin_reabrir', { p_pedido: Number(d.id) }); await carregarPedidosAdmin(); render(); } return;
      case 'xlsx1': return xlsxUm(d.id);
      case 'pdf': return emitirPdf();
      case 'xlsxAll': return xlsxTodos();
      case 'uedit': S.adm.editU = S.adm.usuarios.find((x) => x.id === d.id); return render();
      case 'ucancel': S.adm.editU = null; return render();
      case 'usave': return salvarUsuario();
      case 'udel': if (await confirmar('Excluir conta?', 'A conta e os pedidos dela serão apagados. Para apenas bloquear o acesso, use "Editar" e desmarque "Ativo".', 'Excluir')) { await rpc('app_admin_usuario_excluir', { p_id: d.id }); S.adm.usuarios = await rpc('app_admin_usuarios'); await carregarPedidosAdmin(); render(); } return;
      case 'psave': return salvarPeriodo(d.m);
      case 'pdel': return excluirPeriodo(d.id);
    }
  }));

  // ---------------------------------------------------------------- start
  (async function start() {
    if (CFG.SUPABASE_URL && !CFG.SUPABASE_URL.includes('SEU-PROJETO')) sb = supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const saved = sessionStorage.getItem('kh');
    if (saved && sb) { try { S.sess = JSON.parse(saved); const r = await rpc('app_sessao'); S.sess = { ...S.sess, ...r }; await iniciar(); return; } catch (_) { S.sess = null; } }
    render();
  })();
})();
