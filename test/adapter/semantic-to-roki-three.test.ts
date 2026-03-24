import { readFileSync } from 'node:fs';
import { Box3, MathUtils, Mesh, Quaternion, Vector3 } from 'three';
import { parseZtk, resolveZtk } from '../../submodules/ztk-ts/src/index.js';
import { buildChainFromSemantic } from '../../src/adapter/semantic-to-roki-three.js';
import { Link } from '../../submodules/roki-three/src/roki/Link.js';
import { Chain } from '../../submodules/roki-three/src/roki/Chain.js';
import { ZTKParser } from '../../submodules/roki-three/src/zeda/ZTKParser.js';

function expectCloseToVector3(vec1: Vector3, vec2: Vector3): void {
  expect(vec1.x).toBeCloseTo(vec2.x);
  expect(vec1.y).toBeCloseTo(vec2.y);
  expect(vec1.z).toBeCloseTo(vec2.z);
}

function expectCloseToQuaternion(quat1: Quaternion, quat2: Quaternion): void {
  expect(quat1.x).toBeCloseTo(quat2.x);
  expect(quat1.y).toBeCloseTo(quat2.y);
  expect(quat1.z).toBeCloseTo(quat2.z);
  expect(quat1.w).toBeCloseTo(quat2.w);
}

function buildDirectRokiChain(source: string): Chain {
  const parser = new ZTKParser();
  expect(parser.parse(source)).toBe(true);
  const chain = new Chain();
  chain.fromZTK(parser);
  chain.transformToThree();
  return chain;
}

function expectBoundsParity(label: string, actual: Box3, expected: Box3): void {
  const actualMin = actual.min.toArray();
  const expectedMin = expected.min.toArray();
  const actualMax = actual.max.toArray();
  const expectedMax = expected.max.toArray();

  actualMin.forEach((value, index) => {
    expect(value, `${label} min[${index}]`).toBeCloseTo(expectedMin[index]);
  });
  actualMax.forEach((value, index) => {
    expect(value, `${label} max[${index}]`).toBeCloseTo(expectedMax[index]);
  });
}

function expectGeometryParity(sampleName: string, source: string): void {
  const semanticChain = buildChainFromSemantic(resolveZtk(parseZtk(source))).chain;
  const directChain = buildDirectRokiChain(source);

  expect(semanticChain.links.map((link) => link.name)).toEqual(directChain.links.map((link) => link.name));
  expect(semanticChain.mshape.shape.map((shape) => shape.name)).toEqual(directChain.mshape.shape.map((shape) => shape.name));

  semanticChain.links.forEach((link, index) => {
    expectCloseToVector3(link.position, directChain.links[index].position);
    expectCloseToQuaternion(link.quaternion, directChain.links[index].quaternion);
  });

  semanticChain.mshape.shape.forEach((shape, index) => {
    shape.geometry.computeBoundingBox();
    directChain.mshape.shape[index].geometry.computeBoundingBox();
    const actualBounds = shape.geometry.boundingBox;
    const expectedBounds = directChain.mshape.shape[index].geometry.boundingBox;
    expect(actualBounds).toBeTruthy();
    expect(expectedBounds).toBeTruthy();
    expectBoundsParity(`${sampleName}:${shape.name}`, actualBounds!, expectedBounds!);
  });
}

function ztkCorpusFixture(relativePath: string): URL {
  return new URL(`../../submodules/ztk-ts/test/fixtures/corpus/${relativePath}`, import.meta.url);
}

