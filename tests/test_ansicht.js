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
  "  todosZeichnen: todosZeichnen," +
  "  listeBauen: listeBauen," +
  "  bearbeiten: function (an) { bearbeitenModus = an; }," +
  "  vergangeneOffen: function (woche) { vergangeneOffenFuer = woche; }," +
  "  kalenderBauen: kalenderBauen," +
  "  aufgabenSammeln: aufgabenSammeln," +
  "  setzen: function (n, a) { notizen = n; aufgaben = a; grabsteine = {}; }," +
  "  filterLeeren: function () { abgewaehlteFaecher = new Set(); }," +
  "  kalenderwoche: kalenderwoche," +
  "  heuteSammeln: heuteSammeln," +
  "  startTodos: startTodos," +
  "  startZeichnen: startZeichnen," +
  "  startseiteWaehlen: startseiteWaehlen," +
  "  faecherBereichZeichnen: faecherBereichZeichnen," +
  "  abwaehlen: function (titel) { abgewaehlteFaecher.add(titel); }," +
  "  eigene: function (t) { eigeneTermine = t; }," +
  "  notizbuch: function (z) { zettel = z; }," +
  "  trainingAuswerten: trainingAuswerten," +
  "  trainingWort: trainingWort," +
  "  trainingSichtbar: trainingSichtbar," +
  "  trainingStartKarte: trainingStartKarte," +
  "  trainingZeichnen: trainingZeichnen," +
  "  trainingVerlaufZeichnen: trainingVerlaufZeichnen," +
  "  trainingFilter: function (typ, muskel) { trainingFilterTyp = typ; trainingFilterMuskel = muskel; }," +
  "  aenderungenGesehen: aenderungenAlsGesehenMerken," +
  "  aenderungAbhaken: aenderungAbhaken," +
  "  startAenderungen: startAenderungen," +
  "  ungesehen: ungeseheneAenderungen," +
  "  kurzerTitel: kurzerTitel," +
  "  tagKarteBauen: tagKarteBauen," +
  "  terminFensterZeigen: terminFensterZeigen," +
  "  offeneNotizSetzen: function (w) { offeneNotiz = w; }," +
  "  uniplanSetzenTest: function (felder) { uniplan = uniplanGeraderuecken(Object.assign({}, uniplan, felder)); }," +
  "  arbeitsTermine: arbeitsTermine," +
  "  feiertagAm: feiertagAm," +
  "  ostersonntag: ostersonntag," +
  "  uniplanAusblick: uniplanAusblick," +
  "  uniplanStartKarte: uniplanStartKarte," +
  "  urlaubEintragen: urlaubEintragen," +
  "  urlaubsTage: urlaubsTage," +
  "  alleAngezeigten: alleAngezeigtenTermine," +
  "  uniplanWert: function () { return uniplan; }," +
  "  UNIPLAN_VORGABE: UNIPLAN_VORGABE," +
  "  trainingSetzen: function (t) { training = t; trainingZustand = t ? 'ok' : ''; }" +
  "})");


/* Die Arbeit aus dem Uni-Plan haengt am echten Datum und wuerde in "Als
   Naechstes" und "Heute" auftauchen. Aus, bis Abschnitt 15 sie prueft. */
werkzeug.uniplanSetzenTest({ arbeit: false });

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
abschnitt("6. Die Reihenfolge ist streng nach Datum, auch fuer Wichtiges");

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
pruefe("das Frueheste steht oben", inWoche[0] && inWoche[0].text === "frueh und normal");
pruefe("das Wichtige steht an seinem Tag, nicht vorgezogen",
       inWoche[1] && inWoche[1].text === "spaet und normal"
       && inWoche[2] && inWoche[2].text === "spaet und wichtig");

/* Der Fall aus dem Screenshot vom 02.10.2026: To-dos an Terminen mit
   Uhrzeit und freie To-dos nur mit Tag, gemischt. */
STUNDENPLAN.termine = [
  { id: "t.sa", start: tagOffset(12) + "T11:15", ende: tagOffset(12) + "T12:45", titel: "Management",
    art: "SU", dozent: "", raum: "", anmerkung: "", gruppe: "" },
  { id: "t.di", start: tagOffset(8) + "T08:45", ende: tagOffset(8) + "T13:15", titel: "Social Innovation",
    art: "SU", dozent: "", raum: "", anmerkung: "", gruppe: "" },
  { id: "t.do", start: tagOffset(10) + "T08:45", ende: tagOffset(10) + "T13:15", titel: "Nachhaltig",
    art: "SU", dozent: "", raum: "", anmerkung: "", gruppe: "" },
];
werkzeug.setzen({
  "t.sa": { text: "Praesi Management", erledigt: false, wichtig: true, geaendert: 1 },
  "t.di": { text: "Praesi SI", erledigt: false, wichtig: false, geaendert: 1 },
  "t.do": { text: "Praesi NW", erledigt: false, wichtig: false, geaendert: 1 },
}, [{ id: "eigen-abg", text: "Abgabe Praesi", datum: tagOffset(10), erledigt: false, wichtig: false, geaendert: 1 }]);
const gemischt = werkzeug.aufgabenSammeln().map(a => a.text).join(" | ");
pruefe("Di vor Do vor Sa, das Tages-To-do vor dem Termin am selben Tag",
       gemischt === "Praesi SI | Abgabe Praesi | Praesi NW | Praesi Management");
STUNDENPLAN.termine = [];


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
abschnitt("8. Die eigene Notiz steht im Kalenderkaestchen, nicht nur ein ✎");

/* Warum das hier geprueft wird: im Raster stand lange nur ein kleines ✎
   neben der Uhrzeit. Man sah, DASS man sich etwas notiert hat, aber nicht
   WAS - dafuer musste man das Kaestchen antippen. Genau anders herum ist
   es richtig: die Notiz ist das Einzige im Kasten, was nicht aus dem
   HWR-System kommt.

   Messen kann dieser Test nichts, er hat keinen Browser. Er prueft die
   Sorte Fehler, die beim naechsten Umbau wieder auftreten kann: dass die
   Notiz gar nicht erst in den Text kommt, oder an der falschen Stelle
   steht und deshalb als Erste ausgeblendet wird. */

/* Ohne diese Zeile prueft der Test den falschen Text.

   Jedes Kaestchen traegt ein title="..." mit dem vollen Inhalt - Raum,
   Dozent, Hinweis, Notiz -, und das steht im HTML VOR allem anderen. Eine
   Reihenfolge-Pruefung mit indexOf() findet also immer zuerst den
   Tooltip und stimmt dann auch dann noch, wenn im Kasten selbst alles
   durcheinandergeraten ist. Beim Sabotieren kam genau das heraus: die
   Notizzeile nach ganz vorn geschoben, und der Test sagte weiter "OK".
   Also wird der Tooltip vorher weggeschnitten. */
function ohneTooltip(html) {
  return String(html).replace(/ title="[^"]*"/g, "");
}

function kalendertag(termine, ganztags) {
  const tag = new Date("2026-08-24T00:00");
  return [{
    datum: tag, schluessel: "2026-08-24", termine: termine || [],
    aufgaben: [], ganztags: ganztags || [], istHeute: false,
  }];
}

const hwrTermin = {
  id: "sked.kasten", start: "2026-08-24T09:45", ende: "2026-08-24T11:15",
  titel: "34 - Schluesselkompetenzen V", raum: "CL: 6A.206",
  dozent: "Knoll", anmerkung: "ONLINE", art: "SU", gruppe: "",
};

werkzeug.filterLeeren();
werkzeug.setzen({ "sked.kasten": { text: "11:25 Beginn", erledigt: false,
                                   wichtig: false, geaendert: 1 } }, []);
let kasten = ohneTooltip(werkzeug.kalenderBauen(kalendertag([hwrTermin])));

pruefe("der Notiztext steht im Kaestchen",
       kasten.indexOf("11:25 Beginn") >= 0);
pruefe("und zwar in einer eigenen Notizzeile",
       kasten.indexOf("kalender-termin-notiz") >= 0);

/* kalenderTexteAnpassen() blendet die Zusatzzeilen der Reihe nach aus,
   von oben nach unten. Steht die Notiz hinter Raum und HWR-Hinweis, weicht
   sie als Letzte - und genau so ist die Rangfolge gemeint. */
pruefe("sie steht hinter dem Raum",
       kasten.indexOf("kalender-termin-notiz") > kasten.indexOf("CL: 6A.206"));
