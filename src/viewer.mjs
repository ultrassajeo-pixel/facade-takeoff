const palette=['#466c50','#71905b','#ac8654','#697a96','#9b7581','#609c95','#b1984f'];
function pointInside(p,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[j],b=ring[i];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;}return inside;}
export function layerColor(name) {let n=0;for(const c of name)n=(n*31+c.charCodeAt(0))>>>0;return palette[n%palette.length];}
export class DrawingViewer {
  constructor(canvas,onSelect,onMove,onZoom) {
    this.canvas=canvas;this.ctx=canvas.getContext('2d');this.onSelect=onSelect;this.onMove=onMove;this.onZoom=onZoom;
    this.drawing=null;this.scale=1;this.fitScale=1;this.ox=0;this.oy=0;this.hidden=new Set();this.selected=null;this.highlighted=new Set();
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(canvas.parentElement);
    canvas.addEventListener('pointerdown',e=>{this.drag={x:e.offsetX,y:e.offsetY,ox:this.ox,oy:this.oy,moved:false};canvas.setPointerCapture(e.pointerId);});
    canvas.addEventListener('pointermove',e=>{
      const p=this.toWorld(e.offsetX,e.offsetY);onMove(p);
      if(this.drag){const dx=e.offsetX-this.drag.x,dy=e.offsetY-this.drag.y;if(Math.hypot(dx,dy)>3)this.drag.moved=true;this.ox=this.drag.ox+dx;this.oy=this.drag.oy+dy;this.draw();}
    });
    canvas.addEventListener('pointerup',e=>{if(this.drag&&!this.drag.moved)this.selectAt(e.offsetX,e.offsetY);this.drag=null;});
    canvas.addEventListener('pointercancel',()=>this.drag=null);
    canvas.addEventListener('wheel',e=>{if(!this.drawing)return;e.preventDefault();this.zoom(Math.exp(-Math.max(-100,Math.min(100,e.deltaY))*.006),e.offsetX,e.offsetY);},{passive:false});
    canvas.parentElement.addEventListener('keydown',e=>{if(e.key==='0'){this.fit();e.preventDefault();}if(e.key==='+'||e.key==='=')this.zoom(1.3);if(e.key==='-')this.zoom(1/1.3);});
  }
  resize(){const r=this.canvas.parentElement.getBoundingClientRect(),d=window.devicePixelRatio||1;this.width=r.width;this.height=r.height;this.canvas.width=Math.round(r.width*d);this.canvas.height=Math.round(r.height*d);this.ctx.setTransform(d,0,0,d,0,0);if(this.drawing)this.fit();else this.draw();}
  load(drawing){this.drawing=drawing;this.showRecovered=false;this.hidden=new Set(drawing.layers.filter(l=>l.off||l.frozen).map(l=>l.name));this.selected=null;this.highlighted=new Set();this.fit();}
  toWorld(x,y){return{x:(x-this.ox)/this.scale,y:(this.oy-y)/this.scale};}
  toScreen(p){return{x:this.ox+p.x*this.scale,y:this.oy-p.y*this.scale};}
  fit(){if(!this.drawing)return;const b=this.drawing.bounds,w=Math.max(b.maxX-b.minX,1e-6),h=Math.max(b.maxY-b.minY,1e-6);this.scale=Math.min((this.width-90)/w,(this.height-90)/h);this.fitScale=this.scale;this.ox=this.width/2-(b.minX+b.maxX)/2*this.scale;this.oy=this.height/2+(b.minY+b.maxY)/2*this.scale;this.draw();this.onZoom(1);}
  zoom(f,x=this.width/2,y=this.height/2){if(!this.drawing)return;const p=this.toWorld(x,y);this.scale=Math.max(this.fitScale*.02,Math.min(this.fitScale*200,this.scale*f));this.ox=x-p.x*this.scale;this.oy=y+p.y*this.scale;this.draw();this.onZoom(this.scale/this.fitScale);}
  setLayer(name,visible){visible?this.hidden.delete(name):this.hidden.add(name);this.draw();}
  visible(s){return this.highlighted.has(s.id)||(!this.hidden.has(s.layer)&&s.visible!==false);}
  draw(){const c=this.ctx;c.clearRect(0,0,this.width,this.height);if(!this.drawing)return;
    c.lineCap='round';c.lineJoin='round';
    for(const s of this.drawing.shapes){if(!this.visible(s))continue;if(s.reconstruction&&!this.showRecovered&&!this.highlighted.has(s.id)&&s.id!==this.selected)continue;
      const highlight=this.highlighted.has(s.id);c.globalAlpha=this.highlighted.size&&!highlight?0.25:1;
      c.strokeStyle=highlight||s.id===this.selected?'#cf8424':layerColor(s.layer);c.lineWidth=highlight||s.id===this.selected?2.6:1;
      for(const path of s.paths||[s.points]){c.beginPath();path.forEach((p,i)=>{const t=this.toScreen(p);i?c.lineTo(t.x,t.y):c.moveTo(t.x,t.y);});if(s.closed&&!s.paths)c.closePath();if(path.length===1){const p=this.toScreen(path[0]);c.arc(p.x,p.y,2.5,0,Math.PI*2);}if(s.reconstruction){c.globalAlpha=1;c.fillStyle=s.reconstruction.caution?'#c958442f':'#317aaf30';c.fill();c.strokeStyle=s.reconstruction.caution?'#c95844':'#317aaf';c.lineWidth=1.5;}c.stroke();}
      if(s.reconstruction){const ps=s.points,x0=Math.min(...ps.map(p=>p.x)),x1=Math.max(...ps.map(p=>p.x)),y0=Math.min(...ps.map(p=>p.y)),y1=Math.max(...ps.map(p=>p.y));if((x1-x0)*this.scale>40&&(y1-y0)*this.scale>20){const p=this.toScreen({x:(x0+x1)/2,y:(y0+y1)/2});c.fillStyle='#16496b';c.font='11px -apple-system,sans-serif';c.fillText(s.reconstruction.label,p.x-16,p.y);}}
    }
    c.globalAlpha=1;
    if(this.overlay&&this.showOverlay){
      const scale=this.overlay.scale;
      for(const panel of this.overlay.panels){const color=panel.column%2?'#3f8b8b':'#bf9a49';c.fillStyle=color+'28';c.strokeStyle=color;c.lineWidth=1.3;
        for(const rect of panel.cells){const a=this.toScreen({x:rect.x0/scale,y:rect.y1/scale}),b=this.toScreen({x:rect.x1/scale,y:rect.y0/scale});c.fillRect(a.x,a.y,b.x-a.x,b.y-a.y);}
        if(panel.polygons){c.beginPath();for(const poly of panel.polygons)for(const ring of poly){ring.forEach(([x,y],i)=>{const q=this.toScreen({x:x/scale,y:y/scale});i?c.lineTo(q.x,q.y):c.moveTo(q.x,q.y);});c.closePath();}c.fill('evenodd');c.stroke();continue;}
        const r=panel.rect,a=this.toScreen({x:r.x0/scale,y:r.y1/scale}),b=this.toScreen({x:r.x1/scale,y:r.y0/scale});c.strokeRect(a.x,a.y,b.x-a.x,b.y-a.y);
        if(b.x-a.x>25&&b.y-a.y>20){c.font='9px -apple-system,sans-serif';c.fillStyle='#234338';c.fillText(panel.id,a.x+3,a.y+12);}
      }
    }
    for(const t of this.drawing.texts){if(this.hidden.has(t.layer))continue;const p=this.toScreen(t.point);const size=Math.max(3,Math.min(80,t.height*this.scale));if(size<4||p.x<-1500||p.x>this.width+1500||p.y<-100||p.y>this.height+100)continue;
      c.save();for(const clip of t.clips||[]){c.beginPath();if(clip.inverted)c.rect(-10000,-10000,20000,20000);clip.polygon.forEach((p,i)=>{const q=this.toScreen(p);i?c.lineTo(q.x,q.y):c.moveTo(q.x,q.y);});c.closePath();c.clip('evenodd');}c.translate(p.x,p.y);c.rotate(-t.rotation);c.fillStyle=layerColor(t.layer);c.font=`${size}px -apple-system, sans-serif`;t.text.split('\n').slice(0,50).forEach((line,i)=>c.fillText(line,0,i*size*1.35));c.restore();
    }
  }
  highlightShapes(ids,focus=false){
    this.highlighted=new Set(ids);if(!this.drawing)return;
    if(focus&&ids.length){let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
      for(const s of this.drawing.shapes)if(this.highlighted.has(s.id))for(const p of s.points){minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y);}
      if(Number.isFinite(minX)){this.scale=Math.min((this.width-100)/Math.max(maxX-minX,1),(this.height-100)/Math.max(maxY-minY,1));this.ox=this.width/2-(minX+maxX)/2*this.scale;this.oy=this.height/2+(minY+maxY)/2*this.scale;this.onZoom(this.scale/this.fitScale);}
    }this.draw();
  }
  selectAt(x,y){if(!this.drawing)return;let closest=null,distance=8;
    if(this.showRecovered){const p=this.toWorld(x,y);closest=this.drawing.shapes.find(s=>s.reconstruction&&this.visible(s)&&pointInside(p,s.points));if(closest){this.selected=closest.id;this.draw();this.onSelect(closest);return;}}
    for(const s of this.drawing.shapes){if(!this.visible(s))continue;for(const ps of s.paths||[s.points])for(let i=0;i<ps.length-(s.closed&&!s.paths?0:1);i++){
      const a=this.toScreen(ps[i]),b=this.toScreen(ps[(i+1)%ps.length]);const dx=b.x-a.x,dy=b.y-a.y;const t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1)));const d=Math.hypot(x-a.x-t*dx,y-a.y-t*dy);if(d<distance){closest=s;distance=d;}
    }}
    this.selected=closest?.id;this.draw();this.onSelect(closest);
  }
  focusHandle(handle){const s=this.drawing?.shapes.find(s=>s.handle===handle);if(!s)return;this.hidden.delete(s.layer);this.selected=s.id;const minX=Math.min(...s.points.map(p=>p.x)),maxX=Math.max(...s.points.map(p=>p.x)),minY=Math.min(...s.points.map(p=>p.y)),maxY=Math.max(...s.points.map(p=>p.y));this.scale=Math.min((this.width-100)/Math.max(maxX-minX,1),(this.height-100)/Math.max(maxY-minY,1));this.ox=this.width/2-(minX+maxX)/2*this.scale;this.oy=this.height/2+(minY+maxY)/2*this.scale;this.draw();this.onSelect(s);this.onZoom(this.scale/this.fitScale);}
}
