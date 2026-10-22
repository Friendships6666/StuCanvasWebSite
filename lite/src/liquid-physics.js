import { isLiquid, liquidMass } from './liquid.js';

const stateKey = object => JSON.stringify([object.density,object.volume,object.radius,object.running,object.hidden,object.restitution,object.airFriction,object.playbackRate]);

export function syncLiquids(world,objects,Matter,scale) {
  const {Bodies,Body,Composite,Pairs}=Matter, ids=new Set();
  for(const object of objects.filter(isLiquid)) {
    ids.add(object.id);let entry=world.liquids.get(object.id);
    const geometry=JSON.stringify([object.particleCount,object.radius]);
    if(!entry || entry.geometry!==geometry) {
      if(entry) Composite.remove(world.engine.world,entry.composite);
      const particles=object.particles.map(()=>Bodies.circle(0,0,object.radius*scale,{slop:.005,friction:0,frictionStatic:0},10));
      const composite=Composite.create();Composite.add(composite,particles);Composite.add(world.engine.world,composite);
      entry={object,particles,composite,geometry,key:null,state:[]};world.liquids.set(object.id,entry);Pairs.clear(world.engine.pairs);
    }
    entry.object=object;const key=stateKey(object),configChanged=entry.key!==key;
    const filterKey=JSON.stringify([object.id,object.ignored,object.freeFall,object.collideBodies,object.collideGeometry,object.hidden]);
    const filterChanged=entry.filterKey!==filterKey;
    for(let i=0;i<entry.particles.length;i++) {
      const particle=entry.particles[i],state=object.particles[i];
      if(filterChanged)Object.assign(particle.collisionFilter,{objectId:object.id,kind:'liquid',ignored:object.ignored,freeFall:object.freeFall,
        collideBodies:object.collideBodies,collideGeometry:object.collideGeometry,mask:object.hidden?0:0xFFFFFFFF});
      const at=i*4;
      if(configChanged||entry.state[at]!==state.position.x||entry.state[at+1]!==state.position.y||entry.state[at+2]!==state.velocity.x||entry.state[at+3]!==state.velocity.y) {
        Body.setStatic(particle,false);Body.setMass(particle,liquidMass(object)/object.particleCount);
        particle.inertia=Infinity;particle.inverseInertia=0;
        particle.friction=particle.frictionStatic=0;particle.restitution=object.restitution;particle.frictionAir=object.airFriction;
        Body.setPosition(particle,{x:state.position.x*scale,y:-state.position.y*scale});
        Body.setVelocity(particle,{x:state.velocity.x*scale/60,y:-state.velocity.y*scale/60});
        particle.timeScale=object.playbackRate;
        if(!object.running||object.hidden) Body.setStatic(particle,true);
        entry.state[at]=state.position.x;entry.state[at+1]=state.position.y;entry.state[at+2]=state.velocity.x;entry.state[at+3]=state.velocity.y;
      }
    }
    entry.key=key;entry.filterKey=filterKey;
  }
  for(const [id,entry] of world.liquids) if(!ids.has(id)) {Composite.remove(world.engine.world,entry.composite);world.liquids.delete(id);Pairs.clear(world.engine.pairs);}
}

// Neighbor scratch data is disposable and deliberately kept out of solver
// checkpoints. Numeric cells, nodes and buckets are reused between substeps.
const neighborCaches = new WeakMap();
function particleGrid(world,Matter,scale) {
  const pools=[];
  for(const entry of world.liquids.values()){
    if(entry.object.hidden)continue;
    let pool=neighborCaches.get(entry);
    if(!pool){
      pool={entry,nodes:entry.particles.map((body,index)=>({body,index,x:0,y:0,vx:0,vy:0})),grid:new Map(),rows:[],buckets:[]};
      neighborCaches.set(entry,pool);
    }
    pool.spacing=Math.sqrt(entry.object.volume/entry.object.particleCount);pool.cell=pool.spacing*1.8;
    pool.grid.clear();let rows=0,buckets=0;
    pool.minX=pool.minY=Infinity;pool.maxX=pool.maxY=-Infinity;
    for(const node of pool.nodes){
      const velocity=Matter.Body.getVelocity(node.body);
      node.x=node.body.position.x/scale;node.y=-node.body.position.y/scale;node.vx=velocity.x;node.vy=velocity.y;
      pool.minX=Math.min(pool.minX,node.x);pool.maxX=Math.max(pool.maxX,node.x);pool.minY=Math.min(pool.minY,node.y);pool.maxY=Math.max(pool.maxY,node.y);
      const x=Math.floor(node.x/pool.cell),y=Math.floor(node.y/pool.cell);
      let row=pool.grid.get(x);
      if(!row){row=pool.rows[rows]||(pool.rows[rows]=new Map());rows++;row.clear();pool.grid.set(x,row);}
      let bucket=row.get(y);
      if(!bucket){bucket=pool.buckets[buckets]||(pool.buckets[buckets]=[]);buckets++;bucket.length=0;row.set(y,bucket);}
      bucket.push(node);
    }
    pools.push(pool);
  }
  return pools;
}

