// A fluid particle has just two vectors. Copy this common case without the
// structured-clone traversal, retaining a fallback for extended state records.
export function cloneParticleStates(states) {
  return states.map(state => {
    const { position, velocity } = state;
    if (Object.keys(state).length !== 2 || !position || !velocity ||
      Object.keys(position).length !== 2 || Object.keys(velocity).length !== 2 ||
      !['x', 'y'].every(axis => typeof position[axis] === 'number' && typeof velocity[axis] === 'number')) return structuredClone(state);
    return { position: { x: position.x, y: position.y }, velocity: { x: velocity.x, y: velocity.y } };
  });
}
