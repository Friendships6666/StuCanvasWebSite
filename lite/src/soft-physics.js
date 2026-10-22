import { createSoftColliders } from './soft-collision.js';
import { isSoftBody } from './soft-body.js';
import { frictionAt } from './surface-friction.js';
import { restitutionAt } from './surface-restitution.js';

export function bindSoftSurface(entry,scale,world) {
  let timestamp=-1,version=-1,material;
  const live=()=>{
    const current=world.engine.timing.timestamp;
    if(timestamp!==current||version!==entry.surfaceVersion||!material){
      material={...entry.object,nodes:entry.particles.map(body=>({position:{x:body.position.x/scale,y:-body.position.y/scale}}))};timestamp=current;version=entry.surfaceVersion;
    }
    return material;
  };
  for(const body of entry.particles){
    body.surfaceFrictionAt=(point,normal)=>entry.object.surfaceFriction?.length?frictionAt(live(),point,normal):0;
    body.surfaceRestitutionAt=(point,normal)=>entry.object.surfaceRestitution?.length?restitutionAt(live(),point,normal):entry.object.restitution;
  }
}

const stateKey = object => JSON.stringify([object.mass,object.running,object.hidden,object.restitution,object.airFriction,object.playbackRate]);
const stiffness = (object,kind) => kind==='stretch'?object.stretchStiffness:kind==='shear'?object.shearStiffness:object.bendStiffness;

export function syncSoftBodies(world,objects,Matter,scale) {
  const {Bodies,Body,Constraint,Composite,Pairs}=Matter,ids=new Set();
  for(const object of objects.filter(isSoftBody)){
    ids.add(object.id);let entry=world.softBodies.get(object.id);
    if(!entry||entry.mesh!==object.mesh||entry.radius!==object.collisionRadius){
      if(entry)Composite.remove(world.engine.world,entry.composite);
      const particles=object.nodes.map((state,i)=>Bodies.circle(state.position.x*scale,-state.position.y*scale,.02,{slop:.005},12));
      createSoftColliders(particles,object.mesh,object.collisionRadius,Matter,scale);
      const constraints=object.mesh.links.map(link=>Constraint.create({bodyA:particles[link.a],bodyB:particles[link.b],length:link.length*scale,stiffness:stiffness(object,link.kind),damping:object.damping}));
      const neighbors=object.nodes.map(()=>[]);
      for(const face of object.mesh.triangles)for(const i of face)for(const j of face)if(i!==j&&!neighbors[i].includes(j))neighbors[i].push(j);
      const composite=Composite.create();Composite.add(composite,[...particles,...constraints]);Composite.add(world.engine.world,composite);
      const areas=object.mesh.triangles.map(([a,b,c])=>{
        const one=object.mesh.vertices[a],two=object.mesh.vertices[b],three=object.mesh.vertices[c];
        return ((two.x-one.x)*(three.y-one.y)-(two.y-one.y)*(three.x-one.x))/2;
      });
      entry={object,mesh:object.mesh,radius:object.collisionRadius,particles,constraints,neighbors,areas,composite,key:null,state:[]};world.softBodies.set(object.id,entry);Pairs.clear(world.engine.pairs);
      bindSoftSurface(entry,scale,world);
    }
    entry.object=object;entry.surfaceVersion=(entry.surfaceVersion||0)+1;
    const key=stateKey(object),configChanged=entry.key!==key;
    for(let i=0;i<entry.particles.length;i++){
      const body=entry.particles[i],state=object.nodes[i];
      Object.assign(body.collisionFilter,{objectId:object.id,kind:'soft',node:i,neighbors:entry.neighbors[i],selfCollision:object.selfCollision,
        ignored:object.ignored,freeFall:object.freeFall,collideBodies:object.collideBodies,collideGeometry:object.collideGeometry,mask:object.hidden?0:0xFFFFFFFF});
      const at=i*4,changed=configChanged||entry.state[at]!==state.position.x||entry.state[at+1]!==state.position.y||entry.state[at+2]!==state.velocity.x||entry.state[at+3]!==state.velocity.y;
      if(changed){
        Body.setStatic(body,false);Body.setMass(body,object.mass*object.mesh.weights[i]);
        body.inertia=Infinity;body.inverseInertia=0;body.friction=body.frictionStatic=0;body.restitution=object.restitution;body.frictionAir=object.airFriction;
        Body.setPosition(body,{x:state.position.x*scale,y:-state.position.y*scale});Body.setVelocity(body,{x:state.velocity.x*scale/60,y:-state.velocity.y*scale/60});
        body.timeScale=object.playbackRate;if(!object.running||object.hidden)Body.setStatic(body,true);
        entry.state[at]=state.position.x;entry.state[at+1]=state.position.y;entry.state[at+2]=state.velocity.x;entry.state[at+3]=state.velocity.y;
      }
    }
    const constraintKey=JSON.stringify([object.hidden,object.stretchStiffness,object.shearStiffness,object.bendStiffness,object.damping]);
    if(entry.constraintKey!==constraintKey){
      entry.constraints.forEach((constraint,i)=>{constraint.stiffness=object.hidden?0:stiffness(object,object.mesh.links[i].kind);constraint.damping=object.damping;});
      entry.constraintKey=constraintKey;
    }
    entry.key=key;
  }
  for(const [id,entry]of world.softBodies)if(!ids.has(id)){Composite.remove(world.engine.world,entry.composite);world.softBodies.delete(id);Pairs.clear(world.engine.pairs);}
}

