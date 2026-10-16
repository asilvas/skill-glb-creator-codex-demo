"""Blender-only textured reference reconstruction. No geometry is imported from Bun."""
import bpy, math, os, sys, json, time
from mathutils import Vector, Euler, Quaternion
sys.dont_write_bytecode=True
sys.path.insert(0,os.path.dirname(__file__))
from stage import fresh_scene, mesh_from_lists, save_blend, result
started=time.perf_counter();scene=fresh_scene(30);out=os.environ['GLB_EXPERIMENT_TMP'];texture_dir=os.environ['GLB_TEXTURE_DIR']
with open(os.path.join(texture_dir,'materials.json'),encoding='utf8') as f: material_manifest=json.load(f)
materials={}
for name,source in {'basalt':'stone','wood':'bark','grain':'bark','moss':'moss','ivory':'ivory','eye':None,'mouth':None}.items():
    m=bpy.data.materials.new(name);m.use_nodes=True;nodes=m.node_tree.nodes;links=m.node_tree.links
    p=next(n for n in nodes if n.type=='BSDF_PRINCIPLED');p.inputs['Roughness'].default_value=.87
    if source:
        record=material_manifest['materials'][source]
        def tex(key,noncolor=False):
            n=nodes.new('ShaderNodeTexImage');n.image=bpy.data.images.load(os.path.join(texture_dir,record[key]),check_existing=True)
            n.image.colorspace_settings.name='Non-Color' if noncolor else 'sRGB';n.extension='REPEAT';return n
        albedo=tex('baseColor')
        links.new(albedo.outputs['Color'],p.inputs['Base Color'])
        normal=nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.85 if source=='bark' else .6
        links.new(tex('normal',True).outputs['Color'],normal.inputs['Color']);links.new(normal.outputs[0],p.inputs['Normal'])
        separate=nodes.new('ShaderNodeSeparateColor');separate.mode='RGB';links.new(tex('roughness',True).outputs['Color'],separate.inputs[0]);links.new(separate.outputs[1],p.inputs['Roughness'])
        if name=='moss':
            clip=nodes.new('ShaderNodeMath');clip.operation='GREATER_THAN';clip.inputs[1].default_value=.4
            links.new(albedo.outputs['Alpha'],clip.inputs[0]);links.new(clip.outputs[0],p.inputs['Alpha'])
    else:
        color=(1,.35,.018,1) if name=='eye' else (.012,.016,.012,1);p.inputs['Base Color'].default_value=color
        if name=='eye':p.inputs['Emission Color'].default_value=color;p.inputs['Emission Strength'].default_value=.7
    materials[name]=m

# Recipe coordinates are Y-up/+Z-forward. Blender world is X,-Z,Y.
floor_shift=0
def world(p):return (p[0],-p[2],p[1]+floor_shift)
bones={'Root':((0,0,0),None),'Chest':((0,1.75,.05),'Root'),'Head':((0,3.35,.4),'Chest')}
for s in (-1,1):
    bones[f'Arm{s}']=((s*.98,3.22,.02),'Chest');bones[f'Fore{s}']=((s*1.57,2.12,.18),f'Arm{s}');bones[f'Hand{s}']=((s*1.87,1.15,.36),f'Fore{s}')
batches={}
def emit(mat,bone,positions,faces,uv,smooth):
    v,f,u,w,flags=batches.setdefault(mat,([],[],[],[],[]));n=len(v)
    v.extend([world(p) for p in positions]);f.extend([[n+i for i in row] for row in faces]);u.extend([[uv[i] for i in row] for row in faces]);w.extend([bone]*len(positions));flags.extend([smooth]*len(faces))
