import {test,expect} from '@playwright/test';

// iPhone-sized acceptance is permanently headless; software rendering is supplied by the QA command.
test.use({
  headless:true,
  viewport:{width:390,height:844},
  hasTouch:true,
  isMobile:true,
  deviceScaleFactor:2,
  userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
});

const readState=async page=>{await page.waitForFunction(()=>typeof globalThis.__threadlineReadState==='function',null,{timeout:10_000});return page.evaluate(()=>globalThis.__threadlineReadState());};
async function waitForFrame(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>resolve())));}
async function drag(page,selector,from,to,steps=6){
  const box=await page.locator(selector).boundingBox();
  if(!box)throw new Error(`${selector} has no bounding box`);
  const start={x:box.x+box.width*from.x,y:box.y+box.height*from.y};
  const end={x:box.x+box.width*to.x,y:box.y+box.height*to.y};
  await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps});await page.mouse.up();
}

test('portrait traversal is two-thumb first and keeps contextual actions out of the way',async({page},testInfo)=>{
  test.setTimeout(90_000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/web-run.html?e2e=1');
  await expect(page.locator('html')).toHaveClass(/touch-input/);
  await expect(page.locator('#mobile-controls')).toBeVisible();
  await expect(page.locator('#help')).toBeHidden();
  await expect(page.locator('#speed')).toBeHidden();
  await expect(page.locator('#reticle')).toBeHidden();
  await expect(page.locator('#mobile-context')).toBeHidden();
  await expect(page.locator('#mobile-dodge')).toBeHidden();
  await page.getByRole('button',{name:'屋上から飛び出す ↗'}).tap();
  await expect(page.locator('#overlay')).toBeHidden();

  // Mobile focus changes must never interrupt active traversal with an automatic pause overlay.
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  expect((await readState(page)).paused).toBe(false);
  await expect(page.locator('#overlay')).toBeHidden();

  // Left thumb expresses travel intent; the stick returns to neutral when released.
  const stick=page.locator('#move-stick'),stickBox=await stick.boundingBox();
  if(!stickBox)throw new Error('move stick missing');
  const x=stickBox.x+stickBox.width/2,y=stickBox.y+stickBox.height*.55;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+28,y-42,{steps:4});
  await expect(stick).toHaveClass(/is-held/);
  await page.mouse.up();await expect(stick).not.toHaveClass(/is-held/);

  // Right thumb holds WEB. Verify the physics state directly because SwiftShader can render DOM frames slowly.
  const web=page.locator('#mobile-web'),webBox=await web.boundingBox();
  if(!webBox)throw new Error('web button missing');
  await page.mouse.move(webBox.x+webBox.width/2,webBox.y+webBox.height/2);await page.mouse.down();
  await expect(web).toHaveAttribute('aria-pressed','true');
  await expect.poll(async()=>Number((await readState(page)).attached),{timeout:20_000}).toBe(1);
  const attachedAt=(await readState(page)).time;
  await expect.poll(async()=>Number((await readState(page)).time>attachedAt+.28),{timeout:20_000}).toBe(1);
  await page.mouse.up();
  await expect(web).toHaveAttribute('aria-pressed','false');
  await expect.poll(async()=>Number((await readState(page)).attached),{timeout:20_000}).toBe(0);
  const releaseStarted=await readState(page);
  await expect.poll(async()=>Number((await readState(page)).time>releaseStarted.time+.18),{timeout:30_000}).toBe(1);
  const released=await readState(page);
  expect(released.velocity[1]).toBeGreaterThan(2);

  // Free flight exposes one contextual bridge action without adding another permanent button.
  await waitForFrame(page);
  await expect(page.locator('#mobile-context')).toBeVisible({timeout:20_000});
  await expect(page.locator('#mobile-context')).toHaveText('ZIP');
  const previousZip=released.zipTime;
  await page.locator('#mobile-context').tap();
  await expect.poll(async()=>Number((await readState(page)).zipTime>previousZip),{timeout:20_000}).toBe(1);

  // Camera drag remains optional and must not accidentally attach another web.
  await drag(page,'#mobile-look-zone',{x:.72,y:.38},{x:.42,y:.52});
  expect((await readState(page)).attached).toBe(false);

  // Old always-on utility/combat button clusters are intentionally gone.
  await expect(page.locator('#mobile-reel')).toHaveCount(0);
  await expect(page.locator('#mobile-dive')).toHaveCount(0);
  await expect(page.locator('#mobile-shot')).toHaveCount(0);
  await expect(page.locator('#mobile-kick')).toHaveCount(0);

  // Persistent controls remain entirely inside the portrait viewport.
  for(const selector of ['#move-stick','#mobile-web','#pause']){
    const box=await page.locator(selector).boundingBox();
    expect(box,selector).not.toBeNull();
    expect(box.x,selector).toBeGreaterThanOrEqual(0);expect(box.y,selector).toBeGreaterThanOrEqual(0);
    expect(box.x+box.width,selector).toBeLessThanOrEqual(390.5);expect(box.y+box.height,selector).toBeLessThanOrEqual(844.5);
  }

  await waitForFrame(page);
  await page.screenshot({path:testInfo.outputPath('portrait-traversal.png'),fullPage:true});
  expect(errors).toEqual([]);
});