// Area elasticity supplements distance constraints. Forces have finite strain
// and acceleration bounds; mesh resolution does not multiply the object's mass.
export function applySoftForces(world,scale) {
  for(const entry of world.softBodies.values()){
    const {object,particles}=entry;if(!object.running||object.hidden||!object.areaStiffness)continue;
    for(let i=0;i<object.mesh.triangles.length;i++){
      const face=object.mesh.triangles[i],a=particles[face[0]],b=particles[face[1]],c=particles[face[2]],rest=entry.areas[i];
      const area=-((b.position.x-a.position.x)*(c.position.y-a.position.y)-(b.position.y-a.position.y)*(c.position.x-a.position.x))/(2*scale*scale);
      const strain=Math.max(-2,Math.min(2,(area-rest)/rest)),strength=object.areaStiffness*120*strain;
      const factor=-(a.mass+b.mass+c.mass)/3*strength*scale/1e6/3;
      a.force.x+=(c.position.y-b.position.y)/scale*factor;a.force.y+=(b.position.x-c.position.x)/scale*factor;
      b.force.x+=(a.position.y-c.position.y)/scale*factor;b.force.y+=(c.position.x-a.position.x)/scale*factor;
      c.force.x+=(b.position.y-a.position.y)/scale*factor;c.force.y+=(a.position.x-b.position.x)/scale*factor;
    }
  }
}

export function readSoftBodies(world,seconds,Matter,scale,changed) {
  for(const entry of world.softBodies.values()){
    const {object}=entry;if(!object.running||object.hidden)continue;
    object.nodes=entry.particles.map((body,i)=>{
      const v=Matter.Body.getVelocity(body),state={position:{x:body.position.x/scale,y:-body.position.y/scale},velocity:{x:v.x*60/scale,y:-v.y*60/scale}},at=i*4;
      entry.state[at]=state.position.x;entry.state[at+1]=state.position.y;entry.state[at+2]=state.velocity.x;entry.state[at+3]=state.velocity.y;return state;
    });
    object.time+=seconds*object.playbackRate;if(object.duration>0&&object.time>=object.duration){object.time=object.duration;object.running=false;}
    entry.key=object.running?stateKey(object):null;changed.add(object.id);
  }
}
