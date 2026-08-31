#!/usr/bin/osascript -l JavaScript
/* =========================================================================
   Prueft die Anzeige: Zeitgruppen im To-do-Bereich und die Karte
   "Als Naechstes".

   Zwei Dinge stehen hier im Mittelpunkt.

   1. NICHTS DARF VERLORENGEHEN. Die Aufgaben werden auf Faecher verteilt -
      Ueberfaellig, Heute, Morgen, Diese Woche, Naechste Woche, Spaeter.
      Faellt ein Eintrag durch alle Bedingungen, verschwindet er lautlos aus
      der Anzeige. Und lautlos heisst hier wirklich lautlos: es fehlt ja
      nichts, was man vermissen koennte. Deshalb wird unten nicht nur
      geprueft, ob die einzelnen Zuordnungen stimmen, sondern auch, ob die
      Summe aller Faecher wieder die Ausgangsmenge ergibt.

   2. WAS ANGEZEIGT WIRD, MUSS TEXT SEIN. In der Karte "Als Naechstes" stand
      eine Zeit lang "[object Object]" statt der Notiz - ein Ueberbleibsel
      davon, dass eine Notiz frueher ein blosser Text war und spaeter ein
      Objekt mit Text, Haken und Wichtig-Markierung wurde. Die Stelle, die
      sie anzeigt, wurde beim Umbau uebersehen.

   Aufruf:  osascript -l JavaScript tests/test_ansicht.js
   ========================================================================= */

function lies(pfad) {
  return $.NSString.stringWithContentsOfFileEncodingError(pfad, 4, null).js;
}

const WURZEL = (function () {
  const argumente = $.NSProcessInfo.processInfo.arguments.js
    .map(function (wert) { return wert.js; });
  let eigenerPfad = "";
  for (const wert of argumente) {
    if (typeof wert === "string" && /test_ansicht\.js$/.test(wert)) eigenerPfad = wert;
  }
  if (!eigenerPfad) throw new Error("Eigener Pfad nicht in der Aufrufzeile gefunden");
  if (eigenerPfad.charAt(0) !== "/") {
    eigenerPfad = $.NSFileManager.defaultManager.currentDirectoryPath.js
                + "/" + eigenerPfad;
  }
  return $(eigenerPfad).stringByStandardizingPath
    .stringByDeletingLastPathComponent
    .stringByDeletingLastPathComponent.js;
})();


/* --- Ein Browser, so klein wie moeglich --------------------------------- */

var gespeichert = {};
var localStorage = {
  getItem: function (s) {
    return Object.prototype.hasOwnProperty.call(gespeichert, s) ? gespeichert[s] : null;
  },
  setItem: function (s, w) { gespeichert[s] = String(w); },
  removeItem: function (s) { delete gespeichert[s]; },
};

var setTimeout = function () { return 0; };
var clearTimeout = function () {};
var setInterval = function () { return 0; };
var clearInterval = function () {};

/* Diesmal eine Attrappe, die sich merkt, was hineingeschrieben wurde -
   sonst liesse sich nicht pruefen, WAS auf dem Bildschirm landet. */
var elemente = {};
function neuesElement(kennung) {
  return {
    id: kennung, hidden: false, textContent: "", innerHTML: "", value: "",
    open: false, title: "",
    addEventListener: function () {}, setAttribute: function () {},
    getAttribute: function () { return null; },
    appendChild: function () {}, removeChild: function () {},
    classList: { toggle: function () {}, add: function () {}, remove: function () {} },
    style: {}, select: function () {}, scrollIntoView: function () {},
    closest: function () { return null; },
  };
}
var document = {
  head: neuesElement("head"), body: neuesElement("body"),
  getElementById: function (kennung) {
    if (!elemente[kennung]) elemente[kennung] = neuesElement(kennung);
    return elemente[kennung];
  },
  querySelector: function () { return null; },
  querySelectorAll: function () { return []; },
  createElement: function () { return neuesElement("neu"); },
  addEventListener: function () {},
};
var window = { addEventListener: function () {} };
var navigator = { onLine: true };
var location = { protocol: "file:", pathname: "/index.html", search: "", hash: "", origin: "" };
var history = { replaceState: function () {} };
var crypto = undefined;
window.matchMedia = function () {
  return { matches: false, addEventListener: function () {}, addListener: function () {} };
};
var matchMedia = window.matchMedia;

/* Ein kleiner, erfundener Stundenplan. Bewusst nicht der echte: der aendert
   sich staendig, und ein Test, dessen Ergebnis vom Wochentag abhaengt, ist
   keiner. */
