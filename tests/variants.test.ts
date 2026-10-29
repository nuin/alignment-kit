import {it,expect,describe} from 'vitest';
import {parseHgvsProtein,variantsToAnnotations,consequenceClass,assignLanes,isVariant,variantColors,annotationColor,variantShape,variantOf} from '../src/variants';
import {createAlignment} from '../src/model';
import {fromPavi} from '../src/pavi';

describe('parseHgvsProtein',()=>{
  it.each([
    ['p.Arg123Trp',{start:123,end:123,ref:'R',alt:'W',type:'substitution',consequence:'missense_variant'}],
    ['p.R123W',{start:123,end:123,ref:'R',alt:'W',type:'substitution',consequence:'missense_variant'}],
    ['p.(Arg123Trp)',{start:123,end:123,ref:'R',alt:'W',type:'substitution',consequence:'missense_variant'}],
    ['NP_000537.3:p.Arg175His',{start:175,end:175,ref:'R',alt:'H',type:'substitution',consequence:'missense_variant'}],
    ['p.Arg123Ter',{start:123,end:123,ref:'R',alt:'*',type:'substitution',consequence:'stop_gained'}],
    ['p.Arg123*',{start:123,end:123,ref:'R',alt:'*',type:'substitution',consequence:'stop_gained'}],
    ['p.R123X',{start:123,end:123,ref:'R',alt:'*',type:'substitution',consequence:'stop_gained'}],
    ['p.Arg123=',{start:123,end:123,ref:'R',alt:'R',type:'substitution',consequence:'synonymous_variant'}],
    ['p.Arg123fs',{start:123,end:123,ref:'R',alt:'',type:'frameshift',consequence:'frameshift_variant'}],
    ['p.Arg123ProfsTer5',{start:123,end:123,ref:'R',alt:'P',type:'frameshift',consequence:'frameshift_variant'}],
    ['p.R123Pfs*5',{start:123,end:123,ref:'R',alt:'P',type:'frameshift',consequence:'frameshift_variant'}],
    ['p.Arg123del',{start:123,end:123,ref:'R',alt:'',type:'deletion',consequence:'inframe_deletion'}],
    ['p.Arg123_Lys125del',{start:123,end:125,ref:'RK',alt:'',type:'deletion',consequence:'inframe_deletion'}],
    ['p.Lys2_Leu3insGln',{start:2,end:3,ref:'KL',alt:'Q',type:'insertion',consequence:'inframe_insertion'}],
    ['p.Arg123delinsTrpGly',{start:123,end:123,ref:'R',alt:'WG',type:'delins',consequence:'protein_altering_variant'}],
    ['p.Arg123dup',{start:123,end:123,ref:'R',alt:'',type:'duplication',consequence:'inframe_insertion'}],
  ])('parses %s',(text,expected)=>{expect(parseHgvsProtein(text)).toEqual(expected);});
  it.each(['','Arg123Trp','c.123A>G','p.Arg123','p.Xyz123Trp','p.Arg0Trp','p.(Arg123Trp','p.Arg123Trp)','p.Arg123_Lys125Trp','p.Lys2_Leu5insGln','p.Arg125_Lys123del','p.Arg123_Lys125fs','p.Arg123W','p.Ter12del','p.?'])('rejects %j',text=>{expect(parseHgvsProtein(text)).toBeNull();});
});

