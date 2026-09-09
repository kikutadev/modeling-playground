import {test,expect} from '@playwright/test';

test.use({headless:true,viewport:{width:1280,height:720}});
const read=async page=>page.evaluate(()=>globalThis.__threadlineReadState());

test('wall WEB input kicks first, then attaches after clearing the facade',async({page},testInfo)=>{
  test.setTimeout(90_000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/web-run.html?e2e=1');
  await page.waitForFunction(()=>globalThis.__threadlineE2E?.placeForWallKick);
  await page.getByRole('button',{name:'屋上から飛び出す ↗'}).click();
  await page.evaluate(()=>globalThis.__threadlineE2E.placeForWallKick());

  // Contact alone must NOT jump.
  await page.waitForFunction(()=>globalThis.__threadlineReadState().wall,{timeout:25_000});
  const contact=await read(page);
  expect(contact.wallJumpTime).toBeLessThan(0);
  expect(contact.attached).toBe(false);

  // Holding WEB on the wall starts a kick; the web appears only after a short clear-air beat.
  await page.keyboard.down('Space');
  await page.waitForFunction(()=>globalThis.__threadlineReadState().wallJumpTime>=0,{timeout:20_000});
  const kicked=await read(page);
  expect(kicked.attached).toBe(false);
  expect(kicked.pendingWallWeb).toBe(true);
  const kickTime=kicked.wallJumpTime;

  await page.waitForFunction(t=>{
    const s=globalThis.__threadlineReadState();return s.attached&&s.time>t+.10;
  },kickTime,{timeout:25_000});
  const attached=await read(page);
  expect(attached.wall).toBe(false);
  expect(attached.attached).toBe(true);
  expect(attached.time-kickTime).toBeGreaterThan(.10);
  await page.screenshot({path:testInfo.outputPath('wall-kick-then-web.png'),fullPage:true});
  await page.keyboard.up('Space');
  expect(errors).toEqual([]);
});
