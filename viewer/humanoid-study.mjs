import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import modelUrl from '../output/humanoid-deform-study.glb?url';
import { AnimationPlayer, animationBounds } from './animation.mjs';
import { frameModel } from './model.mjs';

const $ = id => document.getElementById(id);
const viewport = $('viewport');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#ecece5');

const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.setAttribute('aria-label', '人型3Dモデル。ドラッグで回転、ホイールで拡大縮小');
viewport.prepend(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0.95, 0);

const pmrem = new THREE.PMREMGenerator(renderer);
const room = new RoomEnvironment();
scene.environment = pmrem.fromScene(room, 0.04).texture;
scene.environmentIntensity = 0.55;
room.dispose();
pmrem.dispose();

scene.add(new THREE.HemisphereLight(0xffffff, 0x8c917f, 1.5));
const key = new THREE.DirectionalLight(0xfff5df, 2.5);
key.position.set(-3.5, 5.5, 4.5);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
scene.add(key, key.target);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(8, 8),
  new THREE.ShadowMaterial({ opacity: 0.12 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(6, 30, 0xb5b7aa, 0xd2d3ca);
grid.position.y = 0.001;
scene.add(grid);

const directions = {
  perspective: new THREE.Vector3(1.2, 0.72, 2.1),
  front: new THREE.Vector3(0, 0.08, 1),
  side: new THREE.Vector3(1, 0.08, 0),
  back: new THREE.Vector3(0, 0.08, -1),
};

const state = {
  root: null,
  player: null,
  skeleton: null,
  view: 'perspective',
  bounds: null,
};

function fit() {
  if (!state.bounds) return;
  const frame = frameModel(state.bounds, camera.fov, camera.aspect, directions[state.view]);
  controls.target.copy(frame.target);
  camera.position.copy(frame.position);
  camera.near = frame.near;
  camera.far = frame.far;
  camera.updateProjectionMatrix();
  controls.enableDamping = false;
  controls.update();
  controls.enableDamping = true;
}

function updateTimeline() {
  const player = state.player;
  if (!player) return;
  $('timeline').max = String(player.duration);
  $('timeline').value = String(Math.min(player.time, player.duration));
  $('time').textContent = `${player.time.toFixed(2)} / ${player.duration.toFixed(2)} s`;
  $('play-pause').textContent = player.playing ? '一時停止' : '再生';
}

function selectClip(index) {
  state.player.select(index);
  state.player.speed = Number($('speed').value);
  state.bounds = animationBounds(state.player, 24);
  document.querySelectorAll('#clips button').forEach((button, i) => {
    button.classList.toggle('active', i === index);
    button.setAttribute('aria-pressed', String(i === index));
  });
  updateTimeline();
  fit();
}

function setupClips() {
  const fragment = document.createDocumentFragment();
  state.player.clips.forEach((clip, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = clip.name || `Action ${index + 1}`;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => selectClip(index));
    fragment.append(button);
  });
  $('clips').replaceChildren(fragment);
  selectClip(0);
}

function setView(view) {
  state.view = view;
  document.querySelectorAll('[data-view]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.view === view));
  });
  fit();
}

async function load() {
  try {
    const response = await fetch(modelUrl);
    if (!response.ok) throw new Error(`GLBの取得に失敗しました (${response.status})`);
    const bytes = await response.arrayBuffer();
    const asset = await new GLTFLoader().parseAsync(bytes, '');
    state.root = asset.scene;
    state.root.traverse(object => {
      if (object.isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
      if (object.isSkinnedMesh) object.frustumCulled = false;
    });
    scene.add(state.root);
    state.player = new AnimationPlayer(state.root, asset.animations);
    state.skeleton = new THREE.SkeletonHelper(state.root);
    state.skeleton.visible = false;
    state.skeleton.material.depthTest = false;
    state.skeleton.renderOrder = 20;
    scene.add(state.skeleton);

    let bones = 0;
    let meshes = 0;
    state.root.traverse(object => {
      if (object.isBone && object.name !== 'neutral_bone') bones += 1;
      if (object.isSkinnedMesh) meshes += 1;
    });
    $('bones').textContent = String(bones);
    $('meshes').textContent = String(meshes);
    $('actions').textContent = String(asset.animations.length);
    setupClips();
    $('status').textContent = '表示中';
  } catch (error) {
    $('error').hidden = false;
    $('error').textContent = error instanceof Error ? error.message : String(error);
    $('status').textContent = '読み込み失敗';
  }
}

$('play-pause').addEventListener('click', () => {
  if (!state.player) return;
  if (state.player.playing) state.player.playing = false;
  else state.player.play();
  updateTimeline();
});

$('speed').addEventListener('change', event => {
  if (state.player) state.player.speed = Number(event.target.value);
});

$('timeline').addEventListener('input', event => {
  state.player?.seek(Number(event.target.value));
  updateTimeline();
});

$('skeleton').addEventListener('change', event => {
  if (state.skeleton) state.skeleton.visible = event.target.checked;
});

document.querySelectorAll('[data-view]').forEach(button => {
  button.addEventListener('click', () => setView(button.dataset.view));
});

new ResizeObserver(() => {
  const { width, height } = viewport.getBoundingClientRect();
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(height, 1);
  camera.updateProjectionMatrix();
  fit();
}).observe(viewport);

const clock = new THREE.Clock();
function render() {
  requestAnimationFrame(render);
  const delta = Math.min(clock.getDelta(), 0.1);
  state.player?.update(delta);
  controls.update();
  updateTimeline();
  renderer.render(scene, camera);
}

load();
render();
