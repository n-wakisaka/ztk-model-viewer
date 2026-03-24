import { Object3D } from 'three';
import { readFileSync } from 'node:fs';
import { parseZtk, resolveZtk } from '../../submodules/ztk-ts/src/index.js';
import { buildChainFromSemantic } from '../../src/adapter/semantic-to-roki-three.js';
import { createViewerSelectionState, createViewerSelectionStateFromObject } from '../../src/view-model/semantic-view-selection.js';
import { createSemanticViewerModel } from '../../src/view-model/semantic-view-model.js';

describe('semantic view selection helpers', () => {
  test('creates selection state from stable id for hierarchy selection', () => {
    const source = readFileSync(
      new URL('../../submodules/ztk-ts/test/fixtures/arm_2dof.ztk', import.meta.url),
      'utf8',
    );
    const result = buildChainFromSemantic(resolveZtk(parseZtk(source)));
    const viewerModel = createSemanticViewerModel(result);

    expect(createViewerSelectionState(viewerModel, result, 'link:1:link-01')).toEqual({
      selectedId: 'link:1:link-01',
      selectedBinding: expect.objectContaining({
        kind: 'link',
        stableId: 'link:1:link-01',
      }),
      selectedSnapshot: expect.objectContaining({
        kind: 'link',
        stableId: 'link:1:link-01',
        shapeNames: ['shape#02', 'shape_motor'],
        jointDOF: 1,
        jointDis: [0],
      }),
    });
  });

  test('resolves nearest semantic binding from picked object ancestry', () => {
    const source = readFileSync(
      new URL('../../submodules/ztk-ts/test/fixtures/arm_2dof.ztk', import.meta.url),
      'utf8',
    );
    const result = buildChainFromSemantic(resolveZtk(parseZtk(source)));
    const viewerModel = createSemanticViewerModel(result);

    const link1 = result.chain.links[1];
    const shapeMesh = link1.children.find((child) => child.name === 'shape#02');
    expect(shapeMesh).toBeDefined();

    const nestedPick = new Object3D();
    shapeMesh!.add(nestedPick);

    expect(createViewerSelectionStateFromObject(viewerModel, result, nestedPick)).toEqual({
      selectedId: 'shape:2:shape-02',
      selectedBinding: expect.objectContaining({
        kind: 'shape',
        stableId: 'shape:2:shape-02',
      }),
      selectedSnapshot: expect.objectContaining({
        kind: 'shape',
        stableId: 'shape:2:shape-02',
        linkedLinkNames: ['link#01'],
      }),
    });
  });

  test('ignores objects that are not attached to a semantic binding', () => {
    const source = readFileSync(
      new URL('../../submodules/ztk-ts/test/fixtures/arm_2dof.ztk', import.meta.url),
      'utf8',
    );
    const result = buildChainFromSemantic(resolveZtk(parseZtk(source)));
    const viewerModel = createSemanticViewerModel(result);

    expect(createViewerSelectionState(viewerModel, result, 'shape:999:missing')).toEqual({});
    expect(createViewerSelectionStateFromObject(viewerModel, result, new Object3D())).toEqual({});
  });
});