pruefe("und hinter dem HWR-Hinweis",
       kasten.indexOf("kalender-termin-notiz") > kasten.indexOf("ONLINE"));

// Ohne Notiz darf keine leere Zeile entstehen.
werkzeug.setzen({}, []);
kasten = ohneTooltip(werkzeug.kalenderBauen(kalendertag([hwrTermin])));
pruefe("ohne Notiz gibt es keine Notizzeile",
       kasten.indexOf("kalender-termin-notiz") < 0);
pruefe("Raum und Hinweis stehen trotzdem da",
       kasten.indexOf("CL: 6A.206") >= 0 && kasten.indexOf("ONLINE") >= 0);

/* Bei einem eigenen Termin steckt das Notizfeld aus dem Formular in
   "anmerkung". Landete es in der Zeile fuer HWR-Hinweise, waere es das
   Zweite, was bei Platzmangel verschwindet - obwohl es selbstgeschrieben
   ist. */
const eigenerTermin = {
  id: "termin-pruef", start: "2026-08-24T19:00", ende: "2026-08-24T21:00",
  titel: "Probetraining Kletterhalle", raum: "Ostbloc",
  dozent: "", anmerkung: "Schuhe leihen", art: "eigen", gruppe: "",
  eigen: true,
};
kasten = ohneTooltip(werkzeug.kalenderBauen(kalendertag([eigenerTermin])));
pruefe("die Notiz eines eigenen Termins steht in der Notizzeile",
       kasten.indexOf("kalender-termin-notiz") >= 0
       && kasten.indexOf("Schuhe leihen") >= 0);
pruefe("und NICHT in der Zeile fuer HWR-Hinweise",
       kasten.indexOf("<strong>Schuhe leihen</strong>") < 0);

/* Ganztaegige Termine haben keine Uhrzeit, die sie erklaert. Ohne Ort und
   Notiz steht in der Kachel nur ein Wort. */
kasten = ohneTooltip(werkzeug.kalenderBauen(kalendertag([], [{
  id: "termin-ganz", titel: "Geburtstag Mama",
  start: "2026-08-24T00:00", ende: "2026-08-24T23:59", ganztags: true,
  ort: "Rostock", notiz: "Anrufen nicht vergessen", wichtig: true,
}])));
pruefe("die Ganztagskachel zeigt den Titel",
       kasten.indexOf("Geburtstag Mama") >= 0);
pruefe("dazu Ort und Notiz", kasten.indexOf("Rostock · Anrufen nicht vergessen") >= 0);
pruefe("beides in getrennten Zeilen, damit gekuerzt werden kann",
       kasten.indexOf("kalender-ganztag-titel") >= 0
       && kasten.indexOf("kalender-ganztag-zusatz") >= 0);


abschnitt("9. Auf dem Bildschirm heisst es \"To-do\", nicht \"Aufgabe\"");

/* Die App nannte dasselbe Ding an drei Stellen verschieden: "+ Notiz"
   unter einem Termin, "Aufgabe" in der Tageszeile, "Meine Aufgaben" im
   To-do-Bereich - und der Reiter darueber hiess "To-dos". Wer darauf
   drueckte, wusste nicht, was herauskommt.

   IM CODE heisst es weiter "Aufgabe", und das bleibt auch so: das Feld
   "art": "aufgabe" steht in der Ablage auf jedem Geraet. Geprueft wird
   hier also nur, was auf dem Bildschirm landet.

   Das ist die Sorte Pruefung, die beim naechsten Umbau anschlaegt, wenn
   jemand eine neue Schaltflaeche einbaut und dabei aus Gewohnheit das
   Wort aus dem Code uebernimmt. */

werkzeug.setzen({}, [{ id: "eigen-1", text: "Bibliotheksbuch zurueck",
                       datum: "2026-08-24", erledigt: false, wichtig: false,
                       geaendert: 1 }]);
werkzeug.todosZeichnen();
let bildschirm = document.getElementById("todoInhalt").innerHTML;

pruefe("die Ueberschrift heisst \"Meine To-dos\"",
       bildschirm.indexOf("Meine To-dos") >= 0);
pruefe("der Anlegen-Knopf heisst \"+ Neues To-do\"",
       bildschirm.indexOf("+ Neues To-do") >= 0);

/* Der Knopf traegt weiter data-aufgabe-neu - das ist ein Bezeichner im
   Code, kein Text auf dem Bildschirm, und er darf bleiben. Beim Suchen
   nach dem Wort muessen die Bezeichner deshalb heraus, sonst schlaegt die
   Pruefung bei etwas an, das voellig in Ordnung ist. */
function nurSichtbares(html) {
  return String(html)
    .replace(/data-[a-z-]+="[^"]*"/g, "")
    .replace(/\bid="[^"]*"/g, "")
    .replace(/\bclass="[^"]*"/g, "");
}

pruefe("und nirgends steht mehr \"Aufgabe\"",
       nurSichtbares(bildschirm).indexOf("Aufgabe") < 0);

// Dasselbe in der Listenansicht des Plans.
werkzeug.filterLeeren();
werkzeug.bearbeiten(true);
bildschirm = werkzeug.listeBauen([{
  datum: new Date("2026-08-24T00:00"), schluessel: "2026-08-24",
  termine: [], ganztags: [],
  aufgaben: [{ id: "eigen-1", text: "Bibliotheksbuch zurueck",
               datum: "2026-08-24", erledigt: false, wichtig: false }],
  istHeute: false,
}]);

pruefe("der Tagesknopf heisst \"+ To-do für diesen Tag\"",
       bildschirm.indexOf("+ To-do für diesen Tag") >= 0);
pruefe("die Zeile vor einem freien To-do heisst \"To-do\"",
       bildschirm.indexOf(">To-do</div>") >= 0);
pruefe("auch hier steht nirgends \"Aufgabe\"",
       nurSichtbares(bildschirm).indexOf("Aufgabe") < 0);

werkzeug.bearbeiten(false);
werkzeug.setzen({}, []);


abschnitt("10. In der Liste steht heute oben");

/* Am Mittwoch sind Montag und Dienstag vorbei - trotzdem standen sie ganz
   oben, und man musste an ihnen vorbeiscrollen. Jetzt sind sie in der
   laufenden Woche eingeklappt, und ein Knopf holt sie zurueck.

   "Heute" wird uebergeben statt aus der Uhr gelesen: sonst haengt der
   Test vom Wochentag ab, an dem er laeuft, und faellt genau montags um,
   weil es dann nichts Vergangenes gibt. */

function wochentag(schluessel, titel) {
  return {
    datum: new Date(schluessel + "T00:00"), schluessel: schluessel,
    termine: [{ id: "sked." + schluessel, start: schluessel + "T09:45",
                ende: schluessel + "T11:15", titel: titel, raum: "",
                dozent: "", art: "SU", anmerkung: "", gruppe: "" }],
    aufgaben: [], ganztags: [], istHeute: false,
  };
}

// Die Woche vom 21. bis 25.09.2026, Montag bis Freitag.
const woche = [
  wochentag("2026-09-21", "Montagsfach"),
  wochentag("2026-09-22", "Dienstagsfach"),
  wochentag("2026-09-23", "Mittwochsfach"),
  wochentag("2026-09-24", "Donnerstagsfach"),
  wochentag("2026-09-25", "Freitagsfach"),
];

werkzeug.bearbeiten(false);
werkzeug.vergangeneOffen("");
let liste = werkzeug.listeBauen(woche, "2026-09-23");

pruefe("Montag steht NICHT in der Liste", liste.indexOf("Montagsfach") < 0);
pruefe("Dienstag auch nicht", liste.indexOf("Dienstagsfach") < 0);
pruefe("heute, Mittwoch, steht drin", liste.indexOf("Mittwochsfach") >= 0);
pruefe("und der Rest der Woche", liste.indexOf("Freitagsfach") >= 0);
pruefe("der Knopf sagt, wie viele fehlen",
       liste.indexOf("2 vergangene Tage") >= 0);
pruefe("und er steht VOR dem heutigen Tag",
       liste.indexOf("data-vergangene-umschalten")
       < liste.indexOf("Mittwochsfach"));

// Aufgeklappt ist alles wieder da, in der richtigen Reihenfolge.
werkzeug.vergangeneOffen("2026-09-21");
liste = werkzeug.listeBauen(woche, "2026-09-23");
pruefe("aufgeklappt steht Montag wieder da",
       liste.indexOf("Montagsfach") >= 0);
