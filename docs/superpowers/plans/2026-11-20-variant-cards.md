# Variant Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Ship the approved collapsible variant-card strip in the shared viewer and local PAVI integration.

**Architecture:** Reuse the variant layout's ordering, filters, and navigation. A dedicated card renderer owns bounded DOM presentation; a viewer module synchronizes selection, pages, collapse, and unmapped details. Existing React and Svelte wrappers inherit the UI.

**Tech Stack:** TypeScript, DOM/CSS, Vitest, Playwright Chromium/WebKit, existing React PAVI integration.

**Spec:** `docs/superpowers/specs/2026-11-20-variant-cards-design.md`

## Global Constraints

- Implement independently rather than copying PAVI's component code.
- Keep absent evidence unknown; never infer noncoding status from missing coordinates.
- Respect existing annotation and row filters; include unmapped variants without fabricating coordinates.
- Preserve collapse state and keyboard focus during selection and evidence updates.
- Keep work local and uncommitted; preserve all existing changes.

## Review Focus

- Hidden columns, collapsed groups, and pinned references must agree with navigation (task 1).
- Coincident variants need stable identity, and unmapped clicks must retain residue selection (task 2).
- Replacement data and evidence updates must not steal focus or expand a collapsed strip (task 2).
- Large lists must render at most 20 cards; navigation across pages must reveal the active card (task 2).
- Malformed or HTML-like metadata must remain plain text; unmapped DNA must not be labelled as protein (tasks 1–2).

### Task 1: Card data and presentation

**Files:** `src/variant-cards.ts`, `src/annotation-details.ts`, `src/viewer/variants.ts`, `tests/variant-cards.test.ts`.

**Interfaces:** `variantCardItems(v: Core): Annotation[]` returns mapped variants in existing navigation order followed by unmapped variants on shown rows. `annotationDetails(annotation: Annotation)` exposes validated plain-text fields shared with the inspector. `renderVariantCard(button: HTMLButtonElement, alignment: Alignment, annotation: Annotation, index: number): void` fills one card.

- [x] Write failing tests for mapped/unmapped ordering, hidden rows/columns, global annotations, explicit noncoding labels, plain-text metadata, and generic DNA copy.
- [x] Run `npx vitest run tests/variant-cards.test.ts`; confirm failures reflect missing behavior.
- [x] Extend the existing cached variant layout to include unmapped annotations and total variant count. Implement the bounded card presentation using existing annotation metadata, coordinates, and consequence colours.
- [x] Rerun the tests and existing variant tests; expect all to pass.

### Task 2: Integrated card browsing

**Files:** `src/viewer/cards.ts`, `src/controls.ts`, `src/viewer/bind.ts`, `src/viewer/actions.ts`, `src/viewer/draw.ts`, `src/types.ts`, `src/visibility.ts`, `src/style.css`, `config/viewer-config.schema.json`, `tests/variant-cards.test.ts`, `tests/variant-cards.spec.ts`.

**Interfaces:** `syncVariantCards(v: Core): void`, `selectVariantCard(v: Core, id: string): void`, and `variantCardsAction(v: Core, action: string): boolean`. Add `visibility.variantCards` (default true). Existing selection and annotation events remain the integration API.

- [x] Add failing interaction tests: click selects exact variant and inspector; noncoding details preserve selection; navigation updates active card and page; filters expose an empty state; collapse and focus survive replacement; hidden visibility and empty alignment hide the strip.
- [x] Run the focused tests and observe the expected failures.
- [x] Add the shell and cached controller; render at most 20 cards per page. Reuse stable buttons and preserve focus on updates. Wire collapse, page controls, and unmapped details through existing delegated events.
- [x] Style the approved compact horizontal strip using viewer tokens, including keyboard focus, narrow layouts, both themes, and reduced motion.
- [x] Run unit/type checks and Chromium/WebKit interaction and accessibility tests; expect no failures.

### Task 3: PAVI integration and final verification

**Files:** `docs/reference/annotations.md`, `docs/reference/display.md`, `docs/implementation-progress.md`; PAVI `CanvasAlignment/visibility.ts` and existing local package installation.

- [x] Document card visibility, paging, selection, unmapped behavior, and metadata.
- [x] Run `npm test`, `npm run check`, `npm run check:quality`, `npm run build`, and `npm run check:package`; inspect all results.
- [x] Install the tested local archive into PAVI, refresh its served assets, and add the card visibility toggle. Read installed Next.js guidance before changing its component configuration.
- [x] Verify the real local Trp53 result shows four mapped cards and one noncoding card, including click-to-select and noncoding details.
- [x] Request the executing-plans skill's independent final review, resolve material findings, and record validation without committing or publishing.
