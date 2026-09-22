#!/usr/bin/osascript -l JavaScript
/* =========================================================================
   Prueft das Notizbuch: freie Notizen und ihre Verknuepfungen.

   Das Notizbuch fuehrt die dritte Art von Eintrag ein, nach der Notiz am
   Termin und der freien Aufgabe. Geprueft wird vor allem das, was beim
   Hinzufuegen einer Art schiefgehen kann:

   1. DER RUNDLAUF. Was eingesammelt und wieder ausgepackt wird, muss
      hinterher dasselbe sein - samt Verknuepfungen. Faellt beim Auspacken
      eine Zeile weg, merkt man es nicht: in der Ablage steht alles noch,
      nur auf dem Geraet nicht mehr.

   2. DAS ALTE GERAET. Eine Notiz aus dem Notizbuch traegt ihren Text im
      Feld "inhalt", nicht in "text". Das ist kein Geschmack, sondern die
      einzige Absicherung gegen eine aeltere Fassung der App: die sortiert
      jeden Eintrag mit einem Feld "text" in Notizen oder Aufgaben ein und
      wuerde die Verknuepfungen beim Zurueckschreiben wegwerfen - auf allen
      Geraeten gleichzeitig. Ohne "text" greift dort stattdessen die Regel
      fuer Unbekanntes: aufheben und unveraendert zurueckgeben.

      Abschnitt 4 spielt die alte Fassung deshalb wirklich nach, statt sich
      auf eine Behauptung zu verlassen.

   3. DIE RUECKRICHTUNG. Eine Notiz am Modul muss bei JEDEM Termin dieses
      Moduls auftauchen, eine Notiz an einem einzelnen Termin nur dort.
      Stimmt das nicht, ist die ganze Verknuepferei nutzlos.

   Aufruf:  osascript -l JavaScript tests/test_zettel.js
   ========================================================================= */

function lies(pfad) {
  return $.NSString.stringWithContentsOfFileEncodingError(pfad, 4, null).js;
}

