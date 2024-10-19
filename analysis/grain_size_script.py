import bpy

for i in range(3):
    bpy.data.objects["Cube"].update_tag()
    bpy.context.view_layer.update()
