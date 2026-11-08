import RAPIER from '@dimforge/rapier3d-compat';

export { RAPIER };

/** Anything attached to a collider that wants to hear about hard contacts. */
export interface Entity {
  kind: string;
  /** Called after a step when contact force with another collider passes this collider's threshold. */
  onForce?: (force: number, other: Entity | undefined, otherCol: RAPIER.Collider, selfCol: RAPIER.Collider) => void;
  /** Mass used to turn a force into a "g-load" (force / mass). */
  mass?: number;
}

export const STEP = 1 / 60;

export class Physics {
  world: RAPIER.World;
  queue: RAPIER.EventQueue;
  entities = new Map<number, Entity>();
  private events: [number, number, number][] = [];

  constructor() {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = STEP;
    this.queue = new RAPIER.EventQueue(true);
  }

  register(col: RAPIER.Collider, ent: Entity) {
    this.entities.set(col.handle, ent);
  }

  unregister(col: RAPIER.Collider) {
    this.entities.delete(col.handle);
  }

  removeBody(body: RAPIER.RigidBody) {
    if (!body) return;
    const n = body.numColliders();
    for (let i = 0; i < n; i++) this.entities.delete(body.collider(i).handle);
    this.world.removeRigidBody(body);
  }

  step(h: number) {
    this.world.timestep = h;
    this.world.step(this.queue);
    const ev = this.events;
    ev.length = 0;
    this.queue.drainContactForceEvents((e) => {
      ev.push([e.collider1(), e.collider2(), e.totalForceMagnitude()]);
    });
    this.queue.drainCollisionEvents(() => {});
    // Forces are reported as impulse/dt; normalise to the 60 Hz step so slow-mo doesn't inflate them.
    const scale = h / STEP;
    for (const [h1, h2, f] of ev) {
      const c1 = this.world.getCollider(h1);
      const c2 = this.world.getCollider(h2);
      if (!c1 || !c2) continue;
      const e1 = this.entities.get(h1);
      const e2 = this.entities.get(h2);
      const force = f * scale;
      e1?.onForce?.(force, e2, c2, c1);
      e2?.onForce?.(force, e1, c1, c2);
    }
  }

  dispose() {
    this.entities.clear();
    this.queue.free();
    this.world.free();
  }
}
