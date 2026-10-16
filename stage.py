"""Small local stage helpers. Runs only inside background Blender, not system Python."""
import sys
sys.dont_write_bytecode = True
import os, json
from array import array
import bpy

def fresh_scene(fps=30):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    scene = bpy.context.scene
    scene.render.fps, scene.render.fps_base = int(fps), 1.0
    if len(bpy.data.objects): raise AssertionError('Factory scene is not empty')
    return scene

def save_blend(path):
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(path), check_existing=False)

def mesh_from_lists(name, verts, faces, uvs=None, smooth=False):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    if uvs is not None:
        layer = mesh.uv_layers.new(name='UVMap')
        if len(uvs)!=len(faces) or any(len(u)!=len(f) for u,f in zip(uvs,faces)): raise ValueError('UV corner count differs')
        # One RNA batch, matching the original baseline. Per-corner setters incur
        # repeated Blender updates and distort a time comparison on this mesh.
        layer.data.foreach_set('uv', array('f',(c for face in uvs for corner in face for c in corner)))
    if mesh.validate(verbose=False): raise ValueError('Invalid explicit mesh')
    if smooth: mesh.shade_smooth()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj

def result(data):
    path = os.environ['PB_BLENDER_RESULT']
    packet = dict(data, blender_version=bpy.app.version_string, blender_build_hash=bpy.app.build_hash.decode())
    os.makedirs(os.path.dirname(path), exist_ok=True)
    temporary = path + '.writing'
    with open(temporary, 'w', encoding='utf8') as f: json.dump(packet, f, indent=2)
    os.replace(temporary, path)
