/* =========================================================================
   Benachrichtigungen – "der Raum hat sich geändert" aufs Handy

   Bisher stand eine Änderung nur im Dashboard. Man musste sie also
   nachschlagen, um sie zu erfahren – genau das, was das Projekt eigentlich
   abschaffen sollte. Diese Datei meldet sich von selbst.

   WIE DAS ZUSAMMENHÄNGT

     abgleich.py  findet eine Änderung im HWR-Plan
        ↓
     GitHub-Automatik  ruft die Absenderfunktion bei Supabase auf
        ↓
     Supabase  verschlüsselt die Meldung und gibt sie an Apples Push-Dienst
        ↓
     iPhone  weckt sw.js, das die Mitteilung anzeigt

   WARUM ES DEN GERÄTECODE BRAUCHT

     Die Anmeldung wird unter demselben Code abgelegt wie die Notizen. Sonst
     könnte jeder, der die Seite findet, sich für Benachrichtigungen
     eintragen – und bekäme mit, wann Friedrichs Vorlesungen ausfallen.

   WAS AUF DEM iPHONE ANDERS IST

     Safari lässt Benachrichtigungen nur zu, wenn die Seite auf dem
     Home-Bildschirm liegt. Im normalen Safari-Tab gibt es sie nicht, und
     der Browser sagt auch nicht warum – man tippt auf den Knopf und nichts
     passiert. Deshalb prüft diese Datei das vorher und sagt es deutlich.
   ========================================================================= */

/* Der öffentliche Teil des Schlüsselpaars, mit dem sich der Absender
   ausweist. Er darf im Quelltext stehen – mit ihm allein lässt sich nichts
   verschicken, dafür braucht es den privaten Teil, und der liegt in der
   Absenderfunktion bei Supabase. */
const MELDEN_VAPID = "BM3niGyccWp2RQG95Pb3gzFNCR4e0kMXy3BBGeH3S_Ej1HfNNThIVUAPDmsFWq8-DPw_GEQ6j1wqlvTYooQvZ8c";


