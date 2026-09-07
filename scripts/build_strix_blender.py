"""Generate STRIX-04 as an editable Blender-authored asset.

The existing Three.js implementation remains the behavioral reference, but this
script owns the delivered STRIX GLB. Geometry, a 28-bone armature, rigid
single-bone-skinned hard-surface parts, sockets, and four baked clips are generated
from Python so the .blend is fully editable after generation.

Authoring math uses the runtime glTF convention (+Y up, +Z forward). Values are
converted to Blender's +Z-up / -Y-forward coordinates only at the bpy boundary.
"""
from __future__ import annotations

import json
import math
import os
from pathlib import Path
from typing import Iterable

import bmesh
import bpy
from mathutils import Euler, Matrix, Quaternion, Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output"
FPS = 60
GLTF_ONLY = os.environ.get("STRIX_GLTF_ONLY") == "1"

# glTF -> Blender basis: (x, y, z) -> (x, -z, y)
C = Matrix(((1.0, 0.0, 0.0), (0.0, 0.0, -1.0), (0.0, 1.0, 0.0)))

GAIT = {
    "duration": 2.4,
    "duty": 0.62,
    "stride": 0.72,
    "lift": 0.26,
    "upper": 1.62,
    "lower": 1.62,
    "footHeight": 0.16,
}
GAIT["speed"] = GAIT["stride"] / (GAIT["duty"] * GAIT["duration"])
STANCE = {"hullHeight": 1.58, "hipDrop": 0.06, "footX": 2.0, "footZ": 1.65}
BOOST = {
    "duration": 3.2,
    "distance": 4.8,
    "launch": 0.25,
    "travelStart": 0.55,
    "travelEnd": 2.55,
    "touchdown": 2.85,
}
RIGHT_ELBOW = -1.4

COLORS = {
    "blue": (0x53, 0x69, 0x98),
    "edge": (0x91, 0xA4, 0xC4),
    "navy": (0x35, 0x44, 0x5E),
    "frame": (0x25, 0x2E, 0x39),
    "steel": (0x88, 0x92, 0x99),
    "black": (0x0E, 0x15, 0x1C),
    "white": (0xBD, 0xC7, 0xD3),
    "optic": (0xF1, 0x4E, 0x46),
    "flame": (0xFF, 0x9C, 0x28),
    "hot": (0xFF, 0xF3, 0xCE),
    "ground": (0xE8, 0xE7, 0xDF),
}


def gv(value: Iterable[float]) -> Vector:
    """Convert a glTF-space point/vector to Blender authoring coordinates."""
    x, y, z = value
    return Vector((x, -z, y))


def gquat_to_b(q: Quaternion) -> Quaternion:
    """Change quaternion basis from glTF axes to Blender axes."""
    r = C @ q.to_matrix() @ C.transposed()
    return r.to_quaternion().normalized()


def euler_q(x=0.0, y=0.0, z=0.0) -> Quaternion:
    return Euler((x, y, z), "XYZ").to_quaternion()


def smooth(t: float) -> float:
    t = max(0.0, min(1.0, t))
    return t * t * (3.0 - 2.0 * t)


def ramp(t: float, a: float, b: float) -> float:
    return smooth((t - a) / (b - a))


def modulo(v: float) -> float:
    return ((v % 1.0) + 1.0) % 1.0


def solve_two_bone(start: Vector, target: Vector, pole: Vector, upper: float, lower: float):
    """Deterministic two-bone IK matching runtime/solvers.mjs behavior."""
    delta = target - start
    distance = delta.length
    minimum = abs(upper - lower) + 1e-7
    maximum = upper + lower - 1e-7
    clamped_distance = max(minimum, min(maximum, distance))
    direction = delta.normalized() if distance > 1e-9 else Vector((0.0, 0.0, 1.0))
    end = start + direction * clamped_distance
    along = (upper * upper - lower * lower + clamped_distance * clamped_distance) / (2.0 * clamped_distance)
    height = math.sqrt(max(0.0, upper * upper - along * along))
    pole_offset = pole - start
    perpendicular = pole_offset - direction * pole_offset.dot(direction)
    if perpendicular.length_squared < 1e-10:
        helper = Vector((0.0, 1.0, 0.0)) if abs(direction.y) < 0.95 else Vector((1.0, 0.0, 0.0))
        perpendicular = helper - direction * helper.dot(direction)
    perpendicular.normalize()
    joint = start + direction * along + perpendicular * height
    return joint, end, abs(distance - clamped_distance) > 1e-6


def limb_frame(direction: Vector, facing=Vector((0.0, 1.0, 0.0))) -> Quaternion:
    """Stable limb frame: local -Y follows the segment; local +Z faces outward."""
    y = -direction.normalized()
    z = facing - y * facing.dot(y)
    if z.length_squared < 1e-8:
        z = Vector((0.0, 0.0, 1.0)) - y * y.z
    z.normalize()
    x = y.cross(z).normalized()
    return Matrix((x, y, z)).transposed().to_quaternion().normalized()


LEGS = []
for leg in (
    {"id": "FrontLeft", "side": 1, "fore": 1, "phase": 0.0},
    {"id": "RearRight", "side": -1, "fore": -1, "phase": 0.0},
    {"id": "FrontRight", "side": -1, "fore": 1, "phase": 0.5},
    {"id": "RearLeft", "side": 1, "fore": -1, "phase": 0.5},
):
    hip = Vector((leg["side"] * 0.65, STANCE["hullHeight"] - STANCE["hipDrop"], leg["fore"] * 0.66))
    ankle = Vector((leg["side"] * STANCE["footX"], GAIT["footHeight"], leg["fore"] * STANCE["footZ"]))
    pole = Vector((leg["side"] * 3.8, 1.7, leg["fore"] * 2.9))
    knee, _, _ = solve_two_bone(hip, ankle, pole, GAIT["upper"], GAIT["lower"])
    LEGS.append({**leg, "hip": hip, "knee": knee, "ankle": ankle, "pole": pole})

