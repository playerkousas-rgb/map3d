import { pointInRing, type PlanPoint } from './footprint';

/** Identify four actual corners without deleting source boundary nodes.
 * Inspired by upstream getSimplifiedPolygon, but NOT its broad dot-product
 * tolerance: only forward, near-collinear runs bounded against the full chord.
 * This does not repair outlines or relax the rectangle's orthogonality guard.
 */
export function hippedOutline(plan: PlanPoint[]) {
  if (plan.length < 4 || !plan.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.z))) return undefined;
  const lengths=plan.map((p,i)=>Math.hypot(plan[(i+1)%plan.length].x-p.x,plan[(i+1)%plan.length].z-p.z));
  if (lengths.some(n=>!Number.isFinite(n)||n<=1e-8)) return undefined;
  const corners=plan.map((p,i)=>{
    const a=plan[(i+plan.length-1)%plan.length],b=plan[(i+1)%plan.length];
    const ux=p.x-a.x,uz=p.z-a.z,vx=b.x-p.x,vz=b.z-p.z;
    return ux*vx+uz*vz>0&&Math.abs(ux*vz-uz*vx)<=lengths[(i+plan.length-1)%plan.length]*lengths[i]*1e-6 ? -1 : i;
  }).filter(i=>i>=0);
  if(corners.length!==4) return undefined;
  const maxSide=Math.max(...corners.map((i,k)=>Math.hypot(plan[corners[(k+1)%4]].x-plan[i].x,plan[corners[(k+1)%4]].z-plan[i].z)));
  for(let k=0;k<4;k++){
    const start=corners[k],end=corners[(k+1)%4],a=plan[start],b=plan[end],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
    let previous=0;
    for(let i=(start+1)%plan.length;i!==end;i=(i+1)%plan.length){
      const p=plan[i],along=((p.x-a.x)*dx+(p.z-a.z)*dz)/(len*len);
      // A local chain of tiny turns must not hide cumulative curvature, a
      // backtrack or a dent. Keep original coordinates for roof/wall geometry.
      if(!(along>previous&&along<1)||Math.abs((p.x-a.x)*dz-(p.z-a.z)*dx)>len*maxSide*1e-7) return undefined;
      previous=along;
    }
  }
  return corners.map(i=>plan[i]);
}

/** Independent four-corner subset of the inspected OSM2World ridge model.
 * No skeleton/Java source copied. Preserve original corners, never replace a
 * trapezoid/courtyard with a bounding rectangle. Small projection noise only.
 */
export function rectangularHip(plan: PlanPoint[], axis: PlanPoint) {
  const outline=hippedOutline(plan);
  if (!outline) return undefined;
  const lengths = outline.map((p,i)=>Math.hypot(outline[(i+1)%4].x-p.x,outline[(i+1)%4].z-p.z));
  if (lengths.some(n=>!Number.isFinite(n)||n<=1e-8)) return undefined;
  const tolerance = 1e-4;
  for (let i=0;i<4;i++) {
    const a=outline[i],b=outline[(i+1)%4],c=outline[(i+2)%4];
    const dot=(b.x-a.x)*(c.x-b.x)+(b.z-a.z)*(c.z-b.z);
    if (Math.abs(dot)>lengths[i]*lengths[(i+1)%4]*tolerance) return undefined;
  }
  const origin=outline[0];
  const along=(p:PlanPoint)=>axis.x*(p.x-origin.x)+axis.z*(p.z-origin.z);
  const across=(p:PlanPoint)=>-axis.z*(p.x-origin.x)+axis.x*(p.z-origin.z);
  // A direction must be parallel to actual edges, not merely a bounding box.
  if (!outline.some((p,i)=>Math.abs(along(outline[(i+1)%4])-along(p))<=lengths[i]*tolerance)) return undefined;
  const us=outline.map(along),vs=outline.map(across);
  const minU=Math.min(...us),maxU=Math.max(...us),minV=Math.min(...vs),maxV=Math.max(...vs);
  const length=maxU-minU,width=maxV-minV;
  // Observed upstream: end-cap width/3, capped at40% of the unshortened ridge.
  const offset=Math.min(width/3,length*.4);
  if (!(offset>1e-8&&length-2*offset>1e-8&&width>1e-8)) return undefined;
  const at=(u:number):PlanPoint=>({x:origin.x+axis.x*u-axis.z*(minV+maxV)/2,z:origin.z+axis.z*u+axis.x*(minV+maxV)/2});
  const ridge:[PlanPoint,PlanPoint]=[at(minU+offset),at(maxU-offset)];
  // Tolerance must never let a long/thin or slightly skewed input place
  // either ridge endpoint outside the real polygon. Fail closed, not bbox-fill.
  if (!ridge.every(p=>pointInRing(p,plan))) return undefined;
  const faces=plan.map((a,i)=>{
    const b=plan[(i+1)%plan.length];
    const near=(p:PlanPoint)=>ridge[along(p)<(minU+maxU)/2?0:1];
    return Math.abs(along(b)-along(a))<=Math.hypot(b.x-a.x,b.z-a.z)*tolerance ? [a,b,near(a)] : [a,b,near(b),near(a)];
  });
  const fraction=(p:PlanPoint)=>Math.max(0,Math.min(1,(along(p)-minU)/offset,(maxU-along(p))/offset,(across(p)-minV)/(width/2),(maxV-across(p))/(width/2)));
  // OSM2World RoofWithRidge measures distance to the FINITE segment,
  // not its supporting line: corner distance includes the inset component.
  const [a,b]=ridge,dx=b.x-a.x,dz=b.z-a.z,lengthSquared=dx*dx+dz*dz;
  const maxDistanceToRidge=Math.max(...plan.map(p=>{
    const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/lengthSquared));
    return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);
  }));
  return {ridge,faces,offset,length,width,fraction,maxDistanceToRidge};
}
