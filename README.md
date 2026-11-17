<img src="public/icon-180.png" width="64" height="64" alt="">

# Sips

A blind taste test log for adaptogen drinks, built to live on one phone. The taster logs
how she felt each evening. The person running the test enters the drinks and fills in
which drink each day was, behind a PIN. At the end, **Generate report** ranks the drinks.

Everything runs on the phone: no server, no account, works with no signal.

## How it works

- **Files:** plain static files in `public/`, hosted on GitHub Pages. A service worker
  (`public/sw.js`) keeps a copy on the phone, so after the first visit the app opens
  instantly and offline. Updates land on the next open after a deploy.
- **Data:** one JSON document in the phone's `localStorage` (`public/local.js`). It
  answers the same `api(method, path)` calls the app used when it had a Node backend.
- **Blinding:** drink names are encrypted with AES-GCM, using a key derived from the
  Setup PIN with PBKDF2 (WebCrypto). The PIN itself is never stored; one encrypted check
  value tells whether a PIN is right. Generate report decrypts the names and stores them
  in plain text so she can see the report.
- **Caveat:** the data exists only on that phone. Deleting the home-screen app or clearing
  website data erases it, so use **Back up** in Setup now and then. **Restore** loads a
  backup file. If the PIN is forgotten, the logs survive but the drink names can't be
  recovered.

## Setting up her phone

1. Open the GitHub Pages URL in Safari on her phone.
2. Share → **Add to Home Screen**. Do this *before* setting anything up: iOS keeps
   Safari's storage and the home-screen app's storage separate.
3. Open the app from the home screen. **Press and hold the greeting** ("Evening, …") for
   about a second to open Setup, and choose a PIN.
4. Add the drinks. Each gets a letter in the order added.
5. Each evening she taps **Log it**. She can log any day; until you assign a drink, the
   day shows as "Today's drink".
6. Unlock Setup on her phone whenever you want to fill in **Days** (a drink picker per
   logged day) or **Plan ahead**.
7. At the end, press **Generate report**. It warns if a logged day has no drink (those
   days don't count). **Hide report** undoes it. **Export CSV** gives the raw data.

There is no visible Setup link. The PIN is forgotten when the app closes.

## Development

```sh
npm start        # serves public/ on http://localhost:3000
```

`server.js` is only a local static server; production is GitHub Pages, deployed by
`.github/workflows/pages.yml` on every push to `main`.

## Files

- `public/app.js` - screens (home, log, results/report, setup) and event handling
- `public/local.js` - on-phone storage, PIN and encryption, report reveal, backup
- `public/icons.js` - line icons and the two illustrations
- `public/styles.css` - design tokens, components, animations
- `public/sw.js` - offline cache

The design follows a Dribbble habit-tracker shot, kept locally at `docs/style-reference.png` (not committed).
