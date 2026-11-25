# Variant information cards

Status: approved by the user after reviewing the interactive HTML preview on
2026-11-20 ("looks good").

## Purpose

Bring PAVI's browsable variant information bar into the canvas viewer. Users
should be able to see the available variants, jump to a mapped variant, and
discover variants that cannot appear on a protein alignment.

## Approach

Add a collapsible strip to the shared viewer above the alignment. React and
Svelte consumers receive the same behavior. Use the existing annotation model,
filters, selection, theme tokens, and variant navigation; implement the UI
independently rather than copying PAVI's component code.

A PAVI-only component would keep application presentation local, but would need
to synchronize another list with the viewer's filters and selection. The shared
strip is recommended because the viewer already owns those interactions and
supports the metadata needed by the cards.

## Behavior

- Show the strip only when variant annotations exist. Allow consumers to hide it
  through the existing visibility configuration.
- Start expanded with a compact horizontal row of cards and a collapse control.
  Use bounded rendering and paging for large variant lists.
- Show the protein change or variant ID, sequence/species, consequence, and
  available impact and evidence metadata. Keep absent evidence unknown.
- A mapped card selects its row and alignment interval, scrolls to it, and opens
  the position inspector. Track clicks and Previous/Next update the active card.
- Include unmapped variants with an explicit “No protein position” label.
  Identify noncoding variants from their supplied metadata, not from missing
  coordinates alone. Their cards expose details without changing the residue
  selection to a fabricated position.
- Apply the existing annotation and row filters consistently. Keep an explicit
  empty message when filters exclude every card.
- Preserve collapse state and keyboard focus during selection and evidence
  updates. Use semantic buttons, visible focus, readable text in both themes,
  and a scrollable row on narrow screens.

## Verification

Check card selection, navigation synchronization, unmapped details, filtering,
large-list bounds, collapse, and alignment replacement. Exercise the browser
interaction in Chromium and WebKit, then verify the local PAVI Trp53 job shows
four mapped cards and one noncoding card. Run type and quality checks and retain
the existing local, uncommitted work.
