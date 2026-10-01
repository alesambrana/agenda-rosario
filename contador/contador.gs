/**
 * CONTADOR DE CONSULTAS — se pega una sola vez en Google Apps Script.
 * Anota cuántas veces la gente abre cada evento y cuántas veces toca "Ir al sitio".
 * Con esos números la web arma la sección "Lo más consultado".
 * Los pasos están en GUIA.md (sección 4).
 */
const HOJA = 'Consultas';

function hoja_() {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  let h = libro.getSheetByName(HOJA);
  if (!h) { h = libro.insertSheet(HOJA); h.appendRow(['Evento (id)', 'Veces que se abrió', 'Clics en entradas', 'Última consulta']); }
  return h;
}

// La web avisa cada vez que alguien abre un evento
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const d = JSON.parse(e.postData.contents);
    const id = String(d.id || '').slice(0, 80);
    if (!id) return ContentService.createTextOutput('ok');
    const h = hoja_();
    const ids = h.getRange(2, 1, Math.max(h.getLastRow() - 1, 1), 1).getValues().map(r => r[0]);
    let fila = ids.indexOf(id) + 2;
    if (fila < 2) { h.appendRow([id, 0, 0, '']); fila = h.getLastRow(); }
    const col = d.tipo === 'entradas' ? 3 : 2;
    h.getRange(fila, col).setValue((Number(h.getRange(fila, col).getValue()) || 0) + 1);
    h.getRange(fila, 4).setValue(new Date());
  } finally { lock.release(); }
  return ContentService.createTextOutput('ok');
}

// La web pide los números para ordenar los destacados
function doGet() {
  const h = hoja_();
  const salida = {};
  if (h.getLastRow() > 1) {
    h.getRange(2, 1, h.getLastRow() - 1, 3).getValues().forEach(r => { salida[r[0]] = { ver: Number(r[1]) || 0, entradas: Number(r[2]) || 0 }; });
  }
  return ContentService.createTextOutput(JSON.stringify(salida)).setMimeType(ContentService.MimeType.JSON);
}
