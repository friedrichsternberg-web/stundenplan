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

// Welche Woche gerade angezeigt wird, als Montag dieser Woche.
let angezeigterMontag = montagDerWoche(new Date());

// "liste" oder "kalender".
let ansicht = "liste";

// Welcher Bereich gerade offen ist: "plan", "todos" oder "aenderungen".
let seite = "plan";

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
  const termine = sichtbareTermine();
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
  for (const termin of sichtbareTermine()) {
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

    // Am Wochenende ist normalerweise nichts – dann bleibt der Kasten weg.
    // Steht dort aber eine eigene Aufgabe, muss der Tag sichtbar sein,
    // sonst käme man an sie nicht heran.
    if (versatz >= 5 && termineDesTages.length === 0
        && aufgabenDesTages.length === 0) continue;

    tage.push({
      datum: tag,
      schluessel: schluessel,
      termine: termineDesTages,
      aufgaben: aufgabenDesTages,
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

    const zusatzZeilen = kasten.querySelectorAll(".kalender-termin-zeile");
    for (const zeile of zusatzZeilen) zeile.hidden = false;

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
        ${eintrag.aufgaben.map(freieAufgabeZeichnen).join("")}
        ${bearbeitenModus
          ? `<div class="tag-fuss">
               <button type="button" class="notiz-neu"
                       data-aufgabe-neu="${sicher(eintrag.schluessel)}">
                 + Aufgabe für diesen Tag
               </button>
             </div>`
          : ""}
      </div>`);
  }
  return stuecke.join("");
}

function terminZeichnen(termin) {
  const details = [termin.raum, termin.dozent, termin.art]
    .filter(Boolean).join(" · ");
  return `
    <div class="termin">
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
                              + "[data-todo-haken],[data-aufgabe-neu],[data-termin]")
    : null;
  if (!ziel) return;

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
  const gibtAufgaben = tage.some(eintrag => eintrag.aufgaben.length > 0);

  const ganztagsZeile = !gibtAufgaben ? "" : `
    <div class="kalender-ganztag-ecke">Aufg.</div>
    ${tage.map(eintrag => `
      <div class="kalender-ganztag ${eintrag.istHeute ? "kalender-ganztag-heute" : ""}">
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

      const volltext = uhrzeit(termin.start) + "–" + uhrzeit(termin.ende)
                     + " " + termin.titel
                     + (termin.raum ? " · " + termin.raum : "")
                     + (termin.dozent ? " · " + termin.dozent : "")
                     + (termin.anmerkung ? " · " + termin.anmerkung : "");

      /* Antippbar. Auf dem Handy gibt es kein Überfahren mit der Maus, also
         auch keinen Hinweistext – ohne das hier bliebe ein knapper Kasten
         schlicht unlesbar. */
      return `
        <div class="kalender-termin ${termin.anmerkung ? "kalender-termin-hinweis" : ""}"
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
            ${termin.anmerkung ? `<div class="kalender-termin-zeile"><strong>${sicher(termin.anmerkung)}</strong></div>` : ""}`}
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
        <div class="termin-notiz-kopf">${istWichtig(kennung) ? "★" : "✎"} Deine Notiz</div>
        ${sicher(notizText(kennung))}
      </div>` : ""}
    <div class="filter-knoepfe">
      <button type="button" class="knopf-schlicht" data-notiz-bearbeiten="${sicher(kennung)}">
        ${notizText(kennung) ? "Notiz bearbeiten" : "Notiz hinzufügen"}
      </button>
    </div>`;

  fenster.hidden = false;
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
   6. Geräteabgleich

   Die Mechanik steckt in sync.js – Netz, Zusammenführen, Grabsteine. Hier
   steht nur die Übersetzung in beide Richtungen: aus Notizen und Aufgaben
   eine gemeinsame Sammlung machen, und aus einer gemeinsamen Sammlung
   wieder Notizen und Aufgaben.

   Der Zwischenschritt lohnt sich, weil sync.js dadurch nichts über
   Stundenpläne wissen muss. Für sie ist alles nur "Kennung, Zeitstempel,
   ein paar Felder".
   ------------------------------------------------------------------------- */

/* Trägt alles zusammen, was auf diesem Gerät steht.

   Notizen und Aufgaben landen in einer Sammlung, obwohl sie getrennt
   gespeichert sind. Das geht, weil ihre Kennungen sich nie überschneiden:
   Notizen hängen an Termin-Kennungen der HWR ("sked.de…"), freie Aufgaben
   fangen immer mit "eigen-" an. Beim Auspacken unten wird daran wieder
   auseinandersortiert. */
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

  return { v: 1, eintraege: eintraege };
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
  const neueGrabsteine = {};

  for (const kennung of Object.keys(eintraege)) {
    const eintrag = eintraege[kennung] || {};
    const zeitpunkt = Number(eintrag.geaendert) || 0;

    if (eintrag.geloescht) { neueGrabsteine[kennung] = zeitpunkt; continue; }

    // Kaputte Einträge aussortieren statt anzeigen. Ein halber Eintrag in
    // der Ablage soll nicht die ganze Liste unbrauchbar machen.
    if (typeof eintrag.text !== "string" || !eintrag.text) continue;

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
  grabsteine = neueGrabsteine;

  /* Direkt in den Speicher, nicht über notizenSpeichern() – das würde
     Abgleich.anstossen() aufrufen und damit einen Abgleich anstoßen, der
     gerade selbst läuft. Eine Schleife wäre die Folge. */
  try {
    localStorage.setItem(SPEICHER_NOTIZEN, JSON.stringify(notizen));
    localStorage.setItem(SPEICHER_AUFGABEN, JSON.stringify(aufgaben));
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
        Notizen und Aufgaben liegen bisher nur in diesem Browser. Schalte den
        Abgleich ein, dann zeigen Handy und Laptop dasselbe.
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

  function oeffnen() { geraeteZeichnen(); fenster.hidden = false; }

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
      return;
    }
  });

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

  const bereiche = { plan: "seitePlan", todos: "seiteTodos", aenderungen: "seiteAenderungen" };
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
      const knopf = ereignis.target.closest
        ? ereignis.target.closest("[data-notiz-bearbeiten]") : null;
      if (knopf) zurNotizSpringen(knopf.getAttribute("data-notiz-bearbeiten"));
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
  notizen = notizenLaden();
  aufgaben = aufgabenLaden();
  grabsteine = grabsteineLaden();
  abgewaehlteFaecher = filterLaden();

  // Ein Code in der Adresse muss vor Abgleich.einrichten() gelesen werden –
  // sonst startet der Abgleich noch mit dem alten Code oder gar keinem.
  codeAusAdresseUebernehmen();

  try {
    const gemerkt = localStorage.getItem(SPEICHER_ANSICHT);
    if (gemerkt === "kalender" || gemerkt === "liste") ansicht = gemerkt;

    const gemerkteSeite = localStorage.getItem(SPEICHER_SEITE);
    if (gemerkteSeite === "plan" || gemerkteSeite === "todos"
        || gemerkteSeite === "aenderungen") {
      seite = gemerkteSeite;
    }
  } catch (fehler) { /* dann bleibt es bei Liste und Plan */ }

  kopfZeichnen();
  knoepfeVerbinden();
  geraeteVerbinden();
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
