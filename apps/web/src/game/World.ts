import * as THREE from "three";

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
    this.scene.background = new THREE.Color(0x87b8e8);
    this.scene.fog = new THREE.Fog(0x87b8e8, 30, 120);

    const hemi = new THREE.HemisphereLight(0xd4ebff, 0x3d5c45, 0.85);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff4dd, 1.0);
    sun.position.set(20, 40, 15);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 80;
    sun.shadow.camera.left = -30;
    sun.shadow.camera.right = 30;
    sun.shadow.camera.top = 30;
    sun.shadow.camera.bottom = -30;
    this.scene.add(sun);

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
        color: 0x4a7a52,
        roughness: 0.95,
        flatShading: true,
      }),
    );
    this.terrainMesh.receiveShadow = true;
    this.terrainMesh.position.set(0, -4, 110);
    this.scene.add(this.terrainMesh);

    this.addTrees();
    this.addClouds();
  }

  private addTrees(): void {
    const trunkGeo = new THREE.CylinderGeometry(0.12, 0.16, 1.0, 5);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3728 });
    const leafGeo = new THREE.ConeGeometry(0.7, 1.8, 5);
    const leafMat = new THREE.MeshStandardMaterial({
      color: 0x2d6b4a,
      flatShading: true,
    });

    for (let i = 0; i < 30; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const x = side * (8 + Math.random() * 6);
      const z = Math.random() * 230 + 5;
      const y = terrainHeight(x, z) - 4;
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
