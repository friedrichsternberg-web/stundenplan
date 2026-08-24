#!/usr/bin/osascript -l JavaScript
/* =========================================================================
   Prueft den Geraeteabgleich - die Rechenteile, ohne Netz und ohne Browser.

   Was hier geprueft wird, ist die Stelle, an der Daten verlorengehen
   koennten: das Zusammenfuehren zweier Staende. Ein Fehler darin faellt beim
   Benutzen nicht auf - man merkt nur irgendwann, dass eine Aufgabe fehlt,
   und weiss nicht mehr, wann sie verschwand.

   Aufruf:  osascript -l JavaScript tests/test_abgleich.js

   Warum osascript und nicht node? Weil auf diesem Mac kein node liegt und
   der eingebaute JavaScript-Interpreter fuer reine Rechenpruefungen genuegt.
   Promises laufen dort allerdings nicht durch (keine Ereignisschleife) -
   deshalb wird der Netzteil in tests/test_abgleich_ende_zu_ende.py geprueft,
   gegen die echte Ablage.
   ========================================================================= */

function lies(pfad) {
  return $.NSString.stringWithContentsOfFileEncodingError(pfad, 4, null).js;
}

/* Der Projektordner - eine Ebene ueber diesem Skript.

   Der eigene Pfad wird aus der Aufrufzeile gefischt statt an einer festen
   Stelle erwartet: osascript schiebt die Argumente je nach Aufrufart
   unterschiedlich weit nach hinten. Relative Pfade werden am
   Arbeitsverzeichnis ausgerichtet, damit der Test auch von woanders laeuft. */
const WURZEL = (function () {
  const argumente = $.NSProcessInfo.processInfo.arguments.js
    .map(function (wert) { return wert.js; });

  let eigenerPfad = "";
  for (const wert of argumente) {
    if (typeof wert === "string" && /test_abgleich\.js$/.test(wert)) eigenerPfad = wert;
  }
  if (!eigenerPfad) throw new Error("Eigener Pfad nicht in der Aufrufzeile gefunden");

  if (eigenerPfad.charAt(0) !== "/") {
    eigenerPfad = $.NSFileManager.defaultManager.currentDirectoryPath.js
                + "/" + eigenerPfad;
  }
  return $(eigenerPfad).stringByStandardizingPath
    .stringByDeletingLastPathComponent      // tests/
    .stringByDeletingLastPathComponent.js;  // Projektordner
})();

/* --- Ein Browser, so klein wie moeglich ---------------------------------

   app.js will beim Laden ein paar Dinge vorfinden. Sie stehen hier als
   "var" und nicht im eval-Text, damit der eval sie sieht: eval erbt den
   Gueltigkeitsbereich seines Aufrufers.

   localStorage ist bewusst eine echte Ablage und keine Attrappe, die alles
   verschluckt - sonst pruefte Fall 13 nichts. */
var gespeichert = {};
var localStorage = {
  getItem: function (schluessel) {
    return Object.prototype.hasOwnProperty.call(gespeichert, schluessel)
      ? gespeichert[schluessel] : null;
  },
  setItem: function (schluessel, wert) { gespeichert[schluessel] = String(wert); },
  removeItem: function (schluessel) { delete gespeichert[schluessel]; },
};

// Wie oft ein Abgleich angestossen wurde. Fall 13 haengt daran.
var angestossen = 0;
var setTimeout = function () { angestossen++; return 0; };
var clearTimeout = function () {};
var setInterval = function () { return 0; };
var clearInterval = function () {};