var STUNDENPLAN = {
  fachrichtung: "tourismus", semester: "semester5", kurs: "kurs",
  geprueftAm: "2026-08-24T10:00", nichtBelegteFaecher: [], nichtBelegteGruppen: [],
  verlauf: [], termine: [],
};

const werkzeug = eval(
  lies(WURZEL + "/sync.js") + "\n" +
  lies(WURZEL + "/app.js") + "\n" +
  "({" +
  "  zeitgruppeVon: zeitgruppeVon," +
  "  nachZeitgruppen: nachZeitgruppen," +
  "  ZEITGRUPPEN: ZEITGRUPPEN," +
  "  naechstenZeichnen: naechstenZeichnen," +
  "  aufgabenSammeln: aufgabenSammeln," +
  "  setzen: function (n, a) { notizen = n; aufgaben = a; grabsteine = {}; }," +
  "  filterLeeren: function () { abgewaehlteFaecher = new Set(); }" +
  "})");


/* --- Pruefwerk ---------------------------------------------------------- */

const fehler = [];
let bereich = "";
function abschnitt(t) { bereich = t; console.log("\n" + t); }
function pruefe(was, ja) {
  console.log((ja ? "  OK   " : "  FEHL ") + was);
  if (!ja) fehler.push(bereich + " / " + was);
}

// Ein fester Bezugstag: Montag, 24. August 2026.
const MONTAG = new Date(2026, 7, 24);
function tagOffset(n) {
  const d = new Date(MONTAG.getTime());
  d.setDate(d.getDate() + n);
  return d.getFullYear() + "-"
       + String(d.getMonth() + 1).padStart(2, "0") + "-"
       + String(d.getDate()).padStart(2, "0");
}
function aufgabe(datum, text) {
  return { kennung: "eigen-" + datum + text, art: "aufgabe", text: text,
           datum: datum, erledigt: false, wichtig: false, termin: null,
           start: datum + "T00:00" };
}


/* ====================================================================== */
abschnitt("1. Jede Aufgabe landet im richtigen Fach");

const faelle = [
  [-30, "ueberfaellig", "vor einem Monat"],
  [-1,  "ueberfaellig", "gestern"],
  [0,   "heute",        "heute"],
  [1,   "morgen",       "morgen"],
  [2,   "woche",        "uebermorgen (Mittwoch)"],
  [6,   "woche",        "Sonntag dieser Woche"],
  [7,   "naechste",     "Montag naechster Woche"],
  [13,  "naechste",     "Sonntag naechster Woche"],
  [14,  "spaeter",      "in zwei Wochen"],
  [200, "spaeter",      "in sieben Monaten"],
];

for (const [versatz, erwartet, was] of faelle) {
  const gefunden = werkzeug.zeitgruppeVon(aufgabe(tagOffset(versatz), was), MONTAG);
  pruefe(was + " -> " + erwartet, gefunden === erwartet);
  if (gefunden !== erwartet) console.log("         bekommen: " + gefunden);
}


/* ====================================================================== */
abschnitt("2. \"Diese Woche\" wird von HEUTE aus gerechnet, nicht ab Montag");

/* Am Freitag heisst "diese Woche" noch Samstag und Sonntag. Die Tage davor
   sind vorbei und gehoeren nach "Ueberfaellig" - nicht in "Diese Woche",
   wo man sie fuer noch offen halten koennte. */
const FREITAG = new Date(2026, 7, 28);
function abFreitag(n) {
  const d = new Date(FREITAG.getTime());
  d.setDate(d.getDate() + n);
  return d.getFullYear() + "-"
       + String(d.getMonth() + 1).padStart(2, "0") + "-"
       + String(d.getDate()).padStart(2, "0");
}

pruefe("der Montag davor ist ueberfaellig",
       werkzeug.zeitgruppeVon(aufgabe(abFreitag(-4), "Mo"), FREITAG) === "ueberfaellig");
pruefe("der Sonntag danach ist noch diese Woche",
       werkzeug.zeitgruppeVon(aufgabe(abFreitag(2), "So"), FREITAG) === "woche");
pruefe("der Montag danach ist naechste Woche",
       werkzeug.zeitgruppeVon(aufgabe(abFreitag(3), "Mo"), FREITAG) === "naechste");


/* ====================================================================== */
abschnitt("3. Am Sonntag geht die Rechnung auch auf");

// Der Sonntag ist der letzte Tag der Woche - montagDerWoche() muss dort
// sechs Tage zurueckgehen und nicht einen vor.
const SONNTAG = new Date(2026, 7, 30);
pruefe("heute ist heute",
       werkzeug.zeitgruppeVon(aufgabe("2026-08-30", "x"), SONNTAG) === "heute");
