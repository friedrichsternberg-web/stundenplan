/* =========================================================================
   Stundenplan-Dashboard – Logik

   Die Daten stehen in daten/plan.js und liegen beim Start dieser Datei
   bereits als Variable STUNDENPLAN bereit. Geschrieben werden sie von
   abgleich.py – diese Datei hier liest sie nur und zeigt sie an.

   Abschnitte:
     1. Hilfsmittel für Datum und Zeit
     2. Der Fächerfilter
     3. "Als Nächstes"
     4. Wochenansicht
     5. Änderungen
     6. Geräteabgleich
     7. Start
   ========================================================================= */

/* Notbehelf, falls sync.js nicht geladen werden konnte.

   Ohne ihn stünde die ganze App still: notizenSpeichern() ruft
   Abgleich.anstossen() auf, und ein Fehler dort risse alles mit. So bleibt
   im schlimmsten Fall der Abgleich aus – Plan, Notizen und Aufgaben
   funktionieren weiter wie vorher, nur eben lokal. */
if (typeof Abgleich === "undefined") {
  var Abgleich = {
    jetzt: () => Date.now(),
    anstossen: () => {},
    sofort: () => Promise.resolve(),
    einrichten: () => {},
    code: () => "",
    codeSetzen: () => false,
    codeLoeschen: () => {},
    codeErzeugen: () => "",
    codeLesbar: wert => wert,
    codeNormalisieren: wert => String(wert || ""),
    auskunft: () => ({ stand: "fehler", text: "sync.js fehlt" }),
  };
}

/* Ebenso für melden.js. Ohne Benachrichtigungen lässt sich leben, ohne
   Stundenplan nicht. */
if (typeof Melden === "undefined") {
  var Melden = {
    unterstuetzt: () => false,
    hindernis: () => "melden.js fehlt",
    erlaubnis: () => "nicht-moeglich",
    einschalten: () => Promise.resolve({ erfolg: false, meldung: "melden.js fehlt" }),
    ausschalten: () => Promise.resolve({ erfolg: false, meldung: "melden.js fehlt" }),
    angemeldet: () => Promise.resolve(false),
    anzahlGeraete: () => Promise.resolve(0),
  };
}

const WOCHENTAGE = ["Sonntag", "Montag", "Dienstag", "Mittwoch",
                    "Donnerstag", "Freitag", "Samstag"];

/* Welche Fassung dieser Datei gerade läuft.

   Beim Veröffentlichen ersetzt die GitHub-Automatik das Wort "entwicklung"
   durch die Kennung des Commits. Öffnest du index.html per Doppelklick,
   bleibt es stehen – dort gibt es keinen Zwischenspeicher, der stören
   könnte, und die Selbstprüfung unten macht dann nichts.

   Wozu das gut ist, steht bei aufNeueFassungPruefen(). */
const GEBAUTE_VERSION = "entwicklung";

/* Die Wahlpflichtfächer, die du NICHT belegst. Sie sind von Anfang an
   ausgeblendet, ohne dass du erst durch den Filter klicken musst.

   Die Liste steht bewusst NICHT hier, sondern in abgleich.py und kommt über
   daten/plan.js herein. Grund: dieselbe Liste bestimmt auch, worüber du
   benachrichtigt wirst. Stünde sie an zwei Stellen, würden die beiden früher
   oder später auseinanderlaufen – und du bekämst Mitteilungen für Fächer,
   die das Dashboard gar nicht anzeigt. Ändern also in abgleich.py.

   Der Wert wird erst in starten() gesetzt, weil die Daten zu diesem
   Zeitpunkt noch gar nicht geladen sind – siehe datenLaden() ganz unten. */
let NICHT_BELEGTE_FAECHER = [];

/* Kursgruppen, die du nicht besuchst – erkennbar am Dozentenfeld, etwa
   "TM+HD" beim Modul Management. Anders als bei den Fächern kannst du das
   nicht im Filterfenster umstellen: parallele Gruppen heißen gleich, im
   Filter stünden sie als ein einziger Eintrag. Geändert wird das deshalb in
   abgleich.py, von wo die Liste über daten/plan.js hereinkommt. */
let NICHT_BELEGTE_GRUPPEN = [];

/* Unter diesem Schlüssel merkt sich der Browser deine Auswahl.

   Die Zahl am Ende ist eine Versionsnummer. Sie steht dort, weil in deinem
   Browser vom ersten Ausprobieren schon eine Auswahl gespeichert ist - die
   würde die Voreinstellung oben überstimmen. Mit einer neuen Nummer fängt
   der Filter einmalig frisch an. Wenn wir NICHT_BELEGTE_FAECHER später
   ändern und das sofort greifen soll, zählen wir die Zahl einfach hoch. */
const SPEICHER_FILTER = "stundenplan.abgewaehlteFaecher.3";

// Und unter diesem, welche Änderung du zuletzt gesehen hast. Damit kann das
// Dashboard oben einen Hinweis zeigen, wenn seitdem etwas dazugekommen ist.
const SPEICHER_GESEHEN = "stundenplan.zuletztGesehen";

/* Einzeln abgehakte Änderungen, als Liste von Schlüsseln – siehe
   aenderungSchluessel(). Ergänzt SPEICHER_GESEHEN: der sagt "alles bis
   hier ist erledigt", diese Liste "genau diese eine auch". */
const SPEICHER_ABGEHAKT = "stundenplan.aenderungenAbgehakt";

// Und unter diesem, welche der beiden Ansichten du zuletzt benutzt hast.
const SPEICHER_ANSICHT = "stundenplan.ansicht";

// Welcher Bereich zuletzt offen war.
const SPEICHER_SEITE = "stundenplan.seite";

/* Deine eigenen Notizen zu einzelnen Terminen.

   Sie liegen im Browser, nicht in der Kalenderdatei: der Stundenplan kommt
   von der HWR und wird bei jedem Abgleich überschrieben. Eine Notiz darin
   wäre beim nächsten Lauf weg.

   Gespeichert wird nach der Termin-Kennung (z. B. "sked.de1200291"), nicht
   nach Datum und Uhrzeit. Dadurch bleibt die Notiz am Termin kleben, auch
   wenn der Raum wechselt oder die Vorlesung verschoben wird. */
const SPEICHER_NOTIZEN = "stundenplan.notizen";

/* Aufgaben, die zu keiner Vorlesung gehören – "Bibliotheksbuch zurückgeben",
   "Hausarbeit drucken".

   Sie brauchen einen eigenen Speicher und nicht bloß einen weiteren Eintrag
   bei den Notizen: eine Notiz gehört zu genau einem Termin, an einem Tag
   können aber beliebig viele freie Aufgaben liegen. Deshalb ist das hier
   eine Liste und keine Zuordnung.

   ACHTUNG BEIM LESEN: in der Oberfläche heißt das Ding seit dem 22.09.2026
   "To-do", im Code weiter "Aufgabe". Das ist kein Versehen und auch keine
   Nachlässigkeit – es umzubenennen hieße, das Feld "art": "aufgabe" in der
   Ablage mitzuändern, und das steht dort auf jedem Gerät und in jeder
   Sicherung. Ein Umbenennen im Code wäre eine Stunde Arbeit und ein Risiko
   ohne Gegenwert. Also: Aufgabe im Code, To-do auf dem Bildschirm. */
const SPEICHER_AUFGABEN = "stundenplan.aufgaben";

/* Was du gelöscht hast, und wann.

   Für ein einzelnes Gerät wäre das überflüssig – gelöscht ist gelöscht. Beim
   Abgleich mehrerer Geräte aber ist "hier steht nichts" mehrdeutig: hat das
   Handy die Aufgabe gelöscht, oder kennt es sie einfach noch nicht? Ohne
   Antwort darauf käme jede gelöschte Aufgabe beim nächsten Abgleich vom
   anderen Gerät zurück.

   Ein Grabstein beantwortet das: "diese Kennung wurde am … gelöscht". Er
   gewinnt gegen jede ältere Fassung und verliert gegen jede neuere – falls
   du dieselbe Notiz anderswo gerade neu geschrieben hast. Ausführlicher
   steht das in sync.js. */
const SPEICHER_GRABSTEINE = "stundenplan.grabsteine";

/* Deine eigenen Termine – alles, was nicht von der HWR kommt.

   Zahnarzt, Geburtstag, Zugfahrt, Schicht. Sie liegen bewusst in einem
   eigenen Speicher und nicht bei den Aufgaben: eine Aufgabe hat nur einen
   Tag, ein Termin hat Anfang und Ende. Der Unterschied zieht sich durch
   die ganze Anzeige – Aufgaben stehen in der Ganztagszeile, Termine im
   Stundenraster.

   Die Kennung fängt mit "termin-" an. Nicht mit "eigen-", obwohl das
   naheliegend wäre: an "eigen-" erkennt der Abgleich seit Monaten eine
   freie AUFGABE. Ein Termin mit dieser Vorsilbe würde beim Einlesen zur
   Aufgabe gemacht, und Anfang und Ende wären weg. */
const SPEICHER_TERMINE = "stundenplan.eigeneTermine";

/* Freie Notizen – das Notizbuch.

   Nicht zu verwechseln mit SPEICHER_NOTIZEN weiter oben. Der Unterschied
   ist der Aufhänger:

   - Eine NOTIZ (oben) hängt an genau einem Termin. Sie hat keinen eigenen
     Platz, sie steht immer beim Termin.
   - Ein ZETTEL (hier) steht für sich. Er hat einen Text, so lang man will,
     und kann auf beliebig viele Termine, Module und andere Zettel
     verweisen – oder auf gar nichts.

   "Zettel" heißt er im Code, damit beim Lesen sofort klar ist, welche der
   beiden Sorten gemeint ist. In der Oberfläche steht "Notiz", weil das
   das Wort ist, das man benutzt.

   Form: [{ id, text, verweise: ["termin:sked.de…", "fach:…", "zettel:…"],
            wichtig, geaendert }] */
const SPEICHER_ZETTEL = "stundenplan.zettel";

/* Hell, dunkel oder wie das Betriebssystem es will. Der Wert wird auch vom
   kurzen Skript im Kopf der index.html gelesen – wenn du den Namen hier
   änderst, muss er dort mitgeändert werden. */
const SPEICHER_THEMA = "stundenplan.thema";

/* Einmalige Sicherung vor dem Umbau zum Planer.

   Beim Umstieg auf eigene Termine ändert sich die Form der gespeicherten
   Daten. Geht dabei etwas schief, liegt unter diesem Schlüssel noch der
   Stand von vorher – unangetastet, in der Fassung, die die alte App
   geschrieben hat. */
const SPEICHER_SICHERUNG = "stundenplan.sicherung.vorPlaner";

// Welche Woche gerade angezeigt wird, als Montag dieser Woche.
let angezeigterMontag = montagDerWoche(new Date());

// "liste" oder "kalender".
let ansicht = "liste";

/* Für welche Woche die vergangenen Tage in der Liste aufgeklappt sind,
   als Montag ("2026-09-21"). Leer heißt: zugeklappt.

   Die Woche statt eines einfachen Ja/Nein, damit das Aufklappen nicht in
   die nächste Woche mitwandert: wer diese Woche zurückschaut und dann
   eine Woche weiterblättert, will dort nicht plötzlich alles offen sehen.
   Nicht gespeichert – beim nächsten Öffnen steht wieder heute oben. */
let vergangeneOffenFuer = "";

// Welcher Bereich gerade offen ist: "start", "plan", "training", "zettel"
// oder "todos". Die Änderungen sind kein Bereich mehr, sondern ein Fenster
// aus den Einstellungen heraus.
let seite = "start";

// Das Notizbuch. Siehe SPEICHER_ZETTEL.
let zettel = [];

/* Welcher Zettel gerade im Bearbeitungsfenster liegt, als Kennung. Leer
   heißt: das Fenster ist zu. */
let offenerZettel = "";

// Suchwort im Notizbuch. Nicht gespeichert – eine Suche gilt für den Moment.
let zettelSuche = "";

/* Zeigt der Notizbereich gerade nur die Notizen zu einer Sache? Dann steht
   hier deren Verweis, etwa "fach:34 - Schlüsselkompetenzen V". Leer heißt:
   alle Notizen. Ebenfalls nicht gespeichert. */
let zettelFilter = "";

// "auto", "hell" oder "dunkel".
let thema = "auto";

/* Ob die Notiz-Knöpfe im Plan sichtbar sind.

   Bewusst NICHT gespeichert: der Bearbeiten-Modus ist etwas, das man für
   einen Moment einschaltet, nicht ein Zustand, in dem die App startet. */
let bearbeitenModus = false;

// Deine Notizen, als { "sked.de1200291": { text: "...", erledigt: false } }
let notizen = {};

// Freie Aufgaben: [{ id, text, datum: "2026-08-11", erledigt: false }, ...]
let aufgaben = [];

// Gelöschtes: { "eigen-1756…": 1756312800000 } – Kennung und Zeitpunkt.
let grabsteine = {};

/* Eigene Termine: [{ id, titel, start, ende, ganztags, ort, notiz,
   wichtig, geaendert }, …] – start und ende wie im HWR-Plan als
   "2026-09-25T14:00". */
let eigeneTermine = [];

/* Einträge aus der Ablage, deren Art diese Fassung der App nicht kennt.

   Sie werden unverändert durchgereicht statt weggeworfen. Der Grund ist
   eine Falle, in die dieser Abgleich sonst getappt wäre: schreibt eine
   neuere Fassung eine neue Art von Eintrag, und ein Gerät mit einer
   älteren Fassung gleicht ab, würde die alte Fassung sie nicht verstehen,
   beim Zurückschreiben weglassen – und damit auf allen Geräten löschen.

   Was hier durchgereicht wird, überlebt das. */
let unbekannteEintraege = {};

/* Ob das Fach "Erledigt" im To-do-Bereich aufgeklappt ist.

   Nicht gespeichert, wie der Bearbeiten-Modus: beim Start soll es zu sein.
   Innerhalb einer Sitzung muss es sich das aber merken, sonst klappte es
   bei jedem Abhaken wieder zu – der Bereich wird ja neu gezeichnet. */
let erledigteOffen = false;

// Die Kennung des Termins, dessen Notiz gerade bearbeitet wird – oder null.
// Solange etwas offen ist, wird die Woche nicht neu gezeichnet, sonst wäre
// das Getippte weg.
let offeneNotiz = null;

// Die Fächer, die du abgewählt hast. Wird in starten() gefüllt, sobald die
// Voreinstellung aus den Daten bekannt ist.
let abgewaehlteFaecher = new Set();


/* -------------------------------------------------------------------------
   1. Hilfsmittel für Datum und Zeit
   ------------------------------------------------------------------------- */

/* Die Zeitangaben im Plan sehen aus wie "2026-08-10T08:00". Diese Funktion
   baut daraus ein echtes Datum. Wichtig: wir zerlegen die Zeichenkette von
   Hand, statt sie an new Date() zu übergeben. Browser behandeln solche
   Angaben nämlich unterschiedlich – mal als Ortszeit, mal als UTC. Von Hand
   ist es immer Ortszeit, und genau das ist gemeint. */
function alsDatum(zeitangabe) {
  const jahr   = Number(zeitangabe.slice(0, 4));
  const monat  = Number(zeitangabe.slice(5, 7));
  const tag    = Number(zeitangabe.slice(8, 10));
  const stunde = Number(zeitangabe.slice(11, 13));
  const minute = Number(zeitangabe.slice(14, 16));
  return new Date(jahr, monat - 1, tag, stunde, minute);
}

/* Gibt den Tagesteil zurück, also "2026-08-10". Zwei Termine am selben Tag
   haben denselben Schlüssel – so lassen sie sich gruppieren. */
function tagesSchluessel(datumOderText) {
  if (typeof datumOderText === "string") return datumOderText.slice(0, 10);
  const jahr  = datumOderText.getFullYear();
  const monat = String(datumOderText.getMonth() + 1).padStart(2, "0");
  const tag   = String(datumOderText.getDate()).padStart(2, "0");
  return jahr + "-" + monat + "-" + tag;
}

function uhrzeit(zeitangabe) {
  return zeitangabe.slice(11, 16);
}

/* Sucht den Montag der Woche, in der ein Datum liegt. getDay() liefert 0 für
   Sonntag, deshalb der Sonderfall: bei Sonntag müssen wir sechs Tage zurück,
   nicht einen nach vorn. */
function montagDerWoche(datum) {
  const ergebnis = new Date(datum.getFullYear(), datum.getMonth(), datum.getDate());
  const wochentag = ergebnis.getDay();
  const abstand = wochentag === 0 ? -6 : 1 - wochentag;
  ergebnis.setDate(ergebnis.getDate() + abstand);
  return ergebnis;
}

function tageDazu(datum, anzahl) {
  const ergebnis = new Date(datum.getTime());
  ergebnis.setDate(ergebnis.getDate() + anzahl);
  return ergebnis;
}

function datumKurz(datum) {
  return String(datum.getDate()).padStart(2, "0") + "."
       + String(datum.getMonth() + 1).padStart(2, "0") + ".";
}

/* Formatiert einen reinen Tag ("2026-08-11") als "Di 11.08.2026" – für
   freie Aufgaben, die keine Uhrzeit haben. Heute und morgen werden benannt,
   das liest sich schneller als ein Datum. */
function tagLesbar(tagesschluessel) {
  const heute = tagesSchluessel(new Date());
  if (tagesschluessel === heute) return "Heute";
  if (tagesschluessel === tagesSchluessel(tageDazu(new Date(), 1))) return "Morgen";

  const datum = alsDatum(tagesschluessel + "T00:00");
  return WOCHENTAGE[datum.getDay()].slice(0, 2) + " "
       + datumKurz(datum) + datum.getFullYear();
}

/* Formatiert eine Zeitangabe aus dem Plan als "Mo 10.08., 08:00". */
function zeitpunktLesbar(zeitangabe) {
  const datum = alsDatum(zeitangabe);
  return WOCHENTAGE[datum.getDay()].slice(0, 2) + " "
       + datumKurz(datum) + ", " + uhrzeit(zeitangabe);
}

/* Setzt Text sicher in die Seite. Wir bauen HTML als Zeichenkette zusammen,
   und Fächernamen kommen von einem fremden Server – ohne diese Absicherung
   könnte ein Sonderzeichen im Namen das Seitengerüst zerlegen. */
