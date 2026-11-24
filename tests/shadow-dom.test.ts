// @vitest-environment jsdom
import {it,expect,vi} from 'vitest';
import {ThemedSelects} from '../src/selects';

function setup(){
  const host=document.createElement('div'),shadow=host.attachShadow({mode:'open'}),root=document.createElement('section');
  root.innerHTML='<label>Type <select aria-label="Sequence alphabet"><option value="protein">Protein</option><option value="dna">DNA</option><option value="rna">RNA</option></select></label><p>outside the menu</p>';
  shadow.append(root);document.body.append(host);const controls=new ThemedSelects(root);controls.sync();
  return {host,root,controls,select:root.querySelector('select')!,button:root.querySelector<HTMLButtonElement>('[role=combobox]')!};
}
const down=(target:EventTarget)=>target.dispatchEvent(new Event('pointerdown',{bubbles:true,composed:true}));

it('keeps a menu inside an open shadow root open while its option or trigger is pressed',()=>{
  const {host,root,controls,select,button}=setup();const changed=vi.fn();select.addEventListener('change',changed);
  try{
    button.click();const option=root.querySelectorAll<HTMLElement>('[role=option]')[1];
    down(option);expect(root.querySelector('[role=listbox]')).not.toBeNull();
    option.click();expect(select.value).toBe('dna');expect(changed).toHaveBeenCalledOnce();
    button.click();down(button);expect(button.getAttribute('aria-expanded')).toBe('true');
    button.click();expect(button.getAttribute('aria-expanded')).toBe('false');
  }finally{controls.destroy();host.remove();}
});
it('closes a menu inside a shadow root on a press elsewhere in the shadow tree or the page',()=>{
  const {host,root,controls,button}=setup();
  try{
    button.click();down(root.querySelector('p')!);expect(button.getAttribute('aria-expanded')).toBe('false');
    button.click();down(document.body);expect(button.getAttribute('aria-expanded')).toBe('false');
  }finally{controls.destroy();host.remove();}
});
