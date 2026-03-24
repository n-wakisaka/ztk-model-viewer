import { readFileSync } from 'node:fs';
import { parseZtk, resolveZtk } from '../../submodules/ztk-ts/src/index.js';
import { buildChainFromSemantic } from '../../src/adapter/semantic-to-roki-three.js';
import { createSemanticViewerModel } from '../../src/view-model/semantic-view-model.js';

describe('createSemanticViewerModel', () => {
  test('builds link and shape hierarchy for inspector-driven UI', () => {
    const source = readFileSync(
      new URL('../../submodules/ztk-ts/test/fixtures/arm_2dof.ztk', import.meta.url),
      'utf8',
    );
    const semantic = resolveZtk(parseZtk(source));
    const adapterResult = buildChainFromSemantic(semantic);
    const viewerModel = createSemanticViewerModel(adapterResult);

    expect(viewerModel.hierarchy).toEqual([
      {
        stableId: 'link:0:link-00',
        kind: 'link',
        label: 'link link#00',
        children: [
          {
            stableId: 'shape:0:shape-base',
            kind: 'shape',
            label: 'shape shape_base',
            children: [],
          },
          {
            stableId: 'shape:3:shape-motor-base',
            kind: 'shape',
            label: 'shape shape_motor_base',
            children: [],
          },
          {
            stableId: 'link:1:link-01',
            kind: 'link',
            label: 'link link#01',
            children: [
              {
                stableId: 'shape:2:shape-02',
                kind: 'shape',
                label: 'shape shape#02',
                children: [],
              },
              {
                stableId: 'shape:4:shape-motor',
                kind: 'shape',
                label: 'shape shape_motor',
                children: [],
              },
              {
                stableId: 'link:2:link-02',
                kind: 'link',
                label: 'link link#02',
                children: [
                  {
                    stableId: 'shape:1:shape-01',
                    kind: 'shape',
                    label: 'shape shape#01',
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    ]);
  });

  test('builds selection snapshots for links and shapes', () => {
    const adapterResult = buildChainFromSemantic(
      resolveZtk(
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
mass: 2
stuff: payload
frame: {
 1, 0, 0, 1
 0, 1, 0, 0
 0, 0, 1, 0
}
`),
      ),
    );

    const viewerModel = createSemanticViewerModel(adapterResult);

    expect(viewerModel.getSelection('link:1:slider')).toEqual({
      kind: 'link',
      stableId: 'link:1:slider',
      label: 'link slider',
      name: 'slider',
      jointType: 'cylindrical',
      jointBaseType: 'cylindrical',
      jointDOF: 0,
      jointDis: [],
      motorName: undefined,
      mass: 2,
      stuff: 'payload',
      com: undefined,
      inertia: undefined,
      parentName: 'base',
      childNames: [],
      shapeNames: [],
      diagnostics: [
        expect.objectContaining({
          code: 'unsupported-joint-type',
          target: {
            kind: 'link',
            stableId: 'link:1:slider',
            name: 'slider',
          },
        }),
      ],
    });

    expect(viewerModel.jointControls).toEqual([
      {
        stableId: 'link:0:base',
        label: 'link base',
        jointType: 'float',
        jointBaseType: 'float',
        jointDOF: 6,
        values: [0, 0, 0, 0, 0, 0],
        min: undefined,
        max: undefined,
      },
    ]);

    expect(viewerModel.getSelection('shape:0:unsupported-shape')).toEqual({
      kind: 'shape',
      stableId: 'shape:0:unsupported-shape',
      label: 'shape unsupported-shape',
      name: 'unsupported-shape',
      geometryType: 'ellipsoid',
      opticName: undefined,
      linkedLinkNames: ['base'],
      transformMode: 'identity',
      diagnostics: [
        expect.objectContaining({
          code: 'unsupported-shape-type',
          target: {
            kind: 'shape',
            stableId: 'shape:0:unsupported-shape',
            name: 'unsupported-shape',
          },
        }),
      ],
    });
  });
});