function sicher(text) {
  return String(text === undefined || text === null ? "" : text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}


/* -------------------------------------------------------------------------
   2. Der Fächerfilter

   Der Plan enthält alle Wahlpflichtfächer des Semesters, also auch die, die
   du nicht belegst. Hier kannst du sie ausblenden. Gespeichert wird die
   Auswahl im Browser, nicht in einer Datei – sie gilt also pro Gerät.
   ------------------------------------------------------------------------- */

/* Holt die gespeicherte Auswahl. Ist noch keine da – beim allerersten
   Öffnen –, gilt die Voreinstellung NICHT_BELEGTE_FAECHER von oben.

   Wichtig ist die Unterscheidung zwischen "nichts gespeichert" und "leere
   Auswahl gespeichert": wer bewusst alle Fächer anhakt, speichert eine leere
   Liste. Die soll natürlich nicht bei jedem Neuladen wieder von der
   Voreinstellung überschrieben werden. Deshalb wird auf null geprüft und
   nicht darauf, ob die Liste Einträge hat. */
function filterLaden() {
  try {
    const gespeichert = localStorage.getItem(SPEICHER_FILTER);
    if (gespeichert === null) return new Set(NICHT_BELEGTE_FAECHER);
    return new Set(JSON.parse(gespeichert));
  } catch (fehler) {
    return new Set(NICHT_BELEGTE_FAECHER);
  }
}

function filterSpeichern() {
  try {
    localStorage.setItem(SPEICHER_FILTER,
                         JSON.stringify([...abgewaehlteFaecher]));
  } catch (fehler) {
    // Wenn der Browser nichts speichern darf, ist das kein Beinbruch –
    // die Auswahl gilt dann nur bis zum Neuladen.
  }
}

/* Gehört ein Termin zu einer Kursgruppe, die du nicht besuchst?

   Diese Prüfung läuft immer und vor dem Fächerfilter – auch die Anzahlen im
   Filterfenster beziehen sich schon auf das Ergebnis. Sonst stünde dort
   "23 Termine" bei einem Modul, von dem du nur 12 besuchst. */
function fremdeGruppe(termin) {
  const dozent = termin.dozent || "";
  return NICHT_BELEGTE_GRUPPEN.some(gruppe => dozent.indexOf(gruppe) >= 0);
}

/* Alle Termine, die dich überhaupt betreffen – vor dem Fächerfilter. */
function meineTermine() {
  return STUNDENPLAN.termine.filter(t => !fremdeGruppe(t));
}

function sichtbareTermine() {
  return meineTermine().filter(t => !abgewaehlteFaecher.has(t.titel));
}

/* Alle Fächer mit der Anzahl ihrer Termine, alphabetisch. */
function alleFaecher() {
  const zaehler = new Map();
  for (const termin of meineTermine()) {
    zaehler.set(termin.titel, (zaehler.get(termin.titel) || 0) + 1);
  }
  return [...zaehler.entries()]
    .map(([titel, anzahl]) => ({ titel, anzahl }))
    .sort((a, b) => a.titel.localeCompare(b.titel, "de"));
}

function filterZeichnen() {
  const liste = document.getElementById("filterListe");
  liste.innerHTML = alleFaecher().map(fach => `
    <label class="filter-zeile">
      <input type="checkbox" value="${sicher(fach.titel)}"
             ${abgewaehlteFaecher.has(fach.titel) ? "" : "checked"}>
      <span>${sicher(fach.titel)}</span>
      <span class="filter-anzahl">${fach.anzahl} Termine</span>
    </label>
  `).join("");

  liste.querySelectorAll("input").forEach(kasten => {
    kasten.addEventListener("change", () => {
      if (kasten.checked) abgewaehlteFaecher.delete(kasten.value);
      else abgewaehlteFaecher.add(kasten.value);
      filterSpeichern();
      allesZeichnen();
    });
  });
}


/* Der Abschnitt "Fächer" in den Einstellungen: wie viele belegt sind, und
   der Knopf zur Auswahl. Die Auswahl selbst ist das alte Filterfenster,
   das sich dann über die Einstellungen legt. */
function faecherBereichZeichnen() {
  const bereich = document.getElementById("faecherBereich");
  if (!bereich) return;
  const faecher = alleFaecher();
  const belegt = faecher.filter(f => !abgewaehlteFaecher.has(f.titel)).length;
  bereich.innerHTML = `
    <h3 class="melden-titel">Fächer</h3>
    <p class="filter-hinweis">
      ${belegt === faecher.length
        ? `Alle ${faecher.length} Fächer stehen in deinem Plan.`
        : `${belegt} von ${faecher.length} Fächern stehen in deinem Plan.
           Die übrigen hast du abgewählt, meist Wahlpflichtfächer, die du
           nicht belegst.`}
    </p>
    <button type="button" class="knopf-schlicht" id="faecherOeffnen">Fächer auswählen</button>`;
}


/* -------------------------------------------------------------------------
   3. "Als Nächstes"

   Zeigt den Termin, der gerade läuft oder als nächster beginnt. Das ist der
   häufigste Grund, überhaupt in den Stundenplan zu schauen.
   ------------------------------------------------------------------------- */

function naechstenZeichnen() {
  const bereich = document.getElementById("naechsterBereich");
  const jetzt = new Date();

  // Ein laufender Termin ist interessanter als der nächste kommende,
  // deshalb wird zuerst danach gesucht.
  const termine = alleAngezeigtenTermine();
  let treffer = termine.find(t => alsDatum(t.start) <= jetzt && alsDatum(t.ende) > jetzt);
  let laeuftGerade = Boolean(treffer);

  if (!treffer) {
    treffer = termine.find(t => alsDatum(t.start) > jetzt);
  }

  if (!treffer) {
    bereich.innerHTML = `<div class="naechster-leer">
      Kein weiterer Termin im geladenen Zeitraum.
    </div>`;
    return;
  }

  const beginn = alsDatum(treffer.start);
  let marke;
  if (laeuftGerade) {
    marke = "Läuft gerade – bis " + uhrzeit(treffer.ende);
  } else if (tagesSchluessel(beginn) === tagesSchluessel(jetzt)) {
    marke = "Heute, " + uhrzeit(treffer.start) + "–" + uhrzeit(treffer.ende);
  } else if (tagesSchluessel(beginn) === tagesSchluessel(tageDazu(jetzt, 1))) {
    marke = "Morgen, " + uhrzeit(treffer.start) + "–" + uhrzeit(treffer.ende);
  } else {
    marke = zeitpunktLesbar(treffer.start) + "–" + uhrzeit(treffer.ende);
  }

  const zusatz = treffer.arbeit ? "im Betrieb"
    : [treffer.raum, treffer.dozent].filter(Boolean).join(" · ");

  /* Was danach kommt, steht nicht hier, sondern gleich darunter in der
     Karte "Heute". Beides zugleich war doppelt. */

  bereich.innerHTML = `
    <div class="naechster-karte" data-termin="${sicher(treffer.id)}" role="button" tabindex="0">
      <div class="naechster-marke">${sicher(marke)}</div>
      <div class="naechster-titel">${sicher(treffer.titel)}</div>
      <div class="naechster-zeile">${sicher(zusatz || "Raum noch offen")}</div>
      ${treffer.anmerkung
        ? `<div class="naechster-zeile"><strong>${sicher(treffer.anmerkung)}</strong></div>`
        : ""}
      ${notizText(treffer.id)
        ? `<div class="naechster-notiz">${
             istWichtig(treffer.id) ? "★" : "✎"} ${sicher(notizText(treffer.id))}</div>`
        : ""}
    </div>`;
}


/* -------------------------------------------------------------------------
   3b. Die Übersicht

   Die Startseite. Sie beantwortet beim Öffnen die Fragen, für die man
   sonst durch drei Reiter tippt: Wo muss ich hin? Was ist heute noch?
   Was ist fällig? Hat sich am Plan etwas geändert?

   Alles hier gibt es auch anderswo – die Übersicht rechnet nichts Neues
   aus, sie nimmt nur aus jedem Bereich die obersten Einträge. Deshalb
   benutzt sie dieselben Funktionen wie die Bereiche selbst
   (alleAngezeigtenTermine, aufgabenSammeln, zeitgruppeVon …): würde sie
   eigene Regeln haben, stünde hier irgendwann "2 To-dos fällig" und im
   Reiter "To-dos" etwas anderes.
   ------------------------------------------------------------------------- */

/* Kommt man nach längerer Pause zurück, beginnt die App wieder hier – auch
   wenn man zuletzt im Plan war. Innerhalb dieser Frist bleibt der Reiter,
   in dem man war: das iPhone beendet eine Home-Bildschirm-App gern im
   Hintergrund, und wer gerade eine Notiz nachschlagen wollte, soll nicht
   auf der Startseite landen. */
const SPEICHER_SEITE_ZEIT = "stundenplan.seiteZeit";
const ZURUECK_ZUR_UEBERSICHT_NACH = 15 * 60 * 1000;

/* Mit welchem Reiter die App aufgeht. Der gemerkte, wenn er bekannt ist
   und keine Viertelstunde her; sonst die Übersicht. Eine Zeit, die in der
   Zukunft liegt – Uhr des Geräts verstellt –, zählt nicht als frisch. */
function startseiteWaehlen(gemerkteSeite, gemerktAm, jetzt) {
  const bekannt = ["start", "plan", "training", "zettel", "todos"];
  const her = jetzt - (Number(gemerktAm) || 0);
  if (bekannt.indexOf(gemerkteSeite) >= 0 && her >= 0 && her < ZURUECK_ZUR_UEBERSICHT_NACH) {
    return gemerkteSeite;
  }
  return "start";
}

/* Die Kalenderwoche nach ISO 8601, so wie sie in deutschen Kalendern steht:
   Woche 1 ist die mit dem ersten Donnerstag des Jahres. Deshalb wird zum
   Donnerstag derselben Woche gesprungen und von dort aus gezählt. */
function kalenderwoche(datum) {
  const tag = new Date(Date.UTC(datum.getFullYear(), datum.getMonth(), datum.getDate()));
  const wochentag = tag.getUTCDay() || 7;
  tag.setUTCDate(tag.getUTCDate() + 4 - wochentag);
  const jahresanfang = new Date(Date.UTC(tag.getUTCFullYear(), 0, 1));
  return Math.ceil(((tag - jahresanfang) / 86400000 + 1) / 7);
}

/* Alles, was heute noch ansteht, für die Karte "Heute": die Termine, die
   noch nicht vorbei sind, die ganztägigen Einträge und die To-dos, die
   heute fällig oder schon überfällig sind.

   Eine Kurznotiz an einem heutigen Termin steht bereits beim Termin (✎).
   Als To-do darunter stünde sie doppelt, deshalb fehlt sie dort – außer
   ihr Termin ist schon vorbei, dann wäre sie sonst ganz weg. */
function heuteSammeln(jetzt) {
  const heute = tagesSchluessel(jetzt);
  const termineHeute = alleAngezeigtenTermine().filter(t => tagesSchluessel(t.start) === heute);
  const kommend = termineHeute.filter(t => alsDatum(t.ende) > jetzt);
  const beimTermin = new Set(kommend.map(t => t.id));

  const gruppen = nachZeitgruppen(aufgabenSammeln().filter(a => !a.erledigt), jetzt);
  const todos = gruppen.ueberfaellig.map(e => ({ eintrag: e, ueberfaellig: true }))
    .concat(gruppen.heute.map(e => ({ eintrag: e, ueberfaellig: false })))
    .filter(x => !(x.eintrag.art === "notiz" && beimTermin.has(x.eintrag.kennung)));

  return {
    termine: kommend,
    vorbei: termineHeute.length - kommend.length,
    ganztags: ganztagsTermineFuerTag(heute),
    todos: todos,
  };
}

/* Die vier nächsten offenen To-dos, in der Reihenfolge der Zeitgruppen:
   Überfälliges zuerst, dann heute, morgen und so weiter. Innerhalb einer
   Gruppe gilt die Reihenfolge aus aufgabenSammeln(), Wichtiges vorn.

   Einträge ohne Termin im Plan fehlen hier. Sie haben kein Datum, also
   auch keinen Platz in "als Nächstes"; im Reiter "To-dos" stehen sie. */
const START_TODOS_REIHENFOLGE = ["ueberfaellig", "heute", "morgen", "woche", "naechste", "spaeter"];
const START_TODOS_ANZAHL = 4;

function startTodos(jetzt) {
  const offen = aufgabenSammeln().filter(a => !a.erledigt);
  const gruppen = nachZeitgruppen(offen, jetzt);

  const auswahl = [];
  for (const name of START_TODOS_REIHENFOLGE) {
    for (const eintrag of gruppen[name]) {
      if (auswahl.length < START_TODOS_ANZAHL) auswahl.push({ eintrag, gruppe: name });
    }
  }

  return {
    auswahl: auswahl,
    offen: offen.length,
    dringend: gruppen.ueberfaellig.length + gruppen.heute.length + gruppen.morgen.length,
    ueberfaellig: gruppen.ueberfaellig.length,
  };
}

/* Die Änderungen am Plan, die du noch nicht gesehen hast – als flache
   Liste, neueste Erkennung zuerst. Dieselbe Regel wie die Zahl am Reiter,
   sonst stünde oben "3" und hier etwas anderes. */
function startAenderungen() {
  let zuletztGesehen = "";
  try { zuletztGesehen = localStorage.getItem(SPEICHER_GESEHEN) || ""; }
  catch (fehler) { /* dann gilt alles als neu */ }
  const abgehakt = new Set(aenderungenAbgehakt());

  const liste = [];
  for (const block of sichtbareBloecke()) {
    if (block.erkanntAm <= zuletztGesehen) continue;
    for (const eintrag of block.eintraege) {
      const schluessel = aenderungSchluessel(block.erkanntAm, eintrag);
      if (!abgehakt.has(schluessel)) liste.push(Object.assign({ schluessel }, eintrag));
    }
  }
  return liste;
}

/* Woran eine einzelne Änderung wiederzuerkennen ist: wann sie erkannt
   wurde, welche Art und welcher Termin. Die Termin-Kennung allein reicht
   nicht – derselbe Termin kann erst verschoben werden und später
   ausfallen, das sind zwei Änderungen, die man getrennt abhakt. */
function aenderungSchluessel(erkanntAm, eintrag) {
  const termin = eintrag.termin || {};
  return [erkanntAm, eintrag.typ, termin.id, termin.start].join("|");
}

function aenderungenAbgehakt() {
  try {
    const roh = JSON.parse(localStorage.getItem(SPEICHER_ABGEHAKT) || "[]");
    return Array.isArray(roh) ? roh.map(String) : [];
  } catch (fehler) {
    return [];
  }
}

/* Hakt eine Änderung ab. Dabei fliegt aus der Liste, was es nicht mehr
   gibt: abgleich.py hält nur einen begrenzten Verlauf, und ohne das
   wüchse die Liste im Speicher mit jedem Semester weiter. */
function aenderungAbhaken(schluessel) {
  const vorhanden = new Set();
  for (const block of sichtbareBloecke()) {
    for (const eintrag of block.eintraege) vorhanden.add(aenderungSchluessel(block.erkanntAm, eintrag));
  }
  const liste = aenderungenAbgehakt().filter(k => vorhanden.has(k));
  if (liste.indexOf(schluessel) < 0) liste.push(schluessel);
  try { localStorage.setItem(SPEICHER_ABGEHAKT, JSON.stringify(liste)); }
  catch (fehler) { /* dann bleibt sie bis zum Neuladen abgehakt */ }
}

/* Modulnamen tragen vorne ihre Nummer aus der Studienordnung: "4 -
   Management - MA- und UN-Führung". Auf der Übersicht ist das nur Länge,
   im Plan bleibt sie stehen. */
function kurzerTitel(titel) {
  return String(titel || "").replace(/^\d+\s*-\s*/, "");
}

/* Kleine Symbole für die Köpfe der Karten. Als SVG direkt im Text, damit
   sie keine eigene Datei brauchen und die Schriftfarbe übernehmen. */
const SYMBOLE = {
  heute: '<rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
  todos: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M8 12.2l2.8 2.8L16 9.5"/>',
  training: '<path d="M6.5 7v10M3.5 9.5v5M17.5 7v10M20.5 9.5v5M6.5 12h11"/>',
  notizen: '<path d="M14 3H6.5A2.5 2.5 0 0 0 4 5.5v13A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  hinweis: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.3v.2"/>',
  phasen: '<path d="M2.5 9.5L12 5l9.5 4.5L12 14z"/><path d="M6.5 11.5v4.5c3 2.2 8 2.2 11 0v-4.5M21.5 9.5v5"/>',
};

function symbol(name) {
  return `<svg class="symbol" viewBox="0 0 24 24" aria-hidden="true" fill="none"
               stroke="currentColor" stroke-width="2" stroke-linecap="round"
               stroke-linejoin="round">${SYMBOLE[name] || ""}</svg>`;
}

function startZeichnen() {
  const bereich = document.getElementById("startInhalt");
  if (!bereich) return;
  const jetzt = new Date();

  const datumsZeile = document.getElementById("startDatum");
  if (datumsZeile) {
    datumsZeile.textContent = WOCHENTAGE[jetzt.getDay()] + ", "
      + jetzt.toLocaleDateString("de-DE", { day: "numeric", month: "long" })
      + " · KW " + kalenderwoche(jetzt);
  }

  const todos = startTodos(jetzt);
  const aenderungen = startAenderungen();
  const stuecke = [];

  /* Hat sich der Stundenplan geändert, ist das das Wichtigste auf der
     Seite: ein Raum, der wechselt, eine Vorlesung, die ausfällt. Deshalb
     ein großer Kasten ganz oben, mit den Änderungen selbst darin, nicht
     nur einer Zahl. Jede Änderung hat einen Haken; abgehakte verschwinden,
     und mit der letzten verschwindet der Kasten. */
  if (aenderungen.length > 0) {
    stuecke.push(`
      <section class="start-geaendert">
        <h2>${aenderungen.length === 1
          ? "Eine Änderung am Stundenplan" : aenderungen.length + " Änderungen am Stundenplan"}</h2>
        ${aenderungen.slice(0, 3).map(e => `
          <div class="start-geaendert-zeile">
            <button type="button" class="todo-haken" data-aenderung-haken="${sicher(e.schluessel)}"
                    aria-label="Gesehen, abhaken"></button>
            ${eintragZeichnen(e)}
          </div>`).join("")}
        ${aenderungen.length > 3
          ? `<p class="start-mehr">und ${aenderungen.length - 3} weitere</p>` : ""}
        <div class="start-geaendert-knoepfe">
          <button type="button" class="knopf-schlicht" data-start-gesehen>${
            aenderungen.length === 1 ? "Abhaken" : "Alle abhaken"}</button>
          <button type="button" class="knopf-schlicht" data-start-verlauf>Alle Änderungen</button>
        </div>
      </section>`);
  }

  const karten = [];
  const trainingKarteStart = trainingStartKarte(jetzt);

  // --- Die vier nächsten To-dos -------------------------------------------
  const gruppenTitel = {};
  for (const gruppe of ZEITGRUPPEN) gruppenTitel[gruppe.schluessel] = gruppe.titel;
  const todoInhalt = todos.offen === 0
    ? `<p class="start-leer">Nichts offen.</p>`
    : todos.auswahl.map(({ eintrag, gruppe }) => startTodoZeile(eintrag,
        gruppe === "ueberfaellig" || gruppe === "heute" || gruppe === "morgen"
          ? gruppenTitel[gruppe]
          : tagLesbar(eintrag.art === "aufgabe" ? eintrag.datum : eintrag.termin.start.slice(0, 10)),
        gruppe === "ueberfaellig")).join("");
  karten.push(startKarte("Nächste To-dos", "todos", todos.offen > 0 ? "Alle " + todos.offen : "Alle",
    todoInhalt, { symbol: "todos", farbe: "gruen", klasse: "start-karte-todos",
                  breit: !trainingKarteStart }));

  // --- Training, oben rechts ----------------------------------------------
  if (trainingKarteStart) karten.push(trainingKarteStart);

  // --- Heute: Termine, Ganztägiges, fällige To-dos ------------------------
  const h = heuteSammeln(jetzt);
  const anzahlText = [
    h.termine.length ? h.termine.length + (h.termine.length === 1 ? " Termin" : " Termine") : "",
    h.todos.length ? h.todos.length + (h.todos.length === 1 ? " To-do" : " To-dos") : "",
  ].filter(Boolean).join(" · ");

  const ganztags = h.ganztags.map(t => `
    <button type="button" class="start-ganztags" data-termin="${sicher(t.id)}">
      ${t.wichtig ? "★ " : ""}${sicher(t.titel)}
    </button>`).join("");

  /* Eine Zeitleiste: links die Uhrzeit in fester Breite, daneben ein Punkt
     auf einer senkrechten Linie, rechts Titel und Raum. Die feste Breite
     ist der Grund, warum die Uhrzeiten jetzt genau untereinander stehen –
     vorher schob der Balken am laufenden Termin sie zur Seite. */
  const termine = h.termine.map(t => {
    const laeuft = alsDatum(t.start) <= jetzt;
    const notiz = notizText(t.id) || (t.anmerkung && !t.eigen ? t.anmerkung : "");
    return `
      <button type="button" class="heute-termin${laeuft ? " heute-jetzt" : ""}${
                t.eigen ? " heute-eigen" : ""}${t.arbeit ? " heute-arbeit" : ""}" data-termin="${sicher(t.id)}">
        <span class="heute-zeit">${uhrzeit(t.start)}<span>${uhrzeit(t.ende)}</span></span>
        <span class="heute-punkt" aria-hidden="true"></span>
        <span class="heute-text">
          <span class="heute-titel">${t.wichtig || istWichtig(t.id) ? "★ " : ""}${
            sicher(kurzerTitel(t.titel))}${laeuft ? ` <span class="heute-marke">läuft</span>` : ""}</span>
          <span class="heute-ort">${sicher([t.raum ? t.raum.replace(/^CL:\s*/, "") : "",
                                             t.eigen ? "eigener Termin" : "",
                                             t.arbeit ? "im Betrieb" : ""].filter(Boolean).join(" · "))}</span>
          ${notiz ? `<span class="heute-notiz">✎ ${sicher(notiz)}</span>` : ""}
        </span>
      </button>`;
  }).join("");

  const heuteTodos = h.todos.map(x => startTodoZeile(x.eintrag,
    x.ueberfaellig ? "Überfällig" : (x.eintrag.art === "notiz" && x.eintrag.termin
      ? "zu " + kurzerTitel(x.eintrag.termin.titel) : "Heute fällig"),
    x.ueberfaellig)).join("");

  const leer = !termine && !heuteTodos && !ganztags;
  karten.push(startKarte("Heute", "plan", "Plan", `
    ${ganztags ? `<div class="start-ganztags-reihe">${ganztags}</div>` : ""}
    ${termine ? `<div class="heute-leiste">${termine}</div>`
      : `<p class="start-leer">${h.vorbei ? "Für heute keine Termine mehr." : "Heute keine Termine."}</p>`}
    ${heuteTodos ? `<div class="heute-abschnitt">To-dos für heute</div>${heuteTodos}` : ""}
    ${leer ? "" : ""}`,
    { symbol: "heute", farbe: "blau", breit: true, klasse: "start-karte-heute", unterzeile: anzahlText }));

  // --- Notizen: die zwei obersten, markierte zuerst ------------------------
  const notizbuch = zettelSortiert().slice(0, 2);
  if (notizbuch.length) {
    karten.push(startKarte("Notizen", "zettel", "Alle " + zettel.length,
      notizbuch.map(z => `
        <button type="button" class="start-zettel" data-zettel-oeffnen="${sicher(z.id)}">
          <span class="start-zettel-titel">${z.wichtig ? "★ " : ""}${sicher(zettelTitel(z))}</span>
          ${zettelVorschau(z)
            ? `<span class="start-zettel-vorschau">${sicher(zettelVorschau(z))}</span>` : ""}
        </button>`).join(""),
      { symbol: "notizen", farbe: "gelb", klasse: "start-karte-notizen" }));
  }

  // --- Hinweise aus dem HWR-Plan, nächste 7 Tage, nur wenn es welche gibt -
  const grenze = tagesSchluessel(tageDazu(jetzt, 7));
  const hinweise = hinweiseSammeln()
    .filter(x => !istVorbei(x.start) && x.start.slice(0, 10) <= grenze)
    .slice(0, 2);
  if (hinweise.length > 0) {
    karten.push(startKarte("Hinweise im Plan", "todos", "Alle",
      hinweise.map(x => `
        <div class="start-hinweis">
          <span class="start-hinweis-text">${sicher(x.anmerkung)}</span>
          <span class="start-todo-wann">${sicher(tagLesbar(x.start.slice(0, 10)) + " · " + kurzerTitel(x.titel))}</span>
        </div>`).join(""),
      { symbol: "hinweis", farbe: "gelb", klasse: "start-karte-hinweise" }));
  }

  // --- Studienphasen aus dem Uni-Plan, ganz unten: nur was noch kommt ------
  const phasenKarte = uniplanStartKarte(jetzt);
  if (phasenKarte) karten.push(phasenKarte);

  stuecke.push(`<div class="start-raster">${karten.join("")}</div>`);
  bereich.innerHTML = stuecke.join("");
}

/* Eine To-do-Zeile, wie sie in "Nächste To-dos" und in "Heute" steht. */
function startTodoZeile(eintrag, wann, ueberfaellig) {
  return `
    <div class="start-todo${ueberfaellig ? " start-todo-ueberfaellig" : ""}">
      <button type="button" class="todo-haken" data-todo-haken="${sicher(eintrag.kennung)}"
              aria-label="Als erledigt abhaken"></button>
      <button type="button" class="start-todo-text" data-start-todo="${sicher(eintrag.kennung)}">
        <span class="start-todo-titel">${eintrag.wichtig ? "★ " : ""}${sicher(eintrag.text)}</span>
        <span class="start-todo-wann">${sicher(wann)}${eintrag.erinnerung ? " · 🔔" : ""}</span>
      </button>
    </div>`;
}

/* Eine Karte der Übersicht: Kopf mit Symbol und Überschrift, rechts ein
   Weg in den ganzen Bereich, darunter der Inhalt. Die Farbe des Symbols
   unterscheidet die Karten auf einen Blick, auch ohne zu lesen.

   optionen: { symbol, farbe, breit, klasse, unterzeile } */
function startKarte(titel, ziel, zielText, inhalt, optionen) {
  const o = optionen || {};
  return `
    <section class="start-karte${o.breit ? " start-karte-breit" : ""}${o.klasse ? " " + o.klasse : ""}">
      <div class="start-karte-kopf">
        ${o.symbol ? `<span class="start-symbol start-symbol-${o.farbe || "blau"}">${symbol(o.symbol)}</span>` : ""}
        <div class="start-karte-titel">
          <h2>${sicher(titel)}</h2>
          ${o.unterzeile ? `<span class="start-unterzeile">${sicher(o.unterzeile)}</span>` : ""}
        </div>
        <button type="button" class="start-weiter" data-start-seite="${ziel}">${sicher(zielText)} ›</button>
      </div>
      <div class="start-karte-inhalt">${inhalt}</div>
    </section>`;
}

/* Die Knöpfe der Übersicht. Was es auch anderswo gibt – Termin antippen,
   To-do abhaken, Notiz öffnen –, geht an notizKlick(), damit es sich
   genau so verhält wie im Plan oder im To-do-Bereich. */
function startKlick(ereignis) {
  const ziel = ereignis.target && ereignis.target.closest
    ? ereignis.target.closest("[data-start-seite],[data-start-todo],"
                              + "[data-start-gesehen],[data-start-verlauf],"
                              + "[data-aenderung-haken]")
    : null;
  if (!ziel) { notizKlick(ereignis); return; }

  const neueSeite = ziel.getAttribute("data-start-seite");
  if (neueSeite) {
    // Der Uni-Plan ist kein Reiter, sondern ein Fenster.
    if (neueSeite === "uniplan") { uniplanFensterZeigen(); return; }
    // In den Plan heißt: diese Woche, heute oben.
    if (neueSeite === "plan") {
      angezeigterMontag = montagDerWoche(new Date());
      vergangeneOffenFuer = "";
    }
    seiteSetzen(neueSeite);
    window.scrollTo(0, 0);
    return;
  }

  // Ein To-do antippen öffnet es dort, wo man es bearbeiten kann.
  const todo = ziel.getAttribute("data-start-todo");
  if (todo) {
    offeneNotiz = todo;
    seiteSetzen("todos");
    notizfeldAktivieren();
    return;
  }

  const haken = ziel.getAttribute("data-aenderung-haken");
  if (haken) {
    aenderungAbhaken(haken);
    allesZeichnen();
    return;
  }

  if (ziel.hasAttribute("data-start-gesehen")) {
    aenderungenAlsGesehenMerken();
    allesZeichnen();
    return;
  }

  if (ziel.hasAttribute("data-start-verlauf")) verlaufFensterZeigen();
}


/* -------------------------------------------------------------------------
   4. Wochenansicht
   ------------------------------------------------------------------------- */

/* Beide Ansichten zeigen dieselbe Woche, nur anders aufbereitet. Diese
   Funktion bereitet vor, was beide brauchen, und übergibt dann. */
function wocheZeichnen() {
  const montag = angezeigterMontag;
  const sonntag = tageDazu(montag, 6);
  const heuteSchluessel = tagesSchluessel(new Date());

  document.getElementById("wochenTitel").textContent =
    datumKurz(montag) + " – " + datumKurz(sonntag) + " " + sonntag.getFullYear();

  // Termine dieser Woche nach Tagen sortieren.
  const nachTag = new Map();
  for (const termin of alleAngezeigtenTermine()) {
    const schluessel = tagesSchluessel(termin.start);
    if (!nachTag.has(schluessel)) nachTag.set(schluessel, []);
    nachTag.get(schluessel).push(termin);
  }

  // Welche Tage überhaupt gezeigt werden. Samstag und Sonntag nur, wenn dort
  // etwas stattfindet – an der HWR ist das die Ausnahme, und leere Spalten
  // stören nur.
  const tage = [];
  for (let versatz = 0; versatz < 7; versatz++) {
    const tag = tageDazu(montag, versatz);
    const schluessel = tagesSchluessel(tag);
    const termineDesTages = nachTag.get(schluessel) || [];
    const aufgabenDesTages = aufgabenFuerTag(schluessel);
    const ganztagsDesTages = ganztagsTermineFuerTag(schluessel);

    // Am Wochenende ist normalerweise nichts – dann bleibt der Kasten weg.
    // Steht dort aber etwas Eigenes, muss der Tag sichtbar sein, sonst
    // käme man nicht heran. Seit es eigene Termine gibt, zählen die mit:
    // ein Geburtstag am Samstag darf den Tag nicht unsichtbar lassen.
    if (versatz >= 5 && termineDesTages.length === 0
        && aufgabenDesTages.length === 0
        && ganztagsDesTages.length === 0) continue;

    tage.push({
      datum: tag,
      schluessel: schluessel,
      termine: termineDesTages,
      aufgaben: aufgabenDesTages,
      ganztags: ganztagsDesTages,
      istHeute: schluessel === heuteSchluessel,
    });
  }

  document.getElementById("tage").innerHTML =
    ansicht === "kalender" ? kalenderBauen(tage) : listeBauen(tage);

  if (ansicht === "kalender") kalenderTexteAnpassen();
}


/* Nachmessen, wie viel Text wirklich in jedes Kalenderkästchen passt.

   kalenderBauen() schätzt das schon beim Zeichnen – aber eben nur geschätzt,
   aus fest eingetragenen Zeilenhöhen. Die stehen doppelt: einmal im CSS,
   einmal im JavaScript. Beim Ausprobieren kam heraus, dass die Schätzung
   die Raum- und Hinweiszeile UNTER dem Titel vergaß: zwölf von achtzehn
   Kästchen liefen unten über, der Text wurde waagerecht durchgeschnitten.

   Statt die Zahlen nachzubessern und beim nächsten CSS-Umbau wieder falsch
   zu haben, fragt diese Funktion den Browser. Er weiß es genau.

   Die Reihenfolge beim Kürzen ist eine Rangfolge: Uhrzeit und Titel bleiben
   immer, danach fliegt der Raum, dann der HWR-Hinweis. Alles zusammen steht
   ohnehin im Fenster, das ein Tippen öffnet. */
function kalenderTexteAnpassen() {
  for (const kasten of document.querySelectorAll(".kalender-termin")) {
    const titel = kasten.querySelector(".kalender-termin-titel");

    /* Ist der Kalender gerade gar nicht sichtbar – etwa weil der To-do-
       Bereich offen ist –, misst der Browser überall null. Dann bliebe
       jedes Kästchen auf einer Zeile stehen. Lieber die Schätzung aus
       kalenderBauen() behalten und später neu messen, wenn er sichtbar
       ist; seiteSetzen() zeichnet dann ohnehin neu. */
    if (!titel || kasten.clientHeight === 0) continue;

    const alleZeilen = kasten.querySelectorAll(".kalender-termin-zeile");
    for (const zeile of alleZeilen) zeile.hidden = false;

    /* Die eigene Notiz wird getrennt behandelt.

       Raum und HWR-Hinweis darf der Titel verdraengen, die Notiz nicht:
       sie ist das Einzige im Kasten, was nicht aus dem HWR-System kommt,
       und sie steht nirgends sonst im Raster. Lieber ein einzeiliger
       Titel mit sichtbarer Notiz als zwei Titelzeilen ohne sie. */
    const notizZeile = kasten.querySelector(".kalender-termin-notiz");
    const zusatzZeilen = Array.prototype.filter.call(
      alleZeilen, zeile => zeile !== notizZeile);

    /* Passt die Zeitspanne nicht in die Spaltenbreite, bleibt nur die
       Anfangszeit stehen.

       Vorher wurde sie einfach abgeschnitten - auf dem Handy stand dann
       "08:00-09:3" da. Eine halbe Endzeit ist schlimmer als gar keine: sie
       sieht aus wie eine Angabe und ist doch keine. Die Anfangszeit allein
       ist vollstaendig und richtig, und genau sie war der Grund, die Zeit
       ueberhaupt in jedes Kaestchen zu schreiben - 9:45 liest man am
       Stundenraster nicht ab. */
    const zeitZeile = kasten.querySelector(".kalender-termin-zeit");
    const endzeit = zeitZeile && zeitZeile.querySelector(".kalender-zeit-ende");
    if (endzeit) {
      endzeit.hidden = false;
      if (zeitZeile.scrollWidth > zeitZeile.clientWidth + 1) endzeit.hidden = true;
    }

    const zeilenHoehe =
      parseFloat(getComputedStyle(titel).lineHeight) || 14;

    /* Wie viel Platz bleibt dem Titel?

       Naheliegend wäre "Kastenhöhe minus scrollHeight". Das geht aber
       nicht: der Kasten hat overflow:hidden, und dann ist scrollHeight nie
       kleiner als der Kasten selbst. Bei einem hohen Kästchen mit wenig
       Inhalt kommt so immer null heraus – gemessen wurde beim Ausprobieren
       genau eine Zeile, auch in einem 208 Bildpunkte hohen Kasten.

       Also andersherum: die Geschwister des Titels einzeln messen und von
       der Innenhöhe abziehen. Die kennt der Browser exakt. */
    const kastenStil = getComputedStyle(kasten);
    function platzFuerTitel() {
      let belegt = parseFloat(kastenStil.paddingTop)
                 + parseFloat(kastenStil.paddingBottom);
      for (const geschwister of kasten.children) {
        if (geschwister === titel || geschwister.hidden) continue;
        belegt += geschwister.getBoundingClientRect().height;
      }
      return kasten.clientHeight - belegt;
    }

    /* Angestrebt werden zwei Titelzeilen, nicht nur eine.

       Der Grund ist der Anlass für diesen ganzen Umbau: "34 - Schlüssel-
       kompetenzen V" auf einer Zeile ist "34 - Schlüsselkompe…" und damit
       kaum von einem anderen Fach zu unterscheiden. Zwei Zeilen reichen für
       fast jeden Modulnamen.

       Bezahlt wird das mit der Raumzeile, die dann weichen muss. Im Kalender
       sucht man den Termin, nicht den Raum – und wer ihn braucht, tippt das
       Kästchen an oder schaut in die Liste, wo er immer steht. */
    let naechste = 0;
    while (platzFuerTitel() < zeilenHoehe * 2 && naechste < zusatzZeilen.length) {
      zusatzZeilen[naechste].hidden = true;
      naechste++;
    }

    /* Die Notiz darf zwei Zeilen haben – aber nicht auf Kosten des Titels.

       Auf dem Handy sind die Kästchen schmal, und eine zweizeilige Notiz
       drückte den Titel auf "Natio-…". Damit weiß man zwar, was man sich
       notiert hat, aber nicht mehr, wozu. Also der Reihe nach nachgeben:
       erst die zweite Notizzeile, dann die zweite Titelzeile, und erst
       ganz zuletzt die Notiz selbst. Das ✎ in der Zeitzeile bleibt dann
       stehen und sagt wenigstens, dass es eine gibt. */
    if (notizZeile) {
      notizZeile.style.webkitLineClamp = "2";
      if (platzFuerTitel() < zeilenHoehe * 2) notizZeile.style.webkitLineClamp = "1";
      if (platzFuerTitel() < zeilenHoehe) notizZeile.hidden = true;
    }

    titel.style.webkitLineClamp =
      String(Math.max(1, Math.floor(platzFuerTitel() / zeilenHoehe)));
  }
}


/* --- Ansicht 1: Liste ---------------------------------------------------
   Ein Kasten je Tag, Termine untereinander. Gut auf schmalen Bildschirmen
   und beim schnellen Nachschauen. */

/* In der Listenansicht steht der heutige Tag oben.

   Montag und Dienstag sind am Mittwoch vorbei – und doch standen sie bis
   jetzt ganz oben, und man musste an ihnen vorbeiscrollen, um zu sehen,
   was heute ansteht. Jetzt sind sie eingeklappt, und ein Knopf darüber
   holt sie zurück.

   Das gilt nur für die LAUFENDE Woche. Blättert man zurück, will man ja
   gerade das Vergangene sehen; blättert man vor, gibt es nichts
   Vergangenes. Und nur für die Liste: im Kalender stehen die Tage
   nebeneinander, dort kostet ein vergangener Tag keinen Platz nach unten.

   heuteText lässt sich übergeben, damit der Test nicht vom Wochentag
   abhängt, an dem er läuft. */
function listeBauen(tage, heuteText) {
  const stuecke = [];
  const heute = heuteText || tagesSchluessel(new Date());

  let sichtbar = tage;
  if (tage.length > 0) {
    const montag = tagesSchluessel(montagDerWoche(tage[0].datum));
    const sonntag = tagesSchluessel(tageDazu(montagDerWoche(tage[0].datum), 6));
    const laufendeWoche = montag <= heute && heute <= sonntag;
    const vergangen = laufendeWoche
      ? tage.filter(eintrag => eintrag.schluessel < heute) : [];

    if (vergangen.length > 0) {
      const offen = vergangeneOffenFuer === montag;
      if (!offen) sichtbar = tage.filter(eintrag => eintrag.schluessel >= heute);

      stuecke.push(`
        <button type="button" class="vergangene-knopf"
                data-vergangene-umschalten="${sicher(montag)}">
          ${offen
            ? "▾ Vergangene Tage ausblenden"
            : "▸ " + vergangen.length + (vergangen.length === 1
                ? " vergangenen Tag" : " vergangene Tage")
              + " dieser Woche anzeigen"}
        </button>`);

      /* Ist heute ein freier Samstag, bleibt nach dem Einklappen nichts
         übrig. Ein leerer Bereich unter dem Knopf sähe aus wie ein Fehler. */
      if (!offen && sichtbar.length === 0) {
        stuecke.push(`<p class="leer-text">
          Für den Rest dieser Woche steht nichts mehr an.
        </p>`);
      }
    }
  }

  for (const eintrag of sichtbar) {
    const tag = eintrag.datum;
    const termineDesTages = eintrag.termine;
    const istHeute = eintrag.istHeute;

    const kopfZusatz = termineDesTages.length === 0
      ? "frei"
      : uhrzeit(termineDesTages[0].start) + "–"
        + uhrzeit(termineDesTages[termineDesTages.length - 1].ende);

    const klassen = "tag" + (istHeute ? " tag-heute" : "");

    stuecke.push(`
      <div class="${klassen}">
        <div class="tag-kopf">
          <span>${WOCHENTAGE[tag.getDay()]}, ${datumKurz(tag)}${istHeute ? " · heute" : ""}</span>
          <span class="tag-kopf-zusatz">${kopfZusatz}</span>
        </div>
        ${termineDesTages.length === 0
          ? `<div class="tag-leer">Keine Veranstaltung.</div>`
          : termineDesTages.map(terminZeichnen).join("")}
        ${(eintrag.ganztags || []).map(ganztagsTerminZeichnen).join("")}
        ${eintrag.aufgaben.map(freieAufgabeZeichnen).join("")}
        ${bearbeitenModus
          ? `<div class="tag-fuss">
               <button type="button" class="notiz-neu"
                       data-aufgabe-neu="${sicher(eintrag.schluessel)}">
                 + To-do für diesen Tag
               </button>
               <button type="button" class="notiz-neu"
                       data-termin-neu="${sicher(eintrag.schluessel)}">
                 + Termin an diesem Tag
               </button>
             </div>`
          : ""}
      </div>`);
  }
  return stuecke.join("");
}

function terminZeichnen(termin) {
  /* Bei eigenen Terminen ist "art" immer "eigen" – das als Detail
     anzuzeigen wäre eine leere Zeile. Bei HWR-Terminen steht dort SU, SI
     oder Ü, und das sagt etwas. */
  const details = termin.eigen
    ? [termin.raum].filter(Boolean).join(" · ")
    : [termin.raum, termin.dozent, termin.art].filter(Boolean).join(" · ");

  return `
    <div class="termin${termin.eigen ? " termin-eigen" : ""}${termin.arbeit ? " termin-arbeit" : ""}"${
      termin.eigen ? ` data-termin-bearbeiten="${sicher(termin.id)}"` : ""}>
      <div class="termin-zeit">${uhrzeit(termin.start)}–${uhrzeit(termin.ende)}</div>
      <div class="termin-inhalt">
        <div class="termin-titel">${sicher(termin.titel)}</div>
        <div class="termin-details">${sicher(details)}</div>
        ${termin.anmerkung
          ? `<div class="termin-anmerkung">${sicher(termin.anmerkung)}</div>`
          : ""}
        ${termin.korrektur
          ? `<div class="termin-korrektur">✎ ${sicher(termin.korrektur)}</div>`
          : ""}
        ${notizZeichnen(termin)}
        ${terminZettelZeile(termin)}
        ${terminKnoepfeZeichnen(termin)}
      </div>
    </div>`;
}


/* --- Eigene Notizen ------------------------------------------------------

   Für alles, was nicht im HWR-System steht: "heute online", "Abgabe bis
   Freitag", "fällt aus". Ein Klick auf die Notiz öffnet sie zum Bearbeiten.
   ---------------------------------------------------------------------- */

/* Liest die Notizen und bringt sie auf das aktuelle Format.

   In der ersten Fassung war eine Notiz einfach ein Text. Jetzt ist sie ein
   kleines Objekt mit Text und Häkchen: { text: "...", erledigt: false }.
   Damit vorhandene Notizen beim Umstieg nicht verschwinden, wird die alte
   Schreibweise hier stillschweigend umgewandelt. */
function notizenLaden() {
  try {
    const roh = localStorage.getItem(SPEICHER_NOTIZEN);
    const gelesen = roh ? JSON.parse(roh) : {};
    const ergebnis = {};
    for (const kennung of Object.keys(gelesen)) {
      const wert = gelesen[kennung];
      if (typeof wert === "string") {
        ergebnis[kennung] = { text: wert, erledigt: false, wichtig: false,
                              geaendert: 0 };
      } else if (wert && typeof wert.text === "string") {
        ergebnis[kennung] = {
          text: wert.text,
          erledigt: Boolean(wert.erledigt),
          // Fehlt das Feld, ist die Notiz aus einer älteren Fassung.
          wichtig: Boolean(wert.wichtig),
          /* Wann diese Notiz zuletzt angefasst wurde – der Schiedsrichter
             beim Geräteabgleich. Notizen aus der Zeit davor bekommen eine 0
             und verlieren damit gegen jede Fassung, die seither irgendwo
             bearbeitet wurde. Genau richtig: die 0 heißt "unbekannt alt". */
          geaendert: Number(wert.geaendert) || 0,
        };
      }
    }
    return ergebnis;
  } catch (fehler) {
    return {};
  }
}

/* Der Text einer Notiz, oder "" wenn es keine gibt. Spart überall die
   Prüfung, ob der Eintrag überhaupt existiert. */
function notizText(kennung) {
  return notizen[kennung] ? notizen[kennung].text : "";
}

function notizErledigt(kennung) {
  return Boolean(notizen[kennung] && notizen[kennung].erledigt);
}

/* Ist dieser Eintrag als wichtig markiert? Funktioniert für beide Sorten –
   Notizen an Vorlesungen wie freie Aufgaben. */
function istWichtig(kennung) {
  if (kennung.indexOf("eigen-") === 0) {
    const aufgabe = aufgabeZuKennung(kennung);
    return Boolean(aufgabe && aufgabe.wichtig);
  }
  return Boolean(notizen[kennung] && notizen[kennung].wichtig);
}

function erledigtUmschalten(kennung) {
  if (!notizen[kennung]) return;
  notizen[kennung].erledigt = !notizen[kennung].erledigt;
  notizen[kennung].geaendert = Abgleich.jetzt();
  notizenSpeichern();
}

function notizenSpeichern() {
  try {
    localStorage.setItem(SPEICHER_NOTIZEN, JSON.stringify(notizen));
  } catch (fehler) {
    // Der Browser kann das Speichern verweigern, etwa im privaten Modus.
    // Dann steht die Notiz noch auf dem Bildschirm, ist aber nach dem
    // Neuladen weg. Besser als ein Absturz.
  }
  Abgleich.anstossen();
}

/* Setzt oder entfernt eine Notiz. Ein leerer Text löscht sie – so braucht es
   keinen eigenen Löschweg für "ich hab mich vertippt". */
function notizSetzen(kennung, text, wichtig) {
  const sauber = (text || "").trim();
  if (sauber) {
    // Ein vorhandenes Häkchen bleibt erhalten, wenn nur der Text geändert wird.
    notizen[kennung] = {
      text: sauber,
      erledigt: notizErledigt(kennung),
      wichtig: wichtig === undefined ? istWichtig(kennung) : Boolean(wichtig),
      geaendert: Abgleich.jetzt(),
    };
    // Schreibt man an derselben Stelle wieder etwas hin, ist der Grabstein
    // hinfällig. Bliebe er stehen, würde er die neue Notiz beim Abgleich
    // gleich wieder beerdigen.
    grabsteinEntfernen(kennung);
  } else {
    delete notizen[kennung];
    grabsteinSetzen(kennung);
  }
  notizenSpeichern();
}

/* --- Erinnerungen --------------------------------------------------------

   Eine Erinnerung besteht aus zwei Feldern, und das hat einen Grund:

     erinnerungVorgabe  "vortag18"           – was du ausgewählt hast
     erinnerung         "2026-09-24T18:00"   – wann das konkret ist

   Gespeichert wird beides. Die Vorgabe, damit die Auswahl beim nächsten
   Öffnen wieder dasteht und damit die Erinnerung MITWANDERT, wenn du das
   Fälligkeitsdatum verschiebst. Der ausgerechnete Zeitpunkt, damit der
   Server nichts rechnen muss: er vergleicht zwei Zeichenketten, fertig.

   Die Alternative wäre gewesen, nur die Vorgabe zu speichern und den
   Server rechnen zu lassen. Dann stünde dieselbe Rechnerei zweimal da –
   einmal hier in JavaScript, einmal in TypeScript auf dem Server – und
   liefe beim nächsten Umbau auseinander. Dass eine Erinnerung ein paar
   Zeichen mehr Platz braucht, ist der bessere Preis.

   Die Zeitangabe ist ORTSZEIT ohne Zeitzone: "2026-09-24T18:00" heißt
   18 Uhr in Berlin. Der Server vergleicht sie mit der Berliner Zeit im
   selben Format. Damit gibt es die Sommerzeit an dieser Stelle gar nicht
   erst – wer in UTC rechnet, muss zweimal im Jahr richtig liegen.
   ------------------------------------------------------------------------ */

/* Für Dinge mit Tag, aber ohne Uhrzeit: To-dos und ganztägige Termine.
   "Eine Stunde vorher" ergibt dort nichts – vor wann? */
const ERINNERUNG_TAG = [
  ["", "Keine Erinnerung"],
  ["tag9", "Am Tag, 9:00"],
  ["tag18", "Am Tag, 18:00"],
  ["vortag18", "Am Vortag, 18:00"],
  ["3tage18", "3 Tage vorher, 18:00"],
  ["woche18", "1 Woche vorher, 18:00"],
];

/* Für Dinge mit Uhrzeit: eigene Termine. */
const ERINNERUNG_UHRZEIT = [
  ["", "Keine Erinnerung"],
  ["15min", "15 Minuten vorher"],
  ["1std", "1 Stunde vorher"],
  ["3std", "3 Stunden vorher"],
  ["1tag", "1 Tag vorher, gleiche Zeit"],
  ["vortag18", "Am Vortag, 18:00"],
  ["woche18", "1 Woche vorher, 18:00"],
];

function erinnerungBeschriftung(vorgabe) {
  const alle = ERINNERUNG_TAG.concat(ERINNERUNG_UHRZEIT);
  for (const eintrag of alle) {
    if (eintrag[0] === vorgabe) return eintrag[1];
  }
  return "";
}

/* Rechnet aus, wann erinnert wird.

   bezug ist "2026-09-25" (ein To-do) oder "2026-09-25T14:00" (ein Termin).
   Kommt nichts Sinnvolles heraus, ist das Ergebnis leer – dann gibt es
   eben keine Erinnerung, statt einer zu einem erfundenen Zeitpunkt.

   Tage und Minuten werden getrennt gerechnet und nie vermischt. Das ist
   der Trick gegen die Sommerzeit: "einen Tag früher" verschiebt nur das
   Datum und lässt die Uhrzeit stehen, "eine Stunde früher" nur die
   Uhrzeit. Würde man beides über einen Zeitstempel rechnen, verschöbe
   sich zweimal im Jahr die Uhrzeit um eine Stunde. */
function erinnerungZeitpunkt(vorgabe, bezug) {
  if (!vorgabe || !bezug || bezug.length < 10) return "";

  const datum = bezug.slice(0, 10);
  const zeit = bezug.length >= 16 ? bezug.slice(11, 16) : "";

  if (vorgabe === "tag9") return datum + "T09:00";
  if (vorgabe === "tag18") return datum + "T18:00";

  const abendsVorTagen = { vortag18: 1, "3tage18": 3, woche18: 7 };
  if (Object.prototype.hasOwnProperty.call(abendsVorTagen, vorgabe)) {
    return tagVerschieben(datum, -abendsVorTagen[vorgabe]) + "T18:00";
  }

  // Gleiche Uhrzeit, einen Tag früher. Ohne Uhrzeit hilfsweise 9 Uhr.
  if (vorgabe === "1tag") {
    return tagVerschieben(datum, -1) + "T" + (zeit || "09:00");
  }

  const vorMinuten = { "15min": 15, "1std": 60, "3std": 180 };
  if (Object.prototype.hasOwnProperty.call(vorMinuten, vorgabe)) {
    // Ohne Uhrzeit gibt es keinen Bezugspunkt, von dem aus man abzieht.
    if (!zeit) return "";
    let minuten = Number(zeit.slice(0, 2)) * 60 + Number(zeit.slice(3, 5))
                - vorMinuten[vorgabe];
    let tag = datum;
    // Über Mitternacht zurück: ein Termin um 00:30 minus eine Stunde.
    while (minuten < 0) {
      minuten += 1440;
      tag = tagVerschieben(tag, -1);
    }
    return tag + "T" + String(Math.floor(minuten / 60)).padStart(2, "0")
               + ":" + String(minuten % 60).padStart(2, "0");
  }

  return "";
}

/* Tage auf ein Datum rechnen, ohne über die Ortszeit zu stolpern.

   Der Umweg über 12:00 UTC ist Absicht: rechnete man ab Mitternacht,
   läge man in der Nacht der Zeitumstellung eine Stunde daneben und
   bekäme den Vortag oder den Folgetag. Mittags ist der Abstand zu beiden
   Rändern so groß, dass das nicht passieren kann. */
function tagVerschieben(datum, tage) {
  const punkt = new Date(datum + "T12:00:00Z");
  if (!isFinite(punkt.getTime())) return datum;
  punkt.setUTCDate(punkt.getUTCDate() + tage);
  return punkt.toISOString().slice(0, 10);
}

/* Die Erinnerung eines Eintrags neu ausrechnen.

   Wird bei JEDEM Speichern aufgerufen, nicht nur wenn man die Auswahl
   anfasst. Genau darin liegt der Sinn: verschiebst du ein To-do von
   Freitag auf Montag, wandert die Erinnerung mit, ohne dass du daran
   denken musst. */
function erinnerungFelder(vorgabe, bezug) {
  const sauber = erinnerungBeschriftung(vorgabe) ? vorgabe : "";
  const zeitpunkt = erinnerungZeitpunkt(sauber, bezug);
  // Lässt sich nichts ausrechnen, gilt die Erinnerung als nicht gesetzt -
  // eine Vorgabe ohne Zeitpunkt wäre ein Versprechen, das niemand einlöst.
  if (!zeitpunkt) return { erinnerungVorgabe: "", erinnerung: "" };
  return { erinnerungVorgabe: sauber, erinnerung: zeitpunkt };
}

/* Lesbar für die Anzeige: "Am Vortag, 18:00 · Mi 24.09., 18:00". */
function erinnerungLesbar(eintrag) {
  if (!eintrag || !eintrag.erinnerung) return "";
  const beschriftung = erinnerungBeschriftung(eintrag.erinnerungVorgabe);
  const wann = zeitpunktLesbar(eintrag.erinnerung);
  return beschriftung ? beschriftung + " · " + wann : wann;
}

/* Die Schnellwahl beim Fälligkeitsdatum.

   Ein Datumsfeld ist auf dem Handy drei Drehrädchen. "Morgen" ist aber
   das, was man in neun von zehn Fällen meint – dafür sollte man nicht
   durch einen Kalender blättern müssen. */
const DATUM_SCHNELL = [
  ["heute", "Heute"],
  ["morgen", "Morgen"],
  ["uebermorgen", "Übermorgen"],
  ["montag", "Nächster Montag"],
];

function datumSchnellRechnen(name, heuteText) {
  const heute = heuteText || tagesSchluessel(new Date());
  if (name === "heute") return heute;
  if (name === "morgen") return tagVerschieben(heute, 1);
  if (name === "uebermorgen") return tagVerschieben(heute, 2);

  /* "Nächster Montag" heißt immer der KOMMENDE, nie heute.

     Steht man an einem Montag und tippt darauf, ist eine Aufgabe für
     heute nicht gemeint – dafür gibt es den Knopf daneben. Also immer
     mindestens ein Tag Abstand, höchstens sieben. */
  if (name === "montag") {
    const wochentag = new Date(heute + "T12:00:00Z").getUTCDay();  // 0 = So
    const bisMontag = ((8 - wochentag) % 7) || 7;
    return tagVerschieben(heute, bisMontag);
  }
  return heute;
}


/* --- Freie Aufgaben ------------------------------------------------------

   Alles, was an einem Tag zu tun ist, ohne zu einer Vorlesung zu gehören.
   ---------------------------------------------------------------------- */

function aufgabenLaden() {
  try {
    const roh = localStorage.getItem(SPEICHER_AUFGABEN);
    const gelesen = roh ? JSON.parse(roh) : [];
    if (!Array.isArray(gelesen)) return [];
    // Nur brauchbare Einträge übernehmen – eine kaputte Zeile soll nicht
    // die ganze Liste unbenutzbar machen.
    return gelesen
      .filter(a => a && typeof a.text === "string" && typeof a.datum === "string")
      .map(a => ({
        id: String(a.id || neueAufgabenKennung()),
        text: a.text,
        datum: a.datum,
        erledigt: Boolean(a.erledigt),
        wichtig: Boolean(a.wichtig),
        erinnerungVorgabe: typeof a.erinnerungVorgabe === "string"
                             ? a.erinnerungVorgabe : "",
        erinnerung: typeof a.erinnerung === "string" ? a.erinnerung : "",
        // Siehe notizenLaden() – 0 heißt "von vor dem Geräteabgleich".
        geaendert: Number(a.geaendert) || 0,
      }));
  } catch (fehler) {
    return [];
  }
}

function aufgabenSpeichern() {
  try {
    localStorage.setItem(SPEICHER_AUFGABEN, JSON.stringify(aufgaben));
  } catch (fehler) { /* siehe notizenSpeichern() */ }
  Abgleich.anstossen();
}


/* --- Grabsteine ----------------------------------------------------------

   Warum es sie gibt, steht bei SPEICHER_GRABSTEINE weiter oben.
   ---------------------------------------------------------------------- */

function grabsteineLaden() {
  try {
    const roh = localStorage.getItem(SPEICHER_GRABSTEINE);
    const gelesen = roh ? JSON.parse(roh) : {};
    if (!gelesen || typeof gelesen !== "object") return {};
    const ergebnis = {};
    for (const kennung of Object.keys(gelesen)) {
      const zeitpunkt = Number(gelesen[kennung]);
      if (isFinite(zeitpunkt) && zeitpunkt > 0) ergebnis[kennung] = zeitpunkt;
    }
    return ergebnis;
  } catch (fehler) {
    return {};
  }
}

function grabsteineSpeichern() {
  try {
    localStorage.setItem(SPEICHER_GRABSTEINE, JSON.stringify(grabsteine));
  } catch (fehler) { /* siehe notizenSpeichern() */ }
}

function grabsteinSetzen(kennung) {
  grabsteine[kennung] = Abgleich.jetzt();
  grabsteineSpeichern();
}

/* --- Eigene Termine ------------------------------------------------------

   Der Schritt vom Stundenplan zum Planer. Alles hier betrifft Termine, die
   du selbst einträgst – die HWR-Termine kommen unverändert aus
   daten/plan.js und werden nie angefasst.
   ---------------------------------------------------------------------- */

function eigeneTermineLaden() {
  try {
    const roh = localStorage.getItem(SPEICHER_TERMINE);
    const gelesen = roh ? JSON.parse(roh) : [];
    if (!Array.isArray(gelesen)) return [];
    return gelesen
      .filter(t => t && typeof t.titel === "string" && typeof t.start === "string")
      .map(t => ({
        id: String(t.id || neueTerminKennung()),
        titel: t.titel,
        start: t.start,
        // Ohne Ende wäre der Termin im Kalender nicht zeichenbar. Eine
        // Stunde ist die Annahme, die am seltensten stört.
        ende: typeof t.ende === "string" && t.ende ? t.ende : stundeSpaeter(t.start),
        ganztags: Boolean(t.ganztags),
        ort: typeof t.ort === "string" ? t.ort : "",
        notiz: typeof t.notiz === "string" ? t.notiz : "",
        wichtig: Boolean(t.wichtig),
        urlaub: Boolean(t.urlaub),
        erinnerungVorgabe: typeof t.erinnerungVorgabe === "string"
                             ? t.erinnerungVorgabe : "",
        erinnerung: typeof t.erinnerung === "string" ? t.erinnerung : "",
        geaendert: Number(t.geaendert) || 0,
      }));
  } catch (fehler) {
    return [];
  }
}

function eigeneTermineSpeichern() {
  try {
    localStorage.setItem(SPEICHER_TERMINE, JSON.stringify(eigeneTermine));
  } catch (fehler) { /* siehe notizenSpeichern() */ }
  Abgleich.anstossen();
}

function neueTerminKennung() {
  return "termin-" + Date.now() + "-" + Math.floor(Math.random() * 100000);
}

/* Eine Stunde auf eine Zeitangabe draufrechnen, ohne die Form zu verlieren.

   Über Date zu gehen wäre der naheliegende Weg, birgt aber die
   Zeitumstellung: am letzten Oktobersonntag hat ein Tag 25 Stunden, und
   ein Termin um 02:30 rutscht dann auf eine Uhrzeit, die es zweimal gibt.
   Hier wird deshalb schlicht auf der Uhr gerechnet – der Kalender zeigt
   ohnehin Ortszeit an. */
function stundeSpaeter(zeitangabe) {
  const stunde = Number(zeitangabe.slice(11, 13));
  if (!isFinite(stunde)) return zeitangabe;
  if (stunde >= 23) return zeitangabe.slice(0, 11) + "23:59";
  return zeitangabe.slice(0, 11)
       + String(stunde + 1).padStart(2, "0") + zeitangabe.slice(13, 16);
}

function terminZuEigenerKennung(kennung) {
  return eigeneTermine.filter(t => t.id === kennung)[0] || null;
}

/* Legt einen Termin an oder ändert ihn. Ein leerer Titel löscht ihn –
   dieselbe Regel wie bei Notizen und Aufgaben, damit man sich nur eine
   merken muss. */
function terminSetzen(kennung, felder) {
  const titel = (felder.titel || "").trim();

  if (!titel) {
    eigeneTermine = eigeneTermine.filter(t => t.id !== kennung);
    grabsteinSetzen(kennung);
    eigeneTermineSpeichern();
    return;
  }

  const vorhandener = terminZuEigenerKennung(kennung);
  const neuer = {
    id: kennung,
    titel: titel,
    start: felder.start,
    ende: felder.ende || stundeSpaeter(felder.start),
    ganztags: Boolean(felder.ganztags),
    ort: (felder.ort || "").trim(),
    notiz: (felder.notiz || "").trim(),
    wichtig: Boolean(felder.wichtig),
    /* Urlaub entsteht im Uni-Plan-Fenster. Wird er später übers normale
       Terminformular geändert, kennt das Formular das Feld nicht – dann
       bleibt es, wie es war, statt still zu verschwinden. */
    urlaub: felder.urlaub !== undefined ? Boolean(felder.urlaub)
                                        : Boolean(vorhandener && vorhandener.urlaub),
    geaendert: Abgleich.jetzt(),
  };

  /* Die Erinnerung hängt am Anfang des Termins und wird bei jedem
     Speichern neu ausgerechnet – verschiebst du den Termin, wandert sie
     mit. Bei einem ganztägigen Termin gibt es keine Uhrzeit, deshalb
     bekommt erinnerungZeitpunkt() nur das Datum zu sehen. */
  Object.assign(neuer, erinnerungFelder(
    felder.erinnerungVorgabe || "",
    neuer.ganztags ? neuer.start.slice(0, 10) : neuer.start));

  /* Ende vor Anfang wäre im Kalender ein Kästchen mit negativer Höhe –
     also unsichtbar. Lieber stillschweigend geraderücken als einen Termin
     anzeigen, den man nicht sieht. */
  if (!neuer.ganztags && neuer.ende <= neuer.start) {
    neuer.ende = stundeSpaeter(neuer.start);
  }

  if (vorhandener) {
    eigeneTermine = eigeneTermine.map(t => (t.id === kennung ? neuer : t));
  } else {
    eigeneTermine.push(neuer);
  }
  grabsteinEntfernen(kennung);
  eigeneTermineSpeichern();
}

/* Bringt eigene Termine in dieselbe Form wie die HWR-Termine.

   Das ist der Kniff, der den ganzen Umbau klein hält: Listenansicht,
   Kalenderraster, Überlappungsrechnung und das Detailfenster arbeiten
   alle mit dieser einen Form. Wer sie bedient, wird von allen vier
   gezeichnet, ohne dass dort auch nur eine Zeile geändert werden müsste.

   Das Feld "eigen" unterscheidet sie trotzdem – für die Farbe und dafür,
   dass der Fächerfilter sie nicht wegnimmt. */
function eigeneTermineAlsPlan() {
  return eigeneTermine.filter(t => !t.ganztags).map(t => ({
    id: t.id,
    start: t.start,
    ende: t.ende,
    titel: t.titel,
    raum: t.ort || "",
    dozent: "",
    anmerkung: t.notiz || "",
    art: "eigen",
    gruppe: "",
    eigen: true,
    wichtig: Boolean(t.wichtig),
  }));
}

function ganztagsTermineFuerTag(tagesschluessel) {
  return eigeneTermine.filter(
    t => t.ganztags && t.start.slice(0, 10) <= tagesschluessel
                    && (t.ende || t.start).slice(0, 10) >= tagesschluessel);
}

/* Alles, was in Plan und Kalender erscheinen soll: HWR plus deine eigenen.

   Der Fächerfilter greift nur in sichtbareTermine() und damit nur auf die
   HWR-Termine. Ein eigener Termin soll nicht verschwinden, weil ein Fach
   abgewählt wurde, mit dem er nichts zu tun hat. */
function alleAngezeigtenTermine() {
  return sichtbareTermine().concat(eigeneTermineAlsPlan(), arbeitsTermine())
    .sort((a, b) => a.start.localeCompare(b.start));
}

/* --- Das Notizbuch -------------------------------------------------------

   Freie Notizen, die für sich stehen, und die Verknüpfungen von dort zu
   Terminen, Modulen und anderen Notizen.

   Ein Verweis ist eine Zeichenkette mit einem Doppelpunkt darin:

     "termin:sked.de1200309"   genau diese eine Veranstaltung
     "fach:34 - Schlüsselkompetenzen V"   das ganze Modul, alle Termine
     "zettel:zettel-1789…"     eine andere Notiz

   Warum eine Zeichenkette und kein Objekt mit zwei Feldern? Weil der
   Abgleich jeden Eintrag als Text abdrückt, um bei gleichem Zeitstempel
   entscheiden zu können, welche Fassung gewinnt. Ein verschachteltes
   Objekt würde dort als "[object Object]" landen und zwei verschiedene
   Verweise sähen gleich aus.

   Die Liste wird immer sortiert gespeichert. Aus demselben Grund: sonst
   hinge das Ergebnis des Abgleichs davon ab, in welcher Reihenfolge man
   die Verknüpfungen angetippt hat.
   ------------------------------------------------------------------------ */

function zettelLaden() {
  try {
    const roh = localStorage.getItem(SPEICHER_ZETTEL);
    const gelesen = roh ? JSON.parse(roh) : [];
    if (!Array.isArray(gelesen)) return [];
    return gelesen.filter(z => z && typeof z.id === "string")
                  .map(zettelGeraderuecken);
  } catch (fehler) {
    return [];
  }
}

/* Bringt einen gelesenen Zettel auf die Form, mit der der Rest arbeitet.

   Steht an einer Stelle und nicht an fünf: ein Zettel kommt aus dem
   Browserspeicher, aus dem Abgleich oder aus dem Formular, und in allen
   drei Fällen soll hinterher dasselbe herauskommen. */
function zettelGeraderuecken(roh) {
  return {
    id: String(roh.id),
    text: typeof roh.text === "string" ? roh.text : "",
    verweise: verweiseSaeubern(roh.verweise),
    wichtig: Boolean(roh.wichtig),
    geaendert: Number(roh.geaendert) || 0,
  };
}

function verweiseSaeubern(liste) {
  if (!Array.isArray(liste)) return [];
  const gesehen = {};
  const sauber = [];
  for (const eintrag of liste) {
    if (typeof eintrag !== "string") continue;
    const wert = eintrag.trim();
    // Ohne Doppelpunkt fehlt die Art - damit ist der Verweis unbrauchbar.
    if (wert.indexOf(":") < 1) continue;
    if (gesehen[wert]) continue;
    gesehen[wert] = true;
    sauber.push(wert);
  }
  return sauber.sort();
}

function zettelSpeichern() {
  try {
    localStorage.setItem(SPEICHER_ZETTEL, JSON.stringify(zettel));
  } catch (fehler) { /* siehe notizenSpeichern() */ }
  Abgleich.anstossen();
}

/* Eine Kennung für eine neue Notiz.

   "zettel-" und nicht "notiz-": an "notiz" hängt im Abgleich schon die
   Notiz am Termin, und die hat eine ganz andere Form. Dieselbe Falle wie
   bei "eigen-" und "termin-", siehe SPEICHER_TERMINE. */
function neueZettelKennung() {
  return "zettel-" + Date.now() + "-" + Math.floor(Math.random() * 100000);
}

function zettelZuKennung(kennung) {
  return zettel.filter(z => z.id === kennung)[0] || null;
}

/* Die Überschrift einer Notiz ist ihre erste Zeile.

   So macht es die Notizen-App von Apple auch, und es erspart ein zweites
   Eingabefeld. Wer eine Überschrift will, schreibt sie einfach zuerst;
   wer nur schnell etwas hinwirft, bekommt trotzdem eine brauchbare Zeile
   in der Übersicht. */
function zettelTitel(z) {
  if (!z) return "";
  const zeilen = String(z.text || "").split("\n");
  for (const zeile of zeilen) {
    const sauber = zeile.trim();
    if (sauber) return sauber.length > 90 ? sauber.slice(0, 90) + "…" : sauber;
  }
  return "Ohne Titel";
}

/* Zerlegt den Text in Überschrift und Rest.

   Im Fenster stehen zwei Felder: oben eine fette Zeile für die
   Überschrift, darunter der Fließtext. Gespeichert wird trotzdem EIN
   Text, in dem die erste Zeile die Überschrift ist – so wie in der
   Notizen-App von Apple.

   Warum nicht zwei Felder auch im Speicher? Weil es dieselbe Notiz
   bliebe, nur mit einem Feld mehr, das durch den Abgleich muss und das
   ältere Geräte nicht kennen. Und weil eine Notiz ohne Überschrift dann
   eine leere Überschrift hätte statt einfach keine.

   Die Zerlegung ist umkehrbar: was hier auseinandergeht, fügt
   zettelZusammensetzen() genau so wieder zusammen. Ohne das wanderte beim
   Öffnen und Schließen jedes Mal eine Zeile nach oben. */
function zettelTeile(text) {
  const zeilen = String(text || "").split("\n");
  let i = 0;
  while (i < zeilen.length && !zeilen[i].trim()) i++;
  if (i >= zeilen.length) return { titel: "", rest: "" };
  return {
    titel: zeilen[i].trim(),
    rest: zeilen.slice(i + 1).join("\n").replace(/^\n+/, ""),
  };
}

function zettelZusammensetzen(titel, rest) {
  const kopf = String(titel || "").replace(/[\r\n]+/g, " ").trim();
  const koerper = String(rest || "");
  if (!kopf) return koerper.trim();
  if (!koerper.trim()) return kopf;
  return kopf + "\n\n" + koerper.replace(/^\n+/, "");
}

/* Alles nach der Überschrift, in einer Zeile, für die Übersicht. */
function zettelVorschau(z) {
  if (!z) return "";
  const zeilen = String(z.text || "").split("\n");
  let uebersprungen = false;
  const rest = [];
  for (const zeile of zeilen) {
    if (!uebersprungen) {
      if (zeile.trim()) uebersprungen = true;
      continue;
    }
    if (zeile.trim()) rest.push(zeile.trim());
  }
  const text = rest.join(" · ");
  return text.length > 160 ? text.slice(0, 160) + "…" : text;
}

/* Legt eine Notiz an oder ändert sie. Leerer Text UND keine Verknüpfung
   löscht sie – dieselbe Regel wie bei Notizen, Aufgaben und Terminen.

   Anders als dort zählt hier auch die Verknüpfung: eine Notiz, die nur aus
   "gehört zu diesem Termin" besteht, ist zwar seltsam, aber sie ist etwas,
   das jemand absichtlich angelegt hat. Sie stillschweigend wegzuwerfen
   wäre schlechter als sie leer stehen zu lassen. */
function zettelSetzen(kennung, felder) {
  const text = String((felder && felder.text) || "").trim();
  const verweise = verweiseSaeubern(felder && felder.verweise);

  if (!text && verweise.length === 0) {
    zettel = zettel.filter(z => z.id !== kennung);
    grabsteinSetzen(kennung);
    zettelSpeichern();
    return;
  }

  const vorhandener = zettelZuKennung(kennung);
  const neuer = zettelGeraderuecken({
    id: kennung,
    text: text,
    verweise: verweise,
    wichtig: felder && felder.wichtig !== undefined
               ? Boolean(felder.wichtig)
               : Boolean(vorhandener && vorhandener.wichtig),
    geaendert: Abgleich.jetzt(),
  });

  if (vorhandener) zettel = zettel.map(z => z.id === kennung ? neuer : z);
  else zettel.push(neuer);

  // Siehe notizSetzen(): ein Grabstein an derselben Kennung ist jetzt falsch.
  grabsteinEntfernen(kennung);
  zettelSpeichern();
}

/* Die Notizen, sortiert wie man sie sucht: zuletzt angefasste zuerst,
   Wichtiges ganz oben. */
function zettelSortiert() {
  return zettel.slice().sort((a, b) => {
    if (Boolean(a.wichtig) !== Boolean(b.wichtig)) return a.wichtig ? -1 : 1;
    return (Number(b.geaendert) || 0) - (Number(a.geaendert) || 0);
  });
}

/* Volltextsuche über Überschrift und Text. Kleinschreibung auf beiden
   Seiten, damit "hwr" auch "HWR" findet. */
function zettelGefunden(suchwort) {
  const wort = String(suchwort || "").trim().toLowerCase();
  if (!wort) return zettelSortiert();
  return zettelSortiert().filter(
    z => String(z.text || "").toLowerCase().indexOf(wort) >= 0);
}


/* --- Die Rückrichtung: was hängt an diesem Termin? ----------------------

   Das ist der eigentliche Zweck der Verknüpfungen. Man tippt einen Termin
   an und sieht, was man sich dazu notiert hat – ohne im Notizbuch suchen
   zu müssen.

   Ein Termin erbt dabei die Notizen seines Moduls: schreibt man eine Notiz
   zu "34 - Schlüsselkompetenzen V", steht sie bei jedem Termin dieses
   Moduls. Andersherum wäre es nutzlos, denn welcher der zwanzig Termine
   eines Moduls gemeint ist, weiß man beim Notieren meistens selbst nicht.
   -------------------------------------------------------------------- */

function zettelFuerTermin(terminKennung) {
  const termin = terminZuKennung(terminKennung);
  const fach = termin && !termin.eigen ? termin.titel : "";
  return zettelSortiert().filter(z =>
    z.verweise.indexOf("termin:" + terminKennung) >= 0
    || (fach && z.verweise.indexOf("fach:" + fach) >= 0));
}

function zettelFuerFach(fachname) {
  return zettelSortiert().filter(
    z => z.verweise.indexOf("fach:" + fachname) >= 0);
}

/* Wer verweist auf diese Notiz? Im Obsidian-Vault heißt das Rückverweis,
   und genau dafür ist es hier auch gut: man sieht beim Lesen, in welchem
   Zusammenhang die Notiz sonst noch steht. */
function zettelRueckverweise(kennung) {
  return zettelSortiert().filter(
    z => z.id !== kennung && z.verweise.indexOf("zettel:" + kennung) >= 0);
}

/* Aus einem Verweis wieder etwas Lesbares machen.

   Gibt immer etwas zurück, auch wenn das Ziel nicht mehr existiert – ein
   Termin kann aus dem Zeitfenster gefallen sein, eine verknüpfte Notiz
   gelöscht. Dann steht dort "nicht mehr da" statt einer leeren Zeile, und
   man weiß wenigstens, dass es den Verweis gibt. */
function verweisBeschreiben(verweis) {
  const trenner = verweis.indexOf(":");
  const art = verweis.slice(0, trenner);
  const wert = verweis.slice(trenner + 1);

  if (art === "fach") {
    return { art: art, wert: wert, symbol: "▦", titel: wert,
             zusatz: "Modul", fehlt: false };
  }

  if (art === "zettel") {
    const ziel = zettelZuKennung(wert);
    return { art: art, wert: wert, symbol: "✎",
             titel: ziel ? zettelTitel(ziel) : "Notiz nicht mehr da",
             zusatz: "Notiz", fehlt: !ziel };
  }

  if (art === "termin") {
    const ziel = terminZuKennung(wert);
    return { art: art, wert: wert, symbol: "◷",
             titel: ziel ? ziel.titel : "Termin nicht mehr im Plan",
             zusatz: ziel ? zeitpunktLesbar(ziel.start) : "",
             fehlt: !ziel };
  }

  return { art: art, wert: wert, symbol: "•", titel: wert, zusatz: "",
           fehlt: false };
}


function grabsteinEntfernen(kennung) {
  if (!(kennung in grabsteine)) return;
  delete grabsteine[kennung];
  grabsteineSpeichern();
}

/* Eine Kennung für eine neue Aufgabe. Die Zeit allein reicht nicht: legt man
   zwei Aufgaben in derselben Millisekunde an, gäbe es sie doppelt. Deshalb
   kommt eine Zufallszahl dazu. Das Vorzeichen "eigen-" unterscheidet sie von
   den Termin-Kennungen der HWR ("sked.de..."). */
function neueAufgabenKennung() {
  return "eigen-" + Date.now() + "-" + Math.floor(Math.random() * 100000);
}

function aufgabeZuKennung(kennung) {
  return aufgaben.filter(a => a.id === kennung)[0] || null;
}

function aufgabenFuerTag(tagesschluessel) {
  return aufgaben.filter(a => a.datum === tagesschluessel);
}

/* Legt eine Aufgabe an oder ändert eine bestehende. Leerer Text löscht sie –
   genau wie bei den Notizen. */
function aufgabeSetzen(kennung, text, datum, wichtig, erinnerungVorgabe) {
  const sauber = (text || "").trim();

  if (!sauber) {
    aufgaben = aufgaben.filter(a => a.id !== kennung);
    grabsteinSetzen(kennung);
    aufgabenSpeichern();
    return;
  }

  const vorhandene = aufgabeZuKennung(kennung);
  if (vorhandene) {
    vorhandene.text = sauber;
    if (datum) vorhandene.datum = datum;
    if (wichtig !== undefined) vorhandene.wichtig = Boolean(wichtig);
    if (erinnerungVorgabe !== undefined) {
      vorhandene.erinnerungVorgabe = erinnerungVorgabe;
    }
    /* Die Erinnerung wird bei JEDEM Speichern neu ausgerechnet, nicht nur
       wenn man die Auswahl anfasst. Verschiebst du ein To-do von Freitag
       auf Montag, wandert sie damit von selbst mit. */
    Object.assign(vorhandene, erinnerungFelder(
      vorhandene.erinnerungVorgabe, vorhandene.datum));
    vorhandene.geaendert = Abgleich.jetzt();
  } else {
    const tag = datum || tagesSchluessel(new Date());
    aufgaben.push(Object.assign({
      id: kennung,
      text: sauber,
      datum: tag,
      erledigt: false,
      wichtig: Boolean(wichtig),
      geaendert: Abgleich.jetzt(),
    }, erinnerungFelder(erinnerungVorgabe || "", tag)));
  }
  // Siehe notizSetzen(): ein Grabstein an derselben Kennung ist jetzt falsch.
  grabsteinEntfernen(kennung);
  aufgabenSpeichern();
}

function aufgabeErledigtUmschalten(kennung) {
  const aufgabe = aufgabeZuKennung(kennung);
  if (!aufgabe) return;
  aufgabe.erledigt = !aufgabe.erledigt;
  aufgabe.geaendert = Abgleich.jetzt();
  aufgabenSpeichern();
}

/* Das Textfeld zum Schreiben einer Notiz. Steht als eigene Funktion da, weil
   es an zwei Stellen gebraucht wird: im Plan und im To-do-Bereich. */
function notizFeldZeichnen(kennung, text, datum) {
  // Ein Datumsfeld gibt es nur bei freien Aufgaben. Eine Notiz an einer
  // Vorlesung hat ihr Datum schon durch den Termin.
  const mitDatum = typeof datum === "string";

  return `
    <div class="notiz-bearbeiten">
      <textarea id="notizFeld" class="notiz-feld" rows="2"
                placeholder="${mitDatum
                  ? "z. B. Bibliotheksbuch zurückgeben"
                  : "z. B. heute online · Abgabe bis Freitag · fällt aus"}"
      >${sicher(text)}</textarea>
      <div class="notiz-felder">
        ${mitDatum
          ? `<label class="notiz-datum">
               Tag
               <input type="date" id="aufgabeDatum" value="${sicher(datum)}">
             </label>`
          : ""}
        <label class="notiz-wichtig">
          <input type="checkbox" id="notizWichtig"
                 ${istWichtig(kennung) ? "checked" : ""}>
          <span>★ Wichtig</span>
        </label>
      </div>

      ${mitDatum ? `
        <div class="datum-schnell">
          ${DATUM_SCHNELL.map(eintrag => `
            <button type="button" class="notiz-neu"
                    data-datum-schnell="${eintrag[0]}">${eintrag[1]}</button>`).join("")}
        </div>` : ""}

      ${mitDatum ? `
        <label class="notiz-erinnerung">
          <span>🔔 Erinnerung</span>
          <select id="aufgabeErinnerung">
            ${ERINNERUNG_TAG.map(eintrag => `
              <option value="${eintrag[0]}"${
                (aufgabeZuKennung(kennung) || {}).erinnerungVorgabe === eintrag[0]
                  ? " selected" : ""}>${eintrag[1]}</option>`).join("")}
          </select>
        </label>
        <p class="erinnerung-hinweis" id="erinnerungHinweis"></p>` : ""}
      <div class="notiz-knoepfe">
        <button type="button" class="knopf-schlicht"
                data-notiz-speichern="${sicher(kennung)}">Speichern</button>
        <button type="button" class="knopf-schlicht"
                data-notiz-abbrechen="ja">Abbrechen</button>
        ${text ? `<button type="button" class="knopf-schlicht notiz-loeschen"
                          data-notiz-loeschen="${sicher(kennung)}">Löschen</button>` : ""}
      </div>
    </div>`;
}

/* Zeichnet eine freie Aufgabe im Tageskasten des Plans. */
function freieAufgabeZeichnen(aufgabe) {
  if (offeneNotiz === aufgabe.id) {
    return `<div class="termin termin-aufgabe">
              ${notizFeldZeichnen(aufgabe.id, aufgabe.text, aufgabe.datum)}
            </div>`;
  }

  const klassen = "notiz notiz-aufgabe"
    + (aufgabe.erledigt ? " notiz-erledigt" : "")
    + (aufgabe.wichtig && !aufgabe.erledigt ? " notiz-wichtig-markiert" : "");

  let zeichen = "○";
  if (aufgabe.erledigt) zeichen = "✓";
  else if (aufgabe.wichtig) zeichen = "★";

  return `
    <div class="termin termin-aufgabe">
      <div class="termin-zeit">To-do</div>
      <div class="termin-inhalt">
        <div class="${klassen}" data-notiz-oeffnen="${sicher(aufgabe.id)}"
             title="Zum Bearbeiten anklicken">
          <span class="notiz-symbol">${zeichen}</span>
          <span>${sicher(aufgabe.text)}</span>
        </div>
      </div>
    </div>`;
}

/* Ein ganztägiger eigener Termin in der Listenansicht.

   Er bekommt dieselbe Zeile wie eine freie Aufgabe, nur mit "Ganztägig"
   statt "Aufgabe" davor – die Stelle, wo sonst die Uhrzeit steht, bleibt
   sonst leer und das Auge sucht. */
function ganztagsTerminZeichnen(termin) {
  const zusatz = [termin.ort, termin.notiz].filter(Boolean).join(" · ");
  return `
    <div class="termin termin-eigen" data-termin-bearbeiten="${sicher(termin.id)}">
      <div class="termin-zeit">Ganztägig</div>
      <div class="termin-inhalt">
        <div class="termin-titel">${termin.wichtig ? "★ " : ""}${sicher(termin.titel)}</div>
        ${zusatz ? `<div class="termin-details">${sicher(zusatz)}</div>` : ""}
      </div>
    </div>`;
}

function notizZeichnen(termin) {
  const text = notizText(termin.id);

  if (offeneNotiz === termin.id) {
    return notizFeldZeichnen(termin.id, text);
  }

  if (text) {
    // Klassenliste ohne überflüssige Leerzeichen zusammensetzen.
    const klassen = "notiz"
      + (notizErledigt(termin.id) ? " notiz-erledigt" : "")
      + (istWichtig(termin.id) ? " notiz-wichtig-markiert" : "");
    return `
      <div class="${klassen}"
           data-notiz-oeffnen="${sicher(termin.id)}"
           title="Zum Bearbeiten anklicken">
        <span class="notiz-symbol">${istWichtig(termin.id) ? "★" : "✎"}</span>
        <span>${sicher(text)}</span>
      </div>`;
  }

  /* Ohne Kurznotiz steht hier nichts. Die Knöpfe zum Anlegen stehen in
     terminKnoepfeZeichnen() – siehe dort, warum sie getrennt sind. */
  return "";
}


/* Die beiden Knöpfe unter einem Termin im Bearbeiten-Modus.

   Früher stand hier ein einziger Knopf "+ Notiz". Der war falsch
   beschriftet: was er anlegte, war die Kurznotiz – und die steht mit einem
   Häkchen im To-do-Bereich. Man drückte also auf "Notiz" und bekam ein
   To-do. Seit es das Notizbuch gibt, sind das zwei verschiedene Dinge, und
   beide sollen von hier aus erreichbar sein:

     + Notiz   legt eine Notiz im Notizbuch an, gleich mit diesem Termin
               verknüpft. Langer Text, kein Häkchen.
     + To-do   legt die Kurznotiz an. Eine Zeile, abhakbar, steht im
               Kalenderkästchen und im To-do-Bereich.

   Sichtbar nur im Bearbeiten-Modus: zwei Knöpfe unter jedem der über
   hundert Termine machten die Liste sonst unlesbar. */
function terminKnoepfeZeichnen(termin) {
  if (!bearbeitenModus) return "";
  if (offeneNotiz === termin.id) return "";

  return `
    <div class="termin-knoepfe">
      <button type="button" class="notiz-neu"
              data-zettel-neu="termin:${sicher(termin.id)}">+ Notiz</button>
      ${notizText(termin.id) ? "" : `
        <button type="button" class="notiz-neu"
                data-notiz-oeffnen="${sicher(termin.id)}">+ To-do</button>`}
    </div>`;
}


/* Die Notizen aus dem Notizbuch, die an DIESEM Termin hängen.

   Modulweite Notizen bleiben hier bewusst draußen. Sie gelten zwar auch
   für diesen Termin – im Fenster eines angetippten Termins stehen sie
   deshalb mit dabei –, aber in einer Wochenliste erschiene dieselbe Notiz
   unter jeder einzelnen Vorlesung des Moduls. Bei zwanzig Terminen wäre
   das zwanzigmal derselbe Text. */
function terminZettelZeile(termin) {
  const passende = zettel.filter(
    z => z.verweise.indexOf("termin:" + termin.id) >= 0);
  if (passende.length === 0) return "";

  return passende.map(z => `
    <button type="button" class="termin-zettel-marke"
            data-zettel-oeffnen="${sicher(z.id)}">
      ${z.wichtig ? "★" : "✎"} ${sicher(zettelTitel(z))}
    </button>`).join("");
}

/* Schreibt unter die Auswahl, wann konkret erinnert wird.

   Ohne das steht dort "Am Vortag, 18:00" und man muss selbst nachrechnen,
   welcher Tag das ist. Die Zeile beantwortet genau die Frage, die man beim
   Einstellen hat: bekomme ich das rechtzeitig? */
function erinnerungHinweisSetzen() {
  const hinweis = document.getElementById("erinnerungHinweis");
  if (!hinweis) return;

  const auswahl = document.getElementById("aufgabeErinnerung");
  const datumsfeld = document.getElementById("aufgabeDatum");
  const vorgabe = auswahl ? auswahl.value : "";
  const datum = datumsfeld ? datumsfeld.value : "";

  const zeitpunkt = erinnerungZeitpunkt(vorgabe, datum);
  if (!zeitpunkt) { hinweis.textContent = ""; return; }

  const vergangen = zeitpunkt < new Date().toISOString().slice(0, 16);
  hinweis.textContent = vergangen
    ? "Dieser Zeitpunkt ist schon vorbei – es kommt keine Meldung mehr."
    : "Meldet sich " + zeitpunktLesbar(zeitpunkt) + ".";
  hinweis.classList.toggle("erinnerung-vorbei", vergangen);
}

/* Nach dem Öffnen den Cursor ins Textfeld setzen, und zwar ans Ende des
   vorhandenen Textes – nicht an den Anfang, wo man beim Weiterschreiben
   alles verschieben würde. */
function notizfeldAktivieren() {
  /* Die Hinweiszeile muss auf jede Änderung reagieren – an Datum wie an
     Auswahl. Die Zuhörer hängen hier und nicht in knoepfeVerbinden(),
     weil es die Felder dort noch gar nicht gibt: sie entstehen erst,
     wenn jemand ein To-do öffnet. */
  const auswahl = document.getElementById("aufgabeErinnerung");
  const datumsfeld = document.getElementById("aufgabeDatum");
  if (auswahl) auswahl.addEventListener("change", erinnerungHinweisSetzen);
  if (datumsfeld) datumsfeld.addEventListener("change", erinnerungHinweisSetzen);
  erinnerungHinweisSetzen();

  const feld = document.getElementById("notizFeld");
  if (!feld) return;
  feld.focus();
  if (typeof feld.setSelectionRange === "function") {
    feld.setSelectionRange(feld.value.length, feld.value.length);
  }
}

/* Ein einziger Zuhörer für alle Notiz-Knöpfe.

   Die Terminliste wird bei jeder Änderung komplett neu aufgebaut. Würde an
   jedem Knopf einzeln ein Zuhörer hängen, wäre er danach verschwunden.
   Deshalb hängt er am Kasten drumherum, der bestehen bleibt, und schaut bei
   jedem Klick nach, wo genau er gelandet ist. */
function notizKlick(ereignis) {
  const ziel = ereignis.target && ereignis.target.closest
    ? ereignis.target.closest("[data-notiz-oeffnen],[data-notiz-speichern],"
                              + "[data-notiz-abbrechen],[data-notiz-loeschen],"
                              + "[data-todo-haken],[data-aufgabe-neu],[data-termin],"
                              + "[data-termin-neu],[data-termin-bearbeiten],"
                              + "[data-zettel-neu],[data-zettel-oeffnen],"
                              + "[data-datum-schnell],[data-vergangene-umschalten]")
    : null;
  if (!ziel) return;

  // Vergangene Tage der laufenden Woche auf- oder zuklappen.
  const woche = ziel.getAttribute("data-vergangene-umschalten");
  if (woche) {
    vergangeneOffenFuer = vergangeneOffenFuer === woche ? "" : woche;
    wocheZeichnen();
    return;
  }

  /* Schnellwahl beim Fälligkeitsdatum. Ändert nur das Feld, speichert
     nicht – so kann man erst "Morgen" tippen und dann noch den Text
     fertig schreiben. Ein Neuzeichnen wäre hier sogar schädlich: es
     würde das Textfeld ersetzen und den halb getippten Text wegwerfen. */
  const schnell = ziel.getAttribute("data-datum-schnell");
  if (schnell) {
    const feld = document.getElementById("aufgabeDatum");
    if (feld) {
      feld.value = datumSchnellRechnen(schnell, tagesSchluessel(new Date()));
      erinnerungHinweisSetzen();
    }
    return;
  }

  /* Notizbuch: eine neue Notiz, schon mit dem Termin verknüpft, oder eine
     vorhandene öffnen.

     Die Knöpfe liegen innerhalb eines Termin-Kastens, der bei eigenen
     Terminen selbst ein data-termin-bearbeiten trägt. Das geht gut, weil
     closest() den NÄCHSTEN Treffer von innen nach außen liefert – und das
     ist der Knopf selbst. */
  const neueNotiz = ziel.getAttribute("data-zettel-neu");
  if (neueNotiz) { zettelFensterZeigen("", [neueNotiz]); return; }

  const zettelOeffnen = ziel.getAttribute("data-zettel-oeffnen");
  if (zettelOeffnen) { zettelFensterZeigen(zettelOeffnen); return; }

  // Eigener Termin: neu anlegen oder ändern.
  const neuerTermin = ziel.getAttribute("data-termin-neu");
  if (neuerTermin) { terminFormularZeigen("", neuerTermin); return; }

  const zuAendern = ziel.getAttribute("data-termin-bearbeiten");
  if (zuAendern) { terminFormularZeigen(zuAendern); return; }

  // Ein Kästchen im Kalenderraster: alles zeigen, was dort nicht hinpasst.
  const angetippterTermin = ziel.getAttribute("data-termin");
  if (angetippterTermin) {
    terminFensterZeigen(angetippterTermin);
    return;
  }

  /* Neue freie Aufgabe anlegen.

     Der Eintrag entsteht erst beim Speichern. Bis dahin merkt sich
     offeneNotiz nur "neu:2026-08-11" – so bleibt keine leere Aufgabe
     zurück, wenn man abbricht. */
  const neuerTag = ziel.getAttribute("data-aufgabe-neu");
  if (neuerTag) {
    offeneNotiz = "neu:" + neuerTag;
    wocheZeichnen();
    todosZeichnen();
    notizfeldAktivieren();
    return;
  }

  // Abhaken im To-do-Bereich – für beide Sorten.
  const zuHaken = ziel.getAttribute("data-todo-haken");
  if (zuHaken) {
    if (zuHaken.indexOf("eigen-") === 0) aufgabeErledigtUmschalten(zuHaken);
    else erledigtUmschalten(zuHaken);
    allesZeichnen();
    return;
  }

  const zuOeffnen = ziel.getAttribute("data-notiz-oeffnen");
  if (zuOeffnen) {
    offeneNotiz = zuOeffnen;
    // Beide Bereiche neu zeichnen: geöffnet werden kann aus dem Plan
    // heraus wie aus der To-do-Liste.
    wocheZeichnen();
    todosZeichnen();
    notizfeldAktivieren();
    return;
  }

  const zuSpeichern = ziel.getAttribute("data-notiz-speichern");
  if (zuSpeichern) {
    const feld = document.getElementById("notizFeld");
    const datumsfeld = document.getElementById("aufgabeDatum");
    const wichtigfeld = document.getElementById("notizWichtig");
    const erinnerungsfeld = document.getElementById("aufgabeErinnerung");
    const text = feld ? feld.value : "";
    const datum = datumsfeld ? datumsfeld.value : "";
    const wichtig = wichtigfeld ? Boolean(wichtigfeld.checked) : false;
    const erinnerung = erinnerungsfeld ? erinnerungsfeld.value : "";

    if (zuSpeichern.indexOf("neu:") === 0) {
      // Erst jetzt bekommt die Aufgabe eine Kennung.
      aufgabeSetzen(neueAufgabenKennung(), text,
                    datum || zuSpeichern.slice(4), wichtig, erinnerung);
    } else if (zuSpeichern.indexOf("eigen-") === 0) {
      aufgabeSetzen(zuSpeichern, text, datum, wichtig, erinnerung);
    } else {
      notizSetzen(zuSpeichern, text, wichtig);
    }

    offeneNotiz = null;
    allesZeichnen();
    return;
  }

  const zuLoeschen = ziel.getAttribute("data-notiz-loeschen");
  if (zuLoeschen) {
    if (zuLoeschen.indexOf("eigen-") === 0) aufgabeSetzen(zuLoeschen, "");
    else notizSetzen(zuLoeschen, "");
    offeneNotiz = null;
    allesZeichnen();
    return;
  }

  if (ziel.getAttribute("data-notiz-abbrechen")) {
    offeneNotiz = null;
    wocheZeichnen();
    todosZeichnen();
  }
}


/* --- Ansicht 2: Kalenderraster ------------------------------------------

   Tage als Spalten, die Uhrzeit läuft senkrecht. Ein Termin ist ein Kästchen,
   dessen Höhe seiner Dauer entspricht – so sieht man Lücken und lange Blöcke
   auf einen Blick.
   ---------------------------------------------------------------------- */

/* Wie viele Bildpunkte eine Stunde hoch ist.

   Auf dem Handy im Hochformat soll eine ganze Woche auf einen Blick
   draufpassen. Dein Plan läuft von 8 bis 19 Uhr, also 11 Stunden:

     58 px/Stunde -> 638 px Raster – zu hoch, man muss scrollen
     40 px/Stunde -> 440 px Raster + 42 px Kopfzeile = 482 px – passt

   Am großen Bildschirm darf es luftiger bleiben, dort stört die Höhe nicht. */
const STUNDE_HOEHE_GROSS = 58;
const STUNDE_HOEHE_HANDY = 40;

/* Dieselbe Grenze wie im style.css. Über matchMedia fragen wir den Browser,
   welche der beiden Größen gerade gilt – und lassen uns benachrichtigen,
   wenn sich das ändert (Gerät gedreht, Fenster verkleinert). */
const SCHMALER_BILDSCHIRM = window.matchMedia("(max-width: 520px)");

function stundenHoehe() {
  return SCHMALER_BILDSCHIRM.matches ? STUNDE_HOEHE_HANDY : STUNDE_HOEHE_GROSS;
}

// Zeigt der Kalender keine Termine, wird trotzdem dieser Bereich dargestellt –
// ein Raster ganz ohne Zeitachse wäre verwirrend.
const STANDARD_VON = 8;
const STANDARD_BIS = 19;

/* Rechnet "2026-08-10T08:45" in Minuten seit Mitternacht um: 525. Damit
   lässt sich einfach rechnen, wo ein Termin sitzt und wie hoch er ist. */
function minutenAmTag(zeitangabe) {
  return Number(zeitangabe.slice(11, 13)) * 60 + Number(zeitangabe.slice(14, 16));
}

/* Verteilt gleichzeitig laufende Termine auf nebeneinanderliegende Spalten.

   Ohne das läge bei dir donnerstags Personalmanagement unsichtbar unter
   Nachhaltigem Wirtschaften – beide gehen von 8 Uhr bis nach 13 Uhr.

   Vorgehen in zwei Schritten:
   1. Termine zu Gruppen zusammenfassen, die sich zeitlich berühren.
   2. Innerhalb einer Gruppe jeden Termin in die erste Spalte legen, die zu
      seiner Startzeit schon wieder frei ist.

   Zurück kommt je Termin, in welcher Spalte er liegt und wie viele Spalten
   die Gruppe insgesamt breit ist. */
function spaltenVerteilen(termine) {
  const sortiert = [...termine].sort((a, b) => a.start.localeCompare(b.start));
  const ergebnis = [];

  let gruppe = [];
  let gruppenEnde = "";

  function gruppeAbschliessen() {
    if (gruppe.length === 0) return;
    // Je Spalte merken wir uns, wann der bisher letzte Termin darin endet.
    const spaltenEnde = [];
    const zuordnung = [];
    for (const termin of gruppe) {
      let spalte = spaltenEnde.findIndex(ende => ende <= termin.start);
      if (spalte < 0) {
        spaltenEnde.push(termin.ende);
        spalte = spaltenEnde.length - 1;
      } else {
        spaltenEnde[spalte] = termin.ende;
      }
      zuordnung.push({ termin: termin, spalte: spalte });
    }
    for (const eintrag of zuordnung) {
      eintrag.spaltenGesamt = spaltenEnde.length;
      ergebnis.push(eintrag);
    }
    gruppe = [];
    gruppenEnde = "";
  }

  for (const termin of sortiert) {
    // Beginnt der Termin erst, nachdem alles Bisherige vorbei ist, fängt
    // eine neue Gruppe an.
    if (gruppe.length > 0 && termin.start >= gruppenEnde) gruppeAbschliessen();
    gruppe.push(termin);
    if (termin.ende > gruppenEnde) gruppenEnde = termin.ende;
  }
  gruppeAbschliessen();

  return ergebnis;
}

function kalenderBauen(tage) {
  const alleTermine = tage.reduce((liste, t) => liste.concat(t.termine), []);
  const stundeHoehe = stundenHoehe();
  const proMinute = stundeHoehe / 60;

  // Der gezeigte Zeitbereich richtet sich nach der Woche, bleibt aber
  // mindestens beim Standard – sonst springt das Raster jede Woche.
  let vonStunde = STANDARD_VON;
  let bisStunde = STANDARD_BIS;
  for (const termin of alleTermine) {
    vonStunde = Math.min(vonStunde, Math.floor(minutenAmTag(termin.start) / 60));
    bisStunde = Math.max(bisStunde, Math.ceil(minutenAmTag(termin.ende) / 60));
  }

  const startMinute = vonStunde * 60;
  const hoehe = (bisStunde - vonStunde) * stundeHoehe;

  // Die Zeitachse links.
  const stundenBeschriftung = [];
  const rasterLinien = [];
  for (let stunde = vonStunde; stunde <= bisStunde; stunde++) {
    const oben = (stunde - vonStunde) * stundeHoehe;
    if (stunde < bisStunde) {
      stundenBeschriftung.push(
        `<div class="kalender-stunde" style="top:${oben}px">
           ${String(stunde).padStart(2, "0")}:00
         </div>`);
    }
    rasterLinien.push(`<div class="kalender-linie" style="top:${oben}px"></div>`);
  }

  // Der rote Strich für "jetzt", aber nur wenn die aktuelle Woche gezeigt wird.
  const jetzt = new Date();
  const heuteSchluessel = tagesSchluessel(jetzt);
  const jetztMinute = jetzt.getHours() * 60 + jetzt.getMinutes();
  const jetztSichtbar = jetztMinute >= startMinute && jetztMinute <= bisStunde * 60;
  const jetztOben = (jetztMinute - startMinute) * proMinute;

  const kopfSpalten = tage.map(eintrag => `
    <div class="kalender-tagkopf ${eintrag.istHeute ? "kalender-tagkopf-heute" : ""}">
      <div class="kalender-tagname">${WOCHENTAGE[eintrag.datum.getDay()].slice(0, 2)}</div>
      <div class="kalender-tagzahl">${String(eintrag.datum.getDate()).padStart(2, "0")}.${String(eintrag.datum.getMonth() + 1).padStart(2, "0")}.</div>
    </div>`).join("");

  /* Die Ganztagszeile zwischen Kopf und Raster.

     Freie Aufgaben haben keine Uhrzeit – sie ins Zeitraster zu setzen wäre
     gelogen. Echte Kalender lösen das mit einem schmalen Streifen über dem
     Raster, und genau das ist das hier. Die Zeile erscheint nur, wenn in
     dieser Woche überhaupt eine Aufgabe liegt; sonst kostet sie nur Höhe. */
  const gibtAufgaben = tage.some(
    eintrag => eintrag.aufgaben.length > 0 || (eintrag.ganztags || []).length > 0);

  const ganztagsZeile = !gibtAufgaben ? "" : `
    <div class="kalender-ganztag-ecke">Ganztags</div>
    ${tage.map(eintrag => `
      <div class="kalender-ganztag ${eintrag.istHeute ? "kalender-ganztag-heute" : ""}">
        ${(eintrag.ganztags || []).map(termin => {
          /* Ort und Notiz standen bisher nur im Bearbeiten-Fenster. Ein
             ganztaegiger Termin hat aber keine Uhrzeit, die ihn erklaert -
             ohne Zusatz steht da nur ein Wort. Die zweite Zeile ist auch
             der Grund, warum der Streifen hoeher geworden ist. */
          const zusatz = [termin.ort, termin.notiz].filter(Boolean).join(" · ");
          return `
          <div class="kalender-aufgabe kalender-ganztagstermin${
                 termin.wichtig ? " kalender-aufgabe-wichtig" : ""}"
               data-termin-bearbeiten="${sicher(termin.id)}"
               title="${sicher(termin.titel + (zusatz ? " · " + zusatz : ""))}">
            <div class="kalender-ganztag-titel">${
              termin.wichtig ? "★ " : ""}${sicher(termin.titel)}</div>
            ${zusatz
              ? `<div class="kalender-ganztag-zusatz">${sicher(zusatz)}</div>`
              : ""}
          </div>`;
        }).join("")}
        ${eintrag.aufgaben.map(aufgabe => {
          const klassen = "kalender-aufgabe"
            + (aufgabe.erledigt ? " kalender-aufgabe-erledigt" : "")
            + (aufgabe.wichtig && !aufgabe.erledigt ? " kalender-aufgabe-wichtig" : "");
          return `
            <div class="${klassen}" data-notiz-oeffnen="${sicher(aufgabe.id)}"
                 title="${sicher(aufgabe.text)}">
              ${aufgabe.wichtig ? "★ " : ""}${aufgabe.erledigt ? "✓ " : ""}${sicher(aufgabe.text)}
            </div>`;
        }).join("")}
      </div>`).join("")}`;

  const tagSpalten = tage.map(eintrag => {
    const istHeuteSpalte = tagesSchluessel(eintrag.datum) === heuteSchluessel;

    const kaesten = spaltenVerteilen(eintrag.termine).map(platz => {
      const termin = platz.termin;
      const beginn = minutenAmTag(termin.start) - startMinute;
      const dauer = minutenAmTag(termin.ende) - minutenAmTag(termin.start);

      const oben = beginn * proMinute;
      // Zwei Bildpunkte Luft nach unten, damit sich Termine optisch nicht
      // berühren. Die Untergrenze ist so gewählt, dass immer zwei Zeilen
      // hineinpassen – Uhrzeit und Titel.
      const kastenHoehe = Math.max(dauer * proMinute - 2, 28);
      const breite = 100 / platz.spaltenGesamt;
      const links = platz.spalte * breite;

      // Die Uhrzeit steht in JEDEM Kästchen, und zwar zuerst.
      //
      // Das war zwischenzeitlich anders: die Idee war, dass man die Zeit an
      // der Zeitachse abliest und der Platz besser dem Raum gehört. Das
      // stimmt aber nicht – die Rasterlinien liegen im Stundentakt, und ob
      // ein Kästchen bei 9:45 oder 10:00 anfängt, sieht man daran eben nicht.
      //
      // Was darunter noch Platz findet, hängt von der Höhe ab.
      const knapp = kastenHoehe < stundeHoehe * 0.8;

      /* Wie viele Zeilen der Titel bekommen darf.

         Vorher war das nicht ausgerechnet, sondern dem "overflow: hidden"
         des Kastens überlassen. Das schnitt die letzte Zeile waagerecht
         durch – man sah eine halbe Buchstabenreihe und wusste nicht, ob da
         noch etwas kommt. Jetzt wird gezählt, was hineinpasst, und der Rest
         bekommt drei Pünktchen. Abgeschnitten wird also immer noch, aber
         sichtbar statt heimlich.

         Die Zahlen sind die im CSS gesetzten Zeilenhöhen. Sie stehen hier
         doppelt, weil JavaScript sie vor dem Zeichnen nicht messen kann. */
      const schmal = SCHMALER_BILDSCHIRM.matches;
      const polsterung = schmal ? 4 : 6;
      const zeitZeile = schmal ? 12 : 14;
      const titelZeile = schmal ? 12 : 15;
      const titelZeilen = Math.max(1, Math.floor(
        (kastenHoehe - polsterung - zeitZeile) / titelZeile));

      /* Die eigene Notiz zum Termin. Bisher stand im Kasten nur ein ✎ und
         man musste tippen, um zu sehen, was man sich notiert hat. Genau
         umgekehrt herum ist es richtig: die Notiz ist der einzige Teil des
         Kastens, den man selbst geschrieben hat. */
      /* Bei einem eigenen Termin steckt in "anmerkung" das Notizfeld aus
         dem Formular – also ebenfalls etwas Selbstgeschriebenes. Es
         gehoert deshalb in die Notizzeile und nicht in die Zeile fuer
         HWR-Hinweise, die als Erste weicht, wenn es eng wird. */
      const hwrHinweis = termin.eigen ? "" : termin.anmerkung;
      const notiz = [termin.eigen ? termin.anmerkung : "", notizText(termin.id)]
                    .filter(Boolean).join(" · ");

      const volltext = uhrzeit(termin.start) + "–" + uhrzeit(termin.ende)
                     + " " + termin.titel
                     + (termin.raum ? " · " + termin.raum : "")
                     + (termin.dozent ? " · " + termin.dozent : "")
                     + (termin.anmerkung ? " · " + termin.anmerkung : "")
                     + (notiz ? " · ✎ " + notiz : "");

      /* Antippbar. Auf dem Handy gibt es kein Überfahren mit der Maus, also
         auch keinen Hinweistext – ohne das hier bliebe ein knapper Kasten
         schlicht unlesbar. */
      return `
        <div class="kalender-termin ${termin.eigen ? "kalender-termin-eigen"
                                      : termin.arbeit ? "kalender-termin-arbeit"
                                      : (termin.anmerkung ? "kalender-termin-hinweis" : "")}"
             style="top:${oben}px; height:${kastenHoehe}px; left:${links}%; width:calc(${breite}% - 2px)"
             data-termin="${sicher(termin.id)}"
             role="button" tabindex="0"
             title="${sicher(volltext)}">
          <div class="kalender-termin-zeit">${uhrzeit(termin.start)}<span
               class="kalender-zeit-ende">–${uhrzeit(termin.ende)}</span>${
            notizText(termin.id)
              ? ` <span class="kalender-notizzeichen">${
                  istWichtig(termin.id) ? "★" : "✎"}</span>`
              : ""}</div>
          <div class="kalender-termin-titel"
               style="-webkit-line-clamp:${titelZeilen}">${sicher(termin.titel)}</div>
          ${knapp ? "" : `
            ${termin.raum ? `<div class="kalender-termin-zeile">${sicher(termin.raum)}</div>` : ""}
            ${hwrHinweis ? `<div class="kalender-termin-zeile"><strong>${sicher(hwrHinweis)}</strong></div>` : ""}`}
          ${notiz ? `<div class="kalender-termin-zeile kalender-termin-notiz${
              notizErledigt(termin.id) ? " kalender-termin-notiz-erledigt" : ""}">${
              sicher(notiz)}</div>` : ""}
        </div>`;
    }).join("");

    return `
      <div class="kalender-spalte ${istHeuteSpalte ? "kalender-spalte-heute" : ""}">
        ${rasterLinien.join("")}
        ${istHeuteSpalte && jetztSichtbar
          ? `<div class="kalender-jetzt" style="top:${jetztOben}px"></div>` : ""}
        ${kaesten}
      </div>`;
  }).join("");

  /* Die Mindestbreite einer Tagesspalte steht im CSS, weil sie vom
     Bildschirm abhängt: am großen Bildschirm 96 px, auf dem Handy 0 – dort
     sollen sich fünf Spalten die vorhandene Breite teilen, statt das Raster
     seitlich hinauszuschieben. */
  const spaltenVorlage =
    "var(--zeitspalte) repeat(" + tage.length + ", minmax(var(--tagspalte), 1fr))";

  return `
    <div class="kalender-rahmen">
      <div class="kalender" style="grid-template-columns:${spaltenVorlage}">
        <div class="kalender-ecke"></div>
        ${kopfSpalten}
        ${ganztagsZeile}
        <div class="kalender-zeitachse" style="height:${hoehe}px">
          ${stundenBeschriftung.join("")}
        </div>
        ${tagSpalten}
      </div>
    </div>`;
}


