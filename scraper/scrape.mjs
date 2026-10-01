// Rastreador de eventos culturales de Rosario.
// Se ejecuta solo, todos los días, desde GitHub Actions (no hace falta tocarlo).
// Las fuentes se agregan/quitan en scraper/fuentes.json.
// Uso manual: node scraper/scrape.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(AQUI, '..', 'data');
const UA = 'Mozilla/5.0 (compatible; AgendaCulturalRosario/1.0)';
const MESES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
const HOY = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10); // fecha en Argentina (UTC-3)
const LIMITE = new Date(Date.now() + 240 * 864e5).toISOString().slice(0, 10); // solo próximos ~8 meses

// ---------- utilidades ----------
const pad = n => String(n).padStart(2, '0');
const decodificar = s => String(s ?? '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
const texto = html => decodificar(String(html ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<[^>]+>/g, ''))
  .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
const sinTildes = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const absoluta = (u, base) => { try { return u ? new URL(decodificar(u), base).href : ''; } catch { return ''; } };
const recorte = (s, n) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s);

async function bajar(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'es-AR,es;q=0.9' }, signal: AbortSignal.timeout(25000), redirect: 'follow' });
  if (!r.ok) throw new Error(`HTTP ${r.status} en ${url}`);
  return r.text();
}
const enLotes = async (items, n, fn) => {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]).catch(() => null); } }));
  return out;
};

// Normaliza una fecha a "YYYY-MM-DD" o "YYYY-MM-DDTHH:MM:00-03:00"
function normFecha(s) {
  if (!s) return '';
  s = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s)) return s.length === 16 ? s + ':00-03:00' : s + '-03:00';
  return s;
}
const soloDia = s => (s || '').slice(0, 10);

// ---------- clasificación automática ----------
const GENEROS = [
  ['Infantil', /infantil|ni[ñn]os|ni[ñn]as|t[íi]teres|cuentacuentos|granja|infancia/],
  ['Música', /m[úu]sica|concierto|recital|banda|orquesta|\bcoro\b|sinf[óo]nic|\brock\b|cumbia|folklore|\bjazz\b|\btrap\b|\bdj\b|cantante|cantautor|\btango\b|[óo]pera\b|show en vivo|festival de m/],
  ['Teatro', /teatro|obra de|comedia|drama|monólogo|monologo|unipersonal|impro/],
  ['Danza', /danza|ballet|baile|milonga|folklore.*baile|contempor[áa]ne.*danza/],
  ['Cine', /cine|pel[íi]cula|film|proyecci[óo]n|documental|cortometraje|fulldome/],
  ['Artes visuales', /muestra|exposici[óo]n|galer[íi]a|escultura|pintura|fotograf|museo|arte visual|artes visuales|instalaci[óo]n/],
  ['Literatura', /libro|literatur|poes[íi]a|biblioteca|lectura|escritor|feria del libro/],
  ['Humor', /humor|stand.?up|comediante/],
  ['Charlas y talleres', /taller|charla|conferencia|curso|seminario|workshop|clase|encuentro|congreso/],
  ['Festivales y ferias', /festival|feria|fiesta|carnaval|mercado|expo\b/],
];
const clasificarGenero = t => { const s = sinTildes(t); for (const [g, re] of GENEROS) if (re.test(s)) return g; return 'Otros'; };
function clasificarPublico(t) {
  const s = sinTildes(t);
  if (/\+ ?18|mayores de 18|solo adultos|adultos/.test(s)) return 'Adultos (+18)';
  if (/beb[eé]s|primera infancia/.test(s)) return 'Bebés y primera infancia';
  if (/infantil|ni[ñn]os|ni[ñn]as|chicos|t[íi]teres|cuentacuentos|granja/.test(s)) return 'Infantil y familiar';
  if (/familia|en familia|todas las edades/.test(s)) return 'Familiar';
  if (/j[óo]venes|adolescentes|juvenil/.test(s)) return 'Jóvenes';
  return 'Todo público';
}