var leeresElement = {
  hidden: false, textContent: "", innerHTML: "", value: "",
  addEventListener: function () {}, setAttribute: function () {},
  getAttribute: function () { return null; },
  appendChild: function () {}, removeChild: function () {},
  classList: { toggle: function () {}, add: function () {}, remove: function () {} },
  style: {}, select: function () {},
};
// Welche Ereignisse jemand abonniert hat. Fall 16 haengt daran.
var zuhoerer = [];
var document = {
  head: leeresElement, body: leeresElement,
  getElementById: function () { return null; },
  querySelector: function () { return leeresElement; },
  querySelectorAll: function () { return []; },
  createElement: function () { return Object.create(leeresElement); },
  addEventListener: function (name) { zuhoerer.push("document:" + name); },
};
var window = {
  addEventListener: function (name) { zuhoerer.push("window:" + name); },
  matchMedia: null,
};
var navigator = { onLine: true };
var location = { protocol: "file:", pathname: "/index.html", search: "", hash: "", origin: "" };
var history = { replaceState: function () {} };
var crypto = undefined;
// app.js prueft die Bildschirmbreite ueber matchMedia.
window.matchMedia = function () {
  return { matches: false, addEventListener: function () {}, addListener: function () {} };
};
var matchMedia = window.matchMedia;

/* Beide Dateien in EINEN eval, damit sie sich gegenseitig sehen. Der
   Ausdruck am Ende reicht heraus, was die Tests brauchen - "const" aus dem
   eval waere von aussen sonst unerreichbar. */
const werkzeug = eval(
  lies(WURZEL + "/sync.js") + "\n" +
  lies(WURZEL + "/app.js") + "\n" +
  "({" +
  "  A: Abgleich," +
  "  sammeln: abgleichSammeln," +
  "  uebernehmen: abgleichUebernehmen," +
  "  notizSetzen: notizSetzen," +
  "  aufgabeSetzen: aufgabeSetzen," +
  "  erledigtUmschalten: erledigtUmschalten," +
  "  lage: function () { return { notizen: notizen, aufgaben: aufgaben," +
  "                               grabsteine: grabsteine }; }," +
  "  setzen: function (n, a, g) { notizen = n; aufgaben = a; grabsteine = g; }" +
  "})");

const A = werkzeug.A;

/* --- Pruefwerk ---------------------------------------------------------- */

const fehler = [];
let bereich = "";

function abschnitt(titel) { bereich = titel; console.log("\n" + titel); }

function pruefe(was, bedingung) {
  console.log((bedingung ? "  OK   " : "  FEHL ") + was);
  if (!bedingung) fehler.push(bereich + " / " + was);
}

/* Vergleicht INHALTLICH, nicht buchstaeblich.

   JSON.stringify richtet sich nach der Reihenfolge, in der die Felder
   eingetragen wurden. Die ist hier aber gleichgueltig - was zaehlt, ist,
   ob dieselben Eintraege drinstehen. Diese Sortierung steht bewusst hier
   im Test und benutzt nicht _inhaltsAbdruck aus sync.js: sonst pruefte der
   Test den Code mit demselben Code, den er pruefen soll. */
function sortiert(wert) {
  if (Array.isArray(wert)) return wert.map(sortiert);
  if (wert && typeof wert === "object") {
    const neu = {};
    for (const feld of Object.keys(wert).sort()) neu[feld] = sortiert(wert[feld]);
    return neu;
  }
  return wert;
}

function gleich(was, a, b) {
  const ja = JSON.stringify(sortiert(a)) === JSON.stringify(sortiert(b));
  pruefe(was, ja);
  if (!ja) {
    console.log("         erwartet: " + JSON.stringify(sortiert(b)));
    console.log("         bekommen: " + JSON.stringify(sortiert(a)));
  }
}

// Abkuerzungen fuer die Testdaten.
function notiz(text, wann, zusatz) {
  const e = { art: "notiz", text: text, erledigt: false, wichtig: false,
              geaendert: wann };
  for (const feld in (zusatz || {})) e[feld] = zusatz[feld];
  return e;
}
function grab(wann) { return { geloescht: true, geaendert: wann }; }

const JETZT = 1787500000000;
const TAG = 86400000;


/* ====================================================================== */
abschnitt("1. Nichts geht verloren: beide Seiten steuern bei");