JETS = []
for label, side in (("Left", 1), ("Right", -1)):
    JETS.extend((
        {"name": f"{label}MainJet", "bone": "Torso", "position": Vector((side * 0.42, 0.24, -0.82)), "direction": Vector((0.0, -0.5, -1.0)), "length": 1.9, "radius": 0.16},
        {"name": f"{label}LiftJet", "bone": "Hull", "position": Vector((side * 0.57, -0.23, 0.05)), "direction": Vector((0.0, -1.0, -0.18)), "length": 0.65, "radius": 0.12},
    ))

# Local node offsets in the same contract used by the Three.js model.
BONE_DEFS = [
    ("Motion", None, Vector((0.0, 0.0, 0.0))),
    ("Hull", "Motion", Vector((0.0, STANCE["hullHeight"], 0.0))),
    ("Torso", "Hull", Vector((0.0, 0.56, -0.10))),
    ("Head", "Torso", Vector((0.0, 0.73, 0.29))),
]
for jet in JETS:
    BONE_DEFS.append((jet["name"], jet["bone"], jet["position"]))
for leg in LEGS:
    BONE_DEFS.extend((
        (leg["id"] + "Upper", "Hull", Vector((leg["side"] * 0.65, -STANCE["hipDrop"], leg["fore"] * 0.66))),
        (leg["id"] + "Lower", leg["id"] + "Upper", leg["knee"] - leg["hip"]),
        (leg["id"] + "Foot", leg["id"] + "Lower", leg["ankle"] - leg["knee"]),
    ))
for label, side in (("Left", 1), ("Right", -1)):
    hand_offset = Vector((0.0, -0.43, 0.20))
    hand_offset.rotate(Quaternion(Vector((1.0, 0.0, 0.0)), RIGHT_ELBOW if label == "Right" else 0.0))
    BONE_DEFS.extend((
        (label + "Arm", "Torso", Vector((side * 0.98, 0.35, 0.06))),
        (label + "Forearm", label + "Arm", Vector((side * 0.15, -0.54, 0.13))),
        (label + "Hand", label + "Forearm", hand_offset),
        (label + "Cannon", "Torso", Vector((side * 0.84, 0.86, -0.48))),
    ))

PARENT = {name: parent for name, parent, _ in BONE_DEFS}
LOCAL_REST = {name: pos.copy() for name, _, pos in BONE_DEFS}
ORDER = [name for name, _, _ in BONE_DEFS]


def global_rest_positions():
    result = {}
    for name, parent, offset in BONE_DEFS:
        result[name] = offset.copy() if parent is None else result[parent] + offset
    return result


GLOBAL_REST = global_rest_positions()


def make_material(name: str, rgb, metallic=0.55, roughness=0.48, emission=None, alpha=1.0):
    def srgb(v):
        n = v / 255.0
        return n / 12.92 if n <= 0.04045 else ((n + 0.055) / 1.055) ** 2.4

    color = tuple(srgb(v) for v in rgb)
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = color + (alpha,)
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = color + (1.0,)
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    if emission:
        e = tuple(srgb(v) for v in emission)
        if "Emission Color" in shader.inputs:
            shader.inputs["Emission Color"].default_value = e + (1.0,)
            shader.inputs["Emission Strength"].default_value = 2.0
    if alpha < 1.0:
        shader.inputs["Alpha"].default_value = alpha
        mat.surface_render_method = "DITHERED"
    return mat


def reset_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.armatures, bpy.data.materials, bpy.data.actions):
        # Keep the generated file deterministic when rerunning in the same process.
        for block in list(datablocks):
            if block.users == 0:
                datablocks.remove(block)


def create_armature():
    arm_data = bpy.data.armatures.new("STRIX-04 Rig")
    arm = bpy.data.objects.new("STRIX-04", arm_data)
    bpy.context.collection.objects.link(arm)
    arm.show_in_front = True
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    edit = {}
    for name in ORDER:
        bone = arm_data.edit_bones.new(name)
        bone.head = gv(GLOBAL_REST[name])
        # Keep every rest bone on the same canonical +Y-up axis. Blender bones
        # normally encode head->tail direction as a node rest rotation in glTF;
        # pointing limbs/cannons along their visual segment therefore broke the
        # existing runtime contract (identity rest rotation and canonical local
        # offsets). The rigid meshes and baked Actions provide the visible limb
        # orientation, so the authoring bones themselves can use a uniform axis.
        bone.tail = gv(GLOBAL_REST[name] + Vector((0.0, 0.22, 0.0)))
        bone.roll = 0.0
        edit[name] = bone
    for name in ORDER:
        parent = PARENT[name]
        if parent:
            edit[name].parent = edit[parent]
            edit[name].use_connect = False
    bpy.ops.object.mode_set(mode="POSE")
    for bone in arm.pose.bones:
        bone.rotation_mode = "QUATERNION"
    bpy.ops.object.mode_set(mode="OBJECT")
    return arm


def bone_parent(obj, arm, bone_name: str):
    """Attach a generated part to one joint without soft deformation.

    Meshes use a single 100% vertex group plus an Armature modifier. This is
    both a true glTF skin and avoids Blender bone-parent tail-space offsets.
    Non-mesh sockets remain ordinary bone children.
    """
    bpy.context.view_layer.update()
    world = obj.matrix_world.copy()
    if obj.type == "MESH":
        obj.parent = arm
        obj.parent_type = "OBJECT"
        obj.matrix_parent_inverse = arm.matrix_world.inverted()
        obj.matrix_world = world
        group = obj.vertex_groups.new(name=bone_name)
        group.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
        modifier = obj.modifiers.new("Rigid armature", "ARMATURE")
        modifier.object = arm
    else:
        obj.parent = arm
        obj.parent_type = "BONE"
        obj.parent_bone = bone_name
        obj.matrix_world = world
    return obj


