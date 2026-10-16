"""Re-import the exported GLB in a new Blender process and evaluate its whole clip."""
import sys, os, json, math
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(__file__))
import bpy
from mathutils import Vector
from stage import fresh_scene, result
with open(os.environ['PB_BLENDER_JOB'], encoding='utf8') as f: job=json.load(f)
scene=fresh_scene(30)
bpy.ops.import_scene.gltf(filepath=job['glb'])
all_meshes=[o for o in scene.objects if o.type=='MESH']
# glTF import creates a hidden unit bone-display mesh. It is a Blender helper,
# not geometry from the GLB, and must not affect the asset's ground measurement.
meshes=[o for o in all_meshes if not o.hide_render and any(m.type=='ARMATURE' for m in o.modifiers)]
rigs=[o for o in scene.objects if o.type=='ARMATURE']
actions=list(bpy.data.actions)
if not meshes or not rigs or len(actions)!=1: raise AssertionError('Expected skinned meshes and exactly one clip')
start,end=actions[0].frame_range
base=None
max_motion=0
ground=[]
return_error=0
for i in range(37):
    frame=start+(end-start)*i/36
    scene.frame_set(math.floor(frame),subframe=frame-math.floor(frame))
    deps=bpy.context.evaluated_depsgraph_get()
    vertices=[]
    for obj in meshes:
        evaluated=obj.evaluated_get(deps)
        vertices.extend(evaluated.matrix_world@v.co for v in evaluated.data.vertices)
    ground.append(min(v.z for v in vertices))
    if base is None: base=[v.copy() for v in vertices]
    delta=max((a-b).length for a,b in zip(vertices,base))
    max_motion=max(max_motion,delta)
    if i==36: return_error=delta
if max_motion<.1 or return_error>.001: raise AssertionError('Animation must move and return to rest')
if min(ground)<-.001: raise AssertionError('Animation sinks below ground: minimum=%s, start=%s, end=%s' % (min(ground),ground[0],ground[-1]))
result({'meshes':len(meshes),'ignoredHelperMeshes':[o.name for o in all_meshes if o not in meshes],'joints':sum(len(r.data.bones) for r in rigs),'clips':[a.name for a in actions],'images':sum(1 for i in bpy.data.images if i.source=='FILE'),'maxMotionM':max_motion,'returnErrorM':return_error,'minimumGroundM':min(ground),'frames':37,'problems':[]})
