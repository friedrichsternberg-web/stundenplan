/* =========================================================================
   Wann eine Erinnerung dran ist  ·  seit 20.10.2026

   EINE Datei für App und Server. Die App lädt sie als <script> vor app.js,
   der Erinnerungsdienst (Supabase-Funktion "erinnern") und der
   Claude-Connector ("planer-mcp") importieren sie. Deshalb kein "export":
   die Datei hängt ihr Ergebnis an globalThis.ErinnerungVorkommen, und das
   klappt im Browser wie in Deno.

   Warum nicht zweimal schreiben? Weil App und Server sonst bei einer
   Monatserinnerung am 31. verschieden rechnen könnten: die App zeigt
   "nächstes Mal 30.11.", der Server schickt am 01.12. Genau so etwas
   findet man erst, wenn es passiert.

   EINE ERINNERUNG

     anker        "2026-10-20T18:00"  das erste Mal, Berliner Ortszeit
     wiederholung ""                  einmal
                  "taeglich"          jeden Tag zur selben Uhrzeit
                  "werktags"          Montag bis Freitag
                  "woechentlich"      alle 7 Tage
                  "monatlich"         am selben Tag im Monat; gibt es den
                                      nicht (31. im November), am letzten
                  "jaehrlich"         am selben Tag im Jahr; 29.02. in
                                      Nicht-Schaltjahren am 28.02.

   Gerechnet wird mit Zeichenketten in Ortszeit, wie überall im Planer
   (siehe "Erinnerungen" in app.js): die Uhrzeit bleibt stehen, nur das
   Datum wandert. So gibt es keine Sommerzeit-Fehler.
   ========================================================================= */
(function (wurzel) {
  "use strict";

  const WIEDERHOLUNGEN = [
    ["", "Einmal"],
    ["taeglich", "Täglich"],
    ["werktags", "Werktags (Mo–Fr)"],
    ["woechentlich", "Wöchentlich"],
    ["monatlich", "Monatlich"],
    ["jaehrlich", "Jährlich"],
  ];

  /* Obergrenze für die Suche nach dem passenden Vorkommen. Eine tägliche
     Erinnerung, die vor zehn Jahren begann, braucht rund 3650 Schritte;
     mehr ist nie sinnvoll und schützt vor einer Endlosschleife. */
  const HOECHSTENS = 20000;

  function zweistellig(n) { return String(n).padStart(2, "0"); }

  // Über 12:00 UTC, damit keine Zeitumstellung einen Tag verschluckt.
  function tagPlus(tag, anzahl) {
    const d = new Date(tag + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + anzahl);
    return d.toISOString().slice(0, 10);
  }

  function wochentag(tag) { return new Date(tag + "T12:00:00Z").getUTCDay(); }

  function tageImMonat(jahr, monat) {          // monat 1–12
    return new Date(Date.UTC(jahr, monat, 0)).getUTCDate();
  }

  function gueltig(anker) {
    return typeof anker === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(anker)
      && isFinite(new Date(anker.slice(0, 10) + "T12:00:00Z").getTime());
  }

  function regelGueltig(regel) {
    return WIEDERHOLUNGEN.some(w => w[0] === regel);
  }

  /* Das k-te Vorkommen (k = 0 ist das erste). Liefert "" bei Unsinn. */
  function vorkommen(anker, regel, k) {
    const tag = anker.slice(0, 10), uhr = anker.slice(11, 16);
    if (!regel) return k === 0 ? anker : "";
    if (regel === "taeglich") return tagPlus(tag, k) + "T" + uhr;
    if (regel === "woechentlich") return tagPlus(tag, 7 * k) + "T" + uhr;
    if (regel === "werktags") {
      // Der erste Werktag ab dem Anker, dann k Werktage weiter.
      let d = tag;
      while (wochentag(d) === 0 || wochentag(d) === 6) d = tagPlus(d, 1);
      d = tagPlus(d, 7 * Math.floor(k / 5));
      for (let rest = k % 5; rest > 0; rest--) {
        d = tagPlus(d, 1);
        while (wochentag(d) === 0 || wochentag(d) === 6) d = tagPlus(d, 1);
      }
      return d + "T" + uhr;
    }
    if (regel === "monatlich" || regel === "jaehrlich") {
      const jahr0 = Number(tag.slice(0, 4)), monat0 = Number(tag.slice(5, 7)), tag0 = Number(tag.slice(8, 10));
      const monate = (monat0 - 1) + (regel === "monatlich" ? k : 12 * k);
      const jahr = jahr0 + Math.floor(monate / 12), monat = (monate % 12) + 1;
      const t = Math.min(tag0, tageImMonat(jahr, monat));
      return jahr + "-" + zweistellig(monat) + "-" + zweistellig(t) + "T" + uhr;
    }
    return "";
  }

  /* Das letzte Vorkommen, das schon dran war (≤ jetzt), oder "".
     Danach fragt der Server: ist es noch nicht verschickt, schickt er es. */
  function letztes(anker, regel, jetzt) {
    if (!gueltig(anker) || !regelGueltig(regel) || anker > jetzt) return "";
    let vorher = anker;
    for (let k = 1; k < HOECHSTENS; k++) {
      const v = vorkommen(anker, regel, k);
      if (!v || v > jetzt) return vorher;
      vorher = v;
    }
    return vorher;
  }

  /* Das nächste Vorkommen nach jetzt (> jetzt), oder "" – dann ist eine
     einmalige Erinnerung vorbei. Danach fragt die Anzeige. */
  function naechstes(anker, regel, jetzt) {
    if (!gueltig(anker) || !regelGueltig(regel)) return "";
    for (let k = 0; k < HOECHSTENS; k++) {
      const v = vorkommen(anker, regel, k);
      if (!v) return "";
      if (v > jetzt) return v;
    }
    return "";
  }

  function regelText(regel) {
    const w = WIEDERHOLUNGEN.filter(x => x[0] === regel)[0];
    return w ? w[1] : "";
  }

  wurzel.ErinnerungVorkommen = {
    WIEDERHOLUNGEN: WIEDERHOLUNGEN,
    vorkommen: vorkommen,
    letztes: letztes,
    naechstes: naechstes,
    gueltig: gueltig,
    regelGueltig: regelGueltig,
    regelText: regelText,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
