#!/usr/bin/osascript -l JavaScript
/* =========================================================================
   Prueft vorkommen.js: wann eine (wiederkehrende) Erinnerung dran ist.

   Dieselbe Datei rechnet in der App und auf dem Server. Ein Fehler hier
   heisst also: falsche Anzeige UND falsche Benachrichtigung. Deshalb die
   Raender einzeln - Monatsende, Schaltjahr, Wochenende, Zeitumstellung.

   Aufruf:  osascript -l JavaScript tests/test_erinnerungen.js
   ========================================================================= */

function lies(pfad) {
  return $.NSString.stringWithContentsOfFileEncodingError(pfad, 4, null).js;
}

const WURZEL = (function () {
  const argumente = $.NSProcessInfo.processInfo.arguments.js.map(w => w.js);
  let eigenerPfad = "";
  for (const wert of argumente) {
    if (typeof wert === "string" && /test_erinnerungen\.js$/.test(wert)) eigenerPfad = wert;
  }
  if (!eigenerPfad) throw new Error("Eigener Pfad nicht in der Aufrufzeile gefunden");
  if (eigenerPfad.charAt(0) !== "/") {
    eigenerPfad = $.NSFileManager.defaultManager.currentDirectoryPath.js + "/" + eigenerPfad;
  }
  return $(eigenerPfad).stringByStandardizingPath
    .stringByDeletingLastPathComponent.stringByDeletingLastPathComponent.js;
})();

eval(lies(WURZEL + "/vorkommen.js"));
const V = globalThis.ErinnerungVorkommen;

const fehler = [];
const ausgabe = [];
function pruefe(was, ok, zusatz) {
  ausgabe.push((ok ? "  OK   " : "  FEHL ") + was + (ok || zusatz === undefined ? "" : "  -> " + zusatz));
  if (!ok) fehler.push(was);
}
function abschnitt(titel) { ausgabe.push("\n" + titel); }


abschnitt("1. Einmalig");
pruefe("vor dem Zeitpunkt: noch nichts dran", V.letztes("2026-10-20T18:00", "", "2026-10-20T17:59") === "");
pruefe("genau zum Zeitpunkt: dran", V.letztes("2026-10-20T18:00", "", "2026-10-20T18:00") === "2026-10-20T18:00");
pruefe("danach bleibt es dasselbe Vorkommen", V.letztes("2026-10-20T18:00", "", "2026-10-25T09:00") === "2026-10-20T18:00");
pruefe("naechstes vorher: der Zeitpunkt", V.naechstes("2026-10-20T18:00", "", "2026-10-20T12:00") === "2026-10-20T18:00");
pruefe("naechstes danach: vorbei (leer)", V.naechstes("2026-10-20T18:00", "", "2026-10-20T18:00") === "");


abschnitt("2. Taeglich und woechentlich");
pruefe("taeglich: letztes ist heute 18:00", V.letztes("2026-10-01T18:00", "taeglich", "2026-10-20T19:00") === "2026-10-20T18:00");
pruefe("taeglich: vor 18 Uhr ist es gestern", V.letztes("2026-10-01T18:00", "taeglich", "2026-10-20T17:00") === "2026-10-19T18:00");
pruefe("taeglich: naechstes", V.naechstes("2026-10-01T18:00", "taeglich", "2026-10-20T19:00") === "2026-10-21T18:00");
/* Am 25.10.2026 endet die Sommerzeit. Gerechnet wird in Ortszeit: die
   Uhrzeit bleibt 18:00, es verrutscht nichts um eine Stunde. */
pruefe("ueber die Zeitumstellung (25.10.) bleibt es 18:00",
       V.naechstes("2026-10-24T18:00", "taeglich", "2026-10-24T18:30") === "2026-10-25T18:00"
       && V.naechstes("2026-10-24T18:00", "taeglich", "2026-10-25T18:30") === "2026-10-26T18:00");
pruefe("woechentlich: immer dienstags", V.naechstes("2026-10-20T09:00", "woechentlich", "2026-10-21T00:00") === "2026-10-27T09:00");
pruefe("woechentlich ueber den Jahreswechsel", V.naechstes("2026-12-29T09:00", "woechentlich", "2026-12-30T00:00") === "2027-01-05T09:00");