/* Ein angetipptes Kalenderkästchen ausführlich zeigen.

   Im Kalender ist der Platz begrenzt – ein 45-Minuten-Kästchen ist keine
   50 Bildpunkte hoch. Am Rechner half der Hinweistext beim Überfahren mit
   der Maus, auf dem Handy gibt es den nicht. Deshalb dieses Fenster: das
   Raster zeigt, was hineinpasst, ein Tippen zeigt alles. */
function terminFensterZeigen(kennung) {
  const termin = terminZuKennung(kennung);
  const fenster = document.getElementById("terminHintergrund");
  const inhalt = document.getElementById("terminInhalt");
  if (!termin || !fenster || !inhalt) return;

  /* Die Erinnerung steht am eigenen Termin, nicht an der Plandarstellung.
     eigeneTermineAlsPlan() lässt sie weg, weil ein HWR-Termin keine hat -
     hier wird sie deshalb beim Original nachgeschlagen. */
  const eigener = termin.eigen ? terminZuEigenerKennung(kennung) : null;

  const zeilen = [
    ["Wann", zeitpunktLesbar(termin.start) + "–" + uhrzeit(termin.ende)],
    ["Erinnerung", eigener && eigener.erinnerung
                     ? "🔔 " + erinnerungLesbar(eigener) : ""],
    ["Raum", termin.raum],
    ["Dozent", termin.dozent],
    ["Gruppe", termin.gruppe],
    ["Art", termin.art],
    ["Hinweis der HWR", termin.anmerkung],
    ["Woher", termin.arbeit
      ? "Praxisphase laut Uni-Plan. Arbeitszeit und Urlaub unter ⚙ → Uni-Plan." : ""],
    ["Korrigiert", termin.korrektur],
  ].filter(zeile => zeile[1]);

  inhalt.innerHTML = `
    <h3 class="termin-titel">${sicher(termin.titel)}</h3>
    <dl class="termin-liste">
      ${zeilen.map(zeile => `
        <dt>${sicher(zeile[0])}</dt>
        <dd>${sicher(zeile[1])}</dd>`).join("")}
    </dl>
    ${notizText(kennung) ? `
      <div class="termin-notiz">
        <div class="termin-notiz-kopf">${istWichtig(kennung) ? "★" : "✎"} Kurznotiz</div>
        ${sicher(notizText(kennung))}
      </div>` : ""}
    ${terminZettelZeichnen(termin, kennung)}
    <div class="filter-knoepfe">
      ${termin.eigen ? `
        <button type="button" class="knopf-schlicht knopf-betont"
                data-termin-bearbeiten="${sicher(kennung)}">
          Termin ändern
        </button>` : `
        <button type="button" class="knopf-schlicht" data-notiz-bearbeiten="${sicher(kennung)}">
          ${notizText(kennung) ? "Kurznotiz bearbeiten" : "Kurznotiz hinzufügen"}
        </button>`}
    </div>`;

  fenster.hidden = false;
}

