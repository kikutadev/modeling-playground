import {test,expect} from '@playwright/test';

test.use({headless:true,viewport:{width:1280,height:720}});
const magnitude=vector=>Math.hypot(...vector);
const state=page=>page.evaluate(()=>globalThis.__threadlineReadState());

async function startFrameSampler(page,key){
  await page.evaluate(key=>{
    const samples=[];
    globalThis[key]=samples;
    const flag=`${key}Active`;
    globalThis[flag]=true;
    const sample=()=>{
      if(!globalThis[flag])return;
      const s=globalThis.__threadlineReadState();
      samples.push({
        time:s.time,releaseTime:s.releaseTime,zipTime:s.zipTime,
        vy:s.velocity[1],speed:Math.hypot(...s.velocity),attached:s.attached,
      });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  },key);
}

async function stopFrameSampler(page,key){
  return page.evaluate(key=>{
    globalThis[`${key}Active`]=false;
    return globalThis[key]??[];
  },key);
}

test('production traversal keeps useful energy through swing, release and zip',async({page})=>{
  test.setTimeout(120_000);
  await page.goto('/web-run.html?e2e=1');
  await page.getByRole('button',{name:'屋上から飛び出す ↗'}).click();
  await page.keyboard.down('w');await page.keyboard.down('Space');

  await page.waitForFunction(()=>globalThis.__threadlineReadState().attached,{timeout:30_000});
  const attachedAt=(await state(page)).time;
  await page.waitForFunction(t=>globalThis.__threadlineReadState().time>t+.35,attachedAt,{timeout:30_000});
  const swinging=await state(page),swingSpeed=magnitude(swinging.velocity);
  expect(swingSpeed).toBeGreaterThan(24);
  expect(swingSpeed).toBeLessThanOrEqual(58.5);

  // Sample in-page so slow headless WebGL cannot hide the short upward release peak from Node.
  await startFrameSampler(page,'__threadlineReleaseSamples');
  await page.keyboard.up('Space');
  await page.waitForFunction(()=>!globalThis.__threadlineReadState().attached,{timeout:30_000});
  const releaseObserved=await state(page);
  expect(releaseObserved.releaseTime).toBeGreaterThanOrEqual(0);
  await page.waitForFunction(t=>globalThis.__threadlineReadState().time>t+.35,releaseObserved.releaseTime,{timeout:30_000});
  const releaseSamples=await stopFrameSampler(page,'__threadlineReleaseSamples');
  const releaseWindow=releaseSamples.filter(s=>!s.attached&&s.releaseTime>=0&&s.time-s.releaseTime>=0&&s.time-s.releaseTime<=.35+1/60);
  expect(releaseWindow.length).toBeGreaterThan(0);
  expect(Math.max(...releaseWindow.map(s=>s.vy))).toBeGreaterThan(4.5);
  expect(Math.max(...releaseWindow.map(s=>s.speed))).toBeGreaterThan(swingSpeed*.72);

  // Zip is also an impulse followed immediately by gravity; validate its short launch window the same way.
  const previousZip=(await state(page)).zipTime;
  await startFrameSampler(page,'__threadlineZipSamples');
  await page.keyboard.press('x');
  await page.waitForFunction(t=>globalThis.__threadlineReadState().zipTime>t,previousZip,{timeout:30_000});
  const zipObserved=await state(page);
  await page.waitForFunction(t=>globalThis.__threadlineReadState().time>t+.18,zipObserved.zipTime,{timeout:30_000});
  const zipSamples=await stopFrameSampler(page,'__threadlineZipSamples');
  const zipWindow=zipSamples.filter(s=>s.zipTime>previousZip&&s.time-s.zipTime>=0&&s.time-s.zipTime<=.18+1/60);
  expect(zipWindow.length).toBeGreaterThan(0);
  expect(Math.max(...zipWindow.map(s=>s.vy))).toBeGreaterThan(4.5);
  const zipPeakSpeed=Math.max(...zipWindow.map(s=>s.speed));
  expect(zipPeakSpeed).toBeGreaterThan(swingSpeed*.72*.78);
  expect(zipPeakSpeed).toBeLessThanOrEqual(58.5);
  await page.keyboard.up('w');
});