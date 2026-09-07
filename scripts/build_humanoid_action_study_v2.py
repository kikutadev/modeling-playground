"""Generate readable web-shooter action poses using world-space targets and analytic two-bone IK.

This replaces the first Euler-angle study, whose local-axis assumptions produced
unreadable poses.  Authoring happens in Blender Z-up coordinates; all limb
poses are described by end-effector targets and pole vectors, then baked to the
humanoid skeleton for GLB export.
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Quaternion, Vector

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import build_humanoid_deform_study as base

FPS = base.FPS
OUT = base.OUT


def v(x, y, z):
    return Vector((x, y, z))


# End-effector driven poses.  -Y is character forward in Blender authoring space.
# Targets are intentionally theatrical: these are silhouette/deformation tests.
POSES = {
    "Neutral": {
        "pelvis": v(0.00, 0.00, 0.98), "chest": v(0.00, -0.01, 1.43),
        "head": v(0.00, -0.03, 1.78), "yaw": 0,
        "left_hand": v(-0.47, -0.05, 1.04), "left_elbow_pole": v(-0.55, -0.25, 1.28),
        "right_hand": v(0.47, -0.05, 1.04), "right_elbow_pole": v(0.55, -0.25, 1.28),
        "left_ankle": v(-0.11, 0.00, 0.13), "left_knee_pole": v(-0.12, -0.40, 0.53),
        "right_ankle": v(0.11, 0.00, 0.13), "right_knee_pole": v(0.12, -0.40, 0.53),
        "left_toe": v(-0.11, -0.27, 0.07), "right_toe": v(0.11, -0.27, 0.07),
        "head_look": v(0.00, -1.0, 0.05),
    },
    "SwingReach": {
        # Long, pendulum-like silhouette: the anchor hand leads while the pelvis
        # and both feet trail behind the web line instead of hovering under it.
        "pelvis": v(0.14, 0.30, 1.24), "chest": v(-0.02, 0.03, 1.58),
        "head": v(-0.06, -0.05, 1.84), "yaw": -10,
        "left_hand": v(-0.42, -0.10, 2.22), "left_elbow_pole": v(-0.80, 0.05, 1.88),
        "right_hand": v(0.68, 0.38, 1.26), "right_elbow_pole": v(0.80, 0.08, 1.52),
        "left_ankle": v(-0.24, 0.72, 0.82), "left_knee_pole": v(-0.44, 0.30, 1.12),
        "right_ankle": v(0.42, 0.84, 0.68), "right_knee_pole": v(0.54, 0.34, 1.04),
        "left_toe": v(-0.26, 0.52, 0.72), "right_toe": v(0.46, 0.64, 0.58),
        "head_look": v(0.02, -1.0, 0.10),
    },
    "SwingTuck": {
        "pelvis": v(0.02, 0.10, 1.30), "chest": v(-0.05, -0.07, 1.58),
        "head": v(-0.08, -0.13, 1.82), "yaw": -10,
        "left_hand": v(-0.34, -0.14, 2.14), "left_elbow_pole": v(-0.70, -0.02, 1.76),
        "right_hand": v(0.18, -0.28, 1.30), "right_elbow_pole": v(0.62, -0.36, 1.50),
        "left_ankle": v(-0.30, 0.04, 1.10), "left_knee_pole": v(-0.44, -0.38, 1.34),
        "right_ankle": v(0.28, 0.12, 1.04), "right_knee_pole": v(0.42, -0.34, 1.33),
        "left_toe": v(-0.35, -0.13, 1.05), "right_toe": v(0.34, -0.04, 0.98),
        "head_look": v(0.00, -1.0, 0.06),
    },
    "WallRun": {
        "pelvis": v(0.12, 0.00, 1.10), "chest": v(0.00, -0.18, 1.52),
        "head": v(-0.02, -0.24, 1.82), "yaw": -14,
        "left_hand": v(-0.54, -0.30, 1.68), "left_elbow_pole": v(-0.68, -0.05, 1.44),
        "right_hand": v(0.50, 0.08, 1.10), "right_elbow_pole": v(0.70, -0.24, 1.36),
        "left_ankle": v(-0.24, -0.24, 0.72), "left_knee_pole": v(-0.34, -0.58, 1.03),
        "right_ankle": v(0.34, 0.16, 0.50), "right_knee_pole": v(0.44, -0.12, 0.90),
        "left_toe": v(-0.25, -0.43, 0.69), "right_toe": v(0.35, -0.02, 0.43),
        "head_look": v(0.00, -1.0, 0.02),
    },
    "AerialAim": {
        # Keep the shooting arm visibly extended in screen silhouette; aiming
        # only along -Y reads as two fists folded against the chest.
        "pelvis": v(-0.04, 0.10, 1.22), "chest": v(0.05, -0.10, 1.54),
        "head": v(0.08, -0.17, 1.82), "yaw": 24,
        "left_hand": v(-0.54, 0.16, 1.24), "left_elbow_pole": v(-0.72, -0.10, 1.46),
        "right_hand": v(0.86, -0.16, 1.60), "right_elbow_pole": v(0.52, -0.30, 1.40),
        "left_ankle": v(-0.42, 0.26, 0.72), "left_knee_pole": v(-0.52, -0.14, 1.04),
        "right_ankle": v(0.34, 0.38, 0.84), "right_knee_pole": v(0.46, -0.06, 1.08),
        "left_toe": v(-0.43, 0.08, 0.64), "right_toe": v(0.37, 0.20, 0.76),
        "head_look": v(0.55, -0.82, 0.02),
    },
    "AirKick": {
        "pelvis": v(0.00, 0.10, 1.24), "chest": v(-0.05, -0.08, 1.52),
        "head": v(-0.08, -0.14, 1.79), "yaw": -6,
        "left_hand": v(-0.48, 0.03, 1.26), "left_elbow_pole": v(-0.70, -0.24, 1.48),
        "right_hand": v(0.48, 0.10, 1.35), "right_elbow_pole": v(0.70, -0.20, 1.50),
        "left_ankle": v(-0.18, -0.72, 1.30), "left_knee_pole": v(-0.30, -0.36, 1.46),
        "right_ankle": v(0.26, 0.14, 0.86), "right_knee_pole": v(0.42, -0.24, 1.16),
        "left_toe": v(-0.18, -0.92, 1.31), "right_toe": v(0.28, -0.04, 0.80),
        "head_look": v(0.00, -1.0, 0.00),
    },
    "Landing": {
        # Three-point landing: support hand stays under the shoulder/COM, the
        # opposite arm sweeps behind the torso instead of floating sideways.
        "pelvis": v(0.06, 0.03, 0.60), "chest": v(-0.02, -0.30, 0.96),
        "head": v(-0.04, -0.43, 1.18), "yaw": -10,
        "left_hand": v(-0.20, -0.39, 0.08), "left_elbow_pole": v(-0.64, -0.34, 0.46),
        "right_hand": v(0.34, 0.38, 0.66), "right_elbow_pole": v(0.70, 0.46, 1.06),
        "left_ankle": v(-0.30, -0.20, 0.12), "left_knee_pole": v(-0.32, -0.58, 0.45),
        "right_ankle": v(0.48, 0.18, 0.12), "right_knee_pole": v(0.50, -0.26, 0.46),
        "left_toe": v(-0.31, -0.43, 0.07), "right_toe": v(0.51, -0.05, 0.07),
        "head_look": v(0.04, -1.0, 0.00),
    },
}


def bone_length(name: str) -> float:
    rest = base.REST[name]
    return (rest["tail"] - rest["head"]).length


def solve_two_bone(start: Vector, target: Vector, pole: Vector, upper_len: float, lower_len: float):
    """Analytic two-bone IK returning elbow/knee and reachable end positions."""
    to_target = target - start
    raw_distance = max(to_target.length, 1e-6)
    direction = to_target / raw_distance
    distance = min(max(raw_distance, abs(upper_len - lower_len) + 1e-5), upper_len + lower_len - 1e-5)
    along = (upper_len * upper_len - lower_len * lower_len + distance * distance) / (2.0 * distance)
    height = math.sqrt(max(upper_len * upper_len - along * along, 0.0))
    pole_dir = pole - start
    pole_dir -= direction * pole_dir.dot(direction)
    if pole_dir.length < 1e-5:
        pole_dir = direction.cross(Vector((0, 0, 1)))
        if pole_dir.length < 1e-5:
            pole_dir = direction.cross(Vector((1, 0, 0)))
    pole_dir.normalize()
    joint = start + direction * along + pole_dir * height
    end = start + direction * distance
    return joint, end


def make_bone_matrix(head: Vector, tail: Vector) -> Matrix:
    """Construct an armature-space pose matrix with local +Y along the bone."""
    direction = tail - head
    if direction.length < 1e-6:
        direction = Vector((0, 0, 1))
    rotation = direction.normalized().to_track_quat("Y", "Z")
    return Matrix.Translation(head) @ rotation.to_matrix().to_4x4()


def set_bone(arm, name: str, head: Vector, tail: Vector) -> Vector:
    """Set a bone to an armature-space target through matrix_basis.

    PoseBone.matrix is a final evaluated transform and assigning it directly can
    compound parent transforms.  Solving matrix_basis against the parent's
    evaluated pose keeps the requested world-space head/direction stable.
    """
    pb = arm.pose.bones[name]
    pb.rotation_mode = "QUATERNION"
    rest = pb.bone.matrix_local.copy()
    length = bone_length(name)
    direction = (tail - head).normalized() if (tail - head).length > 1e-6 else Vector((0, 0, 1))
    actual_tail = head + direction * length
    desired = make_bone_matrix(head, actual_tail)
    if pb.parent is None:
        basis = rest.inverted() @ desired
    else:
        parent_rest = pb.parent.bone.matrix_local.copy()
        relative_rest = parent_rest.inverted() @ rest
        basis = relative_rest.inverted() @ pb.parent.matrix.inverted() @ desired
    pb.matrix_basis = basis
    bpy.context.view_layer.update()
    return actual_tail


def apply_semantic_pose(arm, cfg) -> None:
    """Pose the full skeleton from semantic body/end-effector targets."""
    base.clear_pose(arm)
    bpy.context.view_layer.update()

    pelvis = cfg["pelvis"]
    chest_target = cfg["chest"]
    head_target = cfg["head"]
    yaw = math.radians(cfg.get("yaw", 0.0))
    right = Vector((math.cos(yaw), math.sin(yaw), 0.0)).normalized()

    # Root stays near the scene origin; Hips owns the airborne/crouched body offset.
    set_bone(arm, "Root", v(0, 0, 0), v(0, 0, 0.2))
    hips_tail = set_bone(arm, "Hips", pelvis, chest_target)
    spine_tail = set_bone(arm, "Spine", hips_tail, chest_target)
    chest_tail = set_bone(arm, "Chest", spine_tail, head_target)
    neck_tail = set_bone(arm, "Neck", chest_tail, head_target)
    look = cfg.get("head_look", v(0, -1, 0))
    set_bone(arm, "Head", neck_tail, neck_tail + Vector((look.x, look.y, max(0.25, look.z + 0.28))))

    # Shoulder and hip attachment points are derived from the body frame.
    shoulder_center = chest_tail - (chest_tail - spine_tail).normalized() * 0.04
    left_shoulder = shoulder_center - right * 0.20
    right_shoulder = shoulder_center + right * 0.20
    left_clav_head = shoulder_center - right * 0.02
    right_clav_head = shoulder_center + right * 0.02
    set_bone(arm, "LeftClavicle", left_clav_head, left_shoulder)
    set_bone(arm, "RightClavicle", right_clav_head, right_shoulder)

    for side, shoulder in (("Left", left_shoulder), ("Right", right_shoulder)):
        key = side.lower()
        elbow, wrist = solve_two_bone(
            shoulder, cfg[f"{key}_hand"], cfg[f"{key}_elbow_pole"],
            bone_length(f"{side}UpperArm"), bone_length(f"{side}Forearm"),
        )
        set_bone(arm, f"{side}UpperArm", shoulder, elbow)
        set_bone(arm, f"{side}Forearm", elbow, wrist)
        hand_dir = cfg[f"{key}_hand"] - wrist
        if hand_dir.length < 1e-5:
            hand_dir = wrist - elbow
        set_bone(arm, f"{side}Hand", wrist, wrist + hand_dir)

    left_hip = pelvis - right * 0.11
    right_hip = pelvis + right * 0.11
    for side, hip in (("Left", left_hip), ("Right", right_hip)):
        key = side.lower()
        knee, ankle = solve_two_bone(
            hip, cfg[f"{key}_ankle"], cfg[f"{key}_knee_pole"],
            bone_length(f"{side}Thigh"), bone_length(f"{side}Shin"),
        )
        set_bone(arm, f"{side}Thigh", hip, knee)
        set_bone(arm, f"{side}Shin", knee, ankle)
        toe_target = cfg[f"{key}_toe"]
        foot_tail = set_bone(arm, f"{side}Foot", ankle, toe_target)
        toe_dir = toe_target - foot_tail
        if toe_dir.length < 1e-5:
            toe_dir = Vector((0, -1, 0))
        set_bone(arm, f"{side}Toe", foot_tail, foot_tail + toe_dir)

    bpy.context.view_layer.update()


def capture_pose(arm):
    """Capture matrix_basis components independent of the bone's prior rotation mode."""
    result = {}
    for bone in arm.pose.bones:
        location, rotation, scale = bone.matrix_basis.decompose()
        result[bone.name] = (location.copy(), rotation.copy(), scale.copy())
    return result


