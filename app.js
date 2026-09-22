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
const GEBAUTE_VERSION = "3e3173cd";

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
   eine Liste und keine Zuordnung. */
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

// Welcher Bereich gerade offen ist: "plan", "zettel", "todos" oder
// "aenderungen".
let seite = "plan";

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

  const zusatz = [treffer.raum, treffer.dozent].filter(Boolean).join(" · ");

  bereich.innerHTML = `
    <div class="naechster-karte">
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

function listeBauen(tage) {
  const stuecke = [];
  for (const eintrag of tage) {
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
                 + Aufgabe für diesen Tag
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
    <div class="termin${termin.eigen ? " termin-eigen" : ""}"${
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
    geaendert: Abgleich.jetzt(),
  };

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
  return sichtbareTermine().concat(eigeneTermineAlsPlan())
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
function aufgabeSetzen(kennung, text, datum, wichtig) {
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
    vorhandene.geaendert = Abgleich.jetzt();
  } else {
    aufgaben.push({
      id: kennung,
      text: sauber,
      datum: datum || tagesSchluessel(new Date()),
      erledigt: false,
      wichtig: Boolean(wichtig),
      geaendert: Abgleich.jetzt(),
    });
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
      <div class="termin-zeit">Aufgabe</div>
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

  /* Ohne Notiz steht hier normalerweise NICHTS.

     Ein "+ Notiz" unter jedem einzelnen Termin macht die Liste unruhig –
     bei dir wären das über hundert Knöpfe für eine Handvoll Notizen.
     Deshalb erscheint er nur, wenn du oben auf "Bearbeiten" gegangen bist. */
  if (!bearbeitenModus) return "";

  return `
    <button type="button" class="notiz-neu"
            data-notiz-oeffnen="${sicher(termin.id)}">+ Notiz</button>`;
}

/* Nach dem Öffnen den Cursor ins Textfeld setzen, und zwar ans Ende des
   vorhandenen Textes – nicht an den Anfang, wo man beim Weiterschreiben
   alles verschieben würde. */
function notizfeldAktivieren() {
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
                              + "[data-termin-neu],[data-termin-bearbeiten]")
    : null;
  if (!ziel) return;

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
    const text = feld ? feld.value : "";
    const datum = datumsfeld ? datumsfeld.value : "";
    const wichtig = wichtigfeld ? Boolean(wichtigfeld.checked) : false;

    if (zuSpeichern.indexOf("neu:") === 0) {
      // Erst jetzt bekommt die Aufgabe eine Kennung.
      aufgabeSetzen(neueAufgabenKennung(), text,
                    datum || zuSpeichern.slice(4), wichtig);
    } else if (zuSpeichern.indexOf("eigen-") === 0) {
      aufgabeSetzen(zuSpeichern, text, datum, wichtig);
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

  const zeilen = [
    ["Wann", zeitpunktLesbar(termin.start) + "–" + uhrzeit(termin.ende)],
    ["Raum", termin.raum],
    ["Dozent", termin.dozent],
    ["Gruppe", termin.gruppe],
    ["Art", termin.art],
    ["Hinweis der HWR", termin.anmerkung],
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
      <h2 class="todo-ueberschrift">Meine Aufgaben</h2>
      ${offeneNotiz && offeneNotiz.indexOf("neu:") === 0 ? "" : `
        <button type="button" class="knopf-schlicht"
                data-aufgabe-neu="${sicher(tagesSchluessel(new Date()))}">
          + Neue Aufgabe
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
        Noch nichts eingetragen. Über <strong>+ Neue Aufgabe</strong> legst du
        etwas an, das an keiner Vorlesung hängt. Notizen zu einer bestimmten
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

/* Wie viele Änderungen du noch nicht gesehen hast. Die Zahl steht am Reiter
   "Änderungen"; ein Besuch dieses Bereichs setzt sie zurück. */
function ungeseheneAenderungen() {
  const bloecke = sichtbareBloecke();
  if (bloecke.length === 0) return 0;

  let zuletztGesehen = "";
  try { zuletztGesehen = localStorage.getItem(SPEICHER_GESEHEN) || ""; }
  catch (fehler) { /* egal */ }

  return bloecke
    .filter(block => block.erkanntAm > zuletztGesehen)
    .reduce((summe, block) => summe + block.eintraege.length, 0);
}

function aenderungenAlsGesehenMerken() {
  const bloecke = sichtbareBloecke();
  if (bloecke.length === 0) return;
  try { localStorage.setItem(SPEICHER_GESEHEN, bloecke[0].erkanntAm); }
  catch (fehler) { /* egal */ }
}

/* Setzt die kleinen Zahlen an den Reitern. Sie sind der Grund, warum man den
   Plan gar nicht erst aufmachen muss, um zu sehen, ob etwas ansteht. */
function reiterZahlenSetzen() {
  const offeneNotizen = Object.keys(notizen)
    .filter(kennung => !notizen[kennung].erledigt).length;
  const offeneFreie = aufgaben.filter(a => !a.erledigt).length;
  zahlSetzen("todoZahl", offeneNotizen + offeneFreie);
  zahlSetzen("zettelZahl", zettel.length);
  zahlSetzen("aenderungsZahl", ungeseheneAenderungen());
}