export function applyLiquidForces(world,Matter,scale,seconds) {
  const pools=particleGrid(world,Matter,scale);if(!pools)return;
  for(let a=0;a<pools.length;a++)for(let b=a;b<pools.length;b++) {
    const first=pools[a],second=pools[b],one=first.entry.object,two=second.entry.object;
    if(!one.running&&!two.running)continue;
    if(a!==b&&(!one.collideBodies||!two.collideBodies||one.ignored.includes(two.id)||two.ignored.includes(one.id)))continue;
    const spacing=(first.spacing+second.spacing)/2,reach=spacing*1.8;
    if(first.maxX+reach<second.minX||second.maxX+reach<first.minX||first.maxY+reach<second.minY||second.maxY+reach<first.minY)continue;
    const m1=one.density*one.volume/one.particleCount,m2=two.density*two.volume/two.particleCount;
    const coefficient=2*m1*m2/(m1+m2)*scale/1e6,pressure=(one.pressure+two.pressure)/2;
    const cohesion=Math.min(one.cohesion,two.cohesion),viscosity=(one.viscosity+two.viscosity)/2;
    for(const node of first.nodes) {
      const cx=Math.floor(node.x/second.cell),cy=Math.floor(node.y/second.cell),range=Math.ceil(reach/second.cell);
      for(let x=cx-range;x<=cx+range;x++){
        const row=second.grid.get(x);if(!row)continue;
        for(let y=cy-range;y<=cy+range;y++){
          const bucket=row.get(y);if(!bucket)continue;
          for(const other of bucket) {
            if(a===b&&other.index<=node.index)continue;
            let dx=other.x-node.x,dy=other.y-node.y;
            if(dx*dx+dy*dy>reach*reach*(1+1e-14))continue;
            let distance=Math.hypot(dx,dy);
            if(distance>=reach)continue;
            if(distance<1e-10){dx=1;dy=0;distance=1e-10;}else{dx/=distance;dy/=distance;}
            const q=distance/spacing;
            const acceleration=q<1 ? pressure*spacing*(1-q) : -cohesion*pressure*spacing*(1-(q-1)/.8)*.08;
            const damping=viscosity*5*(1-distance/reach);
            const fx=(-dx*acceleration+(other.vx-node.vx)*60/scale*damping)*coefficient;
            const fy=(dy*acceleration+(other.vy-node.vy)*60/scale*damping)*coefficient;
            node.body.force.x+=fx;node.body.force.y+=fy;other.body.force.x-=fx;other.body.force.y-=fy;
          }
        }
      }
    }
  }
  if(world.bodies.size)applyBuoyancy(world,pools,Matter,scale,seconds);
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
    object.particles=entry.particles.map((body,i)=>{
      const v=Matter.Body.getVelocity(body),state={position:{x:body.position.x/scale,y:-body.position.y/scale},velocity:{x:v.x*60/scale,y:-v.y*60/scale}},at=i*4;
      entry.state[at]=state.position.x;entry.state[at+1]=state.position.y;entry.state[at+2]=state.velocity.x;entry.state[at+3]=state.velocity.y;return state;
    });
    object.time+=seconds*object.playbackRate;
    if(object.duration>0&&object.time>=object.duration){object.time=object.duration;object.running=false;}
    entry.key=object.running?stateKey(object):null;changed.add(object.id);
  }
}
