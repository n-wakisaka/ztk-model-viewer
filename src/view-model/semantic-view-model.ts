import type {
  SemanticAdapterBinding,
  SemanticAdapterStableId,
  SemanticChainAdapterDiagnostic,
  SemanticChainAdapterResult,
} from '../adapter/semantic-to-roki-three.js';

function radiansToDegrees(value: number): number {
  return (value * 180) / Math.PI;
}

function roundDisplayValue(value: number): number {
  return Math.abs(value) < 1e-9 ? 0 : Number(value.toFixed(6));
}

function displayJointValue(baseType: string | undefined, value: number): number {
  return baseType === 'revolute' ? roundDisplayValue(radiansToDegrees(value)) : value;
}

export type ViewerHierarchyNode = {
  stableId: SemanticAdapterStableId;
  kind: 'link' | 'shape';
  label: string;
  children: ViewerHierarchyNode[];
};

export type ViewerSelectionLinkSnapshot = {
  kind: 'link';
  stableId: SemanticAdapterStableId;
  label: string;
  name?: string;
  jointType?: string;
  jointBaseType?: string;
  jointDOF: number;
  jointDis: number[];
  motorName?: string;
  mass?: number;
  stuff?: string;
  com?: [number, number, number] | 'auto';
  inertia?: [number, number, number, number, number, number, number, number, number] | 'auto';
  parentName?: string;
  childNames: string[];
  shapeNames: string[];
  diagnostics: SemanticChainAdapterDiagnostic[];
};

export type ViewerSelectionShapeSnapshot = {
  kind: 'shape';
  stableId: SemanticAdapterStableId;
  label: string;
  name?: string;
  geometryType: string;
  opticName?: string;
  linkedLinkNames: string[];
  transformMode: string;
  diagnostics: SemanticChainAdapterDiagnostic[];
};

export type ViewerSelectionSnapshot = ViewerSelectionLinkSnapshot | ViewerSelectionShapeSnapshot;

export type ViewerJointControl = {
  stableId: SemanticAdapterStableId;
  label: string;
  jointType?: string;
  jointBaseType?: string;
  jointDOF: number;
  values: number[];
  min?: number;
  max?: number;
  valueUnit?: 'deg';
};

export type SemanticViewerModel = {
  hierarchy: ViewerHierarchyNode[];
  selections: ViewerSelectionSnapshot[];
  selectionsById: Map<SemanticAdapterStableId, ViewerSelectionSnapshot>;
  jointControls: ViewerJointControl[];
  jointControlsById: Map<SemanticAdapterStableId, ViewerJointControl>;
  getSelection(stableId: SemanticAdapterStableId): ViewerSelectionSnapshot | undefined;
  getJointControl(stableId: SemanticAdapterStableId): ViewerJointControl | undefined;
};

function createHierarchyLabel(binding: Extract<SemanticAdapterBinding, { kind: 'link' | 'shape' }>): string {
  if (binding.kind === 'link') {
    return binding.name ? `link ${binding.name}` : `link #${binding.index}`;
  }
  return binding.name ? `shape ${binding.name}` : `shape #${binding.index}`;
}

function diagnosticsFor(
  diagnostics: SemanticChainAdapterDiagnostic[],
  stableId: SemanticAdapterStableId,
): SemanticChainAdapterDiagnostic[] {
  return diagnostics.filter((diagnostic) => diagnostic.target?.stableId === stableId);
}

function createLinkSelection(
  binding: Extract<SemanticAdapterBinding, { kind: 'link' }>,
  bindingsById: Map<SemanticAdapterStableId, SemanticAdapterBinding>,
  diagnostics: SemanticChainAdapterDiagnostic[],
): ViewerSelectionLinkSnapshot {
  const jointDis = binding.runtimeObject.joint?.getDis();
  return {
    kind: 'link',
    stableId: binding.stableId,
    label: createHierarchyLabel(binding),
    name: binding.name,
    jointType: binding.semanticNode.jointType,
    jointBaseType: binding.semanticNode.joint.baseType,
    jointDOF: binding.runtimeObject.joint?.DOF ?? 0,
    jointDis: Array.isArray(jointDis)
      ? jointDis.map((value) => displayJointValue(binding.semanticNode.joint.baseType, value))
      : [],
    motorName: binding.motorName,
    mass: binding.semanticNode.massProperties.mass,
    stuff: binding.semanticNode.massProperties.stuff,
    com: binding.semanticNode.massProperties.com,
    inertia: binding.semanticNode.massProperties.inertia,
    parentName: binding.semanticNode.parentName,
    childNames: binding.childStableIds
      .map((stableId) => bindingsById.get(stableId))
      .filter((candidate): candidate is Extract<SemanticAdapterBinding, { kind: 'link' }> => candidate?.kind === 'link')
      .map((child) => child.name ?? child.stableId),
    shapeNames: binding.shapeStableIds
      .map((stableId) => bindingsById.get(stableId))
      .filter((candidate): candidate is Extract<SemanticAdapterBinding, { kind: 'shape' }> => candidate?.kind === 'shape')
      .map((shape) => shape.name ?? shape.stableId),
    diagnostics: diagnosticsFor(diagnostics, binding.stableId),
  };
}