let ergebnis = A._zusammenfuehren(
  { "sked.1": notiz("nur am Laptop", JETZT) },
  { "sked.2": notiz("nur am Handy", JETZT) });

pruefe("der Laptop-Eintrag ist noch da", !!ergebnis["sked.1"]);
pruefe("der Handy-Eintrag ist auch da", !!ergebnis["sked.2"]);
pruefe("und sonst nichts", Object.keys(ergebnis).length === 2);


/* ====================================================================== */
abschnitt("2. Bei derselben Kennung gewinnt das Juengere");

ergebnis = A._zusammenfuehren(
  { "sked.1": notiz("alt", JETZT - 5000) },
  { "sked.1": notiz("neu", JETZT) });
pruefe("die fernere, juengere Fassung setzt sich durch",
       ergebnis["sked.1"].text === "neu");

ergebnis = A._zusammenfuehren(
  { "sked.1": notiz("neu", JETZT) },
  { "sked.1": notiz("alt", JETZT - 5000) });
pruefe("und andersherum genauso", ergebnis["sked.1"].text === "neu");

/* Und jetzt der Fall, der die beiden Pruefungen darueber erst scharf macht.

   Sie waren naemlich blind: baut man die Zeitregel aus, entscheidet ersatz-
   weise der Textabdruck - und der kam bei diesen Daten zufaellig zum selben
   Ergebnis. Beide Pruefungen blieben gruen, obwohl die Zeit gar keine Rolle
   mehr spielte. Aufgefallen ist das erst, als der Fehler zur Probe absicht-
   lich eingebaut wurde.

   Hier haken wir eine Aufgabe am Handy wieder AUS, nachdem sie am Laptop
   abgehakt war. Der Abdruck wuerde "erledigt true" waehlen, weil t hinter f
   kommt. Nur die Zeit fuehrt zum richtigen Ergebnis. */
ergebnis = A._zusammenfuehren(
  { "sked.1": notiz("Abgabe", JETZT - 5000, { erledigt: true }) },
  { "sked.1": notiz("Abgabe", JETZT, { erledigt: false }) });
pruefe("das juengere Aushaken gewinnt, obwohl der Abdruck anders entschiede",
       ergebnis["sked.1"].erledigt === false);

ergebnis = A._zusammenfuehren(
  { "sked.1": notiz("Abgabe", JETZT, { erledigt: false }) },
  { "sked.1": notiz("Abgabe", JETZT - 5000, { erledigt: true }) });
pruefe("und ebenso, wenn das juengere auf dieser Seite liegt",
       ergebnis["sked.1"].erledigt === false);


/* ====================================================================== */
abschnitt("3. Loeschen bleibt geloescht");

/* Der Fall, fuer den es die Grabsteine gibt: das Handy loescht eine
   Aufgabe, der Laptop kennt sie noch. Ohne Grabstein wuerde der Laptop sie
   beim naechsten Abgleich wieder hochladen. */
ergebnis = A._zusammenfuehren(
  { "eigen-1": notiz("Buch zurueckbringen", JETZT - 60000) },
  { "eigen-1": grab(JETZT) });
pruefe("der Grabstein setzt sich gegen den aelteren Eintrag durch",
       ergebnis["eigen-1"].geloescht === true);


/* ====================================================================== */
abschnitt("4. Aber ein neu geschriebener Eintrag schlaegt den Grabstein");

/* Sonst koennte man an einer Kennung, die einmal geloescht war, nie wieder
   etwas eintragen - der Grabstein wuerde es jedes Mal beerdigen. */
ergebnis = A._zusammenfuehren(
  { "sked.1": notiz("doch wieder wichtig", JETZT) },
  { "sked.1": grab(JETZT - 60000) });
pruefe("der neue Text bleibt stehen",
       ergebnis["sked.1"].text === "doch wieder wichtig");
pruefe("und ist nicht als geloescht markiert", !ergebnis["sked.1"].geloescht);


