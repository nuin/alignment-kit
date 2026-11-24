# Configuration, colors and themes

## Configure the interface

Every viewer region and functional control has a typed visibility switch. In the Explorer, open **Customize viewer** above the alignment to try them and use **Restore default view** to undo your presentation changes. That demo panel belongs to the host application, not the embedded library.

```ts
import { createViewer, defaultVisibility, type ViewerVisibility } from '@nuin/msa-canvas';

const visibility: ViewerVisibility = {
  open: false,
  overview: false,
  inspector: false,
  modalFrequency: false,
  gapFraction: false,
  rowSelection: false,
  rowPinning: false,
};
const viewer = createViewer(element, { alignment, visibility });

// Updates merge individual keys; omitted keys keep their current values.
viewer.setOptions({ visibility: { inspector: true, featuresTab: false } });
const current = viewer.getVisibility(); // a copy of all resolved flags
viewer.setOptions({ visibility: { ...defaultVisibility } }); // restore defaults
```

All flags default to `true`, except `logo`, `entropy` and `quality`, which default to `false`. Parent regions gate their children; showing a child does not override a hidden parent. Empty toolbars and the inspector with no enabled tabs collapse automatically. Hiding the active inspector tab selects the next enabled tab. Hidden controls leave the tab order, and hiding an open menu closes it.

| Region | `visibility` keys |
|---|---|
| Main layout | `toolbar`, `tools`, `overview`, `overviewTitle`, `tracks`, `alignment`, `inspector`, `inspectorTabs`, `status` |
| Main toolbar | `open`, `search`, `colorScheme`, `zoom`, `fit`, `theme`, `inspectorToggle`, `textView`, `fullscreen`, `export` |
| Secondary toolbar | `goTo`, `motif`, `order`, `colorMode`, `logoToggle`, `matchDots`, `statisticsScope`, `rulerCoordinates`, `alphabet`, `reverseComplementToggle` |
| Individual tracks | `ruler`, `modalFrequency`, `gapFraction`, `entropy`, `quality`, `consensus`, `logo`, `reference`, `stockholmTracks` |
| Labels and row actions | `labels`, `rowNames`, `rowSpecies`, `rowSelection`, `rowPinning`, `rowHiding`, `rowReordering`, `labelResize`, `rowStrand` |
| Column masking and marks | `columnMasking`, `columnMarks` |
| Thresholds and row filters | `consensusThreshold`, `colorThreshold`, `minIdentity`, `minCoverage` |
| Canvas layers | `residueLetters`, `annotationMarks`, `selectionOverlay`, `tree` |
| Variants | `variantTrack` (track above the reference row), `variantNav` (Previous variant / Next variant buttons) |
| Hover cards | `tooltip` |
| Inspector tabs | `positionTab`, `featuresTab`, `compareTab`, `colorsTab`, `hitsTab`, `summaryTab` |
| Inspector controls | `pinReference`, `rowFeaturesToggle`, `featureType`, `featureConsequence`, `diseaseFilter`, `phenotypeFilter`, `featurePagination`, `calculateIdentity`, `clearRows` |
| Feedback | `statusSummary`, `statusDetails`, `warnings`, `messages`, `emptyState` |

`toolbar` controls the main toolbar; `tools` controls the secondary row. `alignment` controls the scrolling matrix. `logoToggle` hides only its checkbox, while `logo` controls the actual frequency track. `reference: false` (or `tracks: false`) returns the reference sequence to the scrolling rows under the current filter/order; it remains the comparison reference. No sequence is dropped from the alignment or statistics. `labels: false` reclaims the gutter width and keeps canvas hit testing aligned.

Visibility changes do not clear checked rows, selections, filters or analysis settings. Hidden annotation marks remain in the data. These switches control presentation, not permissions: file dropping, keyboard shortcuts and API operations still work. Data/figure exports retain their existing semantics; SVG/PNG use their own figure layout rather than reproducing hidden UI chrome. Exported view-state JSON includes visibility flags, and `setState()` accepts older states without them.

The existing `showToolbar`, `showInspector` and `showLogo` options remain supported. `showToolbar` sets both `toolbar` and `tools`; the other aliases set `inspector` and `logo`. If aliases and `visibility` are supplied in the same call, explicit visibility keys win. Desktop/narrow responsive rules and compact-row species hiding still apply.

The same options work in both integrations; replace the options object when changing visibility:

