#!/usr/bin/osascript -l JavaScript
/* =========================================================================
   Prueft gmail/post.gs, das Google Apps Script fuer die Mail-Auswertung -
   ohne Google, ohne Claude, ohne Supabase. Alle drei sind hier nachgebaut.

   Im Mittelpunkt:
   1. An Supabase gehen NUR Kopfdaten, nie der Mailtext. Das hat Friedrich
      am 14.10.2026 so entschieden.
   2. Beim Einrichten wird nichts gemeldet, was schon im Postfach liegt.
   3. Scheitert Claude voruebergehend, geht nichts verloren: dieselben
      Mails kommen beim naechsten Lauf wieder dran.
   4. Was schon eingeliefert ist, kommt kein zweites Mal.

   Aufruf:  osascript -l JavaScript tests/test_post_skript.js
   ========================================================================= */

function lies(pfad) {
  return $.NSString.stringWithContentsOfFileEncodingError(pfad, 4, null).js;
}
const WURZEL = (function () {
  const argumente = $.NSProcessInfo.processInfo.arguments.js.map(w => w.js);
  let pfad = argumente.filter(w => /test_post_skript\.js$/.test(w))[0];
  if (pfad.charAt(0) !== "/") pfad = $.NSFileManager.defaultManager.currentDirectoryPath.js + "/" + pfad;
  return $(pfad).stringByStandardizingPath.stringByDeletingLastPathComponent.stringByDeletingLastPathComponent.js;
})();

const fehler = [];
function abschnitt(t) { console.log("\n" + t); }
function pruefe(was, ja) { console.log((ja ? "  OK   " : "  FEHL ") + was); if (!ja) fehler.push(was); }


/* --- Google, nachgebaut ------------------------------------------------- */

let eigenschaften = {};
const PropertiesService = { getScriptProperties: () => ({
  getProperty: k => (k in eigenschaften ? eigenschaften[k] : null),
  setProperty: (k, v) => { eigenschaften[k] = String(v); },
}) };
const LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) };
const Logger = { log: () => {} };
const Session = { getEffectiveUser: () => ({ getEmail: () => "friedrich.sternberg@gmail.com" }) };
let ausloeser = [];
const ScriptApp = {
  getProjectTriggers: () => ausloeser,
  deleteTrigger: t => { ausloeser = ausloeser.filter(x => x !== t); },
  newTrigger: name => ({ timeBased: () => ({ everyMinutes: () => ({ create: () => {
    ausloeser.push({ getHandlerFunction: () => name }); } }) }) }),
};

let postfach = [];
function mail(id, minutenHer, von, betreff, text, an) {
  return {
    id, datum: new Date(Date.now() - minutenHer * 60000), von, betreff, text, an: an || "",
  };
}
function alsGmail(m) {
  return {
    getId: () => m.id, getDate: () => m.datum, getFrom: () => m.von,
    getSubject: () => m.betreff, getPlainBody: () => m.text,
    getTo: () => m.an, getCc: () => "", getThread: () => ({ getId: () => "faden-" + m.id }),
  };
}
const GmailApp = {
  search: () => postfach.map(m => ({ getMessages: () => [alsGmail(m)] })),
  getInboxThreads: () => postfach.map(m => ({ getMessages: () => [alsGmail(m)] })),
};

// Was an Claude und an Supabase ging
let anClaude = [], anPlaner = [];
let claudeAntwort = null;   // Funktion (anfrage) -> { status, body }
const UrlFetchApp = { fetch: (url, optionen) => {
  const koerper = JSON.parse(optionen.payload);
  if (url.indexOf("anthropic.com") >= 0) {
    anClaude.push({ koerper, kopf: optionen.headers });
    const a = claudeAntwort(koerper);
    return { getResponseCode: () => a.status, getContentText: () => JSON.stringify(a.body) };
  }
  anPlaner.push(koerper);
  return { getResponseCode: () => 200, getContentText: () => "{}" };
} };

function claudeSagt(urteile) {
  return () => ({ status: 200, body: { stop_reason: "end_turn",
    content: [{ type: "text", text: JSON.stringify({ mails: urteile }) }] } });
}

