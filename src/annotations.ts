import type { Annotation, AnnotationFilter } from './types';
/** Sorted intervals plus prefix maxima support overlap queries without a full row scan. */
export class AnnotationIndex {
  private rows=new Map<string,{items:Annotation[];maxEnd:number[]}>();
  constructor(annotations:Annotation[]) {
    for(const a of annotations) if(a.mapping==='mapped'&&a.start!==undefined&&a.end!==undefined) {
      const key=a.rowId??'*'; if(!this.rows.has(key)) this.rows.set(key,{items:[],maxEnd:[]});
      this.rows.get(key)!.items.push(a);
    }
    for(const row of this.rows.values()) {
      row.items.sort((a,b)=>a.start!-b.start!);let max=0;
      row.maxEnd=row.items.map(a=>max=Math.max(max,a.end!));
    }
  }
  query(rowId:string,start:number,end:number):Annotation[] {
    const row=this.rows.get(rowId);if(!row)return [];
    let lo=0,hi=row.items.length;
    while(lo<hi){const mid=(lo+hi)>>>1;if(row.items[mid].start!<=end)lo=mid+1;else hi=mid;}
    const result:Annotation[]=[];
    for(let i=lo-1;i>=0 && row.maxEnd[i]>=start;i--) if(row.items[i].end!>=start)result.push(row.items[i]);
    return result;
  }
}
export function filterAnnotations(annotations:Annotation[],filter:AnnotationFilter) {
  const hidden=new Set(filter.hiddenRowIds??[]);let unknown=0,excluded=0;
  const visible=annotations.filter(a=>{
    if((filter.disease&&a.disease===undefined)||(filter.phenotype&&a.phenotype===undefined)) unknown++;
    const ok=!(a.rowId&&hidden.has(a.rowId))&&(!filter.types?.length||filter.types.includes(a.kind??'variant'))&&(!filter.consequences?.length||a.consequence?.some(c=>filter.consequences!.includes(c)))&&(!filter.disease||a.disease===true)&&(!filter.phenotype||a.phenotype===true);
    if(!ok) excluded++;return !!ok;
  });return {visible,unknown,excluded};
}
