#!/usr/bin/env python3
"""
Prueft den Claude-Connector "planer-mcp" von aussen (echter Server).

Der Connector kann in Friedrichs Planer lesen und schreiben. Hier wird
geprueft, dass niemand ohne Anmeldung hineinkommt, dass sich nur Claude
registrieren kann, dass fremde Codes abgewiesen werden und dass die
Datenbankfunktionen dahinter fuer die oeffentliche Seite gesperrt sind.

Der volle Anmeldeablauf mit Werkzeugen braucht einen freigegebenen Raum
und wurde am 19.10.2026 mit einem Testraum durchgespielt (danach
geloescht). Friedrichs Code steht in keinem Test.

Aufruf:  python3 tests/test_planer_mcp.py
"""

import json
import sys
import urllib.error
import urllib.request

URL = "https://copydwpdqpnwjvknsakz.supabase.co"
B = URL + "/functions/v1/planer-mcp"
OEFFENTLICH = "sb_publishable_d7pxVkeMCqwhFsLrupDovA_ag2SmffE"
fehler = []


def pruefe(was, ok, zusatz=""):
    print(("  OK   " if ok else "  FEHL ") + was + (("  -> " + str(zusatz)[:90]) if zusatz != "" else ""))
    if not ok:
        fehler.append(was)


def anfrage(url, felder=None, methode="POST", kopf=None):
    k = {"Content-Type": "application/json"}
    k.update(kopf or {})
    daten = json.dumps(felder).encode() if felder is not None else None

    class Kein(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *a, **kw):
            return None
    try:
        a = urllib.request.build_opener(Kein).open(urllib.request.Request(url, data=daten, headers=k, method=methode), timeout=30)
        return a.status, dict(a.headers), a.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read().decode()


print("\n1. Ohne Anmeldung kein Zugriff")
s, h, t = anfrage(B, {"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
pruefe("tools/list ohne Token: 401", s == 401, s)
www = h.get("WWW-Authenticate", h.get("www-authenticate", ""))
pruefe("401 nennt die Anmelde-Metadaten", "oauth-protected-resource" in www, www)
s, h, t = anfrage(B, {"jsonrpc": "2.0", "id": 1, "method": "tools/list"}, kopf={"Authorization": "Bearer erfunden"})
pruefe("erfundener Schluessel: 401", s == 401, s)
s, h, t = anfrage(B, methode="GET")
pruefe("GET auf den Connector: 405", s == 405, s)

print("\n2. Anmeldung")
s, h, t = anfrage(B + "/.well-known/oauth-authorization-server", methode="GET")
pruefe("Metadaten verlangen PKCE S256", s == 200 and json.loads(t).get("code_challenge_methods_supported") == ["S256"], t)
s, h, t = anfrage(B + "/register", {"redirect_uris": ["https://angreifer.example/callback"]})
pruefe("fremde Ruecksprungadresse wird nicht registriert", s == 400, s)
s, h, t = anfrage(B + "/authorize?response_type=code&client_id=erfunden&redirect_uri=https%3A%2F%2Fclaude.ai%2Fapi%2Fmcp%2Fauth_callback&code_challenge=x&code_challenge_method=S256", methode="GET")
pruefe("unbekannter Client wird nicht weitergeleitet", s == 400, s)
s, h, t = anfrage(B + "/token", {"grant_type": "authorization_code", "code": "erfunden", "code_verifier": "x" * 50})
pruefe("erfundener Code gibt keinen Schluessel", s == 400 and "access_token" not in t, s)

print("\n3. Fremde Geraetecodes")
for aktion in ("kopplung", "status"):
    s, h, t = anfrage(B + "/planer/" + aktion, {"code": "ERFUNDENERCODEXXXXXXXXXXX"})
    pruefe(aktion + " mit fremdem Code: 403", s == 403, s)

print("\n4. Datenbankfunktionen gesperrt")
kopf = {"apikey": OEFFENTLICH, "Authorization": "Bearer " + OEFFENTLICH}
for f, felder in [("mcp_raum_lesen", {"p_raum": "0" * 64}), ("mcp_raum_schreiben", {"p_raum": "0" * 64, "p_inhalt": {}, "p_fassung": 1}),
                  ("mcp_token_pruefen", {"p_token_hash": "x", "p_art": "access"}), ("mcp_raum_zum_code", {"schluessel": "x" * 25}),
                  ("mcp_kopplung_einloesen", {"p_code_hash": "x"})]:
    s, h, t = anfrage(URL + "/rest/v1/rpc/" + f, felder, kopf=kopf)
    pruefe(f + " ist gesperrt", s in (401, 403, 404), s)
for tabelle in ("mcp_tokens", "mcp_zugang", "mcp_clients"):
    s, h, t = anfrage(URL + "/rest/v1/" + tabelle + "?select=*", methode="GET", kopf=kopf)
    pruefe(tabelle + " ist nicht lesbar", s in (401, 403, 404, 406), s)

print()
if fehler:
    print(f"FEHLGESCHLAGEN ({len(fehler)}):")
    for f in fehler:
        print("  - " + f)
    sys.exit(1)
print("ALLE TESTS BESTANDEN")