/* ====================================================================== */
abschnitt("5. Gleichstand: beide Geraete entscheiden sich GLEICH");

/* Der heimtueckischste Fall. Haben zwei Fassungen exakt denselben
   Zeitstempel und entscheidet jedes Geraet nach eigenem Gutduenken, behaelt
   jedes seine eigene - und der Abgleich kommt nie zur Ruhe. Er wuerde bei
   jedem Durchlauf hin- und herschreiben, endlos.

   Deshalb muss gelten: zusammenfuehren(a, b) == zusammenfuehren(b, a). */
const linksHerum = A._zusammenfuehren(
  { "sked.1": notiz("Fassung A", JETZT) },
  { "sked.1": notiz("Fassung B", JETZT) });
const rechtsHerum = A._zusammenfuehren(
  { "sked.1": notiz("Fassung B", JETZT) },
  { "sked.1": notiz("Fassung A", JETZT) });

gleich("beide Richtungen liefern dasselbe", linksHerum, rechtsHerum);

// Und das auch bei mehr als einem Eintrag und gemischten Zeitstempeln.
const seiteA = { "a": notiz("A1", JETZT), "b": notiz("B-alt", JETZT - 100),
                 "c": grab(JETZT) };
const seiteB = { "a": notiz("A2", JETZT), "b": notiz("B-neu", JETZT),
                 "d": notiz("D", JETZT) };
gleich("auch bei gemischten Staenden",
       A._zusammenfuehren(seiteA, seiteB), A._zusammenfuehren(seiteB, seiteA));

/* Und zwar sogar buchstaeblich, nicht nur inhaltlich. Das ist mehr, als
   der Abgleich braucht - aber es kostet nur ein .sort() und erspart dem
   Naechsten, der die Ergebnisse als Text vergleicht, eine Fehlersuche. */
pruefe("und liefert dabei auch dieselbe Reihenfolge",
       JSON.stringify(A._zusammenfuehren(seiteA, seiteB))
       === JSON.stringify(A._zusammenfuehren(seiteB, seiteA)));

/* Und das Ergebnis muss stabil sein: fuehrt man es erneut mit einer der
   Ausgangsseiten zusammen, darf sich nichts mehr aendern. Sonst schaukelten
   sich zwei Geraete gegenseitig auf. */
const einmal = A._zusammenfuehren(seiteA, seiteB);
gleich("und aendert sich beim zweiten Durchlauf nicht mehr",
       A._zusammenfuehren(einmal, seiteA), einmal);
gleich("auch nicht mit der anderen Seite",
       A._zusammenfuehren(einmal, seiteB), einmal);


/* ====================================================================== */
abschnitt("6. Der klassische Verlustfall");

/* Laptop und Handy tragen unabhaengig voneinander etwas ein, ohne
   dazwischen abzugleichen. Wuerde der Gesamtstand als Ganzes ueberschrieben
   ("wer zuletzt speichert, gewinnt"), verschwaende einer der beiden
   Eintraege. Genau das darf nicht passieren. */
const laptop = { "gemeinsam": notiz("stand vorher da", JETZT - 99999),
                 "eigen-laptop": notiz("Hausarbeit drucken", JETZT) };
const handy = { "gemeinsam": notiz("stand vorher da", JETZT - 99999),
                "eigen-handy": notiz("Buch verlaengern", JETZT) };

ergebnis = A._zusammenfuehren(laptop, handy);
pruefe("die Laptop-Aufgabe ueberlebt", !!ergebnis["eigen-laptop"]);
pruefe("die Handy-Aufgabe ueberlebt", !!ergebnis["eigen-handy"]);
pruefe("und der gemeinsame Eintrag bleibt einmalig",
       Object.keys(ergebnis).length === 3);


/* ====================================================================== */
abschnitt("7. Grabsteine verfallen - aber nicht zu frueh");