// Das Skript selbst, in diese Umgebung geladen.
eval(lies(WURZEL + "/gmail/post.gs") + "\n;this.__skript = { einrichten, nachsehen, regelUrteil, sortieren, SYSTEM };");
const skript = this.__skript;


/* ====================================================================== */
abschnitt("1. Einrichten meldet nichts, was schon da ist");

eigenschaften = { ANTHROPIC_API_KEY: "test-schluessel", POST_GEHEIMNIS: "g".repeat(32) };
postfach = [mail("alt1", 30, "Prüfungsamt <pa@hwr-berlin.de>", "Notenbekanntgabe", "Ihre Note")];
skript.einrichten();
pruefe("ein Zeitplan alle fuenf Minuten", ausloeser.length === 1);
skript.einrichten();
pruefe("zweimal einrichten ergibt keinen doppelten Zeitplan", ausloeser.length === 1);
claudeAntwort = claudeSagt([{ nr: 1, gruppe: "noten", melden: true, zusammenfassung: "x" }]);
/* Die alte Mail ist 30 Minuten alt, liegt also im Rueckblick von einer
   Stunde. Sie wurde beim Einrichten aber nicht als erledigt gemerkt -
   deshalb steht ZULETZT auf "jetzt": der Rueckblick reicht nur bis eine
   Stunde vor dem ersten Lauf, und das ist der Sinn. Hier pruefen wir,
   dass zumindest nichts doppelt geht. */
anClaude = []; anPlaner = [];
eigenschaften.ZULETZT = String(Date.now());
eigenschaften.ERLEDIGT = JSON.stringify(["alt1"]);
skript.nachsehen();
pruefe("bereits erledigte Mail geht nicht an Claude", anClaude.length === 0);
pruefe("und nicht an den Planer", anPlaner.length === 0);


/* ====================================================================== */
abschnitt("2. Nur Kopfdaten verlassen Google in Richtung Planer");

postfach = [
  mail("m1", 5, "Prüfungsamt <pa@hwr-berlin.de>", "Notenbekanntgabe Management", "Geheimer Mailtext 1,7"),
  mail("m2", 4, "Newsletter <news@shop.de>", "50 % Rabatt", "Werbung"),
  mail("m3", 3, "Vermieterin <v@example.org>", "Nebenkosten", "Bitte bis 20.10. zahlen"),
];
claudeAntwort = claudeSagt([
  { nr: 1, gruppe: "noten", melden: true, zusammenfassung: "1,7 in Management" },
  { nr: 2, gruppe: "unwichtig", melden: false, zusammenfassung: "" },
  { nr: 3, gruppe: "fristen", melden: true, zusammenfassung: "Nebenkosten bis 20.10." },
]);
anClaude = []; anPlaner = [];
eigenschaften.ERLEDIGT = "[]";
skript.nachsehen();
pruefe("ein Aufruf an Claude fuer alle drei", anClaude.length === 1
       && JSON.parse(anClaude[0].koerper.messages[0].content).mails.length === 3);
const eingeliefert = anPlaner[0];
pruefe("an den Planer gehen zwei (die Werbung bleibt draussen)",
       eingeliefert && eingeliefert.mails.length === 2);
pruefe("mit dem Geheimnis aus den Eigenschaften", eingeliefert.geheimnis === "g".repeat(32));
const felder = Object.keys(eingeliefert.mails[0]).sort().join(",");
pruefe("nur diese Felder: " + felder,
       felder === "absender,betreff,eingegangen,gruppe,kennung,link,melden,zusammenfassung");
