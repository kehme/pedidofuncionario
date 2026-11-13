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
    FINALIZAR_SOMENTE_NO_PERIODO: 'Só é possível finalizar o pedido dentro do período autorizado.', USUARIO_JA_TEM_RASCUNHO: 'Este funcionário já começou o pedido do próximo período; não é possível reabrir este.',
    NAO_PODE_EXCLUIR_A_SI_MESMO: 'Você não pode excluir a própria conta.',
  };
  const S = { sess: null, produtos: new Map(), pedido: null, idx: {}, view: 'catalogo', prefill: null,
              adm: { tab: 'pedidos', periodos: [], periodoId: null, pedidos: [], usuarios: [], editU: null }, tpl: null };
  let sb;
  S.pos = null; S.catOnly = false; S.poll = null;

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
  const guard = (fn) => async (...a) => { try { return await fn(...a); } catch (e) { if (e.code === 'FORA_PERIODO' && S.sess && !S.sess.is_admin) { S.sess.periodo_aberto = false; S.catOnly = false; render(); } else if (e.code === 'FINALIZAR_SOMENTE_NO_PERIODO' && S.sess) { S.sess.periodo_aberto = false; S.catOnly = true; render(); toast(e.message, true); } else toast(e.message, true); } };

  const svg = (p) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const IC = {
    out: svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>'),
    book: svg('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>'),
    bag: svg('<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>'),
    search: svg('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>'),
    x: svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
    trash: svg('<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'),
    plus: svg('<path d="M5 12h14"/><path d="M12 5v14"/>'),
    minus: svg('<path d="M5 12h14"/>'),
    prev: svg('<path d="m15 18-6-6 6-6"/>'),
    next: svg('<path d="m9 18 6-6-6-6"/>'),
  };
  const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const abrirModal = (m) => { document.body.appendChild(m); document.body.classList.add('lock'); };
  const fecharModal = (m) => { m.remove(); if (!document.querySelector('.modal')) document.body.classList.remove('lock'); };
  const fecharModais = () => document.querySelectorAll('.modal').forEach(fecharModal);

  function confirmar(titulo, texto, okTxt = 'Confirmar') {
    return new Promise((res) => {
      const m = document.createElement('div'); m.className = 'modal';
      m.innerHTML = `<div class="card" role="dialog" aria-modal="true"><h2>${esc(titulo)}</h2><p>${texto}</p><div class="actions"><button class="btn sec" data-r="0">Cancelar</button><button class="btn" data-r="1">${esc(okTxt)}</button></div></div>`;
      m.addEventListener('click', (e) => { const b = e.target.closest('[data-r]'); if (b) { fecharModal(m); res(b.dataset.r === '1'); } else if (e.target === m) { fecharModal(m); res(false); } });
      abrirModal(m);
    });
  }
  function baixar(blob, nome) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome.replace(/[^\w.\- ]+/g, '_'); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
  const calc = (itens) => { let s = 0; for (const i of itens) { const p = S.produtos.get(i.ref); if (p) s += p.preco * i.qtd; } return { sem: s, com: s * (1 - DESC) }; };

  // ---------------------------------------------------------------- sessão
  function sair(render_ = true) { try { if (S.sess) sb.rpc('app_logout', { p_token: S.sess.token }); } catch (_) {} sessionStorage.removeItem('kh'); S.sess = null; S.pedido = null; S.catOnly = false; clearInterval(S.poll); S.poll = null; S.produtos = new Map(); if (render_) render(); else setTimeout(render, 0); }
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
    root.className = '';
    if (!CFG.SUPABASE_URL || CFG.SUPABASE_URL.includes('SEU-PROJETO')) { root.innerHTML = '<div class="center"><div class="card"><h2>Configuração pendente</h2><p>Edite <b>js/config.js</b> com a URL e a chave anon do seu projeto Supabase.</p></div></div>'; return; }
    if (!S.sess) return telaLogin();
    if (S.sess.is_admin) return telaAdmin();
    if (!S.sess.periodo_aberto && !S.catOnly) return telaBloqueio();
    telaFuncionario();
  }

  function telaLogin() {
    root.innerHTML = `<div class="center"><div class="card"><h1 class="logo">ke<span>home</span></h1><p class="mut">Pedido mensal do funcionário</p>
      <label for="u">Usuário</label><input id="u" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="next">
      <label for="s">Senha</label><input id="s" type="password" autocomplete="current-password" enterkeyhint="go">
      <p id="le" class="err" role="alert"></p><button class="btn block" id="go">Entrar</button></div></div>`;
    const go = async () => { $('#le').textContent = ''; $('#go').disabled = true;
      try { await entrar($('#u').value, $('#s').value); } catch (e) { const le = $('#le'); if (le) le.textContent = e.message; } const g = $('#go'); if (g) g.disabled = false; };
    $('#go').onclick = go; root.querySelectorAll('input').forEach((i) => i.addEventListener('keydown', (e) => e.key === 'Enter' && go()));
    if (!matchMedia('(pointer:coarse)').matches) $('#u').focus();   // no celular não abre o teclado sozinho
  }

  const topo = (extra = '', below = '') => `<div class="top"><div class="idn"><b class="brand">ke<span>home</span></b><small>${esc(S.sess.nome)}</small></div>${extra}<button class="ibtn" data-a="sair" aria-label="Sair">${IC.out}</button></div>${below}`;

  function telaBloqueio() {
    root.innerHTML = topo() + `<main><div class="card" style="text-align:center;margin-top:3rem"><h2>${esc(MSG.FORA_PERIODO)}</h2>
      ${S.sess.inicio ? `<p class="mut">Período configurado: ${fmtDt(S.sess.inicio)} até ${fmtDt(S.sess.fim)}</p>` : ''}
      <p class="mut">Enquanto isso, você pode ver o catálogo e já ir escolhendo os itens do seu pedido. A finalização só é liberada dentro do período autorizado.</p>
      <button class="btn" data-a="vercat">Visualizar Catálogo</button></div></main>`;
  }

  // ---------------------------------------------------------------- fora do período: catálogo + pedido adiantado
  async function abrirAdiantado() {
    const r = await rpc('app_sessao'); S.sess = { ...S.sess, ...r }; sessionStorage.setItem('kh', JSON.stringify(S.sess));   // o período pode ter aberto nesse meio tempo
    await carregarFuncionario(); S.catOnly = true; S.view = 'catalogo'; S.pos = null; render(); window.scrollTo(0, 0);
  }
  const avisoPeriodo = () => {
    if (S.sess.periodo_aberto) return '';
    const futuro = S.sess.inicio && new Date(S.sess.inicio) > new Date();
    return `<div class="warn">O período de pedidos não está aberto. Você já pode escolher os itens do seu pedido, mas só será possível <u>finalizá-lo</u> dentro do período autorizado${futuro ? ` (${fmtDt(S.sess.inicio)} até ${fmtDt(S.sess.fim)})` : ''}.</div>`;
  };
  // enquanto o período não abre, confere de tempos em tempos para liberar o botão de finalizar
  function vigiarPeriodo() {
    if (S.sess.periodo_aberto) { clearInterval(S.poll); S.poll = null; return; }
    if (S.poll) return;
    S.poll = setInterval(async () => {
      try {
        if (!S.sess) return clearInterval(S.poll);
        const r = await rpc('app_sessao'); S.sess = { ...S.sess, ...r };
        if (r.periodo_aberto) {
          clearInterval(S.poll); S.poll = null; const cat = S.view === 'catalogo'; if (cat) salvarPosicao();
          render(); if (cat) restaurarPosicao(); toast('O período de pedidos abriu! Agora já é possível finalizar o pedido.');
        }
      } catch (_) {}
    }, 30000);
  }

  // ---------------------------------------------------------------- funcionário
  async function carregarFuncionario() {
    const [prods, ped, idx] = await Promise.all([rpc('app_produtos'), rpc('app_meu_pedido'), fetch('catalogo/index.json').then((r) => r.json()).catch(() => ({}))]);
    S.produtos = new Map(prods.map(([ref, descricao, preco, cx, estoque]) => [ref, { ref, descricao, preco: Number(preco), cx, estoque }]));
    S.pedido = ped; S.idx = idx;
  }

  function telaFuncionario() {
    const t = calc(S.pedido.itens), over = t.com > LIMITE, pct = Math.min(100, (t.com / LIMITE) * 100), n = S.pedido.itens.length;
    const tot = `<div class="tot ${over ? 'over' : ''}"><b>${brl(t.com)}</b><small>de ${brl(LIMITE)} com desconto</small></div>`;
    const meter = `<div class="meter ${over ? 'over' : ''}" role="progressbar" aria-label="Limite do pedido" aria-valuemin="0" aria-valuemax="${LIMITE}" aria-valuenow="${t.com.toFixed(2)}"><i style="width:${pct}%"></i></div>`;
    const nav = `<nav class="bn" aria-label="Seções"><button data-a="view" data-v="catalogo" class="${S.view === 'catalogo' ? 'on' : ''}">${IC.book}<span>Catálogo</span></button><button data-a="view" data-v="pedido" class="${S.view === 'pedido' ? 'on' : ''}">${IC.bag}<span>Meu pedido</span>${n ? `<em>${n}</em>` : ''}</button></nav>`;
    root.innerHTML = `<div class="hd">${topo(tot, meter)}</div><main id="main"></main>${nav}`;
    root.className = 'withnav';
    S.view === 'catalogo' ? viewCatalogo() : viewPedido();
    vigiarPeriodo();
  }

  function viewCatalogo() {
    const pages = [];
    for (let n = 1; n <= PAGINAS; n++) pages.push(`<div class="pg" id="pg-${n}" data-a="zoom" data-n="${n}"><small>${n}</small><img loading="lazy" decoding="async" alt="Catálogo, página ${n}" src="catalogo/p${String(n).padStart(3, '0')}.webp"></div>`);
    $('#main').className = 'cat';
    $('#main').innerHTML = `${avisoPeriodo()}<p class="tip">Deslize para o lado para trocar de página. Toque na página para ampliar.</p>${pages.join('')}`;
    root.insertAdjacentHTML('beforeend', `<button class="chip" id="chip" data-a="busca" aria-label="Buscar produto ou ir para uma página">1 / ${PAGINAS}</button><button class="fab" data-a="busca">${IC.search}<span>Buscar</span></button>`);
  }

  const stepper = (k, q) => `<div class="step"><button data-a="dec" data-k="${k}" aria-label="Diminuir quantidade" ${q <= 1 ? 'disabled' : ''}>${IC.minus}</button><b>${q}</b><button data-a="inc" data-k="${k}" aria-label="Aumentar quantidade">${IC.plus}</button></div>`;

  function viewPedido() {
    const p = S.pedido, fin = p.status === 'finalizado', t = calc(p.itens), n = p.itens.length, aberto = S.sess.periodo_aberto;
    const lista = p.itens.map((i, k) => { const pr = S.produtos.get(i.ref) || { descricao: '?', preco: 0 }; const un = pr.preco * (1 - DESC);
      return `<li class="it"><div class="ih"><span class="ref">${i.ref}</span><div class="idesc"><b>${esc(pr.descricao)}</b>${i.cor ? `<span class="cor">${esc(i.cor)}</span>` : ''}</div>${fin ? '' : `<button class="ibtn" data-a="rm" data-k="${k}" aria-label="Remover ${esc(pr.descricao)}">${IC.trash}</button>`}</div>
        <div class="if">${fin ? `<span>Qtd <b>${i.qtd}</b></span>` : stepper(k, i.qtd)}<span class="un">${brl(un)} un.</span><b class="sub">${brl(un * i.qtd)}</b></div></li>`; }).join('');
    $('#main').className = '';
    $('#main').innerHTML = `
      ${avisoPeriodo()}${fin ? `<div class="card"><h2 class="ok">Pedido finalizado ✔</h2><p>Finalizado em ${fmtDt(p.finalizado_em)}. Não é mais possível alterá-lo.</p></div>`
            : `<div class="warn">⚠ É necessário o usuário finalizar o pedido, ou o pedido não será enviado.</div>`}
      ${fin ? '' : `<div class="card add"><h2>Adicionar item</h2>
        <div class="f2"><div><label for="ref">Referência</label><input id="ref" inputmode="numeric" pattern="[0-9]*" autocomplete="off" enterkeyhint="next" value="${esc(S.prefill || '')}"></div>
          <div><label for="qtd">Quantidade</label><div class="qs"><button data-a="qm" aria-label="Diminuir">${IC.minus}</button><input id="qtd" type="number" inputmode="numeric" min="1" step="1" value="1"><button data-a="qp" aria-label="Aumentar">${IC.plus}</button></div></div></div>
        <div id="prod" class="prod" aria-live="polite"></div>
        <label for="cor">Cor</label><input id="cor" placeholder="ex.: Azul" maxlength="60" autocomplete="off" enterkeyhint="done">
        <button class="btn block" data-a="add">Adicionar ao pedido</button></div>`}
      <div class="card"><h2>Itens do pedido${n ? ` <span class="mut">(${n})</span>` : ''}</h2>
        ${n ? `<ul class="items">${lista}</ul>` : '<p class="mut">Nenhum item adicionado. Escolha produtos no catálogo ou digite a referência acima.</p>'}
        <div class="sum"><div><span>Total sem desconto</span><b>${brl(t.sem)}</b></div><div><span>Total com desconto (${Math.round(DESC * 100)}%)</span><b>${brl(t.com)}</b></div><div><span>Saldo restante</span><b class="${LIMITE - t.com < 0 ? 'err' : ''}">${brl(Math.max(0, LIMITE - t.com))}</b></div></div>
      </div>
      ${fin ? '' : `<div class="dock">${aberto ? '' : '<p class="nopen">Finalização disponível somente no período autorizado.</p>'}<div class="dr"><div class="dl"><span>Total c/ desconto</span><b>${brl(t.com)}</b></div><button class="btn" data-a="fin" ${n && aberto ? '' : 'disabled'}>Finalizar pedido</button></div></div>`}`;
    if (!fin) {
      $('#ref').addEventListener('input', atualizaRef); atualizaRef();
      ['#cor', '#qtd'].forEach((s) => $(s).addEventListener('keydown', (e) => e.key === 'Enter' && addItem()));
      if (S.prefill) { S.prefill = null; $('#cor').focus(); }
    }
  }
  function atualizaRef() {
    const raw = $('#ref').value.trim(), ref = parseInt(raw, 10), p = S.produtos.get(ref), h = $('#prod');
    if (p) { h.className = 'prod ok'; h.innerHTML = `<b>${esc(p.descricao)}</b><span>${brl(p.preco * (1 - DESC))} por unidade c/ desconto${p.estoque ? ' | Estoque: ' + esc(isNaN(p.estoque) ? String(p.estoque).toLowerCase() : p.estoque) : ''}</span>`; }
    else if (raw) { h.className = 'prod no'; h.textContent = '⚠ Referência sem descrição: este produto está sem saldo (não disponível para pedido).'; }
    else { h.className = 'prod'; h.innerHTML = '<span class="mut">Informe a referência para ver a descrição e o preço.</span>'; }
  }

  const salvarItens = guard(async (itens) => { S.pedido = await rpc('app_salvar_itens', { p_itens: itens }); render(); });
  const addItem = guard(async () => {
    const ref = parseInt($('#ref').value, 10), qtd = parseInt($('#qtd').value, 10), cor = $('#cor').value.trim(), p = S.produtos.get(ref);
    if (!p) return toast($('#ref').value.trim() ? 'Referência sem descrição: produto sem saldo.' : 'Informe a referência.', true);
    if (!(qtd >= 1)) return toast('Informe uma quantidade válida.', true);
    const itens = S.pedido.itens.map((i) => ({ ...i })); const ex = itens.find((i) => i.ref === ref && i.cor.toLowerCase() === cor.toLowerCase());
    if (ex) ex.qtd += qtd; else itens.push({ ref, cor, qtd });
    const t = calc(itens); if (Math.round(t.com * 100) / 100 > LIMITE) return toast(`Limite excedido. Saldo restante: ${brl(LIMITE - calc(S.pedido.itens).com)}`, true);
    await salvarItens(itens); toast('Item adicionado.');
  });
  // + / − na lista do pedido (uma alteração por vez, para não perder toques rápidos)
  const mudarQtd = guard(async (k, delta) => {
    if (S.busy) return; S.busy = true;
    try {
      const itens = S.pedido.itens.map((i) => ({ ...i })), it = itens[k]; if (!it || it.qtd + delta < 1) return;
      it.qtd += delta;
      if (delta > 0 && Math.round(calc(itens).com * 100) / 100 > LIMITE) return toast(`Limite excedido. Saldo restante: ${brl(LIMITE - calc(S.pedido.itens).com)}`, true);
      await salvarItens(itens);
    } finally { S.busy = false; }
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
    const sel = `<select id="per" aria-label="Período">${A.periodos.map((p) => `<option value="${p.id}" ${p.id === A.periodoId ? 'selected' : ''}>${fmtDt(p.inicio)} → ${fmtDt(p.fim)}</option>`).join('') || '<option>Nenhum período</option>'}</select>`;
    root.innerHTML = `<div class="hd">` + topo('', `<div class="per">${sel}</div>`) + `<div class="tabs">${T.map(([k, n]) => `<button data-a="atab" data-t="${k}" class="${A.tab === k ? 'on' : ''}">${n}</button>`).join('')}</div></div><main id="main"></main>`;
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
    const a = $('#pg-1'), b = $('#pg-2'); if (!a || !b) return 0;
    const passo = b.offsetTop - a.offsetTop, topo1 = a.getBoundingClientRect().top + window.scrollY;
    const v = Math.floor((window.scrollY + alturaCab() + 30 - topo1) / passo);
    return v < 0 ? 0 : Math.min(PAGINAS, v + 1);
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

  // ---------------------------------------------------------------- busca em tela cheia, zoom e indicador de página
  function abrirBusca() {
    const m = document.createElement('div'); m.className = 'modal sheet';
    m.innerHTML = `<div class="sh-top"><div class="sfield">${IC.search}<input id="q" type="search" inputmode="search" enterkeyhint="search" placeholder="Referência ou nome do produto" autocomplete="off" autocapitalize="none" aria-label="Buscar produto"></div><button class="ibtn" data-a="fechar" aria-label="Fechar busca">${IC.x}</button></div>
      <div class="sh-body"><div id="hits"><p class="mut">Digite a referência ou parte do nome (ex.: 3010, concha).</p></div>
      <div class="goto"><label for="gp">Ir para a página</label><div class="gorow"><input id="gp" type="number" inputmode="numeric" min="1" max="${PAGINAS}" placeholder="1 a ${PAGINAS}" enterkeyhint="go"><button class="btn sec" data-a="gopg">Ir</button></div></div></div>`;
    abrirModal(m);
    const q = $('#q', m), box = $('#hits', m);
    q.addEventListener('input', () => {
      const t = norm(q.value.trim()); if (t.length < 2) { box.innerHTML = '<p class="mut">Digite a referência ou parte do nome (ex.: 3010, concha).</p>'; return; }
      const r = []; for (const p of S.produtos.values()) { if (String(p.ref).startsWith(t) || norm(p.descricao).includes(t)) { r.push(p); if (r.length >= 15) break; } }
      box.innerHTML = r.length ? r.map((p) => `<div class="hit"><b>${p.ref}</b> <span class="d">${esc(p.descricao)}</span><small>${brl(p.preco * (1 - DESC))} c/ desconto</small>
        <div class="ha">${S.idx[p.ref] ? `<button class="btn sec sm" data-a="goto" data-n="${S.idx[p.ref]}">Ver página</button>` : ''}<button class="btn sm" data-a="pedir" data-ref="${p.ref}">Pedir</button></div></div>`).join('') : '<p class="mut">Nada encontrado.</p>';
    });
    $('#gp', m).addEventListener('keydown', (e) => e.key === 'Enter' && irParaDigitada());
    q.focus();
  }
  function irParaDigitada() {
    const n = parseInt($('#gp').value, 10);
    if (!(n >= 1 && n <= PAGINAS)) return toast(`Informe uma página de 1 a ${PAGINAS}.`, true);
    fecharModais(); irPagina(n, false);
  }
  function abrirZoom(n) {
    const m = document.createElement('div'); m.className = 'modal zoom'; m.dataset.n = n; m.dataset.n0 = n;
    m.innerHTML = `<div class="zbar"><b id="zl"></b><button class="ibtn" data-a="zmove" data-d="-1" aria-label="Página anterior">${IC.prev}</button><button class="ibtn" data-a="zmove" data-d="1" aria-label="Próxima página">${IC.next}</button><button class="ibtn" data-a="fechar" aria-label="Fechar">${IC.x}</button></div><div class="zscroll"><img alt=""></div>`;
    abrirModal(m); zmover(m, 0);
  }
  function zmover(m, d) {
    const n = Math.max(1, Math.min(PAGINAS, Number(m.dataset.n) + d)); m.dataset.n = n;
    $('#zl', m).textContent = `Página ${n} de ${PAGINAS}`;
    const sc = $('.zscroll', m), img = $('img', m); img.alt = `Catálogo, página ${n}`;
    img.onload = () => { sc.scrollLeft = (sc.scrollWidth - sc.clientWidth) / 2; sc.scrollTop = 0; };
    img.src = `catalogo/p${String(n).padStart(3, '0')}.webp`;
  }
  function fecharUltimo() {
    const m = [...document.querySelectorAll('.modal')].pop(); if (!m) return;
    const moveu = m.classList.contains('zoom') && m.dataset.n !== m.dataset.n0;
    fecharModal(m); if (moveu) irPagina(Number(m.dataset.n), false);   // volta o catálogo para a página que você estava vendo
  }
  let rafChip = 0;
  window.addEventListener('scroll', () => {
    if (rafChip || S.view !== 'catalogo') return;
    rafChip = requestAnimationFrame(() => { rafChip = 0; const c = $('#chip'); if (c) c.textContent = `${Math.max(1, paginaAtual())} / ${PAGINAS}`; });
  }, { passive: true });
  if (window.visualViewport) {   // altura real da tela com o teclado aberto (a busca fica sempre visível)
    const f = () => document.documentElement.style.setProperty('--vh', window.visualViewport.height + 'px');
    window.visualViewport.addEventListener('resize', f); f();
  }

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
      case 'vercat': return abrirAdiantado();
      case 'recheck': { const r = await rpc('app_sessao'); S.sess = { ...S.sess, ...r }; sessionStorage.setItem('kh', JSON.stringify(S.sess)); await iniciar(); return; }
      case 'view': return setView(d.v);
      case 'goto': fecharModais(); return irPagina(Number(d.n));
      case 'busca': return abrirBusca();
      case 'gopg': return irParaDigitada();
      case 'fechar': return fecharUltimo();
      case 'zmove': return zmover(b.closest('.modal'), Number(d.d));
      case 'dec': return mudarQtd(Number(d.k), -1);
      case 'inc': return mudarQtd(Number(d.k), 1);
      case 'qm': case 'qp': { const q = $('#qtd'); q.value = Math.max(1, (parseInt(q.value, 10) || 1) + (d.a === 'qp' ? 1 : -1)); return; }
      case 'zoom': return abrirZoom(Number(d.n));
      case 'pedir': fecharModais(); S.prefill = d.ref; return setView('pedido');
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
