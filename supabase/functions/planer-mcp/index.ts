/* =========================================================================
   Planer-Connector für Claude (MCP über Streamable HTTP)  ·  19.10.2026

   Friedrich fügt diese Adresse in claude.ai als eigenen Connector hinzu:

     https://copydwpdqpnwjvknsakz.supabase.co/functions/v1/planer-mcp

   Danach kann Claude - im Browser, in der Mac-App und in der iPhone-App -
   im Planer lesen und anlegen: Termine, To-dos, Notizen, Modulnotizen,
   Einkaufszettel, und sich Dinge über Friedrich merken. Das läuft über
   sein Claude-Pro-Abo; hier entstehen keine API-Kosten.

   ANMELDUNG (OAuth 2.1, wie Claude es verlangt)

     1. Claude fragt ohne Token an und bekommt 401 mit Verweis auf
        /.well-known/oauth-protected-resource.
     2. Claude registriert sich selbst (/register, dynamische Registrierung)
        und schickt Friedrich zu /authorize.
     3. /authorize leitet weiter auf verbinden.html (GitHub Pages; Supabase
        liefert auf seiner Adresse keine Webseiten aus). Dort entweder ein
        Klick, wenn der Planer in diesem Browser eingerichtet ist, oder
        der kurze Verbindungscode aus den Planer-Einstellungen.
     4. verbinden.html meldet sich bei /verbinden, bekommt die
        Rücksprungadresse zu Claude mit einem einmaligen Code.
     5. Claude tauscht den Code bei /token gegen Schlüssel (PKCE S256).

   Gespeichert werden nur Prüfsummen (SHA-256) von Codes und Schlüsseln,
   nie die Werte selbst. Zugelassen sind nur Räume in sync.mcp_zugang.

   SCHREIBEN

     Der Raum ist { v: 2, eintraege: { kennung: {...} } }, dieselbe Form,
     die der Geräteabgleich schreibt. Jede Änderung trägt "geaendert"
     (Millisekunden); beim nächsten Abgleich übernehmen die Geräte, was
     neuer ist. Geschrieben wird mit Fassungsprüfung: hat ein Gerät
     dazwischen geschrieben, wird neu gelesen und erneut versucht.
   ========================================================================= */

const BASIS = "https://copydwpdqpnwjvknsakz.supabase.co/functions/v1/planer-mcp";
const VERBINDEN_SEITE = "https://friedrichsternberg-web.github.io/stundenplan/verbinden.html";
const PLAN_URL = "https://friedrichsternberg-web.github.io/stundenplan/daten/plan.js";

const URL_BASIS = Deno.env.get("SUPABASE_URL")!;
const DIENST_SCHLUESSEL = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const PROTOKOLLE = ["2025-11-25", "2025-06-18", "2025-03-26"];
const ZUGRIFF_SEKUNDEN = 30 * 24 * 3600;     // Zugriffsschlüssel: 30 Tage
const ERNEUERN_SEKUNDEN = 365 * 24 * 3600;   // Erneuerungsschlüssel: 1 Jahr

/* Nur diese Rücksprungadressen werden registriert: die von Claude, und
   für Tests auf dem eigenen Rechner localhost. Sonst könnte jemand eine
   eigene Adresse eintragen und Friedrich eine echte Anmeldeseite zeigen,
   die den Code dann zu ihm schickt. */
function rueckspringenErlaubt(uri: string): boolean {
  return /^https:\/\/(claude\.ai|claude\.com)\/api\/mcp\/auth_callback$/.test(uri)
    || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(uri);
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, mcp-protocol-version, mcp-session-id",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Expose-Headers": "www-authenticate, mcp-session-id",
};

function json(inhalt: unknown, status = 200, kopf: Record<string, string> = {}) {
  return new Response(JSON.stringify(inhalt), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store", ...kopf },
  });
}