/* Der Abschnitt "Notizen" im Terminfenster.

   Das ist die Rückrichtung der Verknüpfungen und der eigentliche Zweck der
   ganzen Sache: man tippt einen Termin an und sieht, was man sich dazu
   notiert hat. Ohne das müsste man wissen, dass es eine Notiz gibt, und
   sie im Notizbuch suchen – dann könnte man sie auch gleich weglassen.

   Gezeigt wird beides zusammen: was an genau diesem Termin hängt und was
   am Modul. Woran genau, steht an der Notiz selbst, damit man beim Ändern
   nicht daneben greift. */
/* Hier treffen zwei Sorten Notiz aufeinander, und das Fenster muss sie
   auseinanderhalten:

   - Die KURZNOTIZ hängt an genau diesem Termin, ist eine Zeile lang und
     steht im Kalenderkästchen. "11:25 Beginn".
   - Eine NOTIZ aus dem Notizbuch steht für sich, ist so lang wie man will
     und kann an mehreren Terminen gleichzeitig hängen.

   Deshalb heißt die erste im Terminfenster ausdrücklich "Kurznotiz". Beide
   "Notiz" zu nennen wäre bequem und genau einmal verwirrend gewesen -
   nämlich jedes Mal. */
function terminZettelZeichnen(termin, kennung) {
  const passende = zettelFuerTermin(kennung);
  const fach = termin.eigen ? "" : termin.titel;

  const knoepfe = `
    <div class="termin-zettel-knoepfe">
      <button type="button" class="knopf-schlicht"
              data-zettel-neu="termin:${sicher(kennung)}">
        + Notiz zu diesem Termin
      </button>
      ${fach ? `
        <button type="button" class="knopf-schlicht"
                data-zettel-neu="fach:${sicher(fach)}">
          + Notiz zum Modul
        </button>
        ${zettelFuerFach(fach).length > 0 ? `
          <button type="button" class="knopf-schlicht"
                  data-zettel-fach="${sicher(fach)}">
            Alle Notizen zum Modul
          </button>` : ""}` : ""}
    </div>`;

  if (passende.length === 0) return knoepfe;

  return `
    <div class="termin-zettel">
      <div class="termin-notiz-kopf">✎ Notizen</div>
      ${passende.map(z => `
        <button type="button" class="termin-zettel-zeile"
                data-zettel-oeffnen="${sicher(z.id)}">
          <strong>${z.wichtig ? "★ " : ""}${sicher(zettelTitel(z))}</strong>
          <small>${z.verweise.indexOf("termin:" + kennung) >= 0
                    ? "zu diesem Termin" : "zum Modul"}</small>
        </button>`).join("")}
    </div>
    ${knoepfe}`;
}


/* Vom Detailfenster aus zur Notiz springen.

   Statt das Textfeld hier noch einmal zu bauen, führt der Weg zurück in die
   Liste: dort steckt die Bearbeitung schon, samt Speichern, Löschen und
   Wichtig-Haken. Zwei Textfelder für dieselbe Sache wären zwei Stellen, an
   denen sich später ein Unterschied einschleicht. */
function zurNotizSpringen(kennung) {
  const fenster = document.getElementById("terminHintergrund");
  if (fenster) fenster.hidden = true;

  offeneNotiz = kennung;
  if (!bearbeitenModus) bearbeitenUmschalten();
  ansichtSetzen("liste");
  notizfeldAktivieren();

  // Ohne das steht das Feld womöglich außerhalb des Sichtfelds, und es
  // sieht aus, als wäre nichts passiert.
  const feld = document.getElementById("notizFeld");
  if (feld && feld.scrollIntoView) {
    feld.scrollIntoView({ block: "center" });
  }
}


/* -------------------------------------------------------------------------
   4b. Der Bereich "To-dos"

   Sammelt zwei Sorten von Dingen:

   1. deine eigenen Notizen – die kann man abhaken
   2. Hinweise, die schon im HWR-Plan stehen (ONLINE, Klausur, Exkursion)

   Beides sortiert nach Datum, Vergangenes getrennt vom Kommenden.
   ------------------------------------------------------------------------- */

/* Sucht zu einer Termin-Kennung den Termin. Notizen können auch an Terminen
   hängen, die inzwischen aus dem Zeitfenster gefallen sind – dann gibt es
   hier nichts, und der Eintrag wird als "Termin nicht mehr im Plan" gezeigt,
   statt still zu verschwinden. */
function terminZuKennung(kennung) {
  // Arbeit aus dem Uni-Plan: nicht gespeichert, sondern ausgerechnet.
  if (String(kennung).indexOf("arbeit-") === 0) {
    return arbeitsTermine().filter(t => t.id === kennung)[0] || null;
  }
  /* Erst die eigenen. Sie stehen nicht in STUNDENPLAN.termine, würden also
     sonst nicht gefunden – und damit hinge eine Notiz an einem eigenen
     Termin im Leeren. */
  const eigener = eigeneTermineAlsPlan().filter(t => t.id === kennung)[0];
  if (eigener) return eigener;
  const ganztags = eigeneTermine.filter(t => t.id === kennung)[0];
  if (ganztags) {
    return { id: ganztags.id, start: ganztags.start, ende: ganztags.ende,
             titel: ganztags.titel, raum: ganztags.ort || "", dozent: "",
             anmerkung: ganztags.notiz || "", art: "eigen", gruppe: "",
             eigen: true, ganztags: true };
  }
  return terminZuKennungAusPlan(kennung);
}

function terminZuKennungAusPlan(kennung) {
  return STUNDENPLAN.termine.filter(t => t.id === kennung)[0] || null;
}

/* Baut die Liste für den To-do-Bereich – aus beiden Quellen.

   Notizen hängen an einer Vorlesung und werden nach deren Anfangszeit
   einsortiert. Freie Aufgaben haben nur einen Tag; damit sie an diesem Tag
   oben stehen, bekommen sie beim Sortieren die Uhrzeit 00:00. */
function aufgabenSammeln() {
  const liste = [];

  for (const kennung of Object.keys(notizen)) {
    const termin = terminZuKennung(kennung);
    liste.push({
      kennung: kennung,
      art: "notiz",
      text: notizen[kennung].text,
      erledigt: notizen[kennung].erledigt,
      wichtig: Boolean(notizen[kennung].wichtig),
      termin: termin,
      // Ohne Termin ans Ende sortieren.
      start: termin ? termin.start : "9999",
    });
  }

  for (const aufgabe of aufgaben) {
    liste.push({
      kennung: aufgabe.id,
      art: "aufgabe",
      text: aufgabe.text,
      erledigt: aufgabe.erledigt,
      wichtig: Boolean(aufgabe.wichtig),
      termin: null,
      datum: aufgabe.datum,
      erinnerung: aufgabe.erinnerung || "",
      erinnerungVorgabe: aufgabe.erinnerungVorgabe || "",
      start: aufgabe.datum + "T00:00",
    });
  }

  /* Wichtiges zuerst, innerhalb dessen nach Datum.

     Erledigtes ist davon ausgenommen – es wandert ohnehin in den eigenen
     Abschnitt weiter unten. Ein abgehaktes "wichtig" soll nicht weiter
     oben stehen als eine offene normale Aufgabe. */
  liste.sort((a, b) => {
    if (a.wichtig !== b.wichtig) return a.wichtig ? -1 : 1;
    return a.start.localeCompare(b.start);
  });
  return liste;
}

/* Die Hinweise aus dem Stundenplan – zusammengefasst.

   Ohne Zusammenfassen stünde der 04.09. sechsmal untereinander mit
   "online": das sind sechs Zeitblöcke desselben Fachs am selben Tag. Für
   eine Übersicht ist das eine Zeile, von der ersten bis zur letzten Uhrzeit.
   Zusammengefasst wird nach Tag, Fach und Wortlaut des Hinweises. */
function hinweiseSammeln() {
  const nachSchluessel = new Map();

  for (const termin of sichtbareTermine()) {
    if (!termin.anmerkung) continue;
    const schluessel = termin.start.slice(0, 10) + "|" + termin.titel + "|" + termin.anmerkung;
    const vorhanden = nachSchluessel.get(schluessel);
    if (vorhanden) {
      if (termin.start < vorhanden.start) vorhanden.start = termin.start;
      if (termin.ende > vorhanden.ende) vorhanden.ende = termin.ende;
      vorhanden.anzahl += 1;
    } else {
      nachSchluessel.set(schluessel, {
        start: termin.start,
        ende: termin.ende,
        titel: termin.titel,
        anmerkung: termin.anmerkung,
        raum: termin.raum,
        anzahl: 1,
      });
    }
  }

  return [...nachSchluessel.values()].sort((a, b) => a.start.localeCompare(b.start));
}

/* Ist ein Zeitpunkt schon vorbei? Verglichen wird auf den Tag genau: ein
   Termin, der heute früher war, gilt nicht als vergangen – die Notiz dazu
   ist ja womöglich noch aktuell. */
function istVorbei(zeitangabe) {
  return zeitangabe.slice(0, 10) < tagesSchluessel(new Date());
}

/* Die Zeitgruppen, in denen offene Aufgaben stehen – in dieser Reihenfolge.

   Eine flache Liste nach Datum war ab einem Dutzend Einträgen unübersicht-
   lich: man sah nicht mehr, was drängt und was noch Zeit hat. Vor allem
   Überfälliges ging unter, weil es zwar oben stand, sich aber nicht vom
   Rest abhob.

   "ohne" fängt die Notizen ab, deren Termin nicht mehr im Plan steht – etwa
   weil das Semester weitergelaufen ist. Ohne dieses Fach hätten sie keins,
   und "keins" hieße hier: nicht angezeigt. */
const ZEITGRUPPEN = [
  { schluessel: "ueberfaellig", titel: "Überfällig", klasse: "todo-gruppe-dringend" },
  { schluessel: "heute",        titel: "Heute" },
  { schluessel: "morgen",       titel: "Morgen" },
  { schluessel: "woche",        titel: "Diese Woche" },
  { schluessel: "naechste",     titel: "Nächste Woche" },
  { schluessel: "spaeter",      titel: "Später" },
  { schluessel: "ohne",         titel: "Ohne Termin im Plan" },
];

/* In welches Fach ein Eintrag gehört.

   Wichtig ist hier vor allem eins: die Funktion gibt IMMER etwas zurück.
   Fiele ein Eintrag durch alle Bedingungen, wäre er in der Anzeige
   verschwunden – und niemand würde es merken, weil nichts fehlt, was man
   vermissen könnte. Deshalb ist "spaeter" nicht die letzte Bedingung,
   sondern der Rückfall. tests/test_gruppen.js prüft genau das. */
function zeitgruppeVon(eintrag, heuteDatum) {
  const bezug = eintrag.art === "aufgabe"
    ? eintrag.datum
    : (eintrag.termin ? eintrag.termin.start.slice(0, 10) : "");

  if (!bezug) return "ohne";

  const heute = tagesSchluessel(heuteDatum);
  if (bezug < heute) return "ueberfaellig";
  if (bezug === heute) return "heute";
  if (bezug === tagesSchluessel(tageDazu(heuteDatum, 1))) return "morgen";

  /* Die Woche endet sonntags. Wichtig ist, dass "diese Woche" von HEUTE aus
     gerechnet wird und nicht von Montag: am Freitag heißt "diese Woche"
     noch Samstag und Sonntag, nicht die vier Tage davor. Die liegen in
     "Überfällig". */
  const dieseWocheEnde = tagesSchluessel(tageDazu(montagDerWoche(heuteDatum), 6));
  if (bezug <= dieseWocheEnde) return "woche";

  const naechsteWocheEnde = tagesSchluessel(tageDazu(montagDerWoche(heuteDatum), 13));
  if (bezug <= naechsteWocheEnde) return "naechste";

  return "spaeter";
}

/* Verteilt die Einträge auf die Fächer. Gibt eine Zuordnung
   Fachschlüssel -> Liste zurück, leere Fächer eingeschlossen. */
function nachZeitgruppen(eintraege, heuteDatum) {
  const faecher = {};
  for (const gruppe of ZEITGRUPPEN) faecher[gruppe.schluessel] = [];

  for (const eintrag of eintraege) {
    const fach = zeitgruppeVon(eintrag, heuteDatum);

    /* Doppelter Boden.

       zeitgruppeVon() gibt immer eines der bekannten Fächer zurück - aber
       wenn dort jemals eine Bedingung dazukommt und der Rückfall verrutscht,
       stünde hier "faecher[undefined].push(...)". Das ist kein stiller
       Fehler, sondern ein Absturz mitten im Zeichnen: der ganze To-do-
       Bereich bliebe leer, samt der Aufgaben, die richtig zugeordnet waren.

       Lieber ein Eintrag an der falschen Stelle als zwanzig unsichtbare. */
    (faecher[fach] || faecher.spaeter).push(eintrag);
  }
  return faecher;
}

function todosZeichnen() {
  const alle = aufgabenSammeln();
  const offen = alle.filter(a => !a.erledigt);
  const erledigt = alle.filter(a => a.erledigt);
  const hinweise = hinweiseSammeln().filter(h => !istVorbei(h.start));

  const stuecke = [];

  // --- Deine Aufgaben ------------------------------------------------
  stuecke.push(`
    <div class="todo-kopfzeile">
      <h2 class="todo-ueberschrift">Meine To-dos</h2>
      ${offeneNotiz && offeneNotiz.indexOf("neu:") === 0 ? "" : `
        <button type="button" class="knopf-schlicht"
                data-aufgabe-neu="${sicher(tagesSchluessel(new Date()))}">
          + Neues To-do
        </button>`}
    </div>`);

  // Wird gerade eine neue Aufgabe geschrieben, steht das Feld ganz oben.
  if (offeneNotiz && offeneNotiz.indexOf("neu:") === 0) {
    stuecke.push(`
      <div class="todo todo-offen-bearbeiten">
        ${notizFeldZeichnen(offeneNotiz, "", offeneNotiz.slice(4))}
      </div>`);
  }

  if (alle.length === 0) {
    stuecke.push(`
      <p class="leer-text">
        Noch nichts eingetragen. Über <strong>+ Neues To-do</strong> legst du
        etwas an, das an keiner Vorlesung hängt. Zu einer bestimmten
        Vorlesung schreibst du im Plan über <strong>Bearbeiten</strong>.
      </p>`);
  } else if (offen.length === 0) {
    stuecke.push(`<p class="leer-text">Nichts offen. Alles abgehakt.</p>`);
  } else {
    const faecher = nachZeitgruppen(offen, new Date());

    for (const gruppe of ZEITGRUPPEN) {
      const drin = faecher[gruppe.schluessel];
      if (drin.length === 0) continue;          // leere Fächer bleiben stumm
      stuecke.push(`
        <h3 class="todo-gruppe ${gruppe.klasse || ""}">
          ${sicher(gruppe.titel)}
          <span class="todo-anzahl">${drin.length}</span>
        </h3>
        ${drin.map(e => aufgabeZeichnen(e, gruppe.schluessel)).join("")}`);
    }
  }

  /* Erledigtes ist zugeklappt.

     Es soll nicht weg sein - man will nachsehen können, was man schon
     abgehakt hat. Aber es soll auch nicht die halbe Seite füllen, während
     oben drei offene Sachen stehen. <details> merkt sich sein Auf und Zu
     nicht über das Neuzeichnen hinweg, deshalb die Variable daneben. */
  if (erledigt.length > 0) {
    stuecke.push(`
      <details class="todo-erledigt-fach" ${erledigteOffen ? "open" : ""}>
        <summary class="todo-gruppe">
          Erledigt <span class="todo-anzahl">${erledigt.length}</span>
        </summary>
        ${erledigt.map(e => aufgabeZeichnen(e, "erledigt")).join("")}
      </details>`);
  }

  // --- Hinweise aus dem Plan ------------------------------------------
  stuecke.push(`<h2 class="todo-ueberschrift">Hinweise aus dem Stundenplan</h2>`);

  if (hinweise.length === 0) {
    stuecke.push(`<p class="leer-text">
      Für die kommenden Wochen ist nichts vermerkt.
    </p>`);
  } else {
    stuecke.push(hinweise.map(hinweisZeichnen).join(""));
  }

  document.getElementById("todoInhalt").innerHTML = stuecke.join("");

  const fach = document.querySelector(".todo-erledigt-fach");
  if (fach) fach.addEventListener("toggle", () => { erledigteOffen = fach.open; });
}

/* Eine Zeile im To-do-Bereich.

   "fach" sagt, in welcher Zeitgruppe der Eintrag gerade steht. Gebraucht
   wird das nur fuer eine Kleinigkeit: unter der roten Ueberschrift
   "Ueberfaellig" muss nicht an jedem einzelnen Eintrag noch einmal "vorbei"
   stehen. Im Fach "Erledigt" dagegen schon - dort stehen auch Sachen, die
   rechtzeitig fertig wurden. */
function aufgabeZeichnen(aufgabe, fach) {
  const termin = aufgabe.termin;

  let wann;
  if (aufgabe.art === "aufgabe") {
    // Freie Aufgabe: nur ein Tag, keine Uhrzeit und kein Fach.
    wann = tagLesbar(aufgabe.datum);
  } else if (!termin) {
    wann = "Termin steht nicht mehr im Plan";
  } else {
    wann = zeitpunktLesbar(termin.start) + "–" + uhrzeit(termin.ende)
         + " · " + termin.titel;
  }

  const bezugstag = aufgabe.art === "aufgabe"
    ? aufgabe.datum
    : (termin ? termin.start : "");
  const vorbei = bezugstag && istVorbei(bezugstag) && !aufgabe.erledigt;
  // Unter "Ueberfaellig" waere die Marke eine Doppelung.
  const markeZeigen = vorbei && fach !== "ueberfaellig";

  // Wird der Eintrag gerade bearbeitet, steht hier das Textfeld statt der Zeile.
  if (offeneNotiz === aufgabe.kennung) {
    return `
      <div class="todo todo-offen-bearbeiten">
        <div class="todo-wann">${sicher(wann)}</div>
        ${notizFeldZeichnen(aufgabe.kennung, aufgabe.text,
                            aufgabe.art === "aufgabe" ? aufgabe.datum : undefined)}
      </div>`;
  }

  const klassen = "todo"
    + (aufgabe.erledigt ? " todo-erledigt" : "")
    + (vorbei ? " todo-vorbei" : "")
    + (aufgabe.wichtig && !aufgabe.erledigt ? " todo-wichtig" : "");

  return `
    <div class="${klassen}">
      <button type="button" class="todo-haken"
              data-todo-haken="${sicher(aufgabe.kennung)}"
              aria-label="${aufgabe.erledigt ? "Wieder öffnen" : "Als erledigt abhaken"}">
        ${aufgabe.erledigt ? "✓" : ""}
      </button>
      <div class="todo-inhalt" data-notiz-oeffnen="${sicher(aufgabe.kennung)}">
        <div class="todo-text">${
          aufgabe.wichtig ? `<span class="todo-stern">★</span>` : ""
        }${sicher(aufgabe.text)}</div>
        <div class="todo-wann">
          ${markeZeigen ? `<span class="todo-marke-vorbei">vorbei</span> ` : ""}${sicher(wann)}
        </div>
        ${aufgabe.erinnerung && !aufgabe.erledigt ? `
          <div class="todo-erinnerung">🔔 ${sicher(erinnerungLesbar(aufgabe))}</div>`
          : ""}
      </div>
    </div>`;
}

function hinweisZeichnen(hinweis) {
  const wann = zeitpunktLesbar(hinweis.start) + "–" + uhrzeit(hinweis.ende);
  return `
    <div class="todo todo-hinweis">
      <div class="todo-symbol">!</div>
      <div class="todo-inhalt">
        <div class="todo-text">${sicher(hinweis.anmerkung)}</div>
        <div class="todo-wann">
          ${sicher(wann + " · " + hinweis.titel
                   + (hinweis.raum ? " · " + hinweis.raum : ""))}
        </div>
      </div>
    </div>`;
}


/* -------------------------------------------------------------------------
   5. Änderungen

   abgleich.py hält fest, was sich seit dem letzten Abruf geändert hat.
   Hier wird dieser Verlauf angezeigt – und oben ein Hinweis, falls seit
   deinem letzten Besuch etwas dazugekommen ist.
   ------------------------------------------------------------------------- */

/* Änderungen an abgewählten Fächern gehen dich nichts an – die werden
   genauso ausgeblendet wie die Termine selbst. */
function sichtbareBloecke() {
  return (STUNDENPLAN.aenderungen || [])
    .map(block => ({
      erkanntAm: block.erkanntAm,
      eintraege: block.eintraege.filter(
        e => !fremdeGruppe(e.termin) && !abgewaehlteFaecher.has(e.termin.titel)),
    }))
    .filter(block => block.eintraege.length > 0);
}

/* Wie viele Änderungen du noch nicht gesehen hast. Solange es welche
   gibt, steht auf der Übersicht ein großer Hinweis. "Gesehen" dort oder
   ein Blick in die Liste setzt die Zahl zurück. */
function ungeseheneAenderungen() {
  return startAenderungen().length;
}

function aenderungenAlsGesehenMerken() {
  const bloecke = sichtbareBloecke();
  if (bloecke.length === 0) return;
  try {
    localStorage.setItem(SPEICHER_GESEHEN, bloecke[0].erkanntAm);
    // Alles bis hier gilt jetzt als erledigt, einzelne Haken braucht es nicht mehr.
    localStorage.removeItem(SPEICHER_ABGEHAKT);
  } catch (fehler) { /* egal */ }
}

/* Setzt die kleinen Zahlen an den Reitern. Sie sind der Grund, warum man den
   Plan gar nicht erst aufmachen muss, um zu sehen, ob etwas ansteht. */
function reiterZahlenSetzen() {
  const offeneNotizen = Object.keys(notizen)
    .filter(kennung => !notizen[kennung].erledigt).length;
  const offeneFreie = aufgaben.filter(a => !a.erledigt).length;
  zahlSetzen("todoZahl", offeneNotizen + offeneFreie);
  zahlSetzen("zettelZahl", zettel.length);
}

function zahlSetzen(elementKennung, anzahl) {
  const element = document.getElementById(elementKennung);
  if (!element) return;
  element.textContent = String(anzahl);
  element.hidden = anzahl === 0;
}

/* Die ganze Liste als Fenster. Öffnen hakt nichts ab – abgehakt wird
   bewusst, auf der Übersicht. */
function verlaufFensterZeigen() {
  const fenster = document.getElementById("verlaufHintergrund");
  if (!fenster) return;
  verlaufZeichnen();
  fenster.hidden = false;
}

/* Der Abschnitt in den Einstellungen. */
function aenderungenBereichZeichnen() {
  const bereich = document.getElementById("aenderungenBereich");
  if (!bereich) return;
  const anzahl = sichtbareBloecke().reduce((summe, b) => summe + b.eintraege.length, 0);
  bereich.innerHTML = `
    <h3 class="melden-titel">Änderungen am Stundenplan</h3>
    <p class="filter-hinweis">${anzahl === 0
      ? "Seit dem ersten Abruf hat sich nichts geändert."
      : anzahl + (anzahl === 1 ? " Änderung" : " Änderungen")
        + " seit dem ersten Abruf. Neue meldet die Übersicht mit einem Hinweis."}</p>
    ${anzahl ? `<button type="button" class="knopf-schlicht" id="verlaufOeffnen">Änderungen anzeigen</button>` : ""}`;
}

function verlaufZeichnen() {
  const bereich = document.getElementById("verlauf");
  const bloecke = sichtbareBloecke();

  if (bloecke.length === 0) {
    bereich.innerHTML = `<p class="leer-text">
      Seit dem ersten Abruf hat sich nichts geändert.
    </p>`;
    return;
  }

  bereich.innerHTML = bloecke.map(block => `
    <div class="verlauf-block">
      <div class="verlauf-zeitpunkt">
        erkannt am ${sicher(zeitpunktLesbar(block.erkanntAm))}
      </div>
      ${block.eintraege.map(eintragZeichnen).join("")}
    </div>`).join("");
}

function eintragZeichnen(eintrag) {
  const termin = eintrag.termin;
  const beschriftung = { neu: "neu", entfallen: "entfällt", geaendert: "geändert" };

  let detail;
  if (eintrag.typ === "geaendert") {
    detail = eintrag.felder.map(unterschied => {
      const istZeit = unterschied.feld === "Beginn" || unterschied.feld === "Ende";
      const vorher  = unterschied.vorher
        ? (istZeit ? zeitpunktLesbar(unterschied.vorher) : unterschied.vorher)
        : "(leer)";
      const nachher = unterschied.nachher
        ? (istZeit ? zeitpunktLesbar(unterschied.nachher) : unterschied.nachher)
        : "(leer)";
      return sicher(unterschied.feld + ": " + vorher + " → " + nachher);
    }).join("<br>");
  } else {
    detail = sicher([termin.raum, termin.dozent].filter(Boolean).join(" · "));
  }

  return `
    <div class="verlauf-eintrag">
      <span class="marke marke-${eintrag.typ}">${beschriftung[eintrag.typ]}</span>
      <span>
        <strong>${sicher(termin.titel)}</strong>
        – ${sicher(zeitpunktLesbar(termin.start) + "–" + uhrzeit(termin.ende))}
        ${detail ? `<div class="verlauf-detail">${detail}</div>` : ""}
      </span>
    </div>`;
}


