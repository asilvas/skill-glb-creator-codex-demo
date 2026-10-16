import bpy, os, sys, math, time
from mathutils import Vector
sys.path.insert(0,os.path.abspath(os.path.join(os.path.dirname(__file__),'../../scripts/blender')))
from stage import fresh_scene, result
start=time.perf_counter();scene=fresh_scene(30);out=os.environ['GLB_EXPERIMENT_TMP']
bpy.ops.import_scene.gltf(filepath=os.path.join(out,os.environ.get('GLB_INPUT','blender.glb')))
clips=[a.name for a in bpy.data.actions]
scene.render.engine=next(i.identifier for i in scene.render.bl_rna.properties['engine'].enum_items if i.identifier.startswith('BLENDER_EEVEE'))
scene.render.resolution_x=512;scene.render.resolution_y=512;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('studio');scene.world.use_nodes=True
scene.world.node_tree.nodes.get('Background').inputs[0].default_value=(.38,.36,.31,1)
scene.world.node_tree.nodes.get('Background').inputs[1].default_value=.65
scene.view_settings.view_transform='Standard'
def light(name,pos,power,size):
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size
    o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=pos;o.rotation_euler=(Vector((0,0,2))-o.location).to_track_quat('-Z','Y').to_euler()
light('key',(4,-6,8),1500,5);light('fill',(-4,-2,4),650,4);light('rim',(0,4,6),1800,3)
# Floor is review-scene-only and excluded from the GLB.
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.01));floor=bpy.context.object
m=bpy.data.materials.new('floor');m.diffuse_color=(.48,.44,.36,1);floor.data.materials.append(m)
d=bpy.data.cameras.new('camera');cam=bpy.data.objects.new('camera',d);scene.collection.objects.link(cam);scene.camera=cam;d.type='ORTHO';d.ortho_scale=5.8
# Cache the exported model's full-cycle bounds before framing any pose.
model=[o for o in scene.objects if o.type=='MESH' and o!=floor]
lo=Vector((float('inf'),)*3);hi=Vector((-float('inf'),)*3)
for i in range(17):
    t=36*i/16;scene.frame_set(int(t),subframe=t-int(t));deps=bpy.context.evaluated_depsgraph_get()
    for obj in model:
        evaluated=obj.evaluated_get(deps)
        for vert in evaluated.data.vertices:
            q=evaluated.matrix_world@vert.co
            for axis in range(3):lo[axis]=min(lo[axis],q[axis]);hi[axis]=max(hi[axis],q[axis])
center=(lo+hi)/2;distance=(hi-lo).length*2+1
corners=[Vector((x,y,z)) for x in (lo.x,hi.x) for y in (lo.y,hi.y) for z in (lo.z,hi.z)]
label=os.environ.get('GLB_LABEL','blender')
rows=[]
for name,frame,pos in [('hero',0,(6,-10,5.3)),('windup',14,(6,-10,5.3)),('impact',19,(6,-10,5.3)),('side',0,(11.662,0,5.3)),('back',0,(-6,10,5.3))]:
    scene.frame_set(frame);angle=math.atan2(pos[0],-pos[1]);cam.location=center+Vector((math.sin(angle)*distance,-math.cos(angle)*distance,distance*3.25/11.662));cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler()
    d.clip_start=max(.0001,distance/10000);d.clip_end=distance*5;bpy.context.view_layer.update();inv=cam.matrix_world.inverted()
    d.ortho_scale=max(max(abs((inv@q).x),abs((inv@q).y)) for q in corners)*2.12
    p=os.path.join(out,f'{label}-{name}.png');scene.render.filepath=p
    capture=os.environ.get('GLB_CAPTURE','1')=='1'
    t=time.perf_counter();bpy.ops.render.render(write_still=capture);rows.append({'name':name,'seconds':time.perf_counter()-t,'path':p if capture else None})
result({'seconds':time.perf_counter()-start,'clips':clips,'frames':rows})
