import type { Object3D } from 'three';
import {
  analyzeSemanticZtkMaterializedRuntime,
  parseZtk,
  resolveZtk,
  serializeSemanticZtkMaterializedRuntime,
  serializeSemanticZtkNormalized,
  serializeSemanticZtkPreservingSource,
  type ZtkDiagnostic,
  type ZtkMaterializedRuntimeSerialization,
  type ZtkMaterializedRuntimeSerializationAnalysis,
  type ZtkNormalizedSemanticSerialization,
  type ZtkSemanticDocument,
  type ZtkSourcePreservingSemanticSerialization,
} from '../../submodules/ztk-ts/src/index.js';
import {
  buildChainFromSemantic,
  type SemanticAdapterStableId,
  type SemanticChainAdapterDiagnostic,
  type SemanticChainAdapterResult,
} from '../adapter/semantic-to-roki-three.js';
import {
  createViewerSelectionState,
  createViewerSelectionStateFromObject,
  type ViewerSelectionState,
} from './semantic-view-selection.js';
import { createSemanticViewerModel, type SemanticViewerModel } from './semantic-view-model.js';

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function clipJointValue(value: number, min: number | undefined, max: number | undefined): number {
  if (min !== undefined && value < min) {
    return min;
  }
  if (max !== undefined && value > max) {
    return max;
  }
  return value;
}

export type SemanticViewerShellDiagnostics = {
  semantic: ZtkDiagnostic[];
  runtime: SemanticChainAdapterDiagnostic[];
};

export type SemanticViewerShellState = {
  source: string;
  semanticDocument: ZtkSemanticDocument;
  serializers: {
    preserveSource: ZtkSourcePreservingSemanticSerialization;
    normalized: ZtkNormalizedSemanticSerialization;
    materializedRuntime: ZtkMaterializedRuntimeSerialization;
    materializedRuntimeAnalysis: ZtkMaterializedRuntimeSerializationAnalysis;
  };
  adapterResult: SemanticChainAdapterResult;
  viewerModel: SemanticViewerModel;
  selection: ViewerSelectionState;
  diagnostics: SemanticViewerShellDiagnostics;
};

function withSelection(
  state: Omit<SemanticViewerShellState, 'selection'>,
  selectedId?: SemanticAdapterStableId,
): SemanticViewerShellState {
  return {
    ...state,
    selection: createViewerSelectionState(state.viewerModel, state.adapterResult, selectedId),
  };
}

export function createSemanticViewerShell(
  source: string,
  options?: {
    selectedId?: SemanticAdapterStableId;
  },
): SemanticViewerShellState {
  const semanticDocument = resolveZtk(parseZtk(source));
  const preserveSource = serializeSemanticZtkPreservingSource(semanticDocument);
  const normalized = serializeSemanticZtkNormalized(semanticDocument);
  const materializedRuntimeAnalysis = analyzeSemanticZtkMaterializedRuntime(semanticDocument);
  const materializedRuntime = serializeSemanticZtkMaterializedRuntime(semanticDocument);
  const adapterResult = buildChainFromSemantic(semanticDocument);
  const viewerModel = createSemanticViewerModel(adapterResult);

  return withSelection(
    {
      source,
      semanticDocument,
      serializers: {
        preserveSource,
        normalized,
        materializedRuntime,
        materializedRuntimeAnalysis,
      },
      adapterResult,
      viewerModel,
      diagnostics: {
        semantic: semanticDocument.diagnostics,
        runtime: adapterResult.diagnostics,
      },
    },
    options?.selectedId,
  );
}

export function selectSemanticViewerNode(
  state: SemanticViewerShellState,
  selectedId?: SemanticAdapterStableId,
): SemanticViewerShellState {
  return withSelection(state, selectedId);
}

export function selectSemanticViewerObject(
  state: SemanticViewerShellState,
  object: Object3D | undefined,
): SemanticViewerShellState {
  return {
    ...state,
    selection: createViewerSelectionStateFromObject(state.viewerModel, state.adapterResult, object),
  };
}

function rebuildViewerModel(
  state: SemanticViewerShellState,
  selectedId = state.selection.selectedId,
): SemanticViewerShellState {
  const viewerModel = createSemanticViewerModel(state.adapterResult);
  return withSelection(
    {
      ...state,
      viewerModel,
    },
    selectedId,
  );
}

export function updateSemanticViewerJoint(
  state: SemanticViewerShellState,
  stableId: SemanticAdapterStableId,
  values: number[],
): SemanticViewerShellState {
  const binding = state.adapterResult.metadata.bindingsById.get(stableId);
  if (!binding || binding.kind !== 'link' || !binding.runtimeObject.joint) {
    return state;
  }

  if (values.length !== binding.runtimeObject.joint.DOF) {
    return state;
  }

  const jointBaseType = binding.semanticNode.joint.baseType;
  const clippedValues = values.map((value) =>
    clipJointValue(value, binding.semanticNode.joint.min, binding.semanticNode.joint.max),
  );
  const runtimeValues =
    jointBaseType === 'revolute'
      ? clippedValues.map((value) => degreesToRadians(value))
      : clippedValues;

  binding.runtimeObject.joint.setDis(runtimeValues);
  state.adapterResult.chain.links.forEach((link) => link.updateFrame());
  return rebuildViewerModel(state, stableId);
}
