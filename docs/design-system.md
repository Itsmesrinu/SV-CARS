
# Design system — pointer document

The source of truth for the design system is `.claude/skills/sv-cars-ui/SKILL.md`.
The frozen interface (tokens, primitives) is `ui-prompts/UI-CONTRACT.md`.

## Token names

| Token | Use |
|---|---|
| `bg-whatsapp` | WhatsApp CTA green (`#25D366`) |
| `hover:bg-whatsapp-dark` | WhatsApp button hover (`#128C7E`) |
| `shadow-card` | Raised panel elevation |
| `shadow-bar` | Sticky bar shadow |
| `pb-safe` | `padding-bottom: env(safe-area-inset-bottom)` |
| `pt-safe` | `padding-top: env(safe-area-inset-top)` |

## UI primitives

All live in `src/components/ui/` and are re-exported from `src/components/ui/index.ts`:

- `StickyActionBar` — fixed bottom bar; the ONLY element allowed to use `fixed bottom-0`
- `WhatsAppButton` — branded CTA; uses `bg-whatsapp` token
- `SectionHeading` — eyebrow + title + subtitle block
- `EmptyState` — empty-page and panel empty-state layout
- `Chip` — pill filter / tag control

## Spacing rhythm

- Sections: `py-12 md:py-24`
- Page gutters: `px-4 md:px-6`
- Content width: `max-w-7xl mx-auto`
