/* =========================================================================
   Geräteabgleich – dieselben Notizen und Aufgaben auf Handy und Laptop

   Vorher lagen deine To-dos ausschließlich im Browser des jeweiligen
   Geräts. Das ist schnell und funktioniert ohne Netz, hat aber einen
   offensichtlichen Haken: was du am Laptop einträgst, weiß das Handy nicht.

   Diese Datei hängt eine gemeinsame Ablage dahinter. Der Stundenplan selbst
   bleibt unberührt – der kommt weiterhin von der HWR über daten/plan.js.
   Hier geht es nur um das, was du selbst schreibst.

   Drei Entscheidungen prägen alles Weitere:

   1. SCHLOSS STATT ANMELDUNG
      Die Seite liegt öffentlich auf GitHub. Der Zugangsschlüssel unten steht
      damit für jeden lesbar im Quelltext – so ist er auch gedacht. Er allein
      gibt aber nichts frei: die Ablage liegt in einem Datenbankschema, das
      die Web-Schnittstelle gar nicht veröffentlicht. Herankommen kann man
      nur über zwei Funktionen, und die verlangen dein Geheimwort. Das steht
      nirgends im Quelltext, sondern nur auf deinen Geräten.

      Der Vorteil gegenüber einer richtigen Anmeldung: kein Passwort, keine
      Bestätigungsmail, nichts zu tippen außer einmal pro Gerät.

   2. ZUSAMMENFÜHREN STATT ÜBERSCHREIBEN
      Der naheliegende Weg wäre "wer zuletzt speichert, gewinnt". Der
      verliert aber Daten: schreibst du am Laptop eine Notiz, während das
      Handy noch den alten Stand hat, würde der nächste Handy-Zustand deine
      Notiz auslöschen.

      Deshalb wird pro EINTRAG entschieden, nicht pro Gesamtstand. Jede Notiz
      und jede Aufgabe trägt ihren eigenen Zeitstempel; beim Zusammenführen
      gewinnt jeweils die jüngere Fassung. Zwei Geräte können also gleich-
      zeitig etwas eintragen, ohne sich gegenseitig zu löschen.

   3. GRABSTEINE
      Löschen braucht einen eigenen Eintrag. Ohne ihn wäre "hier ist nichts"
      nicht von "davon weiß ich noch nichts" zu unterscheiden – und eine
      gelöschte Aufgabe käme beim nächsten Abgleich vom anderen Gerät
      fröhlich zurück. Ein Grabstein merkt sich deshalb: diese Kennung wurde
      zu diesem Zeitpunkt gelöscht. Nach GRABSTEIN_TAGE verfällt er.
   ========================================================================= */

/* Die Ablage. Beide Werte dürfen öffentlich sein – siehe Punkt 1 oben. */
const ABGLEICH_URL = "https://copydwpdqpnwjvknsakz.supabase.co";
const ABGLEICH_OEFFENTLICH = "sb_publishable_d7pxVkeMCqwhFsLrupDovA_ag2SmffE";

const SPEICHER_CODE = "stundenplan.geraetecode";
const SPEICHER_ZEITVERSATZ = "stundenplan.zeitversatz";

/* Wie lange ein Grabstein gilt.

   Er muss länger leben, als ein Gerät am Stück ungenutzt bleiben kann –
   sonst taucht eine längst gelöschte Aufgabe wieder auf, wenn du ein altes
   iPad nach Monaten aufklappst. Vier Monate decken auch die Semesterferien
   ab. Danach ist es das kleinere Übel, ihn zu vergessen: sonst wüchse die
   Ablage endlos. */
const GRABSTEIN_TAGE = 120;

/* Wie lange nach der letzten Eingabe gewartet wird, bevor hochgeladen wird.
   Ohne diese Pause löste jeder Tastendruck einen Netzaufruf aus. */
const WARTEN_NACH_EINGABE = 1200;

// Regelmäßiger Blick in die Ablage, solange die Seite offen und sichtbar ist.
const NACHSCHAUEN_ALLE = 90000;

/* Zeichen für den Gerätecode – ohne 0/O und 1/I/L, die beim Abtippen zu
   leicht zu verwechseln sind. */
