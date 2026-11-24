const names:Record<string,string>={
  A:'Alanine',C:'Cysteine',D:'Aspartic acid',E:'Glutamic acid',F:'Phenylalanine',G:'Glycine',H:'Histidine',I:'Isoleucine',K:'Lysine',L:'Leucine',
  M:'Methionine',N:'Asparagine',P:'Proline',Q:'Glutamine',R:'Arginine',S:'Serine',T:'Threonine',V:'Valine',W:'Tryptophan',Y:'Tyrosine',
  B:'Asparagine or aspartic acid',Z:'Glutamine or glutamic acid',J:'Isoleucine or leucine',U:'Selenocysteine',O:'Pyrrolysine',X:'Unknown amino acid','*':'Stop','-':'Gap',
};
const groups=[['AVLIMGP','Nonpolar'],['FWY','Aromatic'],['STCNQU','Polar'],['KRHO','Basic'],['DE','Acidic'],['BZJ','Ambiguous']];
/** Broad residue classes; these do not predict charge at a particular pH. */
export function residueDescription(residue:string):string {
  const name=names[residue]??'Unknown amino acid',group=groups.find(([letters])=>letters.includes(residue));
  return group?`${name} · ${group[1]}`:name;
}