def apply_bevel(obj, width=0.016, segments=1):
    if width <= 0:
        return
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    mod = obj.modifiers.new("Machined bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.select_set(False)


def transform_local(local: Vector, origin: Vector, q: Quaternion | None) -> Vector:
    return origin + (q @ local if q else local)


def box(arm, bone, name, pos, size, mat, q=None):
    """Create the exact sharp BoxGeometry silhouette used by the Three.js source."""
    center = transform_local(Vector(pos), GLOBAL_REST[bone], q)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=gv(center))
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    sx, sy, sz = size
    obj.scale = (sx, sz, sy)
    if q:
        obj.rotation_mode = "QUATERNION"
        obj.rotation_quaternion = gquat_to_b(q)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return bone_parent(obj, arm, bone)


def rod(arm, bone, name, a, b, r, mat, r2=None, sides=12, q=None):
    a = transform_local(Vector(a), GLOBAL_REST[bone], q)
    b = transform_local(Vector(b), GLOBAL_REST[bone], q)
    av, bv = gv(a), gv(b)
    r2 = r if r2 is None else r2
    bpy.ops.mesh.primitive_cone_add(vertices=sides, radius1=r, radius2=r2, depth=(bv - av).length, location=(av + bv) * 0.5)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    obj.rotation_euler = (bv - av).to_track_quat("Z", "Y").to_euler()
    return bone_parent(obj, arm, bone)


def convex_hull(arm, bone, name, points, mat, q=None):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    origin = GLOBAL_REST[bone]
    for point in points:
        bm.verts.new(gv(transform_local(Vector(point), origin, q)))
    bm.verts.ensure_lookup_table()
    bmesh.ops.convex_hull(bm, input=list(bm.verts), use_existing_faces=False)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(mat)
    return bone_parent(obj, arm, bone)


def _is_clockwise(points):
    """Match THREE.ShapeUtils.isClockWise for a simple contour."""
    area = 0.0
    for i, point in enumerate(points):
        nxt = points[(i + 1) % len(points)]
        area += point.x * nxt.y - nxt.x * point.y
    return area < 0.0


def _three_bevel_vector(point, previous, following):
    """Port ExtrudeGeometry.getBevelVec so plate outlines match Three.js."""
    prev_x, prev_y = point.x - previous.x, point.y - previous.y
    next_x, next_y = following.x - point.x, following.y - point.y
    prev_len_sq = prev_x * prev_x + prev_y * prev_y
    cross = prev_x * next_y - prev_y * next_x
    eps = 2.220446049250313e-16
    shrink_by = None
    if abs(cross) > eps:
        prev_len = math.sqrt(prev_len_sq)
        next_len = math.sqrt(next_x * next_x + next_y * next_y)
        prev_shift_x = previous.x - prev_y / prev_len
        prev_shift_y = previous.y + prev_x / prev_len
        next_shift_x = following.x - next_y / next_len
        next_shift_y = following.y + next_x / next_len
        factor = ((next_shift_x - prev_shift_x) * next_y - (next_shift_y - prev_shift_y) * next_x) / cross
        trans_x = prev_shift_x + prev_x * factor - point.x
        trans_y = prev_shift_y + prev_y * factor - point.y
        trans_len_sq = trans_x * trans_x + trans_y * trans_y
        if trans_len_sq <= 2.0:
            return Vector((trans_x, trans_y))
        shrink_by = math.sqrt(trans_len_sq / 2.0)
    else:
        if prev_x > eps:
            same_direction = next_x > eps
        elif prev_x < -eps:
            same_direction = next_x < -eps
        else:
            same_direction = math.copysign(1.0, prev_y) == math.copysign(1.0, next_y)
        if same_direction:
            trans_x, trans_y = -prev_y, prev_x
            shrink_by = math.sqrt(prev_len_sq)
        else:
            trans_x, trans_y = prev_x, prev_y
            shrink_by = math.sqrt(prev_len_sq / 2.0)
    return Vector((trans_x / shrink_by, trans_y / shrink_by))


def plate(arm, bone, name, xy, thickness, z, mat, q=None):
    """Recreate Three.js ExtrudeGeometry with one bevel segment and one step.

    Three's plate helper uses bevelSize=.016 and bevelThickness=.010. With one
    bevel segment that becomes four contour layers: original cap, expanded side,
    expanded side, original cap. Keeping the same layer topology preserves both
    the visible outline and the 6*n side triangles produced by ExtrudeGeometry.
    """
    bevel_size = 0.016
    bevel_thickness = 0.010
    contour = [Vector((x, y)) for x, y in xy]
    if not _is_clockwise(contour):
        contour.reverse()
    movements = [
        _three_bevel_vector(point, contour[i - 1], contour[(i + 1) % len(contour)])
        for i, point in enumerate(contour)
    ]
    expanded = [point + movement * bevel_size for point, movement in zip(contour, movements)]
    z_layers = (
        z - thickness * 0.5 - bevel_thickness,
        z - thickness * 0.5,
        z + thickness * 0.5,
        z + thickness * 0.5 + bevel_thickness,
    )
    contours = (contour, expanded, expanded, contour)
    origin = GLOBAL_REST[bone]
    verts = [
        gv(transform_local(Vector((point.x, point.y, layer_z)), origin, q))
        for points, layer_z in zip(contours, z_layers)
        for point in points
    ]
    n = len(contour)
    faces = [tuple(range(n)), tuple(reversed(range(3 * n, 4 * n)))]
    for layer in range(3):
        base, next_base = layer * n, (layer + 1) * n
        for i in range(n):
            j = (i + 1) % n
            faces.append((base + i, base + j, next_base + j, next_base + i))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    mesh.materials.append(mat)
    # Closed solids let Blender correct winding consistently after the axis basis change.
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    return bone_parent(obj, arm, bone)


def disk(arm, bone, name, center, radius, mat, direction=(0.0, 0.0, 1.0), q=None, sides=16):
    center = transform_local(Vector(center), GLOBAL_REST[bone], q)
    direction = q @ Vector(direction) if q else Vector(direction)
    c = gv(center)
    d = gv(direction).normalized()
    bpy.ops.mesh.primitive_cylinder_add(vertices=sides, radius=radius, depth=0.012, location=c)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    obj.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
    return bone_parent(obj, arm, bone)


