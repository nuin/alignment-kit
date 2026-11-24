import {it,expect} from 'vitest';
// @ts-expect-error jsdom ships no type declarations
import {JSDOM} from 'jsdom';
import {readFileSync} from 'node:fs';
import {buildTemplate,PAYLOAD_PLACEHOLDER} from '../scripts/package-tools.mjs';
import {createAlignment,toJson,fillTemplate,fromJson,escapeJson,WIRE_PLACEHOLDER} from '../src/index';
// A stand-in bundle that records what the boot script passes to mountWire.
const stub=`window.MsaCanvas={mountWire:function(el,text,handlers,defaults){window.got={el:el.id,text:text,defaults:defaults,handlers:handlers};return {viewer:{setSelection:function(v){window.selected=v;}},setState:function(v){window.stated=v;return Promise.resolve();}};}};var s="</script><p id=leak>";`;
const page=()=>buildTemplate(stub,'.ak-viewer{color:red}','9.9.9') as string;
it('uses the same placeholder as the wire module, exactly once',()=>{
  expect(PAYLOAD_PLACEHOLDER).toBe(WIRE_PLACEHOLDER);const html=page();expect(html.split(WIRE_PLACEHOLDER)).toHaveLength(2);
  expect(html).toContain(`<script type="application/json" id="msa-payload">${WIRE_PLACEHOLDER}</script>`);expect(html).toContain('<meta name="generator" content="msa-canvas 9.9.9, wire format 1">');
  expect(readFileSync('scripts/build.mjs','utf8')).toContain("writeFile('dist/template.html',buildTemplate(");
});
it('refuses bundle or CSS text that would end its element early or repeat the placeholder',()=>{
  expect(()=>buildTemplate('a<!--b','','1')).toThrow('<!--');expect(()=>buildTemplate('','a{}</style>','1')).toThrow('</style');expect(()=>buildTemplate(`var x="${PAYLOAD_PLACEHOLDER}"`,'','1')).toThrow('exactly once');
});
it('hands a payload with </script> and <!-- to the bundle unchanged, as parsed by an HTML parser',()=>{
  const hostile=createAlignment([{name:'</script><img src=x onerror=alert(1)>',sequence:'ACGT',metadata:{note:'<!--<script>'}},{name:'b</SCRIPT\n>',sequence:'AC-T'}],{name:'<!-- x -->'}),doc=toJson(hostile,{config:{height:500}});
  const dom=new JSDOM(fillTemplate(page(),doc),{runScripts:'dangerously'}),{window}=dom,got=(window as any).got;
  expect(window.document.getElementById('leak')).toBeNull();expect(window.document.querySelector('img')).toBeNull();expect(window.document.querySelectorAll('script')).toHaveLength(3);expect(window.document.getElementById('msa-error')).toBeNull();
  expect(got.el).toBe('msa');expect(JSON.parse(got.text)).toEqual(JSON.parse(JSON.stringify(doc)));expect(fromJson(got.text).alignment.rows.map(r=>r.name)).toEqual(hostile.rows.map(r=>r.name));
  expect(got.defaults.height).toBeGreaterThanOrEqual(360);expect(got.defaults.height).toBeLessThanOrEqual(2000);
  got.handlers.onReady({id:'i',name:'<!-- x -->',rows:[1,2],width:4});expect(window.document.title).toBe('<!-- x -->');
});
it('shows a load error in the page and ignores messages that do not come from the parent frame',()=>{
  const dom=new JSDOM(fillTemplate(buildTemplate('window.MsaCanvas={mountWire:function(){throw new Error("Invalid msa-canvas document: boom <b>");}};','','1'),toJson(createAlignment([{name:'a',sequence:'AC'}]))),{runScripts:'dangerously'});
  const box=dom.window.document.getElementById('msa-error')!;expect(box.getAttribute('role')).toBe('alert');expect(box.textContent).toBe('Invalid msa-canvas document: boom <b>');expect(box.children).toHaveLength(0);
  const ok=new JSDOM(fillTemplate(page(),toJson(createAlignment([{name:'a',sequence:'AC'}]))),{runScripts:'dangerously'}),w=ok.window as any;
  w.dispatchEvent(new w.MessageEvent('message',{data:{target:'msa-canvas',type:'selection',value:{start:1,end:2}},source:null}));expect(w.selected).toBeUndefined();
  w.dispatchEvent(new w.MessageEvent('message',{data:{target:'msa-canvas',type:'selection',value:{start:1,end:2}},source:w.parent}));expect(w.selected).toEqual({start:1,end:2});
  w.dispatchEvent(new w.MessageEvent('message',{data:{target:'other',type:'state',value:{}},source:w.parent}));expect(w.stated).toBeUndefined();
  w.dispatchEvent(new w.MessageEvent('message',{data:{target:'msa-canvas',type:'state',value:{version:1}},source:w.parent}));expect(w.stated).toEqual({version:1});
});
it('states the escape rule in the wire format page with the characters escapeJson writes',()=>{
  const doc=readFileSync('docs/reference/wire-format.md','utf8'),out=escapeJson('<');expect(out).toBe('\\u003c');expect(out).toHaveLength(6);
  expect(doc).toContain(`| \`escapeJson(json)\` | Replaces every \`<\` with the six characters \`${out}\`.`);expect(doc).toContain(`replace every \`<\` with the six characters \`${out}\``);expect(doc).toContain(`where \`${out}\` means the same character`);
  expect(doc).not.toMatch(/with (the six characters )?`<`/);expect(JSON.parse(escapeJson(JSON.stringify('</script><!--')))).toBe('</script><!--');
});
