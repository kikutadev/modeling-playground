import {test,expect} from '@playwright/test';

test.use({headless:true,viewport:{width:1280,height:720}});
const read=async page=>page.evaluate(()=>globalThis.__threadlineReadState?.());

test('wall contact auto-kick keeps forward momentum and clears the facade',async({page},testInfo)=>{
  test.setTimeout(90_000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/web-run.html?e2e=1');
  await page.waitForFunction(()=>typeof globalThis.__threadlineReadState==='function'&&globalThis.__threadlineE2E?.placeForWallKick,null,{timeout:20_000});
  await page.getByRole('button',{name:'屋上から飛び出す ↗'}).click();
  await page.evaluate(()=>globalThis.__threadlineE2E.placeForWallKick());
  await page.keyboard.down('KeyW');
  await expect.poll(async()=>Number((await read(page)).wallJumpTime>-1),{timeout:25_000,intervals:[100,250,500]}).toBe(1);
  const kicked=await read(page);
  const kickTime=kicked.time,kickPos=kicked.position;
  const horizontal=Math.hypot(kicked.velocity[0],kicked.velocity[2]);
  const forwardDot=(-kicked.velocity[2])/Math.max(horizontal,1e-6);
  expect(horizontal).toBeGreaterThanOrEqual(33);
  expect(forwardDot).toBeGreaterThan(.93);
  expect(Math.abs(kicked.wallJumpFacing[0])).toBeLessThan(.36);
  await expect.poll(async()=>Number((await read(page)).time>kickTime+.6),{timeout:35_000,intervals:[100,250,500]}).toBe(1);
  await page.keyboard.up('KeyW');
  const after=await read(page);
  expect(after.wall).toBe(false);
  expect(after.grounded).toBe(false);
  expect(after.position[2]).toBeLessThan(kickPos[2]-12);
  expect(Math.abs(after.position[0]-kickPos[0])).toBeLessThan(12);
  await page.screenshot({path:testInfo.outputPath('wall-kick-after-06.png'),fullPage:true});
  expect(errors).toEqual([]);
});