def key_current_pose(arm, frame: int) -> None:
    for bone in arm.pose.bones:
        bone.rotation_mode = "QUATERNION"
        bone.keyframe_insert(data_path="location", frame=frame, group=bone.name)
        bone.keyframe_insert(data_path="rotation_quaternion", frame=frame, group=bone.name)
        bone.keyframe_insert(data_path="scale", frame=frame, group=bone.name)


def interpolate_pose(arm, a, b, t: float) -> None:
    for bone in arm.pose.bones:
        loc_a, rot_a, scale_a = a[bone.name]
        loc_b, rot_b, scale_b = b[bone.name]
        bone.rotation_mode = "QUATERNION"
        bone.location = loc_a.lerp(loc_b, t)
        bone.rotation_quaternion = rot_a.slerp(rot_b, t)
        bone.scale = scale_a.lerp(scale_b, t)
    bpy.context.view_layer.update()


def build_actions(arm):
    scene = bpy.context.scene
    scene.render.fps = FPS
    arm.animation_data_create()
    actions = []

    apply_semantic_pose(arm, POSES["Neutral"])
    neutral = capture_pose(arm)

    for clip_name, duration in base.CLIP_DURATIONS.items():
        action = bpy.data.actions.new(clip_name)
        arm.animation_data.action = action
        frame_end = round(duration * FPS)
        if clip_name == "Neutral":
            interpolate_pose(arm, neutral, neutral, 0)
            key_current_pose(arm, 0)
            key_current_pose(arm, frame_end)
        else:
            apply_semantic_pose(arm, POSES[clip_name])
            extreme = capture_pose(arm)
            for fraction, strength in ((0.0, 0.0), (0.26, 0.45), (0.64, 1.0), (1.0, 0.92)):
                interpolate_pose(arm, neutral, extreme, strength)
                key_current_pose(arm, round(frame_end * fraction))

        for curve in action.fcurves:
            for point in curve.keyframe_points:
                point.interpolation = "BEZIER"
        actions.append((clip_name, action, frame_end))

    arm.animation_data.action = None
    for clip_name, action, frame_end in actions:
        track = arm.animation_data.nla_tracks.new()
        track.name = clip_name
        strip = track.strips.new(clip_name, 0, action)
        strip.action_frame_start = 0
        strip.action_frame_end = frame_end
        strip.frame_start = 0
        strip.frame_end = frame_end
    apply_semantic_pose(arm, POSES["Neutral"])
    return actions



