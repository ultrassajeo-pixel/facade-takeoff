"""Write a LibreDWG dwgadd recipe: native DWG creation, no DXF import required."""
from pathlib import Path
import json
root=Path(__file__).resolve().parent.parent
out=root/'samples'
out.mkdir(exist_ok=True)
lines=['version 2000','HEADER.INSUNITS = 4','HEADER.MEASUREMENT = 1','HEADER.LUNITS = 2','HEADER.LUPREC = 0']
layers=['WALL_OUTLINE','WINDOW_OPENINGS','DOOR_OPENING','SUPPORT_AXES','DIMENSIONS','NOTES']
for layer in layers:lines.append(f'layer "{layer}"')
def layer(kind,name):lines.append(f'{kind}.layer = "{name}"')
def rect(x,y,w,h,name):
    lines.append(f'lwpolyline 4 (({x} {y}) ({x+w} {y}) ({x+w} {y+h}) ({x} {y+h}))')
    lines.append('lwpolyline.flag = 512')
    layer('lwpolyline',name)
def line(x1,y1,x2,y2,name):
    lines.append(f'line ({x1} {y1} 0) ({x2} {y2} 0)');layer('line',name)
def text(value,x,y,h,name='NOTES'):
    lines.append(f'text "{value}" ({x} {y} 0) {h}');layer('text',name)
rect(0,0,12000,6000,'WALL_OUTLINE')
for x in [1500,7500]:rect(x,2400,1500,1200,'WINDOW_OPENINGS')
rect(5100,0,1200,2400,'DOOR_OPENING')
for y in range(0,6001,1200):line(-200,y,12200,y,'SUPPORT_AXES')
text('EAST ELEVATION / SYNTHETIC SAMPLE',0,7200,260)
text('W01  1500 x 1200',1550,2900,130)
text('W02  1500 x 1200',7550,2900,130)
text('D01  1200 x 2400',5150,1100,110)
text('SUPPORT AXES @ 1200 mm (ILLUSTRATIVE)',0,-1500,170)
text('UNITS: mm / PANEL AND FIXING SPECIFICATIONS NOT DEFINED',0,-1850,145)
text('SOFTWARE TEST ONLY - NOT FOR CONSTRUCTION',0,-2200,145)
# Dimension graphics are explicit model-space entities; source values are known exactly.
for x1,y1,x2,y2 in [(0,-150,0,-800),(12000,-150,12000,-800),(0,-600,12000,-600),(-100,-700,100,-500),(11900,-700,12100,-500)]:line(x1,y1,x2,y2,'DIMENSIONS')
text('12000',5500,-520,180,'DIMENSIONS')
for x1,y1,x2,y2 in [(-150,0,-900,0),(-150,6000,-900,6000),(-700,0,-700,6000),(-800,-100,-600,100),(-800,5900,-600,6100)]:line(x1,y1,x2,y2,'DIMENSIONS')
text('6000',-1350,2900,180,'DIMENSIONS')
lines.extend(['dimension_aligned (0 0 0) (12000 0 0) (6000 -600 0)','dimali.layer = "DIMENSIONS"','dimali.act_measurement = 12000',
              'dimension_aligned (0 0 0) (0 6000 0) (-700 3000 0)','dimali.layer = "DIMENSIONS"','dimali.act_measurement = 6000'])
(out/'facade_sample_12m_6m.dwgadd').write_text('\n'.join(lines)+'\n')
expected={'units':'mm','wall':{'width':12000,'height':6000,'area_m2':72},
          'windows':[{'x':1500,'y':2400,'width':1500,'height':1200},{'x':7500,'y':2400,'width':1500,'height':1200}],
          'door':{'x':5100,'y':0,'width':1200,'height':2400},'opening_area_m2':6.48,'net_geometric_area_m2':65.52,
          'support_axes_mm':[0,1200,2400,3600,4800,6000],'linear_dimensions_mm':[12000,6000],
          'model_entity_count':31,'layers':{'WALL_OUTLINE':1,'WINDOW_OPENINGS':2,'DOOR_OPENING':1,'SUPPORT_AXES':6,'DIMENSIONS':14,'NOTES':7},
          'quantity_result':None,'note':'Synthetic software fixture only. Net geometry area is not material quantity.'}
(out/'facade_sample_expected.json').write_text(json.dumps(expected,indent=2))
print(out/'facade_sample_12m_6m.dwgadd')
