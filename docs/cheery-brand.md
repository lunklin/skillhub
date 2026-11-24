# CHEERY footer

Source: [GitHub #1](https://github.com/lunklin/skillhub/issues/1), CHEE-331 / CHEE-332.

## Verified identity

Verified on 2026-11-24 from the [official homepage](http://www.gzcheery.com.cn/):

- The page title, site identity, header logo alt and copyright identify **广州长霖塑料制品有限公司**. Keep this legal name in its original script across locales.
- The homepage displays [this official logo](http://www.gzcheery.com.cn/wp-content/uploads/2024/04/%E9%95%BF%E9%9C%96%E6%A0%87-edited.png). `web/public/brand/cheery-logo.png` is its unmodified 788 × 222 PNG, served locally with the application's base path. This company identity asset is not a newly generated logo or a grant of trademark rights under the project's software license.
  SHA-256: `1bf0cb7986f313f47139ba3bb73c92cf983aec59b1d3294e995b74e3361a6053`.
- Its blue wordmark and red symbol provide the footer accent colors. The official site's white surfaces and [homepage stylesheet](http://www.gzcheery.com.cn/wp-content/uploads/elementor/css/post-30.css?ver=1773218702) inform the restrained layout. The logo retains a white plate in dark mode to preserve its original colors and legibility. Other surfaces follow the existing light/dark theme.
- The official site currently uses HTTP. Downloads succeeded over that original URL; HTTPS was unavailable during verification. The footer's company link retains the verified original URL.

## Presentation compatibility

All pages using `Layout` receive the same corporate footer. Authentication entry routes still omit it. `footer.enabled = false` continues to hide the whole footer.

The existing `sections.footer.items` booleans remain authoritative. Missing/null `developers`, `project` and `resources` now default to hidden; an explicit `true` still restores each group for installations that opted in. `product` and all other sections keep their previous defaults. No backend settings or stored data are changed.

When `project` is hidden, the existing configured license link moves to the bottom row; when `resources` is hidden, privacy and terms move there. Labels and legal URLs still use presentation overrides. The repository's actual license is **Apache-2.0** (`LICENSE`); retain its attribution rather than relabeling it MIT. Header/product branding and homepage content remain configurable separately from the fixed company identity in the footer.

## Isolated local preview

Requires the repository's supported Node.js 22.13+ (22.x) or 24.x and network access for the locked pnpm install. From this checkout run:

```sh
"$MULTICA_CLI_PATH" env list --output json
"$MULTICA_CLI_PATH" env start cheery-preview
```

The daemon allocates `MULTICA_PORT`, binds the server to `127.0.0.1`, records its log and stops it after 168 hours. Reuse the same checkout to avoid duplicate instances. The actual URL, expiry and log path are returned by `env list` and shown in the issue's Environments sidebar. Stop with `env stop cheery-preview`; restart from the same checkout with `env start cheery-preview`. Keep the checkout and dependencies until member confirmation or TTL.

Try it in three steps:

1. Open the environment URL on the machine running Multica. The banner identifies synthetic data and no backend.
2. Scroll to the footer; inspect the company identity, product navigation and legal links. Resize to 390 px or use browser device mode; also try dark mode and English.
3. Search for `preview`, open the marketplace, and try the privacy/terms links. Anonymous publishing leads to the login screen; login, publishing and skill detail data are outside this preview.

`web/vite.preview.config.ts` runs the real application with a small read-only synthetic API via Vite middleware. Unknown API routes return 404 and writes return 405; it never connects to a backend. The normal Vite build/config does not import this preview. UI navigation/layout checks against this service are not backend E2E or deployment evidence. A loopback URL is available only on the runtime machine, not a public or cross-device website.