```tsx
// React
<AlignmentViewer alignment={alignment}
  options={{ visibility: { open: false, inspector: showInspector } }} />
```

```svelte
<!-- Svelte component; the action accepts the same options object. -->
<AlignmentViewer {alignment}
  options={{ visibility: { open: false, inspector: showInspector } }} />
```

## Configure from a JSON file

A developer can keep viewer settings in JSON, validate them with `parseViewerConfig`, and use the same configuration in JavaScript, React or Svelte. The package includes an [example configuration](../../config/viewer-config.example.json) and a [JSON Schema](../../config/viewer-config.schema.json) for editor validation and autocomplete. Copy both files together or adjust the example's `$schema` path to your copy of the schema.

```json
{
  "$schema": "./viewer-config.schema.json",
  "height": 700,
  "theme": "light",
  "colorScheme": "soft-nucleotide",
  "visibility": {
    "overview": false,
    "inspector": false,
    "rowSelection": false,
    "modalFrequency": false
  }
}
```

```ts
import { createViewer, parseViewerConfig } from '@nuin/msa-canvas';

const response = await fetch('/viewer-config.json');
if (!response.ok) throw new Error(`Configuration request failed: ${response.status}`);
const options = parseViewerConfig(await response.text());
const viewer = createViewer(element, options);
await viewer.setAlignment(alignment);

// To apply another configuration to the existing viewer:
viewer.setOptions(parseViewerConfig(await otherResponse.text()));
```

For React or Svelte, parse the JSON once and pass the returned `options` object to the component or action as shown in [React, Svelte, workers and Deno](frameworks.md). When a configuration changes, replace the options object so the framework integration updates. JSON imports vary by bundler; alternatively fetch it as shown, with the hosting server's CORS policy permitting the request.

The parser checks known keys, types, ranges and visibility names, and reports invalid input instead of silently ignoring typos. It strips the optional `$schema` editor hint. It does not load alignment data or arbitrary code. Palette IDs are resolved by the viewer when options are applied; register custom palettes before applying a configuration that references them. `worker` and `workerUrl` take effect at creation/mount, not on later `setOptions()` calls. Relative worker URLs follow the browser's document URL; choose an appropriate URL and CSP for your host.

A JSON configuration controls presentation, not access rights. Hidden controls do not disable keyboard shortcuts, file dropping or the API. An exported view-state JSON is a separate format containing navigation and analysis state; restore it with `setState`, not `parseViewerConfig`.

## Option defaults

Every key of a JSON configuration is optional. The table states the value the viewer uses when a key is absent. `parseViewerConfig` rejects a value outside the range, and the [JSON Schema](../../config/viewer-config.schema.json) carries the same defaults and ranges for editor hints. `tests/docs-api.test.ts` compares this table and the schema with the `AlignmentViewer` constructor.

| Option | JSON type | Range | Default |
|---|---|---|---|
| `height` | number | 360 to 2000 | `740` |
| `theme` | string | `light`, `dark` | `'light'` |
| `colorScheme` | string | a registered scheme ID | `'soft'` |
| `colorMode` | string | `all`, `reference-differences`, `reference-matches`, `consensus-differences`, `consensus-matches` | `'all'` |
| `matchDisplay` | string | `letter`, `dot` | `'letter'` |
| `cellWidth` | number | 3 to 32 | `16` |
| `rowHeight` | number | 18 to 48 | `36` |
| `labelWidth` | number | 100 to 420 | `230` |
| `showLogo` | boolean | | `false` |
| `showInspector` | boolean | | `true` |
| `showToolbar` | boolean | | `true` |
| `statisticsScope` | string | `all`, `filtered` | `'all'` |
| `rulerCoordinates` | string | `alignment`, `reference` | `'alignment'` |
| `consensusThreshold` | number | 0 to 1 | `0` |
| `colorThreshold` | number | 0 to 1 | `0` |
| `minIdentity` | number | 0 to 100 | `0` |
| `minCoverage` | number | 0 to 100 | `0` |
| `logoMode` | string | `frequency`, `bits` | `'frequency'` |
| `conservationWindow` | integer | odd, 1 to 51 | `1` |
| `treeWidth` | number | 0 to 400 | `120` |
| `hideGapColumns` | number or null | 0 to 1 | `null` |
| `hideAllGapColumns` | boolean | | `false` |
| `dragToPan` | boolean | | `true` |
| `reverseComplement` | boolean | | `false` |
| `tooltips` | boolean | | `true` |
| `focusFirstVariant` | boolean | | `false` |
| `textView` | boolean | | `false` |
| `groupBy` | string | non-empty | no grouping |
| `urlSync` | boolean | | `false` |
| `worker` | boolean | | `true` |
| `workerUrl` | string | non-empty | the bundled `worker.js` |
| `visibility` | object | 80 boolean keys | all `true` except `logo`, `entropy`, `quality` |
| `fasta` | object | `gaps`, `letterCase`, `lineWidth`, `header`, `orientation` | `keep`, `original`, `80`, `name`, `source` |
| `export` | object | `columns`: `all`, `visible` | `all` |
| `annotationLinks` | object | `http` or `https` templates with `{id}` | no links |
| `tracks` | array | `bar`, `heatmap` and `text` tracks | no custom tracks |

