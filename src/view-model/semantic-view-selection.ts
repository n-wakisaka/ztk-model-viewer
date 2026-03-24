import type { Object3D } from 'three';
import type {
  SemanticAdapterBinding,
  SemanticAdapterStableId,
  SemanticChainAdapterResult,
} from '../adapter/semantic-to-roki-three.js';
import type { SemanticViewerModel, ViewerSelectionSnapshot } from './semantic-view-model.js';

export type ViewerSelectionState = {
  selectedId?: SemanticAdapterStableId;
  selectedBinding?: SemanticAdapterBinding;
  selectedSnapshot?: ViewerSelectionSnapshot;
};

export function findNearestSemanticBinding(
  result: Pick<SemanticChainAdapterResult, 'metadata'>,
  object: Object3D | undefined,
): SemanticAdapterBinding | undefined {
  let current: Object3D | null | undefined = object;
  while (current) {
    const binding = result.metadata.getBinding(current);
    if (binding && (binding.kind === 'link' || binding.kind === 'shape')) {
      return binding;
    }
    current = current.parent;
  }
  return undefined;
}

export function createViewerSelectionState(
  viewerModel: Pick<SemanticViewerModel, 'getSelection'>,
  result: Pick<SemanticChainAdapterResult, 'metadata'>,
  selectedId?: SemanticAdapterStableId,
): ViewerSelectionState {
  if (!selectedId) {
    return {};
  }

  const selectedBinding = result.metadata.bindingsById.get(selectedId);
  const selectedSnapshot = viewerModel.getSelection(selectedId);
  if (!selectedBinding || !selectedSnapshot) {
    return {};
  }

  return {
    selectedId,
    selectedBinding,
    selectedSnapshot,
  };
}

export function createViewerSelectionStateFromObject(
  viewerModel: Pick<SemanticViewerModel, 'getSelection'>,
  result: Pick<SemanticChainAdapterResult, 'metadata'>,
  object: Object3D | undefined,
): ViewerSelectionState {
  const binding = findNearestSemanticBinding(result, object);
  if (!binding) {
    return {};
  }

  return createViewerSelectionState(viewerModel, result, binding.stableId);
}