abschnitt("3. Werktags");
// 23.10.2026 ist ein Freitag.
pruefe("Freitag abends: naechstes ist Montag", V.naechstes("2026-10-19T07:30", "werktags", "2026-10-23T08:00") === "2026-10-26T07:30");
pruefe("Samstag: letztes ist Freitag", V.letztes("2026-10-19T07:30", "werktags", "2026-10-24T12:00") === "2026-10-23T07:30");
pruefe("Anker am Sonntag: erstes Mal Montag", V.vorkommen("2026-10-25T07:30", "werktags", 0) === "2026-10-26T07:30");
let werktagOk = true;
for (let k = 0; k < 60; k++) {
  const tag = V.vorkommen("2026-10-19T07:30", "werktags", k).slice(0, 10);
  const wt = new Date(tag + "T12:00:00Z").getUTCDay();
  if (wt === 0 || wt === 6) werktagOk = false;
  if (k > 0 && V.vorkommen("2026-10-19T07:30", "werktags", k - 1) >= V.vorkommen("2026-10-19T07:30", "werktags", k)) werktagOk = false;
}
pruefe("60 Werktage hintereinander: nie Wochenende, immer aufsteigend", werktagOk);
pruefe("5 Werktage = genau eine Woche spaeter", V.vorkommen("2026-10-21T07:30", "werktags", 5) === "2026-10-28T07:30");


abschnitt("4. Monatlich und jaehrlich");
pruefe("am 31.: im November der 30.", V.vorkommen("2026-10-31T09:00", "monatlich", 1) === "2026-11-30T09:00");
pruefe("am 31.: im Dezember wieder der 31.", V.vorkommen("2026-10-31T09:00", "monatlich", 2) === "2026-12-31T09:00");
pruefe("am 31.: Februar 2027 der 28.", V.vorkommen("2026-10-31T09:00", "monatlich", 4) === "2027-02-28T09:00");
pruefe("am 31.: Februar 2028 (Schaltjahr) der 29.", V.vorkommen("2026-10-31T09:00", "monatlich", 16) === "2028-02-29T09:00");
pruefe("Monatserster: naechstes", V.naechstes("2026-01-01T10:00", "monatlich", "2026-10-20T00:00") === "2026-11-01T10:00");
pruefe("jaehrlich: Geburtstag", V.naechstes("2000-03-14T09:00", "jaehrlich", "2026-10-20T00:00") === "2027-03-14T09:00");
pruefe("jaehrlich am 29.02.: 2027 der 28.02.", V.vorkommen("2024-02-29T09:00", "jaehrlich", 3) === "2027-02-28T09:00");
pruefe("jaehrlich am 29.02.: 2028 wieder der 29.", V.vorkommen("2024-02-29T09:00", "jaehrlich", 4) === "2028-02-29T09:00");


abschnitt("5. Unsinn wird abgewiesen");
pruefe("kaputter Anker: nichts", V.letztes("morgen", "", "2026-10-20T18:00") === "" && V.naechstes("2026-13-45T99:00x", "", "2026") === "");
pruefe("unbekannte Regel: nichts", V.letztes("2026-10-20T18:00", "stuendlich", "2026-10-21T00:00") === "");
pruefe("alle Regeln haben einen Namen", V.WIEDERHOLUNGEN.every(w => V.regelText(w[0])));
pruefe("Anker in der Zukunft: letztes leer, naechstes der Anker",
       V.letztes("2027-01-01T09:00", "taeglich", "2026-10-20T00:00") === ""
       && V.naechstes("2027-01-01T09:00", "taeglich", "2026-10-20T00:00") === "2027-01-01T09:00");


abschnitt("6. letztes und naechstes passen zusammen");
/* Fuer jede Regel und viele Zeitpunkte: letztes <= jetzt < naechstes, und
   zwischen beiden liegt kein weiteres Vorkommen. Sonst schickte der
   Server etwas anderes, als die App ankuendigt. */
let passt = true, gezaehlt = 0;
const regeln = V.WIEDERHOLUNGEN.map(w => w[0]).filter(Boolean);
for (const regel of regeln) {
  for (let tag = 0; tag < 400; tag += 7) {
    const d = new Date(Date.UTC(2026, 9, 20 + tag, 12));
    const jetzt = d.toISOString().slice(0, 10) + "T" + (tag % 2 ? "08:59" : "21:15");
    const l = V.letztes("2026-08-31T09:00", regel, jetzt), n = V.naechstes("2026-08-31T09:00", regel, jetzt);
    gezaehlt++;
    if (!(l && l <= jetzt && n > jetzt && l < n)) { passt = false; break; }
    for (let k = 0; k < 600; k++) {
      const v = V.vorkommen("2026-08-31T09:00", regel, k);
      if (v > l && v < n) { passt = false; break; }
      if (v >= n) break;
    }
  }
}
pruefe("letztes <= jetzt < naechstes, nichts dazwischen (" + gezaehlt + " Faelle)", passt);


console.log(ausgabe.join("\n"));
if (fehler.length) {
  console.log("\nFEHLGESCHLAGEN: " + fehler.join(", "));
  throw new Error(fehler.length + " Pruefung(en) fehlgeschlagen");
}
console.log("\nALLE TESTS BESTANDEN");
"bestanden";
