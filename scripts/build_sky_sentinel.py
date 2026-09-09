"""Generate Sky Sentinel, a ~46m airborne humanoid boss for Web Run.

Blender authoring coordinates: Z-up, -Y forward. The exported GLB is a
hierarchical static model: core, head, arms, legs and thrusters are separate
nodes so gameplay can animate/disable them later.
"""
from pathlib import Path
import math
import shutil

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output'
WEB_ASSETS = ROOT / 'web-run' / 'assets'
MODEL_SCALE = 2.0

COLORS = {
    'navy': '17283A', 'navy2': '294158', 'graphite': '0A121B',
    'steel': '536573', 'armor': 'B5C0C5', 'orange': 'FF6425',
    'cyan': '42E5FF', 'core': 'FFC15A', 'ground': 'D8DDE1',
}


def linear(v):
    n = int(v, 16) / 255
    return n / 12.92 if n < .04045 else ((n + .055) / 1.055) ** 2.4


def make_material(name, hex_color, metallic=.0, roughness=.55, emission=None, strength=0):
    mat = bpy.data.materials.new(name)
    rgba = tuple(linear(hex_color[i:i+2]) for i in (0,2,4)) + (1,)
    mat.diffuse_color = rgba
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = rgba
    shader.inputs['Metallic'].default_value = metallic
    shader.inputs['Roughness'].default_value = roughness
    if emission:
        ergb = tuple(linear(emission[i:i+2]) for i in (0,2,4)) + (1,)
        shader.inputs['Emission Color'].default_value = ergb
        shader.inputs['Emission Strength'].default_value = strength
    return mat


def group(name, parent=None, pos=(0,0,0)):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    obj.location = pos
    return obj


def assign(obj, name, mat, parent):
    obj.name = name
    obj.data.materials.append(MATS[mat])
    obj.parent = parent
    return obj


def add_bevel(obj, width=.14, segments=2):
    mod = obj.modifiers.new('HardSurfaceBevel', 'BEVEL')
    mod.width = width
    mod.segments = segments
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)


def box(name, pos, half, mat, parent, rot=(0,0,0), bevel=.15):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos, rotation=rot)
    obj = assign(bpy.context.object, name, mat, parent)
    obj.scale = half
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel: add_bevel(obj, bevel)
    return obj


def ico(name, pos, half, mat, parent, subdivisions=2):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=1, location=pos)
    obj = assign(bpy.context.object, name, mat, parent)
    obj.scale = half
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    add_bevel(obj, .08, 1)
    return obj


def cylinder(name, a, b, r1, mat, parent, r2=None, vertices=16):
    a, b = Vector(a), Vector(b)
    r2 = r1 if r2 is None else r2
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=r1, radius2=r2,
                                    depth=(b-a).length, location=(a+b)/2)
    obj = assign(bpy.context.object, name, mat, parent)
    obj.rotation_euler = (b-a).to_track_quat('Z','Y').to_euler()
    add_bevel(obj, min(.10, r1*.12), 1)
    return obj