def empty_socket(arm, bone, name, local):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.empty_display_type = "SPHERE"
    obj.empty_display_size = 0.035
    obj.location = gv(GLOBAL_REST[bone] + Vector(local))
    return bone_parent(obj, arm, bone)


def build_geometry(arm, mats):
    blue, edge, navy = mats["blue"], mats["edge"], mats["navy"]
    frame, steel, black = mats["frame"], mats["steel"], mats["black"]
    white, optic = mats["white"], mats["optic"]

    # Chassis / turret.
    convex_hull(arm, "Hull", "Armored chassis", [
        (-.63,-.22,-.92),(.63,-.22,-.92),(-.80,-.12,-.55),(.80,-.12,-.55),(-.78,-.14,.70),(.78,-.14,.70),
        (-.45,-.18,1.02),(.45,-.18,1.02),(-.58,.27,-.73),(.58,.27,-.73),(-.65,.24,.65),(.65,.24,.65),(0,.10,1.22)], navy)
    box(arm, "Hull", "Turntable base", (0,.31,-.09), (.91,.20,1.0), frame)
    rod(arm, "Hull", "Turret slew ring", (0,.29,-.10), (0,.44,-.10), .53, steel, sides=24)
    for s in (-1, 1):
        convex_hull(arm, "Hull", f"{s} Forward skirt", [(s*.08,.23,.54),(s*.70,.24,.37),(s*.82,.05,.91),(s*.22,-.17,1.10),(s*.08,.05,1.19)], blue)
        convex_hull(arm, "Hull", f"{s} Rear fender", [(s*.53,.26,-.49),(s*1.14,.19,-.67),(s*1.20,.09,-1.01),(s*.66,.02,-1.12),(s*.42,.11,-.86)], blue)
        box(arm, "Hull", f"{s} Flank actuator", (s*.78,.06,-.06), (.22,.23,.68), steel)

    # Torso and head.
    box(arm, "Torso", "Torso cage", (0,.20,-.10), (.87,.71,.65), frame)
    convex_hull(arm, "Torso", "Thorax keel", [(-.42,-.12,.16),(.42,-.12,.16),(-.57,.48,-.19),(.57,.48,-.19),(-.24,.59,.24),(.24,.59,.24),(0,.22,.87),(0,-.25,.58)], navy)
    for s in (-1, 1):
        convex_hull(arm, "Torso", f"{s} Chest blade", [(s*.08,.46,.37),(s*.55,.57,.06),(s*.83,.22,.19),(s*.34,-.06,.67),(s*.12,.06,.76)], blue)
        convex_hull(arm, "Torso", f"{s} Collar facet", [(s*.13,.62,.03),(s*.53,.57,-.25),(s*.63,.41,.05),(s*.23,.42,.35)], edge)
        plate(arm, "Torso", f"{s} Chest intake", [(s*.15,.35),(s*.43,.40),(s*.42,.28),(s*.20,.20)], .025, .57, black)
        box(arm, "Torso", f"{s} Back engine", (s*.42,.13,-.56), (.32,.64,.37), navy)
        box(arm, "Torso", f"{s} Rear cooling fin", (s*.45,.54,-.48), (.38,.07,.54), blue)
    box(arm, "Torso", "Back radiator recess", (0,.18,-.466), (.37,.43,.03), black)
    for i in range(5):
        box(arm, "Torso", f"Back radiator slat {i}", (0,.18+(i-2)*.43/6,-.441), (.34,.018,.04), steel)

    rod(arm, "Head", "Neck bearing", (0,-.04,-.02), (0,.06,-.02), .13, frame)
    convex_hull(arm, "Head", "Spearhead helmet", [(0,.30,.12),(-.29,.13,-.19),(.29,.13,-.19),(-.30,.02,.16),(.30,.02,.16),(-.15,-.15,.22),(.15,-.15,.22),(0,-.075,.65),(0,.14,.47),(0,-.20,-.10)], blue)
    convex_hull(arm, "Head", "Crown ridge", [(0,.34,-.02),(-.08,.21,.25),(.08,.21,.25),(0,.15,.57),(0,.24,-.22)], edge)
    for s in (-1, 1):
        convex_hull(arm, "Head", f"{s} Black optic recess", [(s*.025,.052,.50),(s*.23,.055,.22),(s*.20,-.034,.26),(s*.045,-.027,.51)], black)
        rod(arm, "Head", f"{s} Optic strip", (s*.064,.02,.501), (s*.181,.025,.333), .013, optic, sides=6)
        convex_hull(arm, "Head", f"{s} Swept temple fin", [(s*.23,.06,.02),(s*.35,.13,-.43),(s*.29,-.13,-.19),(s*.20,-.09,.16)], navy)

    # Four articulated legs. Geometry is authored straight along -Y then baked
    # into the same stable limb frames used by the runtime reference model.
    for leg in LEGS:
        upper = leg["id"] + "Upper"
        lower = leg["id"] + "Lower"
        foot = leg["id"] + "Foot"
        uq = limb_frame(leg["knee"] - leg["hip"])
        lq = limb_frame(leg["ankle"] - leg["knee"], Vector((leg["side"], 0.0, leg["fore"])))
        rod(arm, upper, leg["id"]+" Hip drum", (-.25,0,0), (.25,0,0), .21, frame, q=uq)
        box(arm, upper, leg["id"]+" Upper spar", (0,-GAIT["upper"]/2,0), (.24,GAIT["upper"]-.10,.27), frame, q=uq)
        convex_hull(arm, upper, leg["id"]+" Long thigh blade", [(-.25,-.13,-.09),(.25,-.13,-.09),(-.38,-.47,.03),(.38,-.47,.03),(-.26,-1.20,.03),(.26,-1.20,.03),(0,-1.42,.13),(-.26,-.28,.29),(.26,-.28,.29),(0,-1.16,.33)], blue, uq)
        plate(arm, upper, leg["id"]+" Thigh inset", [(-.14,-.35),(.14,-.35),(.13,-1.01),(0,-1.20),(-.13,-1.01)], .035, .318, navy, uq)
        box(arm, upper, leg["id"]+" Thigh marker", (.17,-.46,.335), (.055,.19,.020), white, uq)
        for s in (-1, 1):
            rod(arm, upper, leg["id"]+f" {s} Hydraulic body", (s*.24,-.19,-.12), (s*.24,-.80,-.12), .067, navy, q=uq)
            rod(arm, upper, leg["id"]+f" {s} Hydraulic rod", (s*.24,-.79,-.12), (s*.24,-1.34,-.12), .033, steel, q=uq)
        rod(arm, lower, leg["id"]+" Knee drum", (-.30,0,0), (.30,0,0), .205, frame, sides=16, q=lq)
        for s in (-1, 1):
            rod(arm, lower, leg["id"]+f" {s} Knee collar", (s*.23,0,0), (s*.28,0,0), .218, steel, sides=16, q=lq)
            rod(arm, lower, leg["id"]+f" {s} Knee hub", (s*.30,0,0), (s*.325,0,0), .11, black, q=lq)
        box(arm, lower, leg["id"]+" Lower spar", (0,-GAIT["lower"]/2,0), (.22,GAIT["lower"]-.06,.25), frame, q=lq)
        convex_hull(arm, lower, leg["id"]+" Shin lance", [(-.29,-.11,.02),(.29,-.11,.02),(-.32,-.34,.13),(.32,-.34,.13),(-.14,-1.15,.04),(.14,-1.15,.04),(0,-1.35,.10),(-.19,-.22,.34),(.19,-.22,.34),(0,-1.10,.30)], blue, lq)
        plate(arm, lower, leg["id"]+" Shin facet", [(-.12,-.29),(.12,-.29),(.08,-.80),(0,-1.09),(-.08,-.80)], .025, .325, navy, lq)
        plate(arm, lower, leg["id"]+" Knee cap", [(-.23,.12),(.23,.12),(.28,-.12),(0,-.34),(-.28,-.12)], .14, .205, navy, lq)
        rod(arm, lower, leg["id"]+" Ankle ram", (0,-.88,-.13), (0,-1.57,-.13), .047, steel, q=lq)
        rod(arm, foot, leg["id"]+" Ankle pin", (-.16,0,0), (.16,0,0), .11, steel)
        yaw = math.atan2(leg["side"], leg["fore"])
        yq = Quaternion(Vector((0.0, 1.0, 0.0)), yaw)
        convex_hull(arm, foot, leg["id"]+" Pointed foot", [(-.19,-.16,-.19),(.19,-.16,-.19),(-.12,-.16,.43),(.12,-.16,.43),(-.17,.07,-.15),(.17,.07,-.15),(-.10,-.07,.43),(.10,-.07,.43)], blue, yq)
        box(arm, foot, leg["id"]+" Sole", (0,-.14,.10), (.26,.04,.57), black, yq)

    # Arms, rifle, shield and shoulder cannons.
    for label, s in (("Left", 1), ("Right", -1)):
        arm_bone, forearm, hand, cannon = label+"Arm", label+"Forearm", label+"Hand", label+"Cannon"
        rod(arm, arm_bone, label+" Shoulder joint", (-.18,0,0), (.18,0,0), .21, frame)
        convex_hull(arm, arm_bone, label+" Shoulder shield", [(-.32,-.14,-.25),(.32,-.14,-.25),(-.33,.19,-.21),(.33,.19,-.21),(-.22,.39,.06),(.22,.39,.06),(-.32,-.07,.35),(.32,-.07,.35),(s*.47,-.35,.17)], blue)
        rod(arm, arm_bone, label+" Arm spar", (0,-.14,0), (s*.14,-.49,.12), .115, frame)
        box(arm, arm_bone, label+" Upper arm plate", (s*.07,-.30,.15), (.30,.37,.18), navy)
        fq = Quaternion(Vector((1.0, 0.0, 0.0)), RIGHT_ELBOW) if label == "Right" else None
        rod(arm, forearm, label+" Elbow", (-.20,0,0), (.20,0,0), .15, steel, q=fq)
        convex_hull(arm, forearm, label+" Forearm armor", [(-.22,-.02,.06),(.22,-.02,.06),(-.26,-.28,.14),(.26,-.28,.14),(-.13,-.50,.27),(.13,-.50,.27),(-.17,-.17,.34),(.17,-.17,.34)], blue, fq)
        box(arm, hand, label+" Gripper shell", (0,-.06,.04), (.22,.21,.25), frame)
        if label == "Right":
            box(arm, hand, "Rifle receiver", (0,-.07,.49), (.30,.28,.88), navy)
            convex_hull(arm, hand, "Rifle long jacket", [(-.14,-.21,.78),(.14,-.21,.78),(-.15,.08,.78),(.15,.08,.78),(-.12,-.20,2.02),(.12,-.20,2.02),(-.08,.015,2.16),(.08,.015,2.16)], frame)
            box(arm, hand, "Rifle muzzle", (0,-.08,2.162), (.13,.095,.014), black)
            box(arm, hand, "Rifle rail", (0,.11,.66), (.07,.055,1.02), steel)
            box(arm, hand, "Rifle magazine", (0,-.33,.44), (.22,.31,.34), frame)
        else:
            plate(arm, forearm, "Left elongated shield", [(-.17,.13),(.25,.10),(.37,-.28),(.10,-.89),(-.24,-.34)], .12, .40, navy)
            plate(arm, forearm, "Left shield face", [(-.12,.02),(.17,.02),(.25,-.26),(.08,-.70),(-.15,-.28)], .05, .485, blue)
        box(arm, cannon, label+" Cannon saddle", (0,0,0), (.38,.28,.38), frame)
        box(arm, cannon, label+" Cannon breech", (0,.20,.05), (.46,.44,.70), navy)
        rod(arm, cannon, label+" Rotary jacket", (0,.20,.36), (0,.20,1.70), .24, frame, r2=.22, sides=16)
        for z in (.48,.93,1.46,1.72):
            rod(arm, cannon, label+f" Barrel band {z}", (0,.20,z), (0,.20,z+.07), .26, steel, sides=16)
        for i in range(4):
            angle = i*math.pi/2 + math.pi/4
            x, y = math.cos(angle)*.13, .20 + math.sin(angle)*.13
            rod(arm, cannon, label+f" Inner barrel {i}", (x,y,1.53), (x,y,1.91), .067, steel)
            disk(arm, cannon, label+f" Bore {i}", (x,y,1.912), .045, black)
        for i in range(4):
            box(arm, cannon, label+f" Cooling slot {i}", (0,.435,.62+i*.22), (.09,.014,.10), black)
        convex_hull(arm, cannon, label+" Ammunition pod", [(-.28,-.03,-.19),(.28,-.03,-.19),(-.30,.43,-.21),(.30,.43,-.21),(-.24,.35,-.76),(.24,.35,-.76),(-.24,.02,-.78),(.24,.02,-.78)], blue)

    # Thrusters and effect meshes. The plume/core meshes are children of the
    # dedicated jet bones so Boost can animate them by bone scale.
    for jet in JETS:
        direction = jet["direction"].normalized()
        p = jet["position"]
        rod(arm, jet["bone"], jet["name"]+" Housing", p-direction*.22, p, jet["radius"]*1.45, navy, r2=jet["radius"]*1.3, sides=16)
        rod(arm, jet["bone"], jet["name"]+" Rim", p-direction*.035, p+direction*.025, jet["radius"]*1.38, steel, sides=16)
        disk(arm, jet["bone"], jet["name"]+" Aperture", p+direction*.027, jet["radius"], black, direction)
        for suffix, factor, material in ((" Plume",1.0,mats["flame"]),(" Core",.66,mats["hot"])):
            length = jet["length"] * factor
            center = direction * (length * .5)
            # Cone tip points along +direction from the nozzle bone origin.
            bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=jet["radius"]*factor, radius2=0.0, depth=length, location=gv(GLOBAL_REST[jet["name"]] + center))
            obj = bpy.context.object
            obj.name = jet["name"] + suffix
            obj.data.materials.append(material)
            obj.rotation_euler = gv(direction).to_track_quat("Z", "Y").to_euler()
            obj["effect"] = True
            bone_parent(obj, arm, jet["name"])

    # Contract sockets used by the viewer/game runtime.
    for leg in LEGS:
        empty_socket(arm, leg["id"]+"Foot", leg["id"]+"ContactSocket", (0,-GAIT["footHeight"],0))
    for jet in JETS:
        empty_socket(arm, jet["bone"], jet["name"]+"Socket", jet["position"])