pruefe("vor dem Mittwoch",
       liste.indexOf("Montagsfach") < liste.indexOf("Mittwochsfach"));
pruefe("und der Knopf bietet das Zuklappen an",
       liste.indexOf("ausblenden") >= 0);

/* Das Aufklappen gilt fuer DIESE Woche. Blaettert man weiter, soll dort
   nicht versehentlich alles offen sein - daher der Montag als Merker
   statt eines einfachen Ja/Nein. */
werkzeug.vergangeneOffen("2026-09-14");
liste = werkzeug.listeBauen(woche, "2026-09-23");
pruefe("aufgeklappt fuer eine ANDERE Woche bleibt hier zu",
       liste.indexOf("Montagsfach") < 0);
werkzeug.vergangeneOffen("");

/* Andere Wochen: nichts eingeklappt. Zurueckblaettern heisst ja gerade,
   das Vergangene sehen zu wollen. */
liste = werkzeug.listeBauen(woche, "2026-10-07");
pruefe("in einer vergangenen Woche steht alles da",
       liste.indexOf("Montagsfach") >= 0 && liste.indexOf("Freitagsfach") >= 0);
pruefe("ohne Knopf", liste.indexOf("data-vergangene-umschalten") < 0);

liste = werkzeug.listeBauen(woche, "2026-09-10");
pruefe("in einer kommenden Woche ebenso",
       liste.indexOf("Montagsfach") >= 0
       && liste.indexOf("data-vergangene-umschalten") < 0);

// Montags gibt es nichts Vergangenes - also auch keinen Knopf.
liste = werkzeug.listeBauen(woche, "2026-09-21");
pruefe("am Montag gibt es keinen Knopf",
       liste.indexOf("data-vergangene-umschalten") < 0);

/* Ein freier Samstag: nach dem Einklappen bliebe nichts uebrig. Dann
   muss dastehen, dass das Absicht ist - ein leerer Bereich sieht aus wie
   ein Fehler. */
liste = werkzeug.listeBauen(woche, "2026-09-26");
pruefe("am freien Samstag steht ein Satz statt Leere",
       liste.indexOf("Rest dieser Woche") >= 0);
pruefe("und der Knopf zaehlt alle fuenf Tage",
       liste.indexOf("5 vergangene Tage") >= 0);


/* ====================================================================== */
abschnitt("11. Die Uebersicht");

/* Die Uebersicht rechnet nichts Neues aus, sie waehlt nur aus. Geprueft
   wird deshalb vor allem die Auswahl: steht dort der richtige Tag, fehlt
   kein dringendes To-do, und landet nichts Kaputtes auf dem Bildschirm. */

// Kalenderwoche: der Donnerstag entscheidet ueber das Jahr.
pruefe("24.09.2026 ist KW 39", werkzeug.kalenderwoche(new Date(2026, 8, 24)) === 39);
pruefe("01.01.2026 (Donnerstag) ist KW 1", werkzeug.kalenderwoche(new Date(2026, 0, 1)) === 1);
pruefe("03.01.2021 (Sonntag) gehoert noch zu KW 53",
       werkzeug.kalenderwoche(new Date(2021, 0, 3)) === 53);
pruefe("30.12.2024 (Montag) ist schon KW 1",
       werkzeug.kalenderwoche(new Date(2024, 11, 30)) === 1);

// Ein Donnerstag und ein Montag mit je einem Termin.
function planTermin(id, start, ende, titel) {
  return { id: id, start: start, ende: ende, art: "SU", titel: titel,
           dozent: "", raum: "A 1", anmerkung: "", gruppe: "" };
}
STUNDENPLAN.termine = [
  planTermin("t.do", "2026-09-24T10:00", "2026-09-24T12:00", "Donnerstagsfach"),
  planTermin("t.mo", "2026-09-28T08:00", "2026-09-28T09:30", "Montagsfach"),
];
werkzeug.filterLeeren();
werkzeug.eigene([]);
werkzeug.setzen({}, []);

/* "Heute" zeigt, was heute noch kommt: Termine, die nicht vorbei sind,
   Ganztaegiges, und To-dos, die heute faellig oder ueberfaellig sind. */
let h = werkzeug.heuteSammeln(new Date(2026, 8, 24, 9, 0));
pruefe("morgens steht der Donnerstagstermin in Heute",
       h.termine.length === 1 && h.termine[0].id === "t.do" && h.vorbei === 0);
h = werkzeug.heuteSammeln(new Date(2026, 8, 24, 11, 0));
pruefe("waehrend der Vorlesung auch noch", h.termine.length === 1);
h = werkzeug.heuteSammeln(new Date(2026, 8, 24, 13, 0));
pruefe("danach ist er weg, und Heute weiss, dass einer vorbei ist",
       h.termine.length === 0 && h.vorbei === 1);
pruefe("der Montagstermin gehoert NICHT in Heute",
       !h.termine.some(t => t.id === "t.mo"));

werkzeug.eigene([{ id: "termin-geb", titel: "Geburtstag", start: "2026-09-26",
                   ende: "2026-09-26", ganztags: true, geaendert: 1 }]);
h = werkzeug.heuteSammeln(new Date(2026, 8, 26, 9, 0));
pruefe("ein Geburtstag am Samstag steht am Samstag in Heute", h.ganztags.length === 1);
werkzeug.eigene([]);

// To-dos in Heute: ueberfaellig und heute ja, morgen nein.
werkzeug.setzen({ "t.do": { text: "Buch mit", erledigt: false, wichtig: false, geaendert: 1 } }, [
  { id: "eigen-alt", text: "alt", datum: "2026-09-20", erledigt: false, wichtig: false, geaendert: 1 },
  { id: "eigen-heute", text: "heute", datum: "2026-09-24", erledigt: false, wichtig: false, geaendert: 1 },
  { id: "eigen-morgen", text: "morgen", datum: "2026-09-25", erledigt: false, wichtig: false, geaendert: 1 },
]);
h = werkzeug.heuteSammeln(new Date(2026, 8, 24, 9, 0));
let hk = h.todos.map(x => x.eintrag.kennung);
pruefe("ueberfaellig und heute stehen in Heute", hk.indexOf("eigen-alt") >= 0 && hk.indexOf("eigen-heute") >= 0);
pruefe("das Ueberfaellige ist als solches markiert",
       h.todos.filter(x => x.eintrag.kennung === "eigen-alt")[0].ueberfaellig === true);
pruefe("morgen gehoert nicht in Heute", hk.indexOf("eigen-morgen") < 0);
pruefe("die Kurznotiz am kommenden Termin steht nicht doppelt als To-do", hk.indexOf("t.do") < 0);
h = werkzeug.heuteSammeln(new Date(2026, 8, 24, 13, 0));
pruefe("ist ihr Termin vorbei, steht sie als To-do da (sonst waere sie weg)",
       h.todos.some(x => x.eintrag.kennung === "t.do"));
werkzeug.setzen({}, []);

/* To-dos: alles Dringende steht da. Das ist die eine Stelle, an der die
   Uebersicht etwas weglassen darf - aber nie etwas, das heute faellig ist. */
const JETZT = new Date(2026, 8, 24, 9, 0);
function frei(id, datum) {
  return { id: id, text: "Aufgabe " + id, datum: datum, erledigt: false,
           wichtig: false, geaendert: 1 };
}
werkzeug.setzen({}, [
  frei("eigen-alt", "2026-09-20"),
  frei("eigen-heute", "2026-09-24"),
  frei("eigen-morgen", "2026-09-25"),
  frei("eigen-spaeter", "2026-10-20"),
  frei("eigen-naechste", "2026-09-29"),
]);
let todos = werkzeug.startTodos(JETZT);
let kennungen = todos.auswahl.map(x => x.eintrag.kennung);
pruefe("ueberfaellig, heute und morgen stehen alle da",
       kennungen.indexOf("eigen-alt") >= 0 && kennungen.indexOf("eigen-heute") >= 0
       && kennungen.indexOf("eigen-morgen") >= 0);
pruefe("in dieser Reihenfolge", kennungen.slice(0, 3).join() === "eigen-alt,eigen-heute,eigen-morgen");
pruefe("es sind die vier naechsten", kennungen.length === 4
       && kennungen[3] === "eigen-naechste");
