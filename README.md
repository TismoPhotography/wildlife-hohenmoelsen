# Wildlife Hohenmölsen – OpenStreetMap Web-App

## Enthalten
- OpenStreetMap + Leaflet
- WHM-001: Hochsitz westlich Mondsee
- bestätigte Sichtung: 4 Rehe am 16.08.2026, 19:45–20:15
- Filter für Säugetiere, Brutvögel und Spots
- neue Spots direkt am Handy anlegen
- neue Sichtungen erfassen
- Speicherung im Browser via localStorage
- JSON Export / Import
- Standortfunktion des Handys
- PWA-Grundgerüst ("Zum Startbildschirm hinzufügen")

## Lokal testen
Einfach mit einem kleinen lokalen Webserver öffnen, z. B.:

python -m http.server 8000

Dann im Browser:
http://localhost:8000

## Kostenlos online stellen
Die App eignet sich für GitHub Pages, Netlify, Cloudflare Pages oder ähnliche statische Hosts.

## Daten
Die Daten liegen derzeit lokal im Browser. Für automatische Synchronisation zwischen Geräten kann später Google Sheets, Supabase oder eine andere Datenbank angebunden werden.

## Hinweis
OpenStreetMap-Kacheln benötigen Internet. Die App-Oberfläche kann nach dem ersten Laden teilweise aus dem Cache geöffnet werden, die Karte selbst aber nicht vollständig offline.
