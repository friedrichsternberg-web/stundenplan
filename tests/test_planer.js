#!/usr/bin/osascript -l JavaScript
/* =========================================================================
   Prueft den Umbau vom Stundenplan zum Planer.

   Der Umbau fuehrt eine neue Art von Eintrag ein: eigene Termine mit
   Anfang und Ende. Dabei darf nichts von dem verschwinden, was vorher da
   war - Notizen an Vorlesungen, freie Aufgaben, Loeschvermerke.

   Drei Fallen lauern, und die dritte ist die unangenehmste:

   1. Die Vorsilbe. Eine freie Aufgabe erkennt der Abgleich seit Monaten an
      "eigen-". Haette ein Termin dieselbe Vorsilbe bekommen, wuerde er
      beim Einlesen zur Aufgabe gemacht - und Anfang und Ende waeren weg.

   2. Der Rundlauf. Was eingesammelt und wieder ausgepackt wird, muss
      hinterher dasselbe sein. Eine vergessene Zeile beim Auspacken faellt
      nicht auf: die Daten sind dann in der Ablage noch da, nur auf dem
      Geraet nicht mehr.

   3. Der Eintrag aus der Zukunft. Schreibt eine spaetere Fassung eine Art
      von Eintrag, die es heute noch nicht gibt, und gleicht ein Geraet mit
      der heutigen Fassung ab, darf es sie nicht wegwerfen. Sonst loescht
      das alte Geraet beim Zurueckschreiben, was das neue angelegt hat -
      auf allen Geraeten gleichzeitig.

   Aufruf:  osascript -l JavaScript tests/test_planer.js
   ========================================================================= */

function lies(pfad) {
  return $.NSString.stringWithContentsOfFileEncodingError(pfad, 4, null).js;
}

