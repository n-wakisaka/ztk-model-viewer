import { getSections, type ZtkSection } from '../../submodules/ztk-ts/src/index.js';
import type { SemanticViewerShellState } from '../view-model/semantic-viewer-shell.js';
import type { ViewerJointControl, ViewerSelectionSnapshot } from '../view-model/semantic-view-model.js';

export type ViewerInspectorField = {
  label: string;
  value: string;
};

export type ViewerInspectorModel = {
  title: string;
  subtitle: string;
  fields: ViewerInspectorField[];
  jointControls: ViewerJointControl[];
  diagnostics: string[];
};

export type ViewerDiagnosticsModel = {
  semantic: string[];
  runtime: string[];
};

export type ViewerIssuesGroup = {
  title: string;
  items: string[];
};

export type ViewerIssuesModel = {
  totalCount: number;
  groups: ViewerIssuesGroup[];
};

export type ViewerSourceModel = {
  text: string;
  highlightLineStart?: number;
  highlightLineEnd?: number;
};

function isSameSection(a: ZtkSection, b: ZtkSection): boolean {
  return a.tag === b.tag && a.nodes[0] === b.nodes[0] && a.nodes[a.nodes.length - 1] === b.nodes[b.nodes.length - 1];
}

function sectionToRawText(section: ZtkSection): string {
  const lines: string[] = [];
  if (section.tag) {
    lines.push(section.tag.raw);
  }
  for (const node of section.nodes) {
    lines.push(...node.rawLines);
  }
  return lines.join('\n');
}

function findNthOccurrence(text: string, snippet: string, occurrenceIndex: number): number {
  if (!snippet) {
    return -1;
  }

  let fromIndex = 0;
  for (let index = 0; index <= occurrenceIndex; index += 1) {
    const found = text.indexOf(snippet, fromIndex);
    if (found < 0) {
      return -1;
    }
    if (index === occurrenceIndex) {
      return found;
    }
    fromIndex = found + snippet.length;
  }

  return -1;
}

function collectUnknownSemanticIssues(shell: SemanticViewerShellState): string[] {
  const items: string[] = [];
  const pushUnknownKeys = (
    tag: string,
    unknownKeys: Array<{
      key: string;
    }>,
  ): void => {
    for (const node of unknownKeys) {
      items.push(`unknown-key: Unknown key "${node.key}" in [${tag}] is preserved but ignored`);
    }
  };

  if (shell.semanticDocument.chain) {
    pushUnknownKeys(shell.semanticDocument.chain.tag, shell.semanticDocument.chain.unknownKeys);
  }
  if (shell.semanticDocument.chainInit) {
    pushUnknownKeys(shell.semanticDocument.chainInit.tag, shell.semanticDocument.chainInit.unknownKeys);
  }
  if (shell.semanticDocument.chainIk) {
    pushUnknownKeys(shell.semanticDocument.chainIk.tag, shell.semanticDocument.chainIk.unknownKeys);
  }

  for (const motor of shell.semanticDocument.motors) {
    pushUnknownKeys(motor.tag, motor.unknownKeys);
  }
  for (const contact of shell.semanticDocument.contacts) {
    pushUnknownKeys(contact.tag, contact.unknownKeys);
  }
  for (const link of shell.semanticDocument.links) {
    pushUnknownKeys(link.tag, link.unknownKeys);
  }
  for (const optic of shell.semanticDocument.optics) {
    pushUnknownKeys(optic.tag, optic.unknownKeys);
  }
  for (const texture of shell.semanticDocument.textures) {
    pushUnknownKeys(texture.tag, texture.unknownKeys);
  }
  for (const shape of shell.semanticDocument.shapes) {
    pushUnknownKeys(shape.tag, shape.unknownKeys);
  }
  for (const map of shell.semanticDocument.maps) {
    pushUnknownKeys(map.tag, map.unknownKeys);
  }
  for (const section of shell.semanticDocument.unknownSections) {
    items.push(`unknown-section: Unknown section [${section.tag?.name ?? '(untagged)'}] is preserved but ignored`);
  }

  return items;
}

export type ViewerSerializationModelEntry = {
  title: string;
  layer: 'preserve-source' | 'normalize-semantic' | 'materialize-runtime';
  supported: boolean;
  text: string;
  diagnostics: string[];
};

export type ViewerSerializationModel = {
  entries: ViewerSerializationModelEntry[];
};

function formatNumber(value: number | undefined): string {
  return value === undefined ? '-' : String(value);
}

function formatVector(value: number[] | 'auto' | undefined): string {
  if (value === 'auto') {
    return value;
  }
  return value ? `[${value.join(', ')}]` : '-';
}

function formatNames(value: string[]): string {
  return value.length > 0 ? value.join(', ') : '-';
}

