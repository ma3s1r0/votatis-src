const fs = require("fs");
const raw = JSON.parse(fs.readFileSync("/tmp/sigungu_raw.json", "utf8"));
const SIDO = {
  "11":"서울특별시","21":"부산광역시","22":"대구광역시","23":"인천광역시",
  "24":"광주광역시","25":"대전광역시","26":"울산광역시","29":"세종특별자치시",
  "31":"경기도","32":"강원특별자치도","33":"충청북도","34":"충청남도",
  "35":"전북특별자치도","36":"전라남도","37":"경상북도","38":"경상남도","39":"제주특별자치도",
};
const EPS = 0.0012; // ~130m 단순화 허용오차(시군구 자동입력엔 충분)
const r4 = (x) => Math.round(x * 1e4) / 1e4;

function perp([px,py],[ax,ay],[bx,by]){
  const dx=bx-ax, dy=by-ay;
  if(dx===0&&dy===0) return Math.hypot(px-ax,py-ay);
  const t=((px-ax)*dx+(py-ay)*dy)/(dx*dx+dy*dy);
  const cx=ax+t*dx, cy=ay+t*dy;
  return Math.hypot(px-cx,py-cy);
}
function dp(pts,eps){
  if(pts.length<3) return pts;
  let dmax=0, idx=0;
  for(let i=1;i<pts.length-1;i++){const d=perp(pts[i],pts[0],pts[pts.length-1]); if(d>dmax){dmax=d;idx=i;}}
  if(dmax>eps){ const l=dp(pts.slice(0,idx+1),eps); const rr=dp(pts.slice(idx),eps); return l.slice(0,-1).concat(rr); }
  return [pts[0],pts[pts.length-1]];
}
function simplifyRing(ring){
  let s=dp(ring,EPS).map(([x,y])=>[r4(x),r4(y)]);
  // 연속 중복 제거
  const out=[]; for(const p of s){const q=out[out.length-1]; if(!q||q[0]!==p[0]||q[1]!==p[1]) out.push(p);} 
  // 닫힘 보장
  if(out.length && (out[0][0]!==out[out.length-1][0]||out[0][1]!==out[out.length-1][1])) out.push(out[0]);
  return out;
}

const result=[];
let skipped=0;
for(const f of raw.features){
  const sido=SIDO[f.properties.code.slice(0,2)];
  if(!sido){skipped++;continue;}
  const sigungu=f.properties.name;
  const g=f.geometry;
  const rawPolys = g.type==="Polygon" ? [g.coordinates] : g.type==="MultiPolygon" ? g.coordinates : [];
  const polygons=[];
  let minLng=Infinity,minLat=Infinity,maxLng=-Infinity,maxLat=-Infinity;
  for(const poly of rawPolys){
    const rings=[];
    for(let ri=0; ri<poly.length; ri++){
      const ring=simplifyRing(poly[ri]);
      if(ring.length<4){ if(ri===0){rings.length=0;break;} else continue; } // 외곽 퇴화→폴리곤 버림
      rings.push(ring);
      if(ri===0) for(const [x,y] of ring){ if(x<minLng)minLng=x; if(x>maxLng)maxLng=x; if(y<minLat)minLat=y; if(y>maxLat)maxLat=y; }
    }
    if(rings.length) polygons.push(rings);
  }
  if(!polygons.length){skipped++;continue;}
  result.push({sido,sigungu,bbox:[minLng,minLat,maxLng,maxLat],polygons});
}
const out="/Users/ma3s1r0/Documents/001.Workbench/votatis/apps/api/src/geocode/sigungu.json";
fs.writeFileSync(out, JSON.stringify(result));
const bytes=fs.statSync(out).size;
console.log("features:",result.length,"skipped:",skipped,"size:",(bytes/1024/1024).toFixed(2)+"MB");
