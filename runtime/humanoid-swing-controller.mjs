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

function rotateBoneWorld(bone, axisWorld, radians) {
  if (!bone || Math.abs(radians) < EPSILON) return;
  bone.updateWorldMatrix(true, false);
  const axis = axisWorld.clone().normalize();
  const delta = new THREE.Quaternion().setFromAxisAngle(axis, radians);
  const worldRotation = bone.getWorldQuaternion(new THREE.Quaternion());
  const desiredWorldRotation = delta.multiply(worldRotation);
  const parentWorldRotation = bone.parent?.getWorldQuaternion(new THREE.Quaternion()) ?? new THREE.Quaternion();
  bone.quaternion.copy(parentWorldRotation.invert().multiply(desiredWorldRotation));
  bone.updateWorldMatrix(true, true);
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
    this.spine = root.getObjectByName('Spine');
    this.chest = root.getObjectByName('Chest');
    this.head = root.getObjectByName('Head');
    this.upperArm = root.getObjectByName('LeftUpperArm');
    this.forearm = root.getObjectByName('LeftForearm');
    this.hand = root.getObjectByName('LeftHand');
    this.freeUpperArm = root.getObjectByName('RightUpperArm');
    this.freeForearm = root.getObjectByName('RightForearm');
    this.freeHand = root.getObjectByName('RightHand');
    this.leftThigh = root.getObjectByName('LeftThigh');
    this.leftShin = root.getObjectByName('LeftShin');
    this.leftFoot = root.getObjectByName('LeftFoot');
    this.rightThigh = root.getObjectByName('RightThigh');
    this.rightShin = root.getObjectByName('RightShin');
    this.rightFoot = root.getObjectByName('RightFoot');
    if (![
      this.hips, this.spine, this.chest, this.head,
      this.upperArm, this.forearm, this.hand,
      this.freeUpperArm, this.freeForearm, this.freeHand,
      this.leftThigh, this.leftShin, this.leftFoot,
      this.rightThigh, this.rightShin, this.rightFoot,
    ].every(Boolean)) {
      throw new Error('Swing controller requires the torso, both arms and both leg chains.');
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
    this.tuckBlend = 0.06;
    this.bottomness = 0;
    this.descent = 0;
    this.rise = 0;
    this.pump = 0;
    this.bodyLean = 0;
    this.speed = 0;
    this.bodyPosition = new THREE.Vector3();
    this.handPosition = new THREE.Vector3();
    this.velocity = new THREE.Vector3();

    this.modifiedBones = [
      this.hips, this.chest,
      this.upperArm, this.forearm, this.hand,
      this.freeUpperArm, this.freeForearm, this.freeHand,
      this.leftThigh, this.leftShin, this.leftFoot,
      this.rightThigh, this.rightShin, this.rightFoot,
    ];
    this.basePose = new Map();

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
    this._restoreBasePose();
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
    this.lastDt = dt;

    if (!this.paused) {
      // Semi-implicit Euler keeps the simple pendulum stable enough for a visual prototype.
      const angularAcceleration = -(this.gravity / this.ropeLength) * Math.sin(this.theta);
      this.omega += angularAcceleration * dt;
      this.theta += this.omega * dt;
    }

    this.speed = Math.abs(this.omega) * this.ropeLength;
    const verticalVelocity = Math.sin(this.theta) * this.ropeLength * this.omega;
    const travelDirection = Math.sign(this.omega || 1);
    // Compression leads the exact bottom slightly. This gives the motion an
    // anticipatory pump instead of waiting until the body is already vertical.
    const pumpAngle = this.theta + travelDirection * 0.11;
    this.bottomness = 1 - smoothstep(0.10, 0.72, Math.abs(pumpAngle));
    this.descent = smoothstep(0.05, 2.5, -verticalVelocity);
    this.rise = smoothstep(0.05, 2.5, verticalVelocity);
    const speedFactor = smoothstep(1.2, 4.0, this.speed);
    this.pump = clamp(this.bottomness * (0.28 + 0.78 * speedFactor), 0, 1);
    const targetTuck = clamp(0.05 + this.pump * 0.83, 0.05, 0.88);
    // Compression is quick and decisive, release is slower. The hysteresis
    // keeps the body from snapping open immediately after crossing the bottom.
    const tuckRate = targetTuck > this.tuckBlend ? 10.5 : 4.8;
    const tuckAlpha = 1 - Math.exp(-tuckRate * dt);
    this.tuckBlend += (targetTuck - this.tuckBlend) * tuckAlpha;
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
    this._applyProceduralBodyPose();
    this._applyFreeArmMotion();
    this._applyLegPump();
    this._applyAnchorArmIK();
    this.hand.getWorldPosition(this.handPosition);
    return this.snapshot();
  }

  _captureBasePose() {
    this.basePose.clear();
    for (const bone of this.modifiedBones) {
      this.basePose.set(bone, {
        position: bone.position.clone(),
        quaternion: bone.quaternion.clone(),
        scale: bone.scale.clone(),
      });
    }
  }

  _restoreBasePose() {
    if (!this.basePose.size) return;
    for (const [bone, pose] of this.basePose) {
      bone.position.copy(pose.position);
      bone.quaternion.copy(pose.quaternion);
      bone.scale.copy(pose.scale);
    }
    this.root.updateWorldMatrix(true, true);
  }

  _evaluateBlend(tuckBlend) {
    if (!this.reachAction || !this.tuckAction) return;
    // Remove the previous frame's runtime IK/additive edits without touching
    // AnimationMixer's own bind/original-state cache.
    this._restoreBasePose();
    this.reachAction.time = this.reachClip.duration * DEFAULT_EXTREME_TIME;
    this.tuckAction.time = this.tuckClip.duration * DEFAULT_EXTREME_TIME;
    this.reachAction.setEffectiveWeight(1 - tuckBlend);
    this.tuckAction.setEffectiveWeight(tuckBlend);
    this.mixer.update(1e-8);
    this.root.updateWorldMatrix(true, true);
    this._captureBasePose();
  }

  _placeBody() {
    // Let the body visibly follow the tangent instead of hanging almost
    // upright. The authored clips still provide the anatomical silhouette.
    const targetLean = clamp(this.velocity.x * 0.065 - this.theta * 0.10, -0.36, 0.36);
    const leanAlpha = 1 - Math.exp(-4.6 * Math.max(this.lastDt ?? 0, 1 / 120));
    this.bodyLean += (targetLean - this.bodyLean) * leanAlpha;
    this.motionRoot.position.set(0, 0, 0);
    this.motionRoot.rotation.set(0, 0, this.bodyLean);
    this.motionRoot.updateWorldMatrix(true, true);

    const currentHips = this.hips.getWorldPosition(new THREE.Vector3());
    this.motionRoot.position.copy(this.bodyPosition).sub(currentHips);
    this.motionRoot.updateWorldMatrix(true, true);
  }

  _motionAxis(x, y, z) {
    const axis = new THREE.Vector3(x, y, z);
    const worldRotation = this.motionRoot.getWorldQuaternion(new THREE.Quaternion());
    return axis.applyQuaternion(worldRotation).normalize();
  }

  _motionPoint(x, y, z) {
    return this.motionRoot.localToWorld(new THREE.Vector3(x, y, z));
  }

  _applyProceduralBodyPose() {
    // Counter-rotation between pelvis and chest prevents the torso from
    // reading as one rigid board. The sign follows swing travel direction.
    const travel = Math.sign(this.omega || 1);
    const sideBend = travel * (0.025 + this.pump * 0.055);
    const chestCounter = -travel * (0.018 + this.pump * 0.042);
    rotateBoneWorld(this.hips, this._motionAxis(0, 0, 1), sideBend);
    rotateBoneWorld(this.chest, this._motionAxis(0, 0, 1), chestCounter);

    // At the drive phase the pelvis curls under while the chest lags behind.
    // During rise the chest opens again, producing compression -> release.
    rotateBoneWorld(this.hips, this._motionAxis(1, 0, 0), this.pump * 0.065 - this.rise * 0.025);
    rotateBoneWorld(this.chest, this._motionAxis(1, 0, 0), -this.pump * 0.045 + this.rise * 0.035);

    // The head leads the turn slightly. This is a small cue, but it prevents
    // the mannequin from reading as an inert object hanging from the wrist.
    const speedFactor = smoothstep(1.0, 4.2, this.speed);
    const headYaw = -travel * (0.055 + 0.10 * speedFactor);
    const headPitch = -0.045 * this.descent + 0.025 * this.rise - 0.025 * this.pump;
    rotateBoneWorld(this.head, this._motionAxis(0, 1, 0), headYaw);
    rotateBoneWorld(this.head, this._motionAxis(1, 0, 0), headPitch);
    this.root.updateWorldMatrix(true, true);
  }

  _applyTwoBoneIK(upper, lower, end, targetWorld, poleWorld, strength = 1) {
    if (strength <= EPSILON) return;
    this.root.updateWorldMatrix(true, true);
    const start = upper.getWorldPosition(new THREE.Vector3());
    const joint = lower.getWorldPosition(new THREE.Vector3());
    const finish = end.getWorldPosition(new THREE.Vector3());
    const upperLength = start.distanceTo(joint);
    const lowerLength = joint.distanceTo(finish);
    const blendedTarget = finish.clone().lerp(targetWorld, clamp(strength, 0, 1));
    const solvedJoint = solveTwoBoneJoint(start, blendedTarget, poleWorld, upperLength, lowerLength);
    rotateBoneTowardChild(upper, lower, solvedJoint);
    rotateBoneTowardChild(lower, end, blendedTarget);
    this.root.updateWorldMatrix(true, true);
  }

  _applyFreeArmMotion() {
    // Preserve the authored arm silhouette and add only a phase offset. This is
    // deliberately additive: the previous absolute IK targets overrode the
    // useful SwingReach/SwingTuck poses and made the arm collapse unnaturally.
    this.root.updateWorldMatrix(true, true);
    const currentHand = this.freeHand.getWorldPosition(new THREE.Vector3());
    const localOffset = new THREE.Vector3(
      0.08 * this.rise - 0.035 * this.pump,
      -0.08 * this.descent + 0.055 * this.rise + 0.035 * this.pump,
      -0.12 * this.descent + 0.09 * this.rise + 0.07 * this.pump,
    );
    const worldRotation = this.motionRoot.getWorldQuaternion(new THREE.Quaternion());
    const target = currentHand.clone().add(localOffset.applyQuaternion(worldRotation));
    const elbow = this.freeForearm.getWorldPosition(new THREE.Vector3());
    const pole = elbow.clone().add(this._motionAxis(0.18, 0.05, 0.42));
    const strength = clamp(0.28 + this.descent * 0.18 + this.pump * 0.16 + this.rise * 0.18, 0, 0.58);
    this._applyTwoBoneIK(this.freeUpperArm, this.freeForearm, this.freeHand, target, pole, strength);
  }

  _applyLegPump() {
    // Start from the authored foot positions and nudge them instead of replacing
    // the whole leg pose. Small unequal offsets create a pumping rhythm while
    // preserving the readable reach/tuck silhouettes from Blender.
    this.root.updateWorldMatrix(true, true);
    const worldRotation = this.motionRoot.getWorldQuaternion(new THREE.Quaternion());
    const leftCurrent = this.leftFoot.getWorldPosition(new THREE.Vector3());
    const rightCurrent = this.rightFoot.getWorldPosition(new THREE.Vector3());
    const travel = Math.sign(this.omega || 1);

    const stretch = clamp((1 - this.pump) * (0.62 + this.descent * 0.28 + this.rise * 0.22), 0, 1);
    const leftOffset = new THREE.Vector3(
      -0.025 * travel * this.pump + 0.035 * stretch,
      0.10 * this.pump - 0.045 * this.descent - 0.025 * this.rise - 0.26 * stretch,
      0.055 * this.pump + 0.025 * this.descent,
    ).applyQuaternion(worldRotation);
    const rightOffset = new THREE.Vector3(
      0.025 * travel * this.pump - 0.035 * stretch,
      0.065 * this.pump - 0.065 * this.descent - 0.04 * this.rise - 0.21 * stretch,
      -0.045 * this.pump - 0.02 * this.descent,
    ).applyQuaternion(worldRotation);

    const leftTarget = leftCurrent.clone().add(leftOffset);
    const rightTarget = rightCurrent.clone().add(rightOffset);
    const leftKnee = this.leftShin.getWorldPosition(new THREE.Vector3());
    const rightKnee = this.rightShin.getWorldPosition(new THREE.Vector3());
    const leftPole = leftKnee.clone().add(this._motionAxis(-0.08, 0.02, 0.42));
    const rightPole = rightKnee.clone().add(this._motionAxis(0.08, 0.02, 0.42));
    const strength = clamp(0.18 + this.pump * 0.24 + this.descent * 0.10 + stretch * 0.34, 0, 0.62);
    this._applyTwoBoneIK(this.leftThigh, this.leftShin, this.leftFoot, leftTarget, leftPole, strength);
    this._applyTwoBoneIK(this.rightThigh, this.rightShin, this.rightFoot, rightTarget, rightPole, strength);
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
      bottomness: this.bottomness,
      descent: this.descent,
      rise: this.rise,
      pump: this.pump,
      bodyLean: this.bodyLean,
      theta: this.theta,
      omega: this.omega,
      paused: this.paused,
    };
  }
}