def boost_pose(time: float):
    t = max(0.0, min(BOOST["duration"], time))
    flight = ramp(t, BOOST["launch"], .75) * (1-ramp(t, 2.3, BOOST["touchdown"]))
    fold = ramp(t, .42, .95) * (1-ramp(t, 2.05, 2.65))
    lean = ramp(t, .45, .90) * (1-ramp(t, 1.95, 2.65))
    compression = -.12*ramp(t,0,BOOST["launch"])*(1-ramp(t,BOOST["launch"],.55)) - .08*ramp(t,2.65,BOOST["touchdown"])*(1-ramp(t,BOOST["touchdown"],BOOST["duration"]))
    travel = BOOST["distance"] * ramp(t, BOOST["travelStart"], BOOST["travelEnd"])
    thrust = ramp(t, BOOST["launch"], .55) * (1-ramp(t,2.60,BOOST["touchdown"]))
    return {
        "position": Vector((0.0, .65*flight+compression, travel)), "lift": .85*flight, "fold": fold,
        "pitch": .13*lean-.06*ramp(t,2,2.3)*(1-ramp(t,2.3,2.7)), "torsoPitch": .22*lean,
        "footPitch": .24*fold, "thrust": thrust, "contact": t <= BOOST["launch"] or t >= BOOST["touchdown"],
    }


