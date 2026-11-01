# MoneyPlan branding

Run `node scripts/export-branding.cjs` from the Budget app to export the clean vector master into all variants. PNGs are rasterized from the same geometry; SVGs remain editable. The approved generated concept is archived as `concept-original.png`.

- `icon.png`: opaque 1024px launcher icon; no baked corner mask.
- `store-icon.png`: opaque 512px Play Store icon.
- `adaptive-foreground.png`: transparent cream mark; pair with `#3e5948`. The mark stays inside the adaptive-icon safe area.
- `monochrome.png`: transparent white stencil for Android themed icons.
- `logo-light.png` / `logo-dark.png`: transparent sage / cream marks.
- `splash-light.png` / `splash-dark.png`: transparent 512px splash assets.
- `wordmark-light.png` / `wordmark-dark.png`: name and mark for larger surfaces.
- `brand-preview.png`: contact sheet for review.

The name is MoneyPlan. Budget's package ID, database, backup format, release tags, and `Budget-<version>.apk` update filename stay compatible with existing installations.
