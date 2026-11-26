# Khoảnh Khắc: Design Direction (35mm Darkroom & Archival Contact-Sheet)

Shared studio visual system for **Khoảnh Khắc Photobooth** and **Khoảnh Khắc LiveGallery**.

- **Dial:** `ENERGY 3 / RHYTHM 3 / MOTION 2`
- **Default Theme:** Matte 35mm Darkroom (legitimate creative photography default for evaluating exposures, photo strips, and archival prints without surrounding glare), paired with a full Archival Light paper theme persisted in `localStorage['khoanhkhac-theme']`.
- **Identity Motif:** 35mm filmstrip sprocket perforations, numbered contact-sheet frames (`01`, `02`, `03`), physical white-bordered archival prints resting on a matte darkroom light-table, and crisp camera viewfinder corner brackets framing the photo viewer stage.

## Color System (Darkroom Default + Archival Light)

### Matte 35mm Darkroom (`:root`, default)

- `--bg: #11100f` (Matte darkroom table base)
- `--surface: #191816` (Architectural studio panel surface)
- `--surface-2: #24221e` (Recessed control tray and secondary hover fill)
- `--stage: #090807` (Deep light-table and photo viewer stage)
- `--light-table: #0c0b0a` (Inner archival darkroom light-table well)
- `--ink: #f3efe6` (Warm archival paper ink, contrast > 15:1 on `--bg` and `--surface`)
- `--muted: #aba499` (Secondary darkroom metadata, contrast > 6.2:1 across dark surfaces, WCAG AA)
- `--line: #2e2b26` (Crisp 1px structural hairline)
- `--line-strong: #464139` (Interactive border and focus hairline)
- `--accent: #e5a93c` (Kodak film gold, reserved for primary actions and active frame markers)
- `--accent-hover: #f0bc58` (Hover state for primary gold actions)
- `--accent-ink: #11100f` (Dark ink on gold buttons, contrast > 9:1, WCAG AA)
- `--accent-soft: rgba(229, 169, 60, 0.14)` (Subtle selected control tint)
- `--print-paper: #f7f3eb` (Physical white-bordered photo print stock)
- `--print-ink: #171412` (Printed typography on physical photo stock)

### Archival Light Theme (`[data-theme='light']`)

- `--bg: #f3efe6` (Warm archival contact-sheet paper)
- `--surface: #fcfaf5` (Matte studio sheet surface)
- `--surface-2: #e7e0d2` (Recessed tray and secondary surface)
- `--stage: #141210` (Darkroom lightbox stage stays dark so prints retain tonal contrast)
- `--ink: #171412` (Deep archival ink, contrast > 15:1 on paper)
- `--muted: #5c534a` (Secondary warm umber ink, contrast > 5.8:1 across light surfaces, WCAG AA)
- `--line: #d6cbb9` (Structural hairline divider)
- `--line-strong: #b6a791` (Interactive hairline)
- `--accent: #b84222` (Archival vermilion accent, contrast > 6.1:1 with `#ffffff`, WCAG AA)
- `--accent-hover: #993418` (Pressed and hover vermilion)
- `--accent-ink: #ffffff` (Crisp white text on vermilion buttons)
- `--accent-soft: #f7e6df` (Subtle active selection tint)

## Typography

- **Display / Editorial Headlines:** `Fraunces` (optical serif that brings editorial print warmth and high contrast at display sizes)
- **UI / Body / Vietnamese Diacritics:** `Be Vietnam Pro` (designed for clear Vietnamese diacritics on desktop and small mobile screens)
- **Telemetry / Codes:** `IBM Plex Mono` (used strictly for real 35mm frame numbers `01 / 08`, share codes `#D44092`, and actual canvas dimensions `1440 × 2560`, never for decorative fake terminals)

## Geometry, Elevation & Motion

- **Radius (sharp architectural darkroom corners):**
  - `--radius-xs: 2px` (physical prints, filmstrip thumbnails, swatches)
  - `--radius-sm: 6px` (inputs, buttons, segmented tabs)
  - `--radius-md: 10px` (studio panels, claim-stub card, lightbox stage, modals)
  - `50%` strictly for circular viewer nav, modal close, and color swatch controls.
- **Elevation:** Structural panels sit flat with crisp 1px borders. Drop shadows are reserved exclusively for physical white-bordered photo prints and modal overlays.
- **Glassmorphism:** Zero `backdrop-filter` on panels or modals; at most 1 darkroom viewer floating control group (`.viewer__nav`, `.viewer__fullscreen`).
- **Motion (MOTION 2):** One-shot staged entrance on hero contact-sheet elements and tactile hover/press feedback on prints and controls; zero endless decorative loops; fully suppressed under `prefers-reduced-motion: reduce`.

## Decision Log (R-31)

- **Why matte darkroom default with Kodak gold accent?** Evaluating photographs and white photobooth strips against `#11100f` and `#090807` reduces ambient glare and keeps white-bordered prints clear against the background, while the working Archival Light toggle gives daytime users an equally legible paper alternative.
- **Why asymmetric split with claim-stub form and vertical 35mm contact sheet on landing?** Guests arrive with a physical booth code; pairing a ticket-notched lookup form on the left with a vertical 35mm filmstrip and angled archival print on the right gives immediate functional focus and a clear photography identity.
- **Why 56px top bar + edge-to-edge lightbox + numbered filmstrip rail in AlbumViewer?** Photos are the product; minimizing chrome maximizes photo area while keeping "Trang trí" (always labeled on mobile), "Chia sẻ", "Tải ảnh", and theme switching within one thumb tap.
- **Why `#0c0b0a` light-table in DecorStudio?** Placing the white photobooth strip on a darkroom table creates unambiguous boundary contrast while placing stickers and adjusting collage layouts.
