# Documentation screenshots

Actual Chromium captures of Alignment Kit. Reproduce with `npm run dev`, then `npm run screenshots` in another terminal.

- `protein-explorer.png`: Pfam PF00571.34 CBS seed, 838 sequences, 160 columns; selected alignment column 118.
- `rna-colors.png`: Rfam RF00005 tRNA seed, 954 sequences, 118 columns; blue/orange nucleotide palette and frequency logo. This is RNA; the same palette supports DNA with T replacing U.
- `minimal-embed.png`: the same tRNA dataset with controls, overview, inspector, status, selected tracks and row actions hidden through the public visibility API.

Dataset snapshots and hashes: `demo/public/alignments.json`. Images show the actual UI; no mockups or compositing.