const alt = A._grabsteineAufraeumen({
  "frisch": grab(A.jetzt() - 119 * TAG),
  "uralt":  grab(A.jetzt() - 121 * TAG),
  "lebt":   notiz("bin kein Grabstein", A.jetzt() - 300 * TAG),
});
pruefe("ein 119 Tage alter Grabstein bleibt", !!alt["frisch"]);
pruefe("ein 121 Tage alter faellt weg", !alt["uralt"]);
pruefe("ein lebender Eintrag wird nie aufgeraeumt, egal wie alt",
       !!alt["lebt"]);


/* ====================================================================== */
abschnitt("8. Der Vergleich ignoriert die Reihenfolge der Felder");

/* Postgres gibt die Felder eines JSON-Objekts anders sortiert zurueck, als
   die App sie abgeschickt hat. Verglichen die beiden Staende als reiner
   Text, hielte die App jeden empfangenen Stand fuer veraendert - und
   schriebe ihn sofort wieder zurueck. Bei jedem Abgleich. Endlos. */
const wieGeschickt = { eintraege: { x: { art: "notiz", text: "hallo", geaendert: 5 } } };
const wieZurueck   = { eintraege: { x: { geaendert: 5, text: "hallo", art: "notiz" } } };
pruefe("gleicher Inhalt, andere Feldreihenfolge gilt als gleich",
       A._inhaltsAbdruck(wieGeschickt) === A._inhaltsAbdruck(wieZurueck));

const anders = { eintraege: { x: { art: "notiz", text: "hallo!", geaendert: 5 } } };
pruefe("ein wirklich anderer Inhalt aber nicht",
       A._inhaltsAbdruck(wieGeschickt) !== A._inhaltsAbdruck(anders));

/* Und zwei Kennungen duerfen sich nicht zu demselben Abdruck addieren -
   sonst hielte die App verschiedene Staende faelschlich fuer gleich und
   liesse eine Aenderung liegen. */
pruefe("Kennungen lassen sich nicht gegeneinander verschieben",
       A._inhaltsAbdruck({ eintraege: { "ab": notiz("x", 1), "c": notiz("y", 1) } })
       !== A._inhaltsAbdruck({ eintraege: { "a": notiz("x", 1), "bc": notiz("y", 1) } }));


/* ====================================================================== */
abschnitt("9. Der Rundlauf durch app.js erhaelt alles");

werkzeug.setzen(
  { "sked.de1": { text: "faellt aus", erledigt: false, wichtig: true,
                  geaendert: JETZT } },
  [{ id: "eigen-7", text: "Hausarbeit", datum: "2026-09-01",
     erledigt: true, wichtig: false, geaendert: JETZT }],
  {});

const nutzlast = werkzeug.sammeln();
werkzeug.setzen({}, [], {});           // alles wegwerfen
werkzeug.uebernehmen(nutzlast);        // und aus der Nutzlast wiederherstellen
let lage = werkzeug.lage();

pruefe("die Notiz ist zurueck", lage.notizen["sked.de1"].text === "faellt aus");
pruefe("mit ihrer Wichtig-Markierung", lage.notizen["sked.de1"].wichtig === true);
pruefe("die Aufgabe ist zurueck", lage.aufgaben.length === 1);
pruefe("mit Datum", lage.aufgaben[0].datum === "2026-09-01");
pruefe("und mit ihrem Haken", lage.aufgaben[0].erledigt === true);
pruefe("Notiz und Aufgabe wurden nicht vertauscht",
       lage.aufgaben[0].id === "eigen-7" && !lage.notizen["eigen-7"]);


/* ====================================================================== */
abschnitt("10. Ein leerer Fernstand loescht nicht die eigenen Eintraege");

/* Der Fehler, der beim ersten Abgleich alles kosten wuerde: das Geraet
   holt sich einen leeren Stand aus der noch unbenutzten Ablage und nimmt
   ihn fuer bare Muenze. */