async function rufen(funktion: string, felder: unknown) {
  const a = await fetch(`${URL_BASIS}/rest/v1/rpc/${funktion}`, {
    method: "POST",
    headers: {
      apikey: DIENST_SCHLUESSEL,
      Authorization: `Bearer ${DIENST_SCHLUESSEL}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(felder),
  });
  if (!a.ok) throw new Error(`${funktion}: ${a.status} ${(await a.text()).slice(0, 200)}`);
  const roh = await a.text();
  return roh ? JSON.parse(roh) : null;
}


/* --- Kleinkram ----------------------------------------------------------- */

const ZEICHEN = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function zufall(laenge: number, alphabet = ""): string {
  const bytes = crypto.getRandomValues(new Uint8Array(laenge));
  if (!alphabet) return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
  // 256 / 32 geht glatt auf: keine Verzerrung.
  return Array.from(bytes, b => alphabet[b % alphabet.length]).join("");
}

async function sha256Hex(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(d), b => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Base64Url(text: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  let bin = "";
  for (const b of d) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/* Berliner Ortszeit als "2026-10-19T14:05" - dieselbe Schreibweise wie im
   Planer, ohne Zeitzone. */
function berlin(zeit = new Date()): string {
  const roh = zeit.toLocaleString("sv-SE", { timeZone: "Europe/Berlin" });
  return roh.slice(0, 10) + "T" + roh.slice(11, 16);
}

const WOCHENTAGE = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
function tagText(tag: string): string {
  const d = new Date(tag + "T12:00:00Z");
  return WOCHENTAGE[d.getUTCDay()] + " " + tag.slice(8, 10) + "." + tag.slice(5, 7) + "." + tag.slice(0, 4);
}
function tagPlus(tag: string, n: number): string {
  const d = new Date(tag + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const istTag = (t: unknown) => typeof t === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t);
const istUhr = (t: unknown) => typeof t === "string" && /^\d{2}:\d{2}$/.test(t);
const kurzerTitel = (t: string) => String(t || "").replace(/^\d+\s*-\s*/, "").trim();
const sauber = (t: unknown, n: number) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, n);


/* --- Der HWR-Plan ------------------------------------------------------ */

type PlanTermin = { id: string; start: string; ende: string; titel: string; raum?: string; dozent?: string; art?: string; anmerkung?: string };
let planCache: { zeit: number; termine: PlanTermin[] } | null = null;

async function plan(): Promise<PlanTermin[]> {
  if (planCache && Date.now() - planCache.zeit < 5 * 60 * 1000) return planCache.termine;
  const a = await fetch(PLAN_URL + "?t=" + Date.now(), { signal: AbortSignal.timeout(10000) });
  if (!a.ok) throw new Error("Stundenplan nicht erreichbar (" + a.status + ")");
  const roh = await a.text();
  const p = JSON.parse(roh.slice(roh.indexOf("{"), roh.lastIndexOf("}") + 1));
  const faecher = new Set<string>(p.nichtBelegteFaecher || []);
  const gruppen: string[] = p.nichtBelegteGruppen || [];
  const termine = (p.termine || []).filter((t: PlanTermin) =>
    t && typeof t.start === "string" && !faecher.has(t.titel)
    && !gruppen.some(g => String(t.dozent || "").includes(g)));
  planCache = { zeit: Date.now(), termine };
  return termine;
}

async function module(): Promise<string[]> {
  return [...new Set((await plan()).map(t => t.titel))].sort((a, b) => kurzerTitel(a).localeCompare(kurzerTitel(b), "de"));
}

/* Findet ein Modul zu einer Beschreibung wie "Controlling" oder
   "Management Controlling". Mehrdeutig: Fehler mit den Kandidaten, damit
   Claude nachfragt statt zu raten. */
async function modulFinden(beschreibung: string): Promise<string> {
  const norm = (t: string) => kurzerTitel(t).toLowerCase().replace(/[^a-z0-9äöüß]+/g, " ").trim();
  const alle = await module();
  const gesucht = norm(beschreibung);
  const genau = alle.filter(m => norm(m) === gesucht || m === beschreibung);
  if (genau.length === 1) return genau[0];
  const woerter = gesucht.split(" ").filter(Boolean);
  const treffer = alle.filter(m => woerter.every(w => norm(m).includes(w)));
  if (treffer.length === 1) return treffer[0];
  if (!treffer.length) {
    throw new Error("Kein Modul passt zu „" + beschreibung + "“. Module: " + alle.map(kurzerTitel).join("; "));
  }
  throw new Error("Mehrere Module passen zu „" + beschreibung + "“: " + treffer.map(kurzerTitel).join("; ") + ". Bitte genauer.");
}


/* --- Studienphasen und Arbeit im Betrieb --------------------------------

   Dieselben Daten und Regeln wie UNI_PLAN, feiertage() und arbeitsTermine()
   in app.js: In Praxisphasen ist Mo–Fr Arbeit, außer an Feiertagen und im
   Urlaub. Steht hier ein zweites Mal, damit Claude die Arbeitstage kennt
   und nicht bei jeder Antwort dazusagen muss, dass sie fehlen. */
const PHASEN: { halbjahr: number; art: "theorie" | "praxis"; von: string; bis: string }[] = [
  { halbjahr: 1, art: "praxis",  von: "2024-10-01", bis: "2024-10-20" },
  { halbjahr: 1, art: "theorie", von: "2024-10-21", bis: "2024-12-22" },
  { halbjahr: 1, art: "praxis",  von: "2024-12-23", bis: "2025-01-05" },
  { halbjahr: 1, art: "theorie", von: "2025-01-06", bis: "2025-01-26" },
  { halbjahr: 1, art: "praxis",  von: "2025-01-27", bis: "2025-04-13" },
  { halbjahr: 2, art: "theorie", von: "2025-04-14", bis: "2025-07-06" },
  { halbjahr: 2, art: "praxis",  von: "2025-07-07", bis: "2025-09-28" },
  { halbjahr: 3, art: "theorie", von: "2025-09-29", bis: "2025-12-21" },
  { halbjahr: 3, art: "praxis",  von: "2025-12-22", bis: "2026-02-22" },
  { halbjahr: 4, art: "theorie", von: "2026-02-23", bis: "2026-05-17" },
  { halbjahr: 4, art: "praxis",  von: "2026-05-18", bis: "2026-08-09" },
  { halbjahr: 5, art: "theorie", von: "2026-08-10", bis: "2026-11-01" },
  { halbjahr: 5, art: "praxis",  von: "2026-11-02", bis: "2027-01-31" },
  { halbjahr: 6, art: "theorie", von: "2027-02-01", bis: "2027-04-25" },
  { halbjahr: 6, art: "praxis",  von: "2027-04-26", bis: "2027-09-26" },
];

function phaseAm(tag: string) {
  return PHASEN.find(p => p.von <= tag && p.bis >= tag) || null;
}

function ostersonntag(jahr: number): string {
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

function feiertagAm(tag: string, land: string): string {
  const jahr = Number(tag.slice(0, 4)), ostern = ostersonntag(jahr);
  const liste: Record<string, string> = {
    [jahr + "-01-01"]: "Neujahr", [tagPlus(ostern, -2)]: "Karfreitag", [tagPlus(ostern, 1)]: "Ostermontag",
    [jahr + "-05-01"]: "Tag der Arbeit", [tagPlus(ostern, 39)]: "Christi Himmelfahrt",
    [tagPlus(ostern, 50)]: "Pfingstmontag", [jahr + "-10-03"]: "Tag der Deutschen Einheit",
    [jahr + "-12-25"]: "1. Weihnachtstag", [jahr + "-12-26"]: "2. Weihnachtstag",
  };
  if (land === "BE" || (land === "MV" && jahr >= 2023)) liste[jahr + "-03-08"] = "Frauentag";
  if (land === "BB" || land === "MV") liste[jahr + "-10-31"] = "Reformationstag";
  return liste[tag] || "";
}

/* Die Einstellung aus der App (Eintrag "einstellung-uniplan"), sonst die
   Vorgabe der App: Arbeit an, 08:00–16:30, Feiertage nach MV. */
function arbeitszeit(eintraege: Record<string, Eintrag>) {
  const e = eintraege["einstellung-uniplan"] || {};
  return {
    an: e.arbeit === undefined ? true : e.arbeit === true || e.arbeit === "ja",
    von: istUhr(e.von) ? String(e.von) : "08:00",
    bis: istUhr(e.bis) ? String(e.bis) : "16:30",
    land: ["MV", "BE", "BB"].includes(String(e.land)) ? String(e.land) : "MV",
  };
}

function phaseText(tag: string): string {
  const p = phaseAm(tag);
  return p ? `${p.art === "praxis" ? "Praxisphase (im Betrieb)" : "Theoriephase (an der HWR)"}, ${p.halbjahr}. Studienhalbjahr, bis ${tagText(p.bis)}`
    : "keine Studienphase";
}


/* --- Der Raum ------------------------------------------------------------ */

type Eintrag = Record<string, unknown>;
type Raum = { fassung: number; inhalt: { v?: number; eintraege?: Record<string, Eintrag> } };

async function raumLesen(raum: string): Promise<Raum> {
  const r = await rufen("mcp_raum_lesen", { p_raum: raum });
  if (!r) throw new Error("Raum nicht gefunden");
  return r as Raum;
}

function lebendig(eintraege: Record<string, Eintrag>) {
  return Object.entries(eintraege).filter(([, e]) => e && !e.geloescht);
}

/* Ändert den Raum mit einer Funktion und schreibt zurück. Hat dazwischen
   ein Gerät geschrieben, beginnt es mit dem frischen Stand von vorn. */
async function raumAendern<T>(raum: string, aendern: (e: Record<string, Eintrag>, jetzt: number) => T): Promise<T> {
  for (let versuch = 0; versuch < 4; versuch++) {
    const r = await raumLesen(raum);
    const inhalt = { v: 2, ...(r.inhalt || {}) };
    const eintraege = { ...(inhalt.eintraege || {}) };
    const ergebnis = aendern(eintraege, Date.now());
    const ok = await rufen("mcp_raum_schreiben", {
      p_raum: raum, p_inhalt: { ...inhalt, eintraege }, p_fassung: r.fassung,
    });
    if (ok === true) return ergebnis;
    await new Promise(z => setTimeout(z, 150 * (versuch + 1)));
  }
  throw new Error("Der Planer wurde gerade gleichzeitig geändert. Bitte noch einmal versuchen.");
}

const neueKennung = (vorsatz: string) => vorsatz + "-" + Date.now() + "-" + Math.floor(Math.random() * 100000);


/* --- Die Werkzeuge ------------------------------------------------------- */

type Werkzeug = {
  name: string; title: string; description: string;
  inputSchema: Record<string, unknown>;
  annotations: { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint?: boolean; openWorldHint?: boolean };
  ausfuehren: (raum: string, a: Record<string, unknown>) => Promise<string>;
};

const OBJ = (eigenschaften: Record<string, unknown>, pflicht: string[] = []) =>
  ({ type: "object", properties: eigenschaften, required: pflicht, additionalProperties: false });
const LESEN = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const ANLEGEN = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
const AENDERN = { readOnlyHint: false, destructiveHint: true, openWorldHint: false };

async function termineZwischen(raum: string, von: string, bis: string) {
  const eintraege = (await raumLesen(raum)).inhalt?.eintraege || {};
  const modulnotizen = lebendig(eintraege).filter(([, e]) => e.art === "modulnotiz");
  const zeilen: { start: string; text: string }[] = [];
  for (const t of await plan()) {
    const tag = t.start.slice(0, 10);
    if (tag < von || tag > bis) continue;
    const kurz = eintraege[t.id];
    const notizen = modulnotizen.filter(([, e]) => e.fach === t.titel).map(([, e]) => String(e.inhalt));
    zeilen.push({ start: t.start, text:
      `${tagText(tag)} ${t.start.slice(11, 16)}–${t.ende.slice(11, 16)} ${kurzerTitel(t.titel)}`
      + (t.raum ? ` (${String(t.raum).replace(/^CL:\s*/, "")})` : "")
      + (t.anmerkung ? ` · HWR-Hinweis: ${t.anmerkung}` : "")
      + (kurz && !kurz.geloescht && kurz.art === "notiz" ? ` · To-do am Termin: ${kurz.text}${kurz.erledigt ? " (erledigt)" : ""}` : "")
      + (notizen.length ? ` · Modulnotizen: ${notizen.join(" / ")}` : "")
      + ` [HWR, kennung ${t.id}]` });
  }
  for (const [k, e] of lebendig(eintraege)) {
    if (e.art !== "termin") continue;
    const start = String(e.start || ""), ende = String(e.ende || start);
    const tagVon = start.slice(0, 10), tagBis = ende.slice(0, 10);
    if (tagBis < von || tagVon > bis) continue;
    zeilen.push({ start: e.ganztags ? tagVon + "T00:00" : start, text:
      `${tagText(tagVon)} ${e.ganztags ? (tagBis > tagVon ? "ganztägig bis " + tagText(tagBis) : "ganztägig")
        : start.slice(11, 16) + "–" + ende.slice(11, 16)} ${e.titel}`
      + (e.urlaub ? " (Urlaub)" : "") + (e.ort ? ` · ${e.ort}` : "") + (e.notiz ? ` · Notiz: ${e.notiz}` : "")
      + (e.wichtig ? " · ★" : "") + ` [eigener Termin, kennung ${k}]` });
  }
  // Arbeit im Betrieb, wie die App sie in den Kalender rechnet.
  const arbeit = arbeitszeit(eintraege);
  if (arbeit.an) {
    const urlaub = lebendig(eintraege).filter(([, e]) => e.art === "termin" && e.urlaub)
      .map(([, e]) => [String(e.start || "").slice(0, 10), String(e.ende || e.start || "").slice(0, 10)]);
    for (let tag = von; tag <= bis; tag = tagPlus(tag, 1)) {
      const wochentag = new Date(tag + "T12:00:00Z").getUTCDay();
      if (phaseAm(tag)?.art !== "praxis" || wochentag === 0 || wochentag === 6) continue;
      if (feiertagAm(tag, arbeit.land) || urlaub.some(([u, o]) => u <= tag && o >= tag)) continue;
      zeilen.push({ start: tag + "T" + arbeit.von,
        text: `${tagText(tag)} ${arbeit.von}–${arbeit.bis} Arbeit im Betrieb [Praxisphase]` });
    }
  }
  zeilen.sort((a, b) => a.start.localeCompare(b.start));
  return zeilen.map(z => z.text);
}

function todosText(eintraege: Record<string, Eintrag>, auchErledigte: boolean, heute: string) {
  const liste = lebendig(eintraege)
    .filter(([, e]) => e.art === "aufgabe" && (auchErledigte || !e.erledigt))
    .sort(([, a], [, b]) => String(a.datum || "9999").localeCompare(String(b.datum || "9999")));
  return liste.map(([k, e]) => {
    const datum = String(e.datum || "");
    const wann = !datum ? "ohne Datum" : datum < heute ? "überfällig seit " + tagText(datum)
      : datum === heute ? "heute" : tagText(datum);
    return `${e.erledigt ? "✓" : "○"} ${e.text} · ${wann}${e.wichtig ? " · ★" : ""} [kennung ${k}]`;
  });
}

const WERKZEUGE: Werkzeug[] = [
  {
    name: "planer_ueberblick", title: "Überblick: heute, morgen, offene To-dos",
    description: "Liefert das heutige Datum und die Uhrzeit (Berlin), die Termine von heute und morgen, offene To-dos und wie viele Einträge im Gedächtnis stehen. Zuerst aufrufen, wenn es um den Planer geht.",
    inputSchema: OBJ({}), annotations: LESEN,
    ausfuehren: async (raum) => {
      const jetzt = berlin(), heute = jetzt.slice(0, 10);
      const eintraege = (await raumLesen(raum)).inhalt?.eintraege || {};
      const termine = await termineZwischen(raum, heute, tagPlus(heute, 1));
      const todos = todosText(eintraege, false, heute).slice(0, 15);
      const gedaechtnis = lebendig(eintraege).filter(([, e]) => e.art === "gedaechtnis").length;
      return [`Jetzt: ${tagText(heute)}, ${jetzt.slice(11, 16)} Uhr (Europe/Berlin).`,
        `Studienphase: ${phaseText(heute)}.`,
        "", "Termine heute und morgen:", ...(termine.length ? termine : ["keine"]),
        "", "Offene To-dos:", ...(todos.length ? todos : ["keine"]),
        "", `Gedächtnis: ${gedaechtnis} Einträge (gedaechtnis_lesen).`].join("\n");
    },
  },
  {
    name: "termine_lesen", title: "Termine in einem Zeitraum",
    description: "Alle Termine zwischen zwei Tagen (höchstens 62 Tage): HWR-Vorlesungen (mit Raum, HWR-Hinweisen, Modulnotizen), eigene Termine und in Praxisphasen die Arbeit im Betrieb.",
    inputSchema: OBJ({ von: { type: "string", description: "YYYY-MM-DD" }, bis: { type: "string", description: "YYYY-MM-DD" } }, ["von", "bis"]),
    annotations: LESEN,
    ausfuehren: async (raum, a) => {
      if (!istTag(a.von) || !istTag(a.bis)) throw new Error("von und bis als YYYY-MM-DD");
      const von = String(a.von), bis = String(a.bis) < tagPlus(von, 62) ? String(a.bis) : tagPlus(von, 62);
      const z = await termineZwischen(raum, von, bis);
      return z.length ? z.join("\n") : "Keine Termine in diesem Zeitraum.";
    },
  },
  {
    name: "todos_lesen", title: "To-dos lesen",
    description: "Die To-dos, nach Datum sortiert, mit Kennung zum Abhaken oder Ändern.",
    inputSchema: OBJ({ erledigte_auch: { type: "boolean" } }), annotations: LESEN,
    ausfuehren: async (raum, a) => {
      const e = (await raumLesen(raum)).inhalt?.eintraege || {};
      const z = todosText(e, Boolean(a.erledigte_auch), berlin().slice(0, 10));
      return z.length ? z.join("\n") : "Keine To-dos.";
    },
  },
  {
    name: "notizen_lesen", title: "Notizen und Modulnotizen lesen",
    description: "Notizen aus dem Notizbuch (erste Zeile ist die Überschrift) und kurze Modulnotizen. Optional nach einem Suchwort gefiltert.",
    inputSchema: OBJ({ suchwort: { type: "string" } }), annotations: LESEN,
    ausfuehren: async (raum, a) => {
      const e = (await raumLesen(raum)).inhalt?.eintraege || {};
      const such = String(a.suchwort || "").toLowerCase();
      const passt = (t: string) => !such || t.toLowerCase().includes(such);
      const zettel = lebendig(e).filter(([, x]) => x.art === "zettel" && passt(String(x.inhalt || "")))
        .map(([k, x]) => `• ${x.angeheftet ? "📌 " : ""}${x.wichtig ? "★ " : ""}${String(x.inhalt).slice(0, 1500)} [Notiz, kennung ${k}]`);
      const modul = lebendig(e).filter(([, x]) => x.art === "modulnotiz" && passt(String(x.inhalt) + " " + String(x.fach)))
        .map(([k, x]) => `• ${kurzerTitel(String(x.fach))}: ${x.inhalt} [Modulnotiz, kennung ${k}]`);
      return [`Notizbuch (${zettel.length}):`, ...zettel, "", `Modulnotizen (${modul.length}):`, ...modul].join("\n");
    },
  },
  {
    name: "module_lesen", title: "Belegte Module",
    description: "Die Module aus Friedrichs HWR-Stundenplan (nur belegte), mit Zahl der Modulnotizen.",
    inputSchema: OBJ({}), annotations: LESEN,
    ausfuehren: async (raum) => {
      const e = (await raumLesen(raum)).inhalt?.eintraege || {};
      const notizen = lebendig(e).filter(([, x]) => x.art === "modulnotiz");
      return (await module()).map(m => `• ${kurzerTitel(m)}${
        notizen.filter(([, x]) => x.fach === m).length ? ` (${notizen.filter(([, x]) => x.fach === m).length} Modulnotizen)` : ""}`).join("\n");
    },
  },
  {
    name: "einkaufsliste_lesen", title: "Einkaufszettel lesen",
    description: "Offene und abgehakte Artikel auf dem Einkaufszettel.",
    inputSchema: OBJ({}), annotations: LESEN,
    ausfuehren: async (raum) => {
      const e = (await raumLesen(raum)).inhalt?.eintraege || {};
      const z = lebendig(e).filter(([, x]) => x.art === "einkauf")
        .sort(([, a], [, b]) => Number(a.erledigt) - Number(b.erledigt) || Number(a.angelegt) - Number(b.angelegt))
        .map(([k, x]) => `${x.erledigt ? "✓" : "○"} ${x.inhalt} [kennung ${k}]`);
      return z.length ? z.join("\n") : "Der Einkaufszettel ist leer.";
    },
  },
  {
    name: "gedaechtnis_lesen", title: "Gedächtnis: was du über Friedrich weißt",
    description: "Dauerhafte Fakten und Vorlieben über Friedrich, die du dir früher gemerkt hast. Zu Beginn eines Gesprächs über den Planer lesen und berücksichtigen.",
    inputSchema: OBJ({}), annotations: LESEN,
    ausfuehren: async (raum) => {
      const e = (await raumLesen(raum)).inhalt?.eintraege || {};
      const z = lebendig(e).filter(([, x]) => x.art === "gedaechtnis")
        .sort(([, a], [, b]) => Number(a.angelegt) - Number(b.angelegt))
        .map(([k, x]) => `• ${x.inhalt} [kennung ${k}]`);
      return z.length ? z.join("\n") : "Noch nichts gemerkt.";
    },
  },
  {
    name: "todo_anlegen", title: "To-do anlegen",
    description: "Legt ein To-do an, optional mit Fälligkeitstag und Stern.",
    inputSchema: OBJ({ text: { type: "string" }, datum: { type: "string", description: "YYYY-MM-DD, leer für ohne Datum" },
      wichtig: { type: "boolean" } }, ["text"]),
    annotations: ANLEGEN,
    ausfuehren: async (raum, a) => {
      const text = sauber(a.text, 300);
      if (!text) throw new Error("Text fehlt");
      if (a.datum && !istTag(a.datum)) throw new Error("datum als YYYY-MM-DD");
      const k = neueKennung("eigen");
      await raumAendern(raum, (e, jetzt) => {
        e[k] = { art: "aufgabe", text, datum: a.datum || "", erledigt: false, wichtig: Boolean(a.wichtig),
                 erinnerungVorgabe: "", erinnerung: "", geaendert: jetzt };
      });
      return `To-do angelegt: ${text}${a.datum ? " · " + tagText(String(a.datum)) : ""} [kennung ${k}]`;
    },
  },
  {
    name: "termin_anlegen", title: "Eigenen Termin anlegen",
    description: "Legt einen eigenen Termin an. Mit Uhrzeit (von, bis) oder ganztägig; mehrtägig über bis_datum.",
    inputSchema: OBJ({
      titel: { type: "string" }, datum: { type: "string", description: "YYYY-MM-DD" },
      von: { type: "string", description: "HH:MM" }, bis: { type: "string", description: "HH:MM" },
      ganztags: { type: "boolean" }, bis_datum: { type: "string", description: "YYYY-MM-DD, nur ganztägig mehrtägig" },
      ort: { type: "string" }, notiz: { type: "string" }, wichtig: { type: "boolean" },
    }, ["titel", "datum"]),
    annotations: ANLEGEN,
    ausfuehren: async (raum, a) => {
      const titel = sauber(a.titel, 120);
      if (!titel || !istTag(a.datum)) throw new Error("titel und datum (YYYY-MM-DD) nötig");
      const ganztags = Boolean(a.ganztags) || !a.von;
      if (!ganztags && !istUhr(a.von)) throw new Error("von als HH:MM");
      const datum = String(a.datum);
      let start: string, ende: string;
      if (ganztags) {
        const bisTag = istTag(a.bis_datum) && String(a.bis_datum) >= datum ? String(a.bis_datum) : datum;
        start = datum + "T00:00"; ende = bisTag + "T00:00";
      } else {
        start = datum + "T" + a.von;
        const [h, m] = String(a.von).split(":").map(Number);
        const standardEnde = String(Math.min(23, h + 1)).padStart(2, "0") + ":" + String(m).padStart(2, "0");
        ende = datum + "T" + (istUhr(a.bis) && String(a.bis) > String(a.von) ? a.bis : standardEnde);
      }
      const k = neueKennung("termin");
      await raumAendern(raum, (e, jetzt) => {
        e[k] = { art: "termin", titel, start, ende, ganztags, ort: sauber(a.ort, 120), notiz: sauber(a.notiz, 500),
                 wichtig: Boolean(a.wichtig), urlaub: false, erinnerungVorgabe: "", erinnerung: "", geaendert: jetzt };
      });
      return `Termin angelegt: ${titel} · ${tagText(datum)} ${ganztags ? "ganztägig" : start.slice(11) + "–" + ende.slice(11)} [kennung ${k}]`;
    },
  },
  {
    name: "notiz_anlegen", title: "Notiz im Notizbuch anlegen",
    description: "Längere Notiz im Notizbuch (Reiter Notizen). Die erste Zeile wird die Überschrift. Optional angeheftet, mit Stern oder mit einem Modul verknüpft. Für eine kurze Zeile zu einem Modul lieber modulnotiz_anlegen.",
    inputSchema: OBJ({ text: { type: "string" }, angeheftet: { type: "boolean" }, wichtig: { type: "boolean" },
      modul: { type: "string", description: "optional, Modul zum Verknüpfen" } }, ["text"]),
    annotations: ANLEGEN,
    ausfuehren: async (raum, a) => {
      const text = String(a.text || "").trim().slice(0, 20000);
      if (!text) throw new Error("Text fehlt");
      const verweise = a.modul ? ["fach:" + await modulFinden(String(a.modul))] : [];
      const k = neueKennung("zettel");
      await raumAendern(raum, (e, jetzt) => {
        e[k] = { art: "zettel", inhalt: text, verweise, wichtig: Boolean(a.wichtig), angeheftet: Boolean(a.angeheftet),
                 position: "", geaendert: jetzt };
      });
      return `Notiz angelegt: ${text.split("\n")[0].slice(0, 80)}${verweise.length ? " · verknüpft mit " + kurzerTitel(verweise[0].slice(5)) : ""} [kennung ${k}]`;
    },
  },
  {
    name: "modulnotiz_anlegen", title: "Kurze Notiz zu einem Modul",
    description: "Eine Zeile zu einem Modul, z. B. „Präsi am 13.10.“. Steht in der App an jeder Vorlesung dieses Moduls, nicht im Notizbuch. Das Modul darf ungenau sein (z. B. „Controlling“); bei mehreren Treffern kommt eine Rückfrage.",
    inputSchema: OBJ({ modul: { type: "string" }, text: { type: "string" } }, ["modul", "text"]),
    annotations: ANLEGEN,
    ausfuehren: async (raum, a) => {
      const text = sauber(a.text, 160);
      if (!text) throw new Error("Text fehlt");
      const fach = await modulFinden(String(a.modul || ""));
      const k = neueKennung("modulnotiz");
      await raumAendern(raum, (e, jetzt) => {
        e[k] = { art: "modulnotiz", fach, inhalt: text, angelegt: jetzt, geaendert: jetzt };
      });
      return `Modulnotiz bei ${kurzerTitel(fach)}: ${text} [kennung ${k}]`;
    },
  },
  {
    name: "einkauf_hinzufuegen", title: "Auf den Einkaufszettel",
    description: "Setzt einen oder mehrere Artikel auf den Einkaufszettel.",
    inputSchema: OBJ({ artikel: { type: "array", items: { type: "string" } } }, ["artikel"]),
    annotations: ANLEGEN,
    ausfuehren: async (raum, a) => {
      const liste = (Array.isArray(a.artikel) ? a.artikel : []).map(x => sauber(x, 120)).filter(Boolean).slice(0, 30);
      if (!liste.length) throw new Error("Keine Artikel");
      await raumAendern(raum, (e, jetzt) => {
        liste.forEach((text, i) => {
          e[neueKennung("einkauf")] = { art: "einkauf", inhalt: text, erledigt: false, angelegt: jetzt + i, geaendert: jetzt + i };
        });
      });
      return "Auf dem Einkaufszettel: " + liste.join(", ");
    },
  },
  {
    name: "gedaechtnis_merken", title: "Etwas über Friedrich merken",
    description: "Speichert einen dauerhaften Fakt oder eine Vorliebe über Friedrich (ein Satz), damit du ihn künftig kennst. Nur Dauerhaftes, keine einmaligen Aufgaben. Friedrich sieht und löscht das Gedächtnis in den Planer-Einstellungen.",
    inputSchema: OBJ({ fakt: { type: "string" } }, ["fakt"]),
    annotations: ANLEGEN,
    ausfuehren: async (raum, a) => {
      const fakt = sauber(a.fakt, 300);
      if (!fakt) throw new Error("Fakt fehlt");
      const k = neueKennung("gedaechtnis");
      await raumAendern(raum, (e, jetzt) => {
        e[k] = { art: "gedaechtnis", inhalt: fakt, angelegt: jetzt, geaendert: jetzt };
      });
      return "Gemerkt: " + fakt;
    },
  },
  {
    name: "abhaken", title: "Abhaken oder wieder öffnen",
    description: "Hakt ein To-do, ein To-do an einem Termin oder einen Einkaufsartikel ab (erledigt=true) oder öffnet ihn wieder.",
    inputSchema: OBJ({ kennung: { type: "string" }, erledigt: { type: "boolean" } }, ["kennung"]),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    ausfuehren: async (raum, a) => {
      const k = String(a.kennung || ""), erledigt = a.erledigt !== false;
      return await raumAendern(raum, (e, jetzt) => {
        const x = e[k];
        if (!x || x.geloescht || !["aufgabe", "notiz", "einkauf"].includes(String(x.art))) throw new Error("Nichts zum Abhaken unter dieser Kennung");
        e[k] = { ...x, erledigt, geaendert: jetzt };
        return `${erledigt ? "Abgehakt" : "Wieder offen"}: ${x.text ?? x.inhalt}`;
      });
    },
  },
  {
    name: "todo_aendern", title: "To-do ändern",
    description: "Ändert Text, Datum oder Stern eines To-dos. Vorher mit Friedrich bestätigen.",
    inputSchema: OBJ({ kennung: { type: "string" }, text: { type: "string" }, datum: { type: "string" }, wichtig: { type: "boolean" } }, ["kennung"]),
    annotations: AENDERN,
    ausfuehren: async (raum, a) => {
      if (a.datum && !istTag(a.datum)) throw new Error("datum als YYYY-MM-DD");
      return await raumAendern(raum, (e, jetzt) => {
        const x = e[String(a.kennung)];
        if (!x || x.geloescht || x.art !== "aufgabe") throw new Error("Kein To-do unter dieser Kennung");
        const neu = { ...x, geaendert: jetzt } as Eintrag;
        if (a.text) neu.text = sauber(a.text, 300);
        if (a.datum !== undefined) { neu.datum = a.datum || ""; neu.erinnerung = ""; neu.erinnerungVorgabe = ""; }
        if (a.wichtig !== undefined) neu.wichtig = Boolean(a.wichtig);
        e[String(a.kennung)] = neu;
        return `Geändert: ${neu.text}${neu.datum ? " · " + tagText(String(neu.datum)) : ""}`;
      });
    },
  },
  {
    name: "termin_aendern", title: "Eigenen Termin ändern",
    description: "Ändert Titel, Tag, Uhrzeit, Ort oder Notiz eines eigenen Termins (HWR-Termine sind nicht änderbar). Vorher mit Friedrich bestätigen.",
    inputSchema: OBJ({ kennung: { type: "string" }, titel: { type: "string" }, datum: { type: "string" },
      von: { type: "string" }, bis: { type: "string" }, ort: { type: "string" }, notiz: { type: "string" } }, ["kennung"]),
    annotations: AENDERN,
    ausfuehren: async (raum, a) => {
      return await raumAendern(raum, (e, jetzt) => {
        const x = e[String(a.kennung)];
        if (!x || x.geloescht || x.art !== "termin") throw new Error("Kein eigener Termin unter dieser Kennung");
        const neu = { ...x, geaendert: jetzt, erinnerung: "", erinnerungVorgabe: "" } as Eintrag;
        const alterTag = String(x.start).slice(0, 10);
        const tag = istTag(a.datum) ? String(a.datum) : alterTag;
        if (a.titel) neu.titel = sauber(a.titel, 120);
        if (a.ort !== undefined) neu.ort = sauber(a.ort, 120);
        if (a.notiz !== undefined) neu.notiz = sauber(a.notiz, 500);
        if (x.ganztags) {
          const dauer = Math.round((Date.parse(String(x.ende).slice(0, 10)) - Date.parse(alterTag)) / 86400000);
          neu.start = tag + "T00:00"; neu.ende = tagPlus(tag, Math.max(0, dauer)) + "T00:00";
        } else {
          const von = istUhr(a.von) ? String(a.von) : String(x.start).slice(11, 16);
          const bis = istUhr(a.bis) ? String(a.bis) : String(x.ende).slice(11, 16);
          neu.start = tag + "T" + von; neu.ende = tag + "T" + (bis > von ? bis : von);
        }
        e[String(a.kennung)] = neu;
        return `Geändert: ${neu.titel} · ${tagText(tag)}${x.ganztags ? "" : " " + String(neu.start).slice(11) + "–" + String(neu.ende).slice(11)}`;
      });
    },
  },
  {
    name: "eintrag_loeschen", title: "Eintrag löschen",
    description: "Löscht ein To-do, einen eigenen Termin, eine Notiz, eine Modulnotiz, einen Einkaufsartikel oder einen Gedächtnis-Eintrag (HWR-Termine nicht). Vorher mit Friedrich bestätigen.",
    inputSchema: OBJ({ kennung: { type: "string" } }, ["kennung"]),
    annotations: AENDERN,
    ausfuehren: async (raum, a) => {
      const k = String(a.kennung || "");
      return await raumAendern(raum, (e, jetzt) => {
        const x = e[k];
        if (!x || x.geloescht || !["aufgabe", "termin", "zettel", "modulnotiz", "einkauf", "gedaechtnis", "notiz"].includes(String(x.art))) {
          throw new Error("Nichts Löschbares unter dieser Kennung");
        }
        e[k] = { geloescht: true, geaendert: jetzt };
        return "Gelöscht: " + String(x.titel ?? x.text ?? x.inhalt ?? k).split("\n")[0].slice(0, 80);
      });
    },
  },
];

const ANLEITUNG = [
  "Du bist mit Friedrichs Planer verbunden, seiner App für Studium und Alltag (dualer Student, Tourismus, HWR Berlin).",
  "Bereiche: Plan (HWR-Stundenplan und eigene Termine), To-dos (mit oder ohne Datum), Notizbuch (lange Notizen, erste Zeile ist die Überschrift),",
  "Modulnotizen (kurze Zeilen zu einem Modul, stehen in der App an jeder Vorlesung), Einkaufszettel und dein Gedächtnis über Friedrich.",
  "Theorie- und Praxisphasen wechseln sich ab; in Praxisphasen arbeitet er Mo–Fr im Betrieb (steht als Termin in termine_lesen).",
  "",
  "So arbeitest du:",
  "- Rufe zu Beginn planer_ueberblick auf (heutiges Datum, Termine, To-dos) und gedaechtnis_lesen, und richte dich danach.",
  "- Relative Angaben wie „morgen“ oder „nächsten Donnerstag“ rechnest du vom heutigen Datum aus planer_ueberblick um. Zeiten sind Europe/Berlin.",
  "- „Notiz zu Management“ ist meist eine Modulnotiz (modulnotiz_anlegen); längere Texte gehören ins Notizbuch (notiz_anlegen).",
  "- Sagt Friedrich etwas Dauerhaftes über sich (Gewohnheit, Vorliebe, Regel), merke es dir mit gedaechtnis_merken, kurz und sachlich.",
  "- Anlegen darfst du direkt. Ändern und Löschen nur, nachdem Friedrich es im Gespräch bestätigt hat.",
  "- Bestätige knapp, was du angelegt hast. Antworte auf Deutsch.",
  "",
  "So sehen deine Antworten aus (sie erscheinen oft in einem kleinen Fenster auf dem iPhone, das kein Markdown kann):",
  "- Kein Markdown: keine Sternchen, keine Rauten, keine Tabellen.",
  "- Ein Termin oder To-do pro Zeile, Zeit vorn: „10:00–11:00  Werkstatt-Termin“. Vor jedem Tag eine kurze Zeile wie „Morgen, Di 20.10.:“.",
  "- Kurz. Keine Einleitung, keine Hinweise darauf, was der Planer nicht enthält, und die Studienphase nur, wenn danach gefragt ist oder sie etwas ändert.",
].join("\n");


/* --- MCP ------------------------------------------------------------------ */

async function mcp(anfrage: Request, raum: string): Promise<Response> {
  let koerper: unknown;
  try { koerper = await anfrage.json(); }
  catch { return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400); }

  const einzeln = !Array.isArray(koerper);
  const nachrichten = (einzeln ? [koerper] : koerper) as Array<Record<string, unknown>>;
  const antworten: unknown[] = [];

  for (const n of nachrichten) {
    if (!n || typeof n !== "object" || n.id === undefined || n.id === null) continue;   // Benachrichtigung
    const id = n.id, methode = String(n.method || ""), p = (n.params || {}) as Record<string, unknown>;
    try {
      if (methode === "initialize") {
        const gewuenscht = String(p.protocolVersion || "");
        antworten.push({ jsonrpc: "2.0", id, result: {
          protocolVersion: PROTOKOLLE.includes(gewuenscht) ? gewuenscht : PROTOKOLLE[1],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "planer", title: "Planer", version: "1.1.0" },
          instructions: ANLEITUNG,
        } });
      } else if (methode === "ping") {
        antworten.push({ jsonrpc: "2.0", id, result: {} });
      } else if (methode === "tools/list") {
        antworten.push({ jsonrpc: "2.0", id, result: { tools: WERKZEUGE.map(w => ({
          name: w.name, title: w.title, description: w.description, inputSchema: w.inputSchema, annotations: w.annotations,
        })) } });
      } else if (methode === "tools/call") {
        const w = WERKZEUGE.find(x => x.name === p.name);
        if (!w) {
          antworten.push({ jsonrpc: "2.0", id, error: { code: -32602, message: "Unbekanntes Werkzeug: " + p.name } });
          continue;
        }
        try {
          const text = await w.ausfuehren(raum, (p.arguments || {}) as Record<string, unknown>);
          antworten.push({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: text.slice(0, 100000) }] } });
        } catch (fehler) {
          antworten.push({ jsonrpc: "2.0", id, result: { isError: true,
            content: [{ type: "text", text: String((fehler as Error).message).slice(0, 2000) }] } });
        }
      } else {
        antworten.push({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found: " + methode } });
      }
    } catch (fehler) {
      antworten.push({ jsonrpc: "2.0", id, error: { code: -32603, message: String((fehler as Error).message).slice(0, 300) } });
    }
  }

  if (!antworten.length) return new Response(null, { status: 202, headers: CORS });
  return json(einzeln ? antworten[0] : antworten);
}


/* --- OAuth ---------------------------------------------------------------- */

const AS_METADATEN = {
  issuer: BASIS,
  authorization_endpoint: BASIS + "/authorize",
  token_endpoint: BASIS + "/token",
  registration_endpoint: BASIS + "/register",
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  code_challenge_methods_supported: ["S256"],
  token_endpoint_auth_methods_supported: ["none"],
  scopes_supported: ["planer"],
};

async function registrieren(anfrage: Request) {
  let k: Record<string, unknown> = {};
  try { k = await anfrage.json(); } catch { /* leer */ }
  const uris = Array.isArray(k.redirect_uris) ? k.redirect_uris.map(String) : [];
  if (!uris.length || !uris.every(rueckspringenErlaubt)) {
    return json({ error: "invalid_redirect_uri", error_description: "Nur Claude darf sich registrieren." }, 400);
  }
  const clientId = "planer-" + zufall(16);
  await rufen("mcp_client_anlegen", { p_client_id: clientId, p_name: sauber(k.client_name, 100), p_redirect_uris: uris });
  return json({
    client_id: clientId, client_id_issued_at: Math.floor(Date.now() / 1000), redirect_uris: uris,
    client_name: sauber(k.client_name, 100), token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"], response_types: ["code"],
  }, 201);
}

async function clientPruefen(clientId: string, redirectUri: string): Promise<boolean> {
  if (!clientId || !redirectUri) return false;
  const c = await rufen("mcp_client_lesen", { p_client_id: clientId });
  return Boolean(c && Array.isArray(c.redirect_uris) && c.redirect_uris.includes(redirectUri));
}

async function autorisieren(url: URL) {
  const q = url.searchParams;
  if (q.get("response_type") !== "code") return json({ error: "unsupported_response_type" }, 400);
  if (q.get("code_challenge_method") !== "S256" || !q.get("code_challenge")) {
    return json({ error: "invalid_request", error_description: "PKCE mit S256 nötig" }, 400);
  }
  if (!(await clientPruefen(q.get("client_id") || "", q.get("redirect_uri") || ""))) {
    return json({ error: "invalid_client" }, 400);
  }
  const weiter = new URL(VERBINDEN_SEITE);
  for (const name of ["client_id", "redirect_uri", "code_challenge", "state", "scope"]) {
    const w = q.get(name);
    if (w) weiter.searchParams.set(name, w);
  }
  return new Response(null, { status: 302, headers: { ...CORS, Location: weiter.toString() } });
}

/* verbinden.html meldet sich hier: mit dem Gerätecode (Planer im selben
   Browser) oder mit dem kurzen Verbindungscode. */
async function verbinden(anfrage: Request) {
  let k: Record<string, unknown> = {};
  try { k = await anfrage.json(); } catch { return json({ fehler: "kein JSON" }, 400); }
  const clientId = String(k.client_id || ""), redirectUri = String(k.redirect_uri || "");
  const challenge = String(k.code_challenge || "");
  if (!challenge || !(await clientPruefen(clientId, redirectUri))) return json({ fehler: "Anfrage ungültig. Bitte in Claude neu verbinden." }, 400);

  let raum: string | null = null;
  if (typeof k.geraetecode === "string" && k.geraetecode.length >= 20) {
    raum = await rufen("mcp_raum_zum_code", { schluessel: k.geraetecode });
  } else if (typeof k.verbindungscode === "string") {
    const code = k.verbindungscode.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (code.length === 8) raum = await rufen("mcp_kopplung_einloesen", { p_code_hash: await sha256Hex(code) });
  }
  if (!raum) return json({ fehler: "Code unbekannt oder abgelaufen." }, 403);

  const authCode = zufall(32);
  await rufen("mcp_code_anlegen", { p_code_hash: await sha256Hex(authCode), p_client_id: clientId, p_raum: raum,
                                    p_redirect_uri: redirectUri, p_challenge: challenge });
  const ziel = new URL(redirectUri);
  ziel.searchParams.set("code", authCode);
  if (k.state) ziel.searchParams.set("state", String(k.state));
  return json({ weiter: ziel.toString() });
}

async function tokenAusgeben(clientId: string, raum: string) {
  const zugriff = zufall(32), erneuern = zufall(32);
  await rufen("mcp_token_anlegen", { p_token_hash: await sha256Hex(zugriff), p_art: "access", p_client_id: clientId, p_raum: raum, p_sekunden: ZUGRIFF_SEKUNDEN });
  await rufen("mcp_token_anlegen", { p_token_hash: await sha256Hex(erneuern), p_art: "refresh", p_client_id: clientId, p_raum: raum, p_sekunden: ERNEUERN_SEKUNDEN });
  return json({ access_token: zugriff, token_type: "Bearer", expires_in: ZUGRIFF_SEKUNDEN, refresh_token: erneuern, scope: "planer" });
}

async function token(anfrage: Request) {
  const art = anfrage.headers.get("content-type") || "";
  let f: Record<string, string> = {};
  if (art.includes("application/json")) f = await anfrage.json().catch(() => ({}));
  else f = Object.fromEntries(new URLSearchParams(await anfrage.text()));
  const fehler = (e: string, s = 400) => json({ error: e }, s);

  if (f.grant_type === "authorization_code") {
    if (!f.code || !f.code_verifier) return fehler("invalid_request");
    const z = await rufen("mcp_code_einloesen", { p_code_hash: await sha256Hex(f.code) });
    if (!z) return fehler("invalid_grant");
    if (f.client_id && f.client_id !== z.client_id) return fehler("invalid_grant");
    if (f.redirect_uri && f.redirect_uri !== z.redirect_uri) return fehler("invalid_grant");
    if (await sha256Base64Url(f.code_verifier) !== z.challenge) return fehler("invalid_grant");
    return await tokenAusgeben(z.client_id, z.raum);
  }
  if (f.grant_type === "refresh_token") {
    if (!f.refresh_token) return fehler("invalid_request");
    const t = await rufen("mcp_token_pruefen", { p_token_hash: await sha256Hex(f.refresh_token), p_art: "refresh" });
    if (!t || (f.client_id && f.client_id !== t.client_id)) return fehler("invalid_grant");
    return await tokenAusgeben(t.client_id, t.raum);
  }
  return fehler("unsupported_grant_type");
}

/* Aus der App: kurzen Verbindungscode erzeugen, Verbindungen zählen, trennen. */
async function planerAktion(anfrage: Request, aktion: string) {
  let k: Record<string, unknown> = {};
  try { k = await anfrage.json(); } catch { return json({ fehler: "kein JSON" }, 400); }
  const code = typeof k.code === "string" ? k.code : "";
  if (aktion === "kopplung") {
    const raum = await rufen("mcp_raum_zum_code", { schluessel: code });
    if (!raum) return json({ zustand: "nicht_freigegeben" }, 403);
    const verbindungscode = zufall(8, ZEICHEN);
    await rufen("mcp_kopplung_anlegen", { p_code_hash: await sha256Hex(verbindungscode), p_raum: raum });
    return json({ verbindungscode, gueltigMinuten: 10 });
  }
  if (aktion === "status") {
    const n = await rufen("mcp_verbindungen", { schluessel: code });
    if (n === -1 || n === null) return json({ zustand: "nicht_freigegeben" }, 403);
    return json({ zustand: "ok", verbindungen: n });
  }
  if (aktion === "trennen") {
    const n = await rufen("mcp_trennen", { schluessel: code });
    return json({ zustand: "ok", getrennt: n });
  }
  return json({ fehler: "unbekannt" }, 404);
}


/* --- Weiche -------------------------------------------------------------- */

Deno.serve(async (anfrage) => {
  if (anfrage.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const url = new URL(anfrage.url);
  // Supabase reicht "/planer-mcp/..." oder "/functions/v1/planer-mcp/..." durch.
  const pfad = url.pathname.replace(/^\/(functions\/v1\/)?planer-mcp/, "").replace(/\/+$/, "") || "/";

  try {
    if (pfad.startsWith("/.well-known/oauth-protected-resource")) {
      return json({ resource: BASIS, authorization_servers: [BASIS], bearer_methods_supported: ["header"],
                    scopes_supported: ["planer"], resource_name: "Planer" });
    }
    if (pfad.startsWith("/.well-known/oauth-authorization-server") || pfad.startsWith("/.well-known/openid-configuration")) {
      return json(AS_METADATEN);
    }
    if (pfad === "/register" && anfrage.method === "POST") return await registrieren(anfrage);
    if (pfad === "/authorize" && anfrage.method === "GET") return await autorisieren(url);
    if (pfad === "/verbinden" && anfrage.method === "POST") return await verbinden(anfrage);
    if (pfad === "/token" && anfrage.method === "POST") return await token(anfrage);
    if (pfad.startsWith("/planer/") && anfrage.method === "POST") return await planerAktion(anfrage, pfad.slice(8));

    if (pfad === "/" || pfad === "/mcp") {
      if (anfrage.method !== "POST") {
        return new Response(null, { status: 405, headers: { ...CORS, Allow: "POST" } });
      }
      const kopf = anfrage.headers.get("authorization") || "";
      const zugriff = kopf.startsWith("Bearer ") ? kopf.slice(7).trim() : "";
      const t = zugriff ? await rufen("mcp_token_pruefen", { p_token_hash: await sha256Hex(zugriff), p_art: "access" }) : null;
      if (!t) {
        return json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Anmeldung nötig" } }, 401, {
          "WWW-Authenticate": `Bearer resource_metadata="${BASIS}/.well-known/oauth-protected-resource", scope="planer"`,
        });
      }
      return await mcp(anfrage, t.raum);
    }
    return json({ fehler: "nicht gefunden" }, 404);
  } catch (fehler) {
    return json({ fehler: String((fehler as Error).message).slice(0, 300) }, 500);
  }
});
