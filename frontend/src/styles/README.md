# Styles architecture

`index.css` is the only stylesheet entry imported by the application. Its import order is intentional and defines the cascade:

1. `tokens.css` — design tokens and theme variables.
2. `base.css` — reset and global element defaults.
3. `layout.css` — application shell, page layout, overlays, and responsive structure.
4. `components/` — reusable navigation, buttons, forms, cards, tables, and feedback states.
5. `pages/` — page-specific styling.
6. `features/` — feature modules loaded on demand by lazy-loaded components (`booking.css`, `seller-affiliate.css`, `order-management.css`) to keep the global CSS bundle lean.

Put a rule in the narrowest module that owns it. Shared visual primitives belong in `components/`; selectors tied to a feature prefix belong in that feature's stylesheet. Large feature modules belong in `features/` and are imported by their respective components to take advantage of Vite route code-splitting.
