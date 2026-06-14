# Movement Tray Studio

A browser-based prototype for configuring and exporting printable miniature movement trays.

## Features

- Configure rows, columns, base size, spacing, and clearance
- Add a perimeter lip and interval notches
- Live isometric preview and exact dimensions
- Save presets in browser storage
- Export a printable ASCII STL without uploading data

## Run locally

On Windows, double-click `Start Movement Tray.cmd`.

Or run:

```powershell
npm start
```

Then open `http://localhost:4173`.

## Verify

```powershell
npm run check
```

## Deploy

The app is fully static. Run `Publish to GitHub.cmd`, then open **Settings → Pages** and select **Deploy from a branch**, `gh-pages`, and `/ (root)`.

The app can also be deployed by copying `index.html`, `styles.css`, and `app.js` to any static host.
