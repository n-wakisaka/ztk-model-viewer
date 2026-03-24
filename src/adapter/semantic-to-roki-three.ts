import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Matrix3,
  Matrix4,
  Mesh,
  MeshPhongMaterial,
  Object3D,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import type {
  ZtkMat3,
  ZtkResolvedTransform,
  ZtkSemanticDocument,
  ZtkShapeGeometry,
  ZtkVec3,
} from '../../submodules/ztk-ts/src/index.js';
import { Chain } from '../../submodules/roki-three/src/roki/Chain.js';
import { JointFactory } from '../../submodules/roki-three/src/roki/JointFactory.js';
import { Link } from '../../submodules/roki-three/src/roki/Link.js';
import { Frame } from '../../submodules/roki-three/src/zeo/Frame.js';
import { OpticalInfo } from '../../submodules/roki-three/src/zeo/OpticalInfo.js';
import { Shape } from '../../submodules/roki-three/src/zeo/Shape.js';

export type SemanticChainAdapterDiagnostic = {
  code: 'unsupported-shape-type' | 'unsupported-joint-type';
  message: string;
  name?: string;
  summary: string;
  severity: 'warning';
  target?: {
    kind: 'link' | 'shape';
    stableId: string;
    name?: string;
  };
};

export type SemanticAdapterStableId =
  | `chain:${string}`
  | `chain-init:${string}`
  | `optic:${string}`
  | `shape:${string}`
  | `link:${string}`;

export type SemanticAdapterBinding =
  | {
      stableId: SemanticAdapterStableId;
      kind: 'chain';
      runtimeObject: Chain;
      semanticNode: ZtkSemanticDocument['chain'];
      name?: string;
      index: number;
    }
  | {
      stableId: SemanticAdapterStableId;
      kind: 'chain-init';
      runtimeObject: undefined;
      semanticNode: ZtkSemanticDocument['chainInit'];
      name?: string;
      index: number;
    }
  | {
      stableId: SemanticAdapterStableId;
      kind: 'optic';
      runtimeObject: undefined;
      semanticNode: ZtkSemanticDocument['optics'][number];
      name?: string;
      index: number;
    }
  | {
      stableId: SemanticAdapterStableId;
      kind: 'shape';
      runtimeObject: Mesh;
      semanticNode: ZtkSemanticDocument['shapes'][number];
      name?: string;
      index: number;
      opticStableId?: SemanticAdapterStableId;
    }
  | {
      stableId: SemanticAdapterStableId;
      kind: 'link';
      runtimeObject: Link;
      semanticNode: ZtkSemanticDocument['links'][number];
      name?: string;
      index: number;
      parentStableId?: SemanticAdapterStableId;
      childStableIds: Array<Extract<SemanticAdapterStableId, `link:${string}`>>;
      shapeStableIds: Array<Extract<SemanticAdapterStableId, `shape:${string}`>>;
      motorName?: string;
    };

export type SemanticChainAdapterMetadata = {
  bindings: SemanticAdapterBinding[];
  bindingsById: Map<SemanticAdapterStableId, SemanticAdapterBinding>;
  bindingsByObject: Map<Object3D, SemanticAdapterBinding>;
  getBinding(object: Object3D): SemanticAdapterBinding | undefined;
};

export type SemanticChainAdapterResult = {
  chain: Chain;
  diagnostics: SemanticChainAdapterDiagnostic[];
  metadata: SemanticChainAdapterMetadata;
};

type RuntimeBindingSeed = {
  bindings: SemanticAdapterBinding[];
  bindingsById: Map<SemanticAdapterStableId, SemanticAdapterBinding>;
  bindingsByObject: Map<Object3D, SemanticAdapterBinding>;
};

type ShapeRuntimeEntry = {
  shape: Shape;
  mesh: Mesh;
  binding: Extract<SemanticAdapterBinding, { kind: 'shape' }>;
};