pruefe("gezaehlt wird trotzdem alles", todos.offen === 5 && todos.dringend === 3
       && todos.ueberfaellig === 1);

// Nichts dringend: dann das Naechste, was kommt, in zeitlicher Folge.
werkzeug.setzen({}, [frei("eigen-spaeter", "2026-10-20"), frei("eigen-naechste", "2026-09-29")]);
todos = werkzeug.startTodos(JETZT);
kennungen = todos.auswahl.map(x => x.eintrag.kennung);
pruefe("ohne Dringendes wird aufgefuellt, das Naehere zuerst",
       kennungen.join() === "eigen-naechste,eigen-spaeter" && todos.dringend === 0);

// Viele dringende: hoechstens sechs, gezaehlt bleiben alle.
const viele = [];
for (let i = 0; i < 9; i++) viele.push(frei("eigen-v" + i, "2026-09-24"));
werkzeug.setzen({}, viele);
todos = werkzeug.startTodos(JETZT);
pruefe("hoechstens vier Zeilen", todos.auswahl.length === 4);
pruefe("aber alle neun gezaehlt", todos.offen === 9 && todos.dringend === 9);

// Erledigtes gehoert nicht auf die Startseite.
werkzeug.setzen({}, [{ id: "eigen-fertig", text: "fertig", datum: "2026-09-24",
                       erledigt: true, wichtig: false, geaendert: 1 }]);
todos = werkzeug.startTodos(JETZT);
pruefe("Erledigtes steht nicht da", todos.auswahl.length === 0 && todos.offen === 0);

/* Was am Ende auf dem Bildschirm landet, ist Text. Dieselbe Sorge wie in
   Abschnitt 7: ein Feld, das beim Umbau vergessen wird, erscheint als
   "undefined" oder "[object Object]". Hier mit allem, was es gibt: HWR,
   eigener Termin, Kurznotiz, To-do, Notiz aus dem Notizbuch. */
const heuteText = (function () {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0")
       + "-" + String(d.getDate()).padStart(2, "0");
})();
STUNDENPLAN.termine = [planTermin("t.heute", heuteText + "T23:58", heuteText + "T23:59", "Spaetfach")];
werkzeug.eigene([{ id: "termin-x", titel: "Eigener Termin", start: heuteText + "T23:57",
                   ende: heuteText + "T23:59", ganztags: false, ort: "", notiz: "",
                   geaendert: 1 }]);
werkzeug.setzen({ "t.heute": { text: "Buch mitbringen", erledigt: false, wichtig: true, geaendert: 1 } },
                [frei("eigen-h", heuteText)]);
werkzeug.notizbuch([{ id: "zettel-1", text: "Klausur\n\nKapitel 3", verweise: [],
                      wichtig: true, geaendert: 1 }]);
werkzeug.startZeichnen();
const start = document.getElementById("startInhalt").innerHTML;
pruefe("der HWR-Termin steht in der Karte", start.indexOf("Spaetfach") >= 0);
pruefe("der eigene auch", start.indexOf("Eigener Termin") >= 0);
pruefe("mit der Kurznotiz", start.indexOf("Buch mitbringen") >= 0);
pruefe("das To-do", start.indexOf("Aufgabe eigen-h") >= 0);
pruefe("und die Notiz mit ihrer Ueberschrift", start.indexOf("Klausur") >= 0);
pruefe("kein [object Object]", start.indexOf("[object Object]") < 0);
pruefe("kein undefined", start.indexOf("undefined") < 0);
pruefe("kein NaN", start.indexOf("NaN") < 0);
pruefe("die Zahlen fuehren in ihre Bereiche",
       start.indexOf('data-start-seite="todos"') >= 0
       && start.indexOf('data-start-seite="plan"') >= 0);
pruefe("die Datumszeile nennt die Woche",
       /KW \d+/.test(document.getElementById("startDatum").textContent));
werkzeug.notizbuch([]);
werkzeug.eigene([]);
werkzeug.setzen({}, []);

/* Mit welchem Reiter die App aufgeht. */
const MINUTE = 60 * 1000;
const T = 1790000000000;
pruefe("gerade eben im Plan: bleibt im Plan",
       werkzeug.startseiteWaehlen("plan", String(T - 2 * MINUTE), T) === "plan");
pruefe("vor einer Stunde im Plan: zurueck zur Uebersicht",
       werkzeug.startseiteWaehlen("plan", String(T - 60 * MINUTE), T) === "start");
pruefe("ohne Zeit (Fassung vor der Uebersicht): Uebersicht",
       werkzeug.startseiteWaehlen("todos", null, T) === "start");
pruefe("unbekannter Reiter: Uebersicht",
       werkzeug.startseiteWaehlen("quatsch", String(T), T) === "start");
pruefe("Zeit in der Zukunft zaehlt nicht als frisch",
       werkzeug.startseiteWaehlen("plan", String(T + 60 * MINUTE), T) === "start");

/* Die Faecher in den Einstellungen: die Zahl stimmt mit dem Filter. */
STUNDENPLAN.termine = [planTermin("f1", "2026-09-24T08:00", "2026-09-24T09:00", "Fach A"),
                       planTermin("f2", "2026-09-24T10:00", "2026-09-24T11:00", "Fach B"),
                       planTermin("f3", "2026-09-24T12:00", "2026-09-24T13:00", "Fach C")];
werkzeug.filterLeeren();
werkzeug.faecherBereichZeichnen();
pruefe("alle belegt", document.getElementById("faecherBereich").innerHTML.indexOf("Alle 3 Fächer") >= 0);
werkzeug.abwaehlen("Fach B");
werkzeug.faecherBereichZeichnen();
pruefe("eins abgewaehlt: 2 von 3",
       document.getElementById("faecherBereich").innerHTML.indexOf("2 von 3") >= 0);
pruefe("mit dem Knopf zur Auswahl",
       document.getElementById("faecherBereich").innerHTML.indexOf("faecherOeffnen") >= 0);
werkzeug.filterLeeren();
STUNDENPLAN.termine = [];


/* ====================================================================== */
abschnitt("12. Training aus Gymbro");

/* Donnerstag, 24.09.2026, 20 Uhr. Trainings am Di 22.09. und Mo 14.09.,
   dann eine Lücke (KW 37 leer), davor KW 36. */
const TJETZT = new Date(2026, 8, 24, 20, 0);
const gymbro = {
  formatVersion: 1,
  sessions: [
    { arrivedAt: "2026-09-22T15:30:00.000Z", leftAt: "2026-09-22T16:45:00.000Z",
      trainingType: "push", muscleGroups: ["chest", "shoulders"], rating: 8 },
    { arrivedAt: "2026-09-14T15:30:00.000Z", leftAt: "2026-09-14T16:30:00.000Z",
      trainingType: "legs", muscleGroups: ["quads"], rating: 6 },
    { arrivedAt: "2026-09-02T15:30:00.000Z", trainingType: "pull", muscleGroups: ["back"] },
    // Vergessen auszuchecken: zehn Stunden. Darf den Schnitt nicht verderben.
    { arrivedAt: "2026-09-15T08:00:00.000Z", leftAt: "2026-09-15T18:00:00.000Z",
      trainingType: "pull", muscleGroups: ["back"] },
    // Kaputte Einträge: ohne Datum, mit Unsinn. Dürfen nichts umwerfen.
    { trainingType: "push" }, { arrivedAt: "gestern", rating: "sehr gut" }, null,
  ],
  weights: [
    { date: "2026-08-10", weight: 80.4 }, { date: "2026-08-20", weight: "79,9" },
    { date: "2026-09-23", weight: 78.6 }, { date: "2026-09-01" },
  ],
  prs: [{ exercise: "bench_press", weight: 80, reps: 5, date: "2026-09-22" },
        { exercise: "squat", weight: 100, date: "2026-08-01" }, { weight: 5 }],
  plans: "kein Feld, sondern Text",
  cancellations: [{ date: "2026-09-20", isRestDay: true }, { date: "2026-08-30", isRestDay: false }],
};
let a = werkzeug.trainingAuswerten(gymbro, TJETZT);

pruefe("nur Einträge mit gültigem Datum zählen", a.anzahl === 4);
pruefe("das letzte Training ist das vom Dienstag",
       a.letzte && a.letzte.typ === "push" && a.letzte.bewertung === 8);
