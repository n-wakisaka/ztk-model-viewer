import { useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AmbientLight,
  Color,
  DirectionalLight,
  GridHelper,
  Object3D,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector2,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  createViewerInspectorModel,
  createViewerIssuesModel,
  createViewerSerializationModel,
  createViewerSourceModel,
} from './semantic-viewer-presenter.js';
import {
  createSemanticViewerShell,
  selectSemanticViewerNode,
  selectSemanticViewerObject,
  updateSemanticViewerJoint,
  type SemanticViewerShellState,
} from '../view-model/semantic-viewer-shell.js';
import type { SemanticAdapterStableId } from '../adapter/semantic-to-roki-three.js';
import type { ViewerHierarchyNode } from '../view-model/semantic-view-model.js';

const FIXTURE_PATH = '/submodules/ztk-ts/test/fixtures/arm_2dof.ztk';

type RightPanelTab = 'hierarchy' | 'issues';
type SerializationTab = 'preserve-source' | 'normalize-semantic' | 'materialize-runtime';

type ViewerSceneContext = {
  scene: Scene;
  camera: PerspectiveCamera;
  renderer: WebGLRenderer;
  controls: OrbitControls;
  raycaster: Raycaster;
  pointer: Vector2;
  animationFrame: number;
  resizeObserver?: ResizeObserver;
};

bootstrap();

function bootstrap(): void {
  const rootElement = document.getElementById('app');
  if (!rootElement) {
    throw new Error('Missing #app root');
  }

  createRoot(rootElement).render(<ViewerApp />);
}