def ell(mat,c,s,bone,seed=0):
    nu,nv=18,12;p=[(c[0],c[1]+s[1],c[2])];uv=[(.5,0)];f=[]
    for j in range(1,nv):
        for i in range(nu+1):
            a=math.pi*j/nv;t=math.pi*2*i/nu;r=1+.035*math.sin((i%nu)*7.13+j*5.7+seed)
            p.append((c[0]+s[0]*math.sin(a)*math.cos(t)*r,c[1]+s[1]*math.cos(a)*r,c[2]+s[2]*math.sin(a)*math.sin(t)*r));uv.append((i/nu,j/nv))
    bottom=len(p);p.append((c[0],c[1]-s[1],c[2]));uv.append((.5,1))
    for i in range(nu):f.append([0,2+i,1+i])
    for j in range(nv-2):
        for i in range(nu):
            a=1+j*(nu+1)+i;b=a+1;d=a+nu+1;e=b+nu+1;f.extend([[a,b,d],[b,e,d]])
    for i in range(nu):f.append([bottom,1+(nv-2)*(nu+1)+i,2+(nv-2)*(nu+1)+i])
    emit(mat,bone,p,f,uv,True)
def tube(mat,points,radii,bone,sides=9):
    p=[];uv=[];f=[];distance=0
    for j,point in enumerate(points):
        d=(Vector(points[min(j+1,len(points)-1)])-Vector(points[max(0,j-1)])).normalized();u=d.cross(Vector((0,0,1)))
        if u.length<.01:u=d.cross(Vector((1,0,0)))
        u.normalize();v=d.cross(u)
        if j:distance+=(Vector(point)-Vector(points[j-1])).length
        for i in range(sides+1):
            t=2*math.pi*i/sides;p.append(tuple(Vector(point)+radii[j]*(math.cos(t)*u+math.sin(t)*v)));uv.append((i/sides,distance/.65))
    for j in range(len(points)-1):
        for i in range(sides):
            a=j*(sides+1)+i;b=a+1;c=a+sides+1;d=b+sides+1;f.extend([[a,b,c],[b,d,c]])
    for end in (0,1):
        offset=len(p);source=(len(points)-1 if end else 0)*(sides+1)
        for i in range(sides):p.append(p[source+i]);angle=2*math.pi*i/sides;uv.append((.5+.45*math.cos(angle),.5+.45*math.sin(angle)))
        center=len(p);p.append(tuple(points[-1 if end else 0]));uv.append((.5,.5))
        for i in range(sides):f.append([center,offset+i,offset+(i+1)%sides] if end else [center,offset+(i+1)%sides,offset+i])
    emit(mat,bone,p,f,uv,True)
def slab(mat,c,s,bone,seed=0,rotation=(0,0,0)):
    # Explicit XYZ quaternion agrees with Three's intrinsic XYZ rotation.
    x,y,z=rotation;cx,sx=math.cos(x/2),math.sin(x/2);cy,sy=math.cos(y/2),math.sin(y/2);cz,sz=math.cos(z/2),math.sin(z/2)
    q=Quaternion((cx*cy*cz-sx*sy*sz,sx*cy*cz+cx*sy*sz,cx*sy*cz-sx*cy*sz,cx*cy*sz+sx*sy*cz));p=[];uv=[];f=[]
    def put(x,y,z):
        p.append(tuple(q@Vector((x*s[0],y*s[1],z*s[2]))+Vector(c)));uv.append((x*.48+.5+(0 if mat=='moss' else seed*.173),y*.48+.5+(0 if mat=='moss' else seed*.237)))
    outline=[(-.9,-.62),(.1,-1),(.84,-.48),(1,.38),(.13,1),(-.76,.7),(-1,.01)]
    for ring in range(3):
        for i in range(7):
            warp=1+.14*math.sin(i*12.719+seed*2.17);scale=(.84,1,.79)[ring]
            put(outline[i][0]*warp*scale,outline[i][1]*warp*scale,(-.7,-.04,.55)[ring]+.08*math.sin(i*4.3+seed))
    put(.05,-.03,.61);put(0,0,-.76)
    for i in range(7):
        nxt=(i+1)%7
        for r in range(2):a=r*7+i;b=r*7+nxt;f.extend([[a,b,a+7],[b,b+7,a+7]])
        f.extend([[21,14+i,14+nxt],[22,nxt,i]])
    emit(mat,bone,p,f,uv,False)
seed=100
def rnd(k):
    x=math.sin(k*127.1+311.7)*43758.5453;return x-math.floor(x)