/* -------------------------------------------------------------------------
   5a. Training

   Die Daten kommen aus Gymbro, der Trainings-App von Friedrich und seinen
   Freunden. Abgeholt werden sie von der Funktion "training" bei Supabase,
   denn dort liegt der Gymbro-Schlüssel. In die Seite darf er nicht, die
   ist öffentlich.

   Die Funktion antwortet nur Friedrichs Gerätecode. Alle anderen – die
   beiden Studierenden etwa – bekommen "nicht freigegeben", und für sie
   bleibt der Reiter unsichtbar. Sie sollen keinen Bereich sehen, der für
   sie nie etwas enthalten wird.

   Die Felder heißen so, wie Gymbro sie liefert (englisch). Welche Namen
   genau, ist nur für Trainings dokumentiert; für Gewicht, Bestleistungen
   und Pläne probieren die Lesehilfen unten mehrere übliche Namen durch.
   Fehlt ein Feld, bleibt die Stelle leer – sie darf nie "undefined" oder
   "NaN" anzeigen.
   ------------------------------------------------------------------------- */

const SPEICHER_TRAINING = "stundenplan.training";
const SPEICHER_TRAINING_ZUGANG = "stundenplan.trainingZugang";
const TRAINING_URL = "/functions/v1/training";

/* Wie oft von selbst nachgefragt wird. Ein Training dauert eine Stunde,
   öfter als alle zehn Minuten ändert sich dort nichts Sehenswertes. */
const TRAINING_FRISCH_MS = 10 * 60 * 1000;

/* Wer einmal "nicht freigegeben" bekommen hat, fragt erst am nächsten Tag
   wieder. So kostet ein fremdes Dashboard Gymbro keinen Aufruf pro Öffnen. */
const TRAINING_NEIN_MERKEN_MS = 24 * 60 * 60 * 1000;

// { abgerufenAm, daten } – der letzte gute Stand, auch ohne Netz lesbar.
let training = null;
// "", "laedt", "ok", "kein_schluessel", "schluessel_ungueltig", "fehler"
let trainingZustand = "";
let trainingFehlertext = "";
let trainingLaeuft = false;

/* Die Liste aller Trainings ist eine eigene Ansicht im Reiter. Offen
   bleibt sie, bis man zurücktippt – auch über ein Neuzeichnen hinweg. */
let trainingVerlaufOffen = false;
let trainingFilterTyp = "";
let trainingFilterMuskel = "";

function trainingLaden() {
  try {
    const roh = localStorage.getItem(SPEICHER_TRAINING);
    const wert = roh ? JSON.parse(roh) : null;
    return wert && typeof wert === "object" && wert.daten ? wert : null;
  } catch (fehler) {
    return null;
  }
}

/* { antwort: "ja" | "nein", am: Zeitstempel } */
function trainingZugang() {
  try {
    const roh = localStorage.getItem(SPEICHER_TRAINING_ZUGANG);
    const wert = roh ? JSON.parse(roh) : null;
    return wert && typeof wert === "object" ? wert : { antwort: "", am: 0 };
  } catch (fehler) {
    return { antwort: "", am: 0 };
  }
}

function trainingZugangMerken(antwort) {
  try {
    localStorage.setItem(SPEICHER_TRAINING_ZUGANG,
                         JSON.stringify({ antwort: antwort, am: Date.now() }));
  } catch (fehler) { /* dann wird eben beim nächsten Öffnen wieder gefragt */ }
}

/* Soll der Reiter zu sehen sein? Nur wenn die Funktion schon einmal "ja"
   gesagt hat. Beim allerersten Öffnen ist er also kurz unsichtbar, bis
   die Antwort da ist – das ist besser als ein Reiter, der bei anderen
   erst auftaucht und dann wieder verschwindet. */
function trainingSichtbar() {
  return trainingZugang().antwort === "ja";
}

/* Fragt bei der Funktion nach. zwingen: auch wenn der Stand frisch ist
   (der ↻-Knopf im Bereich). */
function trainingAbholen(zwingen) {
  if (trainingLaeuft) return;
  if (typeof Abgleich === "undefined" || !Abgleich.code()) return;
  if (typeof ABGLEICH_URL === "undefined" || typeof fetch !== "function") return;

  const zugang = trainingZugang();
  if (!zwingen && zugang.antwort === "nein"
      && Date.now() - zugang.am < TRAINING_NEIN_MERKEN_MS) return;
  if (!zwingen && training && trainingZustand === "ok"
      && Date.now() - Date.parse(training.abgerufenAm) < TRAINING_FRISCH_MS) return;

  trainingLaeuft = true;
  if (trainingZustand !== "ok") trainingZustand = "laedt";
  trainingZeichnen();

  fetch(ABGLEICH_URL + TRAINING_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: Abgleich.code() }),
  })
    .then(a => a.json().then(inhalt => ({ status: a.status, inhalt })))
    .then(({ status, inhalt }) => {
      if (status === 403) {
        trainingZugangMerken("nein");
        trainingZustand = "";
        return;
      }
      trainingZugangMerken("ja");
      trainingZustand = inhalt.zustand === "ok" ? "ok" : (inhalt.zustand || "fehler");
      trainingFehlertext = inhalt.text || (inhalt.status ? "Gymbro antwortet " + inhalt.status : "");
      if (inhalt.zustand === "ok") {
        training = { abgerufenAm: inhalt.abgerufenAm, daten: inhalt.daten || {} };
        try { localStorage.setItem(SPEICHER_TRAINING, JSON.stringify(training)); }
        catch (fehler) { /* dann eben nur bis zum Neuladen */ }
      }
    })
    .catch(fehler => {
      // Kein Netz: der alte Stand bleibt stehen, nur mit Hinweis.
      trainingZustand = "fehler";
      trainingFehlertext = "Keine Verbindung.";
    })
    .then(() => {
      trainingLaeuft = false;
      reiterSichtbarkeitSetzen();
      trainingZeichnen();
      startZeichnen();
    });
}

function reiterSichtbarkeitSetzen() {
  const knopf = document.querySelector('[data-seite="training"]');
  if (knopf) knopf.hidden = !trainingSichtbar();
  // Wer auf dem Reiter stand, als der Zugang entzogen wurde: zurück.
  if (seite === "training" && !trainingSichtbar()) seiteSetzen("start");
}


/* --- Lesehilfen ------------------------------------------------------- */

/* Das erste Feld aus der Liste, das es gibt. */
function gymbroFeld(eintrag, namen) {
  if (!eintrag || typeof eintrag !== "object") return undefined;
  for (const name of namen) {
    if (eintrag[name] !== undefined && eintrag[name] !== null && eintrag[name] !== "") {
      return eintrag[name];
    }
  }
  return undefined;
}

function gymbroZahl(wert) {
  const n = typeof wert === "number" ? wert : parseFloat(String(wert || "").replace(",", "."));
  return isFinite(n) ? n : null;
}

/* Datum aus Gymbro: entweder mit Uhrzeit in UTC ("…T17:30:00.000Z") oder
   nur ein Tag ("2026-08-02"). Ein reiner Tag wird als Mittag gelesen –
   um Mitternacht UTC wäre es in Berlin je nach Jahreszeit schon der
   nächste Tag oder noch der vorige. */
function gymbroDatum(wert) {
  if (!wert) return null;
  const text = String(wert);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(text + "T12:00:00") : new Date(text);
  return isNaN(d.getTime()) ? null : d;
}

/* Die Liste eines Abschnitts, nur mit echten Einträgen. Ein null
   mittendrin – kommt bei JSON aus fremder Hand vor – ließ sonst die ganze
   Auswertung abstürzen, und der Bereich bliebe leer. */
function gymbroListe(daten, name) {
  const roh = daten && Array.isArray(daten[name]) ? daten[name] : [];
  return roh.filter(e => e && typeof e === "object");
}

function gymbroEinheiten(daten) {
  /* Gymbro schickt die Gyms als eigene Liste mit Namen; am Training steht
     nur die Kennung ("dns_potsdam"). Hier wird nachgeschlagen, damit
     "DNS Potsdam" dasteht. */
  const gymNamen = {};
  for (const g of gymbroListe(daten, "gyms")) {
    if (g.id) gymNamen[g.id] = g.label || g.id;
  }
  return gymbroListe(daten, "sessions")
    .map(s => ({
      kennung: String(s.id || s.externalId || ""),
      notiz: typeof s.notes === "string" ? s.notes : "",
      partner: Array.isArray(s.partners)
        ? s.partners.map(p => (p && typeof p === "object" ? p.name : p)).filter(Boolean).map(String)
        : [],
      gymName: gymNamen[s.gymId] || s.customGym || "",
      start: gymbroDatum(gymbroFeld(s, ["arrivedAt", "startedAt", "start", "date"])),
      ende: gymbroDatum(gymbroFeld(s, ["leftAt", "endedAt", "end"])),
      typ: gymbroFeld(s, ["trainingType", "type"]) || "",
      muskeln: Array.isArray(s.muscleGroups) ? s.muscleGroups.map(String) : [],
      bewertung: gymbroZahl(gymbroFeld(s, ["rating"])),
      gym: gymbroFeld(s, ["gymName", "gymId", "gym"]) || "",
    }))
    .filter(s => s.start)
    .sort((a, b) => b.start - a.start);
}

function gymbroGewichte(daten) {
  return gymbroListe(daten, "weights")
    .map(w => ({
      datum: gymbroDatum(gymbroFeld(w, ["date", "measuredAt", "recordedAt", "createdAt"])),
      wert: gymbroZahl(gymbroFeld(w, ["weight", "weightKg", "kg", "value"])),
    }))
    .filter(w => w.datum && w.wert !== null)
    .sort((a, b) => a.datum - b.datum);
}

function gymbroBestleistungen(daten) {
  return gymbroListe(daten, "prs")
    .map(p => ({
      uebung: gymbroFeld(p, ["exercise", "exerciseName", "name", "lift", "title"]) || "",
      wert: gymbroZahl(gymbroFeld(p, ["weight", "weightKg", "kg", "value"])),
      wdh: gymbroZahl(gymbroFeld(p, ["reps", "repetitions"])),
      datum: gymbroDatum(gymbroFeld(p, ["date", "achievedAt", "createdAt"])),
    }))
    .filter(p => p.uebung)
    .sort((a, b) => (b.datum || 0) - (a.datum || 0));
}

function gymbroPlaene(daten) {
  return gymbroListe(daten, "plans")
    .map(p => ({
      name: gymbroFeld(p, ["name", "title"]) || "",
      aktiv: Boolean(gymbroFeld(p, ["active", "isActive", "current"])),
      beschreibung: gymbroFeld(p, ["description", "notes"]) || "",
    }))
    .filter(p => p.name);
}

function gymbroAbsagen(daten) {
  return gymbroListe(daten, "cancellations")
    .map(c => ({
      datum: gymbroDatum(gymbroFeld(c, ["date", "cancelledAt", "createdAt"])),
      ruhetag: Boolean(c.isRestDay),
      grund: gymbroFeld(c, ["reason", "note"]) || "",
    }))
    .filter(c => c.datum)
    .sort((a, b) => b.datum - a.datum);
}

/* Gymbro schreibt englisch, das Dashboard spricht deutsch. Was hier
   fehlt, erscheint so, wie es kommt – nur mit großem Anfangsbuchstaben. */
const TRAINING_WOERTER = {
  push: "Push", pull: "Pull", legs: "Beine", run: "Laufen",
  lower_back: "Unterer Rücken", upper: "Oberkörper",
  lower: "Unterkörper", fullbody: "Ganzkörper", full_body: "Ganzkörper",
  cardio: "Cardio", arms: "Arme",
  chest: "Brust", shoulders: "Schultern", back: "Rücken", biceps: "Bizeps",
  triceps: "Trizeps", quads: "Quadrizeps", quadriceps: "Quadrizeps",
  hamstrings: "Beinbeuger", glutes: "Po", calves: "Waden", abs: "Bauch",
  core: "Rumpf", forearms: "Unterarme", traps: "Nacken", lats: "Latissimus",
  bench_press: "Bankdrücken", squat: "Kniebeuge", deadlift: "Kreuzheben",
  overhead_press: "Schulterdrücken", pull_up: "Klimmzug", pullup: "Klimmzug",
  row: "Rudern", barbell_row: "Langhantelrudern", dip: "Dips", dips: "Dips",
  leg_press: "Beinpresse", hip_thrust: "Hip Thrust", lat_pulldown: "Latziehen",
};

function trainingWort(wort) {
  const text = String(wort || "");
  const schluessel = text.toLowerCase().trim().replace(/[\s-]+/g, "_");
  const uebersetzt = TRAINING_WOERTER[schluessel];
  if (uebersetzt) return uebersetzt;
  // "incline_bench" → "Incline bench"
  const lesbar = text.replace(/_/g, " ");
  return lesbar.charAt(0).toUpperCase() + lesbar.slice(1);
}

/* Ein Datum in die Schreibweise des Stundenplans, "2026-09-24T17:30",
   in Ortszeit. Dann gehen zeitpunktLesbar() und Co. auch für Gymbro. */
function alsZeitangabe(datum) {
  return tagesSchluessel(datum) + "T"
       + String(datum.getHours()).padStart(2, "0") + ":"
       + String(datum.getMinutes()).padStart(2, "0");
}

function kgLesbar(wert) {
  if (wert === null || wert === undefined) return "";
  return String(Math.round(wert * 10) / 10).replace(".", ",") + " kg";
}

/* "vor 3 Tagen", nach Kalendertagen gezählt: ein Training gestern Abend
   ist heute Morgen "gestern", nicht "vor 12 Stunden". */
function tageHer(datum, jetzt) {
  const tage = Math.round((alsDatum(tagesSchluessel(jetzt) + "T12:00")
                          - alsDatum(tagesSchluessel(datum) + "T12:00")) / 86400000);
  if (tage <= 0) return "heute";
  if (tage === 1) return "gestern";
  return "vor " + tage + " Tagen";
}


/* --- Auswerten -------------------------------------------------------- */

/* Alles, was die Anzeige braucht, an einer Stelle ausgerechnet. Getrennt
   vom Zeichnen, damit die Tests es mit festem Datum prüfen können. */
function trainingAuswerten(daten, jetzt) {
  const alle = gymbroEinheiten(daten);
  const montag = montagDerWoche(jetzt);
  const dieseWoche = alle.filter(s => s.start >= montag).length;
  const monatsanfang = new Date(jetzt.getFullYear(), jetzt.getMonth(), 1);
  const diesenMonat = alle.filter(s => s.start >= monatsanfang).length;

  /* Die letzten acht Wochen, älteste zuerst, für das Balkenbild. */
  const wochen = [];
  for (let i = 7; i >= 0; i--) {
    const von = tageDazu(montag, -7 * i);
    const bis = tageDazu(von, 7);
    wochen.push({ montag: von, anzahl: alle.filter(s => s.start >= von && s.start < bis).length });
  }

  /* Serie: Wochen in Folge mit mindestens einem Training. Die laufende
     Woche zählt mit, wenn schon trainiert wurde; wenn nicht, bricht sie
     die Serie noch nicht – sie ist ja nicht vorbei. */
  let serie = 0;
  let pruefMontag = dieseWoche > 0 ? montag : tageDazu(montag, -7);
  for (;;) {
    const bis = tageDazu(pruefMontag, 7);
    if (!alle.some(s => s.start >= pruefMontag && s.start < bis)) break;
    serie++;
    pruefMontag = tageDazu(pruefMontag, -7);
    if (serie > 520) break;
  }

  /* Wann welche Muskelgruppe zuletzt dran war. Am längsten her zuerst –
     das ist die Frage vor dem nächsten Training. */
  const zuletzt = new Map();
  for (const s of alle) {
    for (const m of s.muskeln) {
      if (!zuletzt.has(m)) zuletzt.set(m, s.start);
    }
  }
  const muskeln = [...zuletzt.entries()]
    .map(([name, datum]) => ({ name, datum }))
    .sort((a, b) => a.datum - b.datum);

  /* Dauer: nur, wo beides da ist und es plausibel ist (unter 6 Stunden;
     wer vergisst, sich auszuchecken, soll den Schnitt nicht verderben). */
  const vor30 = tageDazu(jetzt, -30);
  const dauern = alle
    .filter(s => s.start >= vor30 && s.ende && s.ende > s.start)
    .map(s => (s.ende - s.start) / 60000)
    .filter(min => min < 360);
  const dauerSchnitt = dauern.length
    ? Math.round(dauern.reduce((a, b) => a + b, 0) / dauern.length) : null;

  /* Der Trend: Trainings pro Woche in den letzten vier abgeschlossenen
     Wochen gegen die vier davor. Die laufende Woche zählt nicht mit – am
     Montag stünde sonst jede Woche "weniger". Unter einer Viertel-Einheit
     pro Woche Unterschied heißt es "gleich", sonst schwankt die Aussage
     mit jedem einzelnen Training hin und her. */
  const proWoche = versatz => {
    const von = tageDazu(montag, -7 * versatz);
    const bis = tageDazu(von, 7);
    return alle.filter(s => s.start >= von && s.start < bis).length;
  };
  const schnitt = (von, bis) => {
    let summe = 0;
    for (let i = von; i <= bis; i++) summe += proWoche(i);
    return summe / (bis - von + 1);
  };
  const trendJetzt = schnitt(1, 4);
  const trendVorher = schnitt(5, 8);
  const trend = {
    jetzt: trendJetzt,
    vorher: trendVorher,
    richtung: trendJetzt === 0 && trendVorher === 0 ? "keine"
      : Math.abs(trendJetzt - trendVorher) < 0.25 ? "gleich"
      : trendJetzt > trendVorher ? "hoch" : "runter",
  };

  const gewicht = gymbroGewichte(daten);
  const aktuell = gewicht.length ? gewicht[gewicht.length - 1] : null;
  // Vergleich mit dem letzten Wert, der mindestens 30 Tage älter ist.
  let vorher = null;
  if (aktuell) {
    const grenze = tageDazu(aktuell.datum, -30);
    for (const w of gewicht) if (w.datum <= grenze) vorher = w;
  }

  return {
    anzahl: alle.length,
    letzte: alle[0] || null,
    erstes: alle[alle.length - 1] || null,
    dieseWoche, diesenMonat, wochen, serie, muskeln, dauerSchnitt, trend,
    gewicht: gewicht.filter(w => w.datum >= tageDazu(jetzt, -90)),
    gewichtAktuell: aktuell,
    gewichtVorher: vorher,
    bestleistungen: gymbroBestleistungen(daten).slice(0, 5),
    plaene: gymbroPlaene(daten),
    absagenMonat: gymbroAbsagen(daten).filter(c => c.datum >= monatsanfang),
  };
}


/* --- Zeichnen --------------------------------------------------------- */

/* Eine kleine Linie für den Gewichtsverlauf, ohne Bibliothek: ein SVG mit
   einem einzigen Pfad. Die Höhe spannt sich zwischen kleinstem und
   größtem Wert, sonst sähe ein Kilo Unterschied aus wie gar keiner. */
function gewichtsLinie(punkte) {
  if (punkte.length < 2) return "";
  const breite = 300, hoehe = 60, rand = 4;
  const zeiten = punkte.map(p => p.datum.getTime());
  const werte = punkte.map(p => p.wert);
  const tMin = Math.min(...zeiten), tMax = Math.max(...zeiten);
  const wMin = Math.min(...werte), wMax = Math.max(...werte);
  const x = t => rand + (tMax === tMin ? 0 : (t - tMin) / (tMax - tMin)) * (breite - 2 * rand);
  const y = w => rand + (wMax === wMin ? 0.5 : 1 - (w - wMin) / (wMax - wMin)) * (hoehe - 2 * rand);
  const pfad = punkte.map((p, i) =>
    (i ? "L" : "M") + x(zeiten[i]).toFixed(1) + " " + y(werte[i]).toFixed(1)).join(" ");
  return `
    <svg class="training-linie" viewBox="0 0 ${breite} ${hoehe}" preserveAspectRatio="none"
         role="img" aria-label="Gewichtsverlauf der letzten 90 Tage">
      <path d="${pfad}" fill="none" stroke="currentColor" stroke-width="2"
            vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>
    </svg>`;
}

function einheitBeschreiben(s) {
  const teile = [];
  if (s.typ) teile.push(trainingWort(s.typ));
  if (s.ende && s.ende > s.start && (s.ende - s.start) < 6 * 3600000) {
    teile.push(Math.round((s.ende - s.start) / 60000) + " Min.");
  }
  if (s.bewertung !== null) teile.push("★ " + s.bewertung + "/10");
  return teile.join(" · ");
}

/* Was statt der Daten dasteht, solange es keine gibt. Die Texte sagen,
   was zu tun ist – ein leerer Bereich sähe aus wie "keine Trainings". */
function trainingHinweis() {
  if (trainingZustand === "kein_schluessel") {
    return `<p class="training-hinweis">
      Der Gymbro-Schlüssel ist noch nicht eingetragen. In Supabase unter
      <strong>Edge Functions → Secrets</strong> ein Secret
      <code>GYMBRO_TOKEN</code> anlegen, als Wert den Schlüssel aus Gymbro.
      Danach hier auf ↻ tippen.</p>`;
  }
  if (trainingZustand === "schluessel_ungueltig") {
    return `<p class="training-hinweis">
      Gymbro lehnt den Schlüssel ab – vermutlich widerrufen. In Gymbro einen
      neuen anlegen und in Supabase das Secret <code>GYMBRO_TOKEN</code>
      ersetzen.</p>`;
  }
  if (trainingZustand === "fehler" || trainingZustand === "gymbro_fehler"
      || trainingZustand === "gymbro_nicht_erreichbar") {
    return `<p class="training-hinweis">
      Gymbro gerade nicht erreichbar${trainingFehlertext ? " (" + sicher(trainingFehlertext) + ")" : ""}.
      ${training ? "Unten steht der letzte Stand." : ""}</p>`;
  }
  if (trainingZustand === "laedt" && !training) {
    return `<p class="leer-text">Wird bei Gymbro abgeholt …</p>`;
  }
  return "";
}

function trainingZeichnen() {
  const bereich = document.getElementById("trainingInhalt");
  if (!bereich) return;
  const jetzt = new Date();
  const stuecke = [];

  const abgerufen = training ? gymbroDatum(training.abgerufenAm) : null;
  const stand = abgerufen ? "Stand " + zeitpunktLesbar(alsZeitangabe(abgerufen)) : "";
  stuecke.push(`
    <div class="training-kopf">
      <span class="training-stand">${sicher(stand)}${trainingLaeuft ? " · wird aktualisiert …" : ""}</span>
      <button type="button" class="knopf-schlicht start-klein" data-training-neu
              ${trainingLaeuft ? "disabled" : ""}>↻ Aktualisieren</button>
    </div>`);
  stuecke.push(trainingHinweis());

  if (!training) {
    bereich.innerHTML = stuecke.join("");
    return;
  }

  if (trainingVerlaufOffen) {
    bereich.innerHTML = trainingVerlaufZeichnen(training.daten, jetzt);
    return;
  }

  const a = trainingAuswerten(training.daten, jetzt);

  if (a.anzahl > 0) {
    const erstes = a.erstes.start;
    stuecke.push(`<button type="button" class="training-alle" data-training-verlauf>
      <span><strong>Alle Trainings</strong>
        <span class="training-leise training-block">${a.anzahl} seit ${
          sicher(datumKurz(erstes) + erstes.getFullYear())}</span></span>
      <span class="training-alle-pfeil">›</span>
    </button>`);
  }

  if (a.anzahl === 0) {
    stuecke.push(`<p class="leer-text">In Gymbro ist noch kein Training eingetragen.</p>`);
  }

  // --- Zahlen ---------------------------------------------------------
  stuecke.push(`<div class="start-zahlen">
    <div class="start-zahl"><span class="start-zahl-wert">${a.dieseWoche}</span>
      <span class="start-zahl-name">diese Woche</span></div>
    <div class="start-zahl"><span class="start-zahl-wert">${a.diesenMonat}</span>
      <span class="start-zahl-name">diesen Monat</span></div>
    <div class="start-zahl"><span class="start-zahl-wert">${a.serie}</span>
      <span class="start-zahl-name">${a.serie === 1 ? "Woche" : "Wochen"} in Folge</span></div>
    <div class="start-zahl"><span class="start-zahl-wert">${
      a.dauerSchnitt === null ? "–" : a.dauerSchnitt}</span>
      <span class="start-zahl-name">Min. im Schnitt (30 Tage)</span></div>
  </div>`);

  const karten = [];

  // --- Letztes Training -----------------------------------------------
  if (a.letzte) {
    const s = a.letzte;
    karten.push(trainingKarte("Letztes Training", `
      <div class="training-gross">${sicher(tageHer(s.start, jetzt))}
        <span class="training-leise">${sicher(zeitpunktLesbar(alsZeitangabe(s.start)))}</span></div>
      <div class="training-zeile">${sicher(einheitBeschreiben(s))}</div>
      ${s.gymName ? `<div class="training-leise">${sicher(s.gymName)}</div>` : ""}
      ${s.muskeln.length ? `<div class="training-chips">${
        s.muskeln.map(m => `<span class="training-chip">${sicher(trainingWort(m))}</span>`).join("")
      }</div>` : ""}`));
  }

  // --- Acht Wochen als Balken ------------------------------------------
  const hoechste = Math.max(1, ...a.wochen.map(w => w.anzahl));
  karten.push(trainingKarte("Die letzten 8 Wochen", `
    <div class="training-balken">${a.wochen.map((w, i) => `
      <div class="training-balken-spalte" title="KW ${kalenderwoche(w.montag)}: ${w.anzahl}">
        <span class="training-balken-zahl">${w.anzahl || ""}</span>
        <span class="training-balken-saeule${i === a.wochen.length - 1 ? " training-balken-jetzt" : ""}"
              style="height:${Math.round(w.anzahl / hoechste * 100)}%"></span>
        <span class="training-balken-name">${kalenderwoche(w.montag)}</span>
      </div>`).join("")}
    </div>
    <div class="training-leise training-balken-fuss">Trainings pro Kalenderwoche</div>`));

  // --- Muskelgruppen ---------------------------------------------------
  if (a.muskeln.length) {
    karten.push(trainingKarte("Muskelgruppen zuletzt", a.muskeln.map(m => `
      <div class="training-reihe">
        <span>${sicher(trainingWort(m.name))}</span>
        <span class="training-leise">${sicher(tageHer(m.datum, jetzt))}</span>
      </div>`).join("")));
  }

  // --- Gewicht ---------------------------------------------------------
  if (a.gewichtAktuell) {
    const diff = a.gewichtVorher ? a.gewichtAktuell.wert - a.gewichtVorher.wert : null;
    const diffText = diff === null ? ""
      : (diff > 0 ? "+" : diff < 0 ? "−" : "±") + kgLesbar(Math.abs(diff))
        + " seit " + datumKurz(a.gewichtVorher.datum);
    karten.push(trainingKarte("Gewicht", `
      <div class="training-gross">${sicher(kgLesbar(a.gewichtAktuell.wert))}
        <span class="training-leise">${sicher(tageHer(a.gewichtAktuell.datum, jetzt))}</span></div>
      ${diffText ? `<div class="training-zeile">${sicher(diffText)}</div>` : ""}
      ${gewichtsLinie(a.gewicht)}`));
  }

  // --- Bestleistungen --------------------------------------------------
  if (a.bestleistungen.length) {
    karten.push(trainingKarte("Neueste Bestleistungen", a.bestleistungen.map(p => `
      <div class="training-reihe">
        <span>${sicher(trainingWort(p.uebung))}</span>
        <span><strong>${sicher([kgLesbar(p.wert), p.wdh ? p.wdh + " Wdh." : ""]
                                .filter(Boolean).join(" × "))}</strong>
          ${p.datum ? `<span class="training-leise">${sicher(datumKurz(p.datum))}</span>` : ""}</span>
      </div>`).join("")));
  }

  // --- Pläne und Absagen -----------------------------------------------
  if (a.plaene.length) {
    const sortiert = a.plaene.slice().sort((x, y) => Number(y.aktiv) - Number(x.aktiv));
    karten.push(trainingKarte(sortiert.length === 1 ? "Plan" : "Pläne", sortiert.map(p => `
      <div class="training-reihe training-reihe-oben">
        <span><strong>${sicher(p.name)}</strong>${p.aktiv ? ` <span class="training-chip">aktiv</span>` : ""}
          ${p.beschreibung ? `<span class="training-leise training-block">${sicher(p.beschreibung)}</span>` : ""}</span>
      </div>`).join("")));
  }
  if (a.absagenMonat.length) {
    const ruhe = a.absagenMonat.filter(c => c.ruhetag).length;
    const abgesagt = a.absagenMonat.length - ruhe;
    karten.push(trainingKarte("Pausen diesen Monat", `
      <div class="training-zeile">${[
        ruhe ? ruhe + (ruhe === 1 ? " Ruhetag" : " Ruhetage") : "",
        abgesagt ? abgesagt + (abgesagt === 1 ? " Absage" : " Absagen") : "",
      ].filter(Boolean).join(" · ")}</div>`));
  }

  stuecke.push(`<div class="start-raster">${karten.join("")}</div>`);
  bereich.innerHTML = stuecke.join("");
}

/* Alle Trainings, die Gymbro kennt, nach Monaten. Oben zwei Filter: die
   Art (Push, Beine …) als Knöpfe, weil es davon wenige gibt, und die
   Muskelgruppe als Auswahl, weil es davon viele gibt. */
function trainingVerlaufZeichnen(daten, jetzt) {
  const alle = gymbroEinheiten(daten);
  const typen = [...new Set(alle.map(s => s.typ).filter(Boolean))].sort();
  const muskeln = [...new Set([].concat(...alle.map(s => s.muskeln)))]
    .sort((x, y) => trainingWort(x).localeCompare(trainingWort(y), "de"));

  const gefiltert = alle.filter(s =>
    (!trainingFilterTyp || s.typ === trainingFilterTyp)
    && (!trainingFilterMuskel || s.muskeln.indexOf(trainingFilterMuskel) >= 0));

  const monate = [];
  for (const s of gefiltert) {
    const name = s.start.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
    if (!monate.length || monate[monate.length - 1].name !== name) monate.push({ name, liste: [] });
    monate[monate.length - 1].liste.push(s);
  }

  const knopf = (wert, text) => `
    <button type="button" class="training-filter${trainingFilterTyp === wert ? " training-filter-aktiv" : ""}"
            data-training-typ="${sicher(wert)}">${sicher(text)}</button>`;

  return `
    <div class="training-kopf">
      <button type="button" class="knopf-schlicht start-klein" data-training-verlauf>‹ Zurück</button>
      <span class="training-stand">${gefiltert.length} von ${alle.length} Trainings</span>
    </div>
    <div class="training-filterleiste">
      ${knopf("", "Alle")}
      ${typen.map(t => knopf(t, trainingWort(t))).join("")}
      <select id="trainingMuskel" class="training-muskelwahl" aria-label="Muskelgruppe">
        <option value="">Alle Muskelgruppen</option>
        ${muskeln.map(m => `<option value="${sicher(m)}"${
          m === trainingFilterMuskel ? " selected" : ""}>${sicher(trainingWort(m))}</option>`).join("")}
      </select>
    </div>
    ${gefiltert.length === 0 ? `<p class="leer-text">Kein Training passt zu diesem Filter.</p>` : ""}
    ${monate.map(m => `
      <section class="start-karte training-monat">
        <div class="start-karte-kopf"><div class="start-karte-titel"><h2>${sicher(m.name)}</h2></div>
          <span class="training-leise">${m.liste.length} ${m.liste.length === 1 ? "Training" : "Trainings"}</span></div>
        <div class="start-karte-inhalt">
        ${m.liste.map(s => `
          <div class="training-eintrag">
            <div class="training-eintrag-tag">
              <strong>${sicher(WOCHENTAGE[s.start.getDay()].slice(0, 2) + " " + datumKurz(s.start))}</strong>
              <span class="training-leise">${sicher(tageHer(s.start, jetzt))}</span>
            </div>
            <div class="training-eintrag-text">
              <div><strong>${sicher(s.typ ? trainingWort(s.typ) : "Training")}</strong>${
                einheitBeschreiben(Object.assign({}, s, { typ: "" }))
                  ? " · " + sicher(einheitBeschreiben(Object.assign({}, s, { typ: "" }))) : ""}${
                s.gymName ? `<span class="training-leise"> · ${sicher(s.gymName)}</span>` : ""}</div>
              ${s.muskeln.length ? `<div class="training-leise">${
                sicher(s.muskeln.map(trainingWort).join(", "))}</div>` : ""}
              ${s.partner.length ? `<div class="training-leise">mit ${sicher(s.partner.join(", "))}</div>` : ""}
              ${s.notiz ? `<div class="training-notiz">${sicher(s.notiz)}</div>` : ""}
            </div>
          </div>`).join("")}
        </div>
      </section>`).join("")}`;
}

function trainingKarte(titel, inhalt) {
  return `
    <section class="start-karte">
      <div class="start-karte-kopf"><div class="start-karte-titel"><h2>${sicher(titel)}</h2></div></div>
      <div class="start-karte-inhalt">${inhalt}</div>
    </section>`;
}

/* Die Karte auf der Übersicht: wie viele Trainings diese Woche, und wohin
   der Trend geht. Mehr nicht – der Rest steht im Reiter. Leer, solange es
   nichts zu zeigen gibt, auf fremden Dashboards also immer. */
const TREND_TEXT = {
  hoch: ["↗", "Mehr als im Monat davor"],
  gleich: ["→", "So regelmäßig wie im Monat davor"],
  runter: ["↘", "Weniger als im Monat davor"],
  keine: ["", "In den letzten zwei Monaten kein Training"],
};

function zahlLesbar(wert) {
  return String(Math.round(wert * 10) / 10).replace(".", ",");
}

function trainingStartKarte(jetzt) {
  if (!trainingSichtbar() || !training) return "";
  const a = trainingAuswerten(training.daten, jetzt);
  const hoechste = Math.max(1, ...a.wochen.map(w => w.anzahl));
  const [pfeil, satz] = TREND_TEXT[a.trend.richtung];
  const inhalt = `
    <div class="tw-oben">
      <div class="tw-zahl">${a.dieseWoche}</div>
      <div class="tw-zahl-text">${a.dieseWoche === 1 ? "Training" : "Trainings"}<br>diese Woche</div>
      <div class="tw-balken" role="img"
           aria-label="Trainings pro Woche, die letzten acht Wochen: ${a.wochen.map(w => w.anzahl).join(", ")}">
        ${a.wochen.map((w, i) => `
          <span class="tw-saeule${i === a.wochen.length - 1 ? " tw-saeule-jetzt" : ""}"
                style="height:${Math.max(6, Math.round(w.anzahl / hoechste * 100))}%"
                title="KW ${kalenderwoche(w.montag)}: ${w.anzahl}"></span>`).join("")}
      </div>
    </div>
    <div class="tw-trend tw-trend-${a.trend.richtung}">
      ${pfeil ? `<span class="tw-pfeil">${pfeil}</span>` : ""}
      <span>${sicher(satz)}${a.trend.richtung === "keine" ? "" : `<span class="tw-schnitt">Ø ${
        zahlLesbar(a.trend.jetzt)} statt ${zahlLesbar(a.trend.vorher)} pro Woche</span>`}</span>
    </div>`;
  return startKarte("Training", "training", "Mehr", inhalt,
                    { symbol: "training", farbe: "lila", klasse: "start-karte-training" });
}


/* -------------------------------------------------------------------------
   5c. Uni-Plan: Theorie- und Praxisphasen, Arbeitszeit, Urlaub

   Friedrich studiert dual: alle paar Monate wechselt er zwischen Hochschule
   und Betrieb. Wann was ist, steht im Zeitplan des Fachbereichs Duales
   Studium für den Studienjahrgang 2024 (PDF, Stand 09.02.2023). Die Daten
   daraus stehen hier fest im Code – sie gelten für den ganzen Jahrgang,
   geheim ist daran nichts.

   Daraus entstehen drei Dinge:
   - In den Praxisphasen steht montags bis freitags "Arbeit" im Plan. Diese
     Einträge werden jedes Mal ausgerechnet, nicht gespeichert: ändert sich
     die Arbeitszeit, sind sofort alle richtig, und gelöscht werden muss
     auch nie etwas.
   - Urlaub ist ein eigener ganztägiger Termin mit dem Feld urlaub. An
     Urlaubstagen und Feiertagen fällt die Arbeit weg.
   - Die Übersicht zeigt, was an Phasen und Fristen noch kommt.
   ------------------------------------------------------------------------- */

const UNI_PLAN = {
  titel: "Zeitplan für den Studienjahrgang 2024",
  herkunft: "HWR Berlin, Fachbereich Duales Studium Wirtschaft • Technik",
  stand: "09.02.2023",
  phasen: [
    { halbjahr: 1, art: "praxis",  von: "2024-10-01", bis: "2024-10-20", wochen: 3 },
    { halbjahr: 1, art: "theorie", von: "2024-10-21", bis: "2024-12-22", wochen: 9 },
    { halbjahr: 1, art: "praxis",  von: "2024-12-23", bis: "2025-01-05", wochen: 2 },
    { halbjahr: 1, art: "theorie", von: "2025-01-06", bis: "2025-01-26", wochen: 3 },
    { halbjahr: 1, art: "praxis",  von: "2025-01-27", bis: "2025-04-13", wochen: 11 },
    { halbjahr: 2, art: "theorie", von: "2025-04-14", bis: "2025-07-06", wochen: 12 },
    { halbjahr: 2, art: "praxis",  von: "2025-07-07", bis: "2025-09-28", wochen: 12 },
    { halbjahr: 3, art: "theorie", von: "2025-09-29", bis: "2025-12-21", wochen: 12 },
    { halbjahr: 3, art: "praxis",  von: "2025-12-22", bis: "2026-02-22", wochen: 9 },
    { halbjahr: 4, art: "theorie", von: "2026-02-23", bis: "2026-05-17", wochen: 12 },
    { halbjahr: 4, art: "praxis",  von: "2026-05-18", bis: "2026-08-09", wochen: 12 },
    { halbjahr: 5, art: "theorie", von: "2026-08-10", bis: "2026-11-01", wochen: 12 },
    { halbjahr: 5, art: "praxis",  von: "2026-11-02", bis: "2027-01-31", wochen: 13 },
    { halbjahr: 6, art: "theorie", von: "2027-02-01", bis: "2027-04-25", wochen: 12 },
    { halbjahr: 6, art: "praxis",  von: "2027-04-26", bis: "2027-09-26", wochen: 22 },
  ],
  fristen: [
    { halbjahr: 2, titel: "Abgabe 1. Praxistransferbericht", von: "2025-04-14" },
    { halbjahr: 3, titel: "Abgabe 2. Praxistransferbericht", von: "2025-09-29" },
    { halbjahr: 4, titel: "Abgabe 3. Praxistransferbericht", von: "2026-02-23" },
    { halbjahr: 4, titel: "Vergabe des Themas der Studienarbeit", von: "2026-06-22" },
    { halbjahr: 4, titel: "Abgabe der Studienarbeit", von: "2026-08-17" },
    /* Im PDF steht "11.01.2027 – 31.02.2027". Einen 31. Februar gibt es
       nicht; die Praxisphase, in der die Prüfung liegt, endet am 31.01.
       Gemeint ist also sehr wahrscheinlich der 31.01.2027. */
    { halbjahr: 5, titel: "Mündliche Transferprüfung", von: "2027-01-11", bis: "2027-01-31",
      hinweis: "Im PDF steht als Ende der 31.02.2027 – gemeint ist vermutlich der 31.01." },
    { halbjahr: 6, titel: "Vergabe des Themas der Bachelorarbeit", von: "2027-04-22" },
    { halbjahr: 6, titel: "Abgabe der Bachelorarbeit", von: "2027-07-05" },
    { halbjahr: 6, titel: "Mündliche Bachelorprüfung", von: "2027-09-13", bis: "2027-09-30" },
  ],
  hinweise: [
    "Wiederholungs- bzw. Nachklausuren finden in der Regel in der 2. bis 4. "
      + "Vorlesungswoche der Folgesemester statt.",
    "Änderungen bleiben der Fachleiterin/dem Fachleiter vorbehalten.",
  ],
};

