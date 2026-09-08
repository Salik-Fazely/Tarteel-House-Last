# Logo lettering provenance

The two SVG wordmarks are reserved Tarteel House brand artwork, outside the
repository's MIT source-code license. They contain SVG paths, not font software.
The canvas, original text positions, colors, background and accessible name are
preserved. These wordmarks contain no separate graphical symbol to replace.

On 8 September 2026, lettering was regenerated from the following official
Google Fonts sources at revision `5e35378e6bda803962ee6fd257e444a7d459660d`:

| Text | Font and instance | Source and license |
| --- | --- | --- |
| Tarteel | Cormorant Garamond Medium Italic, weight 500, 72 px | [Font](https://github.com/google/fonts/blob/5e35378e6bda803962ee6fd257e444a7d459660d/ofl/cormorantgaramond/CormorantGaramond-Italic%5Bwght%5D.ttf), [OFL 1.1](https://github.com/google/fonts/blob/5e35378e6bda803962ee6fd257e444a7d459660d/ofl/cormorantgaramond/OFL.txt) |
| HOUSE | Inter Medium, weight 500, optical size 14, 13 px | [Font](https://github.com/google/fonts/blob/5e35378e6bda803962ee6fd257e444a7d459660d/ofl/inter/Inter%5Bopsz,wght%5D.ttf), [OFL 1.1](https://github.com/google/fonts/blob/5e35378e6bda803962ee6fd257e444a7d459660d/ofl/inter/OFL.txt) |

Source font SHA-256 checksums:

- Cormorant Garamond: `0f48ea6abb2084537854f7174c470991a463b13036309e3b50a81511611c530d`
- Inter: `29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031`

Copyright notices identify the Cormorant Project Authors (2015) and the Inter
Project Authors (2020). Both source licenses explicitly identify SIL OFL 1.1.
Temporary tooling used fontTools 4.64.0 to instantiate fonts and draw SVG paths,
with HarfBuzz via uharfbuzz 0.56.1 for shaping. No tooling or font package is
bundled with this repository. Lettering retains the original baseline positions:
Tarteel at (48, 101); HOUSE at y=126 and x=104.38, 121.21, 138.32, 155.10, 170.64.

Only the final wordmark outlines are distributed in these SVGs. Under the
[OFL FAQ, sections 1.1–1.1.2](https://openfontlicense.org/ofl-faq/), using OFL
fonts for logo artwork does not require licensing that artwork under the OFL
or attaching the font license. These source links are retained for provenance.
If font software is bundled in a future change, preserve its copyright and
license notices and comply with its own terms; MIT must not replace them.

The previous embedded font binaries were removed from the current SVGs.
Historical revisions remain in Git at the owner's instruction and are not
covered by the new MIT grant. Use the repaired SVGs, not historical embedded
font versions, when distributing the current project. Existing raster logos
remain unchanged and outside MIT.
