import * as THREE from 'three';

/**
 * Disposal helpers. Three.js does not free GPU memory automatically: every
 * geometry, material and texture must be disposed when it leaves the scene.
 */
export function disposeMaterial(material: THREE.Material | THREE.Material[]): void {
  const list = Array.isArray(material) ? material : [material];
  for (const m of list) {
    for (const value of Object.values(m)) {
      if (value instanceof THREE.Texture) value.dispose();
    }
    m.dispose();
  }
}

/** Disposes every geometry, material and texture under `root` and detaches it. */
export function disposeObjectTree(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) disposeMaterial(mesh.material);
    if ((obj as THREE.InstancedMesh).isInstancedMesh) (obj as THREE.InstancedMesh).dispose();
  });
  root.removeFromParent();
}