pruefe("diese Woche: eins", a.dieseWoche === 1);
pruefe("diesen Monat: vier", a.diesenMonat === 4);
pruefe("Serie: KW 39 und 38, KW 37 ist leer - also 2", a.serie === 2);
pruefe("neun Wochen im Balkenbild, die laufende mit 1",
       a.wochen.length === 9 && a.wochen[8].anzahl === 1 && a.wochen[8].teil === "jetzt");
pruefe("vier alte, vier neue Vergleichswochen",
       a.wochen.filter(w => w.teil === "alt").length === 4 && a.wochen.filter(w => w.teil === "neu").length === 4);
pruefe("Wochen vor dem ersten Training (02.09.) sind markiert",
       a.wochen.filter(w => w.vorBeginn).length === 5 && !a.wochen[5].vorBeginn);
pruefe("erst seit drei Wochen dabei: kein Vergleich, Schnitt über drei Wochen",
       a.trend.richtung === "neu" && a.trend.jetzt === 1 && a.trend.wochenJetzt === 3 && a.trend.vorher === null);
pruefe("Dauer: 75 und 60 Minuten, die zehn Stunden fliegen raus",
       a.dauerSchnitt === 68);
pruefe("Muskelgruppen: am längsten her zuerst",
       a.muskeln[0].name === "quads"
       && a.muskeln[a.muskeln.length - 1].datum.getDate() === 22);
pruefe("Rücken zählt mit seinem jüngsten Training",
       a.muskeln.filter(m => m.name === "back")[0].datum.getDate() === 15);
pruefe("Gewicht: der neueste Wert", a.gewichtAktuell && a.gewichtAktuell.wert === 78.6);
pruefe("Vergleich mit dem letzten Wert, der 30 Tage älter ist",
       a.gewichtVorher && a.gewichtVorher.wert === 79.9);
pruefe("Bestleistungen ohne Übungsnamen fallen weg, neueste zuerst",
       a.bestleistungen.length === 2 && a.bestleistungen[0].uebung === "bench_press");
pruefe("Pläne als Text statt Liste: leer statt Absturz", a.plaene.length === 0);
pruefe("Pausen diesen Monat: der Ruhetag, nicht die Absage vom August",
       a.absagenMonat.length === 1 && a.absagenMonat[0].ruhetag);

/* Die laufende Woche bricht die Serie nicht, solange sie nicht vorbei
   ist: am Montag ohne Training zählt die Serie bis letzte Woche. */
a = werkzeug.trainingAuswerten(gymbro, new Date(2026, 8, 28, 9, 0));
pruefe("Montag ohne Training: Serie bleibt 2", a.serie === 2 && a.dieseWoche === 0);

// Ganz leer, oder gar kein Objekt: nichts darf werfen.
let geworfen = false;
try {
  a = werkzeug.trainingAuswerten({}, TJETZT);
  werkzeug.trainingAuswerten(null, TJETZT);
  werkzeug.trainingAuswerten({ sessions: "x", weights: 5 }, TJETZT);
} catch (e) { geworfen = true; }
pruefe("leere oder kaputte Daten werfen nicht", !geworfen);
pruefe("leer heißt: nichts, Serie 0", a.anzahl === 0 && a.serie === 0 && a.letzte === null);

// Übersetzen
pruefe("chest heißt Brust", werkzeug.trainingWort("chest") === "Brust");
pruefe("bench_press heißt Bankdrücken", werkzeug.trainingWort("bench_press") === "Bankdrücken");
pruefe("Unbekanntes ohne Unterstrich", werkzeug.trainingWort("incline_curl") === "Incline curl");

/* Auf dem Bildschirm: mit echten und kaputten Einträgen gemischt. */
werkzeug.trainingSetzen({ abgerufenAm: "2026-09-24T18:00:00.000Z", daten: gymbro });
werkzeug.trainingZeichnen();
const tr = document.getElementById("trainingInhalt").innerHTML;
pruefe("der Bereich zeigt das letzte Training", tr.indexOf("Push") >= 0);
pruefe("und die Bestleistung übersetzt", tr.indexOf("Bankdrücken") >= 0);
pruefe("kein undefined", tr.indexOf("undefined") < 0);
pruefe("kein NaN", tr.indexOf("NaN") < 0);
pruefe("kein [object Object]", tr.indexOf("[object Object]") < 0);
pruefe("Wochenkarte heißt Pro Woche, mit Legende", tr.indexOf("Pro Woche") >= 0 && tr.indexOf("letzte 4 Wochen") >= 0);
pruefe("Aufteilung, Wann und Bestwerte sind da",
       tr.indexOf("Aufteilung") >= 0 && tr.indexOf("Wann du trainierst") >= 0 && tr.indexOf("Bestwerte") >= 0);

/* Die Auswertung über längere Zeit, mit einem eigenen kleinen Bestand.
   Bezug: Freitag, 02.10.2026. Erstes Training am Mi 20.05. */
const lang = { sessions: [
  { arrivedAt: "2026-05-20T16:00:00.000Z", leftAt: "2026-05-20T17:00:00.000Z", trainingType: "push" },
  { arrivedAt: "2026-06-03T16:00:00.000Z", leftAt: "2026-06-03T17:30:00.000Z", trainingType: "pull" },
  { arrivedAt: "2026-06-10T16:00:00.000Z", leftAt: "2026-06-10T18:00:00.000Z", trainingType: "pull" },
  { arrivedAt: "2026-06-17T06:00:00.000Z", leftAt: "2026-06-17T06:25:00.000Z", trainingType: "cardio" },
  { arrivedAt: "2026-09-21T16:00:00.000Z", leftAt: "2026-09-21T17:10:00.000Z", trainingType: "legs" },
  { arrivedAt: "2026-09-22T16:00:00.000Z", leftAt: "2026-09-22T17:20:00.000Z", trainingType: "push" },
  // Laufband, 20 Minuten: zählt beim Schnitt der Dauer nicht mit
  { arrivedAt: "2026-09-23T05:00:00.000Z", leftAt: "2026-09-23T05:20:00.000Z", trainingType: "run" },
  { arrivedAt: "2026-10-01T11:00:00.000Z", leftAt: "2026-10-01T12:00:00.000Z", trainingType: "pull" },
], weights: [
  { date: "2026-05-21", weight: 92.7 }, { date: "2026-08-01", weight: 87 }, { date: "2026-09-29", weight: 89.8 },
] };
const lj = new Date(2026, 9, 2, 9, 0);
let l = werkzeug.trainingAuswerten(lang, lj);
pruefe("Dauer: nur Krafttraining der letzten 30 Tage (70, 80, 60)", l.dauerSchnitt === 70);
pruefe("sechs Monate, Mai bis Oktober", l.monate.length === 6 && l.monate[0].name === "Mai" && l.monate[5].laeuft);
pruefe("Mai erst ab dem 20.", l.monate[0].abTag && l.monate[0].abTag.getDate() === 20 && !l.monate[1].abTag);
pruefe("Juni: 3 Trainings, Ø 105 Min. ohne Cardio",
       l.monate[1].anzahl === 3 && l.monate[1].dauer === 105);
pruefe("Juli und August leer, ohne Dauer", l.monate[2].anzahl === 0 && l.monate[2].dauer === null);
pruefe("Aufteilung: Pull vorn mit 3", l.aufteilung[0].typ === "pull" && l.aufteilung[0].anzahl === 3);
pruefe("Anteile ergeben zusammen 1",
       Math.abs(l.aufteilung.reduce((x, t) => x + t.anteil, 0) - 1) < 1e-9);
pruefe("Wochentage: Mittwoch vorn (5)", l.wochentage.tage[2] === 5 && l.wochentage.tage[0] === 1);
pruefe("meist abends (5 von 8)", l.wochentage.meist === "abends" && l.wochentage.meistAnzahl === 5);
pruefe("beste Woche: KW 39 mit 3", l.bestwerte.besteWoche.anzahl === 3);
pruefe("längste Serie: 3 Wochen im Juni, nicht die 2 jetzt", l.bestwerte.laengsteSerie === 3);
pruefe("längstes Training: 120 Min. am 10.06.",
       l.bestwerte.laengstes.minuten === 120 && l.bestwerte.laengstes.datum.getDate() === 10);
pruefe("Gewicht: alle Messungen, der erste Wert als Beginn",
       l.gewicht.length === 3 && l.gewichtErstes.wert === 92.7 && l.gewichtVorher.wert === 87);
werkzeug.trainingSetzen({ abgerufenAm: "2026-10-02T06:00:00.000Z", daten: lang });