def plate(c,size,bone,rotation=(0,0,0),growth=True):
    global seed
    k=seed;seed+=1;slab('basalt',c,size,bone,k,rotation)
    if growth and k%3!=0:
        x,y,z=rotation;cx,sx=math.cos(x/2),math.sin(x/2);cy,sy=math.cos(y/2),math.sin(y/2);cz,sz=math.cos(z/2),math.sin(z/2)
        q=Quaternion((cx*cy*cz-sx*sy*sz,sx*cy*cz+cx*sy*sz,cx*sy*cz-sx*cy*sz,cx*cy*sz+sx*sy*cz))
        for i in range(4):
            local=q@Vector(((rnd(k+i)-.5)*size[0],size[1]*(.22+rnd(k+i+7)*.38),size[2]*.61))+Vector(c)
            slab('moss',local,(size[0]*(.26+rnd(k+i+4)*.25),size[1]*.22,.018),bone,k+i,rotation)

def curve(points,t):
    points=[Vector(p) for p in points];f=t*(len(points)-1);i=min(len(points)-2,int(f));u=f-i;p1=points[i];p2=points[i+1];p0=points[i-1] if i else 2*p1-p2;p3=points[i+2] if i+2<len(points) else 2*p2-p1
    return .5*((2*p1)+(-p0+p2)*u+(2*p0-5*p1+4*p2-p3)*u*u+(-p0+3*p1-3*p2+p3)*u*u*u)
def tangent(points,t):return (curve(points,min(1,t+.0001))-curve(points,max(0,t-.0001))).normalized()
def root(points,radius,bone,phase=0,mat='wood'):
    length=sum((curve(points,i/200)-curve(points,(i-1)/200)).length for i in range(1,201));steps=max(8,math.ceil(length*12))
    p=[tuple(curve(points,i/(steps-1))) for i in range(steps)];r=[radius*(.85+.14*math.sin(i*.92+phase))*(1-.18*i/(steps-1)) for i in range(steps)];tube(mat,p,r,bone)
def braid(path,radius,bone,count=12,phase=0):
    for strand in range(count):
        points=[]
        for i in range(14):
            t=i/13;p=curve(path,t);d=tangent(path,t);u=d.cross(Vector((0,0,1)))
            if u.length<.01:u=d.cross(Vector((1,0,0)))
            u.normalize();v=d.cross(u);angle=strand/count*2*math.pi+t*4.8+phase+.22*math.sin(t*11+strand);r=radius*(.64+.22*math.sin(t*8+strand))
            points.append(tuple(p+u*math.cos(angle)*r+v*math.sin(angle)*r))
        root(points,radius*(.25+.11*rnd(strand+phase)),bone,strand,'grain' if strand%4==0 else 'wood')

