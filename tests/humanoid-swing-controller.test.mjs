import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { AnimationMixer, Group, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HumanoidSwingController } from '../runtime/humanoid-swing-controller.mjs';

async function loadStudyAsset() {
  const bytes = await readFile(new URL('../output/humanoid-deform-study.glb', import.meta.url));
  return new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  );
}

test('runtime swing traverses an arc, tucks at speed and keeps the anchor arm aligned', async () => {
  const asset = await loadStudyAsset();
  const motionRoot = new Group();
  motionRoot.add(asset.scene);
  const mixer = new AnimationMixer(asset.scene);
  const controller = new HumanoidSwingController({
    root: asset.scene,
    motionRoot,
    mixer,
    clips: asset.animations,
  });
  controller.activate();

  let minX = Infinity;
  let maxX = -Infinity;
  let maxSpeed = 0;
  let maxBlend = 0;
  let minArmAlignment = 1;

  for (let frame = 0; frame < 360; frame += 1) {
    const snapshot = controller.step(1 / 60);
    for (const value of [
      snapshot.bodyPosition.x, snapshot.bodyPosition.y,
      snapshot.velocity.x, snapshot.velocity.y,
      snapshot.speed, snapshot.tuckBlend,
    ]) assert.ok(Number.isFinite(value), `non-finite swing value at frame ${frame}`);

    minX = Math.min(minX, snapshot.bodyPosition.x);
    maxX = Math.max(maxX, snapshot.bodyPosition.x);
    maxSpeed = Math.max(maxSpeed, snapshot.speed);
    maxBlend = Math.max(maxBlend, snapshot.tuckBlend);

    const shoulder = asset.scene.getObjectByName('LeftUpperArm').getWorldPosition(new Vector3());
    const hand = asset.scene.getObjectByName('LeftHand').getWorldPosition(new Vector3());
    const armDirection = hand.sub(shoulder).normalize();
    const anchorDirection = snapshot.anchor.clone().sub(shoulder).normalize();
    minArmAlignment = Math.min(minArmAlignment, armDirection.dot(anchorDirection));
  }

  assert.ok(maxX - minX > 3.5, `swing arc is too small: ${maxX - minX}`);
  assert.ok(maxSpeed > 4.0, `swing never develops readable speed: ${maxSpeed}`);
  assert.ok(maxBlend > 0.85, `Tuck blend never becomes visually dominant: ${maxBlend}`);
  assert.ok(minArmAlignment > 0.94, `runtime IK loses the web direction: ${minArmAlignment}`);
});

test('moving the web anchor preserves body position and tangential momentum', async () => {
  const asset = await loadStudyAsset();
  const motionRoot = new Group();
  motionRoot.add(asset.scene);
  const controller = new HumanoidSwingController({
    root: asset.scene,
    motionRoot,
    mixer: new AnimationMixer(asset.scene),
    clips: asset.animations,
  });
  controller.activate();
  for (let frame = 0; frame < 90; frame += 1) controller.step(1 / 60);

  const before = controller.snapshot();
  controller.moveAnchor(0.55);
  const after = controller.step(0);

  assert.ok(after.anchor.x > before.anchor.x, 'anchor did not move');
  assert.ok(after.bodyPosition.distanceTo(before.bodyPosition) < 1e-4, 'reattach teleported the body');
  assert.ok(after.velocity.distanceTo(before.velocity) < 0.35, 'reattach discarded too much tangential momentum');
  assert.ok(after.ropeLength >= 2.35 && after.ropeLength <= 3.75, 'rope length escaped supported range');
});


test('procedural swing pose stays bounded across repeated cycles', async () => {
  const asset = await loadStudyAsset();
  const motionRoot = new Group();
  motionRoot.add(asset.scene);
  const controller = new HumanoidSwingController({
    root: asset.scene,
    motionRoot,
    mixer: new AnimationMixer(asset.scene),
    clips: asset.animations,
  });
  controller.activate();

  let maxBlend = 0;
  let maxLean = 0;
  let maxHandRadius = 0;
  let maxFootRadius = 0;
  for (let frame = 0; frame < 1800; frame += 1) {
    const snapshot = controller.step(1 / 60);
    maxBlend = Math.max(maxBlend, snapshot.tuckBlend);
    maxLean = Math.max(maxLean, Math.abs(snapshot.bodyLean));
    const hips = asset.scene.getObjectByName('Hips').getWorldPosition(new Vector3());
    const freeHand = asset.scene.getObjectByName('RightHand').getWorldPosition(new Vector3());
    const leftFoot = asset.scene.getObjectByName('LeftFoot').getWorldPosition(new Vector3());
    const rightFoot = asset.scene.getObjectByName('RightFoot').getWorldPosition(new Vector3());
    maxHandRadius = Math.max(maxHandRadius, hips.distanceTo(freeHand));
    maxFootRadius = Math.max(maxFootRadius, hips.distanceTo(leftFoot), hips.distanceTo(rightFoot));
  }

  assert.ok(maxBlend > 0.80 && maxBlend <= 0.90, `unexpected Tuck range: ${maxBlend}`);
  assert.ok(maxLean <= 0.37, `body lean accumulated or exceeded its visual limit: ${maxLean}`);
  assert.ok(maxHandRadius < 1.35, `free arm drifted away from the body: ${maxHandRadius}`);
  assert.ok(maxFootRadius < 1.45, `leg pose accumulated across cycles: ${maxFootRadius}`);
});