/* Fremde Geräte: ohne Freigabe weder Reiter noch Karte auf der Übersicht,
   auch wenn (warum auch immer) Daten im Speicher lägen. */
localStorage.removeItem("stundenplan.trainingZugang");
pruefe("ohne Freigabe ist der Reiter versteckt", werkzeug.trainingSichtbar() === false);
pruefe("und die Übersicht hat keine Trainingskarte",
       werkzeug.trainingStartKarte(TJETZT) === "");
localStorage.setItem("stundenplan.trainingZugang", JSON.stringify({ antwort: "nein", am: 1 }));
pruefe("\"nein\" versteckt ihn ebenso", werkzeug.trainingSichtbar() === false);
localStorage.setItem("stundenplan.trainingZugang", JSON.stringify({ antwort: "ja", am: 1 }));
pruefe("mit Freigabe ist er da", werkzeug.trainingSichtbar() === true);
pruefe("und die Karte auch", werkzeug.trainingStartKarte(TJETZT).indexOf("Training") >= 0);
localStorage.removeItem("stundenplan.trainingZugang");
werkzeug.trainingSetzen(null);


/* ====================================================================== */
abschnitt("13. Uebersicht schlank, Aenderungen als Hinweis, alle Trainings");

pruefe("die Modulnummer faellt auf der Uebersicht weg",
       werkzeug.kurzerTitel("4 - Management - MA- und UN-Führung") === "Management - MA- und UN-Führung");
pruefe("ein Titel ohne Nummer bleibt, wie er ist",
       werkzeug.kurzerTitel("WPF - Social Innovation") === "WPF - Social Innovation");

/* Vorbei ist vorbei: auf der Uebersicht steht nur, was noch kommt. */
const hHeute = (function () {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0")
       + "-" + String(d.getDate()).padStart(2, "0");
})();
STUNDENPLAN.termine = [
  planTermin("t.frueh", hHeute + "T00:00", hHeute + "T00:01", "Fruehfach"),
  planTermin("t.spaet", hHeute + "T23:58", hHeute + "T23:59", "Spaetfach"),
];
werkzeug.filterLeeren();
werkzeug.setzen({}, []);
STUNDENPLAN.aenderungen = [];
werkzeug.startZeichnen();
let u = document.getElementById("startInhalt").innerHTML;
pruefe("was noch kommt, steht da", u.indexOf("Spaetfach") >= 0);
pruefe("was vorbei ist, nicht", u.indexOf("Fruehfach") < 0);
pruefe("ohne Aenderungen kein Hinweis", u.indexOf("start-geaendert") < 0);
pruefe("und keine Null-Zahlen mehr", u.indexOf("neue Änderungen") < 0 && u.indexOf("start-zahl") < 0);

/* Eine ungesehene Aenderung: grosser Hinweis mit dem Fach darin. */
STUNDENPLAN.aenderungen = [{ erkanntAm: "2099-01-01T10:00", eintraege: [
  { typ: "entfallen", termin: planTermin("t.weg", "2099-01-02T08:00", "2099-01-02T09:00", "Ausfallfach") },
]}];
werkzeug.startZeichnen();
u = document.getElementById("startInhalt").innerHTML;
pruefe("eine Aenderung macht den grossen Hinweis", u.indexOf("start-geaendert") >= 0);
pruefe("mit dem Fach darin, nicht nur einer Zahl", u.indexOf("Ausfallfach") >= 0);
pruefe("und einem Knopf zum Abhaken", u.indexOf("data-start-gesehen") >= 0);
pruefe("jede Aenderung hat ihren eigenen Haken", u.indexOf("data-aenderung-haken") >= 0);
werkzeug.aenderungenGesehen();
werkzeug.startZeichnen();
u = document.getElementById("startInhalt").innerHTML;
pruefe("nach Gesehen ist der Hinweis weg", u.indexOf("start-geaendert") < 0);

/* Einzeln abhaken: zwei Aenderungen, eine abgehakt - die andere bleibt,
   und der Hinweis mit ihr. Erst mit der zweiten ist er weg. */
localStorage.removeItem("stundenplan.zuletztGesehen");
STUNDENPLAN.aenderungen = [{ erkanntAm: "2099-01-01T10:00", eintraege: [
  { typ: "entfallen", termin: planTermin("t.a", "2099-01-02T08:00", "2099-01-02T09:00", "Fach Eins") },
  { typ: "geaendert", termin: planTermin("t.b", "2099-01-03T08:00", "2099-01-03T09:00", "Fach Zwei"),
    felder: [{ feld: "Raum", vorher: "A 1", nachher: "B 2" }] },
]}];
let offen = werkzeug.startAenderungen();
pruefe("zwei offene Aenderungen", offen.length === 2 && werkzeug.ungesehen() === 2);
werkzeug.aenderungAbhaken(offen[0].schluessel);
offen = werkzeug.startAenderungen();
pruefe("nach einem Haken bleibt genau die andere",
       offen.length === 1 && offen[0].termin.titel === "Fach Zwei");
werkzeug.startZeichnen();
u = document.getElementById("startInhalt").innerHTML;
pruefe("der Hinweis steht noch, ohne die abgehakte",
       u.indexOf("Fach Zwei") >= 0 && u.indexOf("Fach Eins") < 0);
werkzeug.aenderungAbhaken(offen[0].schluessel);
werkzeug.startZeichnen();
u = document.getElementById("startInhalt").innerHTML;
pruefe("mit dem letzten Haken ist der Hinweis weg", u.indexOf("start-geaendert") < 0);

/* Eine neue Erkennung desselben Termins ist eine neue Aenderung - der
   alte Haken darf sie nicht verschlucken. */
STUNDENPLAN.aenderungen.unshift({ erkanntAm: "2099-02-01T10:00", eintraege: [
  { typ: "entfallen", termin: planTermin("t.b", "2099-01-03T08:00", "2099-01-03T09:00", "Fach Zwei") },
]});
pruefe("eine spaetere Aenderung am selben Termin ist wieder offen", werkzeug.ungesehen() === 1);

STUNDENPLAN.aenderungen = [];
localStorage.removeItem("stundenplan.zuletztGesehen");
localStorage.removeItem("stundenplan.aenderungenAbgehakt");
STUNDENPLAN.termine = [];

/* Alle Trainings: jedes Training steht da, der Filter greift. */
const verlaufDaten = {
  gyms: [{ id: "dns_potsdam", label: "DNS Potsdam" }],
  sessions: [
    { id: "a", arrivedAt: "2026-08-27T16:00:00.000Z", leftAt: "2026-08-27T17:30:00.000Z",
      trainingType: "legs", muscleGroups: ["quads", "calves"], gymId: "dns_potsdam",
      partners: [{ name: "Linus", userId: "x" }], notes: "Kniebeuge schwer" },
    { id: "b", arrivedAt: "2026-09-20T16:00:00.000Z", trainingType: "push",
      muscleGroups: ["chest"], gymId: "dns_potsdam", partners: [], notes: null },
    { id: "c", arrivedAt: "2026-05-22T20:00:00.000Z", trainingType: "run", muscleGroups: ["run"] },
  ],
};
werkzeug.trainingFilter("", "");
let v = werkzeug.trainingVerlaufZeichnen(verlaufDaten, TJETZT);
pruefe("alle drei Trainings stehen in der Liste, auch das vom Mai",
       v.indexOf("3 von 3") >= 0 && v.indexOf("Mai 2026") >= 0);
pruefe("das Gym mit Namen statt Kennung", v.indexOf("DNS Potsdam") >= 0 && v.indexOf("dns_potsdam\"") < 0);
pruefe("mit Trainingspartner und Notiz", v.indexOf("mit Linus") >= 0 && v.indexOf("Kniebeuge schwer") >= 0);
pruefe("run heisst Laufen", v.indexOf("Laufen") >= 0);
werkzeug.trainingFilter("legs", "");
v = werkzeug.trainingVerlaufZeichnen(verlaufDaten, TJETZT);
pruefe("Filter Beine: nur das Beintraining", v.indexOf("1 von 3") >= 0 && v.indexOf("August 2026") >= 0
       && v.indexOf("September 2026") < 0);