/* Die Einstellungen zur Arbeitszeit. Sie werden zwischen den Geräten
   abgeglichen, als ein Eintrag mit fester Kennung – sonst müsste man sie
   auf dem Handy und am Laptop je einmal einstellen. */
const SPEICHER_UNIPLAN = "stundenplan.uniplan";
const UNIPLAN_KENNUNG = "einstellung-uniplan";
/* Feiertage nach Mecklenburg-Vorpommern: dort liegt der Betrieb, und für
   die Arbeit zählt, wo gearbeitet wird, nicht wo man studiert. */
const UNIPLAN_VORGABE = { arbeit: true, von: "08:00", bis: "16:30", land: "MV", geaendert: 0 };
const FEIERTAG_LAENDER = {
  MV: "Mecklenburg-Vorpommern (mit Frauentag und Reformationstag)",
  BE: "Berlin (mit Frauentag)",
  BB: "Brandenburg (mit Reformationstag)",
};

let uniplan = Object.assign({}, UNIPLAN_VORGABE);

function uniplanGeraderuecken(roh) {
  const e = roh && typeof roh === "object" ? roh : {};
  const uhr = w => (typeof w === "string" && /^\d{2}:\d{2}$/.test(w) ? w : null);
  return {
    // Als Text "ja"/"nein" gespeichert, siehe abgleichSammeln(); alte
    // Stände oder der erste Start liefern true/false oder gar nichts.
    arbeit: e.arbeit === undefined ? UNIPLAN_VORGABE.arbeit : e.arbeit === true || e.arbeit === "ja",
    von: uhr(e.von) || UNIPLAN_VORGABE.von,
    bis: uhr(e.bis) || UNIPLAN_VORGABE.bis,
    land: FEIERTAG_LAENDER[e.land] ? e.land : UNIPLAN_VORGABE.land,
    geaendert: Number(e.geaendert) || 0,
  };
}

function uniplanLaden() {
  try {
    return uniplanGeraderuecken(JSON.parse(localStorage.getItem(SPEICHER_UNIPLAN) || "null"));
  } catch (fehler) {
    return uniplanGeraderuecken(null);
  }
}

function uniplanSetzen(felder) {
  uniplan = uniplanGeraderuecken(Object.assign({}, uniplan, felder, { geaendert: Abgleich.jetzt() }));
  // Ende vor Anfang ergäbe Kästchen mit negativer Höhe. Dann lieber die Vorgabe.
  if (uniplan.bis <= uniplan.von) { uniplan.von = UNIPLAN_VORGABE.von; uniplan.bis = UNIPLAN_VORGABE.bis; }
  try { localStorage.setItem(SPEICHER_UNIPLAN, JSON.stringify(uniplan)); }
  catch (fehler) { /* dann gilt es bis zum Neuladen */ }
  Abgleich.anstossen();
}


/* --- Kalenderrechnen -------------------------------------------------- */

/* Tage als Text "2026-11-02" – gerechnet über 12 Uhr mittags, damit die
   Zeitumstellung keinen Tag verschluckt oder doppelt zählt. */
function tagPlus(tag, anzahl) {
  const d = new Date(tag + "T12:00:00");
  d.setDate(d.getDate() + anzahl);
  return tagesSchluessel(d);
}

function tageBis(von, bis) {
  return Math.round((new Date(bis + "T12:00:00") - new Date(von + "T12:00:00")) / 86400000);
}

/* Ostersonntag nach der gregorianischen Osterformel (Meeus/Jones/Butcher).
   Daran hängen Karfreitag, Ostermontag, Himmelfahrt und Pfingstmontag. */
function ostersonntag(jahr) {
  const a = jahr % 19, b = Math.floor(jahr / 100), c = jahr % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31);
  const tag = ((h + l - 7 * m + 114) % 31) + 1;
  return jahr + "-" + String(monat).padStart(2, "0") + "-" + String(tag).padStart(2, "0");
}

/* Die gesetzlichen Feiertage eines Jahres, die auf einen Werktag fallen
   können: bundesweit, dazu je nach Land der Frauentag (Berlin, und seit
   2023 Mecklenburg-Vorpommern) und der Reformationstag (Brandenburg,
   Mecklenburg-Vorpommern). { "2026-12-25": "1. Weihnachtstag", … } */
const feiertagsSpeicher = {};
function feiertage(jahr, land) {
  const schluessel = jahr + land;
  if (feiertagsSpeicher[schluessel]) return feiertagsSpeicher[schluessel];
  const ostern = ostersonntag(jahr);
  const liste = {
    [jahr + "-01-01"]: "Neujahr",
    [tagPlus(ostern, -2)]: "Karfreitag",
    [tagPlus(ostern, 1)]: "Ostermontag",
    [jahr + "-05-01"]: "Tag der Arbeit",
    [tagPlus(ostern, 39)]: "Christi Himmelfahrt",
    [tagPlus(ostern, 50)]: "Pfingstmontag",
    [jahr + "-10-03"]: "Tag der Deutschen Einheit",
    [jahr + "-12-25"]: "1. Weihnachtstag",
    [jahr + "-12-26"]: "2. Weihnachtstag",
  };
  if (land === "BE" || (land === "MV" && jahr >= 2023)) liste[jahr + "-03-08"] = "Frauentag";
  if (land === "BB" || land === "MV") liste[jahr + "-10-31"] = "Reformationstag";
  feiertagsSpeicher[schluessel] = liste;
  return liste;
}

function feiertagAm(tag, land) {
  return feiertage(Number(tag.slice(0, 4)), land)[tag] || "";
}

function urlaube() {
  return eigeneTermine.filter(t => t.urlaub)
    .map(t => ({ id: t.id, von: t.start.slice(0, 10), bis: (t.ende || t.start).slice(0, 10), titel: t.titel }))
    .sort((a, b) => a.von.localeCompare(b.von));
}

function imUrlaub(tag, liste) {
  return liste.some(u => u.von <= tag && u.bis >= tag);
}

/* Die Phase, in der ein Tag liegt, oder null (vor dem Studium, danach). */
function phaseAm(tag) {
  return UNI_PLAN.phasen.filter(p => p.von <= tag && p.bis >= tag)[0] || null;
}

/* Alle Arbeitstage als Termine in der Form des Stundenplans. Das sind über
   das ganze Studium gut vierhundert – zu viele, um sie bei jedem Zeichnen
   neu zu bauen. Deshalb werden sie aufgehoben, solange sich nichts
   ändert, wovon sie abhängen: Einstellung und Urlaub. */
let arbeitsSpeicher = { schluessel: "", termine: [] };

function arbeitsTermine() {
  if (!uniplan.arbeit) return [];
  const liste = urlaube();
  const schluessel = JSON.stringify([uniplan.von, uniplan.bis, uniplan.land, liste]);
  if (arbeitsSpeicher.schluessel === schluessel) return arbeitsSpeicher.termine;

  const termine = [];
  for (const phase of UNI_PLAN.phasen) {
    if (phase.art !== "praxis") continue;
    for (let tag = phase.von; tag <= phase.bis; tag = tagPlus(tag, 1)) {
      const wochentag = new Date(tag + "T12:00:00").getDay();
      if (wochentag === 0 || wochentag === 6) continue;
      if (feiertagAm(tag, uniplan.land) || imUrlaub(tag, liste)) continue;
      termine.push({
        id: "arbeit-" + tag,
        start: tag + "T" + uniplan.von,
        ende: tag + "T" + uniplan.bis,
        titel: "Arbeit",
        raum: "", dozent: "", anmerkung: "", art: "", gruppe: "",
        arbeit: true,
      });
    }
  }
  arbeitsSpeicher = { schluessel, termine };
  return termine;
}


/* --- Was noch kommt ------------------------------------------------------ */

const PHASEN_NAME = { theorie: "Theorie", praxis: "Praxis" };

/* Alles ab heute in zeitlicher Folge: die laufende Phase, die kommenden,
   die Fristen und dein Urlaub. Vergangenes fällt weg. */
function uniplanAusblick(heute) {
  const aktuell = phaseAm(heute);
  const eintraege = [];
  for (const p of UNI_PLAN.phasen) {
    if (p.von > heute) {
      eintraege.push({ art: p.art, von: p.von, bis: p.bis, titel: PHASEN_NAME[p.art] + "phase",
                       halbjahr: p.halbjahr, wochen: p.wochen });
    }
  }
  for (const f of UNI_PLAN.fristen) {
    if ((f.bis || f.von) >= heute) {
      eintraege.push({ art: "frist", von: f.von, bis: f.bis || "", titel: f.titel, hinweis: f.hinweis || "" });
    }
  }
  for (const u of urlaube()) {
    if (u.bis >= heute) eintraege.push({ art: "urlaub", von: u.von, bis: u.bis, titel: u.titel || "Urlaub", id: u.id });
  }
  eintraege.sort((a, b) => a.von.localeCompare(b.von) || (a.art === "frist" ? 1 : -1));

  let fortschritt = null;
  if (aktuell) {
    const gesamt = tageBis(aktuell.von, aktuell.bis) + 1;
    const vergangen = tageBis(aktuell.von, heute);
    fortschritt = {
      art: aktuell.art,
      halbjahr: aktuell.halbjahr,
      woche: Math.min(aktuell.wochen, Math.floor(vergangen / 7) + 1),
      wochen: aktuell.wochen,
      nochTage: tageBis(heute, aktuell.bis),
      bis: aktuell.bis,
      anteil: Math.max(0, Math.min(1, vergangen / gesamt)),
    };
  }
  return { aktuell: fortschritt, eintraege };
}

function datumMitJahr(tag) {
  const d = new Date(tag + "T12:00:00");
  return datumKurz(d) + d.getFullYear();
}

function inTagen(heute, tag) {
  const n = tageBis(heute, tag);
  if (n <= 0) return "heute";
  if (n === 1) return "morgen";
  if (n < 14) return "in " + n + " Tagen";
  if (n < 70) return "in " + Math.round(n / 7) + " Wochen";
  return "in " + Math.round(n / 30.4) + " Monaten";
}

/* Das Widget auf der Übersicht. Oben die laufende Phase mit Fortschritt,
   darunter eine Leiste bis zum Ende des Studiums – Theorie blau, Praxis
   grün, Fristen als Striche –, und die nächsten Stationen als Liste. */
function uniplanStartKarte(jetzt) {
  const heute = tagesSchluessel(jetzt);
  const ende = UNI_PLAN.phasen[UNI_PLAN.phasen.length - 1].bis;
  if (heute > ende) return "";
  const a = uniplanAusblick(heute);

  const oben = a.aktuell ? `
    <div class="up-jetzt">
      <span class="up-marke up-marke-${a.aktuell.art}">${PHASEN_NAME[a.aktuell.art]}</span>
      <span class="up-jetzt-text"><strong>Woche ${a.aktuell.woche} von ${a.aktuell.wochen}</strong>
        · ${a.aktuell.halbjahr}. Studienhalbjahr</span>
      <span class="up-jetzt-rest">noch ${a.aktuell.nochTage} ${a.aktuell.nochTage === 1 ? "Tag" : "Tage"}</span>
    </div>
    <div class="up-fortschritt up-fortschritt-${a.aktuell.art}">
      <span style="width:${Math.round(a.aktuell.anteil * 100)}%"></span>
    </div>` : `<p class="start-leer">Das Studium beginnt am ${datumMitJahr(UNI_PLAN.phasen[0].von)}.</p>`;

  /* Die Leiste: von heute bis zum Ende des Studiums, jede Phase so breit,
     wie sie dauert. */
  const spanne = Math.max(1, tageBis(heute, ende));
  const pos = tag => Math.max(0, Math.min(100, tageBis(heute, tag) / spanne * 100));
  const stuecke = UNI_PLAN.phasen.filter(p => p.bis >= heute).map(p => {
    const links = pos(p.von < heute ? heute : p.von);
    const breite = pos(p.bis) - links;
    return `<span class="up-stueck up-stueck-${p.art}" style="left:${links.toFixed(2)}%;width:${breite.toFixed(2)}%"
                  title="${PHASEN_NAME[p.art]} ${datumMitJahr(p.von)} – ${datumMitJahr(p.bis)}"></span>`;
  }).join("");
  const striche = UNI_PLAN.fristen.filter(f => f.von >= heute).map(f =>
    `<span class="up-strich" style="left:${pos(f.von).toFixed(2)}%" title="${sicher(f.titel)}"></span>`).join("");
  const jahre = [];
  for (let j = Number(heute.slice(0, 4)) + 1; j <= Number(ende.slice(0, 4)); j++) {
    jahre.push(`<span class="up-jahr" style="left:${pos(j + "-01-01").toFixed(2)}%">${j}</span>`);
  }

  const liste = a.eintraege.slice(0, 5).map(e => `
    <div class="up-eintrag up-eintrag-${e.art}">
      <span class="up-punkt"></span>
      <span class="up-eintrag-text">
        <strong>${sicher(e.titel)}</strong>
        <span class="up-leise">${sicher(datumMitJahr(e.von) + (e.bis ? " – " + datumMitJahr(e.bis) : ""))}${
          e.wochen ? " · " + e.wochen + " Wochen" : ""}</span>
      </span>
      <span class="up-wann">${sicher(inTagen(heute, e.von))}</span>
    </div>`).join("");

  return startKarte("Studienphasen", "uniplan", "Uni-Plan", `
    ${oben}
    <div class="up-leiste" role="img" aria-label="Phasen bis zum Ende des Studiums am ${datumMitJahr(ende)}">
      ${stuecke}${striche}
    </div>
    <div class="up-achse"><span>heute</span>${jahre.join("")}<span class="up-achse-ende">${datumKurz(new Date(ende + "T12:00:00"))}${ende.slice(0, 4)}</span></div>
    <div class="up-legende"><span class="up-leg up-leg-theorie">Theorie</span><span class="up-leg up-leg-praxis">Praxis</span><span class="up-leg up-leg-frist">Frist</span></div>
    ${liste ? `<div class="up-liste">${liste}</div>` : ""}`,
    { symbol: "phasen", farbe: "gruen", breit: true, klasse: "start-karte-phasen" });
}


/* --- Das Fenster "Uni-Plan" ------------------------------------------- */

function uniplanFensterZeigen() {
  uniplanFensterZeichnen();
  const fenster = document.getElementById("uniplanHintergrund");
  if (fenster) fenster.hidden = false;
}

function uniplanFensterZeichnen(meldung) {
  const bereich = document.getElementById("uniplanInhalt");
  if (!bereich) return;
  const heute = tagesSchluessel(new Date());
  const liste = urlaube();
  const kommend = liste.filter(u => u.bis >= heute);
  const vorbei = liste.length - kommend.length;

  /* Halbjahre, die ganz vorbei sind, stehen eingeklappt unten. Oben soll
     stehen, was gilt und was kommt. */
  const zeilen = [];
  const frueher = [];
  for (let hj = 1; hj <= 6; hj++) {
    const letzterTag = UNI_PLAN.phasen.filter(p => p.halbjahr === hj).slice(-1)[0].bis;
    const ziel = letzterTag < heute ? frueher : zeilen;
    const eintraege = UNI_PLAN.phasen.filter(p => p.halbjahr === hj)
      .map(p => ({ sort: p.von, html: `
        <tr class="${p.bis < heute ? "up-vorbei" : ""}${p.von <= heute && p.bis >= heute ? " up-jetzt-zeile" : ""}">
          <td>${datumMitJahr(p.von)} – ${datumMitJahr(p.bis)}</td>
          <td><span class="up-marke up-marke-${p.art}">${PHASEN_NAME[p.art]}</span>${
            p.von <= heute && p.bis >= heute ? ` <span class="heute-marke">jetzt</span>` : ""}</td>
          <td class="up-zahl">${p.wochen} Wo.</td>
        </tr>` }))
      .concat(UNI_PLAN.fristen.filter(f => f.halbjahr === hj).map(f => ({ sort: f.von, html: `
        <tr class="up-frist-zeile${(f.bis || f.von) < heute ? " up-vorbei" : ""}">
          <td>${datumMitJahr(f.von)}${f.bis ? " – " + datumMitJahr(f.bis) : ""}</td>
          <td colspan="2"><em>${sicher(f.titel)}</em>${f.hinweis
            ? `<span class="up-leise up-block">${sicher(f.hinweis)}</span>` : ""}</td>
        </tr>` })))
      .sort((a, b) => a.sort.localeCompare(b.sort));
    ziel.push(`<tr class="up-halbjahr"><th colspan="3">${hj}. Studienhalbjahr</th></tr>`
              + eintraege.map(e => e.html).join(""));
  }

  bereich.innerHTML = `
    <p class="filter-hinweis">${sicher(UNI_PLAN.titel)}<br>${sicher(UNI_PLAN.herkunft)} · Stand ${sicher(UNI_PLAN.stand)}</p>
    ${meldung ? `<p class="geraete-meldung">${sicher(meldung)}</p>` : ""}

    <h3 class="melden-titel">Arbeit in den Praxisphasen</h3>
    <label class="form-haken">
      <input type="checkbox" id="uniplanArbeit" ${uniplan.arbeit ? "checked" : ""}>
      <span>Im Kalender eintragen, Montag bis Freitag</span>
    </label>
    <div class="form-zeiten">
      <label class="form-feld"><span>Von</span>
        <input type="time" id="uniplanVon" value="${sicher(uniplan.von)}" step="300"></label>
      <label class="form-feld"><span>Bis</span>
        <input type="time" id="uniplanBis" value="${sicher(uniplan.bis)}" step="300"></label>
    </div>
    <label class="form-feld"><span>Feiertage nach</span>
      <select id="uniplanLand">
        ${Object.keys(FEIERTAG_LAENDER).map(k => `<option value="${k}"${
          uniplan.land === k ? " selected" : ""}>${sicher(FEIERTAG_LAENDER[k])}</option>`).join("")}
      </select></label>
    <p class="filter-hinweis">An Feiertagen und im Urlaub steht keine Arbeit im Kalender.</p>

    <h3 class="melden-titel up-abstand">Urlaub</h3>
    ${kommend.length ? kommend.map(u => `
      <div class="up-urlaub">
        <span><strong>${sicher(u.titel || "Urlaub")}</strong>
          <span class="up-leise up-block">${datumMitJahr(u.von)}${u.bis !== u.von ? " – " + datumMitJahr(u.bis) : ""}
            · ${urlaubsTage(u)} ${urlaubsTage(u) === 1 ? "Arbeitstag" : "Arbeitstage"}</span></span>
        <button type="button" class="knopf-schlicht start-klein knopf-gefahr" data-urlaub-weg="${sicher(u.id)}">Löschen</button>
      </div>`).join("") : `<p class="filter-hinweis">Noch kein Urlaub eingetragen.</p>`}
    ${vorbei ? `<p class="filter-hinweis">${vorbei} vergangene${vorbei === 1 ? "r" : ""} Urlaub${vorbei === 1 ? "" : "e"} ausgeblendet.</p>` : ""}
    <div class="up-urlaub-neu">
      <label class="form-feld"><span>Von</span><input type="date" id="urlaubVon"></label>
      <label class="form-feld"><span>Bis</span><input type="date" id="urlaubBis"></label>
      <button type="button" class="knopf-schlicht knopf-betont" id="urlaubNeu">+ Urlaub eintragen</button>
    </div>

    <h3 class="melden-titel up-abstand">Zeitplan</h3>
    <table class="up-tabelle">${zeilen.join("")}</table>
    ${frueher.length ? `<details class="up-frueher"><summary>Vergangene Halbjahre (${frueher.length})</summary>
      <table class="up-tabelle">${frueher.join("")}</table></details>` : ""}
    ${UNI_PLAN.hinweise.map(t => `<p class="filter-hinweis">${sicher(t)}</p>`).join("")}`;
}

/* Wie viele Arbeitstage ein Urlaub kostet: Werktage in Praxisphasen, ohne
   Feiertage. Ein Urlaub in der Theoriephase kostet keinen. */
function urlaubsTage(u) {
  let anzahl = 0;
  for (let tag = u.von; tag <= u.bis; tag = tagPlus(tag, 1)) {
    const phase = phaseAm(tag);
    const wt = new Date(tag + "T12:00:00").getDay();
    if (phase && phase.art === "praxis" && wt !== 0 && wt !== 6 && !feiertagAm(tag, uniplan.land)) anzahl++;
  }
  return anzahl;
}

function urlaubEintragen(von, bis) {
  if (!von) return "Bitte einen ersten Urlaubstag wählen.";
  const ende = bis && bis >= von ? bis : von;
  terminSetzen(neueTerminKennung(), {
    titel: "Urlaub",
    start: von + "T00:00",
    ende: ende + "T23:59",
    ganztags: true,
    urlaub: true,
  });
  return "";
}

function uniplanVerbinden() {
  const fenster = document.getElementById("uniplanHintergrund");
  const inhalt = document.getElementById("uniplanInhalt");
  if (!fenster || !inhalt) return;

  document.getElementById("uniplanSchliessen").addEventListener("click", () => {
    fenster.hidden = true;
    uniplanBereichZeichnen();
  });
  fenster.addEventListener("click", ereignis => {
    if (ereignis.target === fenster) { fenster.hidden = true; uniplanBereichZeichnen(); }
  });

  inhalt.addEventListener("change", ereignis => {
    const id = ereignis.target && ereignis.target.id;
    if (id === "uniplanArbeit") uniplanSetzen({ arbeit: ereignis.target.checked });
    else if (id === "uniplanVon") uniplanSetzen({ von: ereignis.target.value });
    else if (id === "uniplanBis") uniplanSetzen({ bis: ereignis.target.value });
    else if (id === "uniplanLand") uniplanSetzen({ land: ereignis.target.value });
    else return;
    allesZeichnen();
  });

  inhalt.addEventListener("click", ereignis => {
    const ziel = ereignis.target;
    if (!ziel) return;
    if (ziel.id === "urlaubNeu") {
      const fehler = urlaubEintragen(document.getElementById("urlaubVon").value,
                                     document.getElementById("urlaubBis").value);
      allesZeichnen();
      uniplanFensterZeichnen(fehler || "Urlaub eingetragen.");
      return;
    }
    const weg = ziel.getAttribute && ziel.getAttribute("data-urlaub-weg");
    if (weg) {
      terminSetzen(weg, { titel: "" });
      allesZeichnen();
      uniplanFensterZeichnen("Urlaub gelöscht.");
    }
  });

  document.getElementById("uniplanBereich").addEventListener("click", ereignis => {
    if (ereignis.target && ereignis.target.id === "uniplanOeffnen") uniplanFensterZeigen();
  });
}

/* Der Abschnitt in den Einstellungen. */
function uniplanBereichZeichnen() {
  const bereich = document.getElementById("uniplanBereich");
  if (!bereich) return;
  const heute = tagesSchluessel(new Date());
  const a = uniplanAusblick(heute);
  const naechste = a.eintraege.filter(e => e.art === "theorie" || e.art === "praxis")[0];
  bereich.innerHTML = `
    <h3 class="melden-titel">Uni-Plan</h3>
    <p class="filter-hinweis">${a.aktuell
      ? `Gerade ${PHASEN_NAME[a.aktuell.art]}phase, ${a.aktuell.halbjahr}. Studienhalbjahr, bis ${datumMitJahr(a.aktuell.bis)}.`
      : "Gerade keine Phase aus dem Zeitplan."}${naechste
      ? ` Danach ${naechste.titel} ab ${datumMitJahr(naechste.von)}.` : ""}
      Arbeit im Kalender: ${uniplan.arbeit ? uniplan.von + "–" + uniplan.bis + " Uhr" : "aus"}.</p>
    <button type="button" class="knopf-schlicht" id="uniplanOeffnen">Uni-Plan und Urlaub</button>`;
}


/* -------------------------------------------------------------------------
   5b. Der Bereich "Notizen"

   Das Notizbuch. Eine Liste von Notizen, ein Fenster zum Schreiben, ein
   Fenster zum Verknüpfen – mehr ist es nicht.

   Die Verknüpfungen sind der eigentliche Grund für diesen Bereich. Eine
   Notiz für sich ist ein Zettel in einer Schublade; eine Notiz, die weiß,
   zu welchem Modul sie gehört, steht später von selbst dort, wo man sie
   sucht: im Fenster des Termins.
   ------------------------------------------------------------------------- */

function zettelZeichnen() {
  const bereich = document.getElementById("zettelListe");
  if (!bereich) return;

  let liste = zettelGefunden(zettelSuche);
  if (zettelFilter) {
    liste = liste.filter(z => z.verweise.indexOf(zettelFilter) >= 0);
  }

  /* Der Filterbalken erscheint nur, wenn gefiltert wird – sonst nähme er
     Platz weg und sagte nichts. Der Knopf daneben hebt ihn wieder auf; ohne
     ihn käme man aus einer Modulansicht nicht mehr heraus, ohne den Reiter
     neu anzutippen. */
  const filterBalken = !zettelFilter ? "" : (function () {
    const beschreibung = verweisBeschreiben(zettelFilter);
    return `
      <div class="zettel-filter">
        <span>${beschreibung.symbol} Notizen zu
              <strong>${sicher(beschreibung.titel)}</strong></span>
        <button type="button" class="knopf-schlicht" id="zettelFilterWeg">
          Alle Notizen
        </button>
      </div>`;
  })();

  if (liste.length === 0) {
    bereich.innerHTML = filterBalken + `<p class="leer-text">${
      zettelSuche || zettelFilter
        ? "Dazu gibt es noch keine Notiz."
        : "Noch keine Notizen. Tipp auf „+ Notiz“."
    }</p>`;
    return;
  }

  bereich.innerHTML = filterBalken + liste.map(z => {
    const vorschau = zettelVorschau(z);
    const marken = z.verweise.map(verweisBeschreiben);
    return `
      <div class="zettel-karte${z.wichtig ? " zettel-karte-wichtig" : ""}"
           data-zettel-oeffnen="${sicher(z.id)}"
           role="button" tabindex="0">
        <div class="zettel-karte-kopf">
          <span class="zettel-karte-titel">${
            z.wichtig ? "★ " : ""}${sicher(zettelTitel(z))}</span>
          <span class="zettel-karte-zeit">${sicher(zettelDatum(z))}</span>
        </div>
        ${vorschau
          ? `<div class="zettel-karte-vorschau">${sicher(vorschau)}</div>`
          : ""}
        ${marken.length === 0 ? "" : `
          <div class="zettel-karte-marken">
            ${marken.map(m => `<span class="zettel-marke${
              m.fehlt ? " zettel-marke-fehlt" : ""}">${m.symbol} ${
              sicher(m.titel)}</span>`).join("")}
          </div>`}
      </div>`;
  }).join("");
}

/* Wann zuletzt angefasst, kurz. Heute steht die Uhrzeit, sonst das Datum –
   dieselbe Regel wie in der Nachrichten-App, und sie stimmt mit dem
   überein, wonach man sucht: "das war doch heute Vormittag". */
function zettelDatum(z) {
  const wann = Number(z && z.geaendert) || 0;
  if (!wann) return "";
  const zeitpunkt = new Date(wann);
  if (tagesSchluessel(zeitpunkt) === tagesSchluessel(new Date())) {
    return uhrzeit(zeitpunkt.toISOString().slice(0, 16));
  }
  return String(zeitpunkt.getDate()).padStart(2, "0") + "."
       + String(zeitpunkt.getMonth() + 1).padStart(2, "0") + ".";
}

/* Setzt den Filter und wechselt in den Notizbereich.

   Von hier aus führen alle Wege, die "zeig mir die Notizen dazu" heißen:
   das Terminfenster, eine Modulmarke in einer Notiz, der Fächerfilter. */
function zettelFilterSetzen(verweis) {
  zettelFilter = verweis || "";
  zettelSuche = "";
  const suchfeld = document.getElementById("zettelSuchfeld");
  if (suchfeld) suchfeld.value = "";
  seiteSetzen("zettel");
}


/* --- Das Fenster zum Schreiben ----------------------------------------- */

/* Beim Tippen steht der Text im Textfeld, nicht in einer Variablen. Sobald
   das Fenster aber neu gezeichnet wird – weil eine Verknüpfung dazukommt
   oder wegfällt –, ist das Textfeld weg und mit ihm der Text. Deshalb wird
   er vorher hier hineingerettet. */
let offeneVerweise = [];
let offenerZettelText = "";
let offenerZettelWichtig = false;

function zettelWerteLesen() {
  const kopf = document.getElementById("zettelTitel");
  const feld = document.getElementById("zettelFeld");
  const haken = document.getElementById("zettelWichtig");
  // Beide Felder ergeben zusammen wieder einen Text - siehe zettelTeile().
  if (kopf || feld) {
    offenerZettelText = zettelZusammensetzen(
      kopf ? kopf.value : "", feld ? feld.value : "");
  }
  if (haken) offenerZettelWichtig = Boolean(haken.checked);
}

/* Öffnet eine Notiz. Ohne Kennung entsteht eine neue; vorgabe ist eine
   Liste von Verweisen, die sie gleich mitbekommt – so kann das
   Terminfenster eine Notiz anlegen, die schon verknüpft ist. */
function zettelFensterZeigen(kennung, vorgabe) {
  const vorhandener = kennung ? zettelZuKennung(kennung) : null;

  offenerZettel = kennung || neueZettelKennung();
  offenerZettelText = vorhandener ? vorhandener.text : "";
  offenerZettelWichtig = vorhandener ? Boolean(vorhandener.wichtig) : false;
  offeneVerweise = verweiseSaeubern(
    vorhandener ? vorhandener.verweise : (vorgabe || []));

  zettelFensterZeichnen();

  const fenster = document.getElementById("zettelHintergrund");
  if (fenster) fenster.hidden = false;

  /* Bei einer neuen Notiz gleich ins Textfeld springen. Bei einer
     vorhandenen nicht: dort will man meistens erst lesen, und die
     Bildschirmtastatur würde die halbe Notiz verdecken. */
  if (!vorhandener) {
    const kopf = document.getElementById("zettelTitel");
    if (kopf && kopf.focus) kopf.focus();
  }
}

function zettelFensterZeichnen() {
  const inhalt = document.getElementById("zettelInhalt");
  if (!inhalt) return;

  const vorhandener = zettelZuKennung(offenerZettel);
  const rueckverweise = zettelRueckverweise(offenerZettel);

  const titel = document.getElementById("zettelFensterTitel");
  if (titel) titel.textContent = vorhandener ? "Notiz" : "Neue Notiz";

  const teile = zettelTeile(offenerZettelText);

  inhalt.innerHTML = `
    <input type="text" id="zettelTitel" class="zettel-titel"
           placeholder="Überschrift" maxlength="120" autocomplete="off"
           value="${sicher(teile.titel)}">
    <textarea id="zettelFeld" class="zettel-feld" rows="9"
              placeholder="Text …"
              >${sicher(teile.rest)}</textarea>

    <label class="form-haken">
      <input type="checkbox" id="zettelWichtig"${offenerZettelWichtig ? " checked" : ""}>
      <span>★ Wichtig</span>
    </label>

    <div class="zettel-verweise-kopf">Verknüpft mit</div>
    <div class="zettel-marken zettel-marken-gross">
      ${offeneVerweise.map(verweis => {
        const m = verweisBeschreiben(verweis);
        return `
          <span class="zettel-marke${m.fehlt ? " zettel-marke-fehlt" : ""}">
            <button type="button" class="zettel-marke-text"
                    data-verweis-oeffnen="${sicher(verweis)}">
              ${m.symbol} ${sicher(m.titel)}${
                m.zusatz ? ` <small>${sicher(m.zusatz)}</small>` : ""}
            </button>
            <button type="button" class="zettel-marke-weg"
                    data-verweis-weg="${sicher(verweis)}"
                    aria-label="Verknüpfung entfernen">✕</button>
          </span>`;
      }).join("")}
      <button type="button" class="zettel-marke zettel-marke-neu" id="verweisNeu">
        + Verknüpfen
      </button>
    </div>

    ${rueckverweise.length === 0 ? "" : `
      <div class="zettel-verweise-kopf">Verlinkt von</div>
      <div class="zettel-marken">
        ${rueckverweise.map(z => `
          <button type="button" class="zettel-marke zettel-marke-text"
                  data-zettel-oeffnen="${sicher(z.id)}">
            ✎ ${sicher(zettelTitel(z))}
          </button>`).join("")}
      </div>`}

    <!-- Kein Speichern-Knopf: gespeichert wird beim Tippen, siehe
         zettelAutomatischSichern(). "Fertig" oben schließt nur noch.
         Löschen steht immer im Dokument und wird für eine neue Notiz
         nur versteckt - so kann es nach dem ersten automatischen
         Speichern erscheinen, ohne das Fenster neu zu zeichnen und dabei
         den Cursor aus dem Textfeld zu reißen. -->
    <div class="zettel-fuss">
      <span class="zettel-gesichert" id="zettelGesichert"></span>
      <button type="button" class="knopf-schlicht knopf-gefahr" id="zettelLoeschen"
              ${vorhandener ? "" : "hidden"}>
        Löschen
      </button>
    </div>`;
}

/* Schließt das Fenster und schreibt vorher weg.

   Das Speichern beim Schließen ist Absicht und nicht Bequemlichkeit: ein
   getippter Text, der beim Antippen von "Fertig" verschwindet, ist genau
   die Sorte Verlust, die man nicht bemerkt und nicht rückgängig machen
   kann. Die Notizen-App von Apple macht es ebenso. */
function zettelFensterSchliessen() {
  if (zettelSicherungsmarke) {
    clearTimeout(zettelSicherungsmarke);
    zettelSicherungsmarke = null;
  }
  zettelSichern();
  offenerZettel = "";
  const fenster = document.getElementById("zettelHintergrund");
  if (fenster) fenster.hidden = true;
  const auswahl = document.getElementById("verweisHintergrund");
  if (auswahl) auswahl.hidden = true;
  allesZeichnen();
}

/* Speichert, während man tippt – mit kurzer Verzögerung.

   Vorher gab es zwei Knöpfe, "Fertig" und "Speichern", die dasselbe
   taten. Einer genügt, und der braucht dann gar nicht mehr zu speichern:
   die Notizen-App von Apple speichert auch, ohne dass man darum bittet.

   Das ist mehr als Bequemlichkeit. Wischt man die App auf dem iPhone
   weg, während das Fenster offen ist, gibt es kein "Fertig" mehr – bis
   jetzt war dann alles Getippte verloren.

   Die Verzögerung sorgt dafür, dass nicht jeder einzelne Buchstabe einen
   Speichervorgang auslöst. Der Abgleich hat seine eigene Wartezeit
   obendrauf, siehe WARTEN_NACH_EINGABE in sync.js. */
let zettelSicherungsmarke = null;
const ZETTEL_SICHERN_NACH = 700;

function zettelAutomatischSichern() {
  if (zettelSicherungsmarke) clearTimeout(zettelSicherungsmarke);
  zettelSicherungsmarke = setTimeout(() => {
    zettelSicherungsmarke = null;
    zettelSichernUndMelden();
  }, ZETTEL_SICHERN_NACH);
}

function zettelSichernUndMelden() {
  if (!offenerZettel) return;
  zettelSichern();

  // Die Liste dahinter mitziehen, das Fenster selbst NICHT neu zeichnen –
  // sonst spränge der Cursor mitten im Satz aus dem Textfeld.
  zettelZeichnen();
  reiterZahlenSetzen();

  const gibtEs = Boolean(zettelZuKennung(offenerZettel));
  const loeschen = document.getElementById("zettelLoeschen");
  if (loeschen) loeschen.hidden = !gibtEs;
  const titel = document.getElementById("zettelFensterTitel");
  if (titel && gibtEs) titel.textContent = "Notiz";

  const vermerk = document.getElementById("zettelGesichert");
  if (vermerk) vermerk.textContent = gibtEs ? "Gespeichert" : "";
}

function zettelSichern() {
  if (!offenerZettel) return;
  zettelWerteLesen();

  /* Eine neue, völlig leere Notiz wird nicht angelegt.

     zettelSetzen() würde sonst einen Grabstein für eine Kennung setzen,
     die es nie gegeben hat. Das schadet nichts, sammelt aber Müll in der
     Ablage an, der 120 Tage mitgeschleppt wird. */
  const leer = !offenerZettelText.trim() && offeneVerweise.length === 0;
  if (leer && !zettelZuKennung(offenerZettel)) return;

  zettelSetzen(offenerZettel, {
    text: offenerZettelText,
    verweise: offeneVerweise,
    wichtig: offenerZettelWichtig,
  });
}


/* --- Das Fenster zum Verknüpfen ---------------------------------------- */

let verweisSuche = "";

function verweisFensterZeigen() {
  verweisSuche = "";
  const feld = document.getElementById("verweisSuchfeld");
  if (feld) feld.value = "";
  verweisListeZeichnen();
  const fenster = document.getElementById("verweisHintergrund");
  if (fenster) fenster.hidden = false;
}

/* Stellt zusammen, womit sich verknüpfen lässt.

   Drei Gruppen, absichtlich in dieser Reihenfolge: das Modul ist der
   häufigste Fall, weil eine Notiz meistens zum Fach gehört und nicht zu
   einem einzelnen Dienstagstermin. */
