import palettes from './palettes.json' with { type: 'json' };
import type { Alphabet } from './types';
export interface ColorScheme { id:string; label:string; description:string; colors:Record<string,string>; alphabets?:Alphabet[] }
const registry:Map<string,ColorScheme>=new Map();
export function registerColorScheme(scheme:ColorScheme) {
  if(!/^[a-z0-9_-]+$/i.test(scheme.id)) throw new Error('Color scheme IDs must contain only letters, numbers, underscores or hyphens.');
  for(const [residue,color] of Object.entries(scheme.colors)) if(!/^[A-Z*-]$/.test(residue)||!/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(color)) throw new Error('Residue colors must be three- or six-digit hex colors.');
  registry.set(scheme.id,{...scheme,colors:{...scheme.colors}});
}
const aliases:Record<string,string>={buried:'buried_index',helix:'helix_propensity',strand:'strand_propensity',turn:'turn_propensity',hydrophobicity:'hydro'};
const labels:Record<string,string>={clustal2:'Clustal2',clustal:'Clustal',hydro:'Hydrophobicity',buried_index:'Buried index',helix_propensity:'Helix propensity',strand_propensity:'Strand propensity',turn_propensity:'Turn propensity',mae:'MAE',cinema:'Cinema',purine:'Purine / pyrimidine'};
for(const [name,colors] of Object.entries(palettes)) {
  const id=aliases[name]??name;
  registerColorScheme({id,label:labels[id]??id[0].toUpperCase()+id.slice(1).replaceAll('_',' '),description:'Fixed residue colors from Nightingale. Color encodes residue identity or a residue property, not inferred biological function.',colors,alphabets:['nucleotide','purine'].includes(id)?['dna','rna']:['protein']});
}
registerColorScheme({id:'soft',label:'Residue classes',alphabets:['protein'],description:'Muted qualitative residue classes: hydrophobic, polar, positive, negative, and special residues.',colors:Object.fromEntries([['AILMVFWY','#c7d9ec'],['STNQ','#cfe5d7'],['KRH','#d3cbeb'],['DE','#f0c8c2'],['G','#eee2b7'],['P','#dfd0bd'],['C','#f4dda0']].flatMap(([letters,color])=>[...letters].map(letter=>[letter,color])))});
registerColorScheme({id:'soft-nucleotide',label:'Nucleotide · muted',alphabets:['dna','rna'],description:'Muted base identities: A green, C gold, G rose, T/U blue. Ambiguity symbols are neutral; T and U share a color without changing the input sequence.',colors:{A:'#d8ead3',C:'#f3dfb3',G:'#e8c8cb',T:'#ccdef3',U:'#ccdef3',R:'#e0e5eb',Y:'#e0e5eb',S:'#e0e5eb',W:'#e0e5eb',K:'#e0e5eb',M:'#e0e5eb',B:'#e0e5eb',D:'#e0e5eb',H:'#e0e5eb',V:'#e0e5eb',N:'#e0e5eb'}});
getColorScheme('nucleotide').label='Nucleotide · classic';
const neutralNucleotides=Object.fromEntries([...'RYSWKMBDHVN'].map(base=>[base,'#e0e5eb']));
const nucleotideScheme=(id:string,label:string,description:string,colors:Record<string,string>)=>registerColorScheme({id,label,description,alphabets:['dna','rna'],colors:{...neutralNucleotides,...colors}});
nucleotideScheme('nucleotide-blue-orange','Nucleotide · blue/orange','Four base identities using blue, orange, purple and teal. Mixed ambiguity symbols are neutral; letters provide the identity independently of color.',{A:'#b8d7ed',C:'#f5ce94',G:'#d6c8ec',T:'#b9e3e4',U:'#b9e3e4'});
nucleotideScheme('nucleotide-contrast','Nucleotide · strong','Stronger base colors: A navy, C gold, G purple, T/U teal. Foreground letters switch between dark and white for contrast.',{A:'#225ea8',C:'#e8b44b',G:'#854c98',T:'#007d78',U:'#007d78'});
nucleotideScheme('nucleotide-grayscale','Nucleotide · grayscale','Four gray levels for monochrome figures. Read the letters to distinguish bases; mixed ambiguity symbols are neutral.',{A:'#eeeeee',C:'#c6c6c6',G:'#8f8f8f',T:'#505050',U:'#505050'});
nucleotideScheme('nucleotide-gc','GC / AT(U)','Base groups, not a GC percentage: G/C/S are blue; A/T/U/W are gold. Ambiguity symbols spanning both groups are neutral.',{G:'#bfd8eb',C:'#bfd8eb',S:'#bfd8eb',A:'#f2dec2',T:'#f2dec2',U:'#f2dec2',W:'#f2dec2'});
nucleotideScheme('nucleotide-purine','Purine / pyrimidine · muted','Chemical base groups: A/G/R are blue; C/T/U/Y are gold. Ambiguity symbols spanning both groups are neutral.',{A:'#c7d9ec',G:'#c7d9ec',R:'#c7d9ec',C:'#eee0b5',T:'#eee0b5',U:'#eee0b5',Y:'#eee0b5'});
registerColorScheme({id:'conservation',label:'Consensus support',description:'Modal non-gap residue count divided by all rows in the selected statistics scope. Gaps reduce support.',colors:{}});
export const colorSchemes=(alphabet?:Alphabet):ColorScheme[]=>[getColorScheme('soft'),getColorScheme('soft-nucleotide'),...Array.from(registry.values()).filter(s=>s.id!=='soft'&&s.id!=='soft-nucleotide')].filter(s=>!alphabet||!s.alphabets||s.alphabets.includes(alphabet));
export function getColorScheme(id:string):ColorScheme {const s=registry.get(id);if(!s) throw new Error(`Unknown color scheme “${id}”.`);return s;}
export function residueColor(residue:string,scheme:ColorScheme,support?:number):string {
  if(residue==='-'||residue==='.') return '#f1f4f7';
  if(scheme.id==='conservation') {
    if(support===undefined||!Number.isFinite(support)) return '#edf0f4';
    const t=Math.max(0,Math.min(1,support));
    const mix=(a:number,b:number)=>Math.round(a+(b-a)*t).toString(16).padStart(2,'0');
    return `#${mix(242,58)}${mix(246,125)}${mix(250,164)}`;
  }
  return scheme.colors[residue.toUpperCase()]??'#e9edf2';
}
export function textColor(hex:string) {
  const h=hex.length===4?'#'+[...hex.slice(1)].map(x=>x+x).join(''):hex;
  const rgb=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(c=>c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4);
  return 0.2126*rgb[0]+0.7152*rgb[1]+0.0722*rgb[2]>0.24?'#172737':'#ffffff';
}