def create_rigid_prop(name, arm, bone_name, location, scale, material, primitive="cube"):
    """Create a small rigidly-skinned readability prop attached to one bone."""
    if primitive == "sphere":
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1.0, location=location)
    else:
        bpy.ops.mesh.primitive_cube_add(size=2.0, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    obj.parent = arm
    group = obj.vertex_groups.new(name=bone_name)
    group.add([vertex.index for vertex in obj.data.vertices], 1.0, "REPLACE")
    modifier = obj.modifiers.new("Humanoid skin", "ARMATURE")
    modifier.object = arm
    return obj


def create_readability_props(arm, materials):
    props = []
    for side, x in (("Left", -0.82), ("Right", 0.82)):
        props.append(create_rigid_prop(
            f"{side}Glove", arm, f"{side}Hand", (x, -0.02, 1.12),
            (0.065, 0.055, 0.075), materials[side.lower()], primitive="sphere",
        ))
    for side, x in (("Left", -0.11), ("Right", 0.11)):
        props.append(create_rigid_prop(
            f"{side}Boot", arm, f"{side}Foot", (x, -0.22, 0.10),
            (0.075, 0.16, 0.055), materials[side.lower()], primitive="sphere",
        ))
    props.append(create_rigid_prop(
        "FaceMarker", arm, "Head", (0.0, -0.145, 1.80),
        (0.035, 0.020, 0.035), materials["accent"], primitive="sphere",
    ))
    return props

def main() -> None:
    base.reset_scene()
    materials = {
        "body": base.make_material("Neutral suit", (.20, .22, .25, 1)),
        "left": base.make_material("Left side", (.18, .48, .72, 1)),
        "right": base.make_material("Right side", (.78, .24, .22, 1)),
        "head": base.make_material("Head", (.70, .72, .72, 1)),
        "ground": base.make_material("Ground", (.72, .74, .76, 1), .9),
        "accent": base.make_material("Visor", (.04, .06, .08, 1), .45),
    }
    arm = base.create_armature()
    meshes = base.create_body_meshes(arm, materials)
    meshes.extend(create_readability_props(arm, materials))
    actions = build_actions(arm)
    base.validate(arm, meshes, actions)
    base.export_glb(arm, meshes)
    base.write_contract()
    base.setup_studio(materials)
    if "--skip-render" in sys.argv:
        bpy.ops.wm.save_as_mainfile(filepath=str(OUT / "humanoid-deform-study.blend"))
    else:
        base.render_pose_previews(arm, actions)


if __name__ == "__main__":
    main()
