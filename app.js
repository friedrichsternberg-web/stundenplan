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

// Unter diesem Schlüssel merkt sich der Browser, welche Fächer du besuchst.
const SPEICHER_FILTER = "stundenplan.abgewaehlteFaecher";

// Und unter diesem, welche Änderung du zuletzt gesehen hast. Damit kann das
// Dashboard oben einen Hinweis zeigen, wenn seitdem etwas dazugekommen ist.
const SPEICHER_GESEHEN = "stundenplan.zuletztGesehen";

// Welche Woche gerade angezeigt wird, als Montag dieser Woche.
let angezeigterMontag = montagDerWoche(new Date());

// Die Fächer, die du abgewählt hast.
let abgewaehlteFaecher = filterLaden();


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

function filterLaden() {
  try {
    const gespeichert = localStorage.getItem(SPEICHER_FILTER);
    return gespeichert ? new Set(JSON.parse(gespeichert)) : new Set();
  } catch (fehler) {
    return new Set();
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

function sichtbareTermine() {
  return STUNDENPLAN.termine.filter(t => !abgewaehlteFaecher.has(t.titel));
}

/* Alle Fächer mit der Anzahl ihrer Termine, alphabetisch. */
function alleFaecher() {
  const zaehler = new Map();
  for (const termin of STUNDENPLAN.termine) {
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

  // Samstag und Sonntag werden nur gezeigt, wenn dort etwas stattfindet –
  // an der HWR ist das die Ausnahme, und leere Kästen stören nur.
  const stuecke = [];
  for (let versatz = 0; versatz < 7; versatz++) {
    const tag = tageDazu(montag, versatz);
    const schluessel = tagesSchluessel(tag);
    const termineDesTages = nachTag.get(schluessel) || [];

    if (versatz >= 5 && termineDesTages.length === 0) continue;

    const istHeute = schluessel === heuteSchluessel;
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

  document.getElementById("tage").innerHTML = stuecke.join("");
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
        e => !abgewaehlteFaecher.has(e.termin.titel)),
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

function knoepfeVerbinden() {
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
  kopfZeichnen();
  knoepfeVerbinden();
  hinweisZeichnen();
  allesZeichnen();
}

starten();
