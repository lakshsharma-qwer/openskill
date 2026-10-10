# OpenSkill: design system

The source of truth for how OpenSkill looks, moves and reads. Tokens live in `app/globals.css` (`:root`). Change a token there and do not hard-code values in components.

## Direction

A topographic trail map at night. Your goal is the summit and the app draws the path to it.

- **Midnight navy** surfaces with faint contour lines.
- **Summit gold** is used for the path, primary actions and progress.
- **Mint** means done or correct. **Coral** means wrong or warning.
- The **light theme** ("daylight map") follows the system setting automatically.

## Brand

- **Logo**: `public/brand/openskill-icon.png` (mark), `openskill-wordmark.png`, `openskill-lockup.png` (with the tagline "Learn Anything. Build Everything."). They're white on transparent. `.logo-img` inverts them to black in the light theme. Use the `<LogoIcon>`, `<LogoLockup>` and `<LogoFull>` components and never re-colour or stretch the marks.
- **Theme**: black and white. Light (default on light systems) is a white UI on a #f6f6f7 page, like PW. Dark is true black. The primary action is solid ink (black in light, white in dark). Green and red appear **only** for right/wrong feedback.
- **Type**: Montserrat (700–800) for headings, which echoes the wordmark. Geist for body text, Geist Mono for numbers.
- **Frame**: logged-out visitors see the marketing header. Signed-in users see the app shell: a sidebar on desktop (Home, New goal, Find my path, My paths, account) and a bottom tab bar on mobile.

## Principles (premium and clean)

- **One signature, everything else quiet.** The contour map is full strength only on the home page and fades to a texture inside the app (`<Backdrop>`).
- **Solid surfaces, hairline borders.** No glass or blur inside pages. Elevation (`--shadow-pop`) is reserved for things that float: popovers, sheets, lessons.
- **Gold means "do this".** Gold goes on the one primary action and on progress. Tabs, chips and selection states are neutral (`--surface-3` plus a hairline).
- **Group, don't box.** Related info shares one card split by hairlines (`.side-panel > section`). Don't add another bordered card.
- **Quiet labels.** Context lines (`.eyebrow`) are sentence case. Micro-labels are small sans caps. Mono is for numbers only.
- **One primary per view.** Secondary actions use `.btn-ghost`.

## Colour tokens

| Token | Dark | Light | Use |
|---|---|---|---|
| `--ink` / `--ink-2` / `--ink-3` | #edf1f8 / #aab6cc / #8090ad | #0e1a2e / #47556f / #5c6880 | Primary, secondary and muted text. All are ≥ 4.5:1 on cards. |
| `--accent` | #f2c14e | #e0a73c | Gold **fills** (buttons, progress, path). Text on it is `--accent-ink`. |
| `--accent-text` | #f2c14e | #8a5c06 | Gold used **as text**. Never put `--accent` on text in light mode. |
| `--good` / `--warn` | #5fe0b1 / #ff9f7a | #0d7a53 / #b0451c | Correct or done, wrong or warning. Always paired with an icon or label, never colour alone. |
| `--blue`, `--violet` | | | Unit tones and the "learn" and "test" tags. |

Unit tones use `--tone` for fills and `--tone-text` for text. Icon colour utilities are `.c-gold`, `.c-orange`, `.c-mint`, `.c-blue` and `.c-violet`.

## Type

- **Display**: Bricolage Grotesque (600–650, tight tracking) for headings only.
- **Body**: Geist.
- **Data**: Geist Mono for numbers, times, eyebrow labels and XP. Numbers use `tabular-nums`.
- **Scale**: `--t-xs` 0.75 · `--t-sm` 0.875 · `--t-md` 1 · `--t-lg` 1.125 · `--t-xl` 1.35 · `--t-2xl` 1.62 · `--t-3xl` 2 (rem).
- Inputs are at least 16px so iOS doesn't zoom.

## Space, radius, elevation

- **Spacing** follows a 4px rhythm: `--s-1`…`--s-16` (4, 8, 12, 16, 20, 24, 32, 40, 48, 64). Use the utilities (`mt-*`, `mb-*`, `my-2`, `py-3`) and never arbitrary pixel values.
- **Radius**: `--r-xs` 6 · `--r-sm` 10 · `--r-md` 14 · `--r-lg` 18 · `--r-xl` 24. A child is always one step smaller than its parent.
- **Surfaces**: `--surface` (cards), `--surface-2` (insets, tab track), `--surface-3` (selected/raised). Cards use a 1px `--line` hairline and a minimal `--shadow`. Overlays use `--shadow-pop`. Content inside cards is a flat panel, never a card in a card.

## Icons

- Lucide only, imported from `components/Icons.tsx`, 2px stroke, sized by `.ico-sm/md/lg/xl`.
- **No emoji as UI icons.** The mascot is an illustration, not an icon.
- Icon-only buttons need an `aria-label`.

## Motion

Based on Emil Kowalski's design-engineering rules and Vercel's Web Interface Guidelines.

- **Easing**: `--ease` (0.23, 1, 0.32, 1) for UI, `--ease-in-out` for on-screen movement, `--ease-drawer` for sheets. Never use `ease-in`.
- **Durations**: press 160ms, fast 180ms, base 240ms, slow 320ms. UI animation stays under 300ms. Longer motion is reserved for rare moments (celebrations, the home trail draw).
- **Press feedback** is `scale(0.97)` on `:active`, never a layout-shifting translate.
- **Entrances** start from opacity 0 plus a small offset or scale (≥ 0.95). Never from `scale(0)`.
- **Popovers** grow from their trigger (`transform-origin: top`). Modals stay centred.
- **Hover** effects live inside `@media (hover: hover) and (pointer: fine)`.
- List every transitioned property. No `transition: all`.
- `prefers-reduced-motion` turns animation off.

## Interaction and accessibility

- Touch targets are at least 44px on touch devices (`@media (pointer: coarse)`).
- `touch-action: manipulation` on controls. `overscroll-behavior: contain` in lessons, sheets and chat.
- Every page gets a skip link (`#main`) and a visible `:focus-visible` ring in gold.
- Overlays (lessons, sheets, toasts) render through `<Portal>` above the sticky header.
- Safe areas: fixed bars pad with `env(safe-area-inset-*)`.

## Copy

- Plain, direct, sentence case. Lead with what the person gets or does.
- Avoid em-dash-heavy "AI voice". Use full stops, colons or commas.
- Buttons say what happens ("Build my roadmap", "Mark as watched", "Check").
- Errors say what went wrong and how to fix it, with a retry.
- Use `…` (ellipsis character) for in-progress states.