function slugifyStableIdPart(value: string | undefined, fallback: string): string {
  const normalized = (value ?? fallback).trim().toLowerCase();
  const slug = normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : fallback;
}

function createStableId(
  prefix: Exclude<SemanticAdapterBinding['kind'], 'chain-init'> | 'chain-init',
  index: number,
  name: string | undefined,
): SemanticAdapterStableId {
  return `${prefix}:${index}:${slugifyStableIdPart(name, 'unnamed')}` as SemanticAdapterStableId;
}

function registerBinding<TBinding extends SemanticAdapterBinding>(
  seed: RuntimeBindingSeed,
  binding: TBinding,
): TBinding {
  seed.bindings.push(binding);
  seed.bindingsById.set(binding.stableId, binding);
  if (binding.runtimeObject) {
    binding.runtimeObject.userData.semanticBindingId = binding.stableId;
    binding.runtimeObject.userData.semanticBindingKind = binding.kind;
    seed.bindingsByObject.set(binding.runtimeObject, binding);
  }
  return binding;
}

function vec3Of(value: ZtkVec3): Vector3 {
  return new Vector3(value[0], value[1], value[2]);
}

function matrix3Of(value: ZtkMat3): Matrix3 {
  const matrix = new Matrix3();
  matrix.set(value[0], value[1], value[2], value[3], value[4], value[5], value[6], value[7], value[8]);
  return matrix;
}

function quaternionFromMat3(value: ZtkMat3): Quaternion {
  const matrix = new Matrix4();
  matrix.set(
    value[0],
    value[1],
    value[2],
    0,
    value[3],
    value[4],
    value[5],
    0,
    value[6],
    value[7],
    value[8],
    0,
    0,
    0,
    0,
    1,
  );
  return new Quaternion().setFromRotationMatrix(matrix);
}

function frameFromResolvedTransform(transform: ZtkResolvedTransform): Frame {
  return new Frame(vec3Of(transform.pos), quaternionFromMat3(transform.att));
}

function isGeometryType<TType extends ZtkShapeGeometry['type']>(
  geometry: ZtkShapeGeometry,
  type: TType,
): geometry is Extract<ZtkShapeGeometry, { type: TType }> {
  return geometry.type === type;
}

function normalizeVector(value: ZtkVec3): Vector3 {
  return vec3Of(value).normalize();
}

function quaternionFromBoxAxesLikeRoki(
  ax: ZtkVec3 | 'auto' | undefined,
  ay: ZtkVec3 | 'auto' | undefined,
  az: ZtkVec3 | 'auto' | undefined,
): Quaternion | undefined {
  const axes = [
    ax && ax !== 'auto' ? normalizeVector(ax) : new Vector3(1, 0, 0),
    ay && ay !== 'auto' ? normalizeVector(ay) : new Vector3(0, 1, 0),
    az && az !== 'auto' ? normalizeVector(az) : new Vector3(0, 0, 1),
  ];
  const autoId =
    ax === 'auto' ? 0
    : ay === 'auto' ? 1
    : az === 'auto' ? 2
    : undefined;

  if (autoId) {
    if (autoId >= 0) {
      axes[autoId] = axes[(autoId + 1) % 3].cross(axes[(autoId + 2) % 3]);
    }
  }

  const matrix = new Matrix4();
  matrix.makeBasis(axes[0], axes[1], axes[2]);
  return new Quaternion().setFromRotationMatrix(matrix);
}

function applyLocalFrame(
  geometry: BufferGeometry,
  position: ZtkVec3,
  rotation?: Quaternion,
): BufferGeometry {
  geometry.translate(position[0], position[1], position[2]);
  if (rotation) {
    geometry.applyQuaternion(rotation);
  }
  return geometry;
}