def torus(name, pos, major, minor, mat, parent, rot=(0,0,0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor,
                                    major_segments=32, minor_segments=10,
                                    location=pos, rotation=rot)
    return assign(bpy.context.object, name, mat, parent)


def wedge(name, pos, half=(1,1,1), mat='navy2', parent=None, rot=(0,0,0)):
    # Tapered armor prism; points toward -Y.
    x,y,z = half
    verts = [(-x,-y,-z),(x,-y,-z),(x*.72,y,-z),(-x*.72,y,-z),
             (-x*.72,-y,z),(x*.72,-y,z),(x*.42,y,z),(-x*.42,y,z)]
    faces = [(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)]
    mesh = bpy.data.meshes.new(name+'Mesh'); mesh.from_pydata(verts,[],faces); mesh.update()
    obj = bpy.data.objects.new(name,mesh); bpy.context.collection.objects.link(obj)
    obj.location=pos; obj.rotation_euler=rot; obj.parent=parent; obj.data.materials.append(MATS[mat])
    add_bevel(obj,.14,2)
    return obj


def build_torso(root):
    torso = group('Torso', root, (0,0,2.7))
    # Broad armored chest, narrow waist: unmistakably a giant combat body, not a drone fuselage.
    wedge('ChestBlock', (0,-.3,1.1), (5.2,3.2,3.7), 'navy', torso)
    box('UpperChestArmor', (0,-3.0,2.0), (3.6,.55,1.25), 'navy2', torso, rot=(.06,0,0), bevel=.24)
    for side in (-1,1):
        box('ChestPlate', (side*2.65,-3.45,1.6), (1.55,.32,1.8), 'armor', torso,
            rot=(0,side*.10,side*.06), bevel=.18)
        box('ChestMarker', (side*3.55,-3.82,2.65), (.50,.06,.13), 'orangeGlow', torso, bevel=.03)
    box('Waist', (0,.1,-2.8), (2.4,2.1,1.25), 'graphite', torso, bevel=.22)
    box('PelvisArmor', (0,-1.5,-3.0), (3.1,.75,1.05), 'navy2', torso, bevel=.20)
    return torso


def build_head(root):
    head = group('Head', root, (0,-1.15,9.5))
    wedge('Helmet', (0,0,0), (2.0,1.8,1.55), 'navy', head)
    box('FacePlate', (0,-1.78,-.12), (1.32,.25,.72), 'graphite', head, rot=(-.04,0,0), bevel=.16)
    box('Visor', (0,-2.05,.12), (1.05,.07,.17), 'cyanGlow', head, bevel=.035)
    box('Crown', (0,.35,1.45), (.72,.72,.75), 'navy2', head, rot=(0,0,.08), bevel=.12)
    for side in (-1,1):
        box('HeadAntenna', (side*1.55,.05,1.85), (.17,.25,1.15), 'graphite', head,
            rot=(0,side*.12,side*.06), bevel=.06)
        box('AntennaLight', (side*1.58,-.23,2.05), (.07,.04,.42), 'orangeGlow', head,
            rot=(0,side*.12,side*.06), bevel=.02)
    head['animRole']='head_aim'
    return head


def build_core(root):
    core = group('WeakPointCore', root, (0,-4.0,4.2))
    cylinder('CoreHousing', (0,.55,0),(0,-.55,0),2.05,'graphite',core,vertices=24)
    torus('CoreRing', (0,-.68,0),1.65,.30,'steel',core,rot=(math.pi/2,0,0))
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=14, radius=1.13, location=(0,-1.02,0))
    orb=assign(bpy.context.object,'ReactorCore','coreGlow',core); orb['weakPoint']=True
    for i in range(4):
        a=i*math.pi/2
        p=box(f'CorePetal{i}',(math.cos(a)*1.72,-.88,math.sin(a)*1.72),(.62,.25,1.05),'armor',core,
              rot=(0,a,0),bevel=.10)
        p['animRole']='core_petal'
    return core


def build_arm(side, root):
    name='LeftArm' if side<0 else 'RightArm'
    arm=group(name,root,(side*7.8,-.1,4.7))
    # Shoulder bell anchors the arm clearly to the torso.
    ico('Shoulder', (0,0,0), (2.0,2.15,2.05), 'navy2', arm, 1)
    box('ShoulderCap', (0,-1.6,.65), (1.55,.55,1.35), 'armor', arm,
        rot=(0,side*.08,side*.08),bevel=.20)
    # Angled upper arm and huge weapon forearm.
    cylinder('UpperArm', (0,0,-.8),(side*.45,-.15,-3.8),1.15,'steel',arm,r2=1.40,vertices=12)
    box('Elbow', (side*.45,-.2,-4.2), (1.35,1.35,1.1), 'graphite', arm, bevel=.18)
    fore=group('ForearmWeapon',arm,(side*.55,-1.4,-6.0)); fore['animRole']='weapon_arm'
    wedge('ForearmArmor',(0,0,0),(1.75,2.6,1.65),'navy',fore)
    box('ForearmPlate',(0,-2.35,.35),(1.25,.45,.95),'armor',fore,bevel=.14)
    # Three enormous forward barrels; from city scale they still read as weapons.
    for i in range(3):
        x=(i-1)*.58
        cylinder(f'Barrel{i}',(x,-2.4,-.35),(x,-6.2,-.35),.28,'steel',fore,r2=.20,vertices=14)
        cylinder(f'Muzzle{i}',(x,-6.2,-.35),(x,-6.58,-.35),.36,'orangeGlow',fore,r2=.32,vertices=14)
    box('WeaponCharge',(0,-2.75,1.32),(.72,.08,.16),'orangeGlow',fore,bevel=.03)
    return arm


