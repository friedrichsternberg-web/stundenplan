/* =========================================================================
   Service Worker – nimmt Benachrichtigungen entgegen

   Ein Service Worker ist ein kleines Programm, das der Browser auch dann
   noch laufen lässt, wenn die Seite geschlossen ist. Ohne ihn gibt es
   keine Push-Benachrichtigungen: das Betriebssystem weckt ihn, er zeigt
   die Meldung an, fertig.

   ER MACHT ABSICHTLICH SONST NICHTS.

   Ein Service Worker kann auch Dateien zwischenspeichern, damit die Seite
   ohne Netz startet. Das wäre hier ein Rückschritt: dieses Projekt hat
   schon einmal einen halben Tag damit verbracht, dass GitHub Pages Dateien
   zehn Minuten behalten darf und Handy und Laptop verschiedene Fassungen
   zeigten. Dagegen steht inzwischen die Versionsprüfung in app.js. Ein
   zweiter Zwischenspeicher, der eigene Regeln hat und den man nur über
   den Service Worker wieder losbekommt, würde diese Lösung untergraben –
   und der Fehler wäre schwer zu finden, weil er nur auf einem Gerät
   auftritt und ein Neuladen nicht hilft.

   Also: kein fetch-Zuhörer, kein Zwischenspeicher. Nur Benachrichtigungen.
   ========================================================================= */

/* Eine neue Fassung soll sofort übernehmen, statt zu warten, bis alle
   Tabs zu sind. Bei einer App auf dem Home-Bildschirm kann das sonst
   Tage dauern. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", ereignis => ereignis.waitUntil(self.clients.claim()));


self.addEventListener("push", ereignis => {
  /* Voreinstellung für den Fall, dass die Nachricht leer ankommt oder
     nicht lesbar ist. iOS verlangt, dass auf JEDEN Push eine sichtbare
     Meldung folgt – bleibt sie aus, entzieht das System der App nach
     mehreren Malen die Erlaubnis. Deshalb hier immer etwas anzeigen,
     zur Not eben allgemein. */
  let daten = { titel: "Stundenplan", text: "Es hat sich etwas geändert." };

  if (ereignis.data) {
    try {
      const gelesen = ereignis.data.json();
      if (gelesen && typeof gelesen.titel === "string") daten = gelesen;
    } catch (fehler) {
      const roh = ereignis.data.text();
      if (roh) daten.text = roh;
    }
  }

  ereignis.waitUntil(
    self.registration.showNotification(daten.titel || "Stundenplan", {
      body: daten.text || "",
      icon: "symbol.png",
      badge: "symbol.png",
      /* Gleiche Marke heißt: die neue Meldung ersetzt die alte, statt sich
         danebenzulegen. Sonst stapeln sich bei mehreren Änderungen an
         einem Tag fünf fast gleiche Mitteilungen. */
      tag: daten.marke || "stundenplan",
      renotify: true,
      data: { geoeffnetAm: Date.now() },
    })
  );
});


self.addEventListener("notificationclick", ereignis => {
  ereignis.notification.close();

  /* Ist die App schon offen, wird sie nach vorn geholt statt ein zweites
     Fenster aufzumachen. Andernfalls neu öffnen. */
  ereignis.waitUntil((async () => {
    const offene = await self.clients.matchAll({
      type: "window", includeUncontrolled: true,
    });
    for (const fenster of offene) {
      if ("focus" in fenster) return fenster.focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow("./");
  })());
});