function createGeometry(
  geometry: ZtkShapeGeometry,
  diagnostics: SemanticChainAdapterDiagnostic[],
  stableId: SemanticAdapterStableId,
  name?: string,
): BufferGeometry {
  if (isGeometryType(geometry, 'box')) {
    return applyLocalFrame(
      new BoxGeometry(geometry.width ?? 0, geometry.height ?? 0, geometry.depth ?? 0),
      geometry.center ?? [0, 0, 0],
      quaternionFromBoxAxesLikeRoki(geometry.ax, geometry.ay, geometry.az),
    );
  }

  if (isGeometryType(geometry, 'sphere')) {
    return applyLocalFrame(
      new SphereGeometry(geometry.radius ?? 0, geometry.div ?? 32, geometry.div ?? 32),
      geometry.center ?? [0, 0, 0],
    );
  }

  if (isGeometryType(geometry, 'cylinder')) {
    const start = geometry.centers[0] ?? [0, 0, 0];
    const end = geometry.centers[1] ?? start;
    const dir = vec3Of(end).sub(vec3Of(start));
    const height = dir.length();
    const center = vec3Of(start).add(vec3Of(end)).multiplyScalar(0.5);
    const rotation = height > 0 ? new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.normalize()) : undefined;
    return applyLocalFrame(
      new CylinderGeometry(geometry.radius ?? 0, geometry.radius ?? 0, height, geometry.div ?? 32),
      [center.x, center.y, center.z],
      rotation,
    );
  }

  if (isGeometryType(geometry, 'cone')) {
    const center = geometry.center ?? [0, 0, 0];
    const vert = geometry.vert ?? center;
    const dir = vec3Of(vert).sub(vec3Of(center));
    const height = dir.length();
    const midpoint = vec3Of(center).add(vec3Of(vert)).multiplyScalar(0.5);
    const rotation = height > 0 ? new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.normalize()) : undefined;
    return applyLocalFrame(
      new ConeGeometry(geometry.radius ?? 0, height, geometry.div ?? 32),
      [midpoint.x, midpoint.y, midpoint.z],
      rotation,
    );
  }

  if (isGeometryType(geometry, 'polyhedron')) {
    const vertices = new Float32Array(geometry.vertices.length * 3);
    const indices: number[] = [];

    for (const vertex of geometry.vertices) {
      const id = vertex[0] ?? 0;
      vertices[id * 3] = vertex[1] ?? 0;
      vertices[id * 3 + 1] = vertex[2] ?? 0;
      vertices[id * 3 + 2] = vertex[3] ?? 0;
    }

    for (const face of geometry.faces) {
      if (face.length >= 3) {
        indices.push(face[0], face[1], face[2]);
      }
    }

    const bufferGeometry = new BufferGeometry();
    bufferGeometry.setIndex(indices);
    bufferGeometry.setAttribute('position', new BufferAttribute(vertices, 3));
    bufferGeometry.computeVertexNormals();
    return bufferGeometry;
  }

  diagnostics.push({
    code: 'unsupported-shape-type',
    message: `Shape type "${geometry.type}" is not supported by the roki-three adapter`,
    name,
    summary: `Unsupported shape type: ${geometry.type}`,
    severity: 'warning',
    target: {
      kind: 'shape',
      stableId,
      name,
    },
  });
  return new BufferGeometry();
}

function applyResolvedTransform(geometry: BufferGeometry, transform: ZtkResolvedTransform): void {
  geometry.applyQuaternion(quaternionFromMat3(transform.att));
  geometry.translate(transform.pos[0], transform.pos[1], transform.pos[2]);
}