werkzeug.trainingFilter("", "chest");
v = werkzeug.trainingVerlaufZeichnen(verlaufDaten, TJETZT);
pruefe("Filter Brust: nur das Push-Training", v.indexOf("1 von 3") >= 0 && v.indexOf("September 2026") >= 0);
werkzeug.trainingFilter("legs", "chest");
v = werkzeug.trainingVerlaufZeichnen(verlaufDaten, TJETZT);
pruefe("nichts passt: ein Satz statt Leere", v.indexOf("Kein Training passt") >= 0);
pruefe("keine kaputten Werte", v.indexOf("undefined") < 0 && v.indexOf("NaN") < 0);
werkzeug.trainingFilter("", "");


/* ====================================================================== */
abschnitt("14. Trainingstrend fuer die Uebersicht");

/* Bezug: Donnerstag, 24.09.2026. Die laufende Woche (ab 21.09.) zaehlt
   nicht mit. Letzte vier Wochen: ab 24.08., die vier davor: ab 27.07. */
function trainingsWoche(montagText, anzahl) {
  const liste = [];
  for (let i = 0; i < anzahl; i++) {
    liste.push({ arrivedAt: montagText + "T1" + i + ":00:00.000Z", trainingType: "push", muscleGroups: [] });
  }
  return liste;
}
function trendBei(sessions) {
  return werkzeug.trainingAuswerten({ sessions: sessions }, new Date(2026, 8, 24, 20, 0)).trend;
}
let trend = trendBei([].concat(trainingsWoche("2026-08-25", 2), trainingsWoche("2026-09-01", 2), trainingsWoche("2026-09-08", 3),
                            trainingsWoche("2026-09-15", 3), trainingsWoche("2026-07-28", 1), trainingsWoche("2026-08-04", 1)));
pruefe("mehr trainiert: Trend hoch", trend.richtung === "hoch" && trend.jetzt === 2.5 && trend.vorher === 0.5);
trend = trendBei([].concat(trainingsWoche("2026-08-04", 3), trainingsWoche("2026-08-11", 3), trainingsWoche("2026-09-15", 1)));
pruefe("weniger trainiert: Trend runter", trend.richtung === "runter");
trend = trendBei([].concat(trainingsWoche("2026-07-28", 1), trainingsWoche("2026-08-11", 1),
                            trainingsWoche("2026-09-01", 1), trainingsWoche("2026-09-15", 1)));
pruefe("gleich viel: Trend gleich", trend.richtung === "gleich" && trend.jetzt === 0.5 && trend.vorher === 0.5);
trend = trendBei(trainingsWoche("2026-09-22", 3));
pruefe("nur diese Woche trainiert: noch kein Vergleich, sie ist nicht vorbei",
       trend.richtung === "neu" && trend.jetzt === null);
/* Der Fehler vom 02.10.2026: Wochen vor dem ersten Training zählten als
   Nullwochen. Wer in der Woche ab 17.08. angefangen hat und seitdem jede
   Woche zweimal geht, hätte "mehr als davor" mit Ø 0,5 davor gesehen. */
trend = trendBei([].concat(trainingsWoche("2026-08-18", 2), trainingsWoche("2026-08-25", 2), trainingsWoche("2026-09-01", 2),
                            trainingsWoche("2026-09-08", 2), trainingsWoche("2026-09-15", 2)));
pruefe("Wochen vor dem ersten Training ziehen den Schnitt nicht runter",
       trend.richtung === "gleich" && trend.vorher === 2 && trend.wochenVorher === 1);
pruefe("nichts in acht Wochen: keine", trendBei(trainingsWoche("2026-06-02", 2)).richtung === "keine");


/* ====================================================================== */
abschnitt("15. Uni-Plan: Arbeit, Feiertage, Urlaub, Ausblick");

pruefe("Ostern 2026 ist am 5. April", werkzeug.ostersonntag(2026) === "2026-04-05");
pruefe("Ostern 2027 ist am 28. Maerz", werkzeug.ostersonntag(2027) === "2027-03-28");
pruefe("Karfreitag 2027 ist frei", werkzeug.feiertagAm("2027-03-26", "BE") === "Karfreitag");
pruefe("Frauentag in Berlin, nicht in Brandenburg",
       werkzeug.feiertagAm("2027-03-08", "BE") === "Frauentag" && werkzeug.feiertagAm("2027-03-08", "BB") === "");
pruefe("Reformationstag in Brandenburg, nicht in Berlin",
       werkzeug.feiertagAm("2028-10-31", "BB") === "Reformationstag" && werkzeug.feiertagAm("2028-10-31", "BE") === "");
pruefe("Mecklenburg-Vorpommern hat beide",
       werkzeug.feiertagAm("2027-03-08", "MV") === "Frauentag"
       && werkzeug.feiertagAm("2028-10-31", "MV") === "Reformationstag");
pruefe("den Frauentag in MV aber erst seit 2023", werkzeug.feiertagAm("2022-03-08", "MV") === "");
pruefe("Voreinstellung ist Mecklenburg-Vorpommern", werkzeug.UNIPLAN_VORGABE.land === "MV");

werkzeug.eigene([]);
werkzeug.uniplanSetzenTest({ arbeit: true, von: "08:00", bis: "16:30", land: "BE" });
let arbeit = werkzeug.arbeitsTermine();
const arbeitAm = tag => arbeit.filter(t => t.id === "arbeit-" + tag)[0];
pruefe("Montag in der Praxisphase: Arbeit 08:00 bis 16:30",
       arbeitAm("2026-11-02") && arbeitAm("2026-11-02").start === "2026-11-02T08:00"
       && arbeitAm("2026-11-02").ende === "2026-11-02T16:30");
pruefe("Samstag nicht", !arbeitAm("2026-11-07"));
pruefe("in der Theoriephase nicht", !arbeitAm("2026-09-24") && !arbeitAm("2027-02-01"));
pruefe("am 1. Weihnachtstag nicht", !arbeitAm("2026-12-25"));
pruefe("am 1. Mai nicht, am Montag danach schon",
       !arbeitAm("2026-05-01") && arbeitAm("2026-05-18"));
pruefe("die letzte Praxisphase reicht bis Freitag, 24.09.2027",
       arbeitAm("2027-09-24") && !arbeitAm("2027-09-27"));
pruefe("Arbeit steht mit im Plan", werkzeug.alleAngezeigten().some(t => t.id === "arbeit-2026-11-02"));

werkzeug.uniplanSetzenTest({ von: "09:00", bis: "17:30" });
arbeit = werkzeug.arbeitsTermine();
pruefe("andere Arbeitszeit gilt sofort fuer alle Tage",
       arbeitAm("2026-11-02").start === "2026-11-02T09:00" && arbeitAm("2027-06-01").ende === "2027-06-01T17:30");

// Urlaub zwischen den Jahren: 28.12. bis 1.1. - der 1.1. ist ohnehin Feiertag.
werkzeug.urlaubEintragen("2026-12-28", "2027-01-01");
arbeit = werkzeug.arbeitsTermine();
pruefe("im Urlaub keine Arbeit", !arbeitAm("2026-12-28") && !arbeitAm("2026-12-31"));
pruefe("davor und danach schon", arbeitAm("2026-12-23") && arbeitAm("2027-01-04"));
pruefe("der Urlaub kostet vier Arbeitstage (der 1.1. ist Feiertag)",
       werkzeug.urlaubsTage({ von: "2026-12-28", bis: "2027-01-01" }) === 4);
pruefe("ein Urlaub in der Theoriephase kostet keinen",
       werkzeug.urlaubsTage({ von: "2026-10-05", bis: "2026-10-09" }) === 0);
pruefe("ohne ersten Tag gibt es eine Meldung statt eines kaputten Eintrags",
       werkzeug.urlaubEintragen("", "") !== "");

werkzeug.uniplanSetzenTest({ arbeit: false });
pruefe("ausgeschaltet: keine Arbeit mehr", werkzeug.arbeitsTermine().length === 0);

// Ausblick vom 24.09.2026 aus
const blick = werkzeug.uniplanAusblick("2026-09-24");
pruefe("gerade Theorie im 5. Studienhalbjahr",
       blick.aktuell && blick.aktuell.art === "theorie" && blick.aktuell.halbjahr === 5);
pruefe("Woche 7 von 12, noch 38 Tage", blick.aktuell.woche === 7 && blick.aktuell.wochen === 12
       && blick.aktuell.nochTage === 38);
pruefe("als Naechstes die Praxisphase ab 02.11.2026",
       blick.eintraege.filter(e => e.art !== "urlaub")[0].von === "2026-11-02");