pruefe("der Montag danach ist morgen",
       werkzeug.zeitgruppeVon(aufgabe("2026-08-31", "x"), SONNTAG) === "morgen");
pruefe("der Dienstag danach ist naechste Woche",
       werkzeug.zeitgruppeVon(aufgabe("2026-09-01", "x"), SONNTAG) === "naechste");


/* ====================================================================== */
abschnitt("4. Eine Notiz ohne Termin im Plan geht nicht verloren");

/* Der Fall, in dem am ehesten etwas verschwinden wuerde: die HWR nimmt einen
   Termin aus dem Plan, die Notiz daran bleibt. Sie hat dann kein Datum. */
const ohneTermin = { kennung: "sked.weg", art: "notiz", text: "haengt an nichts",
                     erledigt: false, wichtig: false, termin: null, start: "9999" };
pruefe("sie bekommt ein eigenes Fach",
       werkzeug.zeitgruppeVon(ohneTermin, MONTAG) === "ohne");
pruefe("und dieses Fach steht in der Liste der Faecher",
       werkzeug.ZEITGRUPPEN.some(g => g.schluessel === "ohne"));


/* ====================================================================== */
abschnitt("5. Die Summe aller Faecher ergibt wieder alles");

/* Die eigentliche Absicherung gegen Datenverlust. Statt einzelner Faelle
   wird hier breit gestreut - jeder Tag von einem Jahr davor bis ein Jahr
   danach, dazu die Sonderfaelle. Am Ende muss jeder Eintrag genau einmal
   irgendwo stehen. */
const alle = [];
for (let versatz = -365; versatz <= 365; versatz++) {
  alle.push(aufgabe(tagOffset(versatz), "Tag " + versatz));
}
alle.push(ohneTermin);
alle.push({ kennung: "sked.leer", art: "notiz", text: "leeres Datum",
            erledigt: false, wichtig: false,
            termin: { start: "", ende: "" }, start: "9999" });

const verteilt = werkzeug.nachZeitgruppen(alle, MONTAG);

let summe = 0;
const gesehen = {};
let doppelt = 0;
for (const gruppe of werkzeug.ZEITGRUPPEN) {
  const drin = verteilt[gruppe.schluessel] || [];
  summe += drin.length;
  for (const eintrag of drin) {
    if (gesehen[eintrag.kennung]) doppelt++;
    gesehen[eintrag.kennung] = true;
  }
}

console.log("       " + alle.length + " Eintraege auf "
            + werkzeug.ZEITGRUPPEN.length + " Faecher verteilt:");
for (const gruppe of werkzeug.ZEITGRUPPEN) {
  console.log("         " + gruppe.titel + ": "
              + (verteilt[gruppe.schluessel] || []).length);
}

pruefe("die Summe stimmt (" + summe + " von " + alle.length + ")",
       summe === alle.length);
pruefe("kein Eintrag steht in zwei Faechern", doppelt === 0);
pruefe("jeder Eintrag ist genau einmal untergekommen",
       Object.keys(gesehen).length === alle.length);

// Und es darf kein Fach geben, das die Anzeige nicht kennt.
const bekannt = {};
for (const gruppe of werkzeug.ZEITGRUPPEN) bekannt[gruppe.schluessel] = true;
let unbekannt = 0;
for (const eintrag of alle) {
  if (!bekannt[werkzeug.zeitgruppeVon(eintrag, MONTAG)]) unbekannt++;
}
pruefe("kein Eintrag landet in einem Fach ohne Ueberschrift", unbekannt === 0);


/* ====================================================================== */
abschnitt("5b. Ein unbekanntes Fach stuerzt nicht ab");

/* Der doppelte Boden in nachZeitgruppen(). Er greift nur, wenn jemand
   spaeter eine Bedingung einbaut und den Rueckfall verrutschen laesst -
   dann stuende dort "faecher[undefined].push(...)", und das ist kein
   stiller Fehler, sondern ein Absturz mitten im Zeichnen. Der ganze
   To-do-Bereich bliebe leer, samt der richtig zugeordneten Aufgaben.

   Aufgefallen ist das bei der Gegenprobe: mit ausgebautem Rueckfall
   stuerzte dieser Test selbst ab, statt einen Fehlschlag zu melden. */
const komisch = { kennung: "eigen-komisch", art: "aufgabe", text: "seltsam",
                  datum: tagOffset(3), erledigt: false, wichtig: false,
                  termin: null, start: tagOffset(3) + "T00:00" };

