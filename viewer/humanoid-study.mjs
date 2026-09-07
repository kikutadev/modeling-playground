import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import modelUrl from '../output/humanoid-deform-study.glb?url';
import { AnimationPlayer, animationBounds } from './animation.mjs';
import { frameModel } from './model.mjs';
import { HumanoidSwingController } from '../runtime/humanoid-swing-controller.mjs';

const $ = id => document.getElementById(id);
const viewport = $('viewport');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#ecece5');

const motionRoot = new THREE.Group();
motionRoot.name = 'HumanoidMotionRoot';
scene.add(motionRoot);

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

const swingWorld = new THREE.Group();
swingWorld.name = 'SwingWorld';
swingWorld.visible = false;
scene.add(swingWorld);

const buildingMaterial = new THREE.MeshStandardMaterial({ color: 0xc8cbc5, roughness: 0.88, metalness: 0.02 });
const backMaterial = new THREE.MeshStandardMaterial({ color: 0xbfc4c0, roughness: 0.92, metalness: 0.01 });
function addBuilding(size, position, material = buildingMaterial) {
  const building = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  building.position.set(...position);
  building.receiveShadow = true;
  building.castShadow = true;
  swingWorld.add(building);
  return building;
}
addBuilding([3.0, 7.2, 2.4], [-4.7, 2.7, -1.5]);
addBuilding([3.0, 7.2, 2.4], [4.7, 2.7, -1.5]);
addBuilding([12.0, 8.0, 1.0], [0, 3.0, -4.1], backMaterial);
const anchorBeam = addBuilding([5.2, 0.16, 0.22], [0, 5.18, -0.08], backMaterial);
anchorBeam.castShadow = false;

const windowMaterial = new THREE.MeshBasicMaterial({ color: 0x9ea7a4, transparent: true, opacity: 0.56 });
function addWindowGrid({ columns, rows, spacingX, spacingY, centerX, centerY, z, width = 0.58, height = 0.28 }) {
  const geometry = new THREE.PlaneGeometry(width, height);
  const windows = new THREE.InstancedMesh(geometry, windowMaterial, columns * rows);
  const matrix = new THREE.Matrix4();
  let index = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = centerX + (column - (columns - 1) / 2) * spacingX;
      const y = centerY + (row - (rows - 1) / 2) * spacingY;
      matrix.makeTranslation(x, y, z);
      windows.setMatrixAt(index, matrix);
      index += 1;
    }
  }
  windows.instanceMatrix.needsUpdate = true;
  windows.frustumCulled = false;
  swingWorld.add(windows);
  return windows;
}
addWindowGrid({ columns: 10, rows: 8, spacingX: 1.02, spacingY: 0.82, centerX: 0, centerY: 3.0, z: -3.57, width: 0.62, height: 0.30 });
addWindowGrid({ columns: 2, rows: 7, spacingX: 0.92, spacingY: 0.84, centerX: -4.7, centerY: 2.7, z: -0.28, width: 0.54, height: 0.28 });
addWindowGrid({ columns: 2, rows: 7, spacingX: 0.92, spacingY: 0.84, centerX: 4.7, centerY: 2.7, z: -0.28, width: 0.54, height: 0.28 });

const directions = {
  perspective: new THREE.Vector3(1.2, 0.72, 2.1),
  front: new THREE.Vector3(0, 0.08, 1),
  side: new THREE.Vector3(1, 0.08, 0),
  back: new THREE.Vector3(0, 0.08, -1),
};

const ACTION_INTENTS = {
  Neutral: '基準姿勢。肩・肘・膝の変形を確認します。',
  SwingReach: '片手をWebアンカーへ伸ばし、腰と脚を後方へ流すスイング伸展。',
  SwingTuck: 'アンカー手を維持しつつ膝を胸側へ畳む、加速・方向転換用の圧縮姿勢。',
  WallRun: '壁側の手足を接触面へ寄せ、反対側を前後に振る壁走り姿勢。',
  AerialAim: '空中で下半身を自由に残しながら、片腕で前方ターゲットを狙う姿勢。',
  AirKick: '腰の逆回転を伴う空中蹴り。伸ばす脚と畳む脚の差を確認します。',
  Landing: '片手接地を伴う低い着地。股関節・膝・肩の大きな圧縮を確認します。',
};

function createLine(color, opacity = 1) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
  const material = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
  const line = new THREE.Line(geometry, material);
  line.frustumCulled = false;
  return line;
}

function setLine(line, a, b) {
  const position = line.geometry.attributes.position;
  position.setXYZ(0, a.x, a.y, a.z);
  position.setXYZ(1, b.x, b.y, b.z);
  position.needsUpdate = true;
}

const context = new THREE.Group();
context.name = 'ActionContext';
scene.add(context);