describe('consequenceClass',()=>{
  it('maps Sequence Ontology terms, most severe first',()=>{
    expect(consequenceClass(['stop_gained'])).toBe('nonsense');
    expect(consequenceClass(['missense_variant','frameshift_variant'])).toBe('frameshift');
    expect(consequenceClass('missense_variant')).toBe('missense');
    expect(consequenceClass(['inframe_deletion'])).toBe('inframe');
    expect(consequenceClass(['inframe_insertion'])).toBe('inframe');
    expect(consequenceClass(['protein_altering_variant'])).toBe('inframe');
    expect(consequenceClass(['splice_region_variant'])).toBe('splice');
    expect(consequenceClass(['splice_donor_variant','synonymous_variant'])).toBe('splice');
    expect(consequenceClass(['synonymous_variant'])).toBe('synonymous');
    expect(consequenceClass(['stop_retained_variant'])).toBe('synonymous');
    expect(consequenceClass(['Missense Variant'])).toBe('missense');
    expect(consequenceClass(['intron_variant'])).toBe('other');
    expect(consequenceClass([])).toBe('other');
  });
  it('falls back to the variant type',()=>{
    expect(consequenceClass(undefined,'frameshift')).toBe('frameshift');
    expect(consequenceClass(undefined,'deletion')).toBe('inframe');
    expect(consequenceClass(undefined,'nonsense')).toBe('nonsense');
    expect(consequenceClass(undefined,'substitution')).toBe('other');
  });
  it('uses distinct hex colors and the annotation color when valid',()=>{
    expect(new Set(Object.values(variantColors)).size).toBe(7);
    for(const c of Object.values(variantColors))expect(c).toMatch(/^#[0-9A-F]{6}$/);
    const base={id:'x',label:'x',mapping:'mapped' as const,start:1,end:1};
    expect(annotationColor({...base,kind:'domain'})).toBe('#a63d59');
    expect(annotationColor({...base,kind:'substitution',consequence:['stop_gained']})).toBe(variantColors.nonsense);
    expect(annotationColor({...base,kind:'substitution',color:'#123456'})).toBe('#123456');
    expect(annotationColor({...base,kind:'substitution',consequence:['missense_variant'],color:'red'})).toBe(variantColors.missense);
  });
  it('recognizes variants by metadata or kind and picks shapes',()=>{
    const base={id:'x',label:'x',mapping:'mapped' as const};
    expect(isVariant({...base,kind:'Missense'})).toBe(true);
    expect(isVariant({...base,kind:'domain'})).toBe(false);
    expect(isVariant({...base,kind:'intron',metadata:{variant:{type:'other',consequenceClass:'other'}}})).toBe(true);
    const shape=(kind:string,consequence?:string[])=>variantShape(variantOf({...base,kind,consequence})!);
    expect(shape('substitution',['missense_variant'])).toBe('diamond');
    expect(shape('deletion')).toBe('triangle');
    expect(shape('insertion')).toBe('chevron');
    expect(shape('frameshift')).toBe('square');
    expect(shape('substitution',['stop_gained'])).toBe('square');
    expect(shape('variant')).toBe('diamond');
  });
});

describe('assignLanes',()=>{
  it('stacks overlapping spans greedily',()=>{
    expect(assignLanes([])).toEqual({lanes:[],count:0});
    expect(assignLanes([{start:1,end:1},{start:2,end:2},{start:3,end:3}])).toEqual({lanes:[0,0,0],count:1});
    expect(assignLanes([{start:5,end:9},{start:1,end:5},{start:6,end:6},{start:10,end:10}])).toEqual({lanes:[1,0,0,0],count:2});
    expect(assignLanes(Array.from({length:10},()=>({start:3,end:3}))).count).toBe(10);
  });
});

describe('variantsToAnnotations',()=>{
  // a: M K L - V R  (residues 1..5 at columns 1,2,3,5,6); b: M - L K V R
  const a=createAlignment([{id:'a',name:'A',sequence:'MKL-VR'},{id:'b',name:'B',sequence:'M-LKVR'}],{alphabet:'protein'});
  it('maps raw ungapped sequence positions across gaps by default',()=>{
    const {annotations,warnings}=variantsToAnnotations(a,[{rowId:'a',position:4,ref:'V',alt:'A'},{rowId:'b',hgvs:'p.Lys3Glu'}]);
    expect(warnings).toEqual([]);
    expect(annotations[0]).toMatchObject({id:'a:4:0',rowId:'a',start:5,end:5,mapping:'mapped',kind:'substitution',label:'variant 1'});
    expect(annotations[0].metadata?.variant).toEqual({ref:'V',alt:'A',type:'substitution',consequenceClass:'other'});
    expect(annotations[1]).toMatchObject({id:'b:p.Lys3Glu:1',rowId:'b',start:4,end:4,label:'p.Lys3Glu',consequence:['missense_variant']});
    expect(annotations[1].metadata?.variant).toEqual({ref:'K',alt:'E',type:'substitution',hgvs:'p.Lys3Glu',consequenceClass:'missense'});
  });
  it('maps alignment columns as given and spans ranges',()=>{
    const {annotations,warnings}=variantsToAnnotations(a,[{rowId:'a',position:5,end:6,type:'deletion'},{rowId:'a',hgvs:'p.Lys2_Leu3del'}],{coordinates:'alignment'});
    expect(warnings).toEqual([]);
    expect(annotations[0]).toMatchObject({start:5,end:6,kind:'deletion'});
    expect(annotations[0].metadata?.variant).toMatchObject({type:'deletion',consequenceClass:'inframe'});
    expect(annotations[1]).toMatchObject({start:2,end:3,mapping:'mapped'});
  });
  it('warns about a reference mismatch and still maps',()=>{
    const {annotations,warnings}=variantsToAnnotations(a,[{rowId:'a',hgvs:'p.Arg2Trp'}]);
    expect(annotations[0]).toMatchObject({start:2,mapping:'mapped'});
    expect(warnings).toHaveLength(1);expect(warnings[0]).toMatch(/reference R does not match K/);
    expect(variantsToAnnotations(a,[{rowId:'a',position:4,ref:'K'}],{coordinates:'alignment'}).warnings[0]).toMatch(/a gap/);
  });
  it('leaves unknown rows and out-of-range positions unmapped with warnings',()=>{
    const {annotations,warnings}=variantsToAnnotations(a,[{rowId:'zz',position:1},{rowId:'a',position:6},{rowId:'a',position:7},{rowId:'a'}]);
    expect(annotations.map(x=>x.mapping)).toEqual(['unmapped','unmapped','unmapped','unmapped']);
    expect(annotations[0].rowId).toBeUndefined();expect(annotations[0].metadata?.rowId).toBe('zz');
    expect(annotations[1].rowId).toBe('a');
    expect(warnings).toHaveLength(4);
    expect(variantsToAnnotations(a,[{rowId:'a',position:7}],{coordinates:'alignment'}).warnings[0]).toMatch(/outside the 6 alignment columns/);
    expect(variantsToAnnotations(a,[{rowId:'a',hgvs:'p.nonsense'}]).warnings[0]).toMatch(/could not parse/);
  });
  it('keeps IDs unique within a call and against existing annotations',()=>{
    const b=createAlignment([{id:'a',name:'A',sequence:'MKL'}],{alphabet:'protein'});b.annotations.push({id:'a:1:0',label:'x',mapping:'unmapped'});
    const {annotations,warnings}=variantsToAnnotations(b,[{rowId:'a',position:1},{id:'v',rowId:'a',position:2},{id:'v',rowId:'a',position:3}]);
    expect(annotations.map(x=>x.id)).toEqual(['a:1:0:1','v','v:1']);expect(warnings[0]).toMatch(/duplicate ID/);
  });
  it('keeps explicit fields over HGVS and copies metadata, color and evidence',()=>{
    const [x]=variantsToAnnotations(a,[{rowId:'a',hgvs:'p.Lys2Ter',consequence:'splice_region_variant',label:'mine',color:'#112233',disease:true,metadata:{source:'test'}}]).annotations;
    expect(x).toMatchObject({label:'mine',consequence:['splice_region_variant'],color:'#112233',disease:true});
    expect(x.metadata).toMatchObject({source:'test',variant:{consequenceClass:'splice',hgvs:'p.Lys2Ter'}});
  });
});

it('fromPavi records metadata.variant through the shared mapping',()=>{
  const a=fromPavi('CLUSTAL W\n\nprot A-CG\nother ATCG\n',{prot:{embedded_variants:[{variant_id:'v1',alignment_start_pos:3,alignment_end_pos:3,seq_substitution_type:'point_mutation',hgvs_protein:'p.C2R',molecular_consequences:['missense_variant']},{variant_id:'v2',alignment_start_pos:9,alignment_end_pos:9,seq_substitution_type:'deletion'}]}});
  expect(a.annotations[0]).toMatchObject({id:`${a.rows[0].id}:v1:0`,kind:'point_mutation',start:3,end:3,mapping:'mapped',label:'p.C2R'});
  expect(a.annotations[0].metadata).toMatchObject({variant_id:'v1',sourceId:'prot',variant:{type:'substitution',hgvs:'p.C2R',ref:'C',alt:'R',consequenceClass:'missense'}});
  expect(a.annotations[1]).toMatchObject({mapping:'unmapped',kind:'deletion'});
  expect(a.annotations[1].metadata?.variant).toMatchObject({type:'deletion',consequenceClass:'inframe'});
});