function formatSelectionFields(selection: ViewerSelectionSnapshot): ViewerInspectorField[] {
  if (selection.kind === 'link') {
    return [
      { label: 'Name', value: selection.name ?? '-' },
      { label: 'Joint Type', value: selection.jointType ?? '-' },
      { label: 'Joint Base', value: selection.jointBaseType ?? '-' },
      { label: 'Joint DOF', value: String(selection.jointDOF) },
      {
        label: selection.jointBaseType === 'revolute' ? 'Joint Values (deg)' : 'Joint Values',
        value: formatVector(selection.jointDis),
      },
      { label: 'Motor', value: selection.motorName ?? '-' },
      { label: 'Mass', value: formatNumber(selection.mass) },
      { label: 'Stuff', value: selection.stuff ?? '-' },
      { label: 'COM', value: formatVector(selection.com) },
      { label: 'Inertia', value: formatVector(selection.inertia) },
      { label: 'Parent', value: selection.parentName ?? '-' },
      { label: 'Children', value: formatNames(selection.childNames) },
      { label: 'Shapes', value: formatNames(selection.shapeNames) },
    ];
  }

  return [
    { label: 'Name', value: selection.name ?? '-' },
    { label: 'Geometry', value: selection.geometryType },
    { label: 'Optic', value: selection.opticName ?? '-' },
    { label: 'Transform', value: selection.transformMode },
    { label: 'Linked Links', value: formatNames(selection.linkedLinkNames) },
  ];
}

export function createViewerInspectorModel(shell: SemanticViewerShellState): ViewerInspectorModel {
  const selection = shell.selection.selectedSnapshot;
  if (!selection) {
    return {
      title: 'No Selection',
      subtitle: 'Hierarchy か canvas から選択してください',
      fields: [],
      jointControls: [],
      diagnostics: [],
    };
  }

  const jointControl = selection.kind === 'link' ? shell.viewerModel.getJointControl(selection.stableId) : undefined;
  return {
    title: selection.label,
    subtitle: `${selection.kind} / ${selection.stableId}`,
    fields: formatSelectionFields(selection),
    jointControls: jointControl ? [jointControl] : [],
    diagnostics: selection.diagnostics.map((diagnostic) => diagnostic.summary),
  };
}

export function createViewerDiagnosticsModel(shell: SemanticViewerShellState): ViewerDiagnosticsModel {
  return {
    semantic: shell.diagnostics.semantic.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`),
    runtime: shell.diagnostics.runtime.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`),
  };
}

export function createViewerSerializationModel(shell: SemanticViewerShellState): ViewerSerializationModel {
  return {
    entries: [
      {
        title: 'Preserve Source',
        layer: 'preserve-source',
        supported: true,
        text: shell.serializers.preserveSource.text,
        diagnostics: [],
      },
      {
        title: 'Normalize Semantic',
        layer: 'normalize-semantic',
        supported: true,
        text: shell.serializers.normalized.text,
        diagnostics: shell.serializers.normalized.diagnostics.map(
          (diagnostic) => `${diagnostic.code}: ${diagnostic.message}`,
        ),
      },
      {
        title: 'Materialize Runtime',
        layer: 'materialize-runtime',
        supported: shell.serializers.materializedRuntime.supported,
        text:
          shell.serializers.materializedRuntime.text ??
          'Runtime materialization is not supported for the current semantic document.',
        diagnostics: shell.serializers.materializedRuntime.diagnostics.map(
          (diagnostic) => `${diagnostic.code}: ${diagnostic.message}`,
        ),
      },
    ],
  };
}

export function createViewerIssuesModel(shell: SemanticViewerShellState): ViewerIssuesModel {
  const diagnostics = createViewerDiagnosticsModel(shell);
  const serialization = createViewerSerializationModel(shell);
  const groups: ViewerIssuesGroup[] = [
    {
      title: 'Semantic',
      items: [...diagnostics.semantic, ...collectUnknownSemanticIssues(shell)],
    },
    {
      title: 'Runtime',
      items: diagnostics.runtime,
    },
    {
      title: 'Normalize',
      items: serialization.entries[1]?.diagnostics ?? [],
    },
    {
      title: 'Materialize',
      items: serialization.entries[2]?.diagnostics ?? [],
    },
  ];

  return {
    totalCount: groups.reduce((count, group) => count + group.items.length, 0),
    groups,
  };
}

export function createViewerSourceModel(
  shell: SemanticViewerShellState,
  stableId = shell.selection.selectedId,
): ViewerSourceModel {
  const selectedBinding = stableId ? shell.adapterResult.metadata.bindingsById.get(stableId) : undefined;
  if (!selectedBinding || (selectedBinding.kind !== 'link' && selectedBinding.kind !== 'shape')) {
    return { text: shell.source };
  }

  const targetSection = selectedBinding.semanticNode.section;
  const sections = getSections(shell.semanticDocument.source);
  const targetIndex = sections.findIndex((section) => isSameSection(section, targetSection));
  if (targetIndex < 0) {
    return { text: shell.source };
  }

  const snippet = sectionToRawText(targetSection);
  const sameSnippetBefore = sections
    .slice(0, targetIndex)
    .filter((section) => sectionToRawText(section) === snippet).length;
  const highlightStart = findNthOccurrence(shell.source, snippet, sameSnippetBefore);
  if (highlightStart < 0) {
    return { text: shell.source };
  }
  const highlightEnd = highlightStart + snippet.length;
  const highlightLineStart = shell.source.slice(0, highlightStart).split('\n').length - 1;
  const highlightLineEnd = shell.source.slice(0, highlightEnd).split('\n').length - 1;

  return {
    text: shell.source,
    highlightLineStart,
    highlightLineEnd,
  };
}