// ---------- extractores ----------
function* jsonLdEventos(html) {
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  const visitar = function* (n) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { for (const x of n) yield* visitar(x); return; }
    const tipo = [].concat(n['@type'] || []).join(' ');
    if (/Event\b/.test(tipo)) yield n;
    if (n['@graph']) yield* visitar(n['@graph']);
    if (n.itemListElement) yield* visitar(n.itemListElement);
    if (n.item) yield* visitar(n.item);
  };
  while ((m = re.exec(html))) { try { yield* visitar(JSON.parse(m[1].trim())); } catch { /* json roto: lo saltamos */ } }
}

function desdeJsonLd(e, base, fuente) {
  const loc = [].concat(e.location || [])[0] || {};
  const dir = loc.address || {};
  const lugar = [loc.name, typeof dir === 'string' ? dir : [dir.streetAddress, dir.addressLocality].filter(Boolean).join(', ')].filter(Boolean).join(' — ');
  const ofertas = [].concat(e.offers || []).flatMap(o => (o && o.offers ? [].concat(o.offers) : [o])).filter(Boolean);
  const gratis = e.isAccessibleForFree === true || (ofertas.length > 0 && ofertas.every(o => Number(o.price) === 0 && o.price !== ''));
  let img = [].concat(e.image || [])[0];
  if (img && typeof img === 'object') img = img.url;
  const url = absoluta(e.url || ofertas[0]?.url, base);
  return {
    titulo: texto(e.name), inicio: normFecha(e.startDate), fin: normFecha(e.endDate),
    lugar, descripcion: texto(e.description), imagen: absoluta(img, base), url,
    ubicacionCruda: JSON.stringify(loc) + ' ' + lugar,
    online: /Virtual/i.test(loc['@type'] || '') || /Online/i.test(e.eventAttendanceMode || ''),
    entradas: { gratis, url: absoluta(ofertas.find(o => o.url)?.url || e.url, base) },
  };
}

