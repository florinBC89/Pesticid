/** @OnlyCurrentDoc */
/**
 * Pesticid — rapoartele din „Raportează o problemă” → Google Sheet.
 * Se lipește în Google Sheet: Extensions (Extensii) → Apps Script, apoi Deploy → New deployment → Web app
 * (Execute as: Me · Who has access: Anyone). URL-ul web app-ului se salvează în Vault ca `gsheet_url`.
 * @OnlyCurrentDoc (prima linie): scriptul are acces DOAR la acest Sheet, nu la restul fișierelor din Drive.
 * TOKEN trebuie să fie identic cu secretul `gsheet_token` din Vault (nu îl pune în Git).
 */
const TOKEN = 'LIPESTE_AICI_TOKENUL';
const SHEET = 'Rapoarte';
const COLOANE = ['Nr.', 'Data', 'Subiect', 'Status', 'Email', 'Descriere', 'Fișiere', 'Linkuri fișiere', 'Pagina', 'Dispozitiv', 'Ecran', 'Produs', 'Cultură', 'Dăunător', 'Doză'];
const SUBIECTE = ['Calculatorul de doză', 'Căutarea de produse', 'O doză sau un produs pare greșit', 'Înscrierea / emailul', 'Altceva'];
const STATUSURI = ['Nou', 'În lucru', 'Rezolvat', 'Ignorat'];

function foaie_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET);
  if (!sh) sh = ss.insertSheet(SHEET);
  if (sh.getLastRow() === 0) {
    sh.appendRow(COLOANE);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, COLOANE.length).setFontWeight('bold').setBackground('#cedbf6');
    sh.setColumnWidth(6, 420); sh.setColumnWidth(8, 260);
    // liste de alegeri pe Subiect și Status, ca să filtrezi și să schimbi statusul dintr-un click
    sh.getRange('C2:C').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(SUBIECTE, true).setAllowInvalid(true).build());
    sh.getRange('D2:D').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(STATUSURI, true).build());
    sh.getRange(1, 1, sh.getMaxRows(), COLOANE.length).createFilter();
  }
  return sh;
}

// textul care începe cu = + - @ ar fi interpretat ca formulă → îl forțăm text
function celula_(v) { const t = v == null ? '' : String(v); return /^[=+\-@\t\r]/.test(t) ? "'" + t : t; }

function doPost(e) {
  let d;
  try { d = JSON.parse(e.postData.contents); } catch (err) { return ContentService.createTextOutput('bad json'); }
  if (d.token !== TOKEN) return ContentService.createTextOutput('forbidden');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = foaie_();
    sh.appendRow([d.nr, d.data, d.subiect, d.status || 'Nou', d.email, d.descriere, Number(d.fisiere) || 0, d.linkuri, d.pagina, d.dispozitiv, d.ecran, d.produs, d.cultura, d.tinta, d.doza].map(function (v, i) { return i === 6 ? v : celula_(v); }));
    sh.getRange(sh.getLastRow(), 6, 1, 3).setWrap(true);
  } finally { lock.releaseLock(); }
  return ContentService.createTextOutput('ok');
}

/** Rulează o dată din editor (▶ Run) ca să creezi foaia cu coloanele și filtrele, înainte de primul raport. */
function pregateste() { foaie_(); }
