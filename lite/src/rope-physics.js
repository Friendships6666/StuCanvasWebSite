import { anchorWorld, isFlexible } from './rope.js';
import { isSoftBody, softCoordinates } from './soft-body.js';

export function syncRopes(world,objects,Matter,scale) {
  const {Bodies,Body,Constraint,Composite,Pairs}=Matter;
  const targets=new Map(world.anchors || []);for(const object of objects)if(object.type==='physicsBody'||isSoftBody(object)||!targets.has(object.id))targets.set(object.id,object);
  const ids=new Set();
  for(const object of objects.filter(isFlexible)){
    ids.add(object.id);let entry=world.ropes.get(object.id);
    const spring=object.type==='spring';
    const geometry=JSON.stringify([object.type,object.length,object.segments,object.radius,object.coilRadius]);
    if(!entry||entry.geometry!==geometry){
      if(entry)Composite.remove(world.engine.world,entry.composite);
      const length=object.length/object.segments*scale,radius=(object.radius+(spring?object.coilRadius:0))*scale;
      const links=object.links.map(state=>{
        const parts=[Bodies.rectangle(0,0,length,2*radius),Bodies.circle(-length/2,0,radius,{},12),Bodies.circle(length/2,0,radius,{},12)];
        return Body.create({parts,slop:.005,frictionAir:object.airFriction});
      });
      const composite=Composite.create();Composite.add(composite,links);
      const joint=(bodyA,pointA,bodyB,pointB)=>Constraint.create({bodyA,pointA,bodyB,pointB,length:0,stiffness:object.stiffness,damping:object.damping});
      const constraints=[];
      for(let i=1;i<links.length;i++)constraints.push(joint(links[i-1],{x:length/2,y:0},links[i],{x:-length/2,y:0}));
      const attachments=[joint(null,{x:0,y:0},links[0],{x:-length/2,y:0}),joint(links.at(-1),{x:length/2,y:0},null,{x:0,y:0})];
      // The massive chain supports distributed gravity and contacts. A spring
      // additionally resists compression between its endpoints, so it pushes
      // attached bodies apart instead of simply folding like a rope.
      const axial=spring?Constraint.create({pointA:{x:0,y:0},pointB:{x:0,y:0},length:object.length*scale,stiffness:object.stiffness,damping:object.damping}):null;
      Composite.add(composite,[...constraints,...attachments]);Composite.add(world.engine.world,composite);
      if(axial)Composite.add(composite,axial);
      entry={object,links,constraints,attachments,axial,composite,geometry,key:null,softJoints:[],softAxial:[],softKey:null};world.ropes.set(object.id,entry);Pairs.clear(world.engine.pairs);
    }
    entry.object=object;
    const anchorPoints=object.anchors.map(a=>anchorWorld(a,targets));
    const disabled=object.hidden||anchorPoints.some(p=>!p)||object.anchors.some(a=>targets.get(a.objectId)?.hidden);
    const key=JSON.stringify([object.links,object.mass,object.running,disabled,object.restitution,object.airFriction,object.playbackRate]);
    const length=object.length/object.segments*scale;
    for(let i=0;i<entry.links.length;i++){
      const body=entry.links[i],state=object.links[i];
      Object.assign(body.collisionFilter,{objectId:object.id,kind:'rope',ignored:object.ignored,freeFall:object.freeFall,
        collideBodies:object.collideBodies,collideGeometry:object.collideGeometry,mask:disabled?0:0xFFFFFFFF});
      if(entry.key!==key){
        Body.setStatic(body,false);Body.setMass(body,object.mass/object.segments);
        for(const part of body.parts){part.friction=0;part.frictionStatic=0;part.restitution=object.restitution;part.frictionAir=object.airFriction;}
        Body.setAngle(body,-state.angle);Body.setPosition(body,{x:state.position.x*scale,y:-state.position.y*scale});
        Body.setVelocity(body,{x:state.velocity.x*scale/60,y:-state.velocity.y*scale/60});Body.setAngularVelocity(body,-state.angularVelocity/60);
        body.timeScale=object.playbackRate;if(!object.running||disabled)Body.setStatic(body,true);
      }
    }
    // Joint endpoints are local offsets expressed at the current angle. Rebind
    // after a body has been rebuilt or teleported without doubling rotation.
    const endpoint=(body,sign)=>({x:Math.cos(body.angle)*length/2*sign,y:Math.sin(body.angle)*length/2*sign});
    const bindings=object.anchors.map((anchor,i)=>{
      const soft=world.softBodies.get(anchor.objectId),p=anchorPoints[i]||{x:0,y:0},point={x:p.x*scale,y:-p.y*scale};
      if(soft){const coordinates=softCoordinates(soft.object,anchor.point,true);return coordinates.indices.map((index,j)=>({body:soft.particles[index],weight:Math.max(0,coordinates.weights[j]),point})).filter(item=>item.weight>1e-10);}
      return[{body:world.bodies.get(anchor.objectId)?.body||null,weight:1,point}];
    });
    const softKey=JSON.stringify(object.anchors.map(a=>[a.objectId,world.softBodies.has(a.objectId),a.point]));
    // Soft anchors distribute force over the material triangle's vertices. The
    // same weights evaluate its displayed point, so moving/deforming the mesh
    // never turns an attachment into a fixed world-space anchor.
    const softSides=object.anchors.map(anchor=>world.softBodies.has(anchor.objectId));
    const softCount=bindings.map(b=>b.length).join(':');
    if(entry.softKey!==softKey||entry.softCount!==softCount){
      Composite.remove(entry.composite,[...entry.softJoints,...entry.softAxial].map(j=>j.constraint));entry.softJoints=[];entry.softAxial=[];
      for(let i=0;i<2;i++)if(softSides[i])for(const binding of bindings[i])entry.softJoints.push({side:i,weight:binding.weight,constraint:Constraint.create({bodyA:binding.body,bodyB:i===0?entry.links[0]:entry.links.at(-1),length:0,stiffness:object.stiffness*binding.weight,damping:object.damping})});
      if(entry.axial&&softSides.some(Boolean))for(const a of bindings[0])for(const b of bindings[1])entry.softAxial.push({weight:a.weight*b.weight,constraint:Constraint.create({bodyA:a.body,pointA:a.body?{x:0,y:0}:a.point,bodyB:b.body,pointB:b.body?{x:0,y:0}:b.point,length:object.length*scale,stiffness:object.stiffness*a.weight*b.weight,damping:object.damping})});
      Composite.add(entry.composite,[...entry.softJoints.map(j=>j.constraint),...entry.softAxial.map(j=>j.constraint)]);entry.softKey=softKey;entry.softCount=softCount;
    }
    for(let i=0;i<entry.constraints.length;i++){
      const c=entry.constraints[i];c.pointA=endpoint(entry.links[i],1);c.pointB=endpoint(entry.links[i+1],-1);c.angleA=c.bodyA.angle;c.angleB=c.bodyB.angle;
    }
    for(let i=0;i<2;i++){
      const constraint=entry.attachments[i],anchor=object.anchors[i],target=world.bodies.get(anchor.objectId)?.body;
      const p=anchorPoints[i]||{x:0,y:0},worldPoint={x:p.x*scale,y:-p.y*scale};
      const side=i===0?'A':'B',other=i===0?'B':'A',link=i===0?entry.links[0]:entry.links.at(-1);
      constraint[`body${side}`]=target||null;
      constraint[`point${side}`]=target?{x:worldPoint.x-target.position.x,y:worldPoint.y-target.position.y}:worldPoint;
      constraint[`angle${side}`]=target?.angle||0;
      constraint[`point${other}`]=endpoint(link,i===0?-1:1);constraint[`angle${other}`]=link.angle;
      if(entry.axial){
        const side=i===0?'A':'B';
        entry.axial[`body${side}`]=target||null;
        entry.axial[`point${side}`]=target?{x:worldPoint.x-target.position.x,y:worldPoint.y-target.position.y}:worldPoint;
        entry.axial[`angle${side}`]=target?.angle||0;
      }
    }
    for(const c of entry.constraints){c.stiffness=disabled?0:object.stiffness;c.damping=disabled?0:object.damping;}
    entry.attachments.forEach((c,i)=>{const inactive=disabled||softSides[i];c.stiffness=inactive?0:object.stiffness;c.damping=inactive?0:object.damping;});
    if(entry.axial){const inactive=disabled||softSides.some(Boolean);entry.axial.stiffness=inactive?0:object.stiffness;entry.axial.damping=inactive?0:object.damping;}
    const bind=(c,side,binding)=>{c[`body${side}`]=binding.body;c[`point${side}`]=binding.body?{x:binding.point.x-binding.body.position.x,y:binding.point.y-binding.body.position.y}:binding.point;c[`angle${side}`]=binding.body?.angle||0;};
    const used=[0,0];
    for(const joint of entry.softJoints){const i=joint.side,c=joint.constraint,binding=bindings[i][used[i]++],link=i===0?entry.links[0]:entry.links.at(-1);bind(c,'A',binding);c.bodyB=link;c.pointB=endpoint(link,i===0?-1:1);c.angleB=link.angle;c.stiffness=disabled?0:object.stiffness*binding.weight;c.damping=disabled?0:object.damping;}
    let j=0;
    for(const a of bindings[0])for(const b of bindings[1])if(entry.softAxial.length){const c=entry.softAxial[j++].constraint;bind(c,'A',a);bind(c,'B',b);c.stiffness=disabled?0:object.stiffness*a.weight*b.weight;c.damping=disabled?0:object.damping;}
    entry.disabled=disabled;entry.key=key;
  }
  for(const [id,entry]of world.ropes)if(!ids.has(id)){Composite.remove(world.engine.world,entry.composite);world.ropes.delete(id);Pairs.clear(world.engine.pairs);}
}
export function readRopes(world,seconds,Matter,scale,changed) {
  for(const entry of world.ropes.values()){
    const object=entry.object;if(!object.running||entry.disabled)continue;
    object.links=entry.links.map(body=>{const velocity=Matter.Body.getVelocity(body);return{position:{x:body.position.x/scale,y:-body.position.y/scale},angle:-body.angle,
      velocity:{x:velocity.x*60/scale,y:-velocity.y*60/scale},angularVelocity:-Matter.Body.getAngularVelocity(body)*60};});
    object.time+=seconds*object.playbackRate;if(object.duration>0&&object.time>=object.duration){object.time=object.duration;object.running=false;}
    // Pose key is refreshed on the next sync; setters are skipped by identity.
    entry.key=JSON.stringify([object.links,object.mass,object.running,entry.disabled,object.restitution,object.airFriction,object.playbackRate]);
    if(!object.running)entry.key=null;
    changed.add(object.id);
  }
}