function createJointControl(binding: Extract<SemanticAdapterBinding, { kind: 'link' }>): ViewerJointControl | undefined {
  const joint = binding.runtimeObject.joint;
  if (!joint || joint.DOF === 0) {
    return undefined;
  }

  const values = joint.getDis();
  return {
    stableId: binding.stableId,
    label: createHierarchyLabel(binding),
    jointType: binding.semanticNode.jointType,
    jointBaseType: binding.semanticNode.joint.baseType,
    jointDOF: joint.DOF,
    values: Array.isArray(values)
      ? values.map((value) => displayJointValue(binding.semanticNode.joint.baseType, value))
      : [],
    min: binding.semanticNode.joint.min,
    max: binding.semanticNode.joint.max,
    valueUnit: binding.semanticNode.joint.baseType === 'revolute' ? 'deg' : undefined,
  };
}

function createShapeSelection(
  binding: Extract<SemanticAdapterBinding, { kind: 'shape' }>,
  bindings: SemanticAdapterBinding[],
  diagnostics: SemanticChainAdapterDiagnostic[],
): ViewerSelectionShapeSnapshot {
  const linkedLinkNames = bindings
    .filter((candidate): candidate is Extract<SemanticAdapterBinding, { kind: 'link' }> => candidate.kind === 'link')
    .filter((link) => link.shapeStableIds.includes(binding.stableId as Extract<SemanticAdapterStableId, `shape:${string}`>))
    .map((link) => link.name ?? link.stableId);

  return {
    kind: 'shape',
    stableId: binding.stableId,
    label: createHierarchyLabel(binding),
    name: binding.name,
    geometryType: binding.semanticNode.geometry.type,
    opticName: binding.semanticNode.opticName,
    linkedLinkNames,
    transformMode: binding.semanticNode.transform.resolved.mode,
    diagnostics: diagnosticsFor(diagnostics, binding.stableId),
  };
}

function createShapeHierarchyNode(binding: Extract<SemanticAdapterBinding, { kind: 'shape' }>): ViewerHierarchyNode {
  return {
    stableId: binding.stableId,
    kind: 'shape',
    label: createHierarchyLabel(binding),
    children: [],
  };
}

function createLinkHierarchyNode(
  binding: Extract<SemanticAdapterBinding, { kind: 'link' }>,
  bindingsById: Map<SemanticAdapterStableId, SemanticAdapterBinding>,
): ViewerHierarchyNode {
  const shapeChildren = binding.shapeStableIds
    .map((stableId) => bindingsById.get(stableId))
    .filter((candidate): candidate is Extract<SemanticAdapterBinding, { kind: 'shape' }> => candidate?.kind === 'shape')
    .map(createShapeHierarchyNode);

  const linkChildren = binding.childStableIds
    .map((stableId) => bindingsById.get(stableId))
    .filter((candidate): candidate is Extract<SemanticAdapterBinding, { kind: 'link' }> => candidate?.kind === 'link')
    .map((child) => createLinkHierarchyNode(child, bindingsById));

  return {
    stableId: binding.stableId,
    kind: 'link',
    label: createHierarchyLabel(binding),
    children: [...shapeChildren, ...linkChildren],
  };
}

export function createSemanticViewerModel(result: SemanticChainAdapterResult): SemanticViewerModel {
  const linkBindings = result.metadata.bindings.filter(
    (binding): binding is Extract<SemanticAdapterBinding, { kind: 'link' }> => binding.kind === 'link',
  );
  const shapeBindings = result.metadata.bindings.filter(
    (binding): binding is Extract<SemanticAdapterBinding, { kind: 'shape' }> => binding.kind === 'shape',
  );

  const hierarchy = linkBindings
    .filter((binding) => binding.parentStableId === undefined)
    .map((binding) => createLinkHierarchyNode(binding, result.metadata.bindingsById));

  const selections: ViewerSelectionSnapshot[] = [
    ...linkBindings.map((binding) =>
      createLinkSelection(binding, result.metadata.bindingsById, result.diagnostics),
    ),
    ...shapeBindings.map((binding) =>
      createShapeSelection(binding, result.metadata.bindings, result.diagnostics),
    ),
  ];

  const selectionsById = new Map(selections.map((selection) => [selection.stableId, selection]));
  const jointControls = linkBindings
    .map(createJointControl)
    .filter((control): control is ViewerJointControl => control !== undefined);
  const jointControlsById = new Map(jointControls.map((control) => [control.stableId, control]));

  return {
    hierarchy,
    selections,
    selectionsById,
    jointControls,
    jointControlsById,
    getSelection: (stableId: SemanticAdapterStableId) => selectionsById.get(stableId),
    getJointControl: (stableId: SemanticAdapterStableId) => jointControlsById.get(stableId),
  };
}