function verweisAngebot(suchwort) {
  const wort = String(suchwort || "").trim().toLowerCase();
  const passt = text => !wort || String(text).toLowerCase().indexOf(wort) >= 0;
  const gruppen = [];

  // 1. Module – jeder Fachtitel einmal.
  const gesehen = {};
  const faecher = [];
  for (const termin of (STUNDENPLAN.termine || [])) {
    if (gesehen[termin.titel]) continue;
    gesehen[termin.titel] = true;
    if (passt(termin.titel)) faecher.push(termin.titel);
  }
  faecher.sort();
  if (faecher.length) {
    gruppen.push({
      name: "Module",
      eintraege: faecher.map(name => ({
        verweis: "fach:" + name, symbol: "▦", titel: name,
        zusatz: "alle Termine dieses Moduls",
      })),
    });
  }

  /* 2. Einzelne Termine, von heute an.

     Vergangene bleiben draußen, solange nicht gesucht wird: die Liste wäre
     sonst mit hundert erledigten Vorlesungen gefüllt, bevor der erste
     kommende auftaucht. Wer gezielt sucht, bekommt sie trotzdem. */
  const heute = tagesSchluessel(new Date());
  const termine = alleAngezeigtenTermine().filter(termin =>
    passt(termin.titel + " " + (termin.raum || ""))
    && (wort || termin.start.slice(0, 10) >= heute));
  if (termine.length) {
    gruppen.push({
      name: "Termine",
      eintraege: termine.slice(0, 40).map(termin => ({
        verweis: "termin:" + termin.id, symbol: "◷", titel: termin.titel,
        zusatz: zeitpunktLesbar(termin.start)
                + (termin.raum ? " · " + termin.raum : ""),
      })),
    });
  }

  // 3. Andere Notizen. Die offene selbst darf nicht dabei sein.
  const andere = zettelSortiert().filter(
    z => z.id !== offenerZettel && passt(z.text));
  if (andere.length) {
    gruppen.push({
      name: "Notizen",
      eintraege: andere.slice(0, 40).map(z => ({
        verweis: "zettel:" + z.id, symbol: "✎", titel: zettelTitel(z),
        zusatz: zettelVorschau(z).slice(0, 60),
      })),
    });
  }

  return gruppen;
}

function verweisListeZeichnen() {
  const bereich = document.getElementById("verweisListe");
  if (!bereich) return;

  const gruppen = verweisAngebot(verweisSuche);
  if (gruppen.length === 0) {
    bereich.innerHTML = `<p class="leer-text">Nichts gefunden.</p>`;
    return;
  }

  bereich.innerHTML = gruppen.map(gruppe => `
    <div class="verweis-gruppe">
      <div class="verweis-gruppe-kopf">${sicher(gruppe.name)}</div>
      ${gruppe.eintraege.map(eintrag => {
        const gewaehlt = offeneVerweise.indexOf(eintrag.verweis) >= 0;
        return `
          <button type="button" class="verweis-zeile${
                    gewaehlt ? " verweis-zeile-aktiv" : ""}"
                  data-verweis-waehlen="${sicher(eintrag.verweis)}">
            <span class="verweis-symbol">${eintrag.symbol}</span>
            <span class="verweis-text">
              <strong>${sicher(eintrag.titel)}</strong>
              ${eintrag.zusatz ? `<small>${sicher(eintrag.zusatz)}</small>` : ""}
            </span>
            <span class="verweis-haken">${gewaehlt ? "✓" : "+"}</span>
          </button>`;
      }).join("")}
    </div>`).join("");
}

/* Einen Verweis anhaken oder wieder abwählen. Beides über denselben Knopf –
   so muss man nicht zwischen "hinzufügen" und "entfernen" unterscheiden,
   und ein zweites Antippen macht ein Versehen sofort rückgängig. */
function verweisUmschalten(verweis) {
  zettelWerteLesen();
  const stelle = offeneVerweise.indexOf(verweis);
  if (stelle >= 0) offeneVerweise.splice(stelle, 1);
  else offeneVerweise.push(verweis);
  offeneVerweise = verweiseSaeubern(offeneVerweise);
  verweisListeZeichnen();
  zettelFensterZeichnen();
  // Auch eine Verknüpfung ist eine Änderung, die nicht verlorengehen darf.
  zettelSichernUndMelden();
}

/* Einem Verweis folgen: Modul filtert die Liste, Notiz öffnet die Notiz,
   Termin öffnet das Terminfenster. */
function verweisFolgen(verweis) {
  const trenner = verweis.indexOf(":");
  const art = verweis.slice(0, trenner);
  const wert = verweis.slice(trenner + 1);

  if (art === "fach") {
    zettelFensterSchliessen();
    zettelFilterSetzen(verweis);
    return;
  }

  if (art === "zettel") {
    if (!zettelZuKennung(wert)) return;
    // Erst das Offene sichern, sonst geht der gerade getippte Text verloren.
    zettelSichern();
    zettelFensterZeigen(wert);
    return;
  }

  if (art === "termin") {
    if (!terminZuKennung(wert)) return;
    zettelFensterSchliessen();
    terminFensterZeigen(wert);
  }
}


/* --- Hell oder dunkel --------------------------------------------------- */

function themaLaden() {
  try {
    const gemerkt = localStorage.getItem(SPEICHER_THEMA);
    if (gemerkt === "hell" || gemerkt === "dunkel" || gemerkt === "auto") {
      return gemerkt;
    }
  } catch (fehler) { /* dann eben automatisch */ }
  return "auto";
}

function themaIstDunkel() {
  if (thema === "dunkel") return true;
  if (thema === "hell") return false;
  return Boolean(window.matchMedia
                 && window.matchMedia("(prefers-color-scheme: dark)").matches);
}

/* Trägt die Wahl ins <html>-Element ein – daran hängt im Stilblatt alles.

   Die Farbe der Statusleiste wird nicht noch einmal aufgeschrieben, sondern
   aus der gerade geltenden CSS-Variablen gelesen. Sonst stünden dieselben
   zwei Farbwerte an drei Stellen und liefen beim nächsten Umfärben
   auseinander. */
function themaAnwenden() {
  document.documentElement.setAttribute(
    "data-thema", themaIstDunkel() ? "dunkel" : "hell");

  let farbe = "";
  try {
    farbe = getComputedStyle(document.documentElement)
              .getPropertyValue("--hintergrund").trim();
  } catch (fehler) { /* dann bleibt die Statusleiste, wie sie ist */ }
  if (!farbe) return;

  /* Die beiden Marken im Kopf der Seite tragen ein media="..." und folgen
     damit dem Betriebssystem. Sobald hier eine eigene Wahl gilt, muss das
     weg – sonst zeigte die Statusleiste weiter die Systemfarbe. */
  for (const marke of document.querySelectorAll('meta[name="theme-color"]')) {
    marke.removeAttribute("media");
    marke.setAttribute("content", farbe);
  }
}

function themaSetzen(neues) {
  thema = neues;
  try { localStorage.setItem(SPEICHER_THEMA, thema); }
  catch (fehler) { /* dann gilt die Wahl bis zum Neuladen */ }
  themaAnwenden();
  themaZeichnen();
}

/* Zeigt, ob der Erinnerungsdienst noch laeuft.

   Erinnerungen verschickt nicht die App, sondern ein Zeitplan in der
   Datenbank, der alle fuenf Minuten nachschaut. Faellt der aus, passiert
   etwas Tueckisches: gar nichts. Keine Fehlermeldung, kein roter Kasten -
   es kommt einfach keine Erinnerung mehr, und man denkt, man habe keine
   gestellt.

   Beim Einrichten ist genau das passiert: der Zeitplan rief eine Funktion
   auf, die es nicht gibt, und scheiterte zwei Mal in Folge lautlos.
   Deshalb hinterlaesst jeder Lauf seither eine Spur, und hier steht sie.

   Die Abfrage verraet nichts: nur, wie viele Sekunden der letzte Lauf her
   ist. Keine Notizen, keine Raeume, kein Code. */
function erinnerungsdienstZeichnen() {
  const bereich = document.getElementById("erinnerungsdienst");
  if (!bereich) return;

  bereich.innerHTML = `
    <h3 class="melden-titel">Erinnerungen</h3>
    <p class="filter-hinweis" id="erinnerungsdienstStand">wird geprüft …</p>`;

  const anzeige = document.getElementById("erinnerungsdienstStand");

  /* Die Adresse steht in sync.js. Fehlt die Datei - beim Öffnen per
     Doppelklick aus einem unvollständigen Ordner etwa -, gibt es die
     Konstante nicht, und ein Zugriff darauf wäre ein Absturz mitten im
     Einstellungsfenster. Dieselbe Vorsicht wie bei den Ersatzstücken für
     Abgleich weiter oben. */
  if (typeof ABGLEICH_URL === "undefined") {
    anzeige.textContent = "Ohne sync.js gibt es keine Erinnerungen.";
    anzeige.className = "melden-hindernis";
    return;
  }

  fetch(ABGLEICH_URL + "/rest/v1/rpc/erinnerungen_laufen", {
    method: "POST",
    headers: {
      apikey: ABGLEICH_OEFFENTLICH,
      Authorization: "Bearer " + ABGLEICH_OEFFENTLICH,
      "Content-Type": "application/json",
    },
    body: "{}",
  })
    .then(antwort => antwort.ok ? antwort.json() : null)
    .then(stand => {
      if (!anzeige) return;
      if (!stand) {
        anzeige.textContent = "Der Erinnerungsdienst ließ sich nicht erreichen.";
        anzeige.className = "melden-hindernis";
        return;
      }
      const sekunden = Number(stand.sekunden) || 0;
      /* Der Zeitplan laeuft alle fuenf Minuten. Bis zu einer Viertelstunde
         Rueckstand ist also normal - zwei ausgelassene Laeufe koennen
         vorkommen. Darueber stimmt etwas nicht. */
      if (sekunden <= 900) {
        anzeige.className = "filter-hinweis";
        anzeige.textContent =
          "Läuft. Zuletzt vor " + Math.round(sekunden / 60) + " Min. nachgeschaut. "
          + "Erinnerungen kommen auf bis zu fünf Minuten genau.";
      } else {
        anzeige.className = "melden-hindernis";
        anzeige.textContent =
          "Der Erinnerungsdienst hat seit "
          + Math.round(sekunden / 60) + " Minuten nicht nachgeschaut. "
          + "Gestellte Erinnerungen kommen gerade nicht an.";
      }
    })
    .catch(() => {
      if (anzeige) {
        anzeige.textContent = "Der Erinnerungsdienst ließ sich nicht erreichen.";
        anzeige.className = "melden-hindernis";
      }
    });
}

function themaZeichnen() {
  const bereich = document.getElementById("themaBereich");
  if (!bereich) return;

  const wahl = [
    ["auto", "Automatisch"],
    ["hell", "Hell"],
    ["dunkel", "Dunkel"],
  ];

  bereich.innerHTML = `
    <h3 class="melden-titel">Aussehen</h3>
    <p class="filter-hinweis">
      „Automatisch“ folgt der Einstellung deines Geräts – am iPhone also
      auch der Zeitschaltung, falls du eine eingerichtet hast.
    </p>
    <div class="schalter" role="group" aria-label="Aussehen">
      ${wahl.map(eintrag => `
        <button type="button" data-thema="${eintrag[0]}"
                class="${thema === eintrag[0] ? "schalter-aktiv" : ""}"
                aria-pressed="${thema === eintrag[0] ? "true" : "false"}">
          ${eintrag[1]}
        </button>`).join("")}
    </div>`;
}


/* -------------------------------------------------------------------------
   6. Geräteabgleich

   Die Mechanik steckt in sync.js – Netz, Zusammenführen, Grabsteine. Hier
   steht nur die Übersetzung in beide Richtungen: aus Notizen, Aufgaben,
   eigenen Terminen und dem Notizbuch eine gemeinsame Sammlung machen, und
   aus einer gemeinsamen Sammlung wieder diese vier.

   Der Zwischenschritt lohnt sich, weil sync.js dadurch nichts über
   Stundenpläne wissen muss. Für sie ist alles nur "Kennung, Zeitstempel,
   ein paar Felder".
   ------------------------------------------------------------------------- */

/* Trägt alles zusammen, was auf diesem Gerät steht.

   Alle vier Sorten landen in einer Sammlung, obwohl sie getrennt
   gespeichert sind. Das geht, weil ihre Kennungen sich nie überschneiden:
   Notizen hängen an Termin-Kennungen der HWR ("sked.de…"), freie Aufgaben
   fangen mit "eigen-" an, eigene Termine mit "termin-", Notizen aus dem
   Notizbuch mit "zettel-". Beim Auspacken unten wird daran wieder
   auseinandersortiert – und zusätzlich am Feld "art", das seit dem
   Notizbuch der verlässlichere Weg ist. */
function abgleichSammeln() {
  const eintraege = {};

  for (const kennung of Object.keys(notizen)) {
    const notiz = notizen[kennung];
    eintraege[kennung] = {
      art: "notiz",
      text: notiz.text,
      erledigt: Boolean(notiz.erledigt),
      wichtig: Boolean(notiz.wichtig),
      geaendert: Number(notiz.geaendert) || 0,
    };
  }

  for (const aufgabe of aufgaben) {
    eintraege[aufgabe.id] = {
      art: "aufgabe",
      text: aufgabe.text,
      datum: aufgabe.datum,
      erledigt: Boolean(aufgabe.erledigt),
      wichtig: Boolean(aufgabe.wichtig),
      /* Beide Erinnerungsfelder gehen mit. "erinnerung" liest der Server,
         "erinnerungVorgabe" das andere Gerät – siehe erinnerungFelder(). */
      erinnerungVorgabe: aufgabe.erinnerungVorgabe || "",
      erinnerung: aufgabe.erinnerung || "",
      geaendert: Number(aufgabe.geaendert) || 0,
    };
  }

  for (const termin of eigeneTermine) {
    eintraege[termin.id] = {
      art: "termin",
      titel: termin.titel,
      start: termin.start,
      ende: termin.ende,
      ganztags: Boolean(termin.ganztags),
      ort: termin.ort || "",
      notiz: termin.notiz || "",
      wichtig: Boolean(termin.wichtig),
      urlaub: Boolean(termin.urlaub),
      erinnerungVorgabe: termin.erinnerungVorgabe || "",
      erinnerung: termin.erinnerung || "",
      geaendert: Number(termin.geaendert) || 0,
    };
  }

  /* Die Notizen aus dem Notizbuch.

     Beachte das Feld "inhalt". Es heißt bewusst NICHT "text", obwohl dort
     ein Text drinsteht – und das ist keine Spielerei, sondern die einzige
     Absicherung gegen ein Gerät, auf dem noch eine ältere Fassung der App
     läuft.

     abgleichUebernehmen() unten sortiert jeden Eintrag, der ein Feld
     "text" hat, in Notizen oder Aufgaben ein. Eine ältere Fassung kennt
     die Art "zettel" nicht, sähe also einen Eintrag mit Text und machte
     daraus eine Notiz an einem Termin, den es gar nicht gibt – die
     Verknüpfungen wären beim nächsten Hochladen weg, auf allen Geräten.

     Ohne "text" greift dort stattdessen die Regel für Unbekanntes: heben
     und unverändert zurückgeben. Ein altes Gerät reicht das Notizbuch
     also durch, ohne es anzufassen. */
  for (const z of zettel) {
    eintraege[z.id] = {
      art: "zettel",
      inhalt: z.text,
      verweise: verweiseSaeubern(z.verweise),
      wichtig: Boolean(z.wichtig),
      geaendert: Number(z.geaendert) || 0,
    };
  }

  /* Was diese Fassung nicht versteht, wandert unverändert zurück.

     Ohne das hier wäre folgendes möglich: eine spätere Fassung führt eine
     neue Art von Eintrag ein, ein Gerät mit einer älteren Fassung gleicht
     ab, versteht sie nicht, lässt sie beim Zurückschreiben weg – und
     löscht sie damit auf allen Geräten. Die Stelle ist absichtlich hier,
     vor den Grabsteinen: ein Löschvermerk soll auch einen unbekannten
     Eintrag begraben können. */
  /* Die Uni-Plan-Einstellung – erst, wenn sie einmal geändert wurde. Bis
     dahin gilt auf jedem Gerät die Vorgabe, und es gibt nichts abzugleichen.
     "ja"/"nein" statt true/false, damit der Abdruck beim Vergleichen
     eindeutig bleibt. */
  if (uniplan.geaendert) {
    eintraege[UNIPLAN_KENNUNG] = {
      art: "einstellung",
      arbeit: uniplan.arbeit ? "ja" : "nein",
      von: uniplan.von,
      bis: uniplan.bis,
      land: uniplan.land,
      geaendert: uniplan.geaendert,
    };
  }

  for (const kennung of Object.keys(unbekannteEintraege)) {
    if (!eintraege[kennung]) eintraege[kennung] = unbekannteEintraege[kennung];
  }

  for (const kennung of Object.keys(grabsteine)) {
    /* Ein Grabstein zählt nur, wenn an derselben Kennung nichts Neueres
       steht. Normalerweise kann das gar nicht vorkommen – notizSetzen()
       und aufgabeSetzen() räumen den Grabstein weg, sobald wieder etwas
       geschrieben wird. Sollte doch einmal beides dastehen, gewinnt hier
       das Jüngere, statt dass ein alter Grabstein einen frischen Eintrag
       verschluckt. */
    const lebend = eintraege[kennung];
    if (lebend && (Number(lebend.geaendert) || 0) > grabsteine[kennung]) continue;
    eintraege[kennung] = { geloescht: true, geaendert: grabsteine[kennung] };
  }

  return { v: 2, eintraege: eintraege };
}

/* Der Rückweg: den zusammengeführten Stand in die Form bringen, mit der der
   Rest der App arbeitet.

   Alles wird dabei neu aufgebaut statt ergänzt. Das ist Absicht: was in der
   Sammlung nicht mehr vorkommt, ist auch hier weg – sonst überlebten
   gelöschte Einträge das Zusammenführen. */
function abgleichUebernehmen(nutzlast) {
  const eintraege = (nutzlast && nutzlast.eintraege) || {};
  const neueNotizen = {};
  const neueAufgaben = [];
  const neueTermine = [];
  const neueZettel = [];
  const neueGrabsteine = {};
  const neueUnbekannte = {};
  let neueUniplan = null;

  for (const kennung of Object.keys(eintraege)) {
    const eintrag = eintraege[kennung] || {};
    const zeitpunkt = Number(eintrag.geaendert) || 0;

    if (eintrag.geloescht) { neueGrabsteine[kennung] = zeitpunkt; continue; }

    // Eigener Termin: braucht Titel und Anfang, alles andere ist Beiwerk.
    if (eintrag.art === "termin" || kennung.indexOf("termin-") === 0) {
      if (typeof eintrag.titel !== "string" || !eintrag.titel) continue;
      if (typeof eintrag.start !== "string" || eintrag.start.length < 16) continue;
      neueTermine.push({
        id: kennung,
        titel: eintrag.titel,
        start: eintrag.start,
        ende: (typeof eintrag.ende === "string" && eintrag.ende)
                ? eintrag.ende : stundeSpaeter(eintrag.start),
        ganztags: Boolean(eintrag.ganztags),
        ort: typeof eintrag.ort === "string" ? eintrag.ort : "",
        notiz: typeof eintrag.notiz === "string" ? eintrag.notiz : "",
        wichtig: Boolean(eintrag.wichtig),
        urlaub: eintrag.urlaub === true || eintrag.urlaub === "true",
        erinnerungVorgabe: typeof eintrag.erinnerungVorgabe === "string"
                             ? eintrag.erinnerungVorgabe : "",
        erinnerung: typeof eintrag.erinnerung === "string"
                      ? eintrag.erinnerung : "",
        geaendert: zeitpunkt,
      });
      continue;
    }

    /* Die Einstellungen zum Uni-Plan (Arbeitszeit, Feiertage). Ein
       einziger Eintrag mit fester Kennung. */
    if (eintrag.art === "einstellung" && kennung === UNIPLAN_KENNUNG) {
      neueUniplan = uniplanGeraderuecken(eintrag);
      continue;
    }

    /* Eine Notiz aus dem Notizbuch. Steht vor der Text-Prüfung darunter,
       weil ihr Text im Feld "inhalt" liegt und sie dort sonst als
       unbekannt durchfiele – siehe abgleichSammeln(). */
    if (eintrag.art === "zettel") {
      const inhalt = typeof eintrag.inhalt === "string" ? eintrag.inhalt : "";
      const verweise = verweiseSaeubern(eintrag.verweise);
      // Weder Text noch Verknüpfung: da ist nichts mehr, was man zeigen
      // könnte. Dieselbe Grenze zieht zettelSetzen().
      if (!inhalt && verweise.length === 0) continue;
      neueZettel.push(zettelGeraderuecken({
        id: kennung, text: inhalt, verweise: verweise,
        wichtig: eintrag.wichtig, geaendert: zeitpunkt,
      }));
      continue;
    }

    /* Kein Text und keine bekannte Art? Dann kommt der Eintrag von einer
       Fassung, die es noch nicht gab. Er wird aufgehoben und beim nächsten
       Hochladen unverändert zurückgegeben, statt weggeworfen zu werden. */
    if (typeof eintrag.text !== "string" || !eintrag.text) {
      if (eintrag.art) neueUnbekannte[kennung] = eintrag;
      continue;
    }

    if (eintrag.art === "aufgabe" || kennung.indexOf("eigen-") === 0) {
      if (typeof eintrag.datum !== "string" || !eintrag.datum) continue;
      neueAufgaben.push({
        id: kennung,
        text: eintrag.text,
        datum: eintrag.datum,
        erledigt: Boolean(eintrag.erledigt),
        wichtig: Boolean(eintrag.wichtig),
        erinnerungVorgabe: typeof eintrag.erinnerungVorgabe === "string"
                             ? eintrag.erinnerungVorgabe : "",
        erinnerung: typeof eintrag.erinnerung === "string"
                      ? eintrag.erinnerung : "",
        geaendert: zeitpunkt,
      });
    } else {
      neueNotizen[kennung] = {
        text: eintrag.text,
        erledigt: Boolean(eintrag.erledigt),
        wichtig: Boolean(eintrag.wichtig),
        geaendert: zeitpunkt,
      };
    }
  }

  notizen = neueNotizen;
  aufgaben = neueAufgaben;
  eigeneTermine = neueTermine;
  zettel = neueZettel;
  grabsteine = neueGrabsteine;
  unbekannteEintraege = neueUnbekannte;
  // Steht im Abgleich noch keine Einstellung, bleibt die auf dem Gerät.
  if (neueUniplan) {
    uniplan = neueUniplan;
    try { localStorage.setItem(SPEICHER_UNIPLAN, JSON.stringify(uniplan)); }
    catch (fehler) { /* siehe unten */ }
  }

  /* Direkt in den Speicher, nicht über notizenSpeichern() – das würde
     Abgleich.anstossen() aufrufen und damit einen Abgleich anstoßen, der
     gerade selbst läuft. Eine Schleife wäre die Folge. */
  try {
    localStorage.setItem(SPEICHER_NOTIZEN, JSON.stringify(notizen));
    localStorage.setItem(SPEICHER_AUFGABEN, JSON.stringify(aufgaben));
    /* Die eigenen Termine standen hier lange nicht mit – ein Fehler, der
       sich gut versteckt hat: nach einem Abgleich lagen sie nur im
       Arbeitsspeicher, beim nächsten Laden der Seite waren sie weg, und
       der nächste Abgleich holte sie stillschweigend wieder. Man sah es
       also nur, wenn man ohne Netz neu lud. */
    localStorage.setItem(SPEICHER_TERMINE, JSON.stringify(eigeneTermine));
    localStorage.setItem(SPEICHER_ZETTEL, JSON.stringify(zettel));
    localStorage.setItem(SPEICHER_GRABSTEINE, JSON.stringify(grabsteine));
  } catch (fehler) { /* siehe notizenSpeichern() */ }
}

/* In die Zwischenablage legen – mit Rückfallweg.

   navigator.clipboard gibt es nur auf sicheren Verbindungen und nicht in
   jedem Browser. Der alte Weg über ein unsichtbares Textfeld funktioniert
   praktisch überall und macht hier den Unterschied zwischen "Knopf tut
   nichts" und "Knopf tut, was er soll". */
function inZwischenablage(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(() => true, () => altKopieren(text));
  }
  return Promise.resolve(altKopieren(text));
}

function altKopieren(text) {
  try {
    const feld = document.createElement("textarea");
    feld.value = text;
    feld.setAttribute("readonly", "");
    feld.style.position = "fixed";
    feld.style.opacity = "0";
    document.body.appendChild(feld);
    feld.select();
    const geklappt = document.execCommand("copy");
    document.body.removeChild(feld);
    return geklappt;
  } catch (fehler) {
    return false;
  }
}

/* Die Adresse des Kalender-Abos.

   Der Gerätecode steckt darin. Anders geht es nicht: die Kalender App
   kann sich nicht ausweisen, sie ruft eine Adresse ab und fertig. Wer die
   Adresse hat, sieht die Termine.

   "webcal" statt "https" ist derselbe Abruf, nur mit einem Vorsatz, den
   Apple kennt: ein Tippen darauf öffnet die Kalender App und schlägt das
   Abo vor, statt die Datei im Browser anzuzeigen. */
function kalenderAdresse(vorsatz) {
  const basis = ABGLEICH_URL.replace(/^https:/, vorsatz === "webcal" ? "webcal:" : "https:");
  return basis + "/functions/v1/kalender?code=" + Abgleich.code();
}

// Die Adresse dieser Seite mit angehängtem Code – zum Weiterschicken.
function abgleichLink() {
  return location.origin + location.pathname + "#code=" + Abgleich.code();
}

/* Zeichnet das Geräte-Fenster. Zwei Zustände: eingerichtet oder nicht. */
function geraeteZeichnen(meldung) {
  const bereich = document.getElementById("geraeteInhalt");
  if (!bereich) return;

  const hinweis = meldung
    ? `<p class="geraete-meldung">${sicher(meldung)}</p>` : "";

  if (!Abgleich.code()) {
    bereich.innerHTML = `
      <p class="filter-hinweis">
        Notizen, To-dos und eigene Termine liegen bisher nur in diesem
        Browser. Schalte den Abgleich ein, dann zeigen Handy und Laptop
        dasselbe.
      </p>
      <div class="filter-knoepfe">
        <button type="button" class="knopf-schlicht knopf-betont" id="abgleichEin">
          Abgleich einschalten
        </button>
      </div>
      <p class="filter-hinweis">
        Auf einem anderen Gerät schon eingerichtet? Dann trag hier dessen
        Code ein – die Einträge beider Geräte werden zusammengeführt, es geht
        nichts verloren.
      </p>
      <div class="code-eingabe">
        <input type="text" id="codeFeld" placeholder="ABCDE-FGHJK-…"
               autocapitalize="characters" autocomplete="off" spellcheck="false">
        <button type="button" class="knopf-schlicht" id="codeUebernehmen">Übernehmen</button>
      </div>
      ${hinweis}`;
    return;
  }

  const stand = Abgleich.auskunft();
  bereich.innerHTML = `
    <p class="abgleich-stand abgleich-${stand.stand}">${sicher(stand.text)}</p>

    <p class="filter-hinweis">
      Dein Code. Trag ihn auf jedem weiteren Gerät einmal ein, oder schick dir
      den Link – ein Tippen darauf richtet das Gerät ein.
    </p>
    <div class="code-anzeige">${sicher(Abgleich.codeLesbar(Abgleich.code()))}</div>

    <div class="filter-knoepfe">
      <button type="button" class="knopf-schlicht" id="codeKopieren">Code kopieren</button>
      <button type="button" class="knopf-schlicht" id="linkKopieren">Link kopieren</button>
      <button type="button" class="knopf-schlicht" id="jetztAbgleichen">Jetzt abgleichen</button>
    </div>
    ${hinweis}

    <div class="kalender-abo">
      <h3 class="melden-titel">Apple Kalender</h3>
      <p class="filter-hinweis">
        <strong>Alles in einem Kalender:</strong> der Stundenplan der HWR,
        deine eigenen Termine und die offenen To-dos. Einmal abonniert,
        holt sich die Kalender App auch Raumwechsel und Ausfälle von selbst.
      </p>
      <p class="filter-hinweis">
        Hast du den HWR-Kalender schon separat abonniert, entferne das alte
        Abo – sonst steht jede Vorlesung doppelt drin.
      </p>
      <div class="filter-knoepfe">
        <button type="button" class="knopf-schlicht" id="kalenderAbo">
          Abo-Adresse kopieren
        </button>
        <a class="knopf-schlicht knopf-betont" id="kalenderOeffnen"
           href="${sicher(kalenderAdresse("webcal"))}">In Kalender öffnen</a>
      </div>
      <p class="filter-hinweis">
        Es geht nur in eine Richtung: von hier in den Kalender. Was du in
        der Kalender App einträgst, kommt nicht zurück – dafür bräuchte ich
        dein iCloud-Passwort, und das nehme ich nicht an.
      </p>
    </div>

    <p class="filter-hinweis geraete-warnung">
      Bewahr den Code auf, etwa im Passwortspeicher. Wer ihn hat, sieht deine
      Notizen – und ohne ihn kommst du an die abgelegten Einträge nicht mehr
      heran, falls dieser Browser einmal geleert wird.
    </p>
    <div class="filter-knoepfe">
      <button type="button" class="knopf-schlicht knopf-gefahr" id="abgleichAus">
        Abgleich ausschalten
      </button>
    </div>`;
}

/* Zeichnet den Benachrichtigungsteil im Geräte-Fenster.

   Eigene Funktion und eigener Kasten, weil der Zustand erst nach Rückfrage
   beim Browser feststeht: ob eine Anmeldung besteht, muss man erfragen und
   kann es nicht wissen. Deshalb wird hier zuerst etwas Vorläufiges
   hingeschrieben und gleich danach ersetzt. */
function meldenZeichnen(meldung) {
  const bereich = document.getElementById("meldenBereich");
  if (!bereich) return;

  const rahmen = inhalt => `
    <div class="melden-kasten">
      <h3 class="melden-titel">Benachrichtigungen</h3>
      ${inhalt}
      ${meldung ? `<p class="geraete-meldung">${sicher(meldung)}</p>` : ""}
    </div>`;

  const grund = Melden.hindernis();
  if (grund) {
    bereich.innerHTML = rahmen(`
      <p class="filter-hinweis">
        Wenn sich am Stundenplan etwas ändert – Ausfall, Raumwechsel,
        verschobene Zeit –, meldet sich die App von selbst.
      </p>
      <p class="melden-hindernis">${sicher(grund)}</p>`);
    return;
  }

  bereich.innerHTML = rahmen(`<p class="filter-hinweis">Wird geprüft …</p>`);

  Melden.angemeldet().then(async an => {
    if (!an) {
      bereich.innerHTML = rahmen(`
        <p class="filter-hinweis">
          Wenn sich am Stundenplan etwas ändert – Ausfall, Raumwechsel,
          verschobene Zeit –, meldet sich die App von selbst. Ohne dass du
          nachsehen musst.
        </p>
        <div class="filter-knoepfe">
          <button type="button" class="knopf-schlicht knopf-betont" id="meldenEin">
            Benachrichtigungen einschalten
          </button>
        </div>`);
      return;
    }

    const anzahl = await Melden.anzahlGeraete();
    bereich.innerHTML = rahmen(`
      <p class="abgleich-stand abgleich-gut">
        Eingeschaltet auf diesem Gerät${anzahl > 1 ? ` · ${anzahl} Geräte insgesamt` : ""}
      </p>
      <p class="filter-hinweis">
        Schick dir eine Probe, damit du weißt, dass die Kette wirklich
        funktioniert – und nicht erst beim nächsten echten Ausfall.
      </p>
      <div class="filter-knoepfe">
        <button type="button" class="knopf-schlicht" id="meldenProbe">Probe schicken</button>
        <button type="button" class="knopf-schlicht knopf-gefahr" id="meldenAus">Ausschalten</button>
      </div>`);
  });
}

/* Schickt eine Probemeldung über den echten Weg.

   Bewusst NICHT über registration.showNotification() aus der Seite heraus:
   das würde zwar eine Mitteilung zeigen, aber nur beweisen, dass das Gerät
   Mitteilungen anzeigen kann. Die Frage ist eine andere – kommt eine
   Meldung an, die von außen losgeschickt wurde? Also geht die Probe
   denselben Weg wie der Ernstfall: über die Absenderfunktion bei Supabase
   und den Push-Dienst von Apple. */
function meldenProbeSchicken() {
  return fetch(ABGLEICH_URL + "/functions/v1/stundenplan-melden", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code: Abgleich.code(),
      titel: "Probe",
      text: "Wenn du das liest, funktionieren die Benachrichtigungen.",
      marke: "probe",
    }),
  }).then(a => a.json());
}

/* --- Das Formular für eigene Termine ------------------------------------

   Ein echtes <form> und keine lose Sammlung von Feldern. Das bringt drei
   Dinge geschenkt, die man sonst von Hand bauen müsste: die Pflichtfeld-
   Prüfung, das Absenden mit der Eingabetaste, und auf dem Handy die
   passende Tastatur samt Datums- und Uhrzeitrad.
   ---------------------------------------------------------------------- */

// Welcher Termin gerade im Formular steht, oder "" für einen neuen.
let formularKennung = "";

function terminFormularZeigen(kennung, vorgabeTag) {
  const fenster = document.getElementById("terminFormHintergrund");
  if (!fenster) return;

  const vorhandener = kennung ? terminZuEigenerKennung(kennung) : null;
  formularKennung = kennung || "";

  document.getElementById("terminFormTitel").textContent =
    vorhandener ? "Termin ändern" : "Neuer Termin";
  document.getElementById("formLoeschen").hidden = !vorhandener;

  const tag = vorhandener ? vorhandener.start.slice(0, 10)
                          : (vorgabeTag || tagesSchluessel(new Date()));

  document.getElementById("formTitel").value = vorhandener ? vorhandener.titel : "";
  document.getElementById("formDatum").value = tag;
  document.getElementById("formGanztags").checked = vorhandener
    ? Boolean(vorhandener.ganztags) : false;
  /* Voreinstellung für einen neuen Termin: die nächste volle Stunde.
     "Jetzt" wäre selten gemeint, Mitternacht nie. */
  const naechsteStunde = String(Math.min(23, new Date().getHours() + 1)).padStart(2, "0");
  document.getElementById("formVon").value = vorhandener
    ? vorhandener.start.slice(11, 16) : naechsteStunde + ":00";
  document.getElementById("formBis").value = vorhandener
    ? vorhandener.ende.slice(11, 16)
    : String(Math.min(23, new Date().getHours() + 2)).padStart(2, "0") + ":00";
  document.getElementById("formOrt").value = vorhandener ? vorhandener.ort : "";
  document.getElementById("formNotiz").value = vorhandener ? vorhandener.notiz : "";
  document.getElementById("formWichtig").checked = vorhandener
    ? Boolean(vorhandener.wichtig) : false;

  erinnerungAuswahlFuellen(vorhandener ? vorhandener.erinnerungVorgabe : "");
  zeitfelderUmschalten();
  fenster.hidden = false;

  // Auf dem Rechner gleich losschreiben können. Auf dem Handy nicht: dort
  // spränge die Tastatur hoch und verdeckte das halbe Formular.
  if (!SCHMALER_BILDSCHIRM.matches) {
    const feld = document.getElementById("formTitel");
    if (feld && feld.focus) feld.focus();
  }
}

function zeitfelderUmschalten() {
  const ganztags = document.getElementById("formGanztags").checked;
  document.getElementById("formZeiten").hidden = ganztags;
  /* Die Erinnerungsliste hängt daran: ohne Uhrzeit gibt es kein "15
     Minuten vorher". Deshalb wird sie hier mit umgestellt und nicht
     einmalig beim Öffnen. */
  erinnerungAuswahlFuellen();
  formErinnerungHinweisSetzen();
}

/* Füllt die Erinnerungsliste des Terminformulars.

   Ohne Argument bleibt die bisherige Auswahl stehen, soweit es sie in der
   neuen Liste noch gibt. Das ist der Fall, den man beim Umschalten auf
   "ganztägig" erlebt: "Am Vortag, 18:00" steht in beiden Listen und soll
   bleiben, "15 Minuten vorher" gibt es nur in einer und fällt weg. */
function erinnerungAuswahlFuellen(vorgabe) {
  const auswahl = document.getElementById("formErinnerung");
  if (!auswahl) return;

  const ganztags = document.getElementById("formGanztags").checked;
  const liste = ganztags ? ERINNERUNG_TAG : ERINNERUNG_UHRZEIT;
  const gewuenscht = vorgabe === undefined ? auswahl.value : (vorgabe || "");

  auswahl.innerHTML = liste.map(eintrag => `
    <option value="${eintrag[0]}"${
      eintrag[0] === gewuenscht ? " selected" : ""}>${eintrag[1]}</option>`).join("");

  // Stand dort etwas, das es jetzt nicht mehr gibt, greift keine Auswahl -
  // dann ausdrücklich auf "keine" stellen statt auf den ersten Eintrag.
  if (auswahl.value !== gewuenscht) auswahl.value = "";
}

/* Wie erinnerungHinweisSetzen() beim To-do, nur für das Terminformular.
   Zwei Funktionen für dasselbe sind unschön, aber die Felder heißen
   anders und der Bezug ist ein anderer: dort ein Tag, hier ein Zeitpunkt. */
function formErinnerungHinweisSetzen() {
  const hinweis = document.getElementById("formErinnerungHinweis");
  if (!hinweis) return;

  const auswahl = document.getElementById("formErinnerung");
  const ganztags = document.getElementById("formGanztags").checked;
  const tag = document.getElementById("formDatum").value;
  const von = document.getElementById("formVon").value;

  const bezug = ganztags ? tag : (tag && von ? tag + "T" + von : "");
  const zeitpunkt = erinnerungZeitpunkt(auswahl ? auswahl.value : "", bezug);
  if (!zeitpunkt) { hinweis.textContent = ""; return; }

  const vergangen = zeitpunkt < new Date().toISOString().slice(0, 16);
  hinweis.textContent = vergangen
    ? "Dieser Zeitpunkt ist schon vorbei – es kommt keine Meldung mehr."
    : "Meldet sich " + zeitpunktLesbar(zeitpunkt) + ".";
  hinweis.classList.toggle("erinnerung-vorbei", vergangen);
}

function terminFormularSpeichern() {
  const titel = document.getElementById("formTitel").value;
  const tag = document.getElementById("formDatum").value;
  const ganztags = document.getElementById("formGanztags").checked;
  const von = document.getElementById("formVon").value || "09:00";
  const bis = document.getElementById("formBis").value || "10:00";

  if (!titel.trim() || !tag) return false;

  terminSetzen(formularKennung || neueTerminKennung(), {
    titel: titel,
    // Ganztägig heißt hier: von Mitternacht bis kurz vor Mitternacht. So
    // bleibt die Form dieselbe wie bei allen anderen Terminen, und nur
    // das Feld "ganztags" entscheidet über die Darstellung.
    start: tag + "T" + (ganztags ? "00:00" : von),
    ende: tag + "T" + (ganztags ? "23:59" : bis),
    ganztags: ganztags,
    ort: document.getElementById("formOrt").value,
    notiz: document.getElementById("formNotiz").value,
    wichtig: document.getElementById("formWichtig").checked,
    erinnerungVorgabe: document.getElementById("formErinnerung").value,
  });

  document.getElementById("terminFormHintergrund").hidden = true;
  formularKennung = "";
  allesZeichnen();
  return true;
}

