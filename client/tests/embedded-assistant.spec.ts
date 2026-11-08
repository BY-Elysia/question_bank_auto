import {test,expect} from '@playwright/test';
import sharp from 'sharp';
async function seed(page:any){
 const buffer=await sharp({create:{width:300,height:400,channels:3,background:'white'}}).png().toBuffer();
 const w=await(await page.request.post('/api/workspaces/images?title='+encodeURIComponent('内嵌助手验收'),{multipart:{images:{name:'p.png',mimeType:'image/png',buffer}}})).json();
 await page.goto('/#/workspace/'+w.id);await page.getByLabel('学科').fill('数学');await page.getByRole('button',{name:'开始提取',exact:true}).click();
 await page.getByRole('button',{name:'向助手提问'}).first().waitFor();return w.id;
}
test('Embedded assistant reads source, repairs via textbook workflow, persists diff, and undoes only that change',async({page})=>{
 const id=await seed(page);const before=await(await page.request.get('/api/textbooks/'+id)).json();
 await page.getByRole('button',{name:'向助手提问'}).first().click();
 await expect(page).toHaveURL(new RegExp('/workspace/'+id));
 const panel=page.getByLabel('教材助手面板');await expect(panel).toBeVisible();
 await panel.getByLabel('消息',{exact:true}).fill('核对这道题并引用来源');await panel.getByRole('button',{name:'发送',exact:true}).click();
 await panel.locator('.citation-links button').first().click();await page.getByRole('img',{name:'来源第 1 页原图'}).waitFor();await page.getByRole('button',{name:'在教材中定位此题'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('.content-card.selected')).toBeVisible();
 await panel.getByLabel('消息',{exact:true}).fill('根据原图修复这道题');await panel.getByRole('button',{name:'发送',exact:true}).click();
 await expect(panel.getByRole('button',{name:'撤销此次修改'})).toBeVisible();
 await panel.getByText('查看修改差异',{exact:true}).click();await expect(panel.locator('.change-diff')).toContainText('修复后的题干');
 await expect(page.locator('.content-card').first()).toContainText('修复后的题干');
 const after=await(await page.request.get('/api/textbooks/'+id)).json();expect(after.revision).toBe(before.revision+1);expect(after.changes[0].actor).toBe('assistant');
 await page.reload();await page.getByRole('button',{name:'向助手提问'}).first().click();
 await expect(panel.getByRole('button',{name:'撤销此次修改'})).toBeEnabled();
 await panel.getByRole('button',{name:'撤销此次修改'}).click();await expect(panel.locator('.change-card')).toContainText('已撤销');
 const undone=await(await page.request.get('/api/textbooks/'+id)).json();expect(undone.document.contents).toEqual(before.document.contents);
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await expect(panel.getByRole('button',{name:'收起助手'})).toBeVisible();
 await page.request.delete('/api/workspaces/'+id);
});
test('Embedded answer generation reuses candidates, commits AI provenance and refreshes the selected question',async({page})=>{
 const id=await seed(page);await page.getByRole('button',{name:'向助手提问'}).first().click();
 const panel=page.getByLabel('教材助手面板');await panel.getByLabel('消息',{exact:true}).fill('补全这道题缺失的答案');await panel.getByRole('button',{name:'发送',exact:true}).click();
 await expect(panel.getByRole('button',{name:'撤销此次修改'})).toBeVisible();
 const book=await(await page.request.get('/api/textbooks/'+id)).json();const answer=book.document.contents.find((c:any)=>c.question).question.answer;
 expect(answer.origin).toBe('ai_generated');expect(answer.review).toBe('accepted');expect(answer.text).toBe('11');
 await page.request.delete('/api/workspaces/'+id);
});