pruefe("Vergangenes ist nicht dabei (Abgabe Studienarbeit 17.08.2026)",
       !blick.eintraege.some(e => e.titel === "Abgabe der Studienarbeit"));
pruefe("der Urlaub steht im Ausblick", blick.eintraege.some(e => e.art === "urlaub" && e.von === "2026-12-28"));
pruefe("die Bachelorarbeit auch", blick.eintraege.some(e => e.titel === "Abgabe der Bachelorarbeit"));

let karte = werkzeug.uniplanStartKarte(new Date(2026, 8, 24, 12, 0));
pruefe("das Widget zeigt die laufende Woche", karte.indexOf("Woche 7 von 12") >= 0);
pruefe("und nichts Vergangenes", karte.indexOf("Studienarbeit") < 0 && karte.indexOf("2025") < 0);
pruefe("keine kaputten Werte im Widget", !/undefined|NaN/.test(karte));
pruefe("nach dem Studium kein Widget", werkzeug.uniplanStartKarte(new Date(2027, 9, 5)) === "");
werkzeug.eigene([]);


/* ====================================================================== */
abschnitt("16. Kalender und Liste koennen dasselbe");

const tag16 = {
  datum: new Date(2026, 9, 1), schluessel: "2026-10-01", istHeute: false, ganztags: [],
  termine: [planTermin("t.k", "2026-10-01T09:45", "2026-10-01T11:15", "34 - Schluesselkompetenzen V")],
  aufgaben: [{ id: "eigen-k", text: "Bibliothek", datum: "2026-10-01", erledigt: false, wichtig: false }],
};
werkzeug.bearbeiten(false);
let kal = werkzeug.kalenderBauen([tag16]);
pruefe("im Kalender oeffnet der Tagkopf das Tagesfenster", kal.indexOf('data-tag-oeffnen="2026-10-01"') >= 0);
pruefe("ein To-do im Kalender oeffnet es zum Bearbeiten", kal.indexOf('data-tag-bearbeiten="eigen-k"') >= 0);
pruefe("im schmalen Kalenderkasten fehlt die Modulnummer",
       kal.indexOf(">Schluesselkompetenzen V<") >= 0 && kal.indexOf(">34 - Schluessel") < 0);

// Das Tagesfenster zeigt die Knoepfe auch ohne Bearbeiten-Modus.
let karte16 = werkzeug.tagKarteBauen(tag16, true);
pruefe("die Tageskarte im Fenster hat + To-do und + Termin",
       karte16.indexOf("data-aufgabe-neu") >= 0 && karte16.indexOf("data-termin-neu") >= 0);
pruefe("und an jedem Termin + Notiz und + To-do",
       karte16.indexOf("data-zettel-neu") >= 0 && karte16.indexOf('data-notiz-oeffnen="t.k"') >= 0);
pruefe("ohne Fenster und ohne Bearbeiten keine Knoepfe",
       werkzeug.tagKarteBauen(tag16, false).indexOf("data-aufgabe-neu") < 0);

// Ein neues To-do fuer den Tag wird IN der Karte geschrieben.
werkzeug.offeneNotizSetzen("neu:2026-10-01");
karte16 = werkzeug.tagKarteBauen(tag16, true);
pruefe("das Eingabefeld fuer ein neues To-do steht in der Tageskarte",
       karte16.indexOf('id="notizFeld"') >= 0 && karte16.indexOf('data-notiz-speichern="neu:2026-10-01"') >= 0);
werkzeug.offeneNotizSetzen(null);


/* ====================================================================== */
abschnitt("17. Das Terminfenster im Kalender hat + To-do");

STUNDENPLAN.termine = [planTermin("t.f", "2026-10-01T08:45", "2026-10-01T13:15", "WPF - Nachhaltiges Wirtschaften (Do)")];
werkzeug.setzen({}, []);
werkzeug.terminFensterZeigen("t.f");
let fenster17 = document.getElementById("terminInhalt").innerHTML;
pruefe("ohne To-do steht dort + To-do", fenster17.indexOf("+ To-do") >= 0
       && fenster17.indexOf('data-notiz-bearbeiten="t.f"') >= 0);
pruefe("und + Notiz wie in der Liste", fenster17.indexOf('data-zettel-neu="termin:t.f"') >= 0);
pruefe("das Wort Kurznotiz kommt nicht mehr vor", fenster17.indexOf("Kurznotiz") < 0);
werkzeug.setzen({ "t.f": { text: "Aufgabe vorbereiten", erledigt: false, wichtig: false, geaendert: 1 } }, []);
werkzeug.terminFensterZeigen("t.f");
fenster17 = document.getElementById("terminInhalt").innerHTML;
pruefe("mit To-do steht es abhakbar da", fenster17.indexOf('data-todo-haken="t.f"') >= 0
       && fenster17.indexOf("Aufgabe vorbereiten") >= 0);
pruefe("und der Knopf heisst To-do bearbeiten", fenster17.indexOf("To-do bearbeiten") >= 0);
werkzeug.setzen({}, []);
STUNDENPLAN.termine = [];


/* ====================================================================== */
abschnitt("18. Ganztags: ein Balken ueber mehrere Tage, Bahnen uebereinander");

/* Woche ab Mo 05.10.2026. Urlaub vom 01.10. bis Mi 07.10. (laeuft also
   ueber den linken Wochenrand), ein Geburtstag am Di, ein To-do am Do. */
const u18 = { id: "u18", titel: "Urlaub an der Ostsee", start: "2026-10-01T00:00",
              ende: "2026-10-07T00:00", ganztags: true, urlaub: true };
const g18 = { id: "g18", titel: "Geburtstag", start: "2026-10-06T00:00",
              ende: "2026-10-06T00:00", ganztags: true, ort: "Rostock" };
const tage18 = [];
for (let i = 0; i < 7; i++) {
  const d = new Date(2026, 9, 5 + i);
  const s18 = "2026-10-" + String(5 + i).padStart(2, "0");
  tage18.push({
    datum: d, schluessel: s18, termine: [], istHeute: false,
    ganztags: [u18, g18].filter(t => t.start.slice(0, 10) <= s18 && t.ende.slice(0, 10) >= s18),
    aufgaben: i === 3 ? [{ id: "a18", text: "Praesentation", erledigt: false, wichtig: false }] : [],
  });
}
const k18 = werkzeug.kalenderBauen(tage18);
function anzahl18(text, teil) { return text.split(teil).length - 1; }
pruefe("der Urlaub steht einmal da, nicht dreimal", anzahl18(k18, 'data-termin-bearbeiten="u18"') === 1);
pruefe("und reicht von Montag bis Mittwoch (Spalte 1 bis 3)",
       /data-termin-bearbeiten="u18"/.test(k18)
       && k18.indexOf("grid-column:1 / 4; grid-row:1") >= 0);
pruefe("er geht links ueber den Wochenrand hinaus", k18.indexOf("kalender-ganztag-weiter-links") >= 0);
pruefe("aber nicht rechts", k18.indexOf("kalender-ganztag-weiter-rechts") < 0);
pruefe("mit Zeitspanne", k18.indexOf("01.10. – 07.10.") >= 0);
pruefe("der Geburtstag liegt am Dienstag in der zweiten Bahn",
       k18.indexOf("grid-column:2 / 3; grid-row:2") >= 0);
pruefe("das To-do am Donnerstag passt in die erste Bahn",
       k18.indexOf("grid-column:4 / 5; grid-row:1") >= 0 && k18.indexOf('data-tag-bearbeiten="a18"') >= 0);
pruefe("zwei Bahnen", k18.indexOf("grid-template-rows:repeat(2, auto)") >= 0);
pruefe("sieben Tagesfelder zum Antippen", anzahl18(k18, 'class="kalender-ganztag ') === 7);
pruefe("Ort beim Geburtstag", k18.indexOf("Rostock") >= 0);
const leer18 = werkzeug.kalenderBauen(tage18.map(t => Object.assign({}, t, { ganztags: [], aufgaben: [] })));
pruefe("ohne Ganztagiges keine Zeile", leer18.indexOf("kalender-ganztag-flaeche") < 0);


/* ====================================================================== */
console.log("");
if (fehler.length) {
  console.log("FEHLGESCHLAGEN (" + fehler.length + "):");
  fehler.forEach(function (e) { console.log("  - " + e); });
  throw new Error(fehler.length + " Pruefung(en) fehlgeschlagen");
}
console.log("ALLE TESTS BESTANDEN");
"bestanden";
