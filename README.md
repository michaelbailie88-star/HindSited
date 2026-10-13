# HindSited

Finds the website problems customers notice and owners don't. Opens a site in real Chromium at phone size, reads every visible word, clicks links that should do something, crawls up to 25 pages, follows up to 160 links and images, and runs Google PageSpeed on phone and desktop.

## Layout
- `public/` - the site (`index.html`, `app.js`, `rules.js` = every check's wording and weight, `styles.css`)
- `netlify/functions/` - `render` (Chromium), `crawl` (extra pages), `links` (link checker), `speed` (PageSpeed)
- `netlify/lib/` - shared engine code
- `test/` - fixture sites with planted problems; `node test/run.mjs` must print ALL PASSED

## Environment
- `PSI_KEY` - Google PageSpeed Insights API key (free). Without it, speed tests share Google's public quota.

## Local testing
```
HS_ALLOW_LOCAL=1 HS_LOCAL_CHROME=/path/to/chrome node test/run.mjs
HS_LOCAL_CHROME=/path/to/chrome node test/ui.mjs bad
```