function terminFormVerbinden() {
  const fenster = document.getElementById("terminFormHintergrund");
  if (!fenster) return;

  document.getElementById("terminNeu").addEventListener("click", () => {
    /* Als Tag wird der Montag der angezeigten Woche genommen, nicht
       stur heute: blättert man in die nächste Woche und legt dort etwas
       an, ist fast nie der heutige Tag gemeint. Ist die laufende Woche
       zu sehen, bleibt es bei heute. */
    const heute = tagesSchluessel(new Date());
    const montagDerAnsicht = tagesSchluessel(angezeigterMontag);
    const montagHeute = tagesSchluessel(montagDerWoche(new Date()));
    terminFormularZeigen("", montagDerAnsicht === montagHeute ? heute : montagDerAnsicht);
  });

  document.getElementById("terminFormSchliessen").addEventListener("click", () => {
    fenster.hidden = true;
    formularKennung = "";
  });
  fenster.addEventListener("click", ereignis => {
    if (ereignis.target === fenster) { fenster.hidden = true; formularKennung = ""; }
  });

  document.getElementById("formGanztags")
    .addEventListener("change", zeitfelderUmschalten);

  /* Die Hinweiszeile muss auf alles reagieren, was den Zeitpunkt
     verschiebt: Auswahl, Tag und Anfangszeit. */
  for (const feldName of ["formErinnerung", "formDatum", "formVon"]) {
    const feld = document.getElementById(feldName);
    if (feld) feld.addEventListener("change", formErinnerungHinweisSetzen);
  }

  document.getElementById("terminForm").addEventListener("submit", ereignis => {
    // Ohne das lädt der Browser die Seite neu und alles ist weg.
    ereignis.preventDefault();
    terminFormularSpeichern();
  });

  document.getElementById("formLoeschen").addEventListener("click", () => {
    if (!formularKennung) return;
    const vorhandener = terminZuEigenerKennung(formularKennung);
    if (!confirm("Termin „" + (vorhandener ? vorhandener.titel : "") + "“ löschen?")) return;
    // Leerer Titel löscht – dieselbe Regel wie bei Notizen und Aufgaben.
    terminSetzen(formularKennung, { titel: "", start: "" });
    fenster.hidden = true;
    formularKennung = "";
    allesZeichnen();
  });
}

/* Der stille Hinweis im To-do-Bereich, solange nichts eingerichtet ist.
   Steht dort und nicht im Kopf, weil er nur die To-dos betrifft. */
function abgleichHinweisZeichnen() {
  const zeile = document.getElementById("abgleichHinweis");
  if (!zeile) return;
  const aus = !Abgleich.code();
  zeile.hidden = !aus;
  if (aus) {
    zeile.innerHTML = `Diese Einträge gelten nur auf diesem Gerät.
      <button type="button" class="knopf-verweis" id="abgleichHinweisKnopf">Abgleich einrichten</button>`;
  }
}

/* Ein Code in der Adresse (…#code=ABCDE…) richtet das Gerät ein.

   Das ist der bequeme Weg vom ersten aufs zweite Gerät: Link kopieren,
   sich selbst schicken, antippen. Danach wird der Anhang aus der Adresse
   entfernt – er soll nicht im Verlauf oder in einem Lesezeichen landen.

   Steht schon ein anderer Code auf dem Gerät, wird gefragt. Ein Link, den
   jemand anders schickt, soll nicht unbemerkt deinen Code ersetzen. */
function codeAusAdresseUebernehmen() {
  const treffer = /[#&]code=([A-Za-z0-9-]+)/.exec(location.hash || "");
  if (!treffer) return false;

  const neuerCode = Abgleich.codeNormalisieren(treffer[1]);
  const alterCode = Abgleich.code();

  // Anhang in jedem Fall wegräumen, auch wenn der Code nicht übernommen wird.
  try { history.replaceState(null, "", location.pathname + location.search); }
  catch (fehler) { /* dann bleibt er eben stehen */ }

  if (!neuerCode || neuerCode === alterCode) return false;
  if (alterCode && !confirm(
        "Dieser Link richtet den Abgleich mit einem anderen Code ein.\n\n"
        + "Deine bisherigen Einträge bleiben erhalten und werden mit dem "
        + "neuen Gerät zusammengeführt. Übernehmen?")) {
    return false;
  }

  return Abgleich.codeSetzen(neuerCode);
}

function geraeteVerbinden() {
  const fenster = document.getElementById("geraeteHintergrund");
  if (!fenster) return;

  function oeffnen() {
    faecherBereichZeichnen();
    uniplanBereichZeichnen();
    aenderungenBereichZeichnen();
    geraeteZeichnen();
    meldenZeichnen();
    erinnerungsdienstZeichnen();
    themaZeichnen();
    fenster.hidden = false;
  }

  document.getElementById("geraeteOeffnen").addEventListener("click", oeffnen);
  document.getElementById("geraeteSchliessen").addEventListener("click", () => {
    fenster.hidden = true;
  });
  fenster.addEventListener("click", ereignis => {
    if (ereignis.target === fenster) fenster.hidden = true;
  });

  // Alle Knöpfe im Fenster über einen Zuhörer – der Inhalt wird ja bei
  // jeder Änderung neu gezeichnet, einzeln angehängte Zuhörer wären weg.
  document.getElementById("geraeteInhalt").addEventListener("click", ereignis => {
    const ziel = ereignis.target;
    if (!ziel || !ziel.id) return;

    if (ziel.id === "abgleichEin") {
      Abgleich.codeSetzen(Abgleich.codeErzeugen());
      geraeteZeichnen("Eingerichtet. Deine Einträge werden gerade hochgeladen.");
      Abgleich.sofort().then(() => { geraeteZeichnen(); allesZeichnen(); });
      abgleichHinweisZeichnen();
      meldenZeichnen();
      return;
    }

    if (ziel.id === "codeUebernehmen") {
      const feld = document.getElementById("codeFeld");
      if (!Abgleich.codeSetzen(feld ? feld.value : "")) {
        geraeteZeichnen("Der Code sieht nicht vollständig aus – er hat 25 Zeichen.");
        return;
      }
      geraeteZeichnen("Übernommen. Wird zusammengeführt …");
      Abgleich.sofort().then(() => { geraeteZeichnen(); allesZeichnen(); });
      abgleichHinweisZeichnen();
      meldenZeichnen();
      return;
    }

    if (ziel.id === "codeKopieren") {
      inZwischenablage(Abgleich.codeLesbar(Abgleich.code()))
        .then(geklappt => geraeteZeichnen(geklappt
          ? "Code kopiert." : "Kopieren ging nicht – markier ihn von Hand."));
      return;
    }

    if (ziel.id === "linkKopieren") {
      inZwischenablage(abgleichLink())
        .then(geklappt => geraeteZeichnen(geklappt
          ? "Link kopiert. Schick ihn dir aufs andere Gerät."
          : "Kopieren ging nicht – markier den Code von Hand."));
      return;
    }

    if (ziel.id === "kalenderAbo") {
      inZwischenablage(kalenderAdresse("https"))
        .then(geklappt => geraeteZeichnen(geklappt
          ? "Adresse kopiert. In der Kalender App: Ablage → Neues Kalenderabo."
          : "Kopieren ging nicht."));
      return;
    }

    if (ziel.id === "jetztAbgleichen") {
      geraeteZeichnen("Wird abgeglichen …");
      Abgleich.sofort().then(() => { geraeteZeichnen(); allesZeichnen(); });
      return;
    }

    if (ziel.id === "abgleichAus") {
      if (!confirm("Abgleich ausschalten?\n\n"
                   + "Die Einträge bleiben auf diesem Gerät und auch in der "
                   + "Ablage. Sie werden nur nicht mehr abgeglichen.")) return;
      Abgleich.codeLoeschen();
      geraeteZeichnen();
      abgleichHinweisZeichnen();
      meldenZeichnen();
      return;
    }
  });

  /* Die Knöpfe für Benachrichtigungen. Eigener Zuhörer, weil sie in einem
     eigenen Kasten stehen, der unabhängig neu gezeichnet wird. */
  const meldenBereich = document.getElementById("meldenBereich");
  if (meldenBereich) {
    meldenBereich.addEventListener("click", async ereignis => {
      const ziel = ereignis.target;
      if (!ziel || !ziel.id) return;

      if (ziel.id === "meldenEin") {
        /* Ohne Umweg: Notification.requestPermission() verlangt eine
           unmittelbare Nutzerhandlung. Ein await davor, und der Browser
           lehnt stillschweigend ab. */
        const ergebnis = await Melden.einschalten();
        meldenZeichnen(ergebnis.meldung);
        return;
      }

      if (ziel.id === "meldenAus") {
        const ergebnis = await Melden.ausschalten();
        meldenZeichnen(ergebnis.meldung);
        return;
      }

      if (ziel.id === "meldenProbe") {
        ziel.disabled = true;
        try {
          const antwort = await meldenProbeSchicken();
          meldenZeichnen(antwort && antwort.zugestellt > 0
            ? "Probe verschickt – sie sollte gleich ankommen."
            : "Verschickt, aber kein Gerät hat sie angenommen: "
              + JSON.stringify(antwort));
        } catch (fehler) {
          meldenZeichnen("Probe ging nicht raus: " + (fehler && fehler.message || fehler));
        }
        return;
      }
    });
  }

  /* Ein Code-Link, der auf eine SCHON OFFENE Seite trifft.

     Beim Ausprobieren aufgefallen: tippt man den Link an, während die Seite
     bereits offen ist, lädt der Browser sie nicht neu – er tauscht nur den
     Anhang hinter dem Rautezeichen aus. starten() läuft dann kein zweites
     Mal, und der Code wird nie übernommen. Der Link wirkt wie kaputt.

     Genau der Fall ist der wahrscheinliche: die App liegt auf dem
     Home-Bildschirm oder in einem offenen Tab, und der Link kommt per
     Nachricht hinterher. */
  window.addEventListener("hashchange", () => {
    if (!codeAusAdresseUebernehmen()) return;
    geraeteZeichnen("Übernommen. Wird zusammengeführt …");
    fenster.hidden = false;
    Abgleich.sofort().then(() => { geraeteZeichnen(); allesZeichnen(); });
  });

  // Der Verweis aus dem To-do-Bereich öffnet dasselbe Fenster.
  document.getElementById("todoInhalt").addEventListener("click", ereignis => {
    if (ereignis.target && ereignis.target.id === "abgleichHinweisKnopf") oeffnen();
  });
  const hinweisZeile = document.getElementById("abgleichHinweis");
  if (hinweisZeile) {
    hinweisZeile.addEventListener("click", ereignis => {
      if (ereignis.target && ereignis.target.id === "abgleichHinweisKnopf") oeffnen();
    });
  }
}


/* -------------------------------------------------------------------------
   7. Start
   ------------------------------------------------------------------------- */

/* Zeichnet alles neu, was gerade zu sehen sein könnte. Die Reiterzahlen
   immer, denn die stehen über allen Bereichen. */
function allesZeichnen() {
  naechstenZeichnen();
  startZeichnen();
  trainingZeichnen();
  wocheZeichnen();
  zettelZeichnen();
  todosZeichnen();
  verlaufZeichnen();
  reiterZahlenSetzen();
  abgleichHinweisZeichnen();
}

/* Wechselt den Bereich. Die drei Abschnitte liegen alle in der Seite und
   werden nur ein- und ausgeblendet – so bleibt der Wechsel sofort da, ohne
   Nachladen. */
function seiteSetzen(neueSeite) {
  seite = neueSeite;
  try {
    localStorage.setItem(SPEICHER_SEITE, seite);
    localStorage.setItem(SPEICHER_SEITE_ZEIT, String(Date.now()));
  } catch (fehler) { /* dann startet die App eben wieder bei der Übersicht */ }

  const bereiche = {
    start: "seiteStart",
    plan: "seitePlan",
    training: "seiteTraining",
    zettel: "seiteZettel",
    todos: "seiteTodos",
  };
  for (const name of Object.keys(bereiche)) {
    const bereich = document.getElementById(bereiche[name]);
    if (bereich) bereich.hidden = name !== seite;
  }

  for (const knopf of document.querySelectorAll("[data-seite]")) {
    const aktiv = knopf.getAttribute("data-seite") === seite;
    knopf.classList.toggle("reiter-aktiv", aktiv);
    knopf.setAttribute("aria-selected", aktiv ? "true" : "false");
  }

  // Beim Öffnen nachfragen – trainingAbholen() lässt es, wenn der Stand frisch ist.
  if (seite === "training" || seite === "start") trainingAbholen(false);

  allesZeichnen();
}

/* Schaltet die Notiz-Knöpfe im Plan ein und aus. */
function bearbeitenUmschalten() {
  bearbeitenModus = !bearbeitenModus;
  // Beim Verlassen ein offenes Textfeld schließen, sonst bliebe es hängen.
  if (!bearbeitenModus) offeneNotiz = null;

  const knopf = document.getElementById("bearbeitenSchalter");
  if (knopf) {
    knopf.textContent = bearbeitenModus ? "Fertig" : "Bearbeiten";
    knopf.classList.toggle("knopf-aktiv", bearbeitenModus);
  }
  wocheZeichnen();
}

function kopfZeichnen() {
  const grossgeschrieben = STUNDENPLAN.fachrichtung.charAt(0).toUpperCase()
                         + STUNDENPLAN.fachrichtung.slice(1);
  const semesterZahl = STUNDENPLAN.semester.replace("semester", "");

  document.getElementById("planName").textContent =
    grossgeschrieben + " · Semester " + semesterZahl;

  /* Wie alt der angezeigte Stand ist.

     Das ist mehr als Zierde: die Automatik bei GitHub führt Zeitplan-Termine
     nur "nach Möglichkeit" aus. Bleibt sie länger aus, soll man das sehen und
     nicht einem Plan vertrauen, der womöglich überholt ist. Ab einem halben
     Tag ohne Prüfung wird der Hinweis deutlich. */
  const geprueft = alsDatum(STUNDENPLAN.geprueftAm);
  const stundenHer = (new Date() - geprueft) / 3600000;

  let alter;
  if (stundenHer < 1) alter = "gerade eben geprüft";
  else if (stundenHer < 24) alter = "vor " + Math.round(stundenHer) + " Std. geprüft";
  else alter = "vor " + Math.round(stundenHer / 24) + " Tagen geprüft";

  const anzeige = document.getElementById("planStand");
  anzeige.textContent = alter + " · " + sichtbareTermine().length + " Termine";
  anzeige.classList.toggle("kopf-stand-alt", stundenHer >= 12);
  anzeige.title = "Zuletzt geprüft: " + zeitpunktLesbar(STUNDENPLAN.geprueftAm);
}

/* Schaltet zwischen Liste und Kalender um und hebt den aktiven Knopf hervor. */
function ansichtSetzen(neueAnsicht) {
  ansicht = neueAnsicht;
  try { localStorage.setItem(SPEICHER_ANSICHT, ansicht); }
  catch (fehler) { /* dann gilt die Wahl nur bis zum Neuladen */ }

  for (const knopf of document.querySelectorAll("[data-ansicht]")) {
    const aktiv = knopf.getAttribute("data-ansicht") === ansicht;
    knopf.classList.toggle("schalter-aktiv", aktiv);
    knopf.setAttribute("aria-pressed", aktiv ? "true" : "false");
  }

  wocheZeichnen();
}

/* Hängt alles an, was zum Notizbuch gehört.

   Wie überall in dieser App laufen die Knöpfe über einen einzigen Zuhörer
   je Bereich und nicht über einen je Knopf: der Inhalt wird bei jeder
   Änderung neu gezeichnet, einzeln angehängte Zuhörer wären danach weg. */
function zettelVerbinden() {
  const liste = document.getElementById("zettelListe");
  if (liste) {
    liste.addEventListener("click", ereignis => {
      const ziel = ereignis.target && ereignis.target.closest
        ? ereignis.target.closest("#zettelFilterWeg,[data-zettel-oeffnen]") : null;
      if (!ziel) return;
      if (ziel.id === "zettelFilterWeg") {
        zettelFilter = "";
        zettelZeichnen();
        return;
      }
      zettelFensterZeigen(ziel.getAttribute("data-zettel-oeffnen"));
    });

    /* Die Karten sind Knöpfe (role="button"), also müssen sie sich auch
       mit der Tastatur öffnen lassen – sonst kommt man mit Tab hin, aber
       nicht hinein. Dieselbe Überlegung wie bei den Kalenderkästchen. */
    liste.addEventListener("keydown", ereignis => {
      if (ereignis.key !== "Enter" && ereignis.key !== " ") return;
      const karte = ereignis.target.closest
        ? ereignis.target.closest("[data-zettel-oeffnen]") : null;
      if (!karte) return;
      ereignis.preventDefault();
      zettelFensterZeigen(karte.getAttribute("data-zettel-oeffnen"));
    });
  }

  const suchfeld = document.getElementById("zettelSuchfeld");
  if (suchfeld) {
    suchfeld.addEventListener("input", () => {
      zettelSuche = suchfeld.value;
      zettelZeichnen();
    });
  }

  const neuKnopf = document.getElementById("zettelNeu");
  if (neuKnopf) {
    neuKnopf.addEventListener("click", () => {
      /* Wird gerade nach einem Modul gefiltert, bekommt die neue Notiz
         dieses Modul gleich mit. Man ist ja offensichtlich dabei, sich
         etwas dazu zu notieren. */
      zettelFensterZeigen("", zettelFilter ? [zettelFilter] : []);
    });
  }

  const fenster = document.getElementById("zettelHintergrund");
  if (fenster) {
    document.getElementById("zettelSchliessen")
      .addEventListener("click", zettelFensterSchliessen);
    fenster.addEventListener("click", ereignis => {
      if (ereignis.target === fenster) zettelFensterSchliessen();
    });

    /* Jede Eingabe in Überschrift oder Text stößt das Speichern an. Der
       Zuhörer hängt am Kasten drumherum, der bleibt – die Felder selbst
       werden beim Verknüpfen neu gezeichnet. */
    document.getElementById("zettelInhalt").addEventListener("input", ereignis => {
      const feld = ereignis.target;
      if (feld && (feld.id === "zettelTitel" || feld.id === "zettelFeld")) {
        const vermerk = document.getElementById("zettelGesichert");
        if (vermerk) vermerk.textContent = "";
        zettelAutomatischSichern();
      }
    });
    document.getElementById("zettelInhalt").addEventListener("change", ereignis => {
      if (ereignis.target && ereignis.target.id === "zettelWichtig") {
        zettelSichernUndMelden();
      }
    });

    document.getElementById("zettelInhalt").addEventListener("click", ereignis => {
      const ziel = ereignis.target && ereignis.target.closest
        ? ereignis.target.closest("#verweisNeu,#zettelLoeschen,"
                                  + "[data-verweis-weg],[data-verweis-oeffnen],"
                                  + "[data-zettel-oeffnen]") : null;
      if (!ziel) return;

      if (ziel.id === "verweisNeu") {
        // Vor dem zweiten Fenster retten, was im Textfeld steht.
        zettelWerteLesen();
        verweisFensterZeigen();
        return;
      }

      if (ziel.id === "zettelLoeschen") {
        if (!confirm("Diese Notiz löschen?\n\n"
                     + "Sie verschwindet auch auf deinen anderen Geräten.")) return;
        // Eine noch ausstehende Sicherung würde die Notiz sonst gleich
        // wieder anlegen.
        if (zettelSicherungsmarke) {
          clearTimeout(zettelSicherungsmarke);
          zettelSicherungsmarke = null;
        }
        zettelSetzen(offenerZettel, { text: "", verweise: [] });
        offenerZettel = "";
        fenster.hidden = true;
        allesZeichnen();
        return;
      }

      const wegzunehmen = ziel.getAttribute("data-verweis-weg");
      if (wegzunehmen) { verweisUmschalten(wegzunehmen); return; }

      const zuFolgen = ziel.getAttribute("data-verweis-oeffnen");
      if (zuFolgen) { verweisFolgen(zuFolgen); return; }

      const rueckverweis = ziel.getAttribute("data-zettel-oeffnen");
      if (rueckverweis) {
        zettelSichern();
        zettelFensterZeigen(rueckverweis);
      }
    });
  }

  const auswahl = document.getElementById("verweisHintergrund");
  if (auswahl) {
    document.getElementById("verweisSchliessen").addEventListener("click", () => {
      auswahl.hidden = true;
    });
    auswahl.addEventListener("click", ereignis => {
      if (ereignis.target === auswahl) auswahl.hidden = true;
    });

    const feld = document.getElementById("verweisSuchfeld");
    if (feld) {
      feld.addEventListener("input", () => {
        verweisSuche = feld.value;
        verweisListeZeichnen();
      });
    }

    document.getElementById("verweisListe").addEventListener("click", ereignis => {
      const ziel = ereignis.target && ereignis.target.closest
        ? ereignis.target.closest("[data-verweis-waehlen]") : null;
      if (!ziel) return;
      verweisUmschalten(ziel.getAttribute("data-verweis-waehlen"));
    });
  }

  // Hell und dunkel: die drei Knöpfe im ⚙-Fenster.
  const themaBereich = document.getElementById("themaBereich");
  if (themaBereich) {
    themaBereich.addEventListener("click", ereignis => {
      const ziel = ereignis.target && ereignis.target.closest
        ? ereignis.target.closest("[data-thema]") : null;
      if (!ziel) return;
      themaSetzen(ziel.getAttribute("data-thema"));
    });
  }

  /* Steht die Wahl auf "Automatisch", muss ein Wechsel am Gerät sofort
     ankommen – am iPhone etwa, wenn die Zeitschaltung abends umstellt.
     Ohne das hier bliebe die App hell, bis man sie neu lädt. */
  if (window.matchMedia) {
    const dunkelAbfrage = window.matchMedia("(prefers-color-scheme: dark)");
    const reagieren = () => { if (thema === "auto") themaAnwenden(); };
    if (dunkelAbfrage.addEventListener) {
      dunkelAbfrage.addEventListener("change", reagieren);
    } else if (dunkelAbfrage.addListener) {
      dunkelAbfrage.addListener(reagieren);
    }
  }
}


function knoepfeVerbinden() {
  // Alle Notiz-Knöpfe laufen über diesen einen Zuhörer, siehe notizKlick().
  // Er hängt an beiden Bereichen, in denen Notizen vorkommen.
  document.getElementById("tage").addEventListener("click", notizKlick);
  document.getElementById("todoInhalt").addEventListener("click", notizKlick);
  document.getElementById("seiteStart").addEventListener("click", startKlick);
  const trainingBereich = document.getElementById("seiteTraining");
  trainingBereich.addEventListener("click", ereignis => {
    const ziel = ereignis.target && ereignis.target.closest
      ? ereignis.target.closest("[data-training-neu],[data-training-verlauf],[data-training-typ]")
      : null;
    if (!ziel) return;
    if (ziel.hasAttribute("data-training-neu")) { trainingAbholen(true); return; }
    if (ziel.hasAttribute("data-training-verlauf")) {
      trainingVerlaufOffen = !trainingVerlaufOffen;
      trainingZeichnen();
      window.scrollTo(0, 0);
      return;
    }
    trainingFilterTyp = ziel.getAttribute("data-training-typ") || "";
    trainingZeichnen();
  });
  trainingBereich.addEventListener("change", ereignis => {
    if (!ereignis.target || ereignis.target.id !== "trainingMuskel") return;
    trainingFilterMuskel = ereignis.target.value;
    trainingZeichnen();
  });

  /* Die Übersicht altert: "Läuft gerade" stimmt eine Stunde später nicht
     mehr. Einmal pro Minute neu zeichnen, aber nur, wenn man sie auch
     sieht – im Hintergrund wäre das verschenkter Akku. Zurück im
     Vordergrund sorgt der Abgleich ohnehin für ein Neuzeichnen, und für
     den Fall ohne Abgleich hängt hier ein eigener Zuhörer. */
  function uebersichtAuffrischen() {
    if (document.visibilityState === "hidden") return;
    if (seite === "start" || seite === "training") trainingAbholen(false);
    if (seite !== "start") return;
    naechstenZeichnen();
    startZeichnen();
  }
  setInterval(uebersichtAuffrischen, 60 * 1000);
  document.addEventListener("visibilitychange", uebersichtAuffrischen);

  for (const knopf of document.querySelectorAll("[data-seite]")) {
    knopf.addEventListener("click", () => {
      seiteSetzen(knopf.getAttribute("data-seite"));
    });
  }

  document.getElementById("bearbeitenSchalter")
    .addEventListener("click", bearbeitenUmschalten);

  /* Frisch laden erzwingen.

     Ein einfaches Neuladen genügt nicht: der Browser darf jede Datei zehn
     Minuten behalten, auf dem Home-Bildschirm oft länger. Rufen wir dagegen
     dieselbe Seite mit einem neuen Anhängsel auf, gilt sie als andere
     Adresse und wird komplett neu geholt. */
  const neuLadenKnopf = document.getElementById("neuLaden");
  if (neuLadenKnopf) {
    neuLadenKnopf.addEventListener("click", () => {
      location.href = location.pathname + "?frisch=" + Date.now();
    });
  }

  /* Wechselt der Bildschirm die Größenklasse – Handy gedreht, Fenster
     verkleinert –, gilt eine andere Stundenhöhe. Die steckt in festen
     Pixelwerten im HTML, also muss neu gezeichnet werden. matchMedia meldet
     sich genau beim Überschreiten der Grenze und nicht bei jedem Pixel. */
  if (SCHMALER_BILDSCHIRM.addEventListener) {
    SCHMALER_BILDSCHIRM.addEventListener("change", wocheZeichnen);
  } else if (SCHMALER_BILDSCHIRM.addListener) {
    // Ältere Safari-Fassungen kennen nur diesen Weg.
    SCHMALER_BILDSCHIRM.addListener(wocheZeichnen);
  }

  /* Und bei jeder anderen Größenänderung neu nachmessen.

     matchMedia oben meldet sich nur beim Überschreiten der 520 Bildpunkte.
     Zieht man am Rechner das Fenster von 1400 auf 700 schmaler, passiert
     dort nichts – die Kalenderkästchen werden schmaler, die Zeilenzahl aus
     kalenderTexteAnpassen() stammt aber noch von vorher. Ein volles
     Neuzeichnen braucht es dafür nicht, nur ein neues Ausmessen. */
  let messmarke = null;
  window.addEventListener("resize", () => {
    if (ansicht !== "kalender" || seite !== "plan") return;
    if (messmarke) clearTimeout(messmarke);
    messmarke = setTimeout(kalenderTexteAnpassen, 150);
  });

  for (const knopf of document.querySelectorAll("[data-ansicht]")) {
    knopf.addEventListener("click", () => {
      ansichtSetzen(knopf.getAttribute("data-ansicht"));
    });
  }

  document.getElementById("wocheZurueck").addEventListener("click", () => {
    angezeigterMontag = tageDazu(angezeigterMontag, -7);
    wocheZeichnen();
  });

  document.getElementById("wocheVor").addEventListener("click", () => {
    angezeigterMontag = tageDazu(angezeigterMontag, 7);
    wocheZeichnen();
  });

  document.getElementById("wocheHeute").addEventListener("click", () => {
    angezeigterMontag = montagDerWoche(new Date());
    /* Wer auf "Heute" tippt, will heute oben sehen - auch wenn er die
       vergangenen Tage vorhin aufgeklappt hatte. */
    vergangeneOffenFuer = "";
    wocheZeichnen();
  });

  const fenster = document.getElementById("filterHintergrund");

  // Geöffnet wird die Fächerauswahl aus den Einstellungen, siehe
  // faecherBereichZeichnen(). Beim Schließen dort die Zahl nachziehen.
  function fensterSchliessen() {
    fenster.hidden = true;
    faecherBereichZeichnen();
  }

  document.getElementById("faecherBereich").addEventListener("click", ereignis => {
    if (!ereignis.target || ereignis.target.id !== "faecherOeffnen") return;
    filterZeichnen();
    fenster.hidden = false;
  });

  document.getElementById("filterSchliessen").addEventListener("click", fensterSchliessen);

  const verlaufFenster = document.getElementById("verlaufHintergrund");
  document.getElementById("aenderungenBereich").addEventListener("click", ereignis => {
    if (ereignis.target && ereignis.target.id === "verlaufOeffnen") verlaufFensterZeigen();
  });
  document.getElementById("verlaufSchliessen").addEventListener("click", () => {
    verlaufFenster.hidden = true;
  });
  verlaufFenster.addEventListener("click", ereignis => {
    if (ereignis.target === verlaufFenster) verlaufFenster.hidden = true;
  });

  // Ein Klick neben das Fenster schließt es ebenfalls.
  fenster.addEventListener("click", ereignis => {
    if (ereignis.target === fenster) fensterSchliessen();
  });

  /* Das Detailfenster eines Kalendertermins. Geöffnet wird es in
     notizKlick(), geschlossen hier. */
  const terminFenster = document.getElementById("terminHintergrund");
  if (terminFenster) {
    document.getElementById("terminSchliessen").addEventListener("click", () => {
      terminFenster.hidden = true;
    });
    terminFenster.addEventListener("click", ereignis => {
      if (ereignis.target === terminFenster) terminFenster.hidden = true;
    });
    document.getElementById("terminInhalt").addEventListener("click", ereignis => {
      const ziel = ereignis.target.closest
        ? ereignis.target.closest("[data-notiz-bearbeiten],[data-termin-bearbeiten],"
                                  + "[data-zettel-oeffnen],[data-zettel-neu],"
                                  + "[data-zettel-fach]") : null;
      if (!ziel) return;

      // Eine verknüpfte Notiz öffnen.
      const zuOeffnen = ziel.getAttribute("data-zettel-oeffnen");
      if (zuOeffnen) {
        terminFenster.hidden = true;
        zettelFensterZeigen(zuOeffnen);
        return;
      }

      // Eine neue Notiz, schon verknüpft mit Termin oder Modul.
      const neueNotiz = ziel.getAttribute("data-zettel-neu");
      if (neueNotiz) {
        terminFenster.hidden = true;
        zettelFensterZeigen("", [neueNotiz]);
        return;
      }

      // Alle Notizen des Moduls im Notizbereich zeigen.
      const zumFach = ziel.getAttribute("data-zettel-fach");
      if (zumFach) {
        terminFenster.hidden = true;
        zettelFilterSetzen("fach:" + zumFach);
        return;
      }

      const eigener = ziel.getAttribute("data-termin-bearbeiten");
      if (eigener) {
        terminFenster.hidden = true;
        terminFormularZeigen(eigener);
        return;
      }
      zurNotizSpringen(ziel.getAttribute("data-notiz-bearbeiten"));
    });
  }

  /* Die Kalenderkästchen sind Knöpfe (role="button"), also müssen sie sich
     auch mit der Tastatur bedienen lassen – sonst kommt man mit Tab hin,
     aber nicht hinein. */
  document.getElementById("tage").addEventListener("keydown", ereignis => {
    if (ereignis.key !== "Enter" && ereignis.key !== " ") return;
    const kasten = ereignis.target.closest
      ? ereignis.target.closest("[data-termin]") : null;
    if (!kasten) return;
    ereignis.preventDefault();
    terminFensterZeigen(kasten.getAttribute("data-termin"));
  });

  document.getElementById("filterAlle").addEventListener("click", () => {
    abgewaehlteFaecher = new Set();
    filterSpeichern();
    filterZeichnen();
    allesZeichnen();
  });

  document.getElementById("filterKeine").addEventListener("click", () => {
    abgewaehlteFaecher = new Set(STUNDENPLAN.termine.map(t => t.titel));
    filterSpeichern();
    filterZeichnen();
    allesZeichnen();
  });
}

function starten() {
  if (typeof STUNDENPLAN === "undefined") {
    document.querySelector("main").innerHTML = `<p class="leer-text">
      Noch keine Daten. Führe einmal <code>python3 abgleich.py</code> aus.
    </p>`;
    return;
  }

  // Erst jetzt sind die Daten da – also erst jetzt die Voreinstellung setzen
  // und die gespeicherte Auswahl laden.
  NICHT_BELEGTE_FAECHER = STUNDENPLAN.nichtBelegteFaecher || [];
  NICHT_BELEGTE_GRUPPEN = STUNDENPLAN.nichtBelegteGruppen || [];
  /* Einmalige Sicherung, bevor die neue Fassung zum ersten Mal schreibt.

     Sie kostet ein paar Kilobyte und liegt unangetastet daneben. Sollte
     beim Umstieg auf eigene Termine etwas schieflaufen, steht hier noch
     genau der Stand, den die vorige Fassung hinterlassen hat. */
  try {
    if (!localStorage.getItem(SPEICHER_SICHERUNG)) {
      localStorage.setItem(SPEICHER_SICHERUNG, JSON.stringify({
        angelegtAm: new Date().toISOString(),
        notizen: localStorage.getItem(SPEICHER_NOTIZEN),
        aufgaben: localStorage.getItem(SPEICHER_AUFGABEN),
        grabsteine: localStorage.getItem(SPEICHER_GRABSTEINE),
      }));
    }
  } catch (fehler) { /* dann eben ohne – der Abgleich hat ohnehin eine Kopie */ }

  notizen = notizenLaden();
  aufgaben = aufgabenLaden();
  grabsteine = grabsteineLaden();
  eigeneTermine = eigeneTermineLaden();
  zettel = zettelLaden();
  abgewaehlteFaecher = filterLaden();
  training = trainingLaden();
  if (training) trainingZustand = "ok";
  uniplan = uniplanLaden();

  /* Das Thema steht schon am <html>, gesetzt vom kurzen Skript im Kopf der
     index.html. Hier wird es nur noch in die Variable geholt, damit der
     Schalter im ⚙-Fenster den richtigen Knopf hervorhebt – und einmal neu
     angewendet, weil erst jetzt das Stilblatt geladen ist und die
     Statusleistenfarbe ausgelesen werden kann. */
  thema = themaLaden();
  themaAnwenden();

  // Ein Code in der Adresse muss vor Abgleich.einrichten() gelesen werden –
  // sonst startet der Abgleich noch mit dem alten Code oder gar keinem.
  codeAusAdresseUebernehmen();

  try {
    const gemerkt = localStorage.getItem(SPEICHER_ANSICHT);
    if (gemerkt === "kalender" || gemerkt === "liste") ansicht = gemerkt;

    /* Der zuletzt offene Reiter gilt nur, wenn das kurz her ist – siehe
       ZURUECK_ZUR_UEBERSICHT_NACH. Fehlt die Zeit, stammt der Eintrag aus
       der Fassung vor der Übersicht; auch dann geht es dort los. */
    seite = startseiteWaehlen(localStorage.getItem(SPEICHER_SEITE),
                              localStorage.getItem(SPEICHER_SEITE_ZEIT), Date.now());
  } catch (fehler) { /* dann bleibt es bei Liste und Übersicht */ }

  kopfZeichnen();
  knoepfeVerbinden();
  geraeteVerbinden();
  terminFormVerbinden();
  zettelVerbinden();
  uniplanVerbinden();
  // ansichtSetzen hebt den richtigen Ansichts-Knopf hervor, seiteSetzen den
  // richtigen Reiter – und ruft am Ende allesZeichnen() auf. Deshalb steht
  // hier kein weiterer Zeichen-Aufruf.
  ansichtSetzen(ansicht);
  reiterSichtbarkeitSetzen();
  seiteSetzen(seite);

  /* Und erst jetzt der Abgleich: er darf nicht loslaufen, bevor notizen,
     aufgaben und grabsteine geladen sind. Täte er es, sammelte er einen
     leeren Stand ein – und würde damit in der Ablage alles überschreiben. */
  Abgleich.einrichten({
    sammeln: abgleichSammeln,
    uebernehmen: abgleichUebernehmen,
    // Läuft nur, wenn der Abgleich hier tatsächlich etwas verändert hat.
    fertig: function () { allesZeichnen(); geraeteZeichnen(); },
  });

  /* Trainingsdaten erst nach dem Abgleich-Start: ein Gerät, das gerade
     per Link seinen Code bekommen hat, soll schon mit diesem fragen. */
  trainingAbholen(false);
}

/* Lädt daten/plan.js nach und ruft danach starten() auf.

   Warum nicht einfach ein <script>-Tag in der index.html? Wegen des
   Zwischenspeichers: GitHub Pages sagt dem Browser "diese Datei darfst du
   zehn Minuten behalten". Nach einer Raumänderung würde dein Handy also noch
   eine Weile den alten Stand zeigen. Hängt man einen Zeitstempel an die
   Adresse, sieht der Browser jedes Mal eine neue Datei und holt sie frisch.

   Der Zeitstempel kommt aber nur dran, wenn die Seite aus dem Netz kommt.
   Öffnest du index.html per Doppelklick, ist die Adresse eine file-Adresse -
   und dort verwirrt ein angehängtes "?..." den Browser, die Datei würde
   gar nicht gefunden. */
function datenLaden(wennFertig) {
  const ausDemNetz = location.protocol === "http:" || location.protocol === "https:";
  const skript = document.createElement("script");
  skript.src = "daten/plan.js" + (ausDemNetz ? "?stand=" + Date.now() : "");

  skript.onload = wennFertig;
  skript.onerror = function () {
    document.querySelector("main").innerHTML = `<p class="leer-text">
      Die Datei <code>daten/plan.js</code> ließ sich nicht laden.
      Führe einmal <code>python3 abgleich.py</code> aus.
    </p>`;
  };

  document.head.appendChild(skript);
}

/* Merkt, wenn im Netz eine neuere Fassung liegt als die gerade laufende –
   und lädt sich dann selbst neu.

   Das Problem dahinter: GitHub Pages erlaubt dem Browser, index.html und
   app.js zehn Minuten zu behalten, auf dem Home-Bildschirm oft länger. Man
   sitzt dann vor einer alten Oberfläche und merkt es nicht, weil die Daten
   darin ja frisch sind.

   Die Lösung ist eine winzige Datei version.js, die beim Veröffentlichen
   mitgeschrieben wird und nichts als die aktuelle Kennung enthält. Sie wird
   immer mit Zeitstempel geholt, kommt also nie aus dem Zwischenspeicher.
   Stimmt sie nicht mit der laufenden Fassung überein, lädt sich die Seite
   einmal frisch.

   Das "einmal" sichert der Vermerk in sessionStorage ab: ohne ihn könnte
   die Seite sich in einer Schleife immer wieder neu laden, falls das
   Nachladen aus irgendeinem Grund die alte Fassung liefert. */
function aufNeueFassungPruefen() {
  const ausDemNetz = location.protocol === "http:" || location.protocol === "https:";
  if (!ausDemNetz || GEBAUTE_VERSION === "entwicklung") return;

  const skript = document.createElement("script");
  skript.src = "version.js?t=" + Date.now();

  skript.onload = function () {
    if (typeof SEITEN_VERSION === "undefined") return;
    if (SEITEN_VERSION === GEBAUTE_VERSION) return;

    let schonVersucht = "";
    try { schonVersucht = sessionStorage.getItem("stundenplan.neugeladen") || ""; }
    catch (fehler) { /* dann eben ohne Absicherung */ }
    if (schonVersucht === SEITEN_VERSION) return;

    try { sessionStorage.setItem("stundenplan.neugeladen", SEITEN_VERSION); }
    catch (fehler) { /* egal */ }

    location.href = location.pathname + "?frisch=" + Date.now();
  };

  // Fehlt version.js, passiert einfach nichts.
  skript.onerror = function () {};
  document.head.appendChild(skript);
}

datenLaden(function () {
  starten();
  aufNeueFassungPruefen();
});
