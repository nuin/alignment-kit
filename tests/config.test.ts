import {it,expect} from 'vitest';
import {parseViewerConfig} from '../src/config';
it('parses a JSON configuration with presentation options and independent visibility flags',()=>{
  const config=parseViewerConfig('{"height":650,"theme":"dark","colorScheme":"nucleotide-gc","worker":false,"visibility":{"overview":false,"rowSelection":false,"logo":true}}');
  expect(config).toEqual({height:650,theme:'dark',colorScheme:'nucleotide-gc',worker:false,visibility:{overview:false,rowSelection:false,logo:true}});
});
it('rejects invalid JSON, unknown fields and invalid option values with helpful locations',()=>{
  expect(()=>parseViewerConfig('{')).toThrow(/JSON/);
  expect(()=>parseViewerConfig('{"visibility":{"overvew":false}}')).toThrow(/visibility\.overvew/);
  expect(()=>parseViewerConfig('{"visibility":{"overview":"false"}}')).toThrow(/visibility\.overview/);
  expect(()=>parseViewerConfig('{"height":-1}')).toThrow(/height/);
  expect(()=>parseViewerConfig('{"theme":"midnight"}')).toThrow(/theme/);
  expect(()=>parseViewerConfig('{"alignment":{}}')).toThrow(/alignment/);
  expect(()=>parseViewerConfig('null')).toThrow(/object/);
});
