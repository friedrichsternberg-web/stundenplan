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
     6. Start
   ========================================================================= */

const WOCHENTAGE = ["Sonntag", "Montag", "Dienstag", "Mittwoch",
                    "Donnerstag", "Freitag", "Samstag"];

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

// Welche Woche gerade angezeigt wird, als Montag dieser Woche.
let angezeigterMontag = montagDerWoche(new Date());

// "liste" oder "kalender".
let ansicht = "liste";

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
    if (versatz >= 5 && termineDesTages.length === 0) continue;
    tage.push({
      datum: tag,
      termine: termineDesTages,
      istHeute: schluessel === heuteSchluessel,
    });
  }

  document.getElementById("tage").innerHTML =
    ansicht === "kalender" ? kalenderBauen(tage) : listeBauen(tage);
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

    stuecke.push(`
      <div class="tag ${istHeute ? "tag-heute" : ""}">
        <div class="tag-kopf">
          <span>${WOCHENTAGE[tag.getDay()]}, ${datumKurz(tag)}${istHeute ? " · heute" : ""}</span>
          <span class="tag-kopf-zusatz">${kopfZusatz}</span>
        </div>
        ${termineDesTages.length === 0
          ? `<div class="tag-leer">Keine Veranstaltung.</div>`
          : termineDesTages.map(terminZeichnen).join("")}
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
      </div>
    </div>`;
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

  const tagSpalten = tage.map(eintrag => {
    const istHeuteSpalte = tagesSchluessel(eintrag.datum) === heuteSchluessel;

    const kaesten = spaltenVerteilen(eintrag.termine).map(platz => {
      const termin = platz.termin;
      const beginn = minutenAmTag(termin.start) - startMinute;
      const dauer = minutenAmTag(termin.ende) - minutenAmTag(termin.start);

      const oben = beginn * proMinute;
      // Zwei Bildpunkte Luft nach unten, damit sich Termine optisch nicht
      // berühren. Nach unten begrenzt, damit auch ein 30-Minuten-Termin
      // noch lesbar bleibt.
      const kastenHoehe = Math.max(dauer * proMinute - 2, 20);
      const breite = 100 / platz.spaltenGesamt;
      const links = platz.spalte * breite;

      // In einem flachen Kästchen ist neben dem Titel für nichts mehr Platz.
      // Die Grenzen wachsen mit dem Maßstab mit, damit sie auf dem Handy und
      // am großen Bildschirm gleich sinnvoll greifen.
      //
      // Reihenfolge nach Nützlichkeit: Titel, dann Raum, dann Anmerkung, und
      // die Uhrzeit zuletzt – die liest man ohnehin an der Zeitachse ab.
      const knapp = kastenHoehe < stundeHoehe * 0.8;
      const geraeumig = kastenHoehe >= stundeHoehe * 1.6;

      return `
        <div class="kalender-termin ${termin.anmerkung ? "kalender-termin-hinweis" : ""}"
             style="top:${oben}px; height:${kastenHoehe}px; left:${links}%; width:calc(${breite}% - 2px)"
             title="${sicher(uhrzeit(termin.start) + "–" + uhrzeit(termin.ende) + " " + termin.titel
                            + (termin.raum ? " · " + termin.raum : "")
                            + (termin.anmerkung ? " · " + termin.anmerkung : ""))}">
          <div class="kalender-termin-titel">${sicher(termin.titel)}</div>
          ${knapp ? "" : `
            ${termin.raum ? `<div class="kalender-termin-zeile">${sicher(termin.raum)}</div>` : ""}
            ${termin.anmerkung ? `<div class="kalender-termin-zeile"><strong>${sicher(termin.anmerkung)}</strong></div>` : ""}
            ${geraeumig ? `<div class="kalender-termin-zeile">${uhrzeit(termin.start)}–${uhrzeit(termin.ende)}</div>` : ""}`}
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
        <div class="kalender-zeitachse" style="height:${hoehe}px">
          ${stundenBeschriftung.join("")}
        </div>
        ${tagSpalten}
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

function hinweisZeichnen() {
  const bereich = document.getElementById("aenderungsHinweis");
  const bloecke = sichtbareBloecke();
  if (bloecke.length === 0) { bereich.innerHTML = ""; return; }

  let zuletztGesehen = "";
  try { zuletztGesehen = localStorage.getItem(SPEICHER_GESEHEN) || ""; }
  catch (fehler) { /* egal */ }

  const neue = bloecke.filter(block => block.erkanntAm > zuletztGesehen);
  if (neue.length === 0) { bereich.innerHTML = ""; return; }

  const anzahl = neue.reduce((summe, block) => summe + block.eintraege.length, 0);
  bereich.innerHTML = `
    <div class="hinweis">
      <div class="hinweis-titel">
        ${anzahl === 1 ? "Eine Änderung" : anzahl + " Änderungen"} seit deinem letzten Besuch
      </div>
      <div class="verlauf-detail">Die Einzelheiten stehen unten im Änderungsverlauf.</div>
    </div>`;

  // Ab jetzt gilt alles als gesehen.
  try {
    localStorage.setItem(SPEICHER_GESEHEN, bloecke[0].erkanntAm);
  } catch (fehler) { /* egal */ }
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
        – ${sicher(zeitpunktLesbar(termin.start))}
        ${detail ? `<div class="verlauf-detail">${detail}</div>` : ""}
      </span>
    </div>`;
}


/* -------------------------------------------------------------------------
   6. Start
   ------------------------------------------------------------------------- */

function allesZeichnen() {
  naechstenZeichnen();
  wocheZeichnen();
  verlaufZeichnen();
}

function kopfZeichnen() {
  const grossgeschrieben = STUNDENPLAN.fachrichtung.charAt(0).toUpperCase()
                         + STUNDENPLAN.fachrichtung.slice(1);
  const semesterZahl = STUNDENPLAN.semester.replace("semester", "");

  document.getElementById("planName").textContent =
    grossgeschrieben + " · Semester " + semesterZahl;

  document.getElementById("planStand").textContent =
    "Zuletzt geprüft: " + zeitpunktLesbar(STUNDENPLAN.geprueftAm)
    + " · " + STUNDENPLAN.termine.length + " Termine";
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
  abgewaehlteFaecher = filterLaden();

  try {
    const gemerkt = localStorage.getItem(SPEICHER_ANSICHT);
    if (gemerkt === "kalender" || gemerkt === "liste") ansicht = gemerkt;
  } catch (fehler) { /* dann bleibt es bei der Liste */ }

  kopfZeichnen();
  knoepfeVerbinden();
  hinweisZeichnen();
  naechstenZeichnen();
  verlaufZeichnen();
  // Setzt die gemerkte Ansicht, hebt den richtigen Knopf hervor und zeichnet
  // die Woche – deshalb hier kein zusätzliches wocheZeichnen().
  ansichtSetzen(ansicht);
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

datenLaden(starten);
