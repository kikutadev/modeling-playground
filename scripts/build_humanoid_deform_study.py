"""Build a game-action humanoid rig/deformation study for Blender -> GLB.

The asset is intentionally a neutral mannequin rather than a finished character.
It exists to validate the skeletal range and skin deformation required by a
web-swing / wall-contact / aerial-combat action game before production topology
is committed.
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Euler, Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output"
FPS = 30

# Blender authoring coordinates: Z-up, -Y forward. glTF exporter converts to Y-up.
BONES = [
    ("Root", (0.0, 0.0, 0.0), (0.0, 0.0, 0.20), None),
    ("Hips", (0.0, 0.0, 0.96), (0.0, 0.0, 1.08), "Root"),
    ("Spine", (0.0, 0.0, 1.08), (0.0, 0.0, 1.32), "Hips"),
    ("Chest", (0.0, 0.0, 1.32), (0.0, 0.0, 1.55), "Spine"),
    ("Neck", (0.0, 0.0, 1.55), (0.0, 0.0, 1.65), "Chest"),
    ("Head", (0.0, 0.0, 1.65), (0.0, 0.0, 1.93), "Neck"),
    ("LeftClavicle", (0.0, 0.0, 1.51), (-0.18, 0.0, 1.52), "Chest"),
    ("LeftUpperArm", (-0.18, 0.0, 1.52), (-0.50, 0.0, 1.33), "LeftClavicle"),
    ("LeftForearm", (-0.50, 0.0, 1.33), (-0.76, -0.01, 1.16), "LeftUpperArm"),
    ("LeftHand", (-0.76, -0.01, 1.16), (-0.88, -0.03, 1.08), "LeftForearm"),
    ("RightClavicle", (0.0, 0.0, 1.51), (0.18, 0.0, 1.52), "Chest"),
    ("RightUpperArm", (0.18, 0.0, 1.52), (0.50, 0.0, 1.33), "RightClavicle"),
    ("RightForearm", (0.50, 0.0, 1.33), (0.76, -0.01, 1.16), "RightUpperArm"),
    ("RightHand", (0.76, -0.01, 1.16), (0.88, -0.03, 1.08), "RightForearm"),
    ("LeftThigh", (-0.11, 0.0, 0.96), (-0.11, 0.0, 0.55), "Hips"),
    ("LeftShin", (-0.11, 0.0, 0.55), (-0.11, 0.0, 0.14), "LeftThigh"),
    ("LeftFoot", (-0.11, 0.0, 0.14), (-0.11, -0.20, 0.08), "LeftShin"),
    ("LeftToe", (-0.11, -0.20, 0.08), (-0.11, -0.34, 0.08), "LeftFoot"),
    ("RightThigh", (0.11, 0.0, 0.96), (0.11, 0.0, 0.55), "Hips"),
    ("RightShin", (0.11, 0.0, 0.55), (0.11, 0.0, 0.14), "RightThigh"),
    ("RightFoot", (0.11, 0.0, 0.14), (0.11, -0.20, 0.08), "RightShin"),
    ("RightToe", (0.11, -0.20, 0.08), (0.11, -0.34, 0.08), "RightFoot"),
]

REST = {name: {"head": Vector(head), "tail": Vector(tail), "parent": parent}
        for name, head, tail, parent in BONES}

# Rotation values are local XYZ degrees. They are deliberately exaggerated:
# this is a range/deformation test, not a polished animation set.
POSES = {
    "SwingReach": {
        "Hips": ((0, 0, 0.04), (8, 0, -6)),
        "Spine": ((0, 0, 0), (-14, 0, 6)),
        "Chest": ((0, 0, 0), (-20, 0, 8)),
        "LeftClavicle": ((0, 0, 0), (0, 0, -34)),
        "LeftUpperArm": ((0, 0, 0), (-72, -12, -42)),
        "LeftForearm": ((0, 0, 0), (-48, 0, 5)),
        "RightClavicle": ((0, 0, 0), (0, 0, 18)),
        "RightUpperArm": ((0, 0, 0), (-24, 14, 34)),
        "RightForearm": ((0, 0, 0), (-35, 0, -8)),
        "LeftThigh": ((0, 0, 0), (26, 0, -12)),
        "LeftShin": ((0, 0, 0), (-35, 0, 0)),
        "RightThigh": ((0, 0, 0), (-20, 0, 16)),
        "RightShin": ((0, 0, 0), (-18, 0, 0)),
        "Head": ((0, 0, 0), (18, 0, -8)),
    },
    "SwingTuck": {
        "Hips": ((0, 0, 0.12), (-18, 0, 10)),
        "Spine": ((0, 0, 0), (24, 0, -6)),
        "Chest": ((0, 0, 0), (18, 0, -8)),
        "LeftClavicle": ((0, 0, 0), (0, 0, -28)),
        "LeftUpperArm": ((0, 0, 0), (-60, -12, -34)),
        "LeftForearm": ((0, 0, 0), (-70, 0, 0)),
        "RightUpperArm": ((0, 0, 0), (32, 0, 28)),
        "RightForearm": ((0, 0, 0), (-88, 0, 0)),
        "LeftThigh": ((0, 0, 0), (72, 8, -18)),
        "LeftShin": ((0, 0, 0), (-118, 0, 0)),
        "RightThigh": ((0, 0, 0), (82, -10, 18)),
        "RightShin": ((0, 0, 0), (-126, 0, 0)),
        "LeftFoot": ((0, 0, 0), (20, 0, 0)),
        "RightFoot": ((0, 0, 0), (22, 0, 0)),
        "Head": ((0, 0, 0), (-12, 0, 6)),
    },
    "WallRun": {
        "Hips": ((0, 0, 0.04), (8, -6, -20)),
        "Spine": ((0, 0, 0), (-4, 8, 14)),
        "Chest": ((0, 0, 0), (-8, 10, 16)),
        "LeftClavicle": ((0, 0, 0), (0, 0, -22)),
        "LeftUpperArm": ((0, 0, 0), (-44, 10, -36)),
        "LeftForearm": ((0, 0, 0), (-62, 0, 4)),
        "RightUpperArm": ((0, 0, 0), (36, -10, 28)),
        "RightForearm": ((0, 0, 0), (-26, 0, -8)),
        "LeftThigh": ((0, 0, 0), (58, 4, -18)),
        "LeftShin": ((0, 0, 0), (-92, 0, 0)),
        "RightThigh": ((0, 0, 0), (-36, -6, 14)),
        "RightShin": ((0, 0, 0), (-42, 0, 0)),
        "Head": ((0, 0, 0), (8, 6, -10)),
    },
    "AerialAim": {
        "Hips": ((0, 0, 0.10), (-8, 0, 12)),
        "Spine": ((0, 0, 0), (-8, 0, -18)),
        "Chest": ((0, 0, 0), (-6, 0, -26)),
        "RightClavicle": ((0, 0, 0), (0, 0, 24)),
        "RightUpperArm": ((0, 0, 0), (-74, 6, 38)),
        "RightForearm": ((0, 0, 0), (-16, 0, 0)),
        "RightHand": ((0, 0, 0), (0, 0, 10)),
        "LeftClavicle": ((0, 0, 0), (0, 0, -14)),
        "LeftUpperArm": ((0, 0, 0), (26, -8, -30)),
        "LeftForearm": ((0, 0, 0), (-52, 0, 0)),
        "LeftThigh": ((0, 0, 0), (38, 8, -24)),
        "LeftShin": ((0, 0, 0), (-60, 0, 0)),
        "RightThigh": ((0, 0, 0), (-22, -8, 22)),
        "RightShin": ((0, 0, 0), (-30, 0, 0)),
        "Head": ((0, 0, 0), (10, 0, -28)),
    },
    "AirKick": {
        "Hips": ((0, 0, 0.10), (4, 0, -16)),
        "Spine": ((0, 0, 0), (-10, 0, 16)),
        "Chest": ((0, 0, 0), (-14, 0, 22)),
        "LeftUpperArm": ((0, 0, 0), (28, 8, -34)),
        "LeftForearm": ((0, 0, 0), (-76, 0, 0)),
        "RightUpperArm": ((0, 0, 0), (30, -8, 30)),
        "RightForearm": ((0, 0, 0), (-72, 0, 0)),
        "LeftThigh": ((0, 0, 0), (88, 0, -14)),
        "LeftShin": ((0, 0, 0), (-12, 0, 0)),
        "LeftFoot": ((0, 0, 0), (-8, 0, 0)),
        "RightThigh": ((0, 0, 0), (38, 8, 22)),
        "RightShin": ((0, 0, 0), (-112, 0, 0)),
        "Head": ((0, 0, 0), (4, 0, 18)),
    },
    "Landing": {
        "Hips": ((0, 0, -0.36), (24, 0, 0)),
        "Spine": ((0, 0, 0), (28, 0, 0)),
        "Chest": ((0, 0, 0), (-18, 0, 0)),
        "LeftClavicle": ((0, 0, 0), (0, 0, -18)),
        "LeftUpperArm": ((0, 0, 0), (58, 6, -36)),
        "LeftForearm": ((0, 0, 0), (-96, 0, 0)),
        "RightUpperArm": ((0, 0, 0), (22, -6, 30)),
        "RightForearm": ((0, 0, 0), (-76, 0, 0)),
        "LeftThigh": ((0, 0, 0), (78, 0, -22)),
        "LeftShin": ((0, 0, 0), (-124, 0, 0)),
        "RightThigh": ((0, 0, 0), (74, 0, 22)),
        "RightShin": ((0, 0, 0), (-120, 0, 0)),
        "LeftFoot": ((0, 0, 0), (24, 0, 0)),
        "RightFoot": ((0, 0, 0), (24, 0, 0)),
        "Head": ((0, 0, 0), (-20, 0, 0)),
    },
}

CLIP_DURATIONS = {
    "Neutral": 1.0,
    "SwingReach": 1.2,
    "SwingTuck": 1.2,
    "WallRun": 1.0,
    "AerialAim": 1.0,
    "AirKick": 0.9,
    "Landing": 1.0,
}


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.armatures, bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        # Only remove orphaned data left by previous runs in the same Blender process.
        for block in list(datablocks):
            if block.users == 0:
                datablocks.remove(block)


def make_material(name: str, rgba: tuple[float, float, float, float], roughness: float = 0.72):
    material = bpy.data.materials.new(name)
    material.diffuse_color = rgba
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Roughness"].default_value = roughness
    return material


def create_armature():
    data = bpy.data.armatures.new("HumanoidStudySkeleton")
    arm = bpy.data.objects.new("HumanoidStudyRig", data)
    bpy.context.collection.objects.link(arm)
    arm.show_in_front = True
    data.display_type = "OCTAHEDRAL"

    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    for name, head, tail, parent in BONES:
        bone = data.edit_bones.new(name)
        bone.head = head
        bone.tail = tail
        if parent:
            bone.parent = data.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")

    arm["title"] = "Humanoid Deformation Study — web shooter action range"
    arm["assetId"] = "humanoid-deform-study"
    arm["assetVersion"] = 1
    arm["units"] = "meters"
    arm["groundLevel"] = 0.0
    arm["rigged"] = True
    arm["animationModes"] = {
        "Neutral": "repeat",
        "SwingReach": "once",
        "SwingTuck": "once",
        "WallRun": "repeat",
        "AerialAim": "once",
        "AirKick": "once",
        "Landing": "once",
    }
    return arm


def _frame_for_tangent(tangent: Vector) -> tuple[Vector, Vector]:
    tangent = tangent.normalized()
    helper = Vector((0.0, 1.0, 0.0))
    if abs(tangent.dot(helper)) > 0.92:
        helper = Vector((1.0, 0.0, 0.0))
    u = tangent.cross(helper).normalized()
    v = tangent.cross(u).normalized()
    return u, v


def create_skin_tube(
    name: str,
    arm,
    centers: list[Vector],
    radii: list[tuple[float, float]],
    ring_weights: list[dict[str, float]],
    material,
    sides: int = 12,
):
    """Create a low-poly elliptical tube with explicit per-ring skin weights."""
    assert len(centers) == len(radii) == len(ring_weights)
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []

    for index, center in enumerate(centers):
        if index == 0:
            tangent = centers[1] - center
        elif index == len(centers) - 1:
            tangent = center - centers[index - 1]
        else:
            tangent = centers[index + 1] - centers[index - 1]
        u, v = _frame_for_tangent(tangent)
        ru, rv = radii[index]
        for side in range(sides):
            angle = side / sides * math.tau
            point = center + u * (math.cos(angle) * ru) + v * (math.sin(angle) * rv)
            vertices.append(tuple(point))

    for ring in range(len(centers) - 1):
        a = ring * sides
        b = (ring + 1) * sides
        for side in range(sides):
            nxt = (side + 1) % sides
            faces.append((a + side, a + nxt, b + nxt, b + side))

    # Caps make silhouette/normal validation deterministic and avoid open geometry.
    start_center = len(vertices)
    vertices.append(tuple(centers[0]))
    end_center = len(vertices)
    vertices.append(tuple(centers[-1]))
    for side in range(sides):
        nxt = (side + 1) % sides
        faces.append((start_center, nxt, side))
        last = (len(centers) - 1) * sides
        faces.append((end_center, last + side, last + nxt))

    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    mesh.validate(verbose=False)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    obj.parent = arm

    # Create exactly one vertex group per deform bone. Re-creating the same
    # name makes Blender auto-suffix groups (.001, .002, ...), which silently
    # disconnects weights from the armature bone names.
    deform_bones = sorted({bone for weights in ring_weights for bone in weights})
    groups = {bone: obj.vertex_groups.new(name=bone) for bone in deform_bones}
    for ring, weights in enumerate(ring_weights):
        total = sum(weights.values())
        assert total > 0
        normalized = {bone: value / total for bone, value in weights.items() if value > 0}
        indices = [ring * sides + side for side in range(sides)]
        for bone, value in normalized.items():
            groups[bone].add(indices, value, "REPLACE")

    # Cap center follows the same weights as the corresponding terminal ring.
    for vertex_index, weights in ((start_center, ring_weights[0]), (end_center, ring_weights[-1])):
        total = sum(weights.values())
        for bone, value in weights.items():
            if value > 0:
                groups[bone].add([vertex_index], value / total, "REPLACE")

    modifier = obj.modifiers.new("Humanoid skin", "ARMATURE")
    modifier.object = arm
    modifier.use_deform_preserve_volume = True
    return obj


def lerp(a: Vector, b: Vector, t: float) -> Vector:
    return a.lerp(b, t)


def create_body_meshes(arm, materials):
    meshes = []

    torso_centers = [
        Vector((0, 0, .94)), Vector((0, 0, 1.03)), Vector((0, 0, 1.12)),
        Vector((0, 0, 1.24)), Vector((0, 0, 1.36)), Vector((0, 0, 1.47)),
        Vector((0, 0, 1.55)),
    ]
    torso_radii = [(.18, .12), (.20, .13), (.17, .115), (.18, .12), (.225, .135), (.235, .14), (.18, .115)]
    torso_weights = [
        {"Hips": 1}, {"Hips": .75, "Spine": .25}, {"Hips": .2, "Spine": .8},
        {"Spine": .75, "Chest": .25}, {"Spine": .25, "Chest": .75},
        {"Chest": 1}, {"Chest": 1},
    ]
    meshes.append(create_skin_tube("Torso", arm, torso_centers, torso_radii, torso_weights, materials["body"], 14))

    neck_centers = [Vector((0, 0, 1.54)), Vector((0, 0, 1.60)), Vector((0, 0, 1.66))]
    meshes.append(create_skin_tube("Neck", arm, neck_centers, [(.07, .065)] * 3,
                                   [{"Chest": .4, "Neck": .6}, {"Neck": 1}, {"Neck": .4, "Head": .6}],
                                   materials["body"], 10))

    for side, prefix, mat_name in ((-1, "Left", "left"), (1, "Right", "right")):
        upper = REST[prefix + "UpperArm"]
        fore = REST[prefix + "Forearm"]
        hand = REST[prefix + "Hand"]
        arm_centers = [
            upper["head"], lerp(upper["head"], upper["tail"], .35),
            lerp(upper["head"], upper["tail"], .78), upper["tail"],
            lerp(fore["head"], fore["tail"], .45), fore["tail"], hand["tail"],
        ]
        arm_radii = [(.085, .09), (.078, .082), (.071, .074), (.066, .068), (.062, .064), (.055, .057), (.045, .048)]
        arm_weights = [
            {prefix + "UpperArm": 1}, {prefix + "UpperArm": 1},
            {prefix + "UpperArm": .8, prefix + "Forearm": .2},
            {prefix + "UpperArm": .5, prefix + "Forearm": .5},
            {prefix + "Forearm": 1}, {prefix + "Forearm": .55, prefix + "Hand": .45},
            {prefix + "Hand": 1},
        ]
        meshes.append(create_skin_tube("Arm" + prefix, arm, arm_centers, arm_radii, arm_weights, materials[mat_name], 12))

        thigh = REST[prefix + "Thigh"]
        shin = REST[prefix + "Shin"]
        foot = REST[prefix + "Foot"]
        toe = REST[prefix + "Toe"]
        leg_centers = [
            thigh["head"], lerp(thigh["head"], thigh["tail"], .35),
            lerp(thigh["head"], thigh["tail"], .78), thigh["tail"],
            lerp(shin["head"], shin["tail"], .5), shin["tail"],
            foot["tail"], toe["tail"],
        ]
        leg_radii = [(.105, .11), (.10, .105), (.088, .092), (.078, .082), (.072, .076), (.062, .067), (.066, .09), (.052, .075)]
        leg_weights = [
            {prefix + "Thigh": 1}, {prefix + "Thigh": 1},
            {prefix + "Thigh": .8, prefix + "Shin": .2},
            {prefix + "Thigh": .5, prefix + "Shin": .5},
            {prefix + "Shin": 1}, {prefix + "Shin": .55, prefix + "Foot": .45},
            {prefix + "Foot": .7, prefix + "Toe": .3}, {prefix + "Toe": 1},
        ]
        meshes.append(create_skin_tube("Leg" + prefix, arm, leg_centers, leg_radii, leg_weights, materials[mat_name], 12))

        clav = REST[prefix + "Clavicle"]
        shoulder_centers = [clav["head"], lerp(clav["head"], clav["tail"], .6), clav["tail"]]
        shoulder_weights = [
            {"Chest": .75, prefix + "Clavicle": .25}, {prefix + "Clavicle": 1},
            {prefix + "Clavicle": .55, prefix + "UpperArm": .45},
        ]
        meshes.append(create_skin_tube("Shoulder" + prefix, arm, shoulder_centers,
                                       [(.075, .065), (.09, .075), (.095, .085)],
                                       shoulder_weights, materials[mat_name], 12))

    # Head is an applied UV sphere, weighted rigidly to Head. A rigid head keeps
    # the study focused on neck/limb deformation instead of facial topology.
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, radius=.14, location=(0, -.015, 1.80))
    head = bpy.context.object
    head.name = "HeadMesh"
    head.scale = (.92, 1.00, 1.18)
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=True)
    head.data.materials.append(materials["head"])
    head.parent = arm
    group = head.vertex_groups.new(name="Head")
    group.add([vertex.index for vertex in head.data.vertices], 1.0, "REPLACE")
    modifier = head.modifiers.new("Humanoid skin", "ARMATURE")
    modifier.object = arm
    meshes.append(head)

    return meshes


def clear_pose(arm) -> None:
    for bone in arm.pose.bones:
        bone.rotation_mode = "XYZ"
        bone.location = (0, 0, 0)
        bone.rotation_euler = (0, 0, 0)
        bone.scale = (1, 1, 1)


def apply_pose(arm, pose: dict[str, tuple[tuple[float, float, float], tuple[float, float, float]]], strength: float = 1.0) -> None:
    clear_pose(arm)
    for name, (location, rotation_deg) in pose.items():
        bone = arm.pose.bones[name]
        bone.location = Vector(location) * strength
        bone.rotation_euler = Euler(tuple(math.radians(value * strength) for value in rotation_deg), "XYZ")


def key_pose(arm, frame: int) -> None:
    for bone in arm.pose.bones:
        bone.keyframe_insert(data_path="location", frame=frame, group=bone.name)
        bone.keyframe_insert(data_path="rotation_euler", frame=frame, group=bone.name)
        bone.keyframe_insert(data_path="scale", frame=frame, group=bone.name)


def build_actions(arm):
    scene = bpy.context.scene
    scene.render.fps = FPS
    arm.animation_data_create()
    actions = []

    for clip_name, duration in CLIP_DURATIONS.items():
        action = bpy.data.actions.new(clip_name)
        arm.animation_data.action = action
        clear_pose(arm)
        frame_end = round(duration * FPS)

        if clip_name == "Neutral":
            for frame, chest_pitch in ((0, 0), (frame_end // 2, -2.0), (frame_end, 0)):
                clear_pose(arm)
                arm.pose.bones["Chest"].rotation_euler.x = math.radians(chest_pitch)
                key_pose(arm, frame)
        else:
            pose = POSES[clip_name]
            # Scrubbable deformation study: neutral -> readable extreme -> settle.
            apply_pose(arm, pose, 0.0)
            key_pose(arm, 0)
            apply_pose(arm, pose, .55)
            key_pose(arm, max(1, round(frame_end * .32)))
            apply_pose(arm, pose, 1.0)
            key_pose(arm, max(2, round(frame_end * .72)))
            apply_pose(arm, pose, .92)
            key_pose(arm, frame_end)

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
    clear_pose(arm)
    return actions


def write_contract() -> None:
    contract = {
        "version": 1,
        "id": "humanoid-deform-study",
        "purpose": "web-swing, wall-contact and aerial-combat humanoid deformation study",
        "units": "meters",
        "coordinateSystem": "gltf-y-up",
        "forward": "+Z",
        "groundLevel": 0,
        "rig": {
            "profile": "game-humanoid-v0",
            "bones": [{"name": name, "parent": parent} for name, _head, _tail, parent in BONES],
            "requiredForProduction": [
                "clavicle controls", "arm and leg IK/FK", "IK parent switching",
                "toe/heel controls", "upper-arm/forearm twist distribution",
                "upper-body aim layer", "web anchor hand-space sockets",
            ],
        },
        "sockets": [
            {"id": "web-left", "bone": "LeftHand", "purpose": "web emitter / hand anchor"},
            {"id": "web-right", "bone": "RightHand", "purpose": "web emitter / hand anchor"},
            {"id": "aim", "bone": "Head", "purpose": "camera/aim reference"},
            {"id": "foot-left", "bone": "LeftFoot", "purpose": "wall/ground contact"},
            {"id": "foot-right", "bone": "RightFoot", "purpose": "wall/ground contact"},
            {"id": "center-mass", "bone": "Hips", "purpose": "swing physics visual alignment"},
        ],
        "clips": [
            {"name": name, "duration": duration, "fps": FPS,
             "mode": "repeat" if name in {"Neutral", "WallRun"} else "once",
             "intent": {
                 "Neutral": "baseline/rest deformation",
                 "SwingReach": "one-arm anchor reach with long-body extension",
                 "SwingTuck": "compressed swing phase; extreme hips/knees/shoulder",
                 "WallRun": "asymmetric wall locomotion silhouette",
                 "AerialAim": "airborne upper-body aim while lower body remains free",
                 "AirKick": "fast aerial melee extension and counter-rotation",
                 "Landing": "deep three-point-style landing/crouch range",
             }[name]}
            for name, duration in CLIP_DURATIONS.items()
        ],
    }
    (OUT / "humanoid-deform-study.asset.json").write_text(
        json.dumps(contract, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def export_glb(arm, meshes) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    for mesh in meshes:
        mesh.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(
        filepath=str(OUT / "humanoid-deform-study.glb"),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_extras=True,
        export_cameras=False,
        export_lights=False,
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
        export_nla_strips=True,
        export_force_sampling=True,
        export_frame_range=False,
        export_optimize_animation_size=False,
    )


def setup_studio(materials):
    bpy.ops.mesh.primitive_plane_add(size=8, location=(0, 0, -.005))
    floor = bpy.context.object
    floor.name = "StudioFloor"
    floor.data.materials.append(materials["ground"])

    for name, position, energy, size in (
        ("Key", (-3.5, -4.5, 5.5), 850, 4.0),
        ("Fill", (3.2, -2.0, 3.8), 520, 3.0),
        ("Rim", (2.0, 4.0, 4.8), 650, 3.2),
    ):
        data = bpy.data.lights.new(name, "AREA")
        light = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(light)
        light.location = position
        light.rotation_euler = (Vector((0, 0, 1.0)) - light.location).to_track_quat("-Z", "Y").to_euler()
        data.energy = energy
        data.shape = "DISK"
        data.size = size

    camera_data = bpy.data.cameras.new("StudyCamera")
    camera = bpy.data.objects.new("StudyCamera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (3.3, -5.1, 2.6)
    camera.rotation_euler = (Vector((0, 0, 1.0)) - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = 2.55

    scene = bpy.context.scene
    scene.camera = camera
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes["Background"]
    background.inputs[0].default_value = (.82, .84, .87, 1)
    background.inputs[1].default_value = .45
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 560
    scene.render.resolution_y = 700
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.look = "AgX - Medium High Contrast"


def render_pose_previews(arm, actions) -> None:
    scene = bpy.context.scene
    for track in arm.animation_data.nla_tracks:
        track.mute = True
    for clip_name, action, frame_end in actions:
        arm.animation_data.action = action
        scene.frame_set(frame_end // 2 if clip_name == "Neutral" else round(frame_end * .72))
        bpy.context.view_layer.update()
        scene.render.filepath = str(OUT / f"humanoid-{clip_name.lower()}.png")
        bpy.ops.render.render(write_still=True)
    arm.animation_data.action = bpy.data.actions.get("SwingTuck")
    scene.frame_set(round(CLIP_DURATIONS["SwingTuck"] * FPS * .72))
    bpy.context.view_layer.update()
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / "humanoid-deform-study.blend"))


def validate(arm, meshes, actions) -> None:
    assert len(arm.data.bones) == 22
    assert {name for name, _action, _end in actions} == set(CLIP_DURATIONS)
    assert {track.name for track in arm.animation_data.nla_tracks} == set(CLIP_DURATIONS)
    assert len(meshes) >= 9, len(meshes)
    deform_bones = {bone.name for bone in arm.data.bones if bone.use_deform}
    for mesh in meshes:
        assert mesh.type == "MESH"
        assert any(mod.type == "ARMATURE" and mod.object == arm for mod in mesh.modifiers)
        group_names = {group.name for group in mesh.vertex_groups}
        assert group_names <= deform_bones, (mesh.name, sorted(group_names - deform_bones))
        for vertex in mesh.data.vertices:
            # Every generated vertex must have normalized skinning. Blender stores
            # weights on the mesh object and the exporter normalizes as needed.
            total = sum(group.weight for group in vertex.groups)
            assert abs(total - 1.0) < 1e-5, (mesh.name, vertex.index, total)
    print(f"Humanoid study validated: {len(arm.data.bones)} bones, {len(meshes)} skinned meshes, {len(actions)} actions")


def main() -> None:
    reset_scene()
    materials = {
        "body": make_material("Neutral suit", (.66, .70, .75, 1)),
        "left": make_material("Left side", (.44, .65, .78, 1)),
        "right": make_material("Right side", (.76, .55, .55, 1)),
        "head": make_material("Head", (.76, .76, .73, 1)),
        "ground": make_material("Ground", (.72, .74, .76, 1), .9),
    }
    arm = create_armature()
    meshes = create_body_meshes(arm, materials)
    actions = build_actions(arm)
    validate(arm, meshes, actions)
    export_glb(arm, meshes)
    write_contract()
    setup_studio(materials)
    if "--skip-render" in sys.argv:
        bpy.ops.wm.save_as_mainfile(filepath=str(OUT / "humanoid-deform-study.blend"))
        print("Generated humanoid-deform-study.glb/.blend/.asset.json (preview render skipped)")
    else:
        render_pose_previews(arm, actions)
        print("Generated humanoid-deform-study.glb/.blend/.asset.json and pose previews")


if __name__ == "__main__":
    main()
