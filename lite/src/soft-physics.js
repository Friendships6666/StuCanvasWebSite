import { isSoftBody } from './soft-body.js';
import { frictionAt } from './surface-friction.js';
import { restitutionAt } from './surface-restitution.js';

export function bindSoftSurface(entry,scale) {
  const live=()=>({...entry.object,nodes:entry.particles.map(body=>({position:{x:body.position.x/scale,y:-body.position.y/scale}}))});
  for(const body of entry.particles){
    body.surfaceFrictionAt=(point,normal)=>entry.object.surfaceFriction?.length?frictionAt(live(),point,normal):0;
    body.surfaceRestitutionAt=(point,normal)=>entry.object.surfaceRestitution?.length?restitutionAt(live(),point,normal):entry.object.restitution;
  }
}

const stateKey = object => JSON.stringify([object.nodes,object.mass,object.running,object.hidden,object.restitution,object.airFriction,object.playbackRate]);
const stiffness = (object,kind) => kind==='stretch'?object.stretchStiffness:kind==='shear'?object.shearStiffness:object.bendStiffness;

export function syncSoftBodies(world,objects,Matter,scale) {
  const {Bodies,Body,Constraint,Composite,Pairs}=Matter,ids=new Set();
  for(const object of objects.filter(isSoftBody)){
    ids.add(object.id);let entry=world.softBodies.get(object.id);
    if(!entry||entry.mesh!==object.mesh||entry.radius!==object.collisionRadius){
      if(entry)Composite.remove(world.engine.world,entry.composite);
      const particles=object.nodes.map((state,i)=>Bodies.circle(state.position.x*scale,-state.position.y*scale,Math.max(.02,object.mesh.radii[i]*object.collisionRadius*scale),{slop:.005},12));
      const constraints=object.mesh.links.map(link=>Constraint.create({bodyA:particles[link.a],bodyB:particles[link.b],length:link.length*scale,stiffness:stiffness(object,link.kind),damping:object.damping}));
      const neighbors=object.nodes.map(()=>[]);
      for(const face of object.mesh.triangles)for(const i of face)for(const j of face)if(i!==j&&!neighbors[i].includes(j))neighbors[i].push(j);
      const composite=Composite.create();Composite.add(composite,[...particles,...constraints]);Composite.add(world.engine.world,composite);
      entry={object,mesh:object.mesh,radius:object.collisionRadius,particles,constraints,neighbors,composite,key:null};world.softBodies.set(object.id,entry);Pairs.clear(world.engine.pairs);
      bindSoftSurface(entry,scale);
    }
    entry.object=object;const key=stateKey(object);
    for(let i=0;i<entry.particles.length;i++){
      const body=entry.particles[i],state=object.nodes[i];
      Object.assign(body.collisionFilter,{objectId:object.id,kind:'soft',node:i,neighbors:entry.neighbors[i],selfCollision:object.selfCollision,
        ignored:object.ignored,freeFall:object.freeFall,collideBodies:object.collideBodies,collideGeometry:object.collideGeometry,mask:object.hidden?0:0xFFFFFFFF});
      if(entry.key!==key){
        Body.setStatic(body,false);Body.setMass(body,object.mass*object.mesh.weights[i]);
        body.inertia=Infinity;body.inverseInertia=0;body.friction=body.frictionStatic=0;body.restitution=object.restitution;body.frictionAir=object.airFriction;
        Body.setPosition(body,{x:state.position.x*scale,y:-state.position.y*scale});Body.setVelocity(body,{x:state.velocity.x*scale/60,y:-state.velocity.y*scale/60});
        body.timeScale=object.playbackRate;if(!object.running||object.hidden)Body.setStatic(body,true);
      }
    }
    entry.constraints.forEach((constraint,i)=>{constraint.stiffness=object.hidden?0:stiffness(object,object.mesh.links[i].kind);constraint.damping=object.damping;});
    entry.key=key;
  }
  for(const [id,entry]of world.softBodies)if(!ids.has(id)){Composite.remove(world.engine.world,entry.composite);world.softBodies.delete(id);Pairs.clear(world.engine.pairs);}
}

// Area elasticity supplements distance constraints. Forces have finite strain
// and acceleration bounds; mesh resolution does not multiply the object's mass.
export function applySoftForces(world,scale) {
  for(const entry of world.softBodies.values()){
    const {object,particles}=entry;if(!object.running||object.hidden||!object.areaStiffness)continue;
    for(const face of object.mesh.triangles){
      const [a,b,c]=face.map(i=>particles[i]),[ra,rb,rc]=face.map(i=>object.mesh.vertices[i]);
      const rest=((rb.x-ra.x)*(rc.y-ra.y)-(rb.y-ra.y)*(rc.x-ra.x))/2;
      const area=-((b.position.x-a.position.x)*(c.position.y-a.position.y)-(b.position.y-a.position.y)*(c.position.x-a.position.x))/(2*scale*scale);
      const strain=Math.max(-2,Math.min(2,(area-rest)/rest)),strength=object.areaStiffness*120*strain;
      const p=[a,b,c];
      const factor=-(a.mass+b.mass+c.mass)/3*strength*scale/1e6/3;
      for(let j=0;j<3;j++){
        const body=p[j],one=p[(j+1)%3],two=p[(j+2)%3];
        const dx=(two.position.y-one.position.y)/scale,dy=(one.position.x-two.position.x)/scale;
        body.force.x+=dx*factor;body.force.y+=dy*factor;
      }
    }
  }
}

export function readSoftBodies(world,seconds,Matter,scale,changed) {
  for(const entry of world.softBodies.values()){
    const {object}=entry;if(!object.running||object.hidden)continue;
    object.nodes=entry.particles.map(body=>{const v=Matter.Body.getVelocity(body);return{position:{x:body.position.x/scale,y:-body.position.y/scale},velocity:{x:v.x*60/scale,y:-v.y*60/scale}};});
    object.time+=seconds*object.playbackRate;if(object.duration>0&&object.time>=object.duration){object.time=object.duration;object.running=false;}
    entry.key=object.running?stateKey(object):null;changed.add(object.id);
  }
}
