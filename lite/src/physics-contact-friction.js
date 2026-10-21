/*
The MIT License (MIT)

Copyright (c) Liam Brummitt and contributors.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/
// Adapted from Matter.js 0.20.0 Resolver.solveVelocity, MIT license.
// Copyright (c) Liam Brummitt and contributors. See node_modules/matter-js/LICENSE.
// Keep the normal collision response and sample materials per contact.
// Tangential impulses obey |Jt| <= mu * |Jn| (Coulomb friction).
const installed = Symbol.for('stucanvas.surface-friction-solver');
export function installContactFriction(Matter) {
  if (Matter.Resolver[installed]) return;
  const { Resolver, Common } = Matter;
  Resolver[installed] = true;
  function contactCoefficient(pair, contact) {
    const { parentA, parentB, normal } = pair.collision;
    const point = { x: contact.vertex.x / 50, y: -contact.vertex.y / 50 };
    const first = parentA.surfaceFrictionAt?.(point, { x: -normal.x, y: normal.y }) ?? 0;
    const second = parentB.surfaceFrictionAt?.(point, { x: normal.x, y: -normal.y }) ?? 0;
    return Math.sqrt(first * second);
  }
  function contactRestitution(pair, contact) {
    const { parentA, parentB, normal } = pair.collision;
    const point = { x: contact.vertex.x / 50, y: -contact.vertex.y / 50 };
    const first = parentA.surfaceRestitutionAt?.(point, { x: -normal.x, y: normal.y }) ?? parentA.restitution;
    const second = parentB.surfaceRestitutionAt?.(point, { x: normal.x, y: -normal.y }) ?? parentB.restitution;
    // Preserve Matter's maximum rule, now sampling both surfaces per contact.
    return Math.max(first, second);
  }
  const preSolve = Resolver.preSolveVelocity;
  Resolver.preSolveVelocity = pairs => {
    for (const pair of pairs) if (pair.isActive && !pair.isSensor) {
      for (let index = 0; index < pair.contactCount; index++) {
        const contact = pair.contacts[index], coefficient = contactCoefficient(pair, contact);
        // Old tangent impulses cannot carry friction into an erased/slippery area.
        if (contact.surfaceCoefficient !== coefficient) contact.tangentImpulse = 0;
        contact.surfaceCoefficient = coefficient;
        const restitution = contactRestitution(pair, contact);
        if (contact.surfaceRestitution !== restitution) contact.normalImpulse = 0;
        contact.surfaceRestitution = restitution;
        const limit = coefficient * Math.max(0, -contact.normalImpulse);
        contact.tangentImpulse = Math.max(-limit, Math.min(limit, contact.tangentImpulse));
      }
    }
    return preSolve(pairs);
  };
  Resolver.solveVelocity = function(pairs, delta) {
        var timeScale = delta / Common._baseDelta,
            restingThresh = -Resolver._restingThresh * timeScale,
            pairsLength = pairs.length,
            tangentImpulse,
            maxFriction,
            i,
            j;

        for (i = 0; i < pairsLength; i++) {
            var pair = pairs[i];
            
            if (!pair.isActive || pair.isSensor)
                continue;
            
            var collision = pair.collision,
                bodyA = collision.parentA,
                bodyB = collision.parentB,
                normalX = collision.normal.x,
                normalY = collision.normal.y,
                tangentX = collision.tangent.x,
                tangentY = collision.tangent.y,
                inverseMassTotal = pair.inverseMass,
                contacts = pair.contacts,
                contactCount = pair.contactCount,
                contactShare = 1 / contactCount;

            // get body velocities
            var bodyAVelocityX = bodyA.position.x - bodyA.positionPrev.x,
                bodyAVelocityY = bodyA.position.y - bodyA.positionPrev.y,
                bodyAAngularVelocity = bodyA.angle - bodyA.anglePrev,
                bodyBVelocityX = bodyB.position.x - bodyB.positionPrev.x,
                bodyBVelocityY = bodyB.position.y - bodyB.positionPrev.y,
                bodyBAngularVelocity = bodyB.angle - bodyB.anglePrev;

            // resolve each contact
            for (j = 0; j < contactCount; j++) {
                var contact = contacts[j],
                    contactVertex = contact.vertex;

                var offsetAX = contactVertex.x - bodyA.position.x,
                    offsetAY = contactVertex.y - bodyA.position.y,
                    offsetBX = contactVertex.x - bodyB.position.x,
                    offsetBY = contactVertex.y - bodyB.position.y;
 
                var velocityPointAX = bodyAVelocityX - offsetAY * bodyAAngularVelocity,
                    velocityPointAY = bodyAVelocityY + offsetAX * bodyAAngularVelocity,
                    velocityPointBX = bodyBVelocityX - offsetBY * bodyBAngularVelocity,
                    velocityPointBY = bodyBVelocityY + offsetBX * bodyBAngularVelocity;

                var relativeVelocityX = velocityPointAX - velocityPointBX,
                    relativeVelocityY = velocityPointAY - velocityPointBY;

                var normalVelocity = normalX * relativeVelocityX + normalY * relativeVelocityY,
                    tangentVelocity = tangentX * relativeVelocityX + tangentY * relativeVelocityY;

                var contactFriction = contact.surfaceCoefficient;

                // account for mass, inertia and contact offset
                var oAcN = offsetAX * normalY - offsetAY * normalX,
                    oBcN = offsetBX * normalY - offsetBY * normalX,
                    share = contactShare / (inverseMassTotal + bodyA.inverseInertia * oAcN * oAcN + bodyB.inverseInertia * oBcN * oBcN);

                // raw impulses
                var normalImpulse = (1 + contact.surfaceRestitution) * normalVelocity * share;

                // handle high velocity and resting collisions separately
                if (normalVelocity < restingThresh) {
                    // high normal velocity so clear cached contact normal impulse
                    contact.normalImpulse = 0;
                } else {
                    // solve resting collision constraints using Erin Catto's method (GDC08)
                    // impulse constraint tends to 0
                    var contactNormalImpulse = contact.normalImpulse;
                    contact.normalImpulse += normalImpulse;
                    if (contact.normalImpulse > 0) contact.normalImpulse = 0;
                    normalImpulse = contact.normalImpulse - contactNormalImpulse;
                }

                // Use the tangent's own rotational effective mass. Bound the
                // TOTAL cached impulse, so extra solver iterations/substeps do
                // not multiply friction. A zero normal load gives zero friction.
                var oAcT = offsetAX * tangentY - offsetAY * tangentX,
                    oBcT = offsetBX * tangentY - offsetBY * tangentX,
                    tangentShare = contactShare / (inverseMassTotal + bodyA.inverseInertia * oAcT * oAcT + bodyB.inverseInertia * oBcT * oBcT),
                    normalLoad = normalVelocity < restingThresh ? Math.abs(normalImpulse) : -contact.normalImpulse,
                    contactTangentImpulse = contact.tangentImpulse;
                maxFriction = contactFriction * normalLoad;
                contact.tangentImpulse = Math.max(-maxFriction, Math.min(maxFriction,
                    contactTangentImpulse + tangentVelocity * tangentShare));
                tangentImpulse = contact.tangentImpulse - contactTangentImpulse;

                // total impulse from contact
                var impulseX = normalX * normalImpulse + tangentX * tangentImpulse,
                    impulseY = normalY * normalImpulse + tangentY * tangentImpulse;
                
                // apply impulse from contact
                if (!(bodyA.isStatic || bodyA.isSleeping)) {
                    bodyA.positionPrev.x += impulseX * bodyA.inverseMass;
                    bodyA.positionPrev.y += impulseY * bodyA.inverseMass;
                    bodyA.anglePrev += (offsetAX * impulseY - offsetAY * impulseX) * bodyA.inverseInertia;
                }

                if (!(bodyB.isStatic || bodyB.isSleeping)) {
                    bodyB.positionPrev.x -= impulseX * bodyB.inverseMass;
                    bodyB.positionPrev.y -= impulseY * bodyB.inverseMass;
                    bodyB.anglePrev -= (offsetBX * impulseY - offsetBY * impulseX) * bodyB.inverseInertia;
                }
            }
        }
    };
}
