import {Vector3} from 'three';

const UP = new Vector3(0, 1, 0);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const DEFAULT_TRAVERSAL_TUNING = Object.freeze({
  // Strong by design: the player chooses intent and timing; the traversal layer supplies energy.
  targetSwingSpeed: 36,
  maxSwingAssist: 28,
  swingGain: 1.8,
  bottomPump: 15,
  lowAltitudeLift: 24,
  risingLift: 5,
  releaseBoost: 5.5,
  releaseMinimumUp: 7,
  releaseAssistDuration: 0.16,
  maxTraversalSpeed: 58,
  attachPreload: 0.075,
  idealRopeLength: 42,
  zipSpeed: 36,
  zipBoost: 5.5,
  zipMinimumUp: 6.5,
  zipCooldown: 0.55,
});

function planarDirection(vector, fallback) {
  const result = vector.clone().setY(0);
  if (result.lengthSq() < 1e-6) result.copy(fallback).setY(0);
  if (result.lengthSq() < 1e-6) result.set(0, 0, -1);
  return result.normalize();
}

/**
 * Adds game-feel energy while a web is attached. This deliberately sits above the
 * rope simulation: physics determines the arc, while this layer prevents dead swings.
 */
export function applySwingAssist(body, dt, intent, tuning = DEFAULT_TRAVERSAL_TUNING) {
  if (!body.anchor) return {autoReel: false, bottomness: 0, assisted: false};

  const desired = planarDirection(intent?.desiredDirection ?? body.velocity, new Vector3(0, 0, -1));
  const rope = body.position.clone().sub(body.anchor.point);
  const ropeLength = rope.length();
  if (ropeLength < 1e-5) return {autoReel: false, bottomness: 0, assisted: false};
  const ropeDirection = rope.divideScalar(ropeLength);

  // Project the desired travel direction onto the rope tangent plane.
  const tangent = desired.clone().addScaledVector(ropeDirection, -desired.dot(ropeDirection));
  if (tangent.lengthSq() < 1e-5) {
    tangent.copy(body.velocity).addScaledVector(ropeDirection, -body.velocity.dot(ropeDirection));
  }
  if (tangent.lengthSq() > 1e-5) tangent.normalize();

  const throttle = clamp(intent?.throttle ?? 1, 0, 1);
  const forwardSpeed = body.velocity.dot(tangent);
  const missingSpeed = Math.max(0, tuning.targetSwingSpeed - forwardSpeed);
  const acceleration = Math.min(tuning.maxSwingAssist, missingSpeed * tuning.swingGain) * (0.35 + throttle * 0.65);
  body.velocity.addScaledVector(tangent, acceleration * dt);

  // Pump hardest near the bottom of the arc. This is the primary "whoosh" energy source.
  const bottomness = clamp((-ropeDirection.y - 0.28) / 0.72, 0, 1);
  if (forwardSpeed > -2) body.velocity.addScaledVector(tangent, tuning.bottomPump * bottomness * throttle * dt);

  // Near-street swings should skim the ground rather than bury the character into it.
  const lowFactor = clamp((5.5 - body.position.y) / 4.5, 0, 1);
  if (body.velocity.y < 4 && lowFactor > 0) {
    body.velocity.addScaledVector(UP, tuning.lowAltitudeLift * lowFactor * dt);
  }

  // Preserve a little energy during the second half of the arc without turning it into flight.
  if (body.velocity.y > 0 && bottomness > 0.25) {
    body.velocity.addScaledVector(UP, tuning.risingLift * bottomness * throttle * dt);
  }

  const autoReel = body.position.y < 7 || (body.velocity.length() < 27 && throttle > 0.35);
  return {autoReel, bottomness, assisted: true};
}

/**
 * Releases the current web with a controlled forward/upward correction. Raw SwingBody.release()
 * remains physically exact for tests and low-assist modes; production traversal calls this helper.
 */
export function releaseWithAssist(body, desiredDirection, tuning = DEFAULT_TRAVERSAL_TUNING) {
  if (!body.anchor) return false;

  const desired = planarDirection(desiredDirection, body.velocity);
  const ropeDirection = body.position.clone().sub(body.anchor.point).normalize();
  const tangentVelocity = body.velocity.clone().addScaledVector(ropeDirection, -body.velocity.dot(ropeDirection));
  const launchDirection = tangentVelocity.lengthSq() > 1e-5 ? tangentVelocity.normalize() : desired.clone();
  launchDirection.lerp(desired, 0.38).normalize();

  body.release();
  // Keep velocity continuous at the release frame. The assist is delivered over a short
  // post-release window so the trajectory bends naturally instead of kinking instantly.
  body.releaseAssist={direction:launchDirection.clone(),remaining:tuning.releaseAssistDuration,duration:tuning.releaseAssistDuration,startUp:body.velocity.y,targetUp:Math.max(body.velocity.y,tuning.releaseMinimumUp),appliedForward:0};
  body.assistedReleaseTime = body.time;
  return true;
}

export function applyReleaseAssist(body, dt, tuning = DEFAULT_TRAVERSAL_TUNING) {
  const assist=body.releaseAssist;
  if(!assist)return false;
  if(body.anchor||body.grounded||assist.remaining<=0){body.releaseAssist=null;return false;}
  const slice=Math.min(dt,assist.remaining);
  const duration=Math.max(assist.duration||tuning.releaseAssistDuration,1e-4);
  const nextRemaining=Math.max(0,assist.remaining-slice);
  const progress=1-nextRemaining/duration;
  const eased=progress*progress*(3-2*progress);

  // Apply only the incremental part of the eased impulse, keeping velocity continuous.
  const desiredForward=tuning.releaseBoost*eased;
  body.velocity.addScaledVector(assist.direction,desiredForward-assist.appliedForward);
  assist.appliedForward=desiredForward;

  // Follow the same eased curve vertically. Gravity still acts every physics step, but the
  // release envelope reaches its target exactly at the end instead of snapping on frame one.
  const desiredUp=assist.startUp+(assist.targetUp-assist.startUp)*eased;
  if(body.velocity.y<desiredUp)body.velocity.y=desiredUp;
  if(body.velocity.length()>tuning.maxTraversalSpeed)body.velocity.setLength(tuning.maxTraversalSpeed);

  assist.remaining=nextRemaining;
  if(assist.remaining<=1e-6)body.releaseAssist=null;
  return true;
}

/**
 * Short mid-air burst used to bridge release, wall-run and the next swing. It preserves most of the
 * current momentum while steering it toward player intent instead of behaving like a teleport.
 */
export function performWebZip(body, desiredDirection, tuning = DEFAULT_TRAVERSAL_TUNING) {
  if (body.anchor || body.grounded || body.time - (body.zipTime ?? -10) < tuning.zipCooldown) return false;

  const desired = planarDirection(desiredDirection, body.velocity);
  const currentSpeed = body.velocity.length();
  const zipVelocity = desired.multiplyScalar(Math.max(tuning.zipSpeed, currentSpeed * 0.92));
  body.velocity.lerp(zipVelocity, 0.58);
  body.velocity.addScaledVector(planarDirection(desiredDirection, body.velocity), tuning.zipBoost);
  body.velocity.y = Math.max(body.velocity.y, tuning.zipMinimumUp);
  body.zipTime = body.time;
  return true;
}

/** Returns whether automatic rope shortening should supplement explicit player input. */
export function shouldAutoReel(body, assistState) {
  return Boolean(body.anchor && assistState?.autoReel);
}
