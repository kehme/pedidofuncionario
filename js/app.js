/* Ke Home - Pedido do Funcionário */
(() => {
  const CFG = window.KEHOME_CONFIG || {};
  const E = window.Exporter;
  const LIMITE = 100, DESC = E.DESCONTO;
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
  const S = { sess: null, produtos: new Map(), pedido: null, catalogos: [], catSel: null, catErro: false, view: 'catalogo', prefill: null,
              adm: { tab: 'pedidos', periodos: [], periodoId: null, pedidos: [], usuarios: [], editU: null, catalogos: [], editC: null, catErro: null }, tpl: null };
  let sb;
  S.catOnly = false; S.poll = null;

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

  // ---------------------------------------------------------------- login salvo neste aparelho
  const LS = 'kh_login';
  const lerLogin = () => { try { return JSON.parse(localStorage.getItem(LS)) || null; } catch (_) { return null; } };
  const salvarLogin = (u, s) => { try { localStorage.setItem(LS, JSON.stringify({ u, s, auto: true })); } catch (_) {} };
  const esquecerLogin = () => { try { localStorage.removeItem(LS); } catch (_) {} };
  const pausarAuto = () => { const l = lerLogin(); if (l) { l.auto = false; try { localStorage.setItem(LS, JSON.stringify(l)); } catch (_) {} } };

  // ---------------------------------------------------------------- sessão
  function sair(render_ = true) { try { if (S.sess) sb.rpc('app_logout', { p_token: S.sess.token }); } catch (_) {} sessionStorage.removeItem('kh'); pausarAuto(); S.sess = null; S.pedido = null; S.catOnly = false; clearInterval(S.poll); S.poll = null; S.produtos = new Map(); limparCatalogos(); if (render_) render(); else setTimeout(render, 0); }
  async function entrar(usuario, senha, lembrar = true) {
    const r = await rpc('app_login', { p_usuario: usuario, p_senha: senha }, false);
    if (lembrar) salvarLogin(usuario, senha); else esquecerLogin();
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
    esconderCatalogos();   // os catálogos ficam vivos fora do #app; viewCatalogo() os mostra de novo
    if (!CFG.SUPABASE_URL || CFG.SUPABASE_URL.includes('SEU-PROJETO')) { root.innerHTML = '<div class="center"><div class="card"><h2>Configuração pendente</h2><p>Edite <b>js/config.js</b> com a URL e a chave anon do seu projeto Supabase.</p></div></div>'; return; }
    if (!S.sess) return telaLogin();
    if (S.sess.is_admin) return telaAdmin();
    if (!S.sess.periodo_aberto && !S.catOnly) return telaBloqueio();
    telaFuncionario();
  }

  // ---------------------------------------------------------------- instalar como app (PWA)
  let evInstalar = null;
  const instalado = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const ehIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
  const blocoInstalar = () => {
    if (instalado()) return '';
    if (evInstalar) return `<button class="btn sec block" data-a="instalar" style="margin-top:.6rem">Instalar app no celular</button>`;
    if (ehIOS()) return `<p class="tip" style="margin-top:.8rem">Para instalar: toque em <b>Compartilhar</b> e depois em <b>Adicionar à Tela de Início</b>.</p>`;
    return '';
  };
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); evInstalar = e; if (!S.sess && $('#go')) telaLogin(); });
  window.addEventListener('appinstalled', () => { evInstalar = null; toast('App instalado!'); if (!S.sess && $('#go')) telaLogin(); });
  if ('serviceWorker' in navigator) {
    const tinhaSW = !!navigator.serviceWorker.controller; let recarregou = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (tinhaSW && !recarregou) { recarregou = true; location.reload(); } });   // nova versão assumiu: recarrega uma vez
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((r) => r.update()).catch(() => {}));
  }

  function telaLogin() {
    root.innerHTML = `<div class="center"><div class="card"><h1 class="logo">ke<span>home</span></h1><p class="mut">Pedido mensal do funcionário</p>
      <label for="u">Usuário</label><input id="u" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="next" value="${esc(lerLogin()?.u || '')}">
      <label for="s">Senha</label><input id="s" type="password" autocomplete="current-password" enterkeyhint="go" value="${esc(lerLogin()?.s || '')}">
      <label style="display:flex;align-items:center;gap:.6rem;font-weight:600"><input id="lem" type="checkbox" style="width:22px;flex:none" ${lerLogin() || !localStorage.getItem(LS) ? 'checked' : ''}> Salvar login neste aparelho</label>
      <p id="le" class="err" role="alert"></p><button class="btn block" id="go">Entrar</button>${blocoInstalar()}</div></div>`;
    const go = async () => { $('#le').textContent = ''; $('#go').disabled = true;
      try { await entrar($('#u').value, $('#s').value, $('#lem').checked); } catch (e) { const le = $('#le'); if (le) le.textContent = e.message; } const g = $('#go'); if (g) g.disabled = false; };
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
    await carregarFuncionario(); S.catOnly = true; S.view = 'catalogo'; render(); window.scrollTo(0, 0);
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
          clearInterval(S.poll); S.poll = null; render(); toast('O período de pedidos abriu! Agora já é possível finalizar o pedido.');
        }
      } catch (_) {}
    }, 30000);
  }

  // ---------------------------------------------------------------- funcionário
  async function carregarFuncionario() {
    const [prods, ped, cats] = await Promise.all([rpc('app_produtos'), rpc('app_meu_pedido'), rpc('app_catalogos').catch(() => null)]);
    S.produtos = new Map(prods.map(([ref, descricao, preco, cx, estoque]) => [ref, { ref, descricao, preco: Number(preco), cx, estoque }]));
    S.pedido = ped; S.catErro = !Array.isArray(cats); S.catalogos = Array.isArray(cats) ? cats : [];
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
    const L = S.catalogos || [], sel = L.find((c) => c.id === S.catSel) || L[0], main = $('#main');
    main.className = 'cat';
    if (!sel) { main.innerHTML = `${avisoPeriodo()}<div class="card" style="margin:.75rem"><p class="mut">${S.catErro ? 'Não foi possível carregar os catálogos. Verifique a conexão e entre novamente.' : 'Nenhum catálogo disponível no momento.'}</p></div>`; return; }
    S.catSel = sel.id;
    const fid = driveId(sel.url);
    main.innerHTML = `${avisoPeriodo()}<div class="ctop"><div class="tabs" role="tablist" aria-label="Catálogos">${L.map((c) => `<button role="tab" aria-selected="${c.id === sel.id}" data-a="ctab" data-id="${c.id}" class="${c.id === sel.id ? 'on' : ''}">${esc(c.nome)}</button>`).join('')}</div>
    </div>
      ${fid ? '<div id="cslot" class="cslot"></div>' : '<div class="card" style="margin:.75rem"><p class="err">O link deste catálogo não é válido. Avise o administrador.</p></div>'}`;
    if (fid) mostrarCatalogo(sel, fid);
    const on = $('.ctop .tabs .on'); if (on) on.scrollIntoView({ inline: 'center', block: 'nearest' });   // mantém a aba escolhida visível na rolagem lateral
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
    try { S.adm.catalogos = await rpc('app_catalogos'); S.adm.catErro = null; } catch (e) { S.adm.catalogos = []; S.adm.catErro = e.message || 'erro desconhecido'; }
  }
  async function carregarPedidosAdmin() { S.adm.pedidos = S.adm.periodoId ? await rpc('app_admin_pedidos', { p_periodo: S.adm.periodoId }) : []; }

  function telaAdmin() {
    const A = S.adm, T = [['pedidos', 'Pedidos'], ['planilhas', 'Planilhas'], ['pdf', 'Emitir PDF'], ['usuarios', 'Cadastros'], ['periodo', 'Período'], ['produtos', 'Produtos'], ['catalogos', 'Catálogos']];
    const sel = `<select id="per" aria-label="Período">${A.periodos.map((p) => `<option value="${p.id}" ${p.id === A.periodoId ? 'selected' : ''}>${fmtDt(p.inicio)} → ${fmtDt(p.fim)}</option>`).join('') || '<option>Nenhum período</option>'}</select>`;
    root.innerHTML = `<div class="hd">` + topo('', `<div class="per">${sel}</div>`) + `<div class="tabs">${T.map(([k, n]) => `<button data-a="atab" data-t="${k}" class="${A.tab === k ? 'on' : ''}">${n}</button>`).join('')}</div></div><main id="main"></main>`;
    $('#per').onchange = guard(async (e) => { A.periodoId = Number(e.target.value); await carregarPedidosAdmin(); render(); });
    ({ pedidos: admPedidos, planilhas: admPlanilhas, pdf: admPdf, usuarios: admUsuarios, periodo: admPeriodo, produtos: admProdutos, catalogos: admCatalogos })[A.tab]();
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

  // ---------------------------------------------------------------- catálogos (Google Drive), navegação e busca
  const driveId = (u) => { const t = String(u || ''), m = t.match(/\/d\/([\w-]{10,})/) || t.match(/[?&]id=([\w-]{10,})/); return m ? m[1] : null; };
  // Os iframes dos catálogos ficam num contêiner fixo no <body>, fora do #app. Assim trocar de aba
  // (Catálogo <-> Meu pedido) só os esconde/mostra e eles NÃO recarregam (mover um iframe no DOM recarregaria).
  S.frames = new Map();   // id do catálogo -> { el, url }
  function hostCatalogos() {
    let h = $('#catHost');
    if (!h) { h = document.createElement('div'); h.id = 'catHost'; h.style.display = 'none'; document.body.appendChild(h); }
    return h;
  }
  function esconderCatalogos() { const h = $('#catHost'); if (h) h.style.display = 'none'; }
  function limparCatalogos() { S.frames.clear(); const h = $('#catHost'); if (h) h.remove(); }
  function mostrarCatalogo(sel, fid) {
    const h = hostCatalogos(), ids = new Set((S.catalogos || []).map((c) => c.id));
    for (const [id, f] of S.frames) if (!ids.has(id)) { f.el.remove(); S.frames.delete(id); }   // catálogo excluído
    let f = S.frames.get(sel.id);
    if (f && f.url !== sel.url) { f.el.remove(); S.frames.delete(sel.id); f = null; }            // link editado pelo admin
    if (!f) {
      const el = document.createElement('iframe'); el.className = 'cframe'; el.title = sel.nome; el.setAttribute('allow', 'fullscreen');
      el.src = `https://drive.google.com/file/d/${fid}/preview`; el.style.display = 'none'; h.appendChild(el);
      f = { el, url: sel.url }; S.frames.set(sel.id, f);
    }
    for (const [id, x] of S.frames) { if (x !== f && id !== S.catSel) { x.el.remove(); S.frames.delete(id); } else x.el.style.display = x === f ? 'block' : 'none'; }   // mantém só o catálogo em uso
    h.style.display = 'block'; ajustarFrame();
  }
  function ajustarFrame() {   // o visualizador ocupa o resto da tela e rola por dentro
    const slot = $('#cslot'), h = $('#catHost'); if (!slot || !h || h.style.display === 'none') return; const nav = $('.bn');
    const top = slot.getBoundingClientRect().top + window.scrollY, alt = Math.max(360, window.innerHeight - (nav ? nav.offsetHeight : 0) - top - 4);
    h.style.top = top + 'px'; h.style.height = alt + 'px'; slot.style.height = alt + 'px';
  }
  window.addEventListener('resize', ajustarFrame); window.addEventListener('orientationchange', ajustarFrame);
  function setView(v) { if (v === S.view) return; S.view = v; render(); window.scrollTo(0, 0); }

  function fecharUltimo() { const m = [...document.querySelectorAll('.modal')].pop(); if (m) fecharModal(m); }
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

  // ---------------------------------------------------------------- admin: catálogos (abas da home, abertos pelo visualizador do Google Drive)
  function admCatalogos() {
    const A = S.adm, L = A.catalogos, c = A.editC || { nome: '', url: '' };
    $('#main').innerHTML = (A.catErro ? `<div class="warn">Não foi possível carregar os catálogos do servidor: <b>${esc(A.catErro)}</b><br>Confira se o arquivo catalogos.sql foi executado no Supabase sem erros.</div>` : '') + `<div class="card"><h2>${c.id ? 'Editar catálogo' : 'Novo catálogo'}</h2>
      <div class="row"><div><label for="cn">Nome da aba</label><input id="cn" value="${esc(c.nome)}" maxlength="40" placeholder="Ex.: Black Friday 2026"></div>
      <div><label for="cu">Link do Google Drive</label><input id="cu" type="url" value="${esc(c.url)}" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="https://drive.google.com/file/d/…/view"></div></div>
      <p class="tip">No Drive: abra o arquivo, toque em Compartilhar, escolha "Qualquer pessoa com o link" e copie o link. Para atualizar um catálogo sem mexer aqui, substitua o arquivo no Drive mantendo o mesmo link (Gerenciar versões).</p>
      <div class="actions"><button class="btn" data-a="csave">Salvar</button>${c.id ? '<button class="btn sec" data-a="ccancel">Cancelar</button>' : ''}</div></div>
      <div class="card"><h2>Abas da home (${L.length})</h2>${L.length ? `<div class="scroll"><table><thead><tr><th>Ordem</th><th>Nome</th><th></th></tr></thead><tbody>${L.map((x, i) => `<tr><td style="white-space:nowrap"><button class="btn sec sm" data-a="cup" data-id="${x.id}" aria-label="Subir" ${i === 0 ? 'disabled' : ''}>↑</button> <button class="btn sec sm" data-a="cdn" data-id="${x.id}" aria-label="Descer" ${i === L.length - 1 ? 'disabled' : ''}>↓</button></td><td>${esc(x.nome)}</td>
      <td class="n"><button class="btn sec sm" data-a="cedit" data-id="${x.id}">Editar</button> <button class="btn danger sm" data-a="cdel" data-id="${x.id}">Excluir</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="mut">Nenhum catálogo cadastrado. Os funcionários não verão nada na aba Catálogo.</p>'}</div>`;
  }
  const salvarCatalogo = guard(async () => {
    const c = S.adm.editC, nome = $('#cn').value.trim(), url = $('#cu').value.trim();
    if (!nome) return toast('Informe o nome da aba.', true);
    if (!driveId(url)) return toast('Cole o link de um arquivo do Google Drive (…/file/d/…).', true);
    await rpc('app_admin_catalogo_salvar', { p_id: c?.id || null, p_nome: nome, p_url: url });
    S.adm.editC = null; S.adm.catalogos = await rpc('app_catalogos'); render(); toast('Catálogo salvo.');
  });
  const moverCatalogo = guard(async (id, d) => {
    const ids = S.adm.catalogos.map((x) => x.id), i = ids.indexOf(Number(id)), j = i + d; if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await rpc('app_admin_catalogo_ordenar', { p_ids: ids }); S.adm.catalogos = await rpc('app_catalogos'); render();
  });
  const excluirCatalogo = guard(async (id) => {
    const c = S.adm.catalogos.find((x) => x.id === Number(id)); if (!c) return;
    if (!(await confirmar('Excluir catálogo?', `A aba <b>${esc(c.nome)}</b> deixará de aparecer para os funcionários. O arquivo no Drive não é apagado.`, 'Excluir'))) return;
    await rpc('app_admin_catalogo_excluir', { p_id: Number(id) });
    if (S.adm.editC && S.adm.editC.id === Number(id)) S.adm.editC = null;
    S.adm.catalogos = await rpc('app_catalogos'); render(); toast('Catálogo excluído.');
  });

  // ---------------------------------------------------------------- admin: atualizar produtos a partir de uma planilha .xlsx
  const hdr = (v) => norm(v).replace(/[^a-z0-9]/g, '');
  const valCel = (c) => { let v = c && c.value; if (v && typeof v === 'object') v = v.result ?? v.text ?? (v.richText ? v.richText.map((t) => t.text).join('') : ''); return v; };
  const numero = (v) => { if (typeof v === 'number') return v; const t = String(v ?? '').trim(); return Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t); };

  // lê a aba que tiver o cabeçalho CODFAB / DESCRICAO / CX / PREÇO / ESTOQUE (prefere a aba "TABELA")
  async function lerPlanilhaProdutos(file) {
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await file.arrayBuffer());
    const abas = wb.worksheets.slice().sort((a, b) => (/tabela/i.test(b.name) ? 1 : 0) - (/tabela/i.test(a.name) ? 1 : 0));
    for (const ws of abas) {
      let cols = null, linhaH = 0;
      for (let r = 1; r <= Math.min(ws.rowCount, 15) && !cols; r++) { const m = {}; ws.getRow(r).eachCell((c, n) => { const k = hdr(valCel(c)); if (k && !(k in m)) m[k] = n; }); if (m.codfab && m.descricao && m.preco) { cols = m; linhaH = r; } }
      if (!cols) continue;
      const out = new Map(); let invalidas = 0;
      for (let r = linhaH + 1; r <= ws.rowCount; r++) {
        const row = ws.getRow(r), ref = parseInt(valCel(row.getCell(cols.codfab)), 10);
        if (!Number.isFinite(ref)) continue;
        const descricao = String(valCel(row.getCell(cols.descricao)) ?? '').trim(), preco = numero(valCel(row.getCell(cols.preco)));
        if (!descricao || !Number.isFinite(preco)) { invalidas++; continue; }
        if (out.has(ref)) continue;
        const cx = cols.cx ? parseInt(valCel(row.getCell(cols.cx)), 10) : NaN, est = cols.estoque ? String(valCel(row.getCell(cols.estoque)) ?? '').trim() : '';
        out.set(ref, { ref, descricao, preco, cx: Number.isFinite(cx) ? cx : null, estoque: est || null });
      }
      return { aba: ws.name.trim(), produtos: [...out.values()], invalidas };
    }
    throw new Error('Não encontrei as colunas CODFAB, DESCRICAO e PREÇO em nenhuma aba da planilha.');
  }
  function admProdutos() {
    const I = S.adm.imp;
    const prev = !I ? '' : `<div class="card"><h2>Resultado da comparação</h2>
      <p>Arquivo: <b>${esc(I.arquivo)}</b> (aba ${esc(I.aba)})</p>
      <p>${I.total} referências na planilha · ${I.total - I.novos.length} já cadastradas (não alteradas) · <b>${I.novos.length} novas</b>${I.invalidas ? ` · ${I.invalidas} linhas ignoradas (sem descrição ou preço)` : ''}</p>
      ${I.novos.length ? `<div class="scroll"><table><thead><tr><th>Ref.</th><th>Descrição</th><th class="n">Preço</th><th class="n">Cx</th><th>Estoque</th></tr></thead><tbody>${I.novos.slice(0, 200).map((p) => `<tr><td>${p.ref}</td><td>${esc(p.descricao)}</td><td class="n">${brl(p.preco)}</td><td class="n">${p.cx ?? '—'}</td><td>${esc(p.estoque) || '—'}</td></tr>`).join('')}</tbody></table></div>
        ${I.novos.length > 200 ? `<p class="tip">Mostrando as 200 primeiras de ${I.novos.length}.</p>` : ''}
        <div class="actions"><button class="btn sec" data-a="pcan">Cancelar</button><button class="btn" data-a="pimp">Adicionar ${I.novos.length} produto${I.novos.length > 1 ? 's' : ''}</button></div>` : '<p class="ok">Nenhuma referência nova. O cadastro já está atualizado.</p>'}</div>`;
    $('#main').innerHTML = `<div class="card"><h2>Atualizar produtos</h2>
      <p class="tip">Envie a planilha atualizada (.xlsx) com as colunas CODFAB, DESCRICAO, CX, PREÇO e ESTOQUE (aba TABELA). O sistema compara com os <b>${S.produtos.size}</b> produtos cadastrados e adiciona só as referências que ainda não existem. Os produtos existentes não são alterados.</p>
      <label for="fx">Planilha (.xlsx)</label><input id="fx" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></div>${prev}`;
  }
  const importarProdutos = guard(async () => {
    const I = S.adm.imp; if (!I || !I.novos.length) return;
    let add = 0; for (let i = 0; i < I.novos.length; i += 500) add += Number(await rpc('app_admin_produtos_adicionar', { p_produtos: I.novos.slice(i, i + 500) })) || 0;
    const prods = await rpc('app_produtos');
    S.produtos = new Map(prods.map(([ref, descricao, preco, cx, estoque]) => [ref, { ref, descricao, preco: Number(preco), cx, estoque }]));
    S.adm.imp = null; render(); toast(`${add} produto(s) adicionado(s).`);
  });
  document.addEventListener('change', guard(async (e) => {
    if (!e.target || e.target.id !== 'fx' || !e.target.files[0]) return;
    const f = e.target.files[0]; toast('Lendo planilha...');
    const r = await lerPlanilhaProdutos(f);
    S.adm.imp = { arquivo: f.name, aba: r.aba, total: r.produtos.length, invalidas: r.invalidas, novos: r.produtos.filter((p) => !S.produtos.has(p.ref)).sort((a, b) => a.ref - b.ref) };
    render(); toast('Planilha comparada.');
  }));

  // ---------------------------------------------------------------- eventos
  document.addEventListener('click', guard(async (e) => {
    const b = e.target.closest('[data-a]'); if (!b) return; const d = b.dataset;
    switch (d.a) {
      case 'sair': return sair();
      case 'vercat': return abrirAdiantado();
      case 'recheck': { const r = await rpc('app_sessao'); S.sess = { ...S.sess, ...r }; sessionStorage.setItem('kh', JSON.stringify(S.sess)); await iniciar(); return; }
      case 'view': return setView(d.v);
      case 'instalar': { if (!evInstalar) return; const ev = evInstalar; evInstalar = null; ev.prompt(); await ev.userChoice.catch(() => {}); if (!S.sess) telaLogin(); return; }
      case 'fechar': return fecharUltimo();
      case 'dec': return mudarQtd(Number(d.k), -1);
      case 'inc': return mudarQtd(Number(d.k), 1);
      case 'qm': case 'qp': { const q = $('#qtd'); q.value = Math.max(1, (parseInt(q.value, 10) || 1) + (d.a === 'qp' ? 1 : -1)); return; }
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
      case 'ctab': S.catSel = Number(d.id); return render();
      case 'cedit': S.adm.editC = S.adm.catalogos.find((x) => x.id === Number(d.id)) || null; return render();
      case 'ccancel': S.adm.editC = null; return render();
      case 'csave': return salvarCatalogo();
      case 'cup': return moverCatalogo(d.id, -1);
      case 'cdn': return moverCatalogo(d.id, 1);
      case 'cdel': return excluirCatalogo(d.id);
      case 'pimp': return importarProdutos();
      case 'pcan': S.adm.imp = null; return render();
      case 'psave': return salvarPeriodo(d.m);
      case 'pdel': return excluirPeriodo(d.id);
    }
  }));

  // ---------------------------------------------------------------- start
  (async function start() {
    if (CFG.SUPABASE_URL && !CFG.SUPABASE_URL.includes('SEU-PROJETO')) sb = supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const saved = sessionStorage.getItem('kh');
    if (saved && sb) { try { S.sess = JSON.parse(saved); const r = await rpc('app_sessao'); S.sess = { ...S.sess, ...r }; await iniciar(); return; } catch (_) { S.sess = null; } }
    const lg = lerLogin();
    if (lg && lg.auto && sb) { try { await entrar(lg.u, lg.s, true); return; } catch (e) { S.sess = null; if (e && e.code === 'CREDENCIAIS_INVALIDAS') esquecerLogin(); } }
    render();
  })();
})();
