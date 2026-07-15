---
version: alpha
name: Gravuresse Studio
description: Cinematic dark creative workspace with precise controls and a restrained warm amber interaction signal.
colors:
  primary: "#0B0D10"
  secondary: "#171B20"
  tertiary: "#F0A44B"
  neutral: "#F4F5F7"
  surface-raised: "#1E232A"
  surface-sunken: "#080A0C"
  surface-hover: "#252B33"
  text-primary: "#F4F5F7"
  text-secondary: "#B6BDC7"
  text-muted: "#7F8894"
  border-subtle: "#2A3038"
  border-strong: "#3A424D"
  success: "#45B97C"
  warning: "#F0A44B"
  danger: "#E96B68"
  info: "#70A5EB"
typography:
  project-title:
    fontFamily: Segoe UI Variable
    fontSize: 24px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  section-title:
    fontFamily: Segoe UI Variable
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "-0.01em"
  body-md:
    fontFamily: Segoe UI Variable
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: Segoe UI Variable
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: Segoe UI Variable
    fontSize: 12px
    fontWeight: 600
    lineHeight: 1.35
  meta:
    fontFamily: Segoe UI Variable
    fontSize: 11px
    fontWeight: 400
    lineHeight: 1.4
  mono:
    fontFamily: Cascadia Mono
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.45
rounded:
  xs: 4px
  sm: 6px
  md: 8px
  lg: 12px
  full: 999px
spacing:
  xxs: 2px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  xxl: 32px
components:
  button-primary:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.primary}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: 10px
    height: 36px
  button-primary-hover:
    backgroundColor: "#FFB65E"
    textColor: "{colors.primary}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: 10px
    height: 36px
  button-secondary:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.neutral}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: 10px
    height: 36px
  button-secondary-hover:
    backgroundColor: "{colors.surface-hover}"
    textColor: "{colors.neutral}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: 10px
    height: 36px
  input:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: 12px
    height: 36px
  panel:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: 16px
  chip-selected:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.primary}"
    typography: "{typography.meta}"
    rounded: "{rounded.full}"
    padding: 8px
  status-success:
    backgroundColor: "#163C2B"
    textColor: "{colors.success}"
    typography: "{typography.meta}"
    rounded: "{rounded.full}"
    padding: 8px
  status-danger:
    backgroundColor: "#3A1A1A"
    textColor: "{colors.danger}"
    typography: "{typography.meta}"
    rounded: "{rounded.full}"
    padding: 8px
  status-warning:
    backgroundColor: "#3D2A13"
    textColor: "{colors.warning}"
    typography: "{typography.meta}"
    rounded: "{rounded.full}"
    padding: 8px
  status-info:
    backgroundColor: "#1C3047"
    textColor: "{colors.info}"
    typography: "{typography.meta}"
    rounded: "{rounded.full}"
    padding: 8px
  supporting-copy:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.text-secondary}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.xs}"
    padding: 8px
  metadata:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.text-muted}"
    typography: "{typography.meta}"
    rounded: "{rounded.xs}"
    padding: 4px
  divider-subtle:
    backgroundColor: "{colors.border-subtle}"
    textColor: "{colors.neutral}"
    rounded: "{rounded.xs}"
    padding: 2px
  divider-strong:
    backgroundColor: "{colors.border-strong}"
    textColor: "{colors.neutral}"
    rounded: "{rounded.xs}"
    padding: 2px
---

## Overview

Gravuresse Studio is a desktop creative workspace, not a marketing surface. Its native composition is **Operate + Command/Inspect**: the user is continuously generating, comparing, modifying and tracing media. The interface recedes so images and video carry the visual color.

The visual posture combines cinematic darkness, precise tool hierarchy and a restrained warm interaction signal. Warm amber is not decoration; it means selected, focused, needs review or primary action.

## Colors

- **Primary (#0B0D10):** deepest application and canvas background.
- **Secondary (#171B20):** persistent panels and navigation.
- **Surface Raised (#1E232A):** cards, inputs and selected work areas.
- **Tertiary (#F0A44B):** sole brand interaction signal for focus, selection and primary action.
- **Text Primary (#F4F5F7):** main text; avoid pure white glare.
- **Text Secondary (#B6BDC7):** supporting labels and body copy.
- **Text Muted (#7F8894):** metadata only; do not use for critical instructions.
- Semantic green, red and blue are reserved for success, failure and information.

Media thumbnails provide the broad color spectrum. Application chrome remains neutral.

## Typography

Use `Segoe UI Variable` first because Gravuresse is a Windows Electron application. Chinese fallbacks in CSS are `Microsoft YaHei UI` and `PingFang SC`. Use `Cascadia Mono` only for model IDs, recipe values, hashes, timing and API metadata.

UI copy stays between 11px and 14px. Project titles may reach 24px. Do not use marketing-scale display type inside the workspace.

## Layout

Use a 4px base grid with 8/12/16/24px as the primary rhythm. The desktop shell has a 40px title bar, a 56px project rail, a 296–380px conversation panel, a flexible work surface and a 300–360px inspector.

The central work surface always wins horizontal space. At narrow widths only one side panel may remain open.

## Elevation & Depth

Depth comes from surface luminance and 1px borders, not glass blur. Persistent panels are flat. Menus, dialogs and dragged objects may use restrained dark shadows. Media cards use a 1px neutral border; selected media replaces it with amber.

## Shapes

Use 6px radius for controls, 8px for cards and 12px for dialogs. Avoid oversized rounded rectangles. Pills are limited to compact status and filter chips. Media corners stay at 6px so visual work feels framed rather than toy-like.

## Components

- `button-primary` is used once per decision surface.
- `button-secondary` is the default toolbar action.
- `input` uses a sunken surface and a visible amber focus ring implemented in CSS.
- `panel` defines persistent structural areas; it should not float.
- `chip-selected` is limited to selected modes and locks.
- Status components combine color with explicit text and icons.

## Do's and Don'ts

### Do

- Make media the strongest visual element.
- Use amber only when the user can act or must decide.
- Show what is kept, changed and unsupported.
- Keep technical values aligned and scannable with mono type.
- Use background luminance steps and quiet borders for hierarchy.
- Provide keyboard focus, reduced motion and non-color status cues.

### Don't

- Do not use blue-violet AI gradients.
- Do not blur every panel.
- Do not create equal-weight feature-card grids in the workspace.
- Do not use decorative Agent avatars as progress indicators.
- Do not promise perfect context or deterministic reproduction.
- Do not expose controls that the active Provider capability does not support.
