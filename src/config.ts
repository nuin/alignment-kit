import type { ViewerOptions, ViewerVisibility } from './types';
import { defaultVisibility } from './visibility';
import { validateFastaOptions } from './export';
import { validateTracks } from './tracks';
import { validateAnnotationLinks } from './tooltip';

/** JSON-safe viewer configuration; alignment data is supplied separately. */
export type ViewerConfig = Omit<ViewerOptions, 'alignment'|'workerUrl'> & {workerUrl?:string};
const ranges:Record<string,[number,number]>={height:[360,2000],cellWidth:[3,32],rowHeight:[18,48],labelWidth:[100,420],consensusThreshold:[0,1],treeWidth:[0,400]};
const enums:Record<string,string[]>={logoMode:['frequency','bits'],theme:['light','dark'],colorMode:['all','reference-differences','reference-matches','consensus-differences','consensus-matches'],statisticsScope:['all','filtered'],matchDisplay:['letter','dot'],rulerCoordinates:['alignment','reference']};
const bools=new Set(['worker','urlSync','showLogo','showInspector','showToolbar','hideAllGapColumns','dragToPan','tooltips']);
const object=(value:unknown):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);

/** Parse and validate JSON or an already-parsed object without modifying the input. */
export function parseViewerConfig(input:string|unknown):ViewerConfig {
  let value:unknown=input;
  if(typeof input==='string')try{value=JSON.parse(input);}catch{throw new Error('Invalid viewer configuration JSON.');}
  if(!object(value))throw new Error('Viewer configuration must be an object.');
  const result:Record<string,unknown>={};
  for(const [key,item] of Object.entries(value)) {
    if(key==='visibility'){
      if(!object(item))throw new Error('visibility must be an object.');
      const visibility:ViewerVisibility={};
      for(const [name,enabled] of Object.entries(item)){
        if(!Object.hasOwn(defaultVisibility,name)||typeof enabled!=='boolean')throw new Error(`Invalid visibility.${name}; use a known boolean visibility option.`);
        visibility[name as keyof ViewerVisibility]=enabled;
      }
      result.visibility=visibility;continue;
    }
    if(key==='fasta'){result.fasta=validateFastaOptions(item);continue;}
    if(key==='annotationLinks'){result.annotationLinks=validateAnnotationLinks(item);continue;}
    if(key==='tracks'){result.tracks=validateTracks(item,true);continue;}
    if(key==='conservationWindow'){if(typeof item!=='number'||!Number.isInteger(item)||item<1||item>51||item%2===0)throw new Error('conservationWindow must be an odd integer between 1 and 51.');result.conservationWindow=item;continue;}
    if(key==='hideGapColumns'){if(item!==null&&(typeof item!=='number'||!(item>=0&&item<=1)))throw new Error('hideGapColumns must be null or a number between 0 and 1.');result.hideGapColumns=item;continue;}
    if(key==='$schema'){if(typeof item!=='string')throw new Error('$schema must be a string.');continue;}
    if(Object.hasOwn(ranges,key)){const [min,max]=ranges[key];if(typeof item!=='number'||!Number.isFinite(item)||item<min||item>max)throw new Error(`${key} must be a number between ${min} and ${max}.`);}
    else if(Object.hasOwn(enums,key)){if(typeof item!=='string'||!enums[key].includes(item))throw new Error(`Invalid ${key}.`);}
    else if(bools.has(key)){if(typeof item!=='boolean')throw new Error(`${key} must be a boolean.`);}
    else if(key==='colorScheme'||key==='workerUrl'||key==='groupBy'){if(typeof item!=='string'||!item.length)throw new Error(`${key} must be a non-empty string.`);}
    else throw new Error(`Unknown viewer configuration option: ${key}.`);
    result[key]=item;
  }
  return result as ViewerConfig;
}
