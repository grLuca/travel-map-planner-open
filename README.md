# Travel Map Planner

Travel Map Planner is a browser-based itinerary planning tool built around an interactive map. It helps you arrange trip days, search places, manage route stops and dining stops, compare transport options, and save or export editable travel plans.

The app stores plans in the browser by default. No backend account or database is required.

## Features

- Map-first itinerary planning for multi-day trips
- Route stops, accommodation stops, and dining stops
- Clickable map markers and route segments with a detail panel
- Baidu map rendering and place search with a browser-side AK
- Optional Amap Web Service proxy for route/search APIs
- Local draft and project library persistence
- JSON export/import for editable trip plans
- Responsive desktop and mobile layouts

## Tech Stack

- React 19
- TypeScript
- Vite
- Vitest
- Testing Library
- Lucide React

## Getting Started

Install dependencies:

```bash
npm install
```

Start the app:

```bash
npm run dev
```

Open the URL printed by Vite, usually:

```text
http://127.0.0.1:5173/
```

Use `127.0.0.1` consistently during local testing. Browsers keep separate localStorage data for `localhost` and `127.0.0.1`.

## Map API Configuration

Copy the environment example:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Environment variables:

```env
AMAP_WEB_SERVICE_KEY=
AMAP_PROXY_PORT=8787
VITE_BAIDU_BROWSER_AK=
```

### Baidu JavaScript API

Create a browser-side Baidu Maps application and enable JavaScript API. The browser AK can be configured either through `.env` with `VITE_BAIDU_BROWSER_AK`, or inside the app from the map API settings dialog.

Browser-side map keys are visible to users by design. Restrict allowed referers in the Baidu console before using a production key.

### Amap Proxy

The Amap Web Service key is read only by the local proxy. Start it in a separate terminal:

```bash
npm run amap:proxy
```

Then choose the Amap proxy map source in the app.

## Common Commands

```bash
npm run dev
npm run amap:proxy
npm test
npm run lint
npm run build
```

## Data Storage

The app uses browser localStorage for:

- `travel-map-planner:draft`: current editable draft
- `travel-map-planner:projects:v1`: saved project list
- `travel-map-planner:projects:v1:backups`: rolling raw backups
- `travel-map-planner:route-cache:v1`: route planning cache
- `travel-map-planner:map-api-settings:v1`: map API settings

Exported JSON files can be imported later to continue editing.

## License

MIT
