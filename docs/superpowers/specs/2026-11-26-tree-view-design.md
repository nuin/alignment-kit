# Full-size tree view

## Intent

The tree column is 120 px by default and 400 px at most, and its leaves are squeezed to row height. Users want to read the tree itself: its topology, its leaf names, and which clades share a residue at a column. The view is for quick exploration, like the NJ guide tree.

## Goals

- Show the current tree (from `setTree` or `buildTree`) at the size of the viewer.
- Label every leaf with its row name, and tag it with the residue at one alignment column, colored with the active color scheme.
- Make the column follow the grid selection, with a number box to change it.
- Keep clade selection: clicking a branch point checks the rows under it, as in the tree column.

## Non-goals

- Editing, rerooting, collapsing clades or exporting the tree image.
- A second tree, or several columns of residues at once.
- Changing the existing tree column.

## Anti-goals

- Becoming slow on large user-supplied trees. A 20,000-leaf Newick tree must scroll smoothly.
- Covering the page outside the viewer, or breaking inside a shadow root.

## Approaches

1. **Viewer-sized overlay drawn on a canvas** (picked). It handles large trees because only visible leaves are drawn, and it reuses `layoutTree`, `treeSpans` and the tree column's colors. Clicks need hit testing, which the tree column already does.
2. Overlay drawn as SVG. The browser does hit testing and accessibility, and export would be easy. It slows down beyond about 2,000 leaves.
3. A "Tree" tab in the inspector. Least code, but the inspector is about 280 px wide.

The user picked 1.

## Design

- A **Tree view** button sits next to **NJ tree**. It is hidden while no tree is set, using the `data-empty` pattern of **Show hidden**.
- `openTreeView(column?)` and `closeTreeView()` on `AlignmentViewer`. Opening without a tree rejects with an error message.
- The overlay is an element inside the viewer root that covers the grid area, with `role="dialog"` and `aria-label="Tree view"`. Esc and a **Close** button close it, and focus returns to the button that opened it.
- The header holds the title, a **Column** number box (1-based alignment column) and **Close**. The column starts at the selection start, or 1, and follows later selection changes.
- The body is a vertical scroller with one leaf per 22 px. A canvas draws only the leaves in view and the branches that cross the view.
- Leaves are in tree order. Every leaf is drawn, including leaves for hidden rows, the pinned reference and unmatched leaves. Leaves without a matching row show their Newick name in a muted color and no chip.
- Each matched leaf shows a residue chip (gap shown as `-`), then the row name. Chip colors come from the active color scheme, ignoring thresholds and color mode.
- Branch x positions use `layout.x` scaled to the width left after a 260 px label area.
- Clicking a branch point calls `selectClade`, with Shift adding to the selection, as the tree column does.
- Colors follow light and dark themes with the tree column's colors.

## Left to the builder

- Exact chip size, fonts and spacing.
- Whether the overlay or the scroller gets focus first.
- Test split between Vitest (open, close, column default and follow, errors) and Playwright (drawing, clade click, Esc).
