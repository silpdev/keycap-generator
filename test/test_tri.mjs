import { triangulate, signedArea, buildPrism } from '../src/geom.mjs';
const circle=(r,n=64,cx=0,cy=0)=>Array.from({length:n},(_,i)=>{const a=2*Math.PI*i/n;return [cx+r*Math.cos(a),cy+r*Math.sin(a)];});
function area(tris,pts){let s=0;for(const [a,b,c] of tris){s+=Math.abs((pts[b][0]-pts[a][0])*(pts[c][1]-pts[a][1])-(pts[c][0]-pts[a][0])*(pts[b][1]-pts[a][1]))/2;}return s;}
function check(name, outer, holes){
  const t0=Date.now();
  const {pts,tris}=triangulate(outer,holes);
  const got=area(tris,pts);
  const want=Math.abs(signedArea(outer))-holes.reduce((s,h)=>s+Math.abs(signedArea(h)),0);
  const err=100*(got/want-1);
  console.log(`${name.padEnd(34)} lo=${String(holes.length).padStart(2)}  mong doi ${want.toFixed(2).padStart(9)}  duoc ${got.toFixed(2).padStart(9)}  lech ${err>=0?'+':''}${err.toFixed(2)}%  ${Math.abs(err)<0.5?'OK':'SAI'}  ${Date.now()-t0}ms`);
}
check('1 lo tron giua', circle(10), [circle(5).slice().reverse()]);
check('2 lo tron', circle(10), [circle(2,32,-5,0).reverse(), circle(2,32,5,0).reverse()]);
check('4 lo tron', circle(10), [circle(1.5,24,-5,0).reverse(),circle(1.5,24,5,0).reverse(),circle(1.5,24,0,-5).reverse(),circle(1.5,24,0,5).reverse()]);
// annulus + 6 thin radial slits: dung topology cua logo ChatGPT
const slits=[];
for(let k=0;k<6;k++){const a=k*Math.PI/3,ux=Math.cos(a),uy=Math.sin(a),px=-uy,py=ux,hw=0.30,r0=5.6,r1=10.1;
  slits.push([[ux*r0+px*hw,uy*r0+py*hw],[ux*r1+px*hw,uy*r1+py*hw],[ux*r1-px*hw,uy*r1-py*hw],[ux*r0-px*hw,uy*r0-py*hw]].reverse());}
check('vanh + 1 lo tam', circle(10.5), [circle(5.2,64).reverse()]);
check('vanh + tam + 6 ranh manh', circle(10.5), [circle(5.2,64).reverse(), ...slits]);
check('vanh + 6 ranh manh (khong tam)', circle(10.5), slits);

// --- stress: nhieu lo + nhieu diem
const rnd=(s=>()=>((s=s*1103515245+12345)>>>16)/65536)(7);
const many=[]; for(let k=0;k<20;k++){const a=2*Math.PI*k/20,rr=6.5;
  many.push(circle(0.7,16,rr*Math.cos(a),rr*Math.sin(a)).reverse());}
check('20 lo nho', circle(10,256), many);
const big=circle(10,900); const bigH=[];
for(let k=0;k<30;k++){const a=2*Math.PI*k/30,rr=7;bigH.push(circle(0.5,24,rr*Math.cos(a),rr*Math.sin(a)).reverse());}
check('900 diem + 30 lo', big, bigH);
// --- lo hinh sao (nhieu goc lom)
const star=[]; for(let i=0;i<60;i++){const a=2*Math.PI*i/60, rr=i%2?2:4.5; star.push([rr*Math.cos(a),rr*Math.sin(a)]);}
check('lo hinh sao 60 dinh', circle(10,128), [star.reverse()]);
// --- extrude va kiem tra kin khoi
import fs from 'fs';
import { buildStl } from '../src/export3mf.mjs';
const slits2=[];
for(let k=0;k<6;k++){const a=k*Math.PI/3,ux=Math.cos(a),uy=Math.sin(a),px=-uy,py=ux,hw=0.30,r0=5.6,r1=10.1;
  slits2.push([[ux*r0+px*hw,uy*r0+py*hw],[ux*r1+px*hw,uy*r1+py*hw],[ux*r1-px*hw,uy*r1-py*hw],[ux*r0-px*hw,uy*r0-py*hw]].reverse());}
const rings=[{outer:circle(10.5,128), holes:[circle(5.2,64).reverse(), ...slits2]}];
const m=buildPrism(rings,0,1).weld();
fs.mkdirSync('out',{recursive:true});
fs.writeFileSync('out/tri_knot.stl', buildStl([m],'knot'));
console.log(`\nextrude knot: ${m.F.length} tam giac, ${m.V.length} dinh -> out/tri_knot.stl`);
