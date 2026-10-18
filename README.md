# no-ads.games

Landing page for No Ads Games: Drift Survivors, Pocket Cosmo and Pocket Metropolis (coming soon).
Plain HTML and CSS, no build step. GitHub Pages serves the repository root at https://no-ads.games.

| File | What it is |
| --- | --- |
| `index.html` | The page: sticker hero, one band per game, support and privacy links |
| `styles.css` | All styles; colour tokens at the top, one set per game band |
| `404.html` | Shown by GitHub Pages for any missing address (uses root-absolute paths) |
| `assets/likes.js` | Like buttons, their celebration and sound |
| `server/` | The likes service, deployed to Railway |
| `assets/icons/` | App icons, 384 px WebP, from each game's repository |
| `assets/shots/` | Screenshots, 540 × 1170 WebP (Pocket Metropolis: 356 × 636 renders) |
| `assets/og.png` | 1200 × 630 share image for link previews |
| `CNAME` | The custom domain GitHub Pages answers for |

## Preview

```sh
python3 -m http.server 4173
```

Then open http://localhost:4173.

## Where the content comes from

- **Drift Survivors**: App Store id `6773509783`. Screenshots are the live store set
  (`end-of-may-sunday-vibes/marketing/app-store/screenshots/v4.0/captioned/en-US/APP_IPHONE_67`, 02, 03 and 05).
- **Pocket Cosmo**: App Store id `6810904381`. Screenshots are the 2.1 store set (Feed stars, Ignite a supernova,
  Create a black hole), taken from the listing. The app is sold in a few storefronts only, so the page says
  "Available in select countries for now"; remove that line when it goes worldwide.
- **Pocket Metropolis**: village, town and metropolis renders cropped from
  `pocket_city/docs/research/traffic/grid-warsaw.jpg`. When it ships, swap the dashed "Coming soon to iPhone"
  slot for an App Store badge like the other two.
- Store links use `https://apps.apple.com/app/id<ID>`, which opens the visitor's own storefront.
- App Store badges load from Apple's badge service (`toolbox.marketingtools.apple.com`).
- Support and privacy links point at each game's backend until those pages move to this domain.

## Analytics

[Umami Cloud](https://cloud.umami.is), no cookies, so no consent banner. The tracker in `index.html` and `404.html`
(`data-website-id`) records page views, referrers, UTM tags, countries and devices. `data-domains` keeps it to
no-ads.games, so local previews never count. `assets/analytics.js` adds these events:

| Event | Data | When |
| --- | --- | --- |
| `app-store-click` | `game` | An App Store badge is tapped |
| `game-jump` | `game` | A game is picked in the hero list |
| `game-viewed` | `game` | A game band reaches the middle of the screen (once per visit) |
| `footer-link` | `game`, `link` (`support` or `privacy`) | A support or privacy link is opened |
| `like` / `unlike` | `game` | A heart is tapped |

To tag an element, give it `data-event="name"`; its other `data-*` attributes become the event data.

- **Your own visits:** open https://no-ads.games/?notrack once in each browser you use (phone too) and that browser
  stops counting; https://no-ads.games/?track undoes it. Safari can drop the setting after about a week without a
  visit, so open the `?notrack` link again if your own visits reappear.
- **Where visitors come from:** share links with UTM tags, for example
  `https://no-ads.games/?utm_source=tiktok&utm_medium=social&utm_campaign=drift-launch`. Umami lists them under UTM.
- **Installs from the site:** the badges carry `pt=<provider token>&ct=no-ads.games`, so App Store Connect →
  Analytics → Campaigns shows product page views and downloads for the `no-ads.games` campaign.

## Likes

Each game has a heart: one like per visitor per game, tap again to take it back, counts visible to everyone.
The page keeps a random visitor ID in `localStorage` (`nag.visitor`) and talks to the likes service:

- **Service:** https://likes-production-c4ae.up.railway.app, Railway project `no-ads-games`, service `likes`
  (Node, no dependencies, SQLite on a volume at `/data`).
- **API:** `GET /likes`, `PUT /likes/<game>`, `DELETE /likes/<game>`, with the visitor ID in `X-Visitor`.
- **Privacy:** only an HMAC of the visitor ID is stored (`VISITOR_SECRET`); IPs stay in memory to cap new likes
  at 40 per network per hour.
- **Browsers allowed** (`ALLOWED_ORIGINS`): https://no-ads.games and http://localhost:4173 for local previews.
- **Deploy a change:** `cd server && railway up --service likes`.

If the service can't be reached, the hearts stay hidden and the rest of the page works as before.

## Mini games (parked)

A mini game per game (one-finger drift, grow a star, call settlers) was built and taken off the site.
They live on the `minigames` branch: `toys/<game>/index.html` plus the `assets/toys.js` player.

## Deploy (GitHub Pages)

1. Push this folder to a public GitHub repository.
2. Repository **Settings → Pages**: Source **Deploy from a branch**, branch `main`, folder `/ (root)`.
   The custom domain fills in from `CNAME`.
3. Add the DNS records below at GoDaddy.
4. Once the domain check passes, tick **Enforce HTTPS** on the same page.

### DNS at GoDaddy

GoDaddy → **My Products** → `no-ads.games` → **DNS**. Replace the parked `@` A record and the `www` CNAME:

| Type | Name | Value |
| --- | --- | --- |
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| CNAME | `www` | `<github-user>.github.io` |

Optional IPv6: four AAAA records on `@` with `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`
and `2606:50c0:8003::153`. Delete any other `@` A or AAAA record and turn off GoDaddy domain forwarding,
or GitHub's domain check fails.

To stop anyone else's repository claiming the domain, verify it under GitHub **Settings → Pages →
Add a domain** (account settings, not the repository); it gives a TXT record to add at GoDaddy.
