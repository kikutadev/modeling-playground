import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import validator from 'gltf-validator';
import { AnimationMixer, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const EXPECTED_CLIPS = [
  'Neutral', 'SwingReach', 'SwingTuck', 'WallRun', 'AerialAim', 'AirKick', 'Landing',
];

function worldPosition(scene, name) {
  const object = scene.getObjectByName(name);
  assert.ok(object, `Missing object/bone ${name}`);
  return object.getWorldPosition(new Vector3());
}

function skinnedCentroid(mesh) {
  const position = mesh.geometry.attributes.position;
  const centroid = new Vector3();
  for (let i = 0; i < position.count; i++) {
    centroid.add(mesh.getVertexPosition(i, new Vector3()).applyMatrix4(mesh.matrixWorld));
  }
  return centroid.divideScalar(position.count);
}

test('humanoid deformation study exports the web-shooter action range as a valid GLB', async () => {
  const bytes = await readFile(new URL('../output/humanoid-deform-study.glb', import.meta.url));
  const report = await validator.validateBytes(new Uint8Array(bytes), {
    uri: 'humanoid-deform-study.glb', maxIssues: 50,
  });
  assert.equal(report.issues.numErrors, 0, JSON.stringify(report.issues));

  const asset = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '',
  );
  const clipNames = asset.animations.map(clip => clip.name).sort();
  assert.deepEqual(clipNames, [...EXPECTED_CLIPS].sort());

  const requiredBones = [
    'Root', 'Hips', 'Spine', 'Chest', 'Neck', 'Head',
    'LeftClavicle', 'LeftUpperArm', 'LeftForearm', 'LeftHand',
    'RightClavicle', 'RightUpperArm', 'RightForearm', 'RightHand',
    'LeftThigh', 'LeftShin', 'LeftFoot', 'LeftToe',
    'RightThigh', 'RightShin', 'RightFoot', 'RightToe',
  ];
  for (const name of requiredBones) assert.ok(asset.scene.getObjectByName(name), `Missing ${name}`);

  const skinned = [];
  asset.scene.traverse(object => { if (object.isSkinnedMesh) skinned.push(object); });
  assert.equal(skinned.length, 14);

  const mixer = new AnimationMixer(asset.scene);
  const sampleClip = (name, normalizedTime = .72) => {
    mixer.stopAllAction();
    const clip = asset.animations.find(candidate => candidate.name === name);
    assert.ok(clip, `Missing clip ${name}`);
    const action = mixer.clipAction(clip).reset().play();
    action.time = clip.duration * normalizedTime;
    mixer.update(0);
    asset.scene.updateMatrixWorld(true);
    for (const mesh of skinned) mesh.skeleton.update();

    let lowest = Infinity;
    let highest = -Infinity;
    for (const mesh of skinned) {
      const position = mesh.geometry.attributes.position;
      for (let i = 0; i < position.count; i++) {
        const point = mesh.getVertexPosition(i, new Vector3()).applyMatrix4(mesh.matrixWorld);
        assert.ok(point.toArray().every(Number.isFinite), `${name}: non-finite skinned vertex`);
        lowest = Math.min(lowest, point.y);
        highest = Math.max(highest, point.y);
      }
    }
    assert.ok(highest - lowest < 4, `${name}: implausibly large deformation range`);
    return {
      leftHand: worldPosition(asset.scene, 'LeftHand'),
      rightHand: worldPosition(asset.scene, 'RightHand'),
      hips: worldPosition(asset.scene, 'Hips'),
      leftFoot: worldPosition(asset.scene, 'LeftFoot'),
      leftArmCentroid: skinnedCentroid(asset.scene.getObjectByName('ArmLeft')),
    };
  };

  const neutral = sampleClip('Neutral', .5);
  const reach = sampleClip('SwingReach');
  const tuck = sampleClip('SwingTuck');
  const landing = sampleClip('Landing');

  assert.ok(reach.leftHand.distanceTo(neutral.leftHand) > .20, 'SwingReach must materially move the anchor hand');
  assert.ok(reach.leftArmCentroid.distanceTo(neutral.leftArmCentroid) > .20, 'SwingReach must materially deform the skinned left arm, not only move its bones');
  assert.ok(tuck.leftFoot.distanceTo(neutral.leftFoot) > .15, 'SwingTuck must materially move the leg chain');
  assert.ok(landing.hips.distanceTo(neutral.hips) > .15, 'Landing must materially compress the pelvis');
});

test('humanoid study runtime contract exposes web and contact sockets', async () => {
  const contract = JSON.parse(await readFile(new URL('../output/humanoid-deform-study.asset.json', import.meta.url), 'utf8'));
  assert.equal(contract.id, 'humanoid-deform-study');
  assert.equal(contract.rig.profile, 'game-humanoid-v0');
  assert.deepEqual(contract.clips.map(clip => clip.name), EXPECTED_CLIPS);
  const sockets = new Set(contract.sockets.map(socket => socket.id));
  for (const id of ['web-left', 'web-right', 'aim', 'foot-left', 'foot-right', 'center-mass']) {
    assert.ok(sockets.has(id), `Missing socket ${id}`);
  }
});
