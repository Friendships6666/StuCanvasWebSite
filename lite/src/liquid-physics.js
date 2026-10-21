import { isLiquid, liquidMass } from './liquid.js';

const stateKey = object => JSON.stringify([object.particles,object.density,object.volume,object.radius,object.running,object.hidden,object.restitution,object.airFriction,object.playbackRate]);

export function syncLiquids(world,objects,Matter,scale) {
  const {Bodies,Body,Composite,Pairs}=Matter, ids=new Set();
  for(const object of objects.filter(isLiquid)) {
    ids.add(object.id);let entry=world.liquids.get(object.id);
    const geometry=JSON.stringify([object.particleCount,object.radius]);
    if(!entry || entry.geometry!==geometry) {
      if(entry) Composite.remove(world.engine.world,entry.composite);
      const particles=object.particles.map(()=>Bodies.circle(0,0,object.radius*scale,{slop:.005,friction:0,frictionStatic:0},10));
      const composite=Composite.create();Composite.add(composite,particles);Composite.add(world.engine.world,composite);
      entry={object,particles,composite,geometry,key:null};world.liquids.set(object.id,entry);Pairs.clear(world.engine.pairs);
    }
    entry.object=object;const key=stateKey(object);
    for(let i=0;i<entry.particles.length;i++) {
      const particle=entry.particles[i],state=object.particles[i];
      Object.assign(particle.collisionFilter,{objectId:object.id,kind:'liquid',ignored:object.ignored,freeFall:object.freeFall,
        collideBodies:object.collideBodies,collideGeometry:object.collideGeometry,mask:object.hidden?0:0xFFFFFFFF});
      if(entry.key!==key) {
        Body.setStatic(particle,false);Body.setMass(particle,liquidMass(object)/object.particleCount);
        particle.inertia=Infinity;particle.inverseInertia=0;
        particle.friction=particle.frictionStatic=0;particle.restitution=object.restitution;particle.frictionAir=object.airFriction;
        Body.setPosition(particle,{x:state.position.x*scale,y:-state.position.y*scale});
        Body.setVelocity(particle,{x:state.velocity.x*scale/60,y:-state.velocity.y*scale/60});
        particle.timeScale=object.playbackRate;
        if(!object.running||object.hidden) Body.setStatic(particle,true);
      }
    }
    entry.key=key;
  }
  for(const [id,entry] of world.liquids) if(!ids.has(id)) {Composite.remove(world.engine.world,entry.composite);world.liquids.delete(id);Pairs.clear(world.engine.pairs);}
}

function particleGrid(world,scale) {
  const entries=[...world.liquids.values()].filter(entry=>!entry.object.hidden);
  if(!entries.length)return null;
  // Separate fluids with very different resolutions must not force the entire
  // scene into one oversized neighbor cell. Each pool gets its own grid.
  return entries.map(entry=>{
    const spacing=Math.sqrt(entry.object.volume/entry.object.particleCount),cell=spacing*1.8,grid=new Map();
    const nodes=entry.particles.map((body,index)=>({body,index,x:body.position.x/scale,y:-body.position.y/scale}));
    for(const node of nodes){const key=`${Math.floor(node.x/cell)},${Math.floor(node.y/cell)}`;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(node);}
    return {entry,spacing,cell,grid,nodes};
  });
}

export function applyLiquidForces(world,Matter,scale,seconds) {
  const pools=particleGrid(world,scale);if(!pools)return;
  const {Body}=Matter;
  for(let a=0;a<pools.length;a++)for(let b=a;b<pools.length;b++) {
    const first=pools[a],second=pools[b],one=first.entry.object,two=second.entry.object;
    if(!one.running&&!two.running)continue;
    if(a!==b&&(!one.collideBodies||!two.collideBodies||one.ignored.includes(two.id)||two.ignored.includes(one.id)))continue;
    const spacing=(first.spacing+second.spacing)/2,reach=spacing*1.8;
    const m1=one.density*one.volume/one.particleCount,m2=two.density*two.volume/two.particleCount;
    const coefficient=2*m1*m2/(m1+m2)*scale/1e6,pressure=(one.pressure+two.pressure)/2;
    const cohesion=Math.min(one.cohesion,two.cohesion),viscosity=(one.viscosity+two.viscosity)/2;
    for(const node of first.nodes) {
      const cx=Math.floor(node.x/second.cell),cy=Math.floor(node.y/second.cell),range=Math.ceil(reach/second.cell);
      for(let x=cx-range;x<=cx+range;x++)for(let y=cy-range;y<=cy+range;y++)for(const other of second.grid.get(`${x},${y}`)||[]) {
        if(a===b&&other.index<=node.index)continue;
        let dx=other.x-node.x,dy=other.y-node.y,distance=Math.hypot(dx,dy);
        if(distance>=reach)continue;
        if(distance<1e-10){dx=1;dy=0;distance=1e-10;}else{dx/=distance;dy/=distance;}
        const q=distance/spacing;
        const acceleration=q<1 ? pressure*spacing*(1-q) : -cohesion*pressure*spacing*(1-(q-1)/.8)*.08;
        const va=Body.getVelocity(node.body),vb=Body.getVelocity(other.body),damping=viscosity*5*(1-distance/reach);
        const fx=(-dx*acceleration+(vb.x-va.x)*60/scale*damping)*coefficient;
        const fy=(dy*acceleration+(vb.y-va.y)*60/scale*damping)*coefficient;
        node.body.force.x+=fx;node.body.force.y+=fy;other.body.force.x-=fx;other.body.force.y-=fy;
      }
    }
  }
  applyBuoyancy(world,pools,Matter,scale,seconds);
}