function createOptic(opticModel: ZtkSemanticDocument['optics'][number]): OpticalInfo {
  const optic = new OpticalInfo();
  optic.name = opticModel.name ?? optic.name;

  const ambient = opticModel.ambient ?? [1, 1, 1];
  const diffuse = opticModel.diffuse ?? [1, 1, 1];
  const specular = opticModel.specular ?? [1, 1, 1];
  const shininess = opticModel.shininess ?? 0;
  const alpha = opticModel.alpha ?? 1;

  optic.material = new MeshPhongMaterial({
    name: optic.name,
    color: new Color(diffuse[0], diffuse[1], diffuse[2]),
    specular: new Color(specular[0], specular[1], specular[2]),
    shininess: shininess * 100,
    opacity: alpha,
    transparent: alpha !== 1,
    side: DoubleSide,
    emissive: new Color(ambient[0], ambient[1], ambient[2]),
  });

  return optic;
}

function createShape(
  shapeModel: ZtkSemanticDocument['shapes'][number],
  index: number,
  optics: OpticalInfo[],
  diagnostics: SemanticChainAdapterDiagnostic[],
  metadataSeed: RuntimeBindingSeed,
  opticBindingIds: Map<string, SemanticAdapterStableId>,
): ShapeRuntimeEntry {
  const shape = new Shape();
  shape.name = shapeModel.name ?? shape.name;
  const stableId = createStableId('shape', index, shapeModel.name);
  shape.geometry = createGeometry(shapeModel.geometry, diagnostics, stableId, shape.name);
  applyResolvedTransform(shape.geometry, shapeModel.transform.resolved);

  const optic = optics.find((candidate) => candidate.name === shapeModel.opticName);
  if (optic) {
    shape.material = optic.material;
  }

  const mesh = shape.getMesh();
  const binding = registerBinding(metadataSeed, {
    stableId,
    kind: 'shape',
    runtimeObject: mesh,
    semanticNode: shapeModel,
    name: shapeModel.name,
    index,
    opticStableId: shapeModel.opticName ? opticBindingIds.get(shapeModel.opticName) : undefined,
  });

  return { shape, mesh, binding };
}

function applyJoint(
  link: Link,
  model: ZtkSemanticDocument['links'][number],
  diagnostics: SemanticChainAdapterDiagnostic[],
  stableId: SemanticAdapterStableId,
): void {
  if (!model.joint.baseType) {
    return;
  }

  const joint = JointFactory.getInstance(model.joint.baseType);
  if (!joint) {
    diagnostics.push({
      code: 'unsupported-joint-type',
      message: `Joint type "${model.joint.baseType}" is not supported by roki-three runtime`,
      name: model.name,
      summary: `Unsupported joint type: ${model.joint.baseType}`,
      severity: 'warning',
      target: {
        kind: 'link',
        stableId,
        name: model.name,
      },
    });
    return;
  }

  link.joint = joint;
  if (model.dis && model.dis.length === joint.DOF) {
    joint.setDis(model.dis);
  }
}

function applyMassProperties(link: Link, model: ZtkSemanticDocument['links'][number]): void {
  if (model.mass !== undefined) {
    link.body.mp.mass = model.mass;
  }
  if (model.com && model.com !== 'auto') {
    link.body.mp.com.copy(vec3Of(model.com));
  }
  if (model.inertia && model.inertia !== 'auto') {
    link.body.mp.inertia.copy(matrix3Of(model.inertia));
  }
  link.body.stuff = model.stuff;
}