def build_leg(side, root):
    name='LeftLeg' if side<0 else 'RightLeg'
    leg=group(name,root,(side*2.65,.7,-1.0))
    ico('Hip',(0,0,0),(1.45,1.55,1.5),'graphite',leg,1)
    cylinder('Thigh',(0,0,-.6),(side*.30,.65,-4.1),1.2,'navy2',leg,r2=1.55,vertices=12)
    box('Knee',(side*.30,.60,-4.65),(1.35,1.30,1.05),'armor',leg,rot=(.08,0,0),bevel=.18)
    cylinder('Shin',(side*.30,.65,-5.1),(side*.55,1.15,-7.7),.92,'steel',leg,r2=1.20,vertices=12)
    wedge('ShinArmor',(side*.42,-.15,-6.55),(1.20,1.00,1.8),'navy',leg,rot=(-.10,0,side*.05))
    foot=box('ThrusterFoot',(side*.60,.85,-8.45),(1.35,2.05,.75),'graphite',leg,rot=(.08,0,0),bevel=.18)
    foot['animRole']='leg_thruster'
    for x in (-.55,.55):
        cylinder('FootJet',(side*.60+x,.95,-8.85),(side*.60+x,1.25,-10.0),.30,'cyanGlow',leg,r2=.52,vertices=14)
    return leg


def build_backpack(root):
    pack=group('BackThrusters',root,(0,3.0,4.5))
    box('Backpack',(0,0,0),(3.6,1.5,3.4),'graphite',pack,bevel=.24)
    for side in (-1,1):
        pod=group('LeftMainThruster' if side<0 else 'RightMainThruster',pack,(side*3.65,.65,.4))
        box('ThrusterArmor',(0,0,0),(1.35,1.65,2.7),'navy2',pod,rot=(0,0,side*.05),bevel=.20)
        cylinder('MainJet',(0,.8,-1.9),(0,2.8,-3.2),.72,'graphite',pod,r2=1.05,vertices=16)
        cylinder('JetGlow',(0,2.72,-3.15),(0,3.25,-3.52),.58,'cyanGlow',pod,r2=.84,vertices=16)
        box('ThrusterMarker',(side*.70,-1.66,1.15),(.10,.05,.68),'orangeGlow',pod,bevel=.02)
        pod['animRole']='main_thruster'
    return pack


def build_details(root):
    # Solid shoulder braces make the silhouette feel engineered and connected.
    for side in (-1,1):
        cylinder('ShoulderBraceA',(side*4.7,.2,5.5),(side*7.8,.0,4.9),.62,'steel',root,r2=.82,vertices=12)
        cylinder('ShoulderBraceB',(side*4.4,1.2,3.6),(side*7.8,.3,3.8),.42,'graphite',root,r2=.58,vertices=12)
        box('TorsoSideLight',(side*4.95,-2.7,4.4),(.12,.06,.62),'orangeGlow',root,bevel=.02)
    # Lower body glow and venting.
    torus('WaistEnergyRing',(0,-.2,-.6),1.55,.16,'cyanGlow',root)
    for x in (-1.1,0,1.1):
        box('AbVent',(x,-2.25,.2),(.34,.10,.55),'steel',root,rot=(.08,0,0),bevel=.05)


def build_model():
    root=group('SkySentinel')
    root['title']='Sky Sentinel Titan'
    root['units']='meters'
    root['enemyClass']='aerial_titan'
    root['nominalHeightMeters']=46
    root['nominalWidthMeters']=40
    root['modelScale']=MODEL_SCALE
    root['weakPointNode']='ReactorCore'
    root['description']='Giant airborne humanoid combat mech generated entirely with Blender Python.'
    build_torso(root); build_head(root); build_core(root)
    build_arm(-1,root); build_arm(1,root)
    build_leg(-1,root); build_leg(1,root)
    build_backpack(root); build_details(root)
    root.scale=(MODEL_SCALE,MODEL_SCALE,MODEL_SCALE)
    return root


