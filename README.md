# Portfolio — dark editorial

Static single-page portfolio for a developer + UX/UI designer. No build step:
open `index.html` or serve the folder.

```bash
python3 -m http.server 8080
# → http://localhost:8080
```

## Files

| File | Role |
| --- | --- |
| `index.html` | Semantic page, all copy, asset references, social meta |
| `styles.css` | Visual system: 12-col grid, ink shell, four dark field chapters |
| `main.js` | Nav, section spy, disclosures, GSAP + Lenis motion |
| `fonts.css` + `fonts/` | Self-hosted Archivo variable + IBM Plex Mono (woff2, latin) |
| `favicon.svg` | `AR` monogram |
| `og.png` | 1200×630 social share card (not the page screenshot) |

## Design direction

- **Visual thesis** — the work argues first, the studio explains second. A
  near-black shell frames four full-viewport project chapters on dark green
  field tints (L\* 13–22), so the page reads as a gallery with one deliberate
  accent: the full-bleed signal contact block.
- **Page theme lock** — one dark theme end to end. Chapters are four tints of a
  single dark green family, never light sections: strobing between light and
  dark mid-page is what breaks a dark brief, so no field leaves the dark range.
- **Type** — Archivo variable (grotesk display, 800–900) + IBM Plex Mono
  (roles, metadata, labels). Self-hosted; zero em-dashes and zero section
  eyebrows site-wide.
- **Grid** — 12 columns, `clamp(20px, 4.4vw, 64px)` desktop edges, hairline
  rules, sharp corners everywhere (single radius system: 0).
- **Signal colour** — `#e16133`, HSL saturation 74% (< 80%), used identically
  for the contact block, focus rings, scroll progress, marquee separators and
  hover states so it never loses its charge. Verifiable ratios: 5.62:1 on ink.
- **Section sequence** — header → hero → capabilities marquee → sticky-stack
  work → studio → oversized services → contact → footer.

## Motion stack

- **GSAP 3.12.5** + **ScrollTrigger** — primary animation system.
- **Lenis 1.1.13** — the *only* smooth-scroll engine, wired to ScrollTrigger's
  update and to `gsap.ticker`.
- **Sticky stack** — the four chapters use CSS `position: sticky` (top: 0,
  `min-height: 100svh`, gated to ≥900px + `prefers-reduced-motion:
  no-preference`), not sequential reveals. Each card is driven by the *next*
  card's ScrollTrigger: it scales to 0.93 and fades to 0.5 as the next chapter
  arrives, and the whole stack leaves together at the end.
- **Three.js — not used.** The concept is editorial and typographic; there is
  no spatial depth or pointer-driven texture that would justify a WebGL
  context. Adding one would be ornamental.

Timings: 200ms control feedback, 680ms section entrances, 55ms word stagger,
parallax capped at 4%.

## Resilience

| Condition | Behaviour |
| --- | --- |
| No JavaScript | Everything renders static and readable; nav falls back to a visible block list |
| GSAP fails to load | `hasGSAP` guard skips all animation; CSS never hides content by default |
| `prefers-reduced-motion` | Smooth scroll, staggers and scrubs all bypassed; final states render immediately |
| Split headings | `aria-label` keeps the full sentence as the accessible name; word spans are `aria-hidden` |
| Mobile | Menu button with `aria-expanded`, Escape closes and returns focus to the toggle; split words wrap normally because text transforms animate inside per-word spans |
| Escape in disclosures | `<details>` service rows close and focus returns to `<summary>` |

## Validation performed

Automated, in headless Chromium (Playwright), against the final build:

| Check | Result |
| --- | --- |
| Console / page / request failures (normal + reduced motion) | 0 |
| Horizontal overflow @1440, @1280, @1000, @834, @375, @320, @720 (200% zoom) | none |
| Heading order (h1 first, 9 headings) | correct |
| Accessible names on all 9 split headings | preserved |
| Split-word transforms after full scroll (23 words) | 0 stuck |
| Elements left hidden after scroll / under reduced motion | none |
| Service mask reveal | 100% × 5 |
| Contrast: all text pairs incl. every project chapter field | ≥ 4.5:1 (lowest 5.01) |
| Focus ring (2px signal) contrast vs every field | ≥ 3:1 (min 3.53) |
| Signal saturation | 74.4% (< 80%) |
| Page theme lock (L\* of every section background) | no light sections |
| Section eyebrows above h2s / decorative dots / wrapped CTAs | none / none / none |
| Paragraph word counts | ≤ 25 everywhere |
| Sticky stack: card K scales × opacity as card K+1 arrives | verified sample-by-sample |
| Mobile menu open / Escape / focus return | all pass |
| Reduced motion: errors, readability, hidden nodes | all pass |
| JS disabled: hero, nav, projects | all visible |
| Hero: ≤4 text elements, 2-line headline, CTA above fold | pass |
| Social card | `og.png` renders at 1200×630 with self-hosted fonts |

Bugs found and fixed during this pass:

1. **Hero image invisible ≤899px.** `.hero__media` kept its base
   `grid-column: 2`, so on the single-column mobile grid the absolutely
   positioned element's containing block became a phantom zero-width implicit
   column. Fix: reset `grid-column/grid-row` to `auto` so the containing block
   is the `.hero` padding box.
2. **28px horizontal overflow at 375px.** `.project:nth-child(even)` column
   overrides (specificity 0,3,0) outranked the mobile full-width override
   (0,1,0), squeezing even-numbered chapters into a 130px column that
   "Broadsheet" escaped. Fix: mobile-first column rules, with the side-by-side
   composition scoped into `@media (min-width: 900px)`.
3. **Theme lock failure.** Four light/dark alternating chapters violated the
   single-theme rule. Fix: one dark green family, L\* 13–22, frame still reads
   against the ink container.
4. **Signal too saturated** (`#ee5a24`, 85.6%). Desaturated to `#e16133`
   (74.4%) while holding 5.62:1 on ink.
5. **Section-numbering eyebrows.** `01–04 / year` micro-meta rows above
   project titles were an enumeration tell. Removed; years moved into the
   mono role line.

## Before you publish — replace all of this

Everything below is placeholder. Search for it and swap in your own.

1. **Identity** — `Alex Rivera`, the `AR` monogram, and `Your City, Country`
   (header, hero, contact, footer, `<title>`, `<meta description>`, `og:title`).
   `og:image` currently points at the ephemeral tunnel URL; switch it to your
   final domain (and regenerate `og.png` with the same treatment if you change
   the name).
2. **Projects** — the four entries under `#work` (Northwind Transit, Ledger,
   Quarry, Broadsheet) are samples. Replace titles, roles, years, summaries,
   and images with real work. When you add real case studies, turn each project
   title into a link.
3. **Contact** — `hello@example.com` and the GitHub / LinkedIn / Read.cv hrefs.
4. **Images** — every `<img>` is an Unsplash placeholder (Unsplash License:
   https://unsplash.com/license). Replace the `src` **and** the `alt` text —
   alt currently describes the placeholder, not real content.
5. **Do not** invent clients, metrics, awards, or testimonials. The sample copy
   deliberately states what each project *is*, never what it *achieved*.

## Provenance

- Fonts: Google Fonts (Archivo variable, IBM Plex Mono) — SIL Open Font
  License; subsetted to latin, three woff2 files, ~119KB
- Libraries: GSAP, ScrollTrigger, Lenis via jsDelivr (MIT)
- Placeholder photography: Unsplash — see links in `index.html`
- Icons: none in the UI; the `+` disclosure cue and arrow chars are plain text;
  `favicon.svg` is a hand-set wordmark