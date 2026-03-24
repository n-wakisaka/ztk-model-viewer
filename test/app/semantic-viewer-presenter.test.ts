import { readFileSync } from 'node:fs';
import {
  createViewerDiagnosticsModel,
  createViewerInspectorModel,
  createViewerIssuesModel,
  createViewerSerializationModel,
} from '../../src/app/semantic-viewer-presenter.js';
import { createSemanticViewerShell, selectSemanticViewerNode, updateSemanticViewerJoint } from '../../src/view-model/semantic-viewer-shell.js';

describe('semantic viewer presenter', () => {
  test('formats selected link data for inspector rendering', () => {
    const source = readFileSync(
      new URL('../../submodules/ztk-ts/test/fixtures/arm_2dof.ztk', import.meta.url),
      'utf8',
    );
    const shell = createSemanticViewerShell(source, {
      selectedId: 'link:1:link-01',
    });

    const model = createViewerInspectorModel(shell);
    expect(model.title).toBe('link link#01');
    expect(model.subtitle).toBe('link / link:1:link-01');
    expect(model.fields).toEqual(
      expect.arrayContaining([
        { label: 'Joint Type', value: 'revolute' },
        { label: 'Joint DOF', value: '1' },
        { label: 'Joint Values (deg)', value: '[0]' },
        { label: 'Shapes', value: 'shape#02, shape_motor' },
      ]),
    );
    expect(model.jointControls).toEqual([
      {
        stableId: 'link:1:link-01',
        label: 'link link#01',
        jointType: 'revolute',
        jointBaseType: 'revolute',
        jointDOF: 1,
        values: [0],
        min: -180,
        max: 180,
        valueUnit: 'deg',
      },
    ]);
  });

  test('formats selected shape and runtime diagnostics', () => {
    let shell = createSemanticViewerShell(`
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
`);
    shell = selectSemanticViewerNode(shell, 'shape:0:unsupported-shape');

    expect(createViewerInspectorModel(shell)).toEqual({
      title: 'shape unsupported-shape',
      subtitle: 'shape / shape:0:unsupported-shape',
      fields: [
        { label: 'Name', value: 'unsupported-shape' },
        { label: 'Geometry', value: 'ellipsoid' },
        { label: 'Optic', value: '-' },
        { label: 'Transform', value: 'identity' },
        { label: 'Linked Links', value: 'base' },
      ],
      jointControls: [],
      diagnostics: ['Unsupported shape type: ellipsoid'],
    });

    expect(createViewerDiagnosticsModel(shell)).toEqual({
      semantic: [],
      runtime: ['unsupported-shape-type: Shape type "ellipsoid" is not supported by the roki-three adapter'],
    });
  });

  test('reflects updated joint values in inspector model', () => {
    const source = readFileSync(
      new URL('../../submodules/ztk-ts/test/fixtures/arm_2dof.ztk', import.meta.url),
      'utf8',
    );
    const shell = updateSemanticViewerJoint(
      createSemanticViewerShell(source, { selectedId: 'link:1:link-01' }),
      'link:1:link-01',
      [15],
    );

    const model = createViewerInspectorModel(shell);
    expect(model.fields).toEqual(expect.arrayContaining([{ label: 'Joint Values (deg)', value: '[15]' }]));
    expect(model.jointControls[0]?.values).toEqual([15]);
  });

  test('formats serializer outputs for save and export preview', () => {
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

    expect(createViewerSerializationModel(shell)).toEqual({
      entries: [
        {
          title: 'Preserve Source',
          layer: 'preserve-source',
          supported: true,
          text: expect.stringContaining('import: fixture.dae'),
          diagnostics: [],
        },
        {
          title: 'Normalize Semantic',
          layer: 'normalize-semantic',
          supported: true,
          text: expect.stringContaining('import: fixture.dae'),
          diagnostics: [],
        },
        {
          title: 'Materialize Runtime',
          layer: 'materialize-runtime',
          supported: false,
          text: 'Runtime materialization is not supported for the current semantic document.',
          diagnostics: [
            'unsupported-import-resolution: Built-in import materialization for "dae" is not implemented yet',
          ],
        },
      ],
    });
  });

  test('aggregates diagnostics into issues groups', () => {
    const shell = createSemanticViewerShell(`
[roki::chain]
name: demo

[zeo::shape]
name: imported-scene
import: fixture.dae

[zeo::shape]
name: shape-a
type: sphere
radius: 1

[roki::link]
name: base
jointtype: float
shape: shape-a
`);

    expect(createViewerIssuesModel(shell)).toEqual({
      totalCount: 2,
      groups: [
        { title: 'Semantic', items: [] },
        {
          title: 'Runtime',
          items: ['unsupported-shape-type: Shape type "" is not supported by the roki-three adapter'],
        },
        { title: 'Normalize', items: [] },
        {
          title: 'Materialize',
          items: ['unsupported-import-resolution: Built-in import materialization for "dae" is not implemented yet'],
        },
      ],
    });
  });
});
