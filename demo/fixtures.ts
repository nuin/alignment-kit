import { createAlignment } from '../src/model';
/** Explicitly synthetic, deterministic load fixtures. Not biological evidence. */
export function syntheticAlignment(count=10000,width=1000,features=0) {
  const residues='ACDEFGHIKLMNPQRSTVWY';let seed=42;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const consensus=Array.from({length:width},()=>residues[Math.floor(random()*20)]);
  const rows=Array.from({length:count},(_,r)=>({id:`synthetic-${r}`,name:`Sequence ${String(r+1).padStart(5,'0')}`,species:['Synthetic group A','Synthetic group B','Synthetic group C'][r%3],sequence:consensus.map((c,i)=>random()<.13?'-':(random()<.14||i%61>55)?residues[Math.floor(random()*20)]:c).join('')}));
  const annotations=Array.from({length:features},(_,i)=>{const pos=1+Math.floor(random()*width);return {id:`synthetic-feature-${i}`,rowId:rows[i%count].id,start:pos,end:pos,label:`Synthetic variant ${i+1}`,kind:i%2?'substitution':'deletion',consequence:['missense_variant'],metadata:{variant:{type:i%2?'substitution':'deletion',consequenceClass:'missense'}},mapping:'mapped' as const,disease:i%3===0,phenotype:i%4===0};});
  return createAlignment(rows,{alphabet:'protein',name:`Synthetic ${count.toLocaleString()} × ${width.toLocaleString()}`,annotations,source:{description:'Deterministic synthetic stress-test data, seed 42. Not biological evidence.'}});
}