function ViewerApp() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState('');
  const [shell, setShell] = useState<SemanticViewerShellState>();
  const [status, setStatus] = useState('Loading fixture...');
  const [activeRightTab, setActiveRightTab] = useState<RightPanelTab>('hierarchy');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [expandedLinkIds, setExpandedLinkIds] = useState<SemanticAdapterStableId[]>([]);
  const [pinnedLinkIds, setPinnedLinkIds] = useState<SemanticAdapterStableId[]>([]);
  const [activeSerializationTab, setActiveSerializationTab] =
    useState<SerializationTab>('normalize-semantic');
  const [sourceJumpLine, setSourceJumpLine] = useState<number>();
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  function jumpToSourceForStableId(stableId: SemanticAdapterStableId): void {
    setShell((current) => (current ? selectSemanticViewerNode(current, stableId) : current));
    if (shell) {
      const model = createViewerSourceModel(shell, stableId);
      setSourceJumpLine(model.highlightLineStart);
    }
  }

  useEffect(() => {
    void loadAndApplyFixture();
  }, []);

  useEffect(() => {
    const selectedId = shell?.selection.selectedId;
    if (!selectedId || !selectedId.startsWith('shape:')) {
      return;
    }

    const ownerLinkId = collectOwnerLinkId(shell.viewerModel.hierarchy, selectedId);
    if (!ownerLinkId) {
      return;
    }

    setExpandedLinkIds((current) => {
      const next = new Set(pinnedLinkIds);
      next.add(ownerLinkId);
      return [...next];
    });
  }, [pinnedLinkIds, shell?.selection.selectedId, shell?.viewerModel.hierarchy]);

  const inspectorModel = useMemo(
    () =>
      shell
        ? createViewerInspectorModel(shell)
        : {
            title: 'No Selection',
            subtitle: 'ZTK を読み込むか適用してください',
            fields: [],
            jointControls: [],
            diagnostics: [],
          },
    [shell],
  );
  const issuesModel = useMemo(
    () => (shell ? createViewerIssuesModel(shell) : { totalCount: 0, groups: [] }),
    [shell],
  );
  const serializationModel = useMemo(
    () => (shell ? createViewerSerializationModel(shell) : { entries: [] }),
    [shell],
  );
  const sourceModel = useMemo(
    () => (shell && source === shell.source ? createViewerSourceModel(shell) : { text: source }),
    [shell, source],
  );
  const activeSerialization =
    serializationModel.entries.find((entry) => entry.layer === activeSerializationTab) ??
    serializationModel.entries[0];

  async function loadAndApplyFixture(): Promise<void> {
    try {
      setStatus('Loading fixture...');
      const nextSource = await loadFixtureSource();
      setSource(nextSource);
      setShell(createSemanticViewerShell(nextSource));
      setStatus('Fixture loaded');
    } catch (error) {
      setStatus(formatError('Fixture load failed', error));
    }
  }

  function applySource(nextSource: string, message = 'Source applied'): void {
    try {
      setShell((current) =>
        createSemanticViewerShell(nextSource, {
          selectedId: current?.selection.selectedId,
        }),
      );
      setSource(nextSource);
      setStatus(message);
    } catch (error) {
      setStatus(formatError('Source apply failed', error));
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    void file
      .text()
      .then((text) => {
        applySource(text, `Loaded ${file.name}`);
      })
      .catch((error) => {
        setStatus(formatError(`Failed to read ${file.name}`, error));
      })
      .finally(() => {
        event.target.value = '';
      });
  }

  const viewportStatus = shell
    ? `${shell.adapterResult.chain.links.length} links / ${issuesModel.totalCount} issues`
    : status;

  return (
    <div className="viewerShell">
      <header className="topbar">
        <div>
          <p className="eyebrow">ZTK Source / Hierarchy / Viewport</p>
          <h1>ZTK Structure Viewer</h1>
        </div>
        <div className="toolbar">
          <span className={`issueBadge ${issuesModel.totalCount > 0 ? 'hasIssues' : ''}`}>
            {issuesModel.totalCount} issues
          </span>
          <button type="button" onClick={() => void loadAndApplyFixture()}>
            Load Sample
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()}>
            Open File
          </button>
          <button type="button" onClick={() => setIsHelpOpen(true)}>
            Help
          </button>
          <input
            ref={fileInputRef}
            className="hiddenInput"
            type="file"
            accept=".ztk,text/plain"
            onChange={handleFileChange}
          />
        </div>
      </header>

      <main className="workspace">
        <section className="column leftColumn">
          <section className="panel sourcePanel">
            <div className="panelHeader">
              <h2>ZTK Source</h2>
              <div className="sourceHeaderActions">
                <span>{status}</span>
                <button type="button" className="panelActionButton" onClick={() => applySource(source)}>
                  Apply Source
                </button>
              </div>
            </div>
            <div className="panelBody sourceBody">
              <SourceEditor
                text={source}
                highlightLineStart={sourceModel.highlightLineStart}
                highlightLineEnd={sourceModel.highlightLineEnd}
                jumpLine={sourceJumpLine}
                onChange={setSource}
              />
            </div>
          </section>

          <section className={`panel previewPanel ${isPreviewOpen ? 'isOpen' : 'isClosed'}`}>
            <div className="panelHeader">
              <h2>Save / Export Preview</h2>
              <button type="button" className="panelToggle" onClick={() => setIsPreviewOpen((open) => !open)}>
                {isPreviewOpen ? 'Hide' : 'Show'}
              </button>
            </div>
            {isPreviewOpen && activeSerialization ? (
              <div className="panelBody previewBody">
                <div className="tabRow">
                  {serializationModel.entries.map((entry) => (
                    <button
                      key={entry.layer}
                      type="button"
                      className={`tabButton ${entry.layer === activeSerialization.layer ? 'isActive' : ''}`}
                      onClick={() => setActiveSerializationTab(entry.layer)}
                    >
                      {entry.title}
                    </button>
                  ))}
                </div>
                <div className="previewMeta">
                  <span className={`previewState ${activeSerialization.supported ? '' : 'isUnsupported'}`}>
                    {activeSerialization.supported ? 'ready' : 'unsupported'}
                  </span>
                </div>
                <textarea readOnly spellCheck={false} value={activeSerialization.text} />
                <IssueList items={activeSerialization.diagnostics} emptyLabel="none" />
              </div>
            ) : null}
          </section>
        </section>

        <section className="panel viewportPanel">
          <div className="panelHeader">
            <h2>Viewport</h2>
            <span>{viewportStatus}</span>
          </div>
          <div className="panelBody viewportBody">
            <ThreeViewport
              shell={shell}
              onPickObject={(object) =>
                setShell((current) => (current ? selectSemanticViewerObject(current, object) : current))
              }
              onJumpToSource={(stableId) => jumpToSourceForStableId(stableId)}
            />
          </div>
        </section>

        <section className="column rightColumn">
          <section className="panel topRightPanel">
            <div className="panelHeader">
              <h2>{activeRightTab === 'hierarchy' ? 'Hierarchy' : 'Issues'}</h2>
              <div className="tabRow compact">
                <button
                  type="button"
                  className={`tabButton ${activeRightTab === 'hierarchy' ? 'isActive' : ''}`}
                  onClick={() => setActiveRightTab('hierarchy')}
                >
                  Hierarchy
                </button>
                <button
                  type="button"
                  className={`tabButton ${activeRightTab === 'issues' ? 'isActive' : ''}`}
                  onClick={() => setActiveRightTab('issues')}
                >
                  Issues
                </button>
              </div>
            </div>
            <div className="panelBody sidePanelBody">
              {activeRightTab === 'hierarchy' ? (
                <HierarchyTree
                  nodes={shell?.viewerModel.hierarchy ?? []}
                  selectedId={shell?.selection.selectedId}
                  expandedLinkIds={expandedLinkIds}
                  onSelectLink={(stableId) => {
                    const selectedId = shell?.selection.selectedId;
                    const selectedShapeOwnerId =
                      selectedId && selectedId.startsWith('shape:')
                        ? collectOwnerLinkId(shell?.viewerModel.hierarchy ?? [], selectedId)
                        : undefined;
                    setExpandedLinkIds((current) => {
                      const isExpanded = current.includes(stableId);
                      const isPinned = pinnedLinkIds.includes(stableId);
                      if (isExpanded) {
                        if (isPinned) {
                          return current.filter(
                            (candidate) => pinnedLinkIds.includes(candidate) || candidate === stableId,
                          );
                        }
                        if (selectedShapeOwnerId === stableId) {
                          return current;
                        }
                        return current.filter((candidate) => candidate !== stableId);
                      }
                      return [...pinnedLinkIds.filter((candidate) => candidate !== stableId), stableId];
                    });
                    setShell((current) => (current ? selectSemanticViewerNode(current, stableId) : current));
                  }}
                  onSelectShape={(stableId) =>
                    setShell((current) => (current ? selectSemanticViewerNode(current, stableId) : current))
                  }
                  onJumpToSource={(stableId) => jumpToSourceForStableId(stableId)}
                  pinnedLinkIds={pinnedLinkIds}
                  onTogglePin={(stableId) => {
                    const isPinned = pinnedLinkIds.includes(stableId);
                    if (isPinned) {
                      setPinnedLinkIds((current) => current.filter((candidate) => candidate !== stableId));
                      setExpandedLinkIds((current) => current.filter((candidate) => candidate !== stableId));
                      return;
                    }
                    setPinnedLinkIds((current) => [...current, stableId]);
                    setExpandedLinkIds((current) =>
                      current.includes(stableId) ? current : [...current, stableId],
                    );
                  }}
                />
              ) : (
                <IssuesPanel issuesModel={issuesModel} />
              )}
            </div>
          </section>

          <section className="panel inspectorPanel">
            <div className="panelHeader">
              <h2>Inspector</h2>
            </div>
            <div className="panelBody sidePanelBody">
              <InspectorPanel
                title={inspectorModel.title}
                subtitle={inspectorModel.subtitle}
                fields={inspectorModel.fields}
                jointControls={inspectorModel.jointControls}
                diagnostics={inspectorModel.diagnostics}
                onJointChange={(stableId, values) =>
                  setShell((current) =>
                    current ? updateSemanticViewerJoint(current, stableId, values) : current,
                  )
                }
              />
            </div>
          </section>
        </section>
      </main>

      {isHelpOpen ? <HelpModal onClose={() => setIsHelpOpen(false)} /> : null}
    </div>
  );
}

