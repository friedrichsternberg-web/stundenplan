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
  "  starttagWaehlen: starttagWaehlen," +
  "  startTodos: startTodos," +
  "  startZeichnen: startZeichnen," +
  "  startseiteWaehlen: startseiteWaehlen," +
  "  faecherBereichZeichnen: faecherBereichZeichnen," +
  "  abwaehlen: function (titel) { abgewaehlteFaecher.add(titel); }," +
  "  eigene: function (t) { eigeneTermine = t; }," +
  "  notizbuch: function (z) { zettel = z; }" +
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

let tag = werkzeug.starttagWaehlen(new Date(2026, 8, 24, 9, 0));
pruefe("morgens zeigt die Karte heute", tag && tag.istHeute && tag.schluessel === "2026-09-24");

tag = werkzeug.starttagWaehlen(new Date(2026, 8, 24, 11, 0));
pruefe("waehrend der Vorlesung auch noch", tag && tag.istHeute);

/* Nach Ende der letzten Vorlesung ist heute uninteressant. Freitag bis
   Sonntag ist nichts - also springt die Karte ueber das Wochenende auf
   Montag, statt "Morgen: nichts" zu zeigen. */
tag = werkzeug.starttagWaehlen(new Date(2026, 8, 24, 13, 0));
pruefe("abends springt sie zum naechsten Tag MIT Terminen",
       tag && !tag.istHeute && tag.schluessel === "2026-09-28");
pruefe("und weiss, dass heute schon etwas war", tag && tag.heuteVorbei === true);

// Ein ganztaegiger eigener Termin haelt den Tag offen, auch wenn sonst nichts ist.
werkzeug.eigene([{ id: "termin-geb", titel: "Geburtstag", start: "2026-09-26",
                   ende: "2026-09-26", ganztags: true, geaendert: 1 }]);
tag = werkzeug.starttagWaehlen(new Date(2026, 8, 26, 9, 0));
pruefe("ein Geburtstag am Samstag steht am Samstag in der Karte",
       tag && tag.istHeute && tag.ganztags.length === 1);
werkzeug.eigene([]);

tag = werkzeug.starttagWaehlen(new Date(2026, 10, 1, 9, 0));
pruefe("zwei Wochen ohne Termin: keine Karte statt einer falschen", tag === null);

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
pruefe("drei reichen - nichts wird aufgefuellt", kennungen.length === 3);
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
pruefe("hoechstens sechs Zeilen", todos.auswahl.length === 6);
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
console.log("");
if (fehler.length) {
  console.log("FEHLGESCHLAGEN (" + fehler.length + "):");
  fehler.forEach(function (e) { console.log("  - " + e); });
  throw new Error(fehler.length + " Pruefung(en) fehlgeschlagen");
}
console.log("ALLE TESTS BESTANDEN");
"bestanden";
