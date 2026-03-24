import { readFileSync } from 'node:fs';
import { Object3D } from 'three';
import {
  createSemanticViewerShell,
  selectSemanticViewerNode,
  selectSemanticViewerObject,
  updateSemanticViewerJoint,
} from '../../src/view-model/semantic-viewer-shell.js';

describe('semantic viewer shell', () => {
  test('loads ztk source into semantic, runtime, and projection state', () => {
    const source = readFileSync(
      new URL('../../submodules/ztk-ts/test/fixtures/arm_2dof.ztk', import.meta.url),
      'utf8',
    );

    const shell = createSemanticViewerShell(source, {
      selectedId: 'link:0:link-00',
    });

    expect(shell.semanticDocument.chain?.name).toBe('2DOF_arm');
    expect(shell.adapterResult.chain.links).toHaveLength(3);
    expect(shell.viewerModel.hierarchy).toHaveLength(1);
    expect(shell.diagnostics.semantic).toEqual([]);
    expect(shell.diagnostics.runtime).toEqual([]);
    expect(shell.serializers.preserveSource.text).toContain('[roki::chain]');
    expect(shell.serializers.normalized.text).toContain('jointtype: fixed');
    expect(shell.serializers.materializedRuntime.supported).toBe(true);
    expect(shell.serializers.materializedRuntimeAnalysis.supported).toBe(true);
    expect(shell.selection.selectedSnapshot).toEqual(
      expect.objectContaining({
        kind: 'link',
        stableId: 'link:0:link-00',
        jointDOF: 0,
      }),
    );
    expect(shell.viewerModel.getJointControl('link:1:link-01')).toEqual({
      stableId: 'link:1:link-01',
      label: 'link link#01',
      jointType: 'revolute',
      jointBaseType: 'revolute',
      jointDOF: 1,
      values: [0],
      min: -180,
      max: 180,
      valueUnit: 'deg',
    });
  });

  test('supports stable-id selection updates for hierarchy clicks', () => {
    const source = readFileSync(
      new URL('../../submodules/ztk-ts/test/fixtures/arm_2dof.ztk', import.meta.url),
      'utf8',
    );
    const shell = createSemanticViewerShell(source);

    const selected = selectSemanticViewerNode(shell, 'shape:4:shape-motor');
    expect(selected.selection.selectedBinding).toEqual(
      expect.objectContaining({
        kind: 'shape',
        stableId: 'shape:4:shape-motor',
      }),
    );
    expect(selected.selection.selectedSnapshot).toEqual(
      expect.objectContaining({
        kind: 'shape',
        linkedLinkNames: ['link#01'],
      }),
    );
  });

  test('supports object-based selection updates for three.js picking', () => {
    const shell = createSemanticViewerShell(`
[roki::chain]
name: demo

[zeo::shape]
name: shape-a
type: sphere
radius: 1

[roki::link]
name: base
jointtype: fixed
shape: shape-a

[roki::link]
name: child
jointtype: cylindrical
parent: base
`);

    const base = shell.adapterResult.chain.links[0];
    const shapeMesh = base.children.find((child) => child.name === 'shape-a');
    expect(shapeMesh).toBeDefined();

    const pickHit = new Object3D();
    shapeMesh!.add(pickHit);

    const selectedFromPick = selectSemanticViewerObject(shell, pickHit);
    expect(selectedFromPick.selection.selectedId).toBe('shape:0:shape-a');
    expect(selectedFromPick.selection.selectedSnapshot).toEqual(
      expect.objectContaining({
        kind: 'shape',
        geometryType: 'sphere',
      }),
    );

    const cleared = selectSemanticViewerObject(shell, new Object3D());
    expect(cleared.selection).toEqual({});
    expect(shell.diagnostics.runtime).toEqual([
      expect.objectContaining({
        code: 'unsupported-joint-type',
      }),
    ]);
  });

  test('updates runtime joint values and refreshes inspector projection', () => {
    const source = readFileSync(
      new URL('../../submodules/ztk-ts/test/fixtures/arm_2dof.ztk', import.meta.url),
      'utf8',
    );
    const shell = createSemanticViewerShell(source, {
      selectedId: 'link:1:link-01',
    });

    const updated = updateSemanticViewerJoint(shell, 'link:1:link-01', [30]);
    expect(updated.viewerModel.getJointControl('link:1:link-01')).toEqual({
      stableId: 'link:1:link-01',
      label: 'link link#01',
      jointType: 'revolute',
      jointBaseType: 'revolute',
      jointDOF: 1,
      values: [30],
      min: -180,
      max: 180,
      valueUnit: 'deg',
    });
    expect(updated.selection.selectedSnapshot).toEqual(
      expect.objectContaining({
        kind: 'link',
        stableId: 'link:1:link-01',
        jointDis: [30],
      }),
    );
    expect(updated.adapterResult.chain.links[1].joint?.getDis()?.[0]).toBeCloseTo(Math.PI / 6);
  });

  test('clips revolute joint input to configured min/max before applying runtime state', () => {
    const source = readFileSync(
      new URL('../../submodules/ztk-ts/test/fixtures/arm_2dof.ztk', import.meta.url),
      'utf8',
    );
    const shell = createSemanticViewerShell(source, {
      selectedId: 'link:1:link-01',
    });

    const updated = updateSemanticViewerJoint(shell, 'link:1:link-01', [360]);
    expect(updated.viewerModel.getJointControl('link:1:link-01')?.values).toEqual([180]);
    expect(updated.adapterResult.chain.links[1].joint?.getDis()?.[0]).toBeCloseTo(Math.PI);
  });

  test('captures unsupported runtime materialization separately from semantic parsing', () => {
    const shell = createSemanticViewerShell(`
[roki::chain]
name: demo

[zeo::shape]
name: imported-scene
import: fixture.dae

[roki::link]
name: base
jointtype: fixed
shape: imported-scene
`);

    expect(shell.diagnostics.semantic).toEqual([]);
    expect(shell.serializers.materializedRuntimeAnalysis.supported).toBe(false);
    expect(shell.serializers.materializedRuntime.supported).toBe(false);
    expect(shell.serializers.materializedRuntime.diagnostics).toEqual([
      expect.objectContaining({
        code: 'unsupported-import-resolution',
      }),
    ]);
  });
});