function ThreeViewport({
  shell,
  onPickObject,
  onJumpToSource,
}: {
  shell: SemanticViewerShellState | undefined;
  onPickObject: (object: Object3D | undefined) => void;
  onJumpToSource: (stableId: SemanticAdapterStableId) => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contextRef = useRef<ViewerSceneContext | null>(null);
  const latestShellRef = useRef<SemanticViewerShellState | undefined>(undefined);
  const latestOnPickRef = useRef(onPickObject);
  const latestOnJumpRef = useRef(onJumpToSource);

  latestShellRef.current = shell;
  latestOnPickRef.current = onPickObject;
  latestOnJumpRef.current = onJumpToSource;

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const scene = new Scene();
    scene.background = new Color('#d9e2d3');

    const camera = new PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(2.6, 1.8, 2.4);
    camera.lookAt(0, 0.4, 0);

    const renderer = new WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    viewport.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0.35, 0);
    controls.update();

    scene.add(new AmbientLight(0xffffff, 0.7));
    const keyLight = new DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(4, 6, 2);
    scene.add(keyLight);
    const fillLight = new DirectionalLight(0xb4c2d9, 0.5);
    fillLight.position.set(-3, 2, -4);
    scene.add(fillLight);
    scene.add(new GridHelper(8, 16, 0x59664f, 0xa3b19a));

    const context: ViewerSceneContext = {
      scene,
      camera,
      renderer,
      controls,
      raycaster: new Raycaster(),
      pointer: new Vector2(),
      animationFrame: 0,
    };
    contextRef.current = context;

    const handleResize = (): void => {
      const { clientWidth, clientHeight } = viewport;
      camera.aspect = clientWidth / Math.max(clientHeight, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(clientWidth, clientHeight);
    };

    const handleClick = (event: MouseEvent): void => {
      const latestShell = latestShellRef.current;
      const latestContext = contextRef.current;
      if (!latestShell || !latestContext) {
        return;
      }

      const rect = renderer.domElement.getBoundingClientRect();
      latestContext.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      latestContext.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      latestContext.raycaster.setFromCamera(latestContext.pointer, latestContext.camera);
      const hits = latestContext.raycaster.intersectObject(latestShell.adapterResult.chain, true);
      if (hits[0]?.object) {
        latestOnPickRef.current(hits[0].object);
      }
    };

    const handleDoubleClick = (event: MouseEvent): void => {
      const latestShell = latestShellRef.current;
      const latestContext = contextRef.current;
      if (!latestShell || !latestContext) {
        return;
      }

      const rect = renderer.domElement.getBoundingClientRect();
      latestContext.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      latestContext.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      latestContext.raycaster.setFromCamera(latestContext.pointer, latestContext.camera);
      const hits = latestContext.raycaster.intersectObject(latestShell.adapterResult.chain, true);
      const binding = hits[0]?.object
        ? latestShell.adapterResult.metadata.getBinding(hits[0].object)
        : undefined;
      if (binding && (binding.kind === 'link' || binding.kind === 'shape')) {
        latestOnJumpRef.current(binding.stableId);
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(viewport);
    context.resizeObserver = resizeObserver;
    renderer.domElement.addEventListener('click', handleClick);
    renderer.domElement.addEventListener('dblclick', handleDoubleClick);
    handleResize();

    const animate = (): void => {
      context.animationFrame = window.requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      window.cancelAnimationFrame(context.animationFrame);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('click', handleClick);
      renderer.domElement.removeEventListener('dblclick', handleDoubleClick);
      controls.dispose();
      renderer.dispose();
      viewport.removeChild(renderer.domElement);
      contextRef.current = null;
    };
  }, []);

  useEffect(() => {
    const context = contextRef.current;
    if (!context) {
      return;
    }

    const previous = context.scene.getObjectByName('__viewer-chain__');
    if (previous) {
      context.scene.remove(previous);
    }

    if (shell) {
      shell.adapterResult.chain.name = '__viewer-chain__';
      context.scene.add(shell.adapterResult.chain);
    }
  }, [shell?.adapterResult.chain]);

  return <div ref={viewportRef} className="viewportCanvasHost" />;
}

function HierarchyTree({
  nodes,
  selectedId,
  expandedLinkIds,
  pinnedLinkIds,
  onSelectLink,
  onSelectShape,
  onJumpToSource,
  onTogglePin,
}: {
  nodes: ViewerHierarchyNode[];
  selectedId: string | undefined;
  expandedLinkIds: SemanticAdapterStableId[];
  pinnedLinkIds: SemanticAdapterStableId[];
  onSelectLink: (stableId: Extract<ViewerHierarchyNode['stableId'], `link:${string}`>) => void;
  onSelectShape: (stableId: Extract<ViewerHierarchyNode['stableId'], `shape:${string}`>) => void;
  onJumpToSource: (stableId: ViewerHierarchyNode['stableId']) => void;
  onTogglePin: (stableId: Extract<ViewerHierarchyNode['stableId'], `link:${string}`>) => void;
}) {
  return (
    <div className="treeRoot">
      {nodes.map((node) => (
        <HierarchyNodeItem
          key={node.stableId}
          node={node}
          selectedId={selectedId}
          expandedLinkIds={expandedLinkIds}
          pinnedLinkIds={pinnedLinkIds}
          onSelectLink={onSelectLink}
          onSelectShape={onSelectShape}
          onJumpToSource={onJumpToSource}
          onTogglePin={onTogglePin}
        />
      ))}
    </div>
  );
}

function HierarchyNodeItem({
  node,
  selectedId,
  expandedLinkIds,
  pinnedLinkIds,
  onSelectLink,
  onSelectShape,
  onJumpToSource,
  onTogglePin,
}: {
  node: ViewerHierarchyNode;
  selectedId: string | undefined;
  expandedLinkIds: SemanticAdapterStableId[];
  pinnedLinkIds: SemanticAdapterStableId[];
  onSelectLink: (stableId: Extract<ViewerHierarchyNode['stableId'], `link:${string}`>) => void;
  onSelectShape: (stableId: Extract<ViewerHierarchyNode['stableId'], `shape:${string}`>) => void;
  onJumpToSource: (stableId: ViewerHierarchyNode['stableId']) => void;
  onTogglePin: (stableId: Extract<ViewerHierarchyNode['stableId'], `link:${string}`>) => void;
}) {
  const clickTimeoutRef = useRef<number | undefined>(undefined);
  const shapeChildren = node.children.filter((child) => child.kind === 'shape');
  const linkChildren = node.children.filter((child) => child.kind === 'link');
  const shapeCount = shapeChildren.length;
  const isExpanded = expandedLinkIds.includes(node.stableId);
  const isPinned = pinnedLinkIds.includes(node.stableId);
  const linkId = node.stableId as Extract<ViewerHierarchyNode['stableId'], `link:${string}`>;

  return (
    <div className="treeNode">
      <div className="treeRow">
        <button
          type="button"
          className={`treeButton ${selectedId === node.stableId ? 'isSelected' : ''}`}
          onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
            if (event.detail !== 1) {
              return;
            }
            clickTimeoutRef.current = window.setTimeout(() => {
              onSelectLink(linkId);
            }, 220);
          }}
          onDoubleClick={() => {
            if (clickTimeoutRef.current) {
              window.clearTimeout(clickTimeoutRef.current);
            }
            onJumpToSource(linkId);
          }}
        >
          <span>{node.label}</span>
          {shapeCount > 0 ? <small>{isExpanded ? `${shapeCount} shapes open` : `${shapeCount} shapes`}</small> : null}
        </button>
        <button
          type="button"
          className={`treePinButton ${isPinned ? 'isPinned' : ''}`}
          onClick={() => onTogglePin(linkId)}
          aria-pressed={isPinned}
          title={isPinned ? 'Unlock this link' : 'Lock this link open'}
        >
          <span className="srOnly">{isPinned ? 'Locked' : 'Lock'}</span>
          {isPinned ? <LockClosedIcon /> : <LockOpenIcon />}
        </button>
      </div>
      {isExpanded && shapeChildren.length > 0 ? (
        <div className="shapeCluster">
          {shapeChildren.map((shape) => (
            <button
              key={shape.stableId}
              type="button"
              className={`shapeChip ${selectedId === shape.stableId ? 'isSelected' : ''}`}
              onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                if (event.detail !== 1) {
                  return;
                }
                clickTimeoutRef.current = window.setTimeout(() => {
                  onSelectShape(shape.stableId as Extract<ViewerHierarchyNode['stableId'], `shape:${string}`>);
                }, 220);
              }}
              onDoubleClick={() => {
                if (clickTimeoutRef.current) {
                  window.clearTimeout(clickTimeoutRef.current);
                }
                onJumpToSource(shape.stableId);
              }}
            >
              {shape.label}
            </button>
          ))}
        </div>
      ) : null}
      {linkChildren.length > 0 ? (
        <div className="treeChildren">
          {linkChildren.map((child) => (
            <HierarchyNodeItem
              key={child.stableId}
              node={child}
              selectedId={selectedId}
              expandedLinkIds={expandedLinkIds}
              pinnedLinkIds={pinnedLinkIds}
              onSelectLink={onSelectLink}
              onSelectShape={onSelectShape}
              onJumpToSource={onJumpToSource}
              onTogglePin={onTogglePin}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function LockClosedIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="treePinIcon">
      <path
        d="M5.5 6V4.75a2.5 2.5 0 1 1 5 0V6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        x="3.5"
        y="6"
        width="9"
        height="7"
        rx="1.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function LockOpenIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="treePinIcon">
      <path
        d="M5.5 6V4.75a2.5 2.5 0 1 1 5 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        x="3.5"
        y="6"
        width="9"
        height="7"
        rx="1.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function IssuesPanel({ issuesModel }: { issuesModel: ReturnType<typeof createViewerIssuesModel> }) {
  return (
    <div className="issuesPanel">
      {issuesModel.groups.map((group) => (
        <section key={group.title} className="issueGroup">
          <h3>{group.title}</h3>
          <IssueList items={group.items} emptyLabel="none" />
        </section>
      ))}
    </div>
  );
}

function collectOwnerLinkId(
  nodes: ViewerHierarchyNode[],
  targetId: string,
): Extract<SemanticAdapterStableId, `link:${string}`> | undefined {
  for (const node of nodes) {
    if (node.kind === 'link' && node.children.some((child) => child.stableId === targetId)) {
      return node.stableId as Extract<SemanticAdapterStableId, `link:${string}`>;
    }

    const result = collectOwnerLinkId(node.children, targetId);
    if (result) {
      return result;
    }
  }

  return undefined;
}

function InspectorPanel({
  title,
  subtitle,
  fields,
  jointControls,
  diagnostics,
  onJointChange,
}: {
  title: string;
  subtitle: string;
  fields: ReturnType<typeof createViewerInspectorModel>['fields'];
  jointControls: ReturnType<typeof createViewerInspectorModel>['jointControls'];
  diagnostics: string[];
  onJointChange: (stableId: SemanticAdapterStableId, values: number[]) => void;
}) {
  return (
    <div className="inspectorPanelContent">
      <div className="inspectorHeading">
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>

      <dl className="inspectorFields">
        {fields.map((field) => (
          <FragmentField key={field.label} label={field.label} value={field.value} />
        ))}
      </dl>

      {jointControls.map((control) => (
        <section key={control.stableId} className="jointControlSection">
          <h3>
            Joint Control ({control.jointBaseType ?? control.jointType ?? 'joint'}
            {control.valueUnit ? ` / ${control.valueUnit}` : ''})
          </h3>
          {control.values.map((value, index) => (
            <label key={`${control.stableId}:${index}`} className="jointControlRow">
              <span>Axis {index + 1}</span>
              <input
                type="number"
                step={control.valueUnit === 'deg' ? '1' : '0.01'}
                min={control.min}
                max={control.max}
                value={value}
                onChange={(event) => {
                  const next = [...control.values];
                  const parsed = Number(event.target.value);
                  const clipped =
                    control.min !== undefined && parsed < control.min
                      ? control.min
                      : control.max !== undefined && parsed > control.max
                        ? control.max
                        : parsed;
                  next[index] = clipped;
                  onJointChange(control.stableId, next);
                }}
              />
            </label>
          ))}
        </section>
      ))}

      <section className="issueGroup">
        <h3>Selection Diagnostics</h3>
        <IssueList items={diagnostics} emptyLabel="none" />
      </section>
    </div>
  );
}

function FragmentField({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

function IssueList({ items, emptyLabel }: { items: string[]; emptyLabel: string }) {
  const values = items.length > 0 ? items : [emptyLabel];
  return (
    <ul className="diagnosticList">
      {values.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modalScrim" onClick={onClose}>
      <section
        className="helpModal"
        role="dialog"
        aria-modal="true"
        aria-label="Usage"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="panelHeader">
          <h2>Usage</h2>
          <button type="button" className="panelActionButton" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="panelBody helpBody">
          <section className="helpSection">
            <h3>Loading</h3>
            <ul>
              <li>`Load Sample` で既定の fixture を読み込みます。</li>
              <li>`Open File` で手元の `.ztk` を開けます。</li>
              <li>`ZTK Source` を編集したら `Apply Source` で反映します。</li>
            </ul>
          </section>
          <section className="helpSection">
            <h3>Hierarchy</h3>
            <ul>
              <li>link の single click で選択し、shape 群を開閉します。</li>
              <li>鍵アイコンでその link を開いたまま固定できます。</li>
              <li>shape の single click で shape を選択します。</li>
              <li>link / shape の double click で source の対応 section に移動します。</li>
            </ul>
          </section>
          <section className="helpSection">
            <h3>Viewport</h3>
            <ul>
              <li>ドラッグでカメラ操作します。</li>
              <li>shape の single click で選択します。</li>
              <li>shape の double click で source の対応 section に移動します。</li>
            </ul>
          </section>
          <section className="helpSection">
            <h3>Inspector / Issues</h3>
            <ul>
              <li>revolute joint は degree 表示です。</li>
              <li>`Issues` では semantic / runtime / serializer の問題をまとめて確認できます。</li>
            </ul>
          </section>
        </div>
      </section>
    </div>
  );
}

function SourceEditor({
  text,
  highlightLineStart,
  highlightLineEnd,
  jumpLine,
  onChange,
}: {
  text: string;
  highlightLineStart?: number;
  highlightLineEnd?: number;
  jumpLine?: number;
  onChange: (value: string) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || jumpLine === undefined) {
      return;
    }

    textarea.scrollTop = Math.max(0, jumpLine * 24 - textarea.clientHeight * 0.3);
    if (highlightRef.current) {
      highlightRef.current.style.transform = `translateY(${-textarea.scrollTop}px)`;
    }
  }, [jumpLine]);

  return (
    <div className="sourceEditor">
      <div className="sourceOverlayViewport" aria-hidden="true">
        {highlightLineStart !== undefined && highlightLineEnd !== undefined ? (
          <div
            ref={highlightRef}
            className="sourceBlockHighlight"
            style={{
              top: `${14 + highlightLineStart * 24}px`,
              height: `${(highlightLineEnd - highlightLineStart + 1) * 24}px`,
            }}
          />
        ) : null}
      </div>
      <textarea
        ref={textareaRef}
        id="ztkSource"
        className="sourceInput"
        spellCheck={false}
        value={text}
        onChange={(event) => onChange(event.target.value)}
        onScroll={(event) => {
          if (highlightRef.current) {
            highlightRef.current.style.transform = `translateY(${-event.currentTarget.scrollTop}px)`;
          }
        }}
      />
    </div>
  );
}

async function loadFixtureSource(): Promise<string> {
  const response = await fetch(FIXTURE_PATH);
  if (!response.ok) {
    throw new Error(`Failed to load fixture: ${response.status}`);
  }
  return response.text();
}

function formatError(prefix: string, error: unknown): string {
  return `${prefix}: ${error instanceof Error ? error.message : String(error)}`;
}
