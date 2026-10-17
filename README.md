# no-ads.games

Landing page for No Ads Games: Drift Survivors, Pocket Cosmo and Pocket Metropolis (coming soon).
Plain HTML and CSS, no build step. GitHub Pages serves the repository root at https://no-ads.games.

| File | What it is |
| --- | --- |
| `index.html` | The page: sticker hero, one band per game, support and privacy links |
| `styles.css` | All styles; colour tokens at the top, one set per game band |
| `404.html` | Shown by GitHub Pages for any missing address (uses root-absolute paths) |
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
