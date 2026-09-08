import {test,expect} from '@playwright/test';

test.use({headless:true,viewport:{width:1280,height:720}});
const magnitude=vector=>Math.hypot(...vector);
const state=page=>page.evaluate(()=>globalThis.__threadlineReadState());

test('production traversal keeps useful energy through swing, release and zip',async({page})=>{
  test.setTimeout(60_000);
  await page.goto('/web-run.html?e2e=1');
  await page.getByRole('button',{name:'屋上から飛び出す ↗'}).click();
  await page.keyboard.down('w');await page.keyboard.down('Space');

  await expect.poll(async()=>Number((await state(page)).attached),{timeout:20_000}).toBe(1);
  const attachedAt=(await state(page)).time;
  await expect.poll(async()=>Number((await state(page)).time>attachedAt+.35),{timeout:20_000}).toBe(1);
  const swinging=await state(page),swingSpeed=magnitude(swinging.velocity);
  expect(swingSpeed).toBeGreaterThan(24);
  expect(swingSpeed).toBeLessThanOrEqual(58.5);

  await page.keyboard.up('Space');
  await expect.poll(async()=>Number((await state(page)).attached),{timeout:20_000}).toBe(0);
  const released=await state(page),releaseSpeed=magnitude(released.velocity);
  expect(released.velocity[1]).toBeGreaterThan(4.5);
  expect(releaseSpeed).toBeGreaterThan(swingSpeed*.72);

  const previousZip=released.zipTime;
  await page.keyboard.press('x');
  await expect.poll(async()=>Number((await state(page)).zipTime>previousZip),{timeout:20_000}).toBe(1);
  const zipped=await state(page),zipSpeed=magnitude(zipped.velocity);
  expect(zipped.velocity[1]).toBeGreaterThan(4.5);
  expect(zipSpeed).toBeGreaterThan(releaseSpeed*.78);
  expect(zipSpeed).toBeLessThanOrEqual(58.5);
  await page.keyboard.up('w');
});
