# public-resources

Web-accessible assets I want available for delivery and reuse across
my projects — libraries, fonts, images, schemas, anything that
benefits from a stable public URL.

Files are designed to be loaded via [jsDelivr](https://www.jsdelivr.com/?docs=gh),
which mirrors this GitHub repo with correct MIME types, gzip on the
wire, and tag- or branch-pinned URLs.

## URL patterns

```
https://cdn.jsdelivr.net/gh/richard-myers/public-resources@main/<path>
https://cdn.jsdelivr.net/gh/richard-myers/public-resources@<tag>/<path>
```

Use `@main` to float to the latest commit on the default branch, or
`@v1.2.3` to pin to a git tag for reproducibility.

> Raw GitHub URLs (`raw.githubusercontent.com/…`) work for `<script>`
> loads but **not** for `<link rel="stylesheet">` — GitHub serves with
> `Content-Type: text/plain` and `X-Content-Type-Options: nosniff`,
> which modern browsers refuse to interpret as CSS. Always use the
> jsDelivr URL when CSS is involved.

## Layout

```
slide-decks/
  <major>.<minor>.<patch>/   exact pin
  <major>.<minor>/           latest patch within a minor (floating)
  <major>/                   latest minor + patch (floating, non-breaking)
```

Each version directory is a full self-contained copy of the bundle.
Floating directories receive automatic uptake of non-breaking fixes;
exact-pin directories never change once written.

## Contents

| Path | Description |
|---|---|
| `slide-decks/` | Bundled CSS + JS runtime for the slide-deck library (see [`claude-utils/library/slide-deck/`](https://github.com/) for source) |