const WURZEL = (function () {
  const argumente = $.NSProcessInfo.processInfo.arguments.js
    .map(function (wert) { return wert.js; });
  let eigenerPfad = "";
  for (const wert of argumente) {
    if (typeof wert === "string" && /test_zettel\.js$/.test(wert)) eigenerPfad = wert;
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

var angestossen = 0;
var setTimeout = function () { angestossen++; return 0; };
var clearTimeout = function () {};
var setInterval = function () { return 0; };
var clearInterval = function () {};

var elemente = {};
function neuesElement(kennung) {
  return {
    id: kennung, hidden: false, textContent: "", innerHTML: "", value: "",
    open: false, title: "", checked: false, disabled: false,
    addEventListener: function () {}, setAttribute: function () {},
    getAttribute: function () { return null; },
    appendChild: function () {}, removeChild: function () {},
    classList: { toggle: function () {}, add: function () {}, remove: function () {} },
    style: {}, select: function () {}, scrollIntoView: function () {}, focus: function () {},
    closest: function () { return null; }, querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
  };
}
var document = {
  head: neuesElement("head"), body: neuesElement("body"),
  getElementById: function (k) {
    if (!elemente[k]) elemente[k] = neuesElement(k);
    return elemente[k];
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

var STUNDENPLAN = {
  fachrichtung: "tourismus", semester: "semester5", kurs: "kurs",
  geprueftAm: "2026-09-21T10:00", nichtBelegteFaecher: [], nichtBelegteGruppen: [],
  aenderungen: [],
  /* Zwei Termine desselben Moduls und einer aus einem anderen. Genau das
     braucht Abschnitt 5: eine Notiz am Modul muss bei beiden Terminen
     stehen und beim dritten nicht. */
  termine: [
    { id: "sked.a1", start: "2026-09-28T09:45", ende: "2026-09-28T11:15",
      art: "SU", titel: "34 - Schluesselkompetenzen V", dozent: "Hechel",
      raum: "CL: 6A.206", anmerkung: "", gruppe: "" },
    { id: "sked.a2", start: "2026-10-05T09:45", ende: "2026-10-05T11:15",
      art: "SU", titel: "34 - Schluesselkompetenzen V", dozent: "Hechel",
      raum: "CL: 6A.206", anmerkung: "", gruppe: "" },
    { id: "sked.b1", start: "2026-09-29T08:45", ende: "2026-09-29T13:15",
      art: "SU", titel: "WPF - Social Innovation", dozent: "Knoll",
      raum: "CL: 6A.014", anmerkung: "", gruppe: "" },
  ],
};

const werkzeug = eval(
  lies(WURZEL + "/sync.js") + "\n" +
  lies(WURZEL + "/app.js") + "\n" +
  "({" +
  "  sammeln: abgleichSammeln," +
  "  uebernehmen: abgleichUebernehmen," +
  "  zettelSetzen: zettelSetzen," +
  "  zettelTitel: zettelTitel," +
  "  zettelVorschau: zettelVorschau," +
  "  zettelFuerTermin: zettelFuerTermin," +
  "  zettelFuerFach: zettelFuerFach," +
  "  zettelRueckverweise: zettelRueckverweise," +
  "  verweiseSaeubern: verweiseSaeubern," +
  "  verweisBeschreiben: verweisBeschreiben," +
  "  listeBauen: listeBauen," +
  "  bearbeiten: function (an) { bearbeitenModus = an; }," +
  "  lage: function () { return { notizen: notizen, aufgaben: aufgaben," +
  "        termine: eigeneTermine, zettel: zettel, grabsteine: grabsteine," +
  "        unbekannt: unbekannteEintraege }; }," +
  "  setzen: function (stand) { notizen = stand.notizen || {};" +
  "        aufgaben = stand.aufgaben || []; eigeneTermine = stand.termine || [];" +
  "        zettel = stand.zettel || []; grabsteine = stand.grabsteine || {};" +
  "        unbekannteEintraege = stand.unbekannt || {}; }" +
  "})");


/* --- Pruefwerk ---------------------------------------------------------- */

const fehler = [];
let bereich = "";
function abschnitt(t) { bereich = t; console.log("\n" + t); }
function pruefe(was, ja) {
  console.log((ja ? "  OK   " : "  FEHL ") + was);
  if (!ja) fehler.push(bereich + " / " + was);
}
function sortiert(wert) {
  if (Array.isArray(wert)) return wert.map(sortiert);
  if (wert && typeof wert === "object") {
    const neu = {};
    for (const f of Object.keys(wert).sort()) neu[f] = sortiert(wert[f]);
    return neu;
  }
  return wert;
}
function gleich(was, a, b) {
  const ja = JSON.stringify(sortiert(a)) === JSON.stringify(sortiert(b));
  pruefe(was, ja);
  if (!ja) {
    console.log("         erwartet: " + JSON.stringify(sortiert(b)).slice(0, 220));
    console.log("         bekommen: " + JSON.stringify(sortiert(a)).slice(0, 220));
  }
}


abschnitt("1. Ueberschrift und Vorschau kommen aus dem Text");

/* Die erste nicht leere Zeile ist die Ueberschrift - so macht es die
   Notizen-App von Apple auch, und es erspart ein zweites Eingabefeld. */
pruefe("die erste Zeile wird die Ueberschrift",
       werkzeug.zettelTitel({ text: "Klausur Montag\nKapitel 3 lesen" })
       === "Klausur Montag");

pruefe("Leerzeilen davor zaehlen nicht",
       werkzeug.zettelTitel({ text: "\n\n  Klausur Montag  \nmehr" })
       === "Klausur Montag");

pruefe("ohne Text steht dort nicht nichts",
       werkzeug.zettelTitel({ text: "   \n\n" }) === "Ohne Titel");

pruefe("die Vorschau laesst die Ueberschrift weg",
       werkzeug.zettelVorschau({ text: "Klausur Montag\nKapitel 3\nKapitel 4" })
       === "Kapitel 3 · Kapitel 4");

pruefe("eine einzeilige Notiz hat keine Vorschau",
       werkzeug.zettelVorschau({ text: "Nur eine Zeile" }) === "");


abschnitt("2. Verweise werden geordnet und entdoppelt");

/* Sortiert und ohne Doppelte gespeichert - nicht aus Ordnungsliebe: der
   Abgleich entscheidet bei gleichem Zeitstempel ueber einen Textabdruck
   des Eintrags. Haengt die Reihenfolge davon ab, in welcher man die
   Verknuepfungen angetippt hat, gewinnt mal die eine und mal die andere
   Fassung - und zwar zufaellig. */
gleich("doppelte fliegen raus, der Rest steht sortiert",
       werkzeug.verweiseSaeubern(
         ["zettel:z1", "fach:B", "fach:A", "fach:B"]),
       ["fach:A", "fach:B", "zettel:z1"]);

gleich("ohne Doppelpunkt ist es kein Verweis",
       werkzeug.verweiseSaeubern(["kaputt", "", "fach:A", 7, null]),
       ["fach:A"]);

gleich("aus etwas anderem als einer Liste wird eine leere Liste",
       werkzeug.verweiseSaeubern("fach:A"), []);


abschnitt("3. Der Rundlauf: nichts geht verloren");

const ausgangslage = {
  notizen: { "sked.a1": { text: "11:25 Beginn", erledigt: false,
                          wichtig: true, geaendert: 111 } },
  aufgaben: [{ id: "eigen-1", text: "Hausarbeit drucken", datum: "2026-09-30",
               erledigt: false, wichtig: false, geaendert: 222 }],
  termine: [{ id: "termin-1", titel: "Zahnarzt", start: "2026-09-30T10:00",
              ende: "2026-09-30T11:00", ganztags: false, ort: "Praxis",
              notiz: "Karte mitnehmen", wichtig: false, geaendert: 333 }],
  zettel: [
    { id: "zettel-1", text: "Klausurvorbereitung\n\nKapitel 3 und 4.",
      verweise: ["fach:34 - Schluesselkompetenzen V", "termin:sked.b1"],
      wichtig: false, geaendert: 444 },
    { id: "zettel-2", text: "Lerngruppe", verweise: ["zettel:zettel-1"],
      wichtig: true, geaendert: 555 },
  ],
  grabsteine: { "eigen-weg": 666 },
  unbekannt: {},
};

werkzeug.setzen(JSON.parse(JSON.stringify(ausgangslage)));
const paket = werkzeug.sammeln();
werkzeug.uebernehmen(paket);
const danach = werkzeug.lage();

gleich("die Notizen kommen unveraendert zurueck",
       danach.notizen, ausgangslage.notizen);
gleich("die Aufgaben ebenso", danach.aufgaben, ausgangslage.aufgaben);
gleich("die eigenen Termine ebenso", danach.termine, ausgangslage.termine);
gleich("das Notizbuch ebenso", danach.zettel, ausgangslage.zettel);
gleich("und die Loeschvermerke", danach.grabsteine, ausgangslage.grabsteine);

/* Zweiter Durchlauf. Ein Rundlauf, der beim ersten Mal stimmt und beim
   zweiten nicht, ist kein Rundlauf - und genau so sieht ein Fehler aus,
   der sich ueber Tage aufschaukelt. */
werkzeug.uebernehmen(werkzeug.sammeln());
gleich("auch nach dem zweiten Durchlauf steht alles da",
       werkzeug.lage().zettel, ausgangslage.zettel);


abschnitt("4. Ein aelteres Geraet darf das Notizbuch nicht zerstoeren");

const zettelEintrag = paket.eintraege["zettel-1"];

pruefe("der Eintrag sagt, was er ist", zettelEintrag.art === "zettel");
pruefe("sein Text steht in \"inhalt\"",
       typeof zettelEintrag.inhalt === "string" && zettelEintrag.inhalt.length > 0);
pruefe("und gerade NICHT in \"text\"", !("text" in zettelEintrag));

/* Und jetzt die alte Fassung wirklich nachspielen, statt sie zu behaupten.
   Das hier ist der Kern ihrer Sortierung, Zeile fuer Zeile so, wie sie vor
   dem Notizbuch dastand. */
function alteFassungLiest(eintrag, kennung) {
  if (eintrag.geloescht) return "grabstein";
  if (eintrag.art === "termin" || kennung.indexOf("termin-") === 0) return "termin";
  if (typeof eintrag.text !== "string" || !eintrag.text) {
    return eintrag.art ? "aufgehoben" : "weggeworfen";
  }
  if (eintrag.art === "aufgabe" || kennung.indexOf("eigen-") === 0) return "aufgabe";
  return "notiz";
}

pruefe("die alte Fassung hebt die Notiz unveraendert auf",
       alteFassungLiest(zettelEintrag, "zettel-1") === "aufgehoben");
pruefe("und macht KEINE Termin-Notiz daraus",
       alteFassungLiest(zettelEintrag, "zettel-1") !== "notiz");

// Gegenprobe: die alten Arten muss sie weiterhin richtig einsortieren.
pruefe("Notizen am Termin erkennt sie weiterhin",
       alteFassungLiest(paket.eintraege["sked.a1"], "sked.a1") === "notiz");
pruefe("freie Aufgaben ebenso",
       alteFassungLiest(paket.eintraege["eigen-1"], "eigen-1") === "aufgabe");
pruefe("eigene Termine ebenso",
       alteFassungLiest(paket.eintraege["termin-1"], "termin-1") === "termin");


abschnitt("5. Die Rueckrichtung: was haengt an diesem Termin?");

werkzeug.setzen(JSON.parse(JSON.stringify(ausgangslage)));

const amModul = werkzeug.zettelFuerTermin("sked.a1").map(z => z.id);
gleich("die Modulnotiz steht beim ersten Termin des Moduls", amModul, ["zettel-1"]);

gleich("und beim zweiten Termin desselben Moduls ebenfalls",
       werkzeug.zettelFuerTermin("sked.a2").map(z => z.id), ["zettel-1"]);

/* sked.b1 gehoert zu einem anderen Modul, ist aber einzeln verknuepft.
   Beides zusammen darf nicht zu einer doppelten Anzeige fuehren. */
gleich("ein einzeln verknuepfter Termin zeigt sie auch",
       werkzeug.zettelFuerTermin("sked.b1").map(z => z.id), ["zettel-1"]);

gleich("das Modul selbst kennt seine Notizen",
       werkzeug.zettelFuerFach("34 - Schluesselkompetenzen V").map(z => z.id),
       ["zettel-1"]);

gleich("ein Modul ohne Notiz liefert nichts",
       werkzeug.zettelFuerFach("WPF - Social Innovation"), []);

gleich("Rueckverweise zeigen, wer auf die Notiz zeigt",
       werkzeug.zettelRueckverweise("zettel-1").map(z => z.id), ["zettel-2"]);

pruefe("eine Notiz verweist nicht auf sich selbst",
       werkzeug.zettelRueckverweise("zettel-2").length === 0);


abschnitt("6. Loeschen hinterlaesst einen Vermerk");

werkzeug.setzen(JSON.parse(JSON.stringify(ausgangslage)));
werkzeug.zettelSetzen("zettel-2", { text: "", verweise: [] });

pruefe("die Notiz ist weg",
       werkzeug.lage().zettel.filter(z => z.id === "zettel-2").length === 0);
pruefe("und steht als geloescht vermerkt",
       Object.prototype.hasOwnProperty.call(werkzeug.lage().grabsteine, "zettel-2"));

/* Der Vermerk muss den Rundlauf ueberleben - sonst brachte ihn das andere
   Geraet beim naechsten Abgleich einfach wieder mit. */
werkzeug.uebernehmen(werkzeug.sammeln());
pruefe("der Vermerk ueberlebt den Abgleich",
       Object.prototype.hasOwnProperty.call(werkzeug.lage().grabsteine, "zettel-2"));
pruefe("und die Notiz kommt nicht zurueck",
       werkzeug.lage().zettel.filter(z => z.id === "zettel-2").length === 0);

/* Eine Notiz ohne Text, aber mit Verknuepfung, ist KEIN Loeschfall. Sie
   ist seltsam, aber jemand hat sie absichtlich angelegt. */
werkzeug.setzen(JSON.parse(JSON.stringify(ausgangslage)));
werkzeug.zettelSetzen("zettel-2", { text: "", verweise: ["fach:A"] });
pruefe("eine Notiz, die nur aus einer Verknuepfung besteht, bleibt",
       werkzeug.lage().zettel.filter(z => z.id === "zettel-2").length === 1);


abschnitt("7. Ein Eintrag aus der Zukunft bleibt unangetastet");

/* Dieselbe Falle wie in Abschnitt 4, nur andersherum: was DIESE Fassung
   nicht kennt, muss sie aufheben. */
werkzeug.setzen(JSON.parse(JSON.stringify(ausgangslage)));
werkzeug.uebernehmen({ v: 3, eintraege: {
  "zettel-1": { art: "zettel", inhalt: "Klausurvorbereitung\n\nKapitel 3 und 4.",
                verweise: ["fach:34 - Schluesselkompetenzen V", "termin:sked.b1"],
                wichtig: false, geaendert: 444 },
  "skizze-9": { art: "skizze", striche: 12, geaendert: 999 },
}});

gleich("das Unbekannte ist aufgehoben",
       werkzeug.lage().unbekannt["skizze-9"],
       { art: "skizze", striche: 12, geaendert: 999 });
pruefe("und wandert beim Einsammeln unveraendert zurueck",
       JSON.stringify(werkzeug.sammeln().eintraege["skizze-9"])
       === JSON.stringify({ art: "skizze", striche: 12, geaendert: 999 }));


abschnitt("8. Ein Verweis ins Leere verschwindet nicht");

/* Ein Termin kann aus dem Zeitfenster fallen, eine verknuepfte Notiz
   geloescht werden. Dann soll dastehen, dass es den Verweis gibt - eine
   leere Zeile waere schlimmer als eine ehrliche Luecke. */
werkzeug.setzen(JSON.parse(JSON.stringify(ausgangslage)));

const totesZiel = werkzeug.verweisBeschreiben("termin:sked.gibtesnicht");
pruefe("ein toter Termin-Verweis sagt es", totesZiel.fehlt === true);
pruefe("und hat trotzdem eine Beschriftung", totesZiel.titel.length > 0);

const toteNotiz = werkzeug.verweisBeschreiben("zettel:zettel-999");
pruefe("eine geloeschte Notiz ebenso",
       toteNotiz.fehlt === true && toteNotiz.titel.length > 0);

const lebendesModul = werkzeug.verweisBeschreiben("fach:34 - Schluesselkompetenzen V");
pruefe("ein Modul gilt immer als vorhanden", lebendesModul.fehlt === false);
pruefe("und traegt seinen Namen",
       lebendesModul.titel === "34 - Schluesselkompetenzen V");


abschnitt("9. Unter einem Termin stehen ZWEI Knoepfe, und sie tun Verschiedenes");

/* Warum das geprueft wird: in der Listenansicht stand lange ein einziger
   Knopf "+ Notiz". Der legte aber die Kurznotiz an - und die steht mit
   einem Haekchen im To-do-Bereich. Man drueckte also auf "Notiz" und bekam
   ein To-do.

   Seit es das Notizbuch gibt, sind das zwei verschiedene Dinge. Beide
   muessen von hier aus erreichbar sein, und zwar so, dass am Knopf steht,
   was herauskommt. */

function terminTag() {
  return [{
    datum: new Date("2026-09-28T00:00"), schluessel: "2026-09-28",
    termine: [{
      id: "sked.a1", start: "2026-09-28T09:45", ende: "2026-09-28T11:15",
      art: "SU", titel: "34 - Schluesselkompetenzen V", dozent: "Hechel",
      raum: "CL: 6A.206", anmerkung: "", gruppe: "",
    }],
    aufgaben: [], ganztags: [], istHeute: false,
  }];
}

werkzeug.setzen({});
werkzeug.bearbeiten(true);
let liste = werkzeug.listeBauen(terminTag());

pruefe("der Notizbuch-Knopf verweist auf den Termin",
       liste.indexOf('data-zettel-neu="termin:sked.a1"') >= 0);
pruefe("und heisst \"+ Notiz\"",
       liste.indexOf("+ Notiz") >= 0);
pruefe("der To-do-Knopf legt die Kurznotiz an",
       liste.indexOf('data-notiz-oeffnen="sked.a1"') >= 0);
pruefe("und heisst \"+ To-do\"",
       liste.indexOf("+ To-do") >= 0);

/* Die beiden duerfen nicht dasselbe Ziel haben - genau das war der Fehler,
   den es zu beheben galt. */
pruefe("die beiden Knoepfe zeigen NICHT auf dasselbe",
       liste.indexOf('data-zettel-neu="termin:sked.a1"')
       !== liste.indexOf('data-notiz-oeffnen="sked.a1"'));

// Ohne Bearbeiten-Modus steht dort nichts - sonst waere die Liste unlesbar.
werkzeug.bearbeiten(false);
liste = werkzeug.listeBauen(terminTag());
pruefe("ohne Bearbeiten-Modus steht dort kein Knopf",
       liste.indexOf("+ Notiz") < 0 && liste.indexOf("+ To-do") < 0);

/* Eine Notiz, die an DIESEM Termin haengt, steht in der Liste. Eine, die
   nur am Modul haengt, nicht - sonst stuende sie unter jeder einzelnen
   Vorlesung des Moduls, bei zwanzig Terminen also zwanzigmal. */
werkzeug.setzen({ zettel: [
  { id: "zettel-hier", text: "Klausurthemen", verweise: ["termin:sked.a1"],
    wichtig: false, geaendert: 1 },
  { id: "zettel-modul", text: "Gilt fuers ganze Modul",
    verweise: ["fach:34 - Schluesselkompetenzen V"], wichtig: false, geaendert: 2 },
]});
liste = werkzeug.listeBauen(terminTag());

pruefe("die Notiz an diesem Termin steht in der Liste",
       liste.indexOf("Klausurthemen") >= 0);
pruefe("und ist antippbar",
       liste.indexOf('data-zettel-oeffnen="zettel-hier"') >= 0);
pruefe("die Modulnotiz steht dort NICHT",
       liste.indexOf("Gilt fuers ganze Modul") < 0);

/* Gegenprobe: im Fenster eines angetippten Termins gehoert sie sehr wohl
   dazu. Dort steht ein Termin allein, es wiederholt sich nichts. */
pruefe("im Terminfenster ist die Modulnotiz aber dabei",
       werkzeug.zettelFuerTermin("sked.a1").map(z => z.id).indexOf("zettel-modul") >= 0);

werkzeug.bearbeiten(false);
werkzeug.setzen({});


abschnitt("10. Der Themenschluessel steht an zwei Stellen und muss gleich sein");

/* Hell oder dunkel wird zweimal gelesen: einmal von einem kurzen Skript im
   Kopf der index.html, damit das erste Bild schon stimmt, und einmal von
   app.js. Das Skript im Kopf kann die Konstante aus app.js nicht benutzen,
   app.js ist da noch nicht geladen - also steht der Name dort ausgeschrieben.

   Benennt jemand SPEICHER_THEMA um, faellt das nirgends auf: die App
   funktioniert weiter, nur blitzt sie bei jedem Start weiss auf, bevor sie
   dunkel wird. Genau die Sorte Fehler, die man monatelang hinnimmt. */
const kopfSkript = lies(WURZEL + "/index.html");
const anwendung = lies(WURZEL + "/app.js");

const schluesselImKopf = kopfSkript.match(/localStorage\.getItem\("([^"]*thema[^"]*)"\)/);
const schluesselInApp = anwendung.match(/const SPEICHER_THEMA = "([^"]+)"/);

pruefe("die index.html liest einen Themenschluessel", Boolean(schluesselImKopf));
pruefe("app.js legt einen fest", Boolean(schluesselInApp));
pruefe("und es ist derselbe",
       Boolean(schluesselImKopf) && Boolean(schluesselInApp)
       && schluesselImKopf[1] === schluesselInApp[1]);

/* Dasselbe gilt fuer das Attribut, an dem das Stilblatt faerbt. */
const stilblatt = lies(WURZEL + "/style.css");
pruefe("das Stilblatt faerbt nach data-thema=\"dunkel\"",
       stilblatt.indexOf('[data-thema="dunkel"]') >= 0);
pruefe("die index.html setzt genau dieses Attribut",
       kopfSkript.indexOf('setAttribute("data-thema"') >= 0);
pruefe("und app.js ebenfalls",
       anwendung.indexOf('"data-thema", themaIstDunkel()') >= 0);


/* ====================================================================== */
console.log("");
if (fehler.length) {
  console.log("FEHLGESCHLAGEN (" + fehler.length + "):");
  fehler.forEach(function (e) { console.log("  - " + e); });
  throw new Error(fehler.length + " Pruefung(en) fehlgeschlagen");
}
console.log("ALLE TESTS BESTANDEN");
"bestanden";