export function buildChainFromSemantic(document: ZtkSemanticDocument): SemanticChainAdapterResult {
  const diagnostics: SemanticChainAdapterDiagnostic[] = [];
  const chain = new Chain();
  chain.name = document.chain?.name ?? chain.name;
  const metadataSeed: RuntimeBindingSeed = {
    bindings: [],
    bindingsById: new Map(),
    bindingsByObject: new Map(),
  };

  if (document.chain) {
    registerBinding(metadataSeed, {
      stableId: createStableId('chain', 0, document.chain.name),
      kind: 'chain',
      runtimeObject: chain,
      semanticNode: document.chain,
      name: document.chain.name,
      index: 0,
    });
  }

  if (document.chainInit) {
    registerBinding(metadataSeed, {
      stableId: createStableId('chain-init', 0, document.chain?.name ?? document.chainInit.tag),
      kind: 'chain-init',
      runtimeObject: undefined,
      semanticNode: document.chainInit,
      name: document.chain?.name,
      index: 0,
    });
  }

  const optics = document.optics.map(createOptic);
  const opticBindingIds = new Map<string, SemanticAdapterStableId>();
  document.optics.forEach((opticModel, index) => {
    const binding = registerBinding(metadataSeed, {
      stableId: createStableId('optic', index, opticModel.name),
      kind: 'optic',
      runtimeObject: undefined,
      semanticNode: opticModel,
      name: opticModel.name,
      index,
    });
    if (opticModel.name) {
      opticBindingIds.set(opticModel.name, binding.stableId);
    }
  });

  const shapeEntries = document.shapes.map((shape, index) =>
    createShape(shape, index, optics, diagnostics, metadataSeed, opticBindingIds),
  );
  const shapes = shapeEntries.map((entry) => entry.shape);
  const shapeMap = new Map(shapeEntries.map((entry) => [entry.shape.name, entry]));

  chain.mshape.optic = optics;
  chain.mshape.shape = shapes;

  chain.links = document.links.map((linkModel, index) => {
    const link = new Link();
    link.name = linkModel.name ?? link.name;
    link.orgFrame = frameFromResolvedTransform(linkModel.transform.resolved);
    const stableId = createStableId('link', index, linkModel.name);
    const binding = registerBinding<Extract<SemanticAdapterBinding, { kind: 'link' }>>(metadataSeed, {
      stableId,
      kind: 'link',
      runtimeObject: link,
      semanticNode: linkModel,
      name: linkModel.name,
      index,
      parentStableId: undefined,
      childStableIds: [],
      shapeStableIds: [],
      motorName: linkModel.motorName,
    });
    applyJoint(link, linkModel, diagnostics, stableId);
    applyMassProperties(link, linkModel);

    for (const shapeName of linkModel.shapeNames) {
      const shapeEntry = shapeMap.get(shapeName);
      if (shapeEntry) {
        link.add(shapeEntry.mesh);
        binding.shapeStableIds.push(shapeEntry.binding.stableId as Extract<SemanticAdapterStableId, `shape:${string}`>);
      }
    }

    return link;
  });

  const linkMap = new Map(chain.links.map((link) => [link.name, link]));
  for (let index = 0; index < document.links.length; index += 1) {
    const linkModel = document.links[index];
    const link = chain.links[index];
    const binding = metadataSeed.bindingsByObject.get(link);
    if (!binding || binding.kind !== 'link') {
      continue;
    }
    if (linkModel.parentName) {
      const parent = linkMap.get(linkModel.parentName);
      parent?.add(link);
      const parentBinding = parent ? metadataSeed.bindingsByObject.get(parent) : undefined;
      if (parentBinding && parentBinding.kind === 'link') {
        binding.parentStableId = parentBinding.stableId;
        parentBinding.childStableIds.push(binding.stableId as Extract<SemanticAdapterStableId, `link:${string}`>);
      }
    } else {
      chain.add(link);
    }
  }

  if (document.chainInit) {
    for (const jointState of document.chainInit.jointStates) {
      if (!jointState.linkName) {
        continue;
      }
      const link = linkMap.get(jointState.linkName);
      if (link?.joint && jointState.values.length === link.joint.DOF) {
        link.joint.setDis(jointState.values);
      }
    }
  }

  chain.links.forEach((link) => link.updateFrame());
  chain.transformToThree();

  return {
    chain,
    diagnostics,
    metadata: {
      bindings: metadataSeed.bindings,
      bindingsById: metadataSeed.bindingsById,
      bindingsByObject: metadataSeed.bindingsByObject,
      getBinding: (object: Object3D) => metadataSeed.bindingsByObject.get(object),
    },
  };
}