ell('wood',(0,2.65,.05),(.85,.87,.49),'Chest');ell('wood',(0,1.58,-.03),(.52,.35,.36),'Root')
for s in (-1,1):
    for i in range(9):
        f=i/8;root([(s*(.68-f*.12),3.12,.23),(s*(.65-f*.2),2.75,.48+f*.12),(s*(.35-f*.3),2.23,.47),(s*(-.18+f*.32),1.72,.29)],.065+(i%3)*.014,'Chest',i)
        root([(s*.57,3.16,-.24),(s*(.68-f*.18),2.6,-.46),(s*.33,1.81,-.22)],.066,'Chest',i+5)
    braid([(s*.39,1.57,-.02),(s*.67,1.11,.1),(s*.8,.79,.28)],.30,'Root',14,s+2)
    braid([(s*.8,.86,.25),(s*.65,.48,.03),(s*.7,.21,.2)],.23,'Root',12,s+6)
    for j in range(5):root([(s*.67,.27,.05),(s*(.62+j*.08),.13,.31),(s*(.57+j*.12),.08,.64)],.09,'Root',j)
    plate((s*.67,1.15,.31),(.32,.36,.15),'Root',(.1,s*.3,-s*.2));plate((s*.77,.6,.32),(.29,.37,.18),'Root',(-.1,s*.1,s*.15))
    for j in range(3):plate((s*(.56+j*.14),.16,.52),(.21,.15,.21),'Root',(-.3,s*.12,s*.1),False)
    plate((s*.6,.87,-.23),(.27,.36,.15),'Root',(0,math.pi,0))
    arm=f'Arm{s}';fore=f'Fore{s}';hand=f'Hand{s}';big=s==-1
    braid([(s*.84,3.29,.02),(s*1.26,2.82,.05),(s*1.57,2.1,.18)],.34,arm,16,s+7)
    braid([(s*1.57,2.17,.18),(s*1.77,1.7,.35),(s*1.87,1.12,.36)],.30,fore,15,s+8)
    braid([(s*1.86,1.25,.35),(s*1.91,1.04,.45),(s*1.91,.86,.51)],.25,hand,12,s+1)
    plate((s*1.08,3.52,.04),(.87 if big else .57,.74 if big else .52,.57 if big else .41),arm,(.04,s*.13,-s*.18))
    plate((s*1.30,3.39,.48),(.55 if big else .43,.57 if big else .43,.28),arm,(.08,s*.25,s*.17))
    plate((s*1.36,3.86,.04),(.55 if big else .35,.30,.36),arm,(-.5,s*.15,-s*.24))
    plate((s*1.56,3.34,-.06),(.39,.48,.29),arm,(0,s*1.24,s*.23));plate((s*1.09,3.32,-.44),(.56,.53,.25),arm,(0,math.pi,0))
    plate((s*1.8,1.73,.57),(.45 if big else .38,.65,.25),fore,(.09,s*.25,-s*.1))
    for j in range(3):
        y=2.10-j*.29;plate((s*(1.72+j*.055),y,.55),(.36-j*.02,.32,.17),fore,(.09,s*.25,-s*.1));plate((s*(1.97+j*.035),y,.26),(.24,.29,.13),fore,(0,s*1.1,s*.1));plate((s*(1.69+j*.04),y,-.06),(.28,.29,.13),fore,(0,math.pi,0))
    plate((s*1.91,1.15,.56),(.29,.22,.13),hand,(.1,s*.2,0))
    for j in range(3):
        x=s*(1.69+j*.2);root([(x,1.03,.50),(x+s*.04,.86,.65),(x+s*.06,.75,.67)],.11,hand,j)
        points=[(x+s*.05,.79,.67),(x+s*.09,.60,.81),(x+s*.06,.36,.84),(x-s*.02,.16,.74),(x-s*.12,.08,.57)];radii=[.103,.092,.066,.035,.0025]
        def radius(i):
            t=i/17*4;k=min(3,int(t));return radii[k]+(radii[k+1]-radii[k])*(t-k)
        tube('ivory',[tuple(curve(points,i/17)) for i in range(18)],[radius(i) for i in range(18)],hand,11)
    for j in range(6):ell('ivory',(s*((1.62 if big else 1.49) if j<3 else 2.02)+s*.03*math.sin(j),((3.95-j*.34) if big else (3.35-j*.28)) if j<3 else 2.03-(j-3)*.24,.18),(.15+(j%2)*.035,.028,.16),arm if j<3 else fore,j)
for s in (-1,1):
    for j in range(4):plate((s*(.56-j*.1),3.04-j*.27,.47+j*.025),(.44-j*.035,.30,.18),'Chest',(.05,s*.15,s*(-.43+.04*j)))
plate((0,1.64,.31),(.45,.29,.16),'Root',(.05,0,.18))
for j in range(9):plate(((j%3-1)*.4,2.1+math.floor(j/3)*.42,-.36),(.34,.36,.16),'Chest',(0,math.pi,math.sin(j)*.2))
ell('wood',(0,3.45,.49),(.40,.45,.33),'Head');slab('mouth',(0,3.39,.80),(.37,.39,.08),'Head',35)
for s in (-1,1):
    plate((s*.17,3.34,.91),(.20,.35,.105),'Head',(.03,s*.14,-s*.27),False);plate((s*.22,3.65,.88),(.27,.15,.14),'Head',(.04,s*.1,s*.21))
    ell('eye',(s*.19,3.51,.986),(.055,.017,.012),'Head');slab('mouth',(s*.19,3.51,.96),(.11,.066,.035),'Head',42+s)
    plate((s*.33,3.42,.68),(.17,.29,.16),'Head',(0,s*.8,s*.2));plate((s*.12,3.07,.86),(.13,.21,.1),'Head',(0,s*.12,-s*.32),False)
    horn=[(s*.31,3.76,.34),(s*.57,3.97,.21),(s*.79,4.16,.1),(s*.85,4.40,-.02),(s*.74,4.65,-.03)]
    tube('wood',[tuple(curve(horn,i/25)) for i in range(26)],[.19*(1-i/26)**.9+.005 for i in range(26)],'Head',12)
    root([(s*.78,4.18,.08),(s*1.11,4.27,.1),(s*1.23,4.47,.07)],.07,'Head',s);root([(s*.55,3.96,.21),(s*.43,4.23,.17),(s*.28,4.34,.13)],.055,'Head',s+4)
    for j in range(7):root([(s*(.33+j*.014),3.72,.45),(s*(.55+j*.017),4.02,.32),(s*(.8+j*.005),4.25,.15)],.017,'Head',j,'grain')