function* ical(textoIcs) {
  const lineas = textoIcs.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  let ev = null;
  for (const l of lineas) {
    if (l === 'BEGIN:VEVENT') ev = {};
    else if (l === 'END:VEVENT') { if (ev) yield ev; ev = null; }
    else if (ev) {
      const i = l.indexOf(':'); if (i < 0) continue;
      ev[l.slice(0, i).split(';')[0]] = l.slice(i + 1).replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
    }
  }
}
function fechaIcal(v) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(v || '');
  if (!m) return '';
  if (!m[4]) return `${m[1]}-${m[2]}-${m[3]}`;
  if (m[7]) { const d = new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) - 3 * 3600e3); return d.toISOString().slice(0, 19) + '-03:00'; }
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00-03:00`;
}

// Agenda oficial de la Municipalidad de Rosario (HTML sin datos estructurados)
async function agendaMunicipal(f) {
  const base = f.url;
  const listado = await bajar(f.url);
  const hoyAnio = +HOY.slice(0, 4);
  // cada tarjeta del listado trae el enlace y la fecha "dd.mm" o "dd.mm al dd.mm"
  const tarjetas = new Map();
  for (const m of listado.matchAll(/<actividad[\s\S]*?<a href="([^"]+)"[\s\S]*?fecha-card[^>]*>([\s\S]*?)<\/div>/g)) {
    const t = texto(m[2]).match(/(\d{1,2})\.(\d{1,2})(?:\s*al\s*(\d{1,2})\.(\d{1,2}))?/);
    if (!t) continue;
    const anio = +t[2] < +HOY.slice(5, 7) - 4 ? hoyAnio + 1 : hoyAnio; // en octubre, "03.01" es del año próximo
    const d = `${anio}-${pad(t[2])}-${pad(t[1])}`;
    let h = t[3] ? `${anio}-${pad(t[4])}-${pad(t[3])}` : '';
    if (h && h < d) h = `${anio + 1}-${pad(t[4])}-${pad(t[3])}`;
    tarjetas.set(absoluta(m[1], base), { d, h });
  }
  const enlaces = [...tarjetas.keys()].slice(0, f.maximo || 60);
  const paginas = await enLotes(enlaces, 4, async url => ({ url, html: await bajar(url) }));
  const salida = [];
  for (const p of paginas.filter(Boolean)) {
    const h = p.html;
    const titulo = texto(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(h)?.[1]);
    if (!titulo) continue;
    const primera = tarjetas.get(p.url);
    if (!primera || (primera.h || primera.d) < HOY || primera.d > LIMITE) continue;
    const horaM = /class="hora[^"]*"[^>]*>\s*(?:de\s*)?(\d{1,2})(?:[:.](\d{2}))?/i.exec(h) || /(\d{1,2})[:.](\d{2})\s*h(?:s|oras)/i.exec(texto(h));
    const inicio = horaM ? `${primera.d}T${pad(horaM[1])}:${pad(horaM[2] || '00')}:00-03:00` : primera.d;
    const lugar = texto(/title-lugar">([\s\S]*?)<\/p>/.exec(h)?.[1]);
    const desc = texto(/class="descripcion">([\s\S]*?)<\/div>\s*<div class="etiquetas/.exec(h)?.[1] || /class="descripcion">([\s\S]*?)<\/div>/.exec(h)?.[1]);
    const etiquetas = [...h.matchAll(/etiquetas\[\d+\]=\d+">([^<]+)</g)].map(m => decodificar(m[1]).trim());
    // la foto propia del evento vive en /sites/default/files/; el og:image genérico es el logo de la Municipalidad
    const og = /<(?:img|source)[^>]+(?:src|srcset)="([^"\s]*\/sites\/default\/files\/[^"\s]+)/.exec(h)?.[1];
    const precio = sinTildes(texto(h));
    const gratis = /entrada libre|gratuit|libre y gratuit|acceso libre|entrada gratuita|sin cargo/.test(precio);
    salida.push({
      titulo, inicio, fin: primera.h, lugar: lugar ? `${lugar}, Rosario` : 'Rosario', descripcion: desc, imagen: absoluta(og, base), url: p.url,
      etiquetas, entradas: { gratis, url: p.url, texto: gratis ? 'Entrada libre y gratuita' : 'Consultar en la página oficial de la agenda municipal' },
    });
  }
  return salida;
}

async function desdeFuente(f) {
  if (f.tipo === 'agenda-municipal') return agendaMunicipal(f);
  const urls = [].concat(f.url);
  const crudos = [];
  for (const u of urls) {
    const cuerpo = await bajar(u);
    if (f.tipo === 'ical') {
      for (const v of ical(cuerpo)) crudos.push({
        titulo: texto(v.SUMMARY), inicio: fechaIcal(v.DTSTART), fin: fechaIcal(v.DTEND), lugar: v.LOCATION || '', descripcion: texto(v.DESCRIPTION),
        imagen: '', url: v.URL || '', ubicacionCruda: v.LOCATION || '', entradas: { gratis: false, url: v.URL || '' },
      });
    } else { // jsonld: página de listado y, opcionalmente, cada página de evento
      let lista = [...jsonLdEventos(cuerpo)].map(e => desdeJsonLd(e, u, f));
      if (f.seguirEnlaces) {
        const ya = new Set(lista.map(e => e.url));
        const re = new RegExp(f.seguirEnlaces, 'g');
        const enlaces = [...new Set([...cuerpo.matchAll(re)].map(m => absoluta(m[1] || m[0], u)))].filter(x => x && !ya.has(x)).slice(0, f.maximo || 40);
        const detalles = await enLotes(enlaces, 4, async x => [...jsonLdEventos(await bajar(x))].map(e => desdeJsonLd({ url: x, ...e }, x, f)));
        lista = lista.concat(detalles.flat().filter(Boolean));
      }
      crudos.push(...lista);
    }
  }
  return crudos;
}

// ---------- proceso principal ----------
const fuentes = JSON.parse(await fs.readFile(path.join(AQUI, 'fuentes.json'), 'utf8')).filter(f => f.activa !== false);
let previos = [];
try { previos = JSON.parse(await fs.readFile(path.join(DATA, 'eventos.json'), 'utf8')).eventos || []; } catch { /* primera vez */ }

const estado = [];
let todos = [];
for (const f of fuentes) {
  const t0 = Date.now();
  try {
    const bruto = await desdeFuente(f);
    const filtrados = bruto.filter(e => {
      if (!e.titulo || !e.inicio) return false;
      if (e.online && !f.aceptarOnline) return false;
      if (f.excluirGeneros?.includes(clasificarGenero(`${e.titulo} ${e.descripcion.slice(0, 400)}`))) return false;
      const d = soloDia(e.fin && e.fin > e.inicio ? e.fin : e.inicio);
      if (d < HOY || soloDia(e.inicio) > LIMITE) return false;
      if (f.soloRosario !== false && f.tipo !== 'agenda-municipal' && !/rosario/i.test(`${e.ubicacionCruda || ''} ${e.lugar}`)) return false;
      return true;
    });
    for (const e of filtrados) todos.push({ ...e, fuente: f.nombre });
    estado.push({ fuente: f.nombre, ok: true, encontrados: bruto.length, publicados: filtrados.length, segundos: +((Date.now() - t0) / 1000).toFixed(1) });
    console.log(`✔ ${f.nombre}: ${filtrados.length} eventos`);
  } catch (err) {
    // si una web falla o cambia, conservamos lo que ya teníamos de esa fuente
    const guardados = previos.filter(e => e.fuente === f.nombre && soloDia(e.fin || e.inicio) >= HOY);
    todos.push(...guardados);
    estado.push({ fuente: f.nombre, ok: false, error: String(err.message || err), conservados: guardados.length });
    console.warn(`✘ ${f.nombre}: ${err.message} (se conservan ${guardados.length})`);
  }
}

// completar, clasificar y eliminar duplicados
const vistos = new Map();
for (const e of todos) {
  const base = `${e.titulo} ${e.descripcion} ${(e.etiquetas || []).join(' ')}`;
  e.genero = e.genero || clasificarGenero(`${e.titulo} ${(e.etiquetas || []).join(' ')} ${e.descripcion.slice(0, 400)}`);
  e.publico = e.publico || clasificarPublico(base);
  if (e.entradas) e.entradas.texto = e.entradas.texto || (e.entradas.gratis ? 'Entrada libre y gratuita' : e.entradas.url ? 'Comprá o reservá en el sitio del evento' : 'Consultar con la organización');
  e.descripcion = recorte(e.descripcion || 'Sin descripción disponible. Consultá el enlace del evento para más información.', 600);
  e.id = 'e' + [...`${sinTildes(e.titulo)}|${soloDia(e.inicio)}`].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36);
  delete e.ubicacionCruda; delete e.online; delete e.etiquetas;
  const clave = sinTildes(e.titulo).replace(/[^a-z0-9]/g, '') + soloDia(e.inicio);
  if (!vistos.has(clave) || (!vistos.get(clave).imagen && e.imagen)) vistos.set(clave, e);
}
const eventos = [...vistos.values()].sort((a, b) => a.inicio.localeCompare(b.inicio));

await fs.mkdir(DATA, { recursive: true });
await fs.writeFile(path.join(DATA, 'eventos.json'), JSON.stringify({ actualizado: new Date().toISOString(), eventos }, null, 1));
await fs.writeFile(path.join(DATA, 'estado.json'), JSON.stringify({ actualizado: new Date().toISOString(), total: eventos.length, fuentes: estado }, null, 1));
console.log(`\nListo: ${eventos.length} eventos publicados.`);