const WURZEL = (function () {
  const argumente = $.NSProcessInfo.processInfo.arguments.js
    .map(function (wert) { return wert.js; });
  let eigenerPfad = "";
  for (const wert of argumente) {
    if (typeof wert === "string" && /test_planer\.js$/.test(wert)) eigenerPfad = wert;
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
  termine: [{
    id: "sked.hwr1", start: "2026-09-25T09:45", ende: "2026-09-25T11:15",
    art: "SU", titel: "Nationale Leistungsanbieter I", dozent: "Nabi",
    raum: "CL: 6A.206", anmerkung: "", gruppe: "",
  }],
};

const werkzeug = eval(
  lies(WURZEL + "/sync.js") + "\n" +
  lies(WURZEL + "/app.js") + "\n" +
  "({" +
  "  sammeln: abgleichSammeln," +
  "  uebernehmen: abgleichUebernehmen," +
  "  terminSetzen: terminSetzen," +
  "  stundeSpaeter: stundeSpaeter," +
  "  alleAngezeigten: alleAngezeigtenTermine," +
  "  eigeneAlsPlan: eigeneTermineAlsPlan," +
  "  ganztagsFuerTag: ganztagsTermineFuerTag," +
  "  terminZuKennung: terminZuKennung," +
  "  lage: function () { return { notizen: notizen, aufgaben: aufgaben," +
  "        termine: eigeneTermine, grabsteine: grabsteine," +
  "        unbekannt: unbekannteEintraege }; }," +
  "  setzen: function (n, a, t, g) { notizen = n; aufgaben = a;" +
  "        eigeneTermine = t || []; grabsteine = g || {};" +
  "        unbekannteEintraege = {}; }," +
  "  filterSetzen: function (menge) { abgewaehlteFaecher = menge; }," +
  /* Die Arbeit aus dem Uni-Plan haengt am echten Datum. Hier stoert sie
     nur - diese Tests zaehlen HWR- und eigene Termine. Abschnitte, die sie
     pruefen, stehen in test_ansicht.js. */
  "  arbeitAus: function () { uniplan.arbeit = false; }," +
  "  uniplanRoh: function (u) { if (u) uniplan = u; return uniplan; }," +
  "  UNIPLAN_VORGABE: UNIPLAN_VORGABE" +
  "})");
werkzeug.arbeitAus();


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

/* Schneidet die Felder weg, die es zur Zeit des alten Bestands noch nicht
   gab.

   Seit dem 22.09.2026 tragen To-dos und eigene Termine zwei weitere
   Felder: erinnerungVorgabe und erinnerung. Alte Eintraege haben sie
   nicht, und beim Einlesen entstehen sie als leere Zeichenketten. Das ist
   richtig so - aber ein Vergleich Feld fuer Feld schlaegt darueber fehl,
   obwohl nichts verlorengegangen ist.

   Also zweigeteilt pruefen: hier die alten Felder unveraendert, darunter
   ausdruecklich, dass die neuen leer dazugekommen sind. Die Felder
   einfach in die Testdaten zu schreiben waere bequemer gewesen und haette
   die Frage verdeckt, um die es hier geht: was passiert mit Daten, die
   vor der Aenderung entstanden sind? */
const SPAETER_DAZUGEKOMMEN = ["erinnerungVorgabe", "erinnerung", "urlaub"];

function ohneNeueFelder(liste) {
  return liste.map(function (eintrag) {
    const kopie = {};
    for (const feld of Object.keys(eintrag)) {
      if (SPAETER_DAZUGEKOMMEN.indexOf(feld) < 0) kopie[feld] = eintrag[feld];
    }
    return kopie;
  });
}

function nurLeereNeueFelder(liste) {
  return liste.every(function (eintrag) {
    return SPAETER_DAZUGEKOMMEN.every(function (feld) {
      // Leer heisst: kein Text, bei "urlaub" false, bei Aufgaben gar nicht da.
      return eintrag[feld] === "" || eintrag[feld] === false || eintrag[feld] === undefined;
    });
  });
}

// Der Datenbestand, wie ihn die Fassung VOR dem Umbau hinterlassen hat.
function alterBestand() {
  return {
    notizen: {
      "sked.hwr1": { text: "faellt aus", erledigt: false, wichtig: true, geaendert: 111 },
      "sked.alt": { text: "Termin nicht mehr im Plan", erledigt: true, wichtig: false, geaendert: 112 },
    },
    aufgaben: [
      { id: "eigen-1", text: "Hausarbeit drucken", datum: "2026-09-30",
        erledigt: false, wichtig: true, geaendert: 113 },
      { id: "eigen-2", text: "Buch zurueck", datum: "2026-10-02",
        erledigt: true, wichtig: false, geaendert: 114 },
    ],
    grabsteine: { "eigen-geloescht": 115 },
  };
}


/* ====================================================================== */
abschnitt("1. Der alte Bestand ueberlebt den Rundlauf unveraendert");

const alt = alterBestand();
werkzeug.setzen(alt.notizen, alt.aufgaben, [], alt.grabsteine);

const nutzlast = werkzeug.sammeln();
werkzeug.setzen({}, [], [], {});          // alles wegwerfen
werkzeug.uebernehmen(nutzlast);           // und zurueckholen
let lage = werkzeug.lage();

gleich("die Notizen sind unveraendert", lage.notizen, alt.notizen);
gleich("die Aufgaben sind unveraendert",
       ohneNeueFelder(lage.aufgaben.sort((a, b) => a.id.localeCompare(b.id))),
       alt.aufgaben);
pruefe("und haben leere Erinnerungsfelder dazubekommen",
       nurLeereNeueFelder(lage.aufgaben));
gleich("die Grabsteine sind unveraendert", lage.grabsteine, alt.grabsteine);
pruefe("es sind keine eigenen Termine dazuerfunden worden",
       lage.termine.length === 0);


/* ====================================================================== */
abschnitt("2. Eigene Termine ueberleben den Rundlauf");

const termine = [
  { id: "termin-1", titel: "Zahnarzt", start: "2026-09-25T14:00",
    ende: "2026-09-25T15:00", ganztags: false, ort: "Praxis",
    notiz: "Karte mit", wichtig: false, geaendert: 211 },
  { id: "termin-2", titel: "Urlaub", start: "2026-10-20T00:00",
    ende: "2026-10-24T23:59", ganztags: true, ort: "", notiz: "",
    wichtig: true, geaendert: 212 },
];
werkzeug.setzen(alt.notizen, alt.aufgaben, termine, alt.grabsteine);

const nutzlast2 = werkzeug.sammeln();
werkzeug.setzen({}, [], [], {});
werkzeug.uebernehmen(nutzlast2);
lage = werkzeug.lage();

gleich("die Termine kommen unveraendert zurueck",
       ohneNeueFelder(lage.termine.sort((a, b) => a.id.localeCompare(b.id))),
       termine);
pruefe("auch sie haben leere Erinnerungsfelder dazubekommen",
       nurLeereNeueFelder(lage.termine));
pruefe("und der alte Bestand steht weiterhin daneben",
       Object.keys(lage.notizen).length === 2 && lage.aufgaben.length === 2);

// Der springende Punkt: nichts ist unter den Tisch gefallen.
const eingepackt = Object.keys(nutzlast2.eintraege).length;
pruefe("alles steckt in der Nutzlast (" + eingepackt + " Eintraege)",
       eingepackt === 2 + 2 + 2 + 1);


/* ====================================================================== */
abschnitt("3. Ein Termin wird NIE zur Aufgabe");

/* Die Vorsilbe-Falle. "eigen-" heisst Aufgabe, "termin-" heisst Termin.
   Waere das vertauscht oder zu grosszuegig geprueft, verlore ein Termin
   beim Einlesen Anfang und Ende und stuende als Tagesaufgabe da. */
werkzeug.setzen({}, [], [], {});
werkzeug.uebernehmen({ v: 2, eintraege: {
  "termin-x": { art: "termin", titel: "Konzert", start: "2026-11-01T20:00",
                ende: "2026-11-01T23:00", geaendert: 1 },
  "eigen-x": { art: "aufgabe", text: "Karten kaufen", datum: "2026-10-25",
               erledigt: false, geaendert: 1 },
} });
lage = werkzeug.lage();

pruefe("der Termin ist ein Termin", lage.termine.length === 1);
pruefe("mit erhaltener Anfangszeit",
       lage.termine[0] && lage.termine[0].start === "2026-11-01T20:00");
pruefe("mit erhaltener Endzeit",
       lage.termine[0] && lage.termine[0].ende === "2026-11-01T23:00");
pruefe("die Aufgabe ist eine Aufgabe", lage.aufgaben.length === 1);
pruefe("und keines von beidem ist im falschen Topf",
       !lage.notizen["termin-x"] && !lage.notizen["eigen-x"]);


/* ====================================================================== */
abschnitt("4. Ein Eintrag aus der Zukunft wird nicht weggeworfen");

/* Die unangenehmste Falle. Eine spaetere Fassung legt etwas an, das diese
   hier nicht kennt. Wirft sie es beim Auspacken weg, fehlt es beim
   naechsten Einpacken - und ist damit auf ALLEN Geraeten geloescht. */
werkzeug.setzen({}, [], [], {});
werkzeug.uebernehmen({ v: 99, eintraege: {
  "gewohnheit-1": { art: "gewohnheit", name: "Laufen", tage: [1, 3, 5], geaendert: 400 },
  "termin-y": { art: "termin", titel: "Kino", start: "2026-11-05T20:00",
                ende: "2026-11-05T22:00", geaendert: 401 },
} });
lage = werkzeug.lage();

pruefe("der unbekannte Eintrag wurde aufgehoben",
       Boolean(lage.unbekannt["gewohnheit-1"]));
pruefe("und nicht als Termin missverstanden", lage.termine.length === 1);

const wiederEingepackt = werkzeug.sammeln();
pruefe("er steckt beim naechsten Hochladen wieder drin",
       Boolean(wiederEingepackt.eintraege["gewohnheit-1"]));
gleich("und zwar unveraendert",
       wiederEingepackt.eintraege["gewohnheit-1"],
       { art: "gewohnheit", name: "Laufen", tage: [1, 3, 5], geaendert: 400 });

// Ein Grabstein muss ihn trotzdem begraben koennen.
werkzeug.uebernehmen({ v: 99, eintraege: {
  "gewohnheit-1": { geloescht: true, geaendert: 500 },
} });
const nachLoeschen = werkzeug.sammeln();
pruefe("ein Loeschvermerk begraebt auch einen unbekannten Eintrag",
       nachLoeschen.eintraege["gewohnheit-1"].geloescht === true);


/* ====================================================================== */
abschnitt("5. Anlegen, Aendern, Loeschen");

werkzeug.setzen({}, [], [], {});
werkzeug.terminSetzen("termin-neu", {
  titel: "Vorstellungsgespraech", start: "2026-10-05T10:00",
  ende: "2026-10-05T11:00", ort: "Berlin", notiz: "Zeugnisse mit",
  wichtig: true,
});
lage = werkzeug.lage();
pruefe("der Termin ist angelegt", lage.termine.length === 1);
pruefe("mit Ort", lage.termine[0].ort === "Berlin");
pruefe("und als wichtig markiert", lage.termine[0].wichtig === true);

werkzeug.terminSetzen("termin-neu", {
  titel: "Vorstellungsgespraech", start: "2026-10-05T11:00",
  ende: "2026-10-05T12:00", ort: "Berlin", notiz: "", wichtig: false,
});
lage = werkzeug.lage();
pruefe("Aendern legt keinen zweiten an", lage.termine.length === 1);
pruefe("und die neue Zeit steht drin", lage.termine[0].start === "2026-10-05T11:00");

werkzeug.terminSetzen("termin-neu", { titel: "", start: "" });
lage = werkzeug.lage();
pruefe("ein leerer Titel loescht", lage.termine.length === 0);
pruefe("und hinterlaesst einen Grabstein", Boolean(lage.grabsteine["termin-neu"]));


/* ====================================================================== */
abschnitt("6. Ende vor Anfang wird geradegerueckt");

/* Ein Kaestchen mit negativer Hoehe waere im Kalender unsichtbar. Lieber
   stillschweigend eine Stunde daraus machen als einen Termin anzeigen,
   den man nicht sieht. */
werkzeug.setzen({}, [], [], {});
werkzeug.terminSetzen("termin-verdreht", {
  titel: "Verdreht", start: "2026-10-05T15:00", ende: "2026-10-05T14:00",
});
lage = werkzeug.lage();
pruefe("das Ende liegt jetzt nach dem Anfang",
       lage.termine[0].ende > lage.termine[0].start);

pruefe("eine Stunde spaeter bleibt am selben Tag",
       werkzeug.stundeSpaeter("2026-10-05T14:30") === "2026-10-05T15:30");
pruefe("um 23 Uhr wird nicht in den naechsten Tag gerechnet",
       werkzeug.stundeSpaeter("2026-10-05T23:30") === "2026-10-05T23:59");


/* ====================================================================== */
abschnitt("7. Eigene Termine stehen neben den HWR-Terminen");

werkzeug.setzen({}, [], [
  { id: "termin-a", titel: "Frueh", start: "2026-09-25T08:00",
    ende: "2026-09-25T09:00", ganztags: false, ort: "", notiz: "",
    wichtig: false, geaendert: 1 },
  { id: "termin-b", titel: "Ganztags", start: "2026-09-25T00:00",
    ende: "2026-09-25T23:59", ganztags: true, ort: "", notiz: "",
    wichtig: false, geaendert: 1 },
], {});
werkzeug.filterSetzen(new Set());

const alle = werkzeug.alleAngezeigten();
pruefe("HWR-Termin und eigener Termin sind beide dabei", alle.length === 2);
pruefe("nach Uhrzeit sortiert", alle[0].titel === "Frueh");
pruefe("der ganztaegige steckt NICHT im Stundenraster",
       !alle.some(t => t.titel === "Ganztags"));
pruefe("sondern in der Ganztagszeile",
       werkzeug.ganztagsFuerTag("2026-09-25").length === 1);

/* Der Faecherfilter gehoert der HWR. Ein eigener Termin darf nicht
   verschwinden, weil ein Fach abgewaehlt wurde, mit dem er nichts zu tun
   hat. */
werkzeug.filterSetzen(new Set(["Nationale Leistungsanbieter I"]));
const gefiltert = werkzeug.alleAngezeigten();
pruefe("der HWR-Termin ist weggefiltert",
       !gefiltert.some(t => t.id === "sked.hwr1"));
pruefe("der eigene Termin steht weiterhin da",
       gefiltert.some(t => t.id === "termin-a"));
werkzeug.filterSetzen(new Set());

pruefe("ein eigener Termin ist ueber seine Kennung auffindbar",
       Boolean(werkzeug.terminZuKennung("termin-a")));
pruefe("auch ein ganztaegiger",
       Boolean(werkzeug.terminZuKennung("termin-b")));
pruefe("und ein HWR-Termin weiterhin auch",
       Boolean(werkzeug.terminZuKennung("sked.hwr1")));


/* ====================================================================== */
abschnitt("8. Kaputte Termine werden aussortiert, nicht angezeigt");

werkzeug.setzen({}, [], [], {});
werkzeug.uebernehmen({ v: 2, eintraege: {
  "termin-gut":   { art: "termin", titel: "In Ordnung", start: "2026-10-01T10:00",
                    ende: "2026-10-01T11:00", geaendert: 1 },
  "termin-leer":  { art: "termin", titel: "", start: "2026-10-01T10:00", geaendert: 1 },
  "termin-ohne":  { art: "termin", titel: "Ohne Anfang", geaendert: 1 },
  "termin-kurz":  { art: "termin", titel: "Halbe Zeit", start: "2026-10-01", geaendert: 1 },
} });
lage = werkzeug.lage();
pruefe("der brauchbare kommt an", lage.termine.length === 1);
pruefe("und zwar der richtige", lage.termine[0].id === "termin-gut");
pruefe("ohne Ende wird eine Stunde angenommen",
       werkzeug.stundeSpaeter("2026-10-01T10:00") === "2026-10-01T11:00");


/* ====================================================================== */
abschnitt("9. Uebernehmen stoesst keinen neuen Abgleich an");

localStorage.setItem("stundenplan.geraetecode", "ABCDEFGHJKMNPQRSTUVWXYZ23");
angestossen = 0;
werkzeug.uebernehmen({ v: 2, eintraege: {
  "termin-z": { art: "termin", titel: "Still", start: "2026-10-01T10:00",
                ende: "2026-10-01T11:00", geaendert: 1 },
} });
pruefe("uebernehmen loest nichts aus", angestossen === 0);

angestossen = 0;
werkzeug.terminSetzen("termin-hand", { titel: "Von Hand", start: "2026-10-02T10:00" });
pruefe("ein Eintrag von Hand dagegen schon", angestossen > 0);
localStorage.removeItem("stundenplan.geraetecode");


/* ====================================================================== */
abschnitt("Uni-Plan: Einstellung und Urlaub ueberleben den Abgleich");

werkzeug.setzen({}, [], [
  { id: "termin-u", titel: "Urlaub", start: "2026-12-28T00:00", ende: "2027-01-01T23:59",
    ganztags: true, ort: "", notiz: "", wichtig: false, urlaub: true, geaendert: 5 },
], {});
werkzeug.uniplanRoh({ arbeit: false, von: "07:30", bis: "16:00", land: "BB", geaendert: 77 });
const mitEinstellung = werkzeug.sammeln();
pruefe("die Einstellung wird mitgeschickt",
       mitEinstellung.eintraege["einstellung-uniplan"]
       && mitEinstellung.eintraege["einstellung-uniplan"].arbeit === "nein");
werkzeug.setzen({}, [], [], {});
werkzeug.uniplanRoh(Object.assign({}, werkzeug.UNIPLAN_VORGABE));
werkzeug.uebernehmen(mitEinstellung);
const zurueck = werkzeug.uniplanRoh();
pruefe("und kommt auf dem anderen Geraet so an",
       zurueck.arbeit === false && zurueck.von === "07:30" && zurueck.bis === "16:00"
       && zurueck.land === "BB" && zurueck.geaendert === 77);
pruefe("der Urlaub bleibt Urlaub", werkzeug.lage().termine.length === 1
       && werkzeug.lage().termine[0].urlaub === true);

// Nie geaendert: nichts mitschicken, damit keine Vorgabe fremde Einstellungen ueberschreibt.
werkzeug.uniplanRoh(Object.assign({}, werkzeug.UNIPLAN_VORGABE));
pruefe("eine nie geaenderte Einstellung wird nicht mitgeschickt",
       !werkzeug.sammeln().eintraege["einstellung-uniplan"]);
werkzeug.arbeitAus();


/* ====================================================================== */
console.log("");
if (fehler.length) {
  console.log("FEHLGESCHLAGEN (" + fehler.length + "):");
  fehler.forEach(function (e) { console.log("  - " + e); });
  throw new Error(fehler.length + " Pruefung(en) fehlgeschlagen");
}
console.log("ALLE TESTS BESTANDEN");
"bestanden";