describe('buildChainFromSemantic', () => {
  test('builds a runtime chain from semantic arm data', () => {
    const source = readFileSync(
      new URL('../../submodules/ztk-ts/test/fixtures/arm_2dof.ztk', import.meta.url),
      'utf8',
    );
    const semantic = resolveZtk(parseZtk(source));
    const result = buildChainFromSemantic(semantic);

    expect(result.diagnostics).toEqual([]);
    expect(result.chain.name).toBe('2DOF_arm');
    expect(result.chain.links).toHaveLength(3);
    expect(result.chain.mshape.optic).toHaveLength(4);
    expect(result.chain.mshape.shape).toHaveLength(5);

    const [base, link1, link2] = result.chain.links;
    expect(base.name).toBe('link#00');
    expect(base.joint?.DOF).toBe(0);
    expect(base.children.filter((child) => child instanceof Link).map((child) => child.name)).toEqual([
      'link#01',
    ]);
    expect(link1.children.filter((child) => child instanceof Link).map((child) => child.name)).toEqual([
      'link#02',
    ]);
    expect(link2.children.filter((child) => child instanceof Link)).toHaveLength(0);

    expect(base.body.mp.mass).toBeCloseTo(1.5);
    expectCloseToVector3(base.body.mp.com, new Vector3(0.067, 0, 0));
    expect(base.children.filter((child) => child instanceof Link)[0]).toBe(link1);
    expect(result.metadata.getBinding(base)?.kind).toBe('link');
    expect(result.metadata.getBinding(base)?.stableId).toBe('link:0:link-00');

    const baseShapeMesh = base.children.find((child) => !(child instanceof Link));
    expect(baseShapeMesh).toBeDefined();
    expect(result.metadata.getBinding(baseShapeMesh!)?.kind).toBe('shape');
    expect(result.metadata.getBinding(baseShapeMesh!)?.stableId).toBe('shape:0:shape-base');

    expect(base.position.length()).toBeCloseTo(0);
    expectCloseToVector3(link1.position, new Vector3(0.15, 0, 0));
    expectCloseToVector3(link2.position, new Vector3(0.4, 0, 0));
    expectCloseToQuaternion(link1.quaternion, new Quaternion());

    const linkBinding = result.metadata.bindingsById.get('link:1:link-01');
    expect(linkBinding?.kind).toBe('link');
    if (linkBinding?.kind === 'link') {
      expect(linkBinding.parentStableId).toBe('link:0:link-00');
      expect(linkBinding.childStableIds).toEqual(['link:2:link-02']);
      expect(linkBinding.shapeStableIds).toEqual(['shape:2:shape-02', 'shape:4:shape-motor']);
    }
  });

  test('applies chain init joint states and reports unsupported runtime features', () => {
    const semantic = resolveZtk(
      parseZtk(`
[roki::chain]
name: demo

[zeo::shape]
name: unsupported-shape
type: ellipsoid
radius: 1

[roki::link]
name: base
jointtype: float
shape: unsupported-shape

[roki::link]
name: slider
jointtype: cylindrical
parent: base
frame: {
 1, 0, 0, 1
 0, 1, 0, 0
 0, 0, 1, 0
}

[roki::chain::init]
joint: base 1 2 3 0 0 ${MathUtils.degToRad(90)}
`),
    );

    const result = buildChainFromSemantic(semantic);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'unsupported-shape-type',
      'unsupported-joint-type',
    ]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'unsupported-shape-type',
        summary: 'Unsupported shape type: ellipsoid',
        severity: 'warning',
        target: {
          kind: 'shape',
          stableId: 'shape:0:unsupported-shape',
          name: 'unsupported-shape',
        },
      }),
      expect.objectContaining({
        code: 'unsupported-joint-type',
        summary: 'Unsupported joint type: cylindrical',
        severity: 'warning',
        target: {
          kind: 'link',
          stableId: 'link:1:slider',
          name: 'slider',
        },
      }),
    ]);

    const [base, slider] = result.chain.links;
    expectCloseToVector3(base.position, new Vector3(1, 2, 3));
    expectCloseToQuaternion(
      base.quaternion,
      new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), MathUtils.degToRad(90)),
    );
    expect(slider.joint).toBeUndefined();
    expectCloseToVector3(slider.position, new Vector3(1, 0, 0));
    expect(base.userData.semanticBindingId).toBe('link:0:base');
  });

  test('matches roki-three local placement for cylinder shapes', () => {
    const source = readFileSync(
      new URL('../../submodules/ztk-ts/test/fixtures/arm_2dof.ztk', import.meta.url),
      'utf8',
    );
    const semantic = resolveZtk(parseZtk(source));
    const result = buildChainFromSemantic(semantic);

    const base = result.chain.links[0];
    const motorMesh = base.children.find((child) => child.name === 'shape_motor_base');
    expect(motorMesh).toBeDefined();
    expect(motorMesh).toBeInstanceOf(Mesh);

    const shapeMesh = motorMesh as Mesh;
    shapeMesh.geometry.computeBoundingBox();
    const bounds = shapeMesh.geometry.boundingBox ?? new Box3().setFromObject(shapeMesh);
    const center = bounds.getCenter(new Vector3());
    const size = bounds.getSize(new Vector3());

    expectCloseToVector3(center, new Vector3(0.15, 0, 0));
    expect(size.x).toBeCloseTo(0.1);
    expect(size.y).toBeCloseTo(0.1);
    expect(size.z).toBeCloseTo(0.1);
  });

  test('matches roki-three chain geometry for supported roki samples', () => {
    expectGeometryParity(
      'arm_2dof',
      readFileSync(new URL('../../submodules/ztk-ts/test/fixtures/arm_2dof.ztk', import.meta.url), 'utf8'),
    );
    expectGeometryParity('invpend', readFileSync(ztkCorpusFixture('roki/invpend.ztk'), 'utf8'));
    expectGeometryParity('box', readFileSync(ztkCorpusFixture('roki/box.ztk'), 'utf8'));
  });

  test('matches roki-three shape geometry for zeo samples with varied shape definitions', () => {
    expectGeometryParity('zeo-box', readFileSync(ztkCorpusFixture('zeo/box.ztk'), 'utf8'));
    expectGeometryParity('zeo-scc', readFileSync(ztkCorpusFixture('zeo/scc.ztk'), 'utf8'));
  });
});