function applyBuoyancy(world,pools,Matter,scale,seconds) {
  for(const {entry,spacing,nodes} of pools) {
    const liquid=entry.object,g=Math.hypot(liquid.gravity.x,liquid.gravity.y);
    if(!g||!liquid.buoyancy||!liquid.collideBodies)continue;
    const down={x:liquid.gravity.x/g,y:liquid.gravity.y/g},across={x:-down.y,y:down.x},cell=spacing*2,columns=new Map();
    for(const node of nodes) {
      const u=node.x*across.x+node.y*across.y,v=node.x*down.x+node.y*down.y,key=Math.floor(u/cell);
      const column=columns.get(key)||{min:Infinity,max:-Infinity,count:0};
      column.min=Math.min(column.min,v-spacing*.6);column.max=Math.max(column.max,v+spacing*.6);column.count++;columns.set(key,column);
    }
    let displaced=0;const samples=[];
    for(const rigid of world.bodies.values()) {
      const object=rigid.object,body=rigid.body;
      if(body.isStatic||object.hidden||liquid.ignored.includes(object.id)||object.ignored.includes(liquid.id))continue;
      const c=Math.cos(body.angle),s=Math.sin(body.angle);
      for(const sample of rigid.buoyancySamples||[]) {
        const x=(body.position.x+sample.x*c-sample.y*s)/scale,y=-(body.position.y+sample.x*s+sample.y*c)/scale;
        const u=x*across.x+y*across.y,v=x*down.x+y*down.y;
        let coverage=0;
        for(let k=-1;k<=1;k++) {
          const column=columns.get(Math.floor(u/cell)+k);if(!column)continue;
          coverage=Math.max(coverage,Math.max(0,Math.min(1,(v-column.min)/spacing,(column.max-v)/spacing)));
        }
        if(coverage>0){const volume=sample.volume*coverage;samples.push({body,object,x,y,volume});displaced+=volume;}
      }
    }
    const budget=Math.min(1,liquid.volume/(displaced||1)),totals=new Map();
    for(const sample of samples)totals.set(sample.body,(totals.get(sample.body)||0)+sample.volume*budget*liquid.density*g*liquid.buoyancy);
    for(const {body,object,x,y,volume} of samples) {
      const limit=Math.min(1,body.mass*50/(totals.get(body)||1));
      const force=volume*budget*liquid.density*g*liquid.buoyancy*limit*scale/1e6;
      Matter.Body.applyForce(body,{x:x*scale,y:-y*scale},{x:-down.x*force,y:down.y*force});
      // Implicit damping stays stable for both light and dense rigid bodies.
      const weight=volume*budget/(rigidVolume(world,object.id)||1),rate=liquid.viscosity*8*weight;
      const drag=(1-Math.exp(-rate*seconds))/Math.max(seconds,1e-9),velocity=Matter.Body.getVelocity(body);
      Matter.Body.applyForce(body,{x:x*scale,y:-y*scale},{x:-velocity.x*60/scale*body.mass*drag*scale/1e6,y:-velocity.y*60/scale*body.mass*drag*scale/1e6});
    }
  }
}
const rigidVolume=(world,id)=>world.bodies.get(id)?.buoyancyVolume;

export function readLiquids(world,seconds,Matter,scale,changed) {
  for(const entry of world.liquids.values()) {
    const object=entry.object;if(!object.running||object.hidden)continue;
    object.particles=entry.particles.map(body=>{const v=Matter.Body.getVelocity(body);return{position:{x:body.position.x/scale,y:-body.position.y/scale},velocity:{x:v.x*60/scale,y:-v.y*60/scale}};});
    object.time+=seconds*object.playbackRate;
    if(object.duration>0&&object.time>=object.duration){object.time=object.duration;object.running=false;}
    entry.key=object.running?stateKey(object):null;changed.add(object.id);
  }
}
