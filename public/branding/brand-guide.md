# Elsewhere — Brand Guide

*Somewhere between here and nowhere.*

## Concept

The mark is a **doorway** that frames a **winding road** running toward a
**horizon**, with a single small **light** waiting just above it. It reads three
ways at once:

- an arched portal — the threshold between a familiar place and a dream;
- a road vanishing into the distance — the endless drive;
- a lone light on the horizon — calm, but with a quiet question in it.

The arch is drawn with a cream outline so it stays legible on both dark and
light backgrounds and survives reduction to a 16 px favicon (arch + light + road
remain distinct shapes at that size).

## Files

| File | Use |
| --- | --- |
| `logo.svg` | Primary horizontal lockup (mark + wordmark). Menus, README, splash. |
| `logo-mark.svg` | Standalone symbol. Loading screen, small UI placements. |
| `../favicon.svg` | Browser favicon (identical geometry to the mark). |
| `icon-512.svg` | Square app icon source with background plate (manifest, stores). |

## Colour

| Name | Hex | Role |
| --- | --- | --- |
| Midnight | `#0E1626` | Primary background, deepest tone |
| Dusk Navy | `#18283A` | Panels, gradients |
| Deep Teal | `#2F5D62` | Sky within the arch, accents |
| Muted Teal | `#5E8C8A` | Horizon line, dividers, secondary text accents |
| Haze Grey | `#8A949B` | Secondary text, inactive UI |
| Cream | `#EFE6D2` | Wordmark, outlines, primary text |
| Ember (accent) | `#E3A857` | The horizon light. Use sparingly — one accent per view. |

Ember is the only warm colour in the system. It marks *the thing you are
driving toward*: the primary action button, the active selection, the light in
the mark. Never use it for large fills.

## Typography

- **Wordmark / display:** a classical serif (`Iowan Old Style`, `Palatino
  Linotype`, Palatino, Georgia), uppercase, tracked very wide (≈ 0.3 em). It
  should feel like a sign seen from far away.
- **Interface:** the system UI sans stack (`Inter`, `Segoe UI`, system-ui),
  regular/medium weights, small sizes, generous letter-spacing on labels.
- No external web fonts are required; the game ships as a fully static site.

## Spacing & usage

- Clear space around the lockup: at least the height of the arch's light dot × 4
  on every side.
- Minimum sizes: mark 16 px; horizontal lockup 140 px wide.
- Place on Midnight/Dusk Navy or on darkened scene imagery. On bright scenes, add
  a soft dark scrim behind the logo instead of recolouring it.
- Don't: recolour the arch, add glow/neon effects, rotate, stretch, outline the
  wordmark, or set the wordmark in a different typeface.
