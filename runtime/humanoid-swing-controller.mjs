import * as THREE from 'three';

const EPSILON = 1e-6;
const DEFAULT_EXTREME_TIME = 0.64;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / Math.max(edge1 - edge0, EPSILON), 0, 1);
  return t * t * (3 - 2 * t);
}

function solveTwoBoneJoint(start, target, pole, upperLength, lowerLength, out = new THREE.Vector3()) {
  const toTarget = target.clone().sub(start);
  const rawDistance = Math.max(toTarget.length(), EPSILON);
  const direction = toTarget.multiplyScalar(1 / rawDistance);
  const minDistance = Math.abs(upperLength - lowerLength) + 1e-4;
  const maxDistance = upperLength + lowerLength - 1e-4;
  const distance = clamp(rawDistance, minDistance, maxDistance);
  const along = (
    upperLength * upperLength - lowerLength * lowerLength + distance * distance
  ) / (2 * distance);
  const height = Math.sqrt(Math.max(upperLength * upperLength - along * along, 0));

  const poleDirection = pole.clone().sub(start);
  poleDirection.addScaledVector(direction, -poleDirection.dot(direction));
  if (poleDirection.lengthSq() < EPSILON) poleDirection.set(0, 0, 1);
  poleDirection.normalize();

  return out.copy(start)
    .addScaledVector(direction, along)
    .addScaledVector(poleDirection, height);
}

function rotateBoneTowardChild(bone, child, targetWorld) {
  bone.updateWorldMatrix(true, false);
  child.updateWorldMatrix(true, false);

  const start = bone.getWorldPosition(new THREE.Vector3());
  const currentChild = child.getWorldPosition(new THREE.Vector3());
  const currentDirection = currentChild.sub(start).normalize();
  const desiredDirection = targetWorld.clone().sub(start).normalize();
  if (currentDirection.lengthSq() < EPSILON || desiredDirection.lengthSq() < EPSILON) return;

  const delta = new THREE.Quaternion().setFromUnitVectors(currentDirection, desiredDirection);
  const worldRotation = bone.getWorldQuaternion(new THREE.Quaternion());
  const desiredWorldRotation = delta.multiply(worldRotation);
  const parentWorldRotation = bone.parent?.getWorldQuaternion(new THREE.Quaternion()) ?? new THREE.Quaternion();
  bone.quaternion.copy(parentWorldRotation.invert().multiply(desiredWorldRotation));
  bone.updateWorldMatrix(true, true);
}

/**
 * Runtime web-swing prototype controller.
 *
 * Responsibilities are deliberately separated:
 * - pendulum state owns world-space motion;
 * - SwingReach / SwingTuck clips own authored body shape;
 * - a two-bone runtime IK pass aims the anchor arm at the web line;
 * - the viewer owns camera, UI and context rendering.
 */
export class HumanoidSwingController {
  constructor({ root, motionRoot, mixer, clips }) {
    this.root = root;
    this.motionRoot = motionRoot;
    this.mixer = mixer;
    this.clips = clips;

    this.hips = root.getObjectByName('Hips');
    this.upperArm = root.getObjectByName('LeftUpperArm');
    this.forearm = root.getObjectByName('LeftForearm');
    this.hand = root.getObjectByName('LeftHand');
    if (![this.hips, this.upperArm, this.forearm, this.hand].every(Boolean)) {
      throw new Error('Swing controller requires Hips and the complete left arm chain.');
    }

    this.reachClip = clips.find(clip => clip.name === 'SwingReach');
    this.tuckClip = clips.find(clip => clip.name === 'SwingTuck');
    if (!this.reachClip || !this.tuckClip) {
      throw new Error('Swing controller requires SwingReach and SwingTuck clips.');
    }

    this.anchor = new THREE.Vector3(0, 5.0, 0);
    this.ropeLength = 3.05;
    this.gravity = 9.81;
    this.theta = -0.82;
    this.omega = 0.34;
    this.active = false;
    this.paused = false;
    this.tuckBlend = 0;
    this.speed = 0;
    this.bodyPosition = new THREE.Vector3();
    this.handPosition = new THREE.Vector3();
    this.velocity = new THREE.Vector3();

    this.reachAction = null;
    this.tuckAction = null;
  }

  reset() {
    this.theta = -0.82;
    this.omega = 0.34;
    this.anchor.set(0, 5.0, 0);
    this.ropeLength = 3.05;
    this.paused = false;
  }

  moveAnchor(deltaX) {
    const preservedBody = this.bodyPosition.clone();
    const preservedVelocity = this.velocity.clone();
    this.anchor.x = clamp(this.anchor.x + deltaX, -2.0, 2.0);

    const relative = preservedBody.sub(this.anchor);
    const distance = relative.length();
    if (distance < EPSILON) return;
    this.ropeLength = clamp(distance, 2.35, 3.75);
    this.theta = Math.atan2(relative.x, -relative.y);
    const tangent = new THREE.Vector3(Math.cos(this.theta), Math.sin(this.theta), 0);
    this.omega = preservedVelocity.dot(tangent) / Math.max(this.ropeLength, EPSILON);
  }

