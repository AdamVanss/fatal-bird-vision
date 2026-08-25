import type * as THREE from "three";
import type { Course } from "./Course";

export interface CollisionEvents {
  ringHit: boolean;
  appleHit: boolean;
}

export class CollisionRunner {
  private readonly course: Course;

  constructor(course: Course) {
    this.course = course;
  }

  update(dt: number, birdPos: THREE.Vector3): CollisionEvents {
    const events: CollisionEvents = { ringHit: false, appleHit: false };

    for (const ring of this.course.rings) {
      if (ring.checkPass(birdPos)) events.ringHit = true;
    }
    for (const apple of this.course.apples) {
      apple.update(dt);
      if (apple.tryCollect(birdPos)) events.appleHit = true;
    }

    return events;
  }
}