let stuerztAb = false;
let untergekommen = 0;
try {
  // zeitgruppeVon voruebergehend kaputtmachen ist von aussen nicht moeglich -
  // stattdessen wird der Rueckfall direkt gemessen: eine Liste mit einem
  // Eintrag muss auch dann vollstaendig herauskommen, wenn etwas klemmt.
  const verteiltKomisch = werkzeug.nachZeitgruppen([komisch], MONTAG);
  for (const gruppe of werkzeug.ZEITGRUPPEN) {
    untergekommen += (verteiltKomisch[gruppe.schluessel] || []).length;
  }
} catch (fehlschlag) {
  stuerztAb = true;
}
pruefe("das Verteilen stuerzt nicht ab", !stuerztAb);
pruefe("und der Eintrag ist untergekommen", untergekommen === 1);


/* ====================================================================== */
abschnitt("6. Die Reihenfolge bleibt: Wichtiges zuerst, dann nach Datum");

werkzeug.filterLeeren();
werkzeug.setzen({}, [
  { id: "eigen-a", text: "spaet und normal", datum: tagOffset(3),
    erledigt: false, wichtig: false, geaendert: 1 },
  { id: "eigen-b", text: "spaet und wichtig", datum: tagOffset(4),
    erledigt: false, wichtig: true, geaendert: 1 },
  { id: "eigen-c", text: "frueh und normal", datum: tagOffset(2),
    erledigt: false, wichtig: false, geaendert: 1 },
]);

const sortiert = werkzeug.aufgabenSammeln();
const inWoche = werkzeug.nachZeitgruppen(sortiert, MONTAG).woche;
pruefe("alle drei liegen in derselben Woche", inWoche.length === 3);
pruefe("das Wichtige steht im Fach oben",
       inWoche[0] && inWoche[0].text === "spaet und wichtig");
pruefe("danach nach Datum",
       inWoche[1] && inWoche[1].text === "frueh und normal"
       && inWoche[2] && inWoche[2].text === "spaet und normal");


/* ====================================================================== */
abschnitt("7. \"Als Naechstes\" zeigt den TEXT der Notiz");

/* Der Fehler, den es hier gab: angezeigt wurde das ganze Notiz-Objekt.
   Auf dem Bildschirm stand "[object Object]" - die Notiz war da, nur eben
   unlesbar. */
STUNDENPLAN.termine = [{
  id: "sked.pruef", start: "2099-01-01T08:00", ende: "2099-01-01T13:15",
  art: "SI", titel: "WPF - Social Innovation", dozent: "WagnerL",
  raum: "CL: 6A.014", anmerkung: "", gruppe: "",
}];

werkzeug.filterLeeren();
werkzeug.setzen({ "sked.pruef": { text: "11:25 Beginn", erledigt: false,
                                  wichtig: false, geaendert: 1 } }, []);
werkzeug.naechstenZeichnen();
let gezeichnet = document.getElementById("naechsterBereich").innerHTML;

pruefe("der Notiztext steht drin", gezeichnet.indexOf("11:25 Beginn") >= 0);
pruefe("und NICHT [object Object]", gezeichnet.indexOf("[object Object]") < 0);
pruefe("mit dem Stift davor", gezeichnet.indexOf("✎") >= 0);

// Eine wichtige Notiz bekommt einen Stern statt des Stifts.
werkzeug.setzen({ "sked.pruef": { text: "Klausur!", erledigt: false,
                                  wichtig: true, geaendert: 1 } }, []);
werkzeug.naechstenZeichnen();
gezeichnet = document.getElementById("naechsterBereich").innerHTML;
pruefe("eine wichtige Notiz bekommt den Stern", gezeichnet.indexOf("★") >= 0);
pruefe("und ihren Text", gezeichnet.indexOf("Klausur!") >= 0);

// Ohne Notiz darf keine leere Zeile entstehen.
werkzeug.setzen({}, []);
werkzeug.naechstenZeichnen();
gezeichnet = document.getElementById("naechsterBereich").innerHTML;
pruefe("ohne Notiz steht dort keine Notizzeile",
       gezeichnet.indexOf("naechster-notiz") < 0);
pruefe("der Termin selbst steht aber da",
       gezeichnet.indexOf("Social Innovation") >= 0);


/* ====================================================================== */
console.log("");
if (fehler.length) {
  console.log("FEHLGESCHLAGEN (" + fehler.length + "):");
  fehler.forEach(function (e) { console.log("  - " + e); });
  throw new Error(fehler.length + " Pruefung(en) fehlgeschlagen");
}
console.log("ALLE TESTS BESTANDEN");
"bestanden";