REST_FRAMES = {}
for leg in LEGS:
    REST_FRAMES[leg["id"]] = {
        "upper": limb_frame(leg["knee"]-leg["hip"]).inverted(),
        "lower": limb_frame(leg["ankle"]-leg["knee"], Vector((leg["side"],0,leg["fore"]))).inverted(),
    }


def pose_sample(name: str, time: float):
    boost = boost_pose(time) if name == "Boost" else None
    walking = name in ("Walk", "Advance")
    cycle = time / GAIT["duration"]
    travel = time * GAIT["speed"] if name == "Advance" else 0.0
    bob = .022*math.cos(cycle*math.pi*4) if walking else .018*math.sin(cycle*math.pi*2)
    position = boost["position"] if boost else Vector((0.0,bob,travel))
    origin = position.copy()
    local_q = {bone: Quaternion() for bone in ORDER}
    roll = .014*math.sin(cycle*math.pi*2) if walking else 0.0
    local_q["Torso"] = euler_q(.012*math.sin(cycle*math.pi*4) if walking else 0.0, 0.0, roll)
    local_q["Head"] = euler_q(0.0, 0.0, -roll)
    if boost:
        local_q["Hull"] = euler_q(boost["pitch"],0,0)
        local_q["Torso"] = euler_q(boost["torsoPitch"],0,0)
        local_q["Head"] = euler_q(-(boost["pitch"]+boost["torsoPitch"])*.85,0,0)
        for side in ("Left","Right"):
            local_q[side+"Cannon"] = euler_q(-boost["pitch"]-boost["torsoPitch"],0,0)
        local_q["RightArm"] = euler_q(-boost["pitch"]-boost["torsoPitch"],0,0)
        local_q["LeftArm"] = euler_q(.18*boost["fold"],0,0)
    hull_q = local_q["Hull"]
    pivot = Vector((0.0, STANCE["hullHeight"], 0.0))
    for leg in LEGS:
        u = modulo(cycle + leg["phase"])
        contact = boost["contact"] if boost else (not walking or u < GAIT["duty"])
        advance = lift = 0.0
        if walking and contact:
            advance = GAIT["stride"]*(.5-u/GAIT["duty"])
        elif walking:
            p = (u-GAIT["duty"])/(1-GAIT["duty"])
            tangent = -GAIT["stride"]*(1-GAIT["duty"])/GAIT["duty"]
            advance = -GAIT["stride"]/2 + GAIT["stride"]*smooth(p) + tangent*p*(1-p)*(1-2*p)
            lift = GAIT["lift"]*math.sin(math.pi*p)**2
        hip = hull_q @ (leg["hip"]-pivot) + pivot + origin
        target = Vector((leg["ankle"].x, GAIT["footHeight"]+lift, leg["ankle"].z+advance+travel))
        if boost:
            target = Vector((leg["ankle"].x-leg["side"]*.15*boost["fold"], GAIT["footHeight"]+boost["lift"], leg["ankle"].z-.65*boost["fold"]+position.z))
        pole = leg["pole"] + origin
        knee, ankle, _ = solve_two_bone(hip,target,pole,GAIT["upper"],GAIT["lower"])
        upper_world = limb_frame(knee-hip) @ REST_FRAMES[leg["id"]]["upper"]
        lower_world = limb_frame(ankle-knee, Vector((leg["side"],0,leg["fore"]))) @ REST_FRAMES[leg["id"]]["lower"]
        local_q[leg["id"]+"Upper"] = hull_q.inverted() @ upper_world
        local_q[leg["id"]+"Lower"] = upper_world.inverted() @ lower_world
        foot_world = euler_q(boost["footPitch"] if boost else 0.0,0,0)
        local_q[leg["id"]+"Foot"] = lower_world.inverted() @ foot_world
    scales = {bone: Vector((1.0,1.0,1.0)) for bone in ORDER}
    for jet in JETS:
        throttle = boost["thrust"] if boost else 0.0
        width = .001+.999*math.sqrt(throttle)
        length = .001+.999*throttle
        scales[jet["name"]] = Vector((width, length if "Lift" in jet["name"] else width, length if "Main" in jet["name"] else width))
    return position, local_q, scales


