# ERP browser and device icon

`ilios-erp-icon-master.png` is the user-approved, 1254 x 1254 ImageGen artwork:
the actual Ilios spiral sun adapted to gold on dark green. The green revision
was approved on 2026-11-03. This master is for browser/device identity only;
the normal logos inside the ERP remain unchanged.

Regenerate the assets with `npm run icons:generate`. The script preserves the
approved raster artwork and exports appropriately sized PNGs and a multi-frame
ICO. Android maskable exports add padding so every gold pixel fits inside a
circle smaller than the required 40%-radius safe zone. Safari's pinned-tab
SVG is a monochrome trace of the approved silhouette, as required by Safari.

The versioned `/icons/ilios-sun-v1/` paths avoid stale copies of the old icons.
If the artwork changes, use a new directory version and update the references
in `index.html`, `public/manifest.json`, `public/browserconfig.xml`, and the
service worker precache list. The root ICO and Apple PNG are discovery fallbacks.

Reference requirements:
- https://web.dev/articles/maskable-icon
- https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/pinnedTabs/pinnedTabs.html
- https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html
