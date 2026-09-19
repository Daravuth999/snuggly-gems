# Cozy Code Library — Guidelines

## Components

The design system exports these components — import them from `@ws-6c53600b512e8507bc41/ecbaf85a-34c2-47e8-b608-f9508e98f212` and compose them before building anything from scratch:

`Banner`, `Button`, `Card`, `Constants`, `Field`, `KaraokePrompter`, `Screen`, `Spinner`, `TopBar`, `Wave`

Per-component details (import stanzas, props, variants, examples) live in `.lovable/rules/libraries/{slug}/components.md` — on disk, not auto-loaded. Read that file or the component source when the name alone isn't enough.

## Theme Files

The design system's theme is delivered through the following files. The author's original source files carry the full wiring the design system needs — variable declarations, framework-specific directives, provider objects, etc. — and are the canonical import target.

- `@ws-6c53600b512e8507bc41/ecbaf85a-34c2-47e8-b608-f9508e98f212/styles.css` (source — preferred import)
- `@ws-6c53600b512e8507bc41/ecbaf85a-34c2-47e8-b608-f9508e98f212/dist/tokens.css` (auto-generated flat list of CSS custom properties — a raw-values fallback only; does NOT carry framework-specific wiring that the source files above provide)