def world_transforms(position, local_q):
    positions, rotations = {}, {}
    for bone in ORDER:
        parent = PARENT[bone]
        local_pos = position if bone == "Motion" else LOCAL_REST[bone]
        if parent is None:
            positions[bone] = local_pos.copy()
            rotations[bone] = local_q[bone].copy()
        else:
            positions[bone] = positions[parent] + rotations[parent] @ local_pos
            rotations[bone] = rotations[parent] @ local_q[bone]
    return positions, rotations


def bake_actions(arm):
    """Bake the task-space reference into independent Blender Actions.

    The scene must be evaluated at the frame being authored *before* writing the
    pose. Otherwise Blender can re-evaluate the active Action at frame 1 while
    keys for later frames are inserted, contaminating child bone bases.
    """
    arm.animation_data_create()
    scene = bpy.context.scene
    rest_matrix = {bone.name: bone.matrix_local.copy() for bone in arm.data.bones}
    rest_rot = {name: rest_matrix[name].to_3x3().to_quaternion() for name in ORDER}
    actions = []
    clips = (("Idle",GAIT["duration"]),("Walk",GAIT["duration"]),("Advance",GAIT["duration"]),("Boost",BOOST["duration"]))
    for clip_name, duration in clips:
        action = bpy.data.actions.new(clip_name)
        arm.animation_data.action = action
        # Start every clip from a clean pose; no previous Action may contribute.
        for pb in arm.pose.bones:
            pb.matrix_basis.identity()
        bpy.context.view_layer.update()
        frame_count = round(duration*FPS)
        for index in range(frame_count+1):
            t = min(duration, index/FPS)
            frame = index
            scene.frame_set(frame)
            position, local_q, scales = pose_sample(clip_name,t)
            wp, wq = world_transforms(position, local_q)
            # Derive matrix_basis from the *desired* parent matrix instead of
            # reading PoseBone.matrix while the dependency graph is stale.
            # Blender updates pose matrices lazily; using the stale parent here
            # previously shifted Walk/Advance feet by up to ~37 cm.
            desired_matrices = {}
            for name in ORDER:
                desired_rot = gquat_to_b(wq[name]) @ rest_rot[name]
                desired = Matrix.Translation(gv(wp[name])) @ desired_rot.to_matrix().to_4x4()
                desired_matrices[name] = desired
                parent = PARENT[name]
                if parent:
                    local_rest = rest_matrix[parent].inverted() @ rest_matrix[name]
                    basis = local_rest.inverted() @ desired_matrices[parent].inverted() @ desired
                else:
                    basis = rest_matrix[name].inverted() @ desired
                pb = arm.pose.bones[name]
                pb.matrix_basis = basis
                s = scales[name]
                pb.scale = Vector((s.x, s.z, s.y))
            bpy.context.view_layer.update()
            # Then serialize the already evaluated pose as one coherent frame.
            for name in ORDER:
                pb = arm.pose.bones[name]
                pb.keyframe_insert(data_path="location", frame=frame, group=name)
                pb.keyframe_insert(data_path="rotation_quaternion", frame=frame, group=name)
                pb.keyframe_insert(data_path="scale", frame=frame, group=name)
        for fcurve in action.fcurves:
            for key in fcurve.keyframe_points:
                key.interpolation = "LINEAR"
        actions.append((clip_name, action, frame_count))
    arm.animation_data.action = None
    for clip_name, action, end_frame in actions:
        track = arm.animation_data.nla_tracks.new()
        track.name = clip_name
        strip = track.strips.new(clip_name, 0, action)
        strip.action_frame_start = 0
        strip.action_frame_end = end_frame
        strip.frame_start = 0
        strip.frame_end = end_frame
    return actions

def set_metadata(arm):
    ik = {
        "version": 1,
        "coordinateSystem": "gltf-y-up",
        "hips": "Hull",
        "chains": [
            {"id": leg["id"], "label": ("前" if leg["fore"]>0 else "後")+("左" if leg["side"]>0 else "右")+"足", "upper": leg["id"]+"Upper", "lower": leg["id"]+"Lower", "end": leg["id"]+"Foot", "pole": list(leg["pole"])}
            for leg in LEGS
        ],
    }
    arm["title"] = "STRIX-04 / quadruped siege platform"
    arm["assetId"] = "strix"
    arm["assetVersion"] = 1
    arm["groundLevel"] = 0.0
    arm["rigged"] = True
    arm["animationModes"] = {"Idle":"repeat","Walk":"repeat","Advance":"once","Boost":"once"}
    arm["ikRig"] = json.dumps(ik, ensure_ascii=False, separators=(",",":"))


