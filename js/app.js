// Agenda Cultural Rosario — lógica de la página.
// No hace falta editar este archivo: todo se configura en config.json.
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const PAGINA = 18;
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const hoy = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10); // fecha en Argentina
  const estado = { todos: [], vistas: {}, genero: '', visibles: PAGINA };
  let config = {};

  // ---------- utilidades ----------
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sinTildes = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const urlSegura = u => { if (!u || !String(u).trim()) return ''; try { const x = new URL(u, location.href); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch { return ''; } };
  const dia = s => (s || '').slice(0, 10);
  const fechaObj = s => new Date(dia(s) + 'T12:00:00');
  const horaDe = s => (/T(\d{2}:\d{2})/.exec(s || '') || [])[1] || '';
  const sumarDias = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const largo = iso => { const d = fechaObj(iso); return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`; };
  const claveDup = e => sinTildes(e.titulo).replace(/[^a-z0-9]/g, '') + dia(e.inicio);
  const finEfectivo = e => (e.fin && dia(e.fin) > dia(e.inicio)) ? dia(e.fin) : dia(e.inicio);
  const enCurso = e => dia(e.inicio) < hoy && finEfectivo(e) >= hoy;
  const fechaOrden = e => (enCurso(e) ? hoy : dia(e.inicio));

  function cuandoTexto(e) {
    const h = horaDe(e.inicio) ? ` · ${horaDe(e.inicio)} hs` : '';
    if (enCurso(e)) return `En curso, hasta el ${largo(finEfectivo(e))}`;
    if (finEfectivo(e) > dia(e.inicio)) return `Del ${largo(e.inicio)} al ${largo(finEfectivo(e))}${h}`;
    return `${largo(e.inicio)[0].toUpperCase() + largo(e.inicio).slice(1)}${h}`;
  }

  // ---------- CSV (hoja de Google con los eventos cargados por productoras) ----------
  function parseCSV(t) {
    const filas = []; let f = [], c = '', q = false;
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; }
      else if (ch === '"') q = true;
      else if (ch === ',') { f.push(c); c = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; f.push(c); filas.push(f); f = []; c = ''; }
      else c += ch;
    }
    if (c || f.length) { f.push(c); filas.push(f); }
    return filas;
  }
  function fechaFlex(s) {
    s = (s || '').trim();
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/.exec(s);
    if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return '';
  }
  function horaFlex(s) {
    const m = /(\d{1,2})[:.](\d{2})(?::\d{2})?\s*(a\.?\s?m|p\.?\s?m)?/i.exec(s || '');
    if (!m) return '';
    let h = +m[1]; const pm = m[3] && /p/i.test(m[3]);
    if (pm && h < 12) h += 12; if (m[3] && !pm && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${m[2]}`;
  }
  function eventosDeHoja(csv) {
    const filas = parseCSV(csv).filter(r => r.some(x => x.trim()));
    if (filas.length < 2) return [];
    const cab = filas[0].map(sinTildes);
    const col = (...claves) => cab.findIndex(h => claves.some(k => h.includes(k)));
    const ix = {
      titulo: col('titulo', 'nombre del evento'), fecha: col('fecha de inicio', 'fecha'), fin: col('fecha de fin', 'hasta'),
      hora: col('hora', 'horario'), lugar: col('lugar', 'donde', 'sala'), desc: col('descripcion'), publico: col('publico'),
      genero: col('genero', 'categoria'), entradas: col('entradas', 'entrada'), link: col('enlace', 'link', 'web', 'url'),
      imagen: col('imagen', 'foto', 'flyer'), prod: col('productora', 'organiza'), ok: col('aprobado', 'publicar'), dest: col('destacado'),
    };
    const v = (r, k) => (ix[k] >= 0 ? (r[ix[k]] || '').trim() : '');
    const out = [];
    for (const r of filas.slice(1)) {
      if (!/^(si|sí|x|ok|1|true|aprobado|yes)/i.test(sinTildes(v(r, 'ok')))) continue; // solo se publica lo aprobado
      const f = fechaFlex(v(r, 'fecha')); if (!f || !v(r, 'titulo')) continue;
      const h = horaFlex(v(r, 'hora')); const fin = fechaFlex(v(r, 'fin'));
      const link = urlSegura(v(r, 'link'));
      const entradasTxt = v(r, 'entradas');
      out.push({
        id: 'h' + claveDup({ titulo: v(r, 'titulo'), inicio: f }).slice(0, 40),
        titulo: v(r, 'titulo'), inicio: h ? `${f}T${h}:00-03:00` : f, fin, lugar: v(r, 'lugar'), descripcion: v(r, 'desc') || 'Sin descripción.',
        publico: v(r, 'publico') || 'Todo público', genero: v(r, 'genero') || 'Otros', imagen: urlSegura(v(r, 'imagen')), url: link,
        entradas: { texto: entradasTxt || (link ? 'Más información en el enlace' : 'Consultar con la organización'), url: link, gratis: /gratu|libre/i.test(entradasTxt) },
        fuente: v(r, 'prod') ? `Cargado por ${v(r, 'prod')}` : 'Productora independiente', destacado: /^(si|sí|x|1|true)/i.test(sinTildes(v(r, 'dest'))),
      });
    }
    return out;
  }

  // ---------- contador de consultas (para "más consultados") ----------
  function registrar(id, tipo) {
    if (!config.contador) return;
    try { fetch(config.contador, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ id, tipo }) }); } catch { /* sin conexión: no pasa nada */ }
  }

  // ---------- tarjetas ----------
  function tarjeta(e, dest) {
    const d = fechaObj(enCurso(e) ? hoy : e.inicio);
    const b = document.createElement('button');
    b.className = 'tarjeta'; b.type = 'button'; b.dataset.id = e.id;
    b.setAttribute('aria-label', `${e.titulo}, ${cuandoTexto(e)}. Ver detalle`);
    const img = urlSegura(e.imagen);
    b.innerHTML = `
      <div class="t-img">${img ? `<img src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<div class="ph">${esc(e.titulo.slice(0, 1))}</div>`}
        <div class="t-fecha"><b>${d.getDate()}</b><span>${MESES[d.getMonth()]}</span></div>
        ${dest ? `<span class="sello">${esc(dest)}</span>` : ''}
      </div>
      <div class="t-cuerpo">
        <div class="etiquetas"><span class="tag">${esc(e.genero)}</span>${e.entradas?.gratis ? '<span class="tag gratis">Gratis</span>' : ''}</div>
        <h3>${esc(e.titulo)}</h3>
        <div class="t-meta">${esc(cuandoTexto(e))}${horaDe(e.inicio) && !enCurso(e) ? '' : ''}<br>${esc(e.lugar || 'Rosario')}</div>
      </div>`;
    b.addEventListener('click', () => abrir(e));
    return b;
  }

  function abrir(e) {
    registrar(e.id, 'ver');
    const img = urlSegura(e.imagen);
    $('dImgWrap').innerHTML = img ? `<img src="${esc(img)}" alt="" referrerpolicy="no-referrer">` : '';
    $('dImgWrap').hidden = !img;
    $('dEtiquetas').innerHTML = `<span class="tag">${esc(e.genero)}</span>${e.entradas?.gratis ? '<span class="tag gratis">Gratis</span>' : ''}`;
    $('dTitulo').textContent = e.titulo;
    $('dCuando').textContent = cuandoTexto(e);
    $('dLugar').textContent = e.lugar || 'Rosario';
    $('dPublico').textContent = e.publico;
    $('dGenero').textContent = e.genero;
    $('dDesc').textContent = e.descripcion;
    $('dEntradas').textContent = e.entradas?.texto || 'Consultar con la organización';
    const u = urlSegura(e.entradas?.url || e.url);
    const btn = $('dBoton'); btn.hidden = !u;
    if (u) { btn.href = u; btn.onclick = () => registrar(e.id, 'entradas'); }
    $('dFuente').textContent = e.fuente ? `Fuente: ${e.fuente}` : '';
    const dlg = $('detalle');
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  }

  // ---------- filtros ----------
  function pasaCuando(e, c) {
    if (c === 'todo') return true;
    const ini = dia(e.inicio), fin = finEfectivo(e);
    const rango = { hoy: [hoy, hoy], semana: [hoy, sumarDias(hoy, 7)], mes: [hoy, sumarDias(hoy, 30)] }[c];
    if (c === 'finde') {
      const dow = fechaObj(hoy).getDay();
      const sab = sumarDias(hoy, dow === 0 ? -1 : 6 - dow);
      const desde = dow === 0 || dow === 6 ? hoy : sab; // si ya es finde, desde hoy
      return ini <= sumarDias(sab, 1) && fin >= desde;
    }
    return ini <= rango[1] && fin >= rango[0];
  }
  const filtrados = () => {
    const q = sinTildes($('q').value.trim()), c = $('fCuando').value, p = $('fPublico').value, g = $('fGratis').checked;
    return estado.todos.filter(e => (!estado.genero || e.genero === estado.genero) && (!p || e.publico === p) && (!g || e.entradas?.gratis)
      && pasaCuando(e, c) && (!q || sinTildes(`${e.titulo} ${e.lugar} ${e.descripcion} ${e.genero}`).includes(q)));
  };

  function pintar() {
    const lista = filtrados();
    const cont = $('lista'); cont.textContent = '';
    const mostrar = lista.slice(0, estado.visibles);
    mostrar.forEach((e, i) => {
      cont.appendChild(tarjeta(e));
      if (i === 5 && mostrar.length > 6) { // anuncio entre eventos
        const slot = document.createElement('div'); slot.className = 'ad ad-intermedio'; slot.dataset.ad = 'intermedio'; slot.style.gridColumn = '1/-1';
        cont.appendChild(slot); pintarAnuncio(slot);
      }
    });
    $('vacio').hidden = lista.length > 0;
    $('verMas').hidden = lista.length <= estado.visibles;
    $('contador').textContent = `${lista.length} ${lista.length === 1 ? 'evento' : 'eventos'}`;
  }

  function pintarFiltros() {
    const generos = [...new Set(estado.todos.map(e => e.genero))].sort((a, b) => a.localeCompare(b, 'es'));
    const box = $('chipsGenero'); box.textContent = '';
    for (const g of ['', ...generos]) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = g || 'Todos';
      b.setAttribute('aria-pressed', String(g === estado.genero));
      b.onclick = () => { estado.genero = g; estado.visibles = PAGINA; [...box.children].forEach(x => x.setAttribute('aria-pressed', String(x === b))); pintar(); };
      box.appendChild(b);
    }
    const pub = [...new Set(estado.todos.map(e => e.publico))].sort((a, b) => a.localeCompare(b, 'es'));
    $('fPublico').innerHTML = '<option value="">Todo el público</option>' + pub.map(p => `<option>${esc(p)}</option>`).join('');
  }

  // ---------- destacados ----------
  function pintarDestacados() {
    const conVistas = Object.keys(estado.vistas).length > 0;
    const puntaje = e => (estado.vistas[e.id]?.ver || 0) + 3 * (estado.vistas[e.id]?.entradas || 0);
    const vigentes = estado.todos.filter(e => finEfectivo(e) >= hoy);
    const manual = vigentes.filter(e => e.destacado);
    const resto = vigentes.filter(e => !e.destacado);
    let top;
    if (conVistas) top = resto.filter(e => puntaje(e) > 0).sort((a, b) => puntaje(b) - puntaje(a));
    else top = resto.filter(e => e.imagen && dia(e.inicio) <= sumarDias(hoy, 21)).sort((a, b) => (enCurso(a) - enCurso(b)) || fechaOrden(a).localeCompare(fechaOrden(b)));
    const sel = [...manual.map(e => [e, 'Recomendado']), ...top.map(e => [e, conVistas ? 'Más consultado' : 'Próximamente'])].slice(0, 6);
    $('destacados').hidden = sel.length === 0;
    $('tituloDestacados').textContent = conVistas ? 'Lo más consultado' : 'Eventos destacados';
    $('subDestacados').textContent = conVistas ? 'Los eventos que más mira la gente en este momento.' : 'Una selección de lo que se viene.';
    const g = $('gridDestacados'); g.textContent = '';
    sel.forEach(([e, sello]) => g.appendChild(tarjeta(e, sello)));
  }

  // ---------- publicidad ----------
  function pintarAnuncio(el) {
    const a = (config.publicidad || {})[el.dataset.ad] || {};
    const p = config.publicidad || {};
    el.textContent = '';
    const enlace = urlSegura(a.enlace);
    if (a.codigoHtml) { // código de una red publicitaria (ej. AdSense): se inserta tal cual
      const cont = document.createElement('div'); cont.innerHTML = a.codigoHtml;
      cont.querySelectorAll('script').forEach(s => { const n = document.createElement('script'); [...s.attributes].forEach(x => n.setAttribute(x.name, x.value)); n.textContent = s.textContent; s.replaceWith(n); });
      el.append(Object.assign(document.createElement('div'), { className: 'ad-tag', textContent: 'Publicidad' }), cont);
    } else if (urlSegura(a.imagen)) {
      const img = Object.assign(document.createElement('img'), { src: urlSegura(a.imagen), alt: a.texto || 'Publicidad', loading: 'lazy' });
      const tag = Object.assign(document.createElement('div'), { className: 'ad-tag', textContent: 'Publicidad' });
      if (enlace) { const l = Object.assign(document.createElement('a'), { href: enlace, target: '_blank', rel: 'sponsored noopener noreferrer' }); l.appendChild(img); el.append(tag, l); } else el.append(tag, img);
    } else if (a.texto) {
      const l = Object.assign(document.createElement(enlace ? 'a' : 'div'), { className: 'ad-texto', textContent: a.texto });
      if (enlace) Object.assign(l, { href: enlace, target: '_blank', rel: 'sponsored noopener noreferrer' });
      el.append(Object.assign(document.createElement('div'), { className: 'ad-tag', textContent: 'Publicidad' }), l);
    } else { // espacio libre: invita a anunciar
      const contacto = urlSegura(p.contactoEnlace) || (config.emailContacto ? `mailto:${config.emailContacto}?subject=Publicidad` : '');
      el.appendChild(Object.assign(document.createElement(contacto ? 'a' : 'div'), { className: 'ad-ph', textContent: `${p.contactoTexto || 'Anunciá acá'} · Espacio publicitario`, ...(contacto ? { href: contacto } : {}) }));
    }
  }

  // ---------- arranque ----------
  async function json(url) { const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) throw new Error(url); return r.json(); }
  async function iniciar() {
    try { config = await json('config.json'); } catch { config = {}; }
    if (config.nombreSitio) { $('nombreSitio').textContent = config.nombreSitio; $('nombrePie').textContent = config.nombreSitio; document.title = `${config.nombreSitio} — Próximos eventos`; }
    if (config.lema) $('lema').textContent = config.lema;
    const form = urlSegura(config.formularioProductoras) || (config.emailContacto ? `mailto:${config.emailContacto}?subject=Quiero cargar un evento` : '#agenda');
    ['btnCargar', 'btnCargar2'].forEach(id => { $(id).href = form; if (form === '#agenda') { $(id).removeAttribute('target'); } });
    document.querySelectorAll('[data-ad]').forEach(pintarAnuncio);

    let base = [];
    try {
      const d = await json('data/eventos.json'); base = d.eventos || [];
      if (d.actualizado) $('actualizado').textContent = `Última actualización automática: ${new Date(d.actualizado).toLocaleString('es-AR', { dateStyle: 'long', timeStyle: 'short' })}`;
    } catch { $('lista').innerHTML = '<p class="vacio">No pudimos cargar la agenda. Probá de nuevo en unos minutos.</p>'; }

    let extra = [];
    if (urlSegura(config.hojaEventosCSV)) { try { extra = eventosDeHoja(await (await fetch(config.hojaEventosCSV)).text()); } catch { /* si la hoja falla, seguimos con lo automático */ } }
    if (urlSegura(config.contador)) { try { estado.vistas = await (await fetch(config.contador)).json(); } catch { /* sin contador: se usa la selección por cercanía */ } }

    const mapa = new Map();
    for (const e of [...base, ...extra]) { // lo cargado por productoras pisa a lo automático si es el mismo evento
      e.descripcion = e.descripcion || ''; e.genero = e.genero || 'Otros'; e.publico = e.publico || 'Todo público';
      if (finEfectivo(e) < hoy) continue;
      mapa.set(claveDup(e), e);
    }
    estado.todos = [...mapa.values()].sort((a, b) => fechaOrden(a).localeCompare(fechaOrden(b)) || a.inicio.localeCompare(b.inicio));
    pintarFiltros(); pintarDestacados(); pintar();
  }

  ['q', 'fCuando', 'fPublico', 'fGratis'].forEach(id => $(id).addEventListener('input', () => { estado.visibles = PAGINA; pintar(); }));
  $('verMas').addEventListener('click', () => { estado.visibles += PAGINA; pintar(); });
  $('cerrar').addEventListener('click', () => $('detalle').close());
  $('detalle').addEventListener('click', ev => { if (ev.target === $('detalle')) $('detalle').close(); });
  iniciar();
})();