plate((0,3.83,.68),(.31,.27,.18),'Head',(.18,0,.09))

floor_shift=max(0,-min(v[2] for batch in batches.values() for v in batch[0]))
for batch in batches.values():batch[0][:]=[(v[0],v[1],v[2]+floor_shift) for v in batch[0]]
ad=bpy.data.armatures.new('WardenRig');rig=bpy.data.objects.new('WardenRig',ad);scene.collection.objects.link(rig);bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
for name,(head,parent) in bones.items():
    b=ad.edit_bones.new(name);b.head=world(head);b.tail=Vector(world(head))+Vector((0,.3,0))
    if parent:b.parent=ad.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')
for name,(verts,faces,uvs,weights,smooth) in batches.items():
    obj=mesh_from_lists(name,verts,faces,uvs=uvs,smooth=False);obj.data.materials.append(materials[name])
    for poly,flag in zip(obj.data.polygons,smooth):poly.use_smooth=flag
    for bone in bones:
        ids=[i for i,w in enumerate(weights) if w==bone]
        if ids:obj.vertex_groups.new(name=bone).add(ids,1,'REPLACE')
    obj.modifiers.new('deform','ARMATURE').object=rig
times=[0,.3,14/30,19/30,26/30,1.2];shoulder=[0,-.48,-1.18,.78,.24,0];elbow=[0,-.2,-.48,.32,.1,0];twist=[0,.09,.17,-.13,-.05,0]
def pose_quat(x,y,z):
    cx,sx=math.cos(x/2),math.sin(x/2);cy,sy=math.cos(y/2),math.sin(y/2);cz,sz=math.cos(z/2),math.sin(z/2)
    qx=sx*cy*cz+cx*sy*sz;qy=cx*sy*cz-sx*cy*sz;qz=cx*cy*sz+sx*sy*cz;qw=cx*cy*cz-sx*sy*sz
    return Quaternion((qw,qx,-qz,qy))
for i,t in enumerate(times):
    rotations={'Arm-1':(shoulder[i],0,0),'Fore-1':(elbow[i],0,0),'Arm1':(-shoulder[i]*.2,0,0),'Chest':(twist[i]*.25,-twist[i],0),'Head':(0,twist[i]*.6,0)}
    for name,b in rig.pose.bones.items():b.rotation_mode='QUATERNION';b.rotation_quaternion=pose_quat(*rotations.get(name,(0,0,0)));b.keyframe_insert('rotation_quaternion',frame=t*30,group=name)
rig.animation_data.action.name='attack';scene.frame_start=0;scene.frame_end=36;scene.frame_set(0)
if os.environ.get('GLB_BENCH_ITERATION')!='1':save_blend(os.path.join(out,'baseline.blend'))
options=dict(filepath=os.path.join(out,'blender.glb'),export_format='GLB',export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_force_sampling=True,export_frame_range=True,export_skins=True,export_yup=True,export_tangents=True)
if 'export_nla_strips_merged_animation_name' in bpy.ops.export_scene.gltf.get_rna_type().properties:options['export_nla_strips_merged_animation_name']='attack'
bpy.ops.export_scene.gltf(**options)
result({'seconds':time.perf_counter()-started,'glbBytes':os.path.getsize(os.path.join(out,'blender.glb')),'vertices':sum(len(b[0]) for b in batches.values()),'clips':1,'bones':9,'textured':True})
if os.environ.get('GLB_BENCH_ITERATION')=='1':
    import runpy
    runpy.run_path(os.path.join(os.path.dirname(__file__),'blender-preview.py'),run_name='__main__')