const webAnchor = new THREE.Mesh(
  new THREE.SphereGeometry(0.065, 16, 12),
  new THREE.MeshBasicMaterial({ color: 0x39b8d0 }),
);
const webLine = createLine(0x39b8d0, 0.95);
const wall = new THREE.Mesh(
  new THREE.PlaneGeometry(3.4, 3.4),
  new THREE.MeshBasicMaterial({ color: 0xc7cac2, transparent: true, opacity: 0.26, side: THREE.DoubleSide }),
);
// PlaneGeometry is authored in XY. Rotate it into XZ so WallRun gets an
// actual vertical contact surface instead of a horizontal sheet.
wall.rotation.x = Math.PI / 2;
const wallGrid = new THREE.GridHelper(3.4, 14, 0xaeb2a8, 0xcdd0c8);
wallGrid.rotation.x = Math.PI / 2;
const target = new THREE.Mesh(
  new THREE.SphereGeometry(0.09, 16, 12),
  new THREE.MeshBasicMaterial({ color: 0xd15b4a }),
);
const aimLine = createLine(0xd15b4a, 0.7);
context.add(webAnchor, webLine, wall, wallGrid, target, aimLine);

const state = {
  root: null,
  player: null,
  skeleton: null,
  view: 'perspective',
  bounds: null,
  clipName: null,
  mode: 'swing',
  swing: null,
  swingSnapshot: null,
  studyClipIndex: 0,
};

function objectPosition(name, targetVector = new THREE.Vector3()) {
  return state.root?.getObjectByName(name)?.getWorldPosition(targetVector) ?? null;
}

function hideContext() {
  webAnchor.visible = false;
  webLine.visible = false;
  wall.visible = false;
  wallGrid.visible = false;
  target.visible = false;
  aimLine.visible = false;
}

function configureContext() {
  hideContext();
  if (!state.bounds || !state.clipName) return;
  const center = state.bounds.getCenter(new THREE.Vector3());

  if (state.clipName === 'SwingReach' || state.clipName === 'SwingTuck') {
    webAnchor.visible = true;
    webLine.visible = true;
    webAnchor.position.set(center.x - 0.45, state.bounds.max.y + 0.55, center.z - 0.10);
    state.bounds.expandByPoint(webAnchor.position);
  } else if (state.clipName === 'WallRun') {
    wall.visible = true;
    wallGrid.visible = true;
  } else if (state.clipName === 'AerialAim' || state.clipName === 'AirKick') {
    target.visible = true;
    aimLine.visible = state.clipName === 'AerialAim';
  }

  if ($('action-intent')) $('action-intent').textContent = ACTION_INTENTS[state.clipName] ?? '';
}

function updateContext() {
  if (!state.root || !state.clipName) return;

  if (webLine.visible) {
    const hand = objectPosition('LeftHand');
    if (hand) setLine(webLine, hand, webAnchor.position);
  }

  if (wall.visible) {
    const hand = objectPosition('LeftHand');
    const foot = objectPosition('LeftFoot');
    if (hand && foot) {
      const z = (hand.z + foot.z) * 0.5;
      const y = (hand.y + foot.y) * 0.5 + 0.015;
      const x = (hand.x + foot.x) * 0.5;
      wall.position.set(x, y, z);
      wallGrid.position.copy(wall.position);
    }
  }

  if (target.visible) {
    if (state.clipName === 'AerialAim') {
      const hand = objectPosition('RightHand');
      const shoulder = objectPosition('RightUpperArm');
      if (hand && shoulder) {
        const direction = hand.clone().sub(shoulder).normalize();
        target.position.copy(hand).addScaledVector(direction, 1.0);
        setLine(aimLine, hand, target.position);
      }
    } else if (state.clipName === 'AirKick') {
      const foot = objectPosition('LeftFoot');
      const hips = objectPosition('Hips');
      if (foot && hips) {
        const direction = foot.clone().sub(hips).normalize();
        target.position.copy(foot).addScaledVector(direction, 0.45);
      }
    }
  }
}

function updateSwingTelemetry(snapshot) {
  if (!snapshot) return;
  $('swing-speed').textContent = `${snapshot.speed.toFixed(2)} m/s`;
  $('swing-blend').textContent = `${Math.round(snapshot.tuckBlend * 100)}%`;
  $('swing-rope').textContent = `${snapshot.ropeLength.toFixed(2)} m`;
  $('swing-pause').textContent = snapshot.paused ? '再開' : '一時停止';
  $('swing-pause').setAttribute('aria-pressed', String(snapshot.paused));
}

function updateSwingContext(snapshot) {
  hideContext();
  webAnchor.visible = true;
  webLine.visible = true;
  webAnchor.position.copy(snapshot.anchor);
  setLine(webLine, snapshot.handPosition, snapshot.anchor);
  updateSwingTelemetry(snapshot);
}

