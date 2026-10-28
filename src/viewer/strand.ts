import { type Core } from './core';
import { protein } from './options';
const nucleotide=(v:Core)=>!!v.a&&v.a.alphabet!=='protein';
/** Turn the whole-view reverse complement on or off. On a protein alignment it shows a message and changes nothing. */
export function setReverseComplement(v:Core, on:boolean):void {
  v.assertAlive();if(typeof on!=='boolean')throw v.error(new Error('setReverseComplement needs true or false.'));
  if(on&&v.a&&!nucleotide(v)){v.message(protein);return;}
  if(on===v.options.reverseComplement)return;
  v.setOptions({reverseComplement:on});
}
/** Flag a row as reverse strand ('-', shown complemented, columns unchanged) or clear the flag ('+'). Throws for an unknown row; on a protein alignment it shows a message and changes nothing. */
export function setRowStrand(v:Core, rowId:string, strand:'+'|'-'):void {
  v.assertAlive();if(strand!=='+'&&strand!=='-')throw v.error(new Error('Strand must be "+" or "-".'));
  if(!v.a)throw v.error(new Error('Load an alignment before setting a strand.'));
  if(!v.a.rows.some(r=>r.id===rowId))throw v.error(new Error(`Unknown sequence ID “${rowId}”.`));
  if(!nucleotide(v)){v.message(protein);return;}
  if((strand==='-')===v.rowStrands.has(rowId))return;
  if(strand==='-')v.rowStrands.add(rowId);else v.rowStrands.delete(rowId);
  v.labelKey='';v.inspectorDirty=true;v.schedule();v.emit('state',v.getState());
}