const CODE_ZEICHEN = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LAENGE = 25;


var Abgleich = (function () {

  /* Von der App gesetzt: wie der lokale Stand einzusammeln ist, wie ein
     zusammengeführter Stand zu übernehmen ist, und was danach neu zu
     zeichnen ist. Diese Datei kennt die Form der Daten bewusst nicht im
     Detail – sie sieht nur "Kennung zu Eintrag mit Zeitstempel". */
  let haken = { sammeln: null, uebernehmen: null, fertig: null };

  /* "aus"    kein Code, Abgleich findet nicht statt
     "laeuft" gerade unterwegs
     "gut"    zuletzt erfolgreich
     "fehler" zuletzt schiefgegangen (kein Netz, Ablage weg) */
  let zustand = "aus";
  let zuletztErfolg = 0;
  let letzteMeldung = "";

  // Verhindert, dass zwei Läufe gleichzeitig unterwegs sind.
  let laeuftGerade = false;
  let nochmalDanach = false;
  let wartemarke = null;
  let taktmarke = null;
  // Ob die Zuhörer schon hängen – siehe einrichten().
  let angehaengt = false;

  /* Differenz zwischen der Uhr dieses Geräts und der Uhr des Servers.

     Klingt nach Kleinigkeit, ist aber der Unterschied zwischen "funktioniert"
     und "funktioniert meistens": beim Zusammenführen entscheidet der
     Zeitstempel. Geht die Uhr eines Geräts zehn Minuten vor, gewinnt dieses
     Gerät jeden Konflikt – auch wenn der Eintrag dort älter ist. Mit dem
     Versatz rechnen beide Geräte in derselben Zeit. */
  let zeitversatz = 0;
  try { zeitversatz = Number(localStorage.getItem(SPEICHER_ZEITVERSATZ)) || 0; }
  catch (fehler) { zeitversatz = 0; }


  /* --- Der Gerätecode ---------------------------------------------------- */

  /* Macht aus allem, was der Mensch eingibt, eine vergleichbare Form:
     Großbuchstaben, keine Bindestriche, keine Leerzeichen. So ist es egal,
     ob du ihn mit oder ohne Trennstriche abtippst. */
  function codeNormalisieren(roh) {
    return String(roh || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  // Zum Anzeigen und Abtippen: Fünferblöcke.
  function codeLesbar(code) {
    return (codeNormalisieren(code).match(/.{1,5}/g) || []).join("-");
  }

  function code() {
    try { return codeNormalisieren(localStorage.getItem(SPEICHER_CODE)); }
    catch (fehler) { return ""; }
  }

  function codeSetzen(roh) {
    const sauber = codeNormalisieren(roh);
    if (sauber.length < 20) return false;
    try { localStorage.setItem(SPEICHER_CODE, sauber); }
    catch (fehler) { return false; }
    zustand = "laeuft";
    zuletztErfolg = 0;
    return true;
  }

  function codeLoeschen() {
    try { localStorage.removeItem(SPEICHER_CODE); }
    catch (fehler) { /* dann bleibt es beim Abgleich */ }
    zustand = "aus";
    zuletztErfolg = 0;
  }

  /* Erzeugt einen neuen Code aus echtem Zufall.

     Die Ablehnung von Werten ab 248 sieht umständlich aus, ist aber nötig:
     256 lässt sich nicht glatt durch 31 Zeichen teilen. Nähme man einfach
     den Rest, kämen die ersten acht Zeichen des Alphabets häufiger vor als
     die übrigen. Bei 25 Stellen bleiben so rund 124 Bit Zufall – erraten
     lässt sich das nicht. */
  function codeErzeugen() {
    const zeichen = [];
    const echterZufall = typeof crypto !== "undefined" && crypto.getRandomValues;

    while (zeichen.length < CODE_LAENGE) {
      if (echterZufall) {
        const puffer = new Uint8Array(CODE_LAENGE);
        crypto.getRandomValues(puffer);
        for (let i = 0; i < puffer.length && zeichen.length < CODE_LAENGE; i++) {
          if (puffer[i] < 248) zeichen.push(CODE_ZEICHEN[puffer[i] % 31]);
        }
      } else {
        // Notnagel für sehr alte Browser. Schwächer, aber besser als nichts.
        zeichen.push(CODE_ZEICHEN[Math.floor(Math.random() * 31)]);
      }
    }
    return zeichen.join("");
  }


  /* --- Zeit -------------------------------------------------------------- */

  /* Die Zeit, mit der Zeitstempel geschrieben werden. Siehe zeitversatz. */
  function jetzt() {
    return Date.now() + zeitversatz;
  }

  function zeitAbgleichen(serverzeit) {
    if (!serverzeit) return;
    const neuerVersatz = Math.round(Number(serverzeit) - Date.now());
    if (!isFinite(neuerVersatz)) return;
    // Unter zwei Sekunden lohnt die Korrektur nicht und würde nur bei jedem
    // Aufruf um ein paar Millisekunden wackeln.
    if (Math.abs(neuerVersatz - zeitversatz) < 2000) return;
    zeitversatz = neuerVersatz;
    try { localStorage.setItem(SPEICHER_ZEITVERSATZ, String(zeitversatz)); }
    catch (fehler) { /* dann gilt die Korrektur nur bis zum Neuladen */ }
  }


  /* --- Zusammenführen ---------------------------------------------------- */

  /* Ein Textabdruck eines Eintrags, unabhängig von der Reihenfolge der
     Felder.

     Gebraucht wird er nur für den Gleichstand: haben zwei Fassungen exakt
     denselben Zeitstempel, muss die Entscheidung trotzdem auf beiden Geräten
     gleich ausfallen – sonst hält jedes an seiner eigenen fest und der
     Abgleich kommt nie zur Ruhe. JSON.stringify taugt dafür nicht, weil die
     Datenbank die Felder anders sortiert zurückgibt, als die App sie
     abgeschickt hat. */
  function abdruck(eintrag) {
    if (!eintrag || typeof eintrag !== "object") return String(eintrag);
    return Object.keys(eintrag).sort()
      .map(feld => feld + " " + String(eintrag[feld]))
      .join("");
  }

  function stempel(eintrag) {
    const wert = eintrag && Number(eintrag.geaendert);
    return isFinite(wert) ? wert : 0;
  }

  /* Führt zwei Sammlungen von Einträgen zusammen. Pro Kennung gewinnt die
     jüngere Fassung; bei Gleichstand entscheidet der Abdruck. Grabsteine
     nehmen ganz normal teil – ein Grabstein ist einfach ein Eintrag, der
     "gelöscht" sagt. */
  function zusammenfuehren(lokal, fern) {
    const ergebnis = {};
    const kennungen = {};
    for (const kennung of Object.keys(lokal || {})) kennungen[kennung] = true;
    for (const kennung of Object.keys(fern || {})) kennungen[kennung] = true;

    /* Sortiert, damit das Ergebnis nicht davon abhängt, welche Seite
       "lokal" heißt. Inhaltlich käme sonst dasselbe heraus, nur mit anders
       geordneten Feldern – und der Nächste, der die beiden Ergebnisse
       einfach als Text vergleicht, tappt in die Falle. */
    for (const kennung of Object.keys(kennungen).sort()) {
      const hier = lokal ? lokal[kennung] : null;
      const dort = fern ? fern[kennung] : null;

      if (!dort) { ergebnis[kennung] = hier; continue; }
      if (!hier) { ergebnis[kennung] = dort; continue; }

      const a = stempel(hier), b = stempel(dort);
      if (b > a) ergebnis[kennung] = dort;
      else if (a > b) ergebnis[kennung] = hier;
      else ergebnis[kennung] = abdruck(dort) > abdruck(hier) ? dort : hier;
    }
    return ergebnis;
  }

  /* Wirft Grabsteine weg, die niemand mehr braucht. */
  function grabsteineAufraeumen(eintraege) {
    const grenze = jetzt() - GRABSTEIN_TAGE * 86400000;
    const behalten = {};
    for (const kennung of Object.keys(eintraege)) {
      const eintrag = eintraege[kennung];
      if (eintrag && eintrag.geloescht && stempel(eintrag) < grenze) continue;
      behalten[kennung] = eintrag;
    }
    return behalten;
  }

  /* Vergleicht zwei Stände inhaltlich. Wieder unabhängig von der Reihenfolge
     der Felder – sonst hielte die App jeden empfangenen Stand für verändert
     und schriebe ihn sofort wieder zurück, endlos. */
  function inhaltsAbdruck(stand) {
    const eintraege = (stand && stand.eintraege) || {};
    return Object.keys(eintraege).sort()
      .map(kennung => kennung + " " + abdruck(eintraege[kennung]))
      .join("\n");
  }


  /* --- Netz -------------------------------------------------------------- */

  function rufen(funktion, felder) {
    return fetch(ABGLEICH_URL + "/rest/v1/rpc/" + funktion, {
      method: "POST",
      headers: {
        "apikey": ABGLEICH_OEFFENTLICH,
        "Authorization": "Bearer " + ABGLEICH_OEFFENTLICH,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(felder),
    }).then(function (antwort) {
      if (!antwort.ok) {
        return antwort.text().then(function (text) {
          throw new Error("Ablage antwortet " + antwort.status + ": " + text);
        });
      }
      return antwort.json();
    });
  }


  /* --- Der eigentliche Ablauf -------------------------------------------- */

  /* Ein vollständiger Abgleich: lesen, zusammenführen, übernehmen, und nur
     dann schreiben, wenn dabei etwas Neues herauskam.

     Die Reihenfolge ist wichtig. Würde erst geschrieben und dann gelesen,
     ginge zwischen beiden Schritten alles verloren, was das andere Gerät in
     der Zwischenzeit abgelegt hat. */
  function durchlaufen(versuch) {
    const meinCode = code();
    if (!meinCode || !haken.sammeln || !haken.uebernehmen) {
      zustand = "aus";
      return Promise.resolve();
    }

    return rufen("dashboard_lesen", { schluessel: meinCode })
      .then(function (fern) {
        zeitAbgleichen(fern.serverzeit);

        const lokal = haken.sammeln();
        const fernInhalt = fern.inhalt || {};
        const vereint = {
          v: 1,
          eintraege: grabsteineAufraeumen(
            zusammenfuehren(lokal.eintraege || {}, fernInhalt.eintraege || {})),
        };

        // Erst das eigene Gerät auf den zusammengeführten Stand bringen.
        const vorher = inhaltsAbdruck(lokal);
        const nachher = inhaltsAbdruck(vereint);
        haken.uebernehmen(vereint);

        // Und nur hochladen, wenn die Ablage tatsächlich etwas verpasst hat.
        if (nachher === inhaltsAbdruck(fernInhalt)) {
          zustand = "gut";
          zuletztErfolg = Date.now();
          if (nachher !== vorher && haken.fertig) haken.fertig();
          return;
        }

        return rufen("dashboard_schreiben", {
          schluessel: meinCode,
          neuer_inhalt: vereint,
          erwartete_fassung: fern.fassung || 0,
        }).then(function (antwort) {
          zeitAbgleichen(antwort.serverzeit);

          /* Das andere Gerät war schneller. Dann ist unser Stand veraltet –
             also einmal von vorn, diesmal mit dem frischen Fernstand. Mehr
             als ein paar Anläufe braucht es nicht: zwei Geräte, die sich
             endlos überholen, gibt es hier nicht. */
          if (!antwort.erfolg) {
            if (versuch < 3) return durchlaufen(versuch + 1);
            throw new Error("Ablage war belegt");
          }

          zustand = "gut";
          zuletztErfolg = Date.now();
          if (nachher !== vorher && haken.fertig) haken.fertig();
        });
      });
  }

  function abgleichen() {
    if (!code()) { zustand = "aus"; return Promise.resolve(); }

    // Läuft schon einer? Dann nach dessen Ende noch einmal, damit die
    // Änderung nicht liegen bleibt, die gerade dazwischenkam.
    if (laeuftGerade) { nochmalDanach = true; return Promise.resolve(); }

    laeuftGerade = true;
    zustand = "laeuft";

    return durchlaufen(1)
      .catch(function (fehler) {
        zustand = "fehler";
        letzteMeldung = String((fehler && fehler.message) || fehler);
      })
      .then(function () {
        laeuftGerade = false;
        if (nochmalDanach) { nochmalDanach = false; return abgleichen(); }
      });
  }

  /* Nach einer Eingabe. Sammelt mehrere Änderungen zu einem Aufruf. */
  function anstossen() {
    if (!code()) return;
    if (wartemarke) clearTimeout(wartemarke);
    wartemarke = setTimeout(function () {
      wartemarke = null;
      abgleichen();
    }, WARTEN_NACH_EINGABE);
  }

  /* Ohne Verzögerung – für den Knopf "Jetzt abgleichen" und für den Moment,
     in dem du die App wieder in den Vordergrund holst. */
  function sofort() {
    if (wartemarke) { clearTimeout(wartemarke); wartemarke = null; }
    return abgleichen();
  }


  /* --- Auskunft für die Oberfläche --------------------------------------- */

  function auskunft() {
    if (!code()) return { stand: "aus", text: "Nur auf diesem Gerät" };
    if (zustand === "laeuft") return { stand: "laeuft", text: "Wird abgeglichen" };
    if (zustand === "fehler") {
      return { stand: "fehler",
               text: (typeof navigator !== "undefined" && navigator.onLine === false)
                 ? "Kein Netz – wird nachgeholt"
                 : "Abgleich klemmt: " + letzteMeldung };
    }
    if (!zuletztErfolg) return { stand: "bereit", text: "Eingerichtet" };

    const minuten = Math.round((Date.now() - zuletztErfolg) / 60000);
    return { stand: "gut",
             text: minuten < 1 ? "Gerade abgeglichen"
                 : minuten < 60 ? "Abgeglichen vor " + minuten + " Min."
                 : "Abgeglichen vor " + Math.round(minuten / 60) + " Std." };
  }


  /* --- Einrichten -------------------------------------------------------- */

  function einrichten(neueHaken) {
    haken = neueHaken;

    /* Die Zuhörer werden IMMER angehängt, auch wenn noch kein Code da ist.

       Das war zunächst anders – ohne Code brach diese Funktion gleich ab.
       Die Folge fiel erst beim Ausprobieren auf: schaltet man den Abgleich
       später ein, ohne die Seite neu zu laden, hing kein einziger Zuhörer
       daran. Der erste Abgleich lief noch (den stößt der Knopf selbst an),
       danach passierte bis zum nächsten Neuladen nichts mehr.

       Die Zuhörer kosten nichts, solange kein Code gesetzt ist: abgleichen()
       kehrt dann sofort zurück. */
    if (!angehaengt) {
      angehaengt = true;

      /* Zurück aus dem Hintergrund ist der wichtigste Zeitpunkt überhaupt:
         genau dann hast du gerade am anderen Gerät etwas eingetragen. */
      document.addEventListener("visibilitychange", function () {
        if (!document.hidden) sofort();
      });
      window.addEventListener("focus", function () { sofort(); });
      window.addEventListener("online", function () { sofort(); });

      /* Und regelmäßig, solange die Seite offen daliegt – sonst zeigte ein
         Laptop, der den ganzen Tag offen steht, ewig den Morgenstand. */
      if (taktmarke) clearInterval(taktmarke);
      taktmarke = setInterval(function () {
        if (!document.hidden) abgleichen();
      }, NACHSCHAUEN_ALLE);
    }

    if (!code()) { zustand = "aus"; return; }
    sofort();
  }

  return {
    einrichten: einrichten,
    code: code,
    codeSetzen: codeSetzen,
    codeLoeschen: codeLoeschen,
    codeErzeugen: codeErzeugen,
    codeLesbar: codeLesbar,
    codeNormalisieren: codeNormalisieren,
    jetzt: jetzt,
    anstossen: anstossen,
    sofort: sofort,
    auskunft: auskunft,
    // Nur für die Tests – die Rechenteile ohne Netz und ohne Browser.
    _zusammenfuehren: zusammenfuehren,
    _abdruck: abdruck,
    _inhaltsAbdruck: inhaltsAbdruck,
    _grabsteineAufraeumen: grabsteineAufraeumen,
  };
})();

// Damit die Tests die Datei auch außerhalb eines Browsers laden können.
if (typeof module !== "undefined" && module.exports) module.exports = Abgleich;