function zahlSetzen(elementKennung, anzahl) {
  const element = document.getElementById(elementKennung);
  if (!element) return;
  element.textContent = String(anzahl);
  element.hidden = anzahl === 0;
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
  const feld = document.getElementById("zettelFeld");
  const haken = document.getElementById("zettelWichtig");
  if (feld) offenerZettelText = feld.value;
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
    const feld = document.getElementById("zettelFeld");
    if (feld && feld.focus) feld.focus();
  }
}

function zettelFensterZeichnen() {
  const inhalt = document.getElementById("zettelInhalt");
  if (!inhalt) return;

  const vorhandener = zettelZuKennung(offenerZettel);
  const rueckverweise = zettelRueckverweise(offenerZettel);

  const titel = document.getElementById("zettelFensterTitel");
  if (titel) titel.textContent = vorhandener ? "Notiz" : "Neue Notiz";

  inhalt.innerHTML = `
    <textarea id="zettelFeld" class="zettel-feld" rows="10"
              placeholder="Die erste Zeile wird die Überschrift …"
              >${sicher(offenerZettelText)}</textarea>

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

    <div class="filter-knoepfe">
      <button type="button" class="knopf-schlicht knopf-betont" id="zettelSpeichern">
        Speichern
      </button>
      ${vorhandener ? `
        <button type="button" class="knopf-schlicht knopf-gefahr" id="zettelLoeschen">
          Löschen
        </button>` : ""}
    </div>`;
}

/* Schließt das Fenster und schreibt vorher weg.

   Das Speichern beim Schließen ist Absicht und nicht Bequemlichkeit: ein
   getippter Text, der beim Antippen von "Fertig" verschwindet, ist genau
   die Sorte Verlust, die man nicht bemerkt und nicht rückgängig machen
   kann. Die Notizen-App von Apple macht es ebenso. */
function zettelFensterSchliessen() {
  zettelSichern();
  offenerZettel = "";
  const fenster = document.getElementById("zettelHintergrund");
  if (fenster) fenster.hidden = true;
  const auswahl = document.getElementById("verweisHintergrund");
  if (auswahl) auswahl.hidden = true;
  allesZeichnen();
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
        geaendert: zeitpunkt,
      });
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
        Notizen, Aufgaben und eigene Termine liegen bisher nur in diesem
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
        deine eigenen Termine und die offenen Aufgaben. Einmal abonniert,
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
    geraeteZeichnen();
    meldenZeichnen();
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
  try { localStorage.setItem(SPEICHER_SEITE, seite); }
  catch (fehler) { /* dann startet die App eben wieder beim Plan */ }

  const bereiche = {
    plan: "seitePlan",
    zettel: "seiteZettel",
    todos: "seiteTodos",
    aenderungen: "seiteAenderungen",
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

  // Wer die Änderungen ansieht, hat sie gesehen.
  if (seite === "aenderungen") aenderungenAlsGesehenMerken();

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

    document.getElementById("zettelInhalt").addEventListener("click", ereignis => {
      const ziel = ereignis.target && ereignis.target.closest
        ? ereignis.target.closest("#verweisNeu,#zettelSpeichern,#zettelLoeschen,"
                                  + "[data-verweis-weg],[data-verweis-oeffnen],"
                                  + "[data-zettel-oeffnen]") : null;
      if (!ziel) return;

      if (ziel.id === "verweisNeu") {
        // Vor dem zweiten Fenster retten, was im Textfeld steht.
        zettelWerteLesen();
        verweisFensterZeigen();
        return;
      }

      if (ziel.id === "zettelSpeichern") { zettelFensterSchliessen(); return; }

      if (ziel.id === "zettelLoeschen") {
        if (!confirm("Diese Notiz löschen?\n\n"
                     + "Sie verschwindet auch auf deinen anderen Geräten.")) return;
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
    wocheZeichnen();
  });

  const fenster = document.getElementById("filterHintergrund");

  document.getElementById("filterOeffnen").addEventListener("click", () => {
    filterZeichnen();
    fenster.hidden = false;
  });

  document.getElementById("filterSchliessen").addEventListener("click", () => {
    fenster.hidden = true;
  });

  // Ein Klick neben das Fenster schließt es ebenfalls.
  fenster.addEventListener("click", ereignis => {
    if (ereignis.target === fenster) fenster.hidden = true;
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

    const gemerkteSeite = localStorage.getItem(SPEICHER_SEITE);
    if (gemerkteSeite === "plan" || gemerkteSeite === "zettel"
        || gemerkteSeite === "todos" || gemerkteSeite === "aenderungen") {
      seite = gemerkteSeite;
    }
  } catch (fehler) { /* dann bleibt es bei Liste und Plan */ }

  kopfZeichnen();
  knoepfeVerbinden();
  geraeteVerbinden();
  terminFormVerbinden();
  zettelVerbinden();
  // ansichtSetzen hebt den richtigen Ansichts-Knopf hervor, seiteSetzen den
  // richtigen Reiter – und ruft am Ende allesZeichnen() auf. Deshalb steht
  // hier kein weiterer Zeichen-Aufruf.
  ansichtSetzen(ansicht);
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