  activate() {
    this.active = true;
    this.mixer.stopAllAction();
    this.reachAction = this.mixer.clipAction(this.reachClip).reset().play();
    this.tuckAction = this.mixer.clipAction(this.tuckClip).reset().play();
    for (const [action, clip] of [[this.reachAction, this.reachClip], [this.tuckAction, this.tuckClip]]) {
      action.enabled = true;
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = false;
      action.setEffectiveTimeScale(0);
      action.time = clip.duration * DEFAULT_EXTREME_TIME;
    }
    this._evaluateBlend(0);
  }

  deactivate() {
    this.active = false;
    this.mixer.stopAllAction();
    this.motionRoot.position.set(0, 0, 0);
    this.motionRoot.rotation.set(0, 0, 0);
    this.motionRoot.updateWorldMatrix(true, true);
  }

  setPaused(paused) {
    this.paused = Boolean(paused);
  }

  step(deltaSeconds) {
    if (!this.active) return this.snapshot();
    const dt = clamp(deltaSeconds, 0, 1 / 30);

    if (!this.paused) {
      // Semi-implicit Euler keeps the simple pendulum stable enough for a visual prototype.
      const angularAcceleration = -(this.gravity / this.ropeLength) * Math.sin(this.theta);
      this.omega += angularAcceleration * dt;
      this.theta += this.omega * dt;
    }

    this.speed = Math.abs(this.omega) * this.ropeLength;
    const nearBottom = 1 - smoothstep(0.12, 0.82, Math.abs(this.theta));
    const speedFactor = smoothstep(0.8, 4.2, this.speed);
    this.tuckBlend = clamp(0.08 + nearBottom * (0.58 + 0.30 * speedFactor), 0.08, 0.96);
    this._evaluateBlend(this.tuckBlend);

    this.bodyPosition.set(
      this.anchor.x + Math.sin(this.theta) * this.ropeLength,
      this.anchor.y - Math.cos(this.theta) * this.ropeLength,
      0,
    );
    this.velocity.set(
      Math.cos(this.theta) * this.ropeLength * this.omega,
      Math.sin(this.theta) * this.ropeLength * this.omega,
      0,
    );

    this._placeBody();
    this._applyAnchorArmIK();
    this.hand.getWorldPosition(this.handPosition);
    return this.snapshot();
  }

  _evaluateBlend(tuckBlend) {
    if (!this.reachAction || !this.tuckAction) return;
    this.reachAction.time = this.reachClip.duration * DEFAULT_EXTREME_TIME;
    this.tuckAction.time = this.tuckClip.duration * DEFAULT_EXTREME_TIME;
    this.reachAction.setEffectiveWeight(1 - tuckBlend);
    this.tuckAction.setEffectiveWeight(tuckBlend);
    this.mixer.update(0);
    this.root.updateWorldMatrix(true, true);
  }

  _placeBody() {
    const lean = clamp(-this.theta * 0.16 + this.omega * 0.055, -0.24, 0.24);
    this.motionRoot.position.set(0, 0, 0);
    this.motionRoot.rotation.set(0, 0, lean);
    this.motionRoot.updateWorldMatrix(true, true);

    const currentHips = this.hips.getWorldPosition(new THREE.Vector3());
    this.motionRoot.position.copy(this.bodyPosition).sub(currentHips);
    this.motionRoot.updateWorldMatrix(true, true);
  }

  _applyAnchorArmIK() {
    this.root.updateWorldMatrix(true, true);
    const shoulder = this.upperArm.getWorldPosition(new THREE.Vector3());
    const elbow = this.forearm.getWorldPosition(new THREE.Vector3());
    const wrist = this.hand.getWorldPosition(new THREE.Vector3());
    const upperLength = shoulder.distanceTo(elbow);
    const lowerLength = elbow.distanceTo(wrist);
    const reachLength = Math.max(upperLength + lowerLength - 0.018, 0.02);

    const toAnchor = this.anchor.clone().sub(shoulder).normalize();
    const wristTarget = shoulder.clone().addScaledVector(toAnchor, reachLength);
    const pole = shoulder.clone().add(new THREE.Vector3(-0.16, -0.04, 0.58));
    const elbowTarget = solveTwoBoneJoint(
      shoulder,
      wristTarget,
      pole,
      upperLength,
      lowerLength,
    );

    rotateBoneTowardChild(this.upperArm, this.forearm, elbowTarget);
    rotateBoneTowardChild(this.forearm, this.hand, wristTarget);
    this.root.updateWorldMatrix(true, true);
  }

  snapshot() {
    return {
      anchor: this.anchor.clone(),
      bodyPosition: this.bodyPosition.clone(),
      handPosition: this.handPosition.clone(),
      velocity: this.velocity.clone(),
      ropeLength: this.ropeLength,
      speed: this.speed,
      tuckBlend: this.tuckBlend,
      theta: this.theta,
      omega: this.omega,
      paused: this.paused,
    };
  }
}