var Melden = (function () {

  /* Wandelt den Schlüssel aus der Textform in Bytes.

     pushManager.subscribe() will ihn als Zahlenfeld, nicht als Text. Die
     Umrechnung sieht umständlich aus, ist aber nur: Bindestrich und
     Unterstrich zurück in Plus und Schrägstrich, auffüllen, dekodieren. */
  function schluesselAlsBytes(text) {
    const gefuellt = (text + "=".repeat((4 - text.length % 4) % 4))
      .replace(/-/g, "+").replace(/_/g, "/");
    const roh = atob(gefuellt);
    const bytes = new Uint8Array(roh.length);
    for (let i = 0; i < roh.length; i++) bytes[i] = roh.charCodeAt(i);
    return bytes;
  }

  function unterstuetzt() {
    return typeof navigator !== "undefined"
        && "serviceWorker" in navigator
        && typeof window !== "undefined"
        && "PushManager" in window
        && typeof Notification !== "undefined";
  }

  /* Läuft die Seite als App vom Home-Bildschirm?

     Auf dem iPhone ist das die Bedingung für Benachrichtigungen überhaupt.
     Es gibt zwei Wege, das zu erkennen: navigator.standalone ist Apples
     eigener, display-mode der allgemeine. Beide prüfen, weil Apple den
     ersten irgendwann fallen lassen könnte und Android nur den zweiten
     kennt. */
  function alsAppGeoeffnet() {
    if (typeof navigator !== "undefined" && navigator.standalone === true) return true;
    try { return window.matchMedia("(display-mode: standalone)").matches; }
    catch (fehler) { return false; }
  }

  function istApfelGeraet() {
    if (typeof navigator === "undefined") return false;
    if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return true;
    // Ein iPad meldet sich seit iPadOS als Mac. Ein echter Mac hat aber
    // keinen Mehrfingerbildschirm.
    return /Mac/.test(navigator.platform || "") && navigator.maxTouchPoints > 1;
  }

  function erlaubnis() {
    return unterstuetzt() ? Notification.permission : "nicht-moeglich";
  }

  /* Warum es gerade NICHT geht – oder null, wenn nichts dagegen spricht.
     Eine Zeichenkette statt eines Wahrheitswerts, damit die Oberfläche den
     Grund nennen kann und nicht bloß einen ausgegrauten Knopf zeigt. */
  function hindernis() {
    if (!unterstuetzt()) {
      return "Dieser Browser kann keine Benachrichtigungen.";
    }
    if (location.protocol !== "https:" && location.hostname !== "localhost") {
      return "Benachrichtigungen brauchen eine gesicherte Verbindung.";
    }
    if (!Abgleich.code()) {
      return "Richte zuerst den Geräteabgleich ein – die Anmeldung hängt am Code.";
    }
    if (istApfelGeraet() && !alsAppGeoeffnet()) {
      return "Auf dem iPhone geht das nur, wenn die Seite auf dem "
           + "Home-Bildschirm liegt: Teilen-Knopf → „Zum Home-Bildschirm“. "
           + "Dann von dort öffnen und hier noch einmal einschalten.";
    }
    if (Notification.permission === "denied") {
      return "Du hast Benachrichtigungen für diese Seite abgelehnt. "
           + "Das lässt sich nur in den Einstellungen des Geräts zurücknehmen.";
    }
    return null;
  }


  /* --- Netz --------------------------------------------------------------
     Dieselbe Ablage wie beim Notizabgleich, deshalb dieselben Zugangsdaten
     aus sync.js. */

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

  // Damit man in der Liste erkennt, welches Gerät das ist.
  function geraetename() {
    if (istApfelGeraet()) return alsAppGeoeffnet() ? "iPhone (App)" : "iPhone";
    if (/Mac/.test(navigator.platform || "")) return "Mac";
    if (/Android/.test(navigator.userAgent)) return "Android";
    return "Gerät";
  }


  /* --- Ein- und ausschalten ---------------------------------------------- */

  /* Muss aus einem Klick heraus aufgerufen werden.

     Notification.requestPermission() verlangt eine unmittelbare
     Nutzerhandlung. Ruft man es aus einem Zeitgeber oder nach einem await
     auf, lehnen die Browser stillschweigend ab. Deshalb steht die Abfrage
     ganz vorn, vor allem, was warten könnte. */
  async function einschalten() {
    const grund = hindernis();
    if (grund) return { erfolg: false, meldung: grund };

    const antwort = await Notification.requestPermission();
    if (antwort !== "granted") {
      return { erfolg: false, meldung: "Du hast die Erlaubnis nicht erteilt." };
    }

    try {
      const arbeiter = await navigator.serviceWorker.register("sw.js");
      // Auf eine frisch registrierte Fassung warten, sonst ist
      // pushManager noch nicht bereit.
      const bereit = await navigator.serviceWorker.ready;
      const stelle = bereit || arbeiter;

      let anmeldung = await stelle.pushManager.getSubscription();
      if (!anmeldung) {
        anmeldung = await stelle.pushManager.subscribe({
          // Pflicht: jede Meldung muss sichtbar werden. Stille
          // Benachrichtigungen erlauben die Browser nicht.
          userVisibleOnly: true,
          applicationServerKey: schluesselAlsBytes(MELDEN_VAPID),
        });
      }

      const roh = anmeldung.toJSON();
      await rufen("push_anmelden", {
        schluessel: Abgleich.code(),
        endpunkt: roh.endpoint,
        p256dh: roh.keys.p256dh,
        auth: roh.keys.auth,
        bezeichnung: geraetename(),
      });

      return { erfolg: true, meldung: "Eingeschaltet für " + geraetename() + "." };
    } catch (fehler) {
      return { erfolg: false,
               meldung: "Hat nicht geklappt: " + (fehler && fehler.message || fehler) };
    }
  }

  async function ausschalten() {
    if (!unterstuetzt()) return { erfolg: false, meldung: "Hier gibt es nichts abzuschalten." };
    try {
      const stelle = await navigator.serviceWorker.getRegistration();
      const anmeldung = stelle && await stelle.pushManager.getSubscription();
      if (anmeldung) {
        // Erst bei uns austragen, dann beim Browser: andersherum wäre die
        // Adresse weg, bevor wir sie zum Löschen nennen können.
        if (Abgleich.code()) {
          try {
            await rufen("push_abmelden", {
              schluessel: Abgleich.code(),
              endpunkt: anmeldung.endpoint,
            });
          } catch (fehler) { /* dann bleibt ein toter Eintrag, den der
                                Absender beim nächsten Mal wegräumt */ }
        }
        await anmeldung.unsubscribe();
      }
      return { erfolg: true, meldung: "Benachrichtigungen aus." };
    } catch (fehler) {
      return { erfolg: false,
               meldung: "Abmelden ging nicht: " + (fehler && fehler.message || fehler) };
    }
  }

  /* Ist DIESES Gerät angemeldet? Nicht aus dem Speicher geraten, sondern
     beim Browser nachgefragt – die Anmeldung kann auch von außen
     verschwinden, etwa wenn man die App vom Home-Bildschirm wirft. */
  async function angemeldet() {
    if (!unterstuetzt() || Notification.permission !== "granted") return false;
    try {
      const stelle = await navigator.serviceWorker.getRegistration();
      if (!stelle) return false;
      return Boolean(await stelle.pushManager.getSubscription());
    } catch (fehler) {
      return false;
    }
  }

  // Wie viele Geräte hängen insgesamt am Code?
  async function anzahlGeraete() {
    if (!Abgleich.code()) return 0;
    try {
      const stand = await rufen("push_stand", { schluessel: Abgleich.code() });
      return Number(stand && stand.geraete) || 0;
    } catch (fehler) {
      return 0;
    }
  }

  return {
    unterstuetzt: unterstuetzt,
    hindernis: hindernis,
    erlaubnis: erlaubnis,
    einschalten: einschalten,
    ausschalten: ausschalten,
    angemeldet: angemeldet,
    anzahlGeraete: anzahlGeraete,
    alsAppGeoeffnet: alsAppGeoeffnet,
    istApfelGeraet: istApfelGeraet,
    geraetename: geraetename,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Melden;
