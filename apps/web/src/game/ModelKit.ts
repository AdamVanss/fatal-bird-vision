import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const CITY_FILES = [
  "building-skyscraper-a.glb",
  "building-skyscraper-b.glb",
  "building-skyscraper-c.glb",
  "building-skyscraper-d.glb",
  "building-skyscraper-e.glb",
];

function groundAndLight(obj: THREE.Object3D): THREE.Group {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  obj.position.sub(box.min);
  obj.position.x -= size.x * 0.5;
  obj.position.z -= size.z * 0.5;
  obj.position.y = 0;
  obj.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.castShadow = true;
    child.receiveShadow = true;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const mat of mats) {
      mat.side = THREE.FrontSide;
      if ("envMapIntensity" in mat) mat.envMapIntensity = 0.7;
      if ("roughness" in mat && typeof mat.roughness === "number") {
        mat.roughness = Math.max(mat.roughness, 0.55);
      }
    }
  });
  obj.userData.size = size;
  return obj as THREE.Group;
}

export class ModelKit {
  buildings: THREE.Group[] = [];

  clone(src: THREE.Group): THREE.Group {
    const copy = src.clone(true);
    const size = src.userData.size as THREE.Vector3;
    copy.userData.size = size.clone();
    return copy;
  }

  async load(): Promise<void> {
    const loader = new GLTFLoader();
    const settled = await Promise.allSettled(
      CITY_FILES.map(async (file) => {
        const gltf = await loader.loadAsync(`/models/city/${file}`);
        return groundAndLight(gltf.scene);
      }),
    );
    const ok: THREE.Group[] = [];
    settled.forEach((r, i) => {
      if (r.status === "fulfilled") ok.push(r.value);
      else console.warn(`Model failed city/${CITY_FILES[i]}`, r.reason);
    });
    this.buildings = ok;
    console.info(`Loaded ${ok.length} city buildings`);
  }
}
