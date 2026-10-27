// @vitest-environment jsdom
import {it,expect,vi} from 'vitest';
import {ThemedSelects} from '../src/selects';

function setup(){
  const root=document.createElement('section');root.dataset.theme='dark';
  root.innerHTML='<label>Type <select aria-label="Sequence alphabet"><option value="protein">Protein</option><option value="dna">DNA</option><option value="rna">RNA</option></select></label>';
  document.body.append(root);const controls=new ThemedSelects(root);controls.sync();
  return {root,controls,select:root.querySelector('select')!,button:root.querySelector<HTMLButtonElement>('[role=combobox]')!};
}
it('uses an in-viewer menu and commits one keyboard selection while Escape cancels',()=>{
  const {root,controls,select,button}=setup();const changed=vi.fn();select.addEventListener('change',changed);
  try{
    expect(select.hidden).toBe(true);button.click();expect(root.querySelector('[role=listbox]')).not.toBeNull();
    button.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
    button.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    expect(select.value).toBe('dna');expect(button.textContent).toBe('DNA');expect(changed).toHaveBeenCalledOnce();
    button.click();button.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));button.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    expect(select.value).toBe('dna');expect(root.querySelector('[role=listbox]')).toBeNull();
    select.value='rna';controls.sync();expect(button.textContent).toBe('RNA');
  }finally{controls.destroy();root.remove();}
});
it('selects by pointer, closes on outside interaction and disposes detached controls',()=>{
  const {root,controls,select,button}=setup();
  try{
    button.click();(root.querySelectorAll<HTMLElement>('[role=option]')[2]).click();expect(select.value).toBe('rna');
    button.click();document.body.dispatchEvent(new Event('pointerdown',{bubbles:true}));expect(button.getAttribute('aria-expanded')).toBe('false');
    button.click();root.querySelector('label')!.remove();controls.sync();expect(root.querySelector('[role=listbox]')).toBeNull();
  }finally{controls.destroy();root.remove();}
});
it('supports typeahead and reflects a control reset after its change handler',()=>{
  const {root,controls,select,button}=setup();
  try{
    button.dispatchEvent(new KeyboardEvent('keydown',{key:'r',bubbles:true}));
    button.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));expect(select.value).toBe('rna');
    select.addEventListener('change',()=>{select.value='protein';});
    button.click();(root.querySelectorAll<HTMLElement>('[role=option]')[1]).click();expect(button.textContent).toBe('Protein');
    button.click();button.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true}));expect(button.getAttribute('aria-expanded')).toBe('false');
  }finally{controls.destroy();root.remove();}
});