werkzeug.setzen(
  { "sked.de1": { text: "wichtig", erledigt: false, wichtig: false,
                  geaendert: JETZT } },
  [{ id: "eigen-7", text: "Hausarbeit", datum: "2026-09-01",
     erledigt: false, wichtig: false, geaendert: JETZT }],
  {});

const vereint = A._zusammenfuehren(werkzeug.sammeln().eintraege, {});
werkzeug.uebernehmen({ v: 1, eintraege: vereint });
lage = werkzeug.lage();

pruefe("die Notiz steht noch da", !!lage.notizen["sked.de1"]);
pruefe("die Aufgabe steht noch da", lage.aufgaben.length === 1);


/* ====================================================================== */
abschnitt("11. Loeschen erzeugt einen Grabstein, der auch verschickt wird");

werkzeug.setzen({}, [{ id: "eigen-9", text: "weg damit", datum: "2026-09-01",
                       erledigt: false, wichtig: false, geaendert: JETZT }], {});
werkzeug.aufgabeSetzen("eigen-9", "");   // leerer Text = loeschen

lage = werkzeug.lage();
pruefe("die Aufgabe ist oertlich weg", lage.aufgaben.length === 0);
pruefe("ein Grabstein ist entstanden", !!lage.grabsteine["eigen-9"]);

const nachLoeschen = werkzeug.sammeln().eintraege;
pruefe("und er steckt in der Nutzlast",
       nachLoeschen["eigen-9"] && nachLoeschen["eigen-9"].geloescht === true);


/* ====================================================================== */
abschnitt("12. Neu schreiben raeumt den Grabstein weg");

werkzeug.setzen({}, [], { "sked.de5": JETZT - 10000 });
werkzeug.notizSetzen("sked.de5", "doch wieder was zu sagen");

lage = werkzeug.lage();
pruefe("der Grabstein ist fort", !lage.grabsteine["sked.de5"]);
pruefe("die Notiz steht da", !!lage.notizen["sked.de5"]);

const nachNeu = werkzeug.sammeln().eintraege;
pruefe("und in der Nutzlast steht kein Grabstein mehr",
       !nachNeu["sked.de5"].geloescht);


/* ====================================================================== */
abschnitt("13. Uebernehmen stoesst KEINEN neuen Abgleich an");

/* Sonst entstuende eine Schleife: der Abgleich uebernimmt einen Stand,
   das loest einen Abgleich aus, der uebernimmt wieder, und so fort. */
werkzeug.setzen({}, [], {});
localStorage.setItem("stundenplan.geraetecode", "ABCDEFGHJKMNPQRSTUVWXYZ23");
angestossen = 0;

werkzeug.uebernehmen({ v: 1, eintraege: {
  "eigen-1": { art: "aufgabe", text: "aus der Ablage", datum: "2026-09-01",
               geaendert: JETZT } } });
pruefe("uebernehmen loest nichts aus", angestossen === 0);

pruefe("aber der Speicher ist geschrieben",
       (localStorage.getItem("stundenplan.aufgaben") || "").indexOf("aus der Ablage") >= 0);

// Zum Gegenbeweis: eine echte Eingabe MUSS etwas ausloesen.
angestossen = 0;
werkzeug.notizSetzen("sked.de9", "von Hand getippt");
pruefe("eine Eingabe von Hand dagegen schon", angestossen > 0);

localStorage.removeItem("stundenplan.geraetecode");


/* ====================================================================== */
abschnitt("14. Kaputte Eintraege werden aussortiert, nicht angezeigt");

werkzeug.setzen({}, [], {});
werkzeug.uebernehmen({ v: 1, eintraege: {
  "sked.gut":   { art: "notiz", text: "in Ordnung", geaendert: JETZT },
  "sked.leer":  { art: "notiz", text: "", geaendert: JETZT },
  "sked.nix":   { art: "notiz", geaendert: JETZT },
  "eigen-ohne": { art: "aufgabe", text: "ohne Datum", geaendert: JETZT },
  "sked.zahl":  { art: "notiz", text: 42, geaendert: JETZT },
} });
lage = werkzeug.lage();