def export_verify(root):
    OUT.mkdir(parents=True,exist_ok=True); WEB_ASSETS.mkdir(parents=True,exist_ok=True)
    for obj in bpy.context.scene.objects:
        if obj.type=='MESH':
            assert not obj.data.validate(), obj.name
            for p in obj.data.polygons:
                p.use_smooth = obj.name in {'Shoulder','Hip','ReactorCore'}
    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True)
    for child in root.children_recursive: child.select_set(True)
    bpy.context.view_layer.objects.active=root
    glb=OUT/'sky-sentinel.glb'
    bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,
        export_cameras=False,export_lights=False,export_extras=True,export_animations=False,export_apply=True)
    shutil.copy2(glb,WEB_ASSETS/'sky-sentinel.glb')

    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(glb)); bpy.context.view_layer.update()
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
    pts=[o.matrix_world@Vector(v) for o in meshes for v in o.bound_box]
    dims=[max(p[i] for p in pts)-min(p[i] for p in pts) for i in range(3)]
    # Width, front-back depth, vertical height in Blender authoring basis.
    assert 39 < dims[0] < 42, dims
    assert 30 < dims[1] < 32, dims
    assert 45 < dims[2] < 48, dims
    names={o.name for o in bpy.context.scene.objects}
    for required in ('SkySentinel','Head','LeftArm','RightArm','LeftLeg','RightLeg','BackThrusters','WeakPointCore','ReactorCore'):
        assert required in names, required
    print('Sky Sentinel Titan GLB verified:',[round(v,3) for v in dims],'objects=',len(bpy.context.scene.objects))


def studio():
    scene=bpy.context.scene
    bpy.ops.mesh.primitive_plane_add(size=180,location=(0,0,-22.8)); floor=bpy.context.object; floor.name='StudioFloor'; floor.data.materials.append(MATS['ground'])
    scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.62,.69,.76,1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value=.42
    for name,pos,energy,size,color in [
        ('Key',(-40,-50,50),5200,20,(1.0,.78,.62)),
        ('Fill',(44,-18,26),3000,18,(.55,.78,1.0)),
        ('Rim',(8,40,48),4400,17,(.42,.70,1.0)),
    ]:
        data=bpy.data.lights.new(name,'AREA'); obj=bpy.data.objects.new(name,data); bpy.context.collection.objects.link(obj)
        obj.location=pos; obj.rotation_euler=(Vector((0,0,0))-obj.location).to_track_quat('-Z','Y').to_euler(); data.energy=energy; data.size=size; data.color=color
    data=bpy.data.cameras.new('StudioCamera'); cam=bpy.data.objects.new('StudioCamera',data); bpy.context.collection.objects.link(cam)
    cam.location=(60,-92,40); cam.rotation_euler=(Vector((0,-.8,0))-cam.location).to_track_quat('-Z','Y').to_euler(); data.lens=58
    scene.camera=cam; scene.render.engine='BLENDER_EEVEE_NEXT'; scene.render.resolution_x=1400; scene.render.resolution_y=1000; scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'; scene.render.filepath=str(OUT/'sky-sentinel.png'); scene.view_settings.look='AgX - Medium High Contrast'
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'sky-sentinel.blend'))
    bpy.ops.render.render(write_still=True)


def main():
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    global MATS
    MATS={
        'navy':make_material('NavyArmor',COLORS['navy'],.70,.30),
        'navy2':make_material('SecondaryArmor',COLORS['navy2'],.58,.33),
        'graphite':make_material('Graphite',COLORS['graphite'],.80,.24),
        'steel':make_material('Steel',COLORS['steel'],.72,.30),
        'armor':make_material('LightArmor',COLORS['armor'],.45,.34),
        'orangeGlow':make_material('OrangeWarning',COLORS['orange'],.14,.25,COLORS['orange'],8),
        'cyanGlow':make_material('CyanEnergy',COLORS['cyan'],.12,.20,COLORS['cyan'],10),
        'coreGlow':make_material('ReactorGlow',COLORS['core'],.10,.18,COLORS['core'],14),
        'ground':make_material('Ground',COLORS['ground'],0,.90),
    }
    root=build_model(); export_verify(root); studio()

if __name__=='__main__': main()
