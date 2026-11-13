/* Service worker - Ke Home Pedido do Funcionário
   Aumente VERSAO sempre que publicar uma atualização, para o app instalado receber a nova versão. */
const VERSAO = 'v1';
const SHELL = `kh-shell-${VERSAO}`, PAGS = `kh-paginas-${VERSAO}`, LIBS = `kh-libs-${VERSAO}`;
const ARQUIVOS = ['./', 'index.html', 'css/style.css', 'js/config.js', 'js/exporter.js', 'js/app.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
const MAX_PAGINAS = 150;   // páginas do catálogo guardadas para ver sem internet (as mais recentes)

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => ![SHELL, PAGS, LIBS].includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

async function limitar(nome, max) { const c = await caches.open(nome), ks = await c.keys(); for (let i = 0; i < ks.length - max; i++) await c.delete(ks[i]); }

// rede primeiro (sempre pega a versão nova) e usa o cache só se estiver sem internet
async function redePrimeiro(req, nome) {
  try { const r = await fetch(req); if (r.ok) (await caches.open(nome)).put(req, r.clone()); return r; }
  catch (_) { const c = await caches.match(req, { ignoreSearch: true }); if (c) return c; throw _; }
}
// cache primeiro (imagens do catálogo e bibliotecas: não mudam)
async function cachePrimeiro(req, nome, max) {
  const c = await caches.match(req); if (c) return c;
  const r = await fetch(req); if (r.ok) { (await caches.open(nome)).put(req, r.clone()); if (max) limitar(nome, max); } return r;
}

self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.hostname.endsWith('supabase.co')) return;                       // dados do pedido: nunca em cache
  if (u.origin === location.origin) {
    if (/\/catalogo\/p\d+\.webp$/.test(u.pathname)) return e.respondWith(cachePrimeiro(req, PAGS, MAX_PAGINAS));
    if (u.pathname.endsWith('/catalogo/index.json')) return e.respondWith(redePrimeiro(req, SHELL));
    return e.respondWith(redePrimeiro(req, SHELL));                     // html, css, js, ícones, planilha-modelo
  }
  if (/cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|fonts\.(googleapis|gstatic)\.com/.test(u.hostname)) e.respondWith(cachePrimeiro(req, LIBS));
});