The `colorScheme` default applies to protein. A DNA or RNA alignment replaces `soft` with `soft-nucleotide`. The [options table](api.md#options) adds the meaning of each option.

## Colors and themes

Protein alignments default to **Residue classes** (`soft`); DNA/RNA default to **Nucleotide · muted** (`soft-nucleotide`), with A green, C gold, G rose and T/U blue. Ambiguity symbols have a neutral background. The original vivid mapping remains **Nucleotide · classic** (`nucleotide`). The Color menu lists schemes compatible with the loaded alphabet; changing **Alphabet** (labelled Type before the tools bar was grouped) or loading a different alphabet replaces an incompatible scheme with its default. Alphabet changes interpretation and leaves the sequence letters as they are. It does not translate proteins or convert T to U.

Colorblind-safe and high-contrast schemes: `cvd-protein` (**Residue classes · colorblind-safe**), `cvd-nucleotide` (**Nucleotide · colorblind-safe**, Okabe-Ito based), `hc-protein` and `hc-nucleotide` (**… · high contrast**). The protein schemes use seven classes (aliphatic AVLIM, aromatic FWY, polar STNQ, positive KRH, negative DE, glycine and proline GP, cysteine C); the nucleotide schemes color A, C, G and T/U. All four keep every pair of class colors, and the neutral color of ambiguity symbols (B, Z, X, J, U, O and * in protein; R, Y, S, W, K, M, B, D, H, V, N in nucleotides), at a CIELAB distance of 25 or more under normal vision and under simulated deuteranopia and protanopia (Machado 2009 matrices, checked in `tests/palettes.test.ts`). The high-contrast schemes also give every letter at least 7:1 contrast against its fill. The nucleotide schemes are limited to DNA and RNA, the protein schemes to protein. The Colors tab lists each class with its residues. `ColorScheme` has the optional fields `classes`, `cvdSafe` and `highContrast`. No other built-in scheme is claimed to be colorblind-safe; the Nightingale schemes, Clustal, Zappo and the muted defaults rely on red-green or similar hue differences.

Additional DNA/RNA options are `nucleotide-blue-orange`, `nucleotide-contrast` (strong), `nucleotide-grayscale`, `nucleotide-gc` (GC vs AT/U), and `nucleotide-purine` (muted purines vs pyrimidines). Group schemes handle unambiguous group membership explicitly: GC colors S with G/C and W with A/T/U; purine coloring groups R with A/G and Y with C/T/U. Other mixed ambiguity codes stay neutral. These are qualitative encodings, not GC percentages or evidence of biological function. The user guide includes descriptions and base-by-base previews.

All dropdowns use viewer-themed menus with keyboard navigation (arrows, Home/End, typeahead, Enter, Escape), following the viewer theme rather than the OS theme. Nightingale fixed palettes include Clustal/Clustal2, Taylor, Zappo, Lesk, Cinema, MAE, nucleotide, hydrophobicity, buried index, helix/strand/turn propensity and property highlights. Clustal2 here is a fixed residue mapping, not column-dependent ClustalX. The consensus-support scheme is calculated from the explicitly selected statistics scope.

`registerColorScheme({ id, label, description, colors, alphabets? })` adds a palette before constructing a viewer. Colors must be hex values. An optional `alphabets` array restricts a custom scheme to `protein`, `dna` and/or `rna`; omitting it allows every alphabet. `colorSchemes(alphabet?)` lists available schemes. Existing schemes and the Colors tab provide legends. See [third-party notices](../../THIRD_PARTY_NOTICES.md).

### Themes

`theme` takes `'light'` (default), `'dark'` or `'auto'`. `'auto'` follows the system setting through `prefers-color-scheme` and switches live when the system changes. The value is written to `data-theme` on `.ak-viewer`. The **Dark theme** button reports the resolved theme through `aria-pressed`. Clicking it sets the opposite of the resolved theme as an explicit `'light'` or `'dark'`, which ends `'auto'`. The canvases (body, ruler, tracks, labels and overview) use the same resolved theme and redraw when the system setting changes under `'auto'`.

```ts
createViewer(el, { theme: 'auto' });
viewer.setOptions({ theme: 'dark' });
```

Residue fills on the canvas come from the color scheme and are the same in every theme.

### CSS properties

Override these on `.ak-viewer`. The seven color properties from earlier releases keep their names and meaning.

| Property | Light | Dark | Used for |
|---|---|---|---|
| `--ak-bg` | `#fff` | `#172333` | Viewer and control background |
| `--ak-panel` | `#f6f8fb` | `#1d2b3c` | Tools bar, tab strip, status bar |
| `--ak-ink` | `#243447` | `#e3ecf5` | Text |
| `--ak-muted` | `#586b80` | `#a5b7c8` | Labels, captions, secondary text |
| `--ak-line` | `#d7e0e7` | `#354356` | Borders and dividers |
| `--ak-line-strong` | `#bfd0e0` | `#4d6078` | Hovered and pressed control borders |
| `--ak-accent` | `#2463a6` | `#82b5ef` | Focus ring, selected tab, pressed buttons, links |
| `--ak-accent-soft` | `#2463a61a` | `#82b5ef2e` | Overview window fill, label resize handle |
| `--ak-hover` | `#eaf1f8` | `#293e55` | Hover and pressed backgrounds, messages |
| `--ak-danger`, `--ak-danger-bg` | `#9b2843`, `#fff0f1` | `#ff9fb2`, `#3a1f2a` | Error messages |
| `--ak-warn` | `#b96f00` | `#f0b04a` | Current search hit |
| `--ak-feature` | `#a63d59` | `#e58aa3` | Feature card edge |
| `--ak-scrollbar` | `#aebfce` | `#52657c` | Scrollbar thumbs |
| `--ak-shadow`, `--ak-shadow-sm` | | | Menu and card shadows |

Sizes, radii and fonts are shared by both themes:

| Property | Default | Used for |
|---|---|---|
| `--ak-text-xs`, `--ak-text-sm`, `--ak-text-md`, `--ak-text-lg`, `--ak-text-xl` | 11, 12, 13, 17, 26 px | Text sizes. No viewer text is smaller than `--ak-text-xs`. |
| `--ak-radius-sm`, `--ak-radius`, `--ak-radius-lg` | 3, 5, 10 px | Swatches and tabs, controls, the viewer frame |
| `--ak-control` | 32 px (44 px with a coarse pointer) | Height of toolbar buttons, inputs and menus |
| `--ak-mono` | `ui-monospace, "SF Mono", Menlo, Consolas, monospace` | Residue badges, legends, text view |
| `--ak-font` | IBM Plex Sans (bundled, OFL) | Interface text |

A host that sets a color property in its own rule must set it for the dark theme as well, for example under `.ak-viewer[data-theme=dark]`.

### Letter contrast

`textColor(fill)` picks the letter ink for a residue fill: white on fills with relative luminance below 0.179, the viewer ink `#172737` where it reaches 4.5:1, and black on the mid-luminance fills in between. Every entry of the Nightingale palettes (339) and every built-in scheme reaches 4.5:1; `tests/ink-contrast.test.ts` walks them all. Custom schemes get the same rule.

### Preferences and input

- `prefers-reduced-motion: reduce` removes transitions, animations and smooth scrolling.
- `forced-colors: active` outlines the selected tab, pressed buttons, the open **More** button, the active menu option and the current hit, because forced colors remove their backgrounds.
- `pointer: coarse` raises `--ak-control` to 44 px and gives row checkboxes, row buttons, the label resize handle and tab buttons larger targets. Row height stays with the `rowHeight` option, which the canvas shares.
- Layout breakpoints measure the viewer, through a CSS container named `ak` on `.ak-viewer`. See [Toolbar groups and narrow layouts](display.md#toolbar-groups-and-narrow-layouts).

Fonts and page styling do not alter input data.