def export_asset(arm):
    OUT.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    scene.render.fps = FPS
    # STRIX uses flat/PBR colors only. Blender primitives create UV layers by
    # default even though no material consumes them; exporter UV bytes can vary
    # by a few float bits between otherwise identical runs. Removing the unused
    # layers makes the delivered GLB byte-stable as well as slightly smaller.
    for obj in scene.objects:
        if obj.type == "MESH":
            for layer in list(obj.data.uv_layers):
                obj.data.uv_layers.remove(layer)
    # Export only the generated model hierarchy; studio objects are added later.
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    for obj in bpy.context.scene.objects:
        if obj.parent == arm or (obj.parent and obj.parent.parent == arm):
            obj.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(
        filepath=str(OUT/"strix.glb"), export_format="GLB", use_selection=True,
        export_yup=True, export_extras=True, export_cameras=False, export_lights=False,
        export_animations=True, export_animation_mode="NLA_TRACKS", export_nla_strips=True,
        export_force_sampling=True, export_frame_range=False, export_optimize_animation_size=False,
    )


def add_studio_and_render(arm, mats):
    # Neutral preview only; none of these objects are part of the GLB.
    bpy.ops.mesh.primitive_plane_add(size=24, location=(0,0,-.002))
    floor = bpy.context.object
    floor.name = "Studio floor"
    floor.data.materials.append(mats["ground"])
    for name, pos, energy, size in (
        ("Studio key", (-5,-7,8), 1200, 5),
        ("Studio fill", (5,-3,5), 650, 4),
        ("Studio rim", (2,6,7), 900, 4),
    ):
        data = bpy.data.lights.new(name, "AREA")
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        obj.location = pos
        obj.rotation_euler = (Vector((0,0,1.8))-obj.location).to_track_quat("-Z","Y").to_euler()
        data.energy = energy
        data.shape = "DISK"
        data.size = size
    cam_data = bpy.data.cameras.new("Studio camera")
    camera = bpy.data.objects.new("Studio camera", cam_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (5.8,-7.4,4.7)
    camera.rotation_euler = (Vector((0,0,1.75))-camera.location).to_track_quat("-Z","Y").to_euler()
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 5.7
    scene = bpy.context.scene
    scene.camera = camera
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs[0].default_value = (.78,.80,.82,1)
    scene.world.node_tree.nodes["Background"].inputs[1].default_value = .35
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 1000
    scene.render.resolution_y = 820
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(OUT/"strix-blender.png")
    scene.view_settings.look = "AgX - Medium High Contrast"
    # Evaluate a readable walk pose before saving/rendering the editable .blend.
    # The glTF exporter may change NLA mute state while collecting actions, so do
    # not depend on stack evaluation here. Mute every NLA track and explicitly
    # assign the Walk Action as the active preview source. The NLA strips remain
    # intact in the .blend for editing/export; only the preview evaluation path
    # is made deterministic.
    walk_action = bpy.data.actions.get("Walk")
    for nla_track in arm.animation_data.nla_tracks:
        nla_track.mute = True
    if walk_action is not None:
        arm.animation_data.action = walk_action
    scene.frame_set(45)
    bpy.context.view_layer.update()
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/"strix.blend"))
    bpy.ops.render.render(write_still=True)


def validate_generated(arm):
    assert len(arm.data.bones) == 28, len(arm.data.bones)
    assert {t.name for t in arm.animation_data.nla_tracks} == {"Idle","Walk","Advance","Boost"}
    for leg in LEGS:
        a,b,c = (GLOBAL_REST[leg["id"]+suffix] for suffix in ("Upper","Lower","Foot"))
        assert abs((a-b).length-GAIT["upper"]) < 1e-6
        assert abs((b-c).length-GAIT["lower"]) < 1e-6
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH" and o.parent == arm]
    assert len(meshes) >= 100, f"Expected detailed hard-surface assembly, got {len(meshes)} meshes"
    for obj in meshes:
        assert not obj.data.validate(), f"Invalid generated mesh: {obj.name}"


def main():
    reset_scene()
    mats = {
        "blue": make_material("Slate blue armor", COLORS["blue"]),
        "edge": make_material("Light armor bevel", COLORS["edge"]),
        "navy": make_material("Secondary armor", COLORS["navy"]),
        "frame": make_material("Gunmetal skeleton", COLORS["frame"], .74, .42),
        "steel": make_material("Actuator steel", COLORS["steel"], .80, .31),
        "black": make_material("Bore and vents", COLORS["black"], .25, .78),
        "white": make_material("Identification", COLORS["white"], .30, .55),
        "optic": make_material("Crimson optic", COLORS["optic"], .30, .25, emission=COLORS["optic"]),
        "flame": make_material("Amber boost exhaust", COLORS["flame"], 0.0, .3, emission=COLORS["flame"], alpha=.52),
        "hot": make_material("White hot boost core", COLORS["hot"], 0.0, .25, emission=COLORS["hot"]),
        "ground": make_material("Studio ground", COLORS["ground"], 0.0, .9),
    }
    arm = create_armature()
    set_metadata(arm)
    build_geometry(arm, mats)
    bake_actions(arm)
    validate_generated(arm)
    export_asset(arm)
    # Watch-mode iterations only need the browser GLB. Keeping .blend and the
    # studio render untouched avoids noisy binary diffs on every source save.
    if not GLTF_ONLY:
        add_studio_and_render(arm, mats)
    mode = "GLB-only" if GLTF_ONLY else "full authoring"
    print(f"STRIX-04 Blender {mode} complete: {len(arm.data.bones)} bones, {len([o for o in bpy.context.scene.objects if o.type=='MESH'])} meshes")


if __name__ == "__main__":
    main()