function updateSwingCamera(snapshot, delta) {
  const speedLead = snapshot.velocity.clone().multiplyScalar(0.09);
  const desiredTarget = snapshot.bodyPosition.clone().lerp(snapshot.anchor, 0.30).add(speedLead);
  const desiredPosition = desiredTarget.clone().add(new THREE.Vector3(0.55, 0.45, 6.75));
  const smoothing = 1 - Math.exp(-Math.max(delta, 0) * 5.2);
  controls.target.lerp(desiredTarget, smoothing);
  camera.position.lerp(desiredPosition, smoothing);
  camera.lookAt(controls.target);
}

function setMode(mode) {
  if (!state.player || !state.swing) return;
  state.mode = mode;
  const swingMode = mode === 'swing';
  $('status').textContent = swingMode ? 'Swing Play' : 'Action Study';
  $('mode-swing').setAttribute('aria-pressed', String(swingMode));
  $('mode-study').setAttribute('aria-pressed', String(!swingMode));
  $('action-section').hidden = swingMode;
  $('swing-controls').hidden = !swingMode;
  $('view-section').hidden = swingMode;
  $('mode-intent').textContent = swingMode
    ? '物理軌道＋Reach/Tuckブレンド＋runtime IKを連続再生します。'
    : 'GLBに焼き込んだ各Actionを個別に確認します。';
  $('help-text').textContent = swingMode
    ? 'カメラは身体とWebアンカーの両方が見えるよう自動追従します。アンカー位置を左右へ動かして軌道変化を確認できます。'
    : 'ドラッグで回転、ホイール／ピンチでズームできます。各Actionの変形とシルエットを確認できます。';

  if (swingMode) {
    state.player.playing = false;
    state.swing.activate();
    state.clipName = 'SwingPlay';
    state.bounds = null;
    swingWorld.visible = true;
    ground.position.y = -0.82;
    grid.position.y = -0.81;
    controls.enabled = false;
    hideContext();
    const first = state.swing.step(0);
    state.swingSnapshot = first;
    updateSwingContext(first);
    const initialTarget = first.bodyPosition.clone().lerp(first.anchor, 0.30);
    camera.position.copy(initialTarget).add(new THREE.Vector3(0.55, 0.45, 6.75));
    controls.target.copy(initialTarget);
    camera.lookAt(controls.target);
  } else {
    state.swing.deactivate();
    swingWorld.visible = false;
    ground.position.y = 0;
    grid.position.y = 0.001;
    controls.enabled = true;
    selectClip(state.studyClipIndex);
  }
}

function fit() {
  if (state.mode === 'swing' || !state.bounds) return;
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
  state.studyClipIndex = index;
  state.player.select(index);
  state.player.speed = Number($('speed').value);
  state.clipName = state.player.clips[index]?.name ?? null;
  state.bounds = animationBounds(state.player, 24);
  configureContext();
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
    button.addEventListener('click', () => {
      if (state.mode !== 'study') setMode('study');
      selectClip(index);
    });
    fragment.append(button);
  });
  $('clips').replaceChildren(fragment);
  state.studyClipIndex = Math.max(0, state.player.clips.findIndex(clip => clip.name === 'SwingReach'));
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
    motionRoot.add(state.root);
    state.player = new AnimationPlayer(state.root, asset.animations);
    state.swing = new HumanoidSwingController({
      root: state.root,
      motionRoot,
      mixer: state.player.mixer,
      clips: asset.animations,
    });
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
    setMode('swing');
  } catch (error) {
    $('error').hidden = false;
    $('error').textContent = error instanceof Error ? error.message : String(error);
    $('status').textContent = '読み込み失敗';
  }
}


$('mode-swing').addEventListener('click', () => setMode('swing'));
$('mode-study').addEventListener('click', () => setMode('study'));
$('anchor-left').addEventListener('click', () => state.swing?.moveAnchor(-0.55));
$('anchor-right').addEventListener('click', () => state.swing?.moveAnchor(0.55));
$('swing-reset').addEventListener('click', () => state.swing?.reset());
$('swing-pause').addEventListener('click', () => {
  if (!state.swing) return;
  state.swing.setPaused(!state.swing.paused);
  updateSwingTelemetry(state.swing.snapshot());
});

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
  updateContext();
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
  if (state.mode === 'swing' && state.swing) {
    const snapshot = state.swing.step(delta);
    state.swingSnapshot = snapshot;
    updateSwingContext(snapshot);
    updateSwingCamera(snapshot, delta);
  } else {
    state.player?.update(delta);
    controls.update();
    updateContext();
    updateTimeline();
  }
  renderer.render(scene, camera);
}

load();
render();
