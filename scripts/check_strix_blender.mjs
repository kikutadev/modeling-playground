import { readFile } from 'node:fs/promises';
import { AnimationMixer, Box3, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { validateBytes } from 'gltf-validator';
import { bindAsset } from '../runtime/asset.mjs';
import { IKPose } from '../runtime/ik.mjs';
import { STRIX_LEGS, STRIX_SPEC } from '../models/strix-definition.mjs';
import { createStrix } from '../models/strix.mjs';
import { strixPose } from '../models/strix-motion.mjs';

const bytes = await readFile(new URL('../output/strix.glb', import.meta.url));
const validation = await validateBytes(new Uint8Array(bytes), { maxIssues: 50 });
if (validation.issues.numErrors) {
  throw new Error(JSON.stringify(validation.issues.messages, null, 2));
}

const gltf = await new GLTFLoader().parseAsync(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  '',
);
// Enforce the exact runtime contract used by the Viewer/TPS: hierarchy, local
// rest positions, identity rest rotations/scales, clip names/durations, and asset identity.
bindAsset(gltf.scene, gltf.animations, STRIX_SPEC);
const bones = [];
let skinnedMeshes = 0;
let triangles = 0;
gltf.scene.traverse((object) => {
  if (object.isBone) bones.push(object.name);
  if (!object.isMesh) return;
  const geometry = object.geometry;
  if (geometry.attributes.uv) {
    throw new Error(`${object.name}: STRIX uses no textures; unused UVs make Blender export non-deterministic`);
  }
  triangles += geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3;
  if (!object.isSkinnedMesh) return;
  skinnedMeshes += 1;
  const weights = geometry.attributes.skinWeight;
  if (!weights) throw new Error(`${object.name}: missing skinWeight`);
  for (let i = 0; i < weights.count; i += 1) {
    const values = [weights.getX(i), weights.getY(i), weights.getZ(i), weights.getW(i)];
    const sum = values.reduce((a, b) => a + b, 0);
    const strongest = Math.max(...values);
    if (Math.abs(sum - 1) > 1e-6 || strongest < 0.999999) {
      throw new Error(`${object.name}[${i}]: expected one rigid 100% bone weight, got ${values.join(',')}`);
    }
  }
});

const expectedBones = new Set([
  'Motion', 'Hull', 'Torso', 'Head',
  'LeftMainJet', 'LeftLiftJet', 'RightMainJet', 'RightLiftJet',
  ...STRIX_LEGS.flatMap((leg) => [`${leg.id}Upper`, `${leg.id}Lower`, `${leg.id}Foot`]),
  'LeftArm', 'LeftForearm', 'LeftHand', 'LeftCannon',
  'RightArm', 'RightForearm', 'RightHand', 'RightCannon',
]);
if (bones.length !== 28 || bones.some((name) => !expectedBones.has(name))) {
  throw new Error(`Unexpected bone contract: ${bones.join(', ')}`);
}
if (skinnedMeshes < 100) throw new Error(`Expected rigid skin meshes, got ${skinnedMeshes}`);

const clipDurations = new Map([['Idle', 2.4], ['Walk', 2.4], ['Advance', 2.4], ['Boost', 3.2]]);
const clips = new Map(gltf.animations.map((clip) => [clip.name, clip]));
for (const [name, duration] of clipDurations) {
  const clip = clips.get(name);
  if (!clip) throw new Error(`Missing animation clip: ${name}`);
  if (Math.abs(clip.duration - duration) > 0.002) {
    throw new Error(`${name}: duration ${clip.duration} != ${duration}`);
  }
}

const ik = IKPose.fromModel(gltf.scene);
if (!ik || ik.chains.length !== 4) {
  throw new Error('Four-leg IK metadata did not survive GLB export.');
}

// Protect visible authoring parity, not only the rig/motion contract. These are
// the parts that exposed primitive-conversion drift during the Blender port.
const normalizeName = (name) => name.replace(/[^A-Za-z0-9]/g, '');
const findPart = (root, name) => {
  const normalized = normalizeName(name);
  let match = null;
  root.traverse((object) => {
    if (object.isMesh && normalizeName(object.name) === normalized) match = object;
  });
  if (!match) throw new Error(`Missing visual parity part: ${name}`);
  return match;
};
const reference = createStrix().root;
reference.updateMatrixWorld(true);
gltf.scene.updateMatrixWorld(true);
for (const name of [
  'Armored chassis', 'Thorax keel', 'Spearhead helmet', 'Crown ridge',
  'Left elongated shield', 'Left shield face',
]) {
  const expectedBox = new Box3().setFromObject(findPart(reference, name));
  const actualBox = new Box3().setFromObject(findPart(gltf.scene, name));
  const expectedSize = expectedBox.getSize(new Vector3());
  const actualSize = actualBox.getSize(new Vector3());
  const expectedCenter = expectedBox.getCenter(new Vector3());
  const actualCenter = actualBox.getCenter(new Vector3());
  if (expectedSize.distanceTo(actualSize) > 2e-4 || expectedCenter.distanceTo(actualCenter) > 2e-4) {
    throw new Error(`${name}: Blender visual bounds drifted from Three.js reference`);
  }
}

// Cross-check the Blender-baked clips against the Three.js task-space reference.
// This is deliberately semantic rather than byte-for-byte so Blender remains the
// delivered authoring path while the existing motion math protects game behavior.
const mixer = new AnimationMixer(gltf.scene);
let maxFootError = 0;
let maxFootContext = null;
for (const [name, duration] of clipDurations) {
  mixer.stopAllAction();
  const action = mixer.clipAction(clips.get(name)).play();
  for (let i = 0; i <= Math.round(duration * 30); i += 1) {
    const t = Math.min(duration, i / 30);
    action.time = t;
    mixer.update(0);
    gltf.scene.updateMatrixWorld(true);
    const expected = strixPose(name, t);
    for (const leg of STRIX_LEGS) {
      const foot = gltf.scene.getObjectByName(`${leg.id}Foot`);
      const error = foot.getWorldPosition(new Vector3()).distanceTo(expected.feet[leg.id].ankle);
      if (error > maxFootError) { maxFootError = error; maxFootContext = `${name}/${t.toFixed(3)}/${leg.id}`; }
      if (error > 0.002) {
        throw new Error(`${name}/${t.toFixed(3)}/${leg.id}: Blender foot error ${error.toFixed(6)} m`);
      }
    }
  }
}

mixer.stopAllAction();
gltf.scene.updateMatrixWorld(true);
const bounds = new Box3().setFromObject(gltf.scene);
const dimensions = bounds.getSize(new Vector3());
console.log(
  `STRIX Blender GLB verified: ${(bytes.byteLength / 1024).toFixed(0)} KiB, ` +
  `${triangles.toFixed(0)} triangles, ${dimensions.toArray().map((v) => v.toFixed(2)).join(' × ')} m, ` +
  `${bones.length} bones, ${skinnedMeshes} skinned meshes, max foot error ${(maxFootError * 1000).toFixed(2)} mm (${maxFootContext}), ` +
  `${gltf.animations.map((clip) => clip.name).join(', ')}`,
);
