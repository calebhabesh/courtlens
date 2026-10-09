import { expect, test } from '@playwright/test';
test('empty drawer composer hit target', async ({page}) => {
 await page.setViewportSize({width:375,height:812});
 await page.route('**/api/assistant-v2/threads**', r => r.fulfill({json:{threads:[],next_cursor:null}}));
 await page.goto('/players/23?season=2025-26');
 await page.getByRole('button',{name:'Ask',exact:true}).click();
 const dialog=page.getByRole('dialog');
 const input=dialog.getByLabel('Your question',{exact:true});
 await input.fill('Probe');
 const send=dialog.getByRole('button',{name:'Send question',exact:true});
 console.log(JSON.stringify(await send.evaluate(el => {
 const box=el.getBoundingClientRect();const at=document.elementFromPoint(box.x+box.width/2,box.y+box.height/2);
 return {button:box.toJSON(),at:at?.outerHTML,parents:Array.from(document.querySelectorAll('.conversation-dialog,.ask-main,.ask-scroll,.ask-column,.ask-empty')).map(e=>({class:e.className,box:e.getBoundingClientRect().toJSON(),scroll:e.scrollHeight}))};
 })));
 await expect(send).toBeEnabled();
 await send.click({trial:true,timeout:2000});
});