pruefe("der brauchbare Eintrag kommt an", !!lage.notizen["sked.gut"]);
pruefe("die leere Notiz nicht", !lage.notizen["sked.leer"]);
pruefe("die Notiz ohne Text nicht", !lage.notizen["sked.nix"]);
pruefe("die Aufgabe ohne Datum nicht", lage.aufgaben.length === 0);
pruefe("und eine Zahl statt Text auch nicht", !lage.notizen["sked.zahl"]);


/* ====================================================================== */
abschnitt("15. Der Geraetecode");

pruefe("ist 25 Zeichen lang", A.codeErzeugen().length === 25);
pruefe("und jedes Mal ein anderer", A.codeErzeugen() !== A.codeErzeugen());
pruefe("enthaelt keine verwechselbaren Zeichen",
       !/[01OIL]/.test(A.codeErzeugen()));
pruefe("wird in Fuenferbloecken gezeigt",
       A.codeLesbar("ABCDEFGHJKMNPQRSTUVWXYZ23") === "ABCDE-FGHJK-MNPQR-STUVW-XYZ23");
pruefe("laesst sich mit Strichen abtippen",
       A.codeNormalisieren("abcde-fghjk") === "ABCDEFGHJK");
pruefe("laesst sich mit Leerzeichen abtippen",
       A.codeNormalisieren("  abcde fghjk  ") === "ABCDEFGHJK");
pruefe("ein zu kurzer Code wird abgelehnt", A.codeSetzen("ZUKURZ") === false);
pruefe("ein vollstaendiger angenommen",
       A.codeSetzen("ABCDE-FGHJK-MNPQR-STUVW-XYZ23") === true);
pruefe("und ohne Striche gespeichert",
       A.code() === "ABCDEFGHJKMNPQRSTUVWXYZ23");
A.codeLoeschen();
pruefe("ausschalten entfernt ihn", A.code() === "");


/* ====================================================================== */
abschnitt("16. Die Zuhoerer haengen auch OHNE Code");

/* Beim Ausprobieren im Browser aufgefallen: einrichten() brach ohne Code
   sofort ab - und haengte dabei auch die regelmaessigen Zuhoerer nicht an.
   Schaltete man den Abgleich spaeter ein, ohne neu zu laden, lief genau ein
   einziger Abgleich (den stoesst der Knopf selbst an). Danach nie wieder.

   Der Fehler war im Betrieb kaum zu bemerken: es sah alles richtig aus,
   nur kam nichts mehr an. */
A.codeLoeschen();
zuhoerer = [];
A.einrichten({ sammeln: werkzeug.sammeln, uebernehmen: werkzeug.uebernehmen,
               fertig: function () {} });

pruefe("auf die Rueckkehr aus dem Hintergrund wird gehoert",
       zuhoerer.indexOf("document:visibilitychange") >= 0);
pruefe("auf den Fenster-Fokus ebenso",
       zuhoerer.indexOf("window:focus") >= 0);
pruefe("und auf die Rueckkehr des Netzes",
       zuhoerer.indexOf("window:online") >= 0);

// Und beim zweiten Aufruf nicht doppelt - sonst liefe jeder Abgleich
// mehrfach, bei jedem Ereignis.
const vorher = zuhoerer.length;
A.einrichten({ sammeln: werkzeug.sammeln, uebernehmen: werkzeug.uebernehmen,
               fertig: function () {} });
pruefe("ein zweiter Aufruf haengt sie nicht noch einmal an",
       zuhoerer.length === vorher);


/* ====================================================================== */
console.log("");
if (fehler.length) {
  console.log("FEHLGESCHLAGEN (" + fehler.length + "):");
  fehler.forEach(function (eintrag) { console.log("  - " + eintrag); });
  throw new Error(fehler.length + " Pruefung(en) fehlgeschlagen");
}
console.log("ALLE TESTS BESTANDEN");
"bestanden";
