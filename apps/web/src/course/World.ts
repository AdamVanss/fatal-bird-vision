import * as THREE from "three";
import {
  VISUAL_FOG_COLOR,
  VISUAL_GROUND_COLOR,
  VISUAL_TREE_LEAF_COLOR,
  VISUAL_TREE_TRUNK_COLOR,
  WORLD,
} from "../constants";

function terrainHeight(x: number, z: number): number {
  return (
    Math.sin(x * 0.08) * 1.5 +
    Math.cos(z * 0.06) * 2 +
    Math.sin((x + z) * 0.04) * 1.2
  );
}

export class World {
  readonly scene = new THREE.Scene();
  readonly terrainMesh: THREE.Mesh;

  constructor() {
    // Lighting is owned by LightingManager; this only sets the sky backdrop
    // (matched to the fog color so distance blends with the background).
    this.scene.background = new THREE.Color(VISUAL_FOG_COLOR);

    const groundGeo = new THREE.PlaneGeometry(120, 280, 40, 80);
    groundGeo.rotateX(-Math.PI / 2);
    const pos = groundGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, terrainHeight(x, z));
    }
    groundGeo.computeVertexNormals();

    this.terrainMesh = new THREE.Mesh(
      groundGeo,
      new THREE.MeshStandardMaterial({
        color: VISUAL_GROUND_COLOR,
        roughness: 0.95,
        flatShading: true,
      }),
    );
    this.terrainMesh.receiveShadow = true;
    this.terrainMesh.position.set(0, WORLD.terrainY, 110);
    this.scene.add(this.terrainMesh);

    this.addTrees();
    this.addClouds();
  }

  private addTrees(): void {
    const trunkGeo = new THREE.CylinderGeometry(0.12, 0.16, 1.0, 5);
    const trunkMat = new THREE.MeshStandardMaterial({
      color: VISUAL_TREE_TRUNK_COLOR,
    });
    const leafGeo = new THREE.ConeGeometry(0.7, 1.8, 5);
    const leafMat = new THREE.MeshStandardMaterial({
      color: VISUAL_TREE_LEAF_COLOR,
      flatShading: true,
    });

    for (let i = 0; i < 30; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const x = side * (8 + Math.random() * 6);
      const z = Math.random() * 230 + 5;
      const y = terrainHeight(x, z) + WORLD.terrainY;
      const tree = new THREE.Group();
      tree.add(
        new THREE.Mesh(trunkGeo, trunkMat),
        new THREE.Mesh(leafGeo, leafMat),
      );
      tree.children[0].position.y = 0.5;
      tree.children[1].position.y = 1.6;
      tree.position.set(x, y, z);
      tree.scale.setScalar(0.6 + Math.random() * 0.4);
      this.scene.add(tree);
    }
  }

  private addClouds(): void {
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.7,
      flatShading: true,
    });
    for (let i = 0; i < 6; i++) {
      const cloud = new THREE.Group();
      for (let j = 0; j < 3; j++) {
        cloud.add(
          new THREE.Mesh(
            new THREE.SphereGeometry(0.9 + Math.random() * 0.4, 6, 6),
            cloudMat,
          ),
        );
        cloud.children[j].position.set(j * 1.1 - 1, 0, 0);
      }
      cloud.position.set(
        (Math.random() - 0.5) * 30,
        14 + Math.random() * 4,
        Math.random() * 200 + 20,
      );
      this.scene.add(cloud);
    }
  }
}