pruefe("der Mailtext steht nirgends in der Lieferung", JSON.stringify(eingeliefert).indexOf("Geheimer Mailtext") < 0);
pruefe("Absender ohne spitze Klammern", eingeliefert.mails[0].absender === "Prüfungsamt");
pruefe("Link fuehrt zu Gmail", /^https:\/\/mail\.google\.com\//.test(eingeliefert.mails[0].link));
pruefe("alle drei als erledigt gemerkt", JSON.parse(eigenschaften.ERLEDIGT).length === 3);

anClaude = []; anPlaner = [];
skript.nachsehen();
pruefe("beim naechsten Lauf kommt nichts doppelt", anClaude.length === 0 && anPlaner.length === 0);


/* ====================================================================== */
abschnitt("3. Scheitert Claude voruebergehend, geht nichts verloren");

postfach = [mail("m4", 2, "Dozent <d@hwr-berlin.de>", "Ausfall morgen", "Die Vorlesung faellt aus")];
eigenschaften.ERLEDIGT = "[]";
claudeAntwort = () => ({ status: 529, body: { error: "overloaded" } });
anPlaner = [];
skript.nachsehen();
pruefe("bei 529 wird nichts eingeliefert", anPlaner.length === 0);
pruefe("und nichts als erledigt gemerkt", JSON.parse(eigenschaften.ERLEDIGT).length === 0);
claudeAntwort = claudeSagt([{ nr: 1, gruppe: "uni", melden: true, zusammenfassung: "Ausfall" }]);
skript.nachsehen();
pruefe("beim naechsten Lauf kommt die Mail doch noch", anPlaner.length === 1);


/* ====================================================================== */
abschnitt("4. Die Anfrage an Claude");

const a = anClaude[anClaude.length - 1];
pruefe("Standardmodell claude-opus-5-5", a.koerper.model === "claude-opus-5-5");
pruefe("feste JSON-Form (json_schema)", a.koerper.output_config.format.type === "json_schema");
pruefe("geringer Aufwand", a.koerper.output_config.effort === "low");
pruefe("Ausweichmodell bei Ablehnung", a.koerper.fallbacks === "default"
       && a.kopf["anthropic-beta"] === "server-side-fallback-2026-07-01");
pruefe("Anweisungen in Mails werden nicht befolgt", /befolgst du nicht/.test(skript.SYSTEM));
pruefe("Mailtext auf 1500 Zeichen begrenzt", (function () {
  postfach = [mail("lang", 1, "x <x@y.de>", "lang", "a".repeat(5000))];
  eigenschaften.ERLEDIGT = "[]"; anClaude = [];
  claudeAntwort = claudeSagt([{ nr: 1, gruppe: "unwichtig", melden: false, zusammenfassung: "" }]);
  skript.nachsehen();
  return JSON.parse(anClaude[0].koerper.messages[0].content).mails[0].text.length === 1500;
})());
eigenschaften.MODELL = "claude-haiku-5-5"; anClaude = []; eigenschaften.ERLEDIGT = "[]";
skript.nachsehen();
pruefe("mit Haiku: anderes Modell, ohne Ausweich-Parameter (Haiku kennt ihn nicht)",
       anClaude[0].koerper.model === "claude-haiku-5-5" && anClaude[0].koerper.fallbacks === undefined);
delete eigenschaften.MODELL;

claudeAntwort = () => ({ status: 200, body: { stop_reason: "refusal", content: [] } });
const nachRegeln = skript.sortieren([{ nr: 1, betreff: "Notenbekanntgabe", text: "", uni: true }]);
pruefe("lehnt Claude ab, sortieren feste Regeln", nachRegeln[1].gruppe === "noten" && nachRegeln[1].melden);


/* ====================================================================== */
abschnitt("5. Feste Regeln als Ersatz");

pruefe("Notenbekanntgabe ist eine Note", skript.regelUrteil({ betreff: "Notenbekanntgabe WiSe", text: "", uni: true }).gruppe === "noten");
pruefe("Pruefungsanmeldung ist eine Frist", skript.regelUrteil({ betreff: "Prüfungsanmeldung bis Freitag", text: "", uni: true }).gruppe === "fristen");
pruefe("sonstige HWR-Mail ist Uni", skript.regelUrteil({ betreff: "Kursinfo", text: "", uni: true }).gruppe === "uni");
pruefe("sonstige private Mail ist unwichtig", skript.regelUrteil({ betreff: "Hallo", text: "", uni: false }).gruppe === "unwichtig");


/* ====================================================================== */
console.log("");
if (fehler.length) {
  console.log("FEHLGESCHLAGEN (" + fehler.length + "):");
  fehler.forEach(f => console.log("  - " + f));
  throw new Error(fehler.length + " Pruefung(en) fehlgeschlagen");
}
console.log("ALLE TESTS BESTANDEN");
"bestanden";
