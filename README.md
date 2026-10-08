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
| `index.html` | Semantic page, all copy, asset references |
| `styles.css` | Visual system: 12-col grid, near-black shell, chapters |
| `main.js` | Nav, section spy, disclosures, GSAP + Lenis motion |

## Design direction

- **Visual thesis** — the work argues first, the studio explains second. A
  near-black shell frames four project chapters, each with its own muted colour
  field (sand → ink → sage → ink), so the page reads as a magazine rather than
  a card grid.
- **Type** — Archivo (grotesk display, 800/900) + Inter (neutral text) + IBM
  Plex Mono (compact labels, roles, metadata).
- **Grid** — 12 columns, `clamp(20px, 4.4vw, 64px)` desktop edges, hairline
  rules, almost no shadow.
- **Signal colour** — `#ff4d17`, used only for the contact chapter and focus
  rings so it never loses its charge.
- **Section sequence** — header → hero → selected work → studio → oversized
  services → contact → footer.

## Motion stack

- **GSAP 3.12.5** + **ScrollTrigger** — primary animation system.
- **Lenis 1.1.13** — the *only* smooth-scroll engine, wired to ScrollTrigger's
  update and to `gsap.ticker`.
- **Three.js — not used.** The concept is editorial and typographic; there is
  no spatial depth, displacement, or pointer-driven texture that would justify
  a WebGL context. Adding one would be ornamental.

Timings: 200ms control feedback, 680ms section entrances, 55ms word stagger,
parallax capped at 4%.

## Resilience

| Condition | Behaviour |
| --- | --- |
| No JavaScript | Everything renders static and readable; nav falls back to a visible block list |
| GSAP fails to load | `hasGSAP` guard skips all animation; CSS never hides content by default |
| `prefers-reduced-motion` | Smooth scroll, staggers and scrubs all bypassed; final states render immediately |
| Split headings | `aria-label` keeps the full sentence as the accessible name; word spans are `aria-hidden` |
| Mobile | Menu button with `aria-expanded`, Escape closes and returns focus to the toggle |
| Escape in disclosures | `<details>` service rows close and focus returns to `<summary>` |

## Validation performed

Automated, in headless Chromium (Playwright):

| Check | Result |
| --- | --- |
| `html-validate` | no errors |
| `node --check main.js` | clean |
| Console / page / request failures | 0 |
| Horizontal overflow @1440, @375, @720 (200% zoom) | none |
| Heading order (h1 first, 9 headings) | correct |
| Accessible names on all 9 split headings | preserved |
| Split-word transforms after scroll (30 words) | 0 stuck |
| Elements left at opacity 0 after scroll | none |
| Service mask reveal (`--reveal`) | 100% × 5 |
| Contrast, 10 text/background pairs | all ≥ 4.5:1 (lowest 5.53) |
| Focus ring on first 3 tab stops | visible, 2px solid |
| Mobile menu open / Escape / focus return | all pass |
| Reduced motion: errors, readability, hidden nodes | all pass |
| JS disabled: hero, nav, projects | all visible |

Two bugs were found and fixed during this pass:

1. **Elements stuck invisible.** `gsap.from()` infers its end value from the
   element's *current* state at render time. The hero eyebrow and lede were
   targeted by both the intro timeline and the `[data-anim]` loop, so each tween
   recorded the other's zeroed state as its target — animating 0 → 0. Fix: all
   reveals now use explicit `fromTo()` with declared end states, and the
   `[data-anim]` loop skips anything inside `.hero` (the intro owns those).
2. **Footer / figcaption contrast.** `--paper-faint` sat at 3.78:1 on the ink
   shell, failing AA at 11.5px. Lightened to `#8b877f` → 5.53:1.

## Before you publish — replace all of this

Everything below is placeholder. Search for it and swap in your own.

1. **Identity** — `Alex Rivera`, the `AR` monogram, and `Your City, Country`
   (header, hero, contact, footer, `<title>`, `<meta description>`).
2. **Projects** — the four entries under `#work` (Northwind Transit, Ledger
   Design System, Atlas Console, Field Notes) are samples. Replace titles,
   roles, years, summaries, and images with real work.
3. **Contact** — `hello@example.com` and the GitHub / LinkedIn / Read.cv hrefs.
4. **Images** — every `<img>` is an Unsplash placeholder (Unsplash License:
   https://unsplash.com/license). Replace the `src` **and** the `alt` text —
   alt currently describes the placeholder, not real content.
5. **Do not** invent clients, metrics, awards, or testimonials. The sample copy
   deliberately states what each project *is*, never what it *achieved*.

## Provenance

- Fonts: Google Fonts (Archivo, Inter, IBM Plex Mono) — SIL Open Font License
- Libraries: GSAP, ScrollTrigger, Lenis via jsDelivr (MIT)
- Placeholder photography: Unsplash — see links above
- Icons: none used; the `+` cue and arrows are plain text characters
