import "./style.css";
import { fabric } from "fabric";

const root = document.querySelector("#app");

const state = {
  canvas: null,
  source: null,
  sourceImageElement: null,
  sourceCanvas: null,
  sourceFabric: null,
  sourceName: "imagem",
  entries: [],
  mode: "select",
  manualPoints: [],
  manualMarkers: [],
  manualPolyline: null,
  busy: false,
  info: null,
  detectedBackground: null,
  traceRequestId: 0,
  isPanning: false,
  panLastX: 0,
  panLastY: 0,
  panStartX: 0,
  panStartY: 0,
  panDistance: 0,
  contextMenu: {
    visible: false,
    entry: null,
  },
  maskEditor: {
    visible: false,
    entry: null,
    box: null,
    maskCanvas: null,
    tool: "brush",
    brushSize: 24,
    drawing: false,
    lastPoint: null,
    fit: null,
  },
  layerEditor: {
    visible: false,
    entry: null,
    workingCanvas: null,
    baseCanvas: null,
    tool: "erase",
    brushSize: 32,
    drawing: false,
    lastPoint: null,
    fit: null,
    opacity: 1,
    dirty: false,
    hoverPoint: null,
    moveStart: null,
    rectStart: null,
    rectEnd: null,
    resizingBrush: null,
    paintColor: "#6f73ff",
    blendMode: true,
  },
};

const api = async (method, ...args) => {
  const fn = window.go?.app?.App?.[method];
  if (!fn) throw new Error(`Método ${method} indisponível. Execute pelo Wails.`);
  return fn(...args);
};

function shell() {
  root.innerHTML = `
    <div class="app-shell">
      <header class="topbar" data-wails-drag>
        <div class="brand" data-wails-drag>
          <div class="brand-mark">V</div>
          <div>
            <strong>Image SVG Studio</strong>
            <span id="versionLabel">v0.2.10</span>
          </div>
        </div>
        <div class="top-actions" data-wails-no-drag>
          <button class="btn primary" id="importBtn">Importar imagem</button>
          <button class="btn" id="autoBtn" disabled>Detectar objetos</button>
          <button class="btn" id="refineBtn" disabled>Refinar máscara</button>
          <button class="btn" id="editLayerBtn" disabled>Editar camada</button>
          <button class="btn" id="copyPngBtn" disabled>Copiar PNG</button>
          <button class="btn" id="copySvgBtn" disabled>Copiar SVG</button>
          <button class="btn" id="exportBtn" disabled>Salvar SVG</button>
          <button class="btn" id="exportAllBtn" disabled>Salvar todos</button>
        </div>
        <div class="window-controls" data-wails-no-drag>
          <button id="minBtn">−</button>
          <button id="maxBtn">□</button>
          <button id="closeBtn" class="close">×</button>
        </div>
      </header>

      <div class="workspace-grid">
        <aside class="sidebar left-panel">
          <div class="panel-head">
            <div>
              <strong>Camadas / objetos</strong>
              <small>Camadas, recortes editáveis e ordenação visual</small>
            </div>
            <span id="objectCount" class="pill">0</span>
          </div>
          <div id="layerList" class="layer-list empty-state">Importe uma imagem para começar.</div>
        </aside>

        <main class="stage-panel">
          <div class="stage-toolbar">
            <div class="toolbar-group">
              <button class="icon-btn active" id="selectModeBtn" title="Selecionar">↖</button>
              <button class="icon-btn" id="rectModeBtn" title="Criar um objeto por seleção retangular">▭</button>
              <button class="icon-btn" id="lassoModeBtn" title="Criar máscara por pontos">⌁</button>
            </div>
            <div class="status" id="statusText">Aguardando imagem.</div>
            <div class="view-meta" id="viewMeta">Zoom 100%</div>
            <button class="btn small danger ghost" id="clearEntriesBtn" disabled>Limpar objetos</button>
          </div>
          <div id="canvasHost" class="canvas-host">
            <canvas id="editorCanvas"></canvas>
            <div id="emptyCanvas" class="canvas-empty">
              <div class="drop-icon">◇</div>
              <strong>Importe PNG, JPG, WebP ou BMP</strong>
              <span>Detecte objetos rapidamente, refine a máscara com pincel/borracha e exporte SVG fiel à imagem ou copie diretamente para a memória.</span>
              <button class="btn primary" id="emptyImportBtn">Escolher imagem</button>
            </div>
          </div>
        </main>

        <aside class="sidebar right-panel">
          <div class="panel-head">
            <div>
              <strong>Recorte / SVG</strong>
              <small>Máscara editável + exportação fiel</small>
            </div>
          </div>

          <section class="settings-card">
            <label>Detalhamento <output id="detailValue">Alto</output></label>
            <input id="detailRange" type="range" min="1" max="6" value="4" />
            <div class="scale"><span>Menos objetos</span><span>Mais objetos</span></div>
          </section>

          <section class="settings-card">
            <label>Sensibilidade do fundo <output id="thresholdValue">20</output></label>
            <input id="thresholdRange" type="range" min="6" max="60" value="20" />
            <div class="help">Usada pela detecção automática para remover fundo. Recortes manuais não usam essa remoção.</div>
          </section>

          <section class="settings-card">
            <label>Cores do SVG vetorial opcional <output id="colorsValue">32</output></label>
            <input id="colorsRange" type="range" min="4" max="64" step="4" value="32" />
            <div class="help">Só afeta a vetorização em paths, que agora é opcional. O salvar SVG padrão mantém a imagem fiel, sem converter em paths.</div>
          </section>

          <section class="settings-card">
            <label class="check-row">
              <input id="removeBgToggle" type="checkbox" checked />
              <span><strong>Remover fundo na detecção automática</strong><small>Aplica remoção automática apenas aos objetos criados por Detectar objetos. Recortes manuais preservam todos os pixels.</small></span>
            </label>
            <label class="check-row">
              <input id="showSourceToggle" type="checkbox" checked />
              <span><strong>Mostrar imagem original</strong><small>O original permanece bloqueado como referência.</small></span>
            </label>
          </section>

          <section class="settings-card selected-card">
            <div class="card-title">Objeto selecionado</div>
            <div id="selectedInfo" class="selected-info">Nenhum objeto selecionado.</div>
            <div class="stack selected-actions">
              <button class="btn" id="refineSelectedSideBtn" disabled>Máscara</button>
              <button class="btn" id="editLayerSideBtn" disabled>Editar camada</button>
              <button class="btn" id="duplicateSelectedBtn" disabled>Duplicar</button>
              <button class="btn" id="layerUpBtn" disabled>Subir</button>
              <button class="btn" id="layerDownBtn" disabled>Descer</button>
              <button class="btn" id="layerFrontBtn" disabled>Trazer frente</button>
              <button class="btn" id="layerBackBtn" disabled>Enviar trás</button>
              <button class="btn" id="toggleVisibilitySideBtn" disabled>Ocultar</button>
              <button class="btn" id="toggleLockSideBtn" disabled>Bloquear</button>
              <button class="btn" id="copyPngSideBtn" disabled>Copiar PNG</button>
              <button class="btn" id="copySvgSideBtn" disabled>Copiar SVG</button>
              <button class="btn" id="exportSelectedSideBtn" disabled>Salvar SVG</button>
              <button class="btn" id="vectorizeSelectedSideBtn" disabled>Paths SVG</button>
              <button class="btn danger" id="deleteSelectedBtn" disabled>Excluir</button>
            </div>
            <div class="settings-inline">
              <label>Opacidade da camada <output id="layerOpacityValue">100%</output></label>
              <input id="layerOpacityRange" type="range" min="0" max="100" value="100" />
            </div>
            <div class="help inline-help">Atalhos: <strong>Ctrl + C</strong> copia o objeto selecionado. <strong>Ctrl + scroll</strong> faz zoom. <strong>Scroll</strong> move a área e <strong>botão direito</strong> arrasta a visualização. No editor de camada, <strong>Ctrl + botão direito</strong> ajusta rapidamente o tamanho da borracha.</div>
          </section>
        </aside>
      </div>

      <footer class="statusbar">
        <span>Wails + Go</span>
        <span>Fabric.js</span>
        <span>Máscara com pincel</span>
        <span>SVG fiel + SVG vetorial opcional</span>
        <span class="spacer"></span>
        <span id="footerState">Pronto</span>
      </footer>

      <div id="maskModal" class="mask-modal hidden">
        <div class="mask-panel">
          <div class="mask-header">
            <div>
              <strong>Refinar máscara</strong>
              <small>Pinte para adicionar ou remover áreas do objeto selecionado.</small>
            </div>
            <button class="icon-btn mask-close" id="cancelMaskBtn" title="Fechar">×</button>
          </div>
          <div class="mask-toolbar">
            <button class="btn small active" id="brushToolBtn">Pincel</button>
            <button class="btn small" id="eraserToolBtn">Borracha</button>
            <label class="range-wrap">Tamanho <output id="maskBrushSizeValue">24</output>
              <input id="maskBrushSizeRange" type="range" min="4" max="120" value="24" />
            </label>
            <div class="mask-tip">Dica: o fundo aparece suavizado; a área válida do objeto aparece em destaque.</div>
          </div>
          <div class="mask-canvas-wrap" id="maskCanvasWrap">
            <canvas id="maskEditorCanvas"></canvas>
          </div>
          <div class="mask-actions">
            <button class="btn" id="saveMaskBtn">Salvar no objeto atual</button>
            <button class="btn primary" id="saveMaskNewLayerBtn">Salvar como nova camada</button>
          </div>
        </div>
      </div>

      <div id="layerModal" class="mask-modal hidden">
        <div class="mask-panel layer-panel">
          <div class="mask-header">
            <div>
              <strong>Editar camada</strong>
              <small>Edite apenas a camada selecionada com borracha ou restauração; use a lista lateral para trocar de camada.</small>
            </div>
            <button class="icon-btn mask-close" id="cancelLayerBtn" title="Fechar">×</button>
          </div>
          <div class="mask-toolbar layer-topbar-photoshop">
            <div class="layer-topbar-title">
              <strong>Workspace de edição</strong>
              <small>Ferramentas em barra lateral, controles compactos no topo e painel de camadas no estilo editor gráfico.</small>
            </div>
            <div class="layer-topbar-controls">
              <button class="btn small icon-action-btn" id="newLayerFromEditorBtn" title="Nova camada" aria-label="Nova camada">✚</button>
              <button class="btn small icon-action-btn" id="layerBlendModeBtn" title="Mesclar pincel" aria-label="Mesclar pincel">◐</button>
              <label class="range-wrap compact-range">Opacidade <output id="layerOpacityModalValue">100%</output>
                <input id="layerOpacityModalRange" type="range" min="0" max="100" value="100" />
              </label>
              <label class="range-wrap compact-range">Tamanho <output id="layerBrushSizeValue">32</output>
                <input id="layerBrushSizeRange" type="range" min="4" max="140" value="32" />
              </label>
              <label class="range-wrap compact-range color-range">Cor
                <input id="layerPaintColorInput" type="color" value="#6f73ff" />
              </label>
            </div>
          </div>
          <div class="layer-editor-layout photoshop-workspace">
            <aside class="tool-rail" aria-label="Ferramentas do editor">
              <button class="tool-icon-btn" id="layerMoveToolBtn" title="Mover" aria-label="Mover"><svg class="tool-icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M11 3l-2 2h1.5v4H6.5V7.5l-2 2 2 2V10.5h4v4H9l2 2 2-2h-1.5v-4h4v1.5l2-2-2-2V9h-4V5H13l-2-2zm0 13l2 2h-1.5v3h-1v-3H9l2-2z"/></svg></button>
              <button class="tool-icon-btn active" id="layerEraseToolBtn" title="Borracha" aria-label="Borracha"><svg class="tool-icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 15.5L11.5 7a2 2 0 0 1 2.8 0l6.7 6.7a2 2 0 0 1 0 2.8L17.5 20H8a3 3 0 0 1-2.1-.9L3 16.3a.6.6 0 0 1 0-.8zm6 3h7.7l2.9-2.9-6.2-6.2-7 7 1.5 1.5a1 1 0 0 0 .7.3z"/></svg></button>
              <button class="tool-icon-btn" id="layerRestoreToolBtn" title="Restaurar" aria-label="Restaurar"><svg class="tool-icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5a7 7 0 1 1-6.3 10H3l3.6-3.6L10.2 15H7.8A5 5 0 1 0 12 7c-1.3 0-2.5.5-3.4 1.3L7.2 6.9A6.9 6.9 0 0 1 12 5z"/></svg></button>
              <button class="tool-icon-btn" id="layerPaintToolBtn" title="Pincel" aria-label="Pincel"><svg class="tool-icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M14.7 4.3l5 5-1.4 1.4-1.4-1.4-4.5 4.5c.4 1.6 0 3.4-1.3 4.7-1.5 1.5-3.7 1.8-5.5 1.3.8-.5 1.4-1.4 1.4-2.4 0-1.7-1.4-3-3-3-1 0-1.9.5-2.4 1.4-.5-1.8-.2-4 1.3-5.5 1.3-1.3 3.1-1.8 4.7-1.3l4.5-4.5-1.4-1.4 1.4-1.4z"/></svg></button>
              <button class="tool-icon-btn" id="layerCutToolBtn" title="Corte retângulo" aria-label="Corte retângulo"><svg class="tool-icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h5v2H7v3H5V5zm9 0h5v5h-2V7h-3V5zM5 14h2v3h3v2H5v-5zm12 0h2v5h-5v-2h3v-3zM8 8h8v8H8V8z"/></svg></button>
            </aside>
            <div class="mask-canvas-wrap layer-editor-stage" id="layerCanvasWrap">
              <div class="layer-stage-header photoshop-stage-head">
                <strong>Documento ativo</strong>
                <small>Edite o recorte selecionado. Use a barra de ferramentas à esquerda e acompanhe as camadas na direita.</small>
              </div>
              <canvas id="layerEditorCanvas"></canvas>
            </div>
            <aside class="layer-editor-sidebar photoshop-sidebar">
              <div class="layer-editor-sidehead photoshop-layers-head">
                <strong>Camadas</strong>
                <small>Painel compacto inspirado em Photoshop. O recorte atual mantém sua pilha independente.</small>
                <div class="layer-panel-mini-controls">
                  <div class="layer-panel-select">Normal</div>
                  <div class="layer-panel-mini-opacity">Opacidade <span id="layerPanelOpacityEcho">100%</span></div>
                </div>
              </div>
              <div id="layerEditorLayerList" class="layer-editor-layer-list empty-state">Nenhuma camada para editar.</div>
            </aside>
          </div>
          <div class="mask-actions">
            <button class="btn" id="saveLayerBtn">Salvar na camada atual</button>
            <button class="btn primary" id="saveLayerNewBtn">Salvar como nova camada</button>
          </div>
        </div>
      </div>

      <div id="entryContextMenu" class="context-menu hidden">
        <button class="context-item" id="ctxRefineBtn">Refinar máscara</button>
        <button class="context-item" id="ctxEditLayerBtn">Editar camada</button>
        <button class="context-item" id="ctxDuplicateBtn">Duplicar camada</button>
        <button class="context-item" id="ctxLayerUpBtn">Subir</button>
        <button class="context-item" id="ctxLayerDownBtn">Descer</button>
        <button class="context-item" id="ctxLayerFrontBtn">Trazer para frente</button>
        <button class="context-item" id="ctxLayerBackBtn">Enviar para trás</button>
        <button class="context-item" id="ctxToggleVisibilityBtn">Ocultar camada</button>
        <button class="context-item" id="ctxToggleLockBtn">Bloquear camada</button>
        <button class="context-item" id="ctxCopyPngBtn">Copiar PNG</button>
        <button class="context-item" id="ctxCopySvgBtn">Copiar SVG</button>
        <button class="context-item" id="ctxSaveSvgBtn">Salvar SVG</button>
        <button class="context-item" id="ctxVectorBtn">Paths SVG</button>
        <button class="context-item danger" id="ctxDeleteBtn">Excluir</button>
      </div>
    </div>
  `;
}

function setStatus(message, kind = "idle") {
  const el = document.querySelector("#statusText");
  const footer = document.querySelector("#footerState");
  if (el) {
    el.textContent = message;
    el.dataset.kind = kind;
  }
  if (footer) footer.textContent = message;
}

function selectedEntry() {
  const active = state.canvas?.getActiveObject();
  if (!active || active.data?.role !== "entry") return null;
  return state.entries.find((entry) => entry.object === active) || null;
}

function activeEntryOrContext() {
  return selectedEntry() || state.contextMenu.entry || null;
}

function isEntryVisible(entry) {
  return entry?.visible !== false;
}

function isEntryLocked(entry) {
  return entry?.locked === true;
}

function toggleEntryVisibility(entry) {
  if (!entry) return;
  entry.visible = !isEntryVisible(entry);
  syncEntryVisual(entry);
  if (!isEntryVisible(entry) && selectedEntry()?.id === entry.id) {
    state.canvas.discardActiveObject();
  }
  state.canvas.requestRenderAll();
  refreshLayerList();
  refreshSelectionUI();
  if (state.layerEditor.visible) {
    renderLayerEditor();
    refreshLayerEditorLayerList();
  }
  setStatus(entry.visible ? "Camada exibida." : "Camada ocultada.", "success");
}

function toggleEntryLock(entry) {
  if (!entry) return;
  entry.locked = !isEntryLocked(entry);
  syncEntryVisual(entry);
  state.canvas.requestRenderAll();
  refreshLayerList();
  refreshSelectionUI();
  if (state.layerEditor.visible) refreshLayerEditorLayerList();
  setStatus(entry.locked ? "Camada bloqueada." : "Camada desbloqueada.", "success");
}

function hideContextMenu() {
  const menu = document.querySelector("#entryContextMenu");
  if (!menu) return;
  menu.classList.add("hidden");
  state.contextMenu.visible = false;
  state.contextMenu.entry = null;
}

function showContextMenuForEntry(entry, clientX, clientY) {
  const menu = document.querySelector("#entryContextMenu");
  const host = document.querySelector("#app");
  if (!menu || !host || !entry) return;
  const visibilityBtn = document.querySelector("#ctxToggleVisibilityBtn");
  const lockBtn = document.querySelector("#ctxToggleLockBtn");
  if (visibilityBtn) visibilityBtn.textContent = isEntryVisible(entry) ? "Ocultar camada" : "Mostrar camada";
  if (lockBtn) lockBtn.textContent = isEntryLocked(entry) ? "Desbloquear camada" : "Bloquear camada";
  state.contextMenu.visible = true;
  state.contextMenu.entry = entry;
  menu.classList.remove("hidden");
  const hostRect = host.getBoundingClientRect();
  const x = clientX - hostRect.left;
  const y = clientY - hostRect.top;
  requestAnimationFrame(() => {
    const maxX = Math.max(10, hostRect.width - menu.offsetWidth - 10);
    const maxY = Math.max(10, hostRect.height - menu.offsetHeight - 10);
    menu.style.left = `${clamp(x, 10, maxX)}px`;
    menu.style.top = `${clamp(y, 10, maxY)}px`;
  });
}

function bindContextMenuUI() {
  const bindAction = (id, action) => {
    const el = document.querySelector(id);
    if (!el) return;
    el.onclick = async () => {
      const entry = activeEntryOrContext();
      hideContextMenu();
      if (!entry) return;
      state.canvas.setActiveObject(entry.object);
      state.canvas.requestRenderAll();
      refreshSelectionUI();
      refreshLayerList();
      await action(entry);
    };
  };

  bindAction("#ctxRefineBtn", async (entry) => openMaskEditor(entry));
  bindAction("#ctxEditLayerBtn", async (entry) => openLayerEditor(entry));
  bindAction("#ctxDuplicateBtn", async (entry) => {
    duplicateEntryAsNewLayer(entry, { label: `${entry.label} cópia` });
    setStatus("Camada duplicada.", "success");
  });
  bindAction("#ctxLayerUpBtn", async () => moveSelectedLayerUp());
  bindAction("#ctxLayerDownBtn", async () => moveSelectedLayerDown());
  bindAction("#ctxLayerFrontBtn", async () => bringSelectedLayerToFront());
  bindAction("#ctxLayerBackBtn", async () => sendSelectedLayerToBack());
  bindAction("#ctxToggleVisibilityBtn", async (entry) => toggleEntryVisibility(entry));
  bindAction("#ctxToggleLockBtn", async (entry) => toggleEntryLock(entry));
  bindAction("#ctxCopyPngBtn", async () => copySelectedPNG());
  bindAction("#ctxCopySvgBtn", async () => copySelectedSVG());
  bindAction("#ctxSaveSvgBtn", async () => exportSelected());
  bindAction("#ctxVectorBtn", async () => generateSelectedVectorPaths());
  bindAction("#ctxDeleteBtn", async () => deleteSelected());
}

function setBusy(busy) {
  state.busy = busy;
  const selection = selectedEntry();
  const hasSource = !!state.source;
  const hasEntries = state.entries.length > 0;

  toggleButton("importBtn", busy);
  toggleButton("autoBtn", busy || !hasSource);
  toggleButton("refineBtn", busy || !selection);
  toggleButton("editLayerBtn", busy || !selection);
  toggleButton("copyPngBtn", busy || !selection);
  toggleButton("copySvgBtn", busy || !selection);
  toggleButton("exportBtn", busy || !selection);
  toggleButton("exportAllBtn", busy || !hasEntries);
  toggleButton("clearEntriesBtn", busy || !hasEntries);
  toggleButton("rectModeBtn", busy || !hasSource);
  toggleButton("lassoModeBtn", busy || !hasSource);
  toggleButton("refineSelectedSideBtn", busy || !selection);
  toggleButton("editLayerSideBtn", busy || !selection);
  toggleButton("duplicateSelectedBtn", busy || !selection);
  toggleButton("layerUpBtn", busy || !selection);
  toggleButton("layerDownBtn", busy || !selection);
  toggleButton("layerFrontBtn", busy || !selection);
  toggleButton("layerBackBtn", busy || !selection);
  toggleButton("copyPngSideBtn", busy || !selection);
  toggleButton("copySvgSideBtn", busy || !selection);
  toggleButton("exportSelectedSideBtn", busy || !selection);
  toggleButton("vectorizeSelectedSideBtn", busy || !selection);
  toggleButton("deleteSelectedBtn", busy || !selection);
  refreshSelectionUI();
}

function toggleButton(id, disabled) {
  const button = document.getElementById(id);
  if (button) button.disabled = disabled;
}

function initCanvas() {
  state.canvas = new fabric.Canvas("editorCanvas", {
    backgroundColor: "#151925",
    preserveObjectStacking: true,
    selection: true,
    fireRightClick: true,
    stopContextMenu: true,
  });
  state.canvas.setWidth(1000);
  state.canvas.setHeight(650);

  const handleSelectionChange = () => {
    refreshSelectionUI();
    refreshLayerList();
  };
  state.canvas.on("selection:created", handleSelectionChange);
  state.canvas.on("selection:updated", handleSelectionChange);
  state.canvas.on("selection:cleared", handleSelectionChange);
  const detachEntryOnTransform = (event) => {
    const entry = state.entries.find((item) => item.object === event.target);
    if (!entry) return;
    if (!entry.detached) {
      entry.detached = true;
      syncEntryVisual(entry);
    }
  };
  state.canvas.on("object:moving", detachEntryOnTransform);
  state.canvas.on("object:scaling", detachEntryOnTransform);
  state.canvas.on("object:rotating", detachEntryOnTransform);
  state.canvas.on("object:modified", (event) => {
    const entry = state.entries.find((item) => item.object === event.target);
    if (entry) {
      entry.detached = true;
      syncEntryVisual(entry);
    }
    refreshLayerList();
    refreshSelectionUI();
  });
  state.canvas.on("mouse:down", handleCanvasMouseDown);
  bindCanvasNavigation();

  const resize = () => {
    const host = document.querySelector("#canvasHost");
    const width = Math.max(600, host.clientWidth - 36);
    const height = Math.max(420, host.clientHeight - 36);
    state.canvas.setWidth(width);
    state.canvas.setHeight(height);
    fitSourceToCanvas();
  };
  new ResizeObserver(resize).observe(document.querySelector("#canvasHost"));
  resize();
}

function bindCanvasNavigation() {
  state.canvas.on("mouse:wheel", (opt) => {
    if (state.maskEditor.visible) return;
    const event = opt.e;
    if (!event) return;

    if (event.ctrlKey || event.metaKey) {
      let zoom = state.canvas.getZoom();
      zoom *= 0.999 ** event.deltaY;
      zoom = clamp(zoom, 0.2, 8);
      state.canvas.zoomToPoint(new fabric.Point(event.offsetX, event.offsetY), zoom);
      constrainViewport();
      state.canvas.requestRenderAll();
      updateViewMeta();
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const vpt = state.canvas.viewportTransform;
    if (!vpt) return;
    vpt[4] -= event.deltaX;
    vpt[5] -= event.deltaY;
    constrainViewport();
    state.canvas.requestRenderAll();
    updateViewMeta();
    event.preventDefault();
    event.stopPropagation();
  });

  state.canvas.on("mouse:move", (opt) => {
    if (!state.isPanning || !opt.e) return;
    const event = opt.e;
    const vpt = state.canvas.viewportTransform;
    if (!vpt) return;
    vpt[4] += event.clientX - state.panLastX;
    vpt[5] += event.clientY - state.panLastY;
    state.panLastX = event.clientX;
    state.panLastY = event.clientY;
    state.panDistance = Math.max(
      state.panDistance,
      Math.hypot(event.clientX - state.panStartX, event.clientY - state.panStartY),
    );
    constrainViewport();
    state.canvas.requestRenderAll();
    updateViewMeta();
    event.preventDefault();
    event.stopPropagation();
  });

  state.canvas.on("mouse:up", () => {
    finishPanMode();
  });

  state.canvas.upperCanvasEl?.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    finishPanMode();
    if (state.maskEditor.visible || state.layerEditor.visible || state.busy) {
      hideContextMenu();
      return;
    }
    const target = state.canvas.findTarget(event, false);
    const entry = state.entries.find((item) => item.object === target) || selectedEntry();
    if (entry && state.panDistance < 8) {
      state.canvas.setActiveObject(entry.object);
      state.canvas.requestRenderAll();
      refreshSelectionUI();
      refreshLayerList();
      showContextMenuForEntry(entry, event.clientX, event.clientY);
      return;
    }
    hideContextMenu();
  });

  updateViewMeta();
}

function beginPanMode(event) {
  if (state.isPanning) return;
  state.isPanning = true;
  state.panLastX = event.clientX;
  state.panLastY = event.clientY;
  state.panStartX = event.clientX;
  state.panStartY = event.clientY;
  state.panDistance = 0;
  hideContextMenu();
  state.canvas.selection = false;
  state.canvas.defaultCursor = "grabbing";
  state.canvas.requestRenderAll();
}

function finishPanMode() {
  if (!state.isPanning) return;
  state.isPanning = false;
  state.canvas.selection = state.mode === "select";
  state.canvas.defaultCursor = state.mode === "select" ? "default" : "crosshair";
}

function resetViewport() {
  if (!state.canvas) return;
  state.canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
  constrainViewport();
  state.canvas.requestRenderAll();
  updateViewMeta();
}

function constrainViewport() {
  const canvas = state.canvas;
  if (!canvas?.viewportTransform) return;
  const vpt = canvas.viewportTransform;
  const zoom = canvas.getZoom() || 1;
  const width = canvas.getWidth();
  const height = canvas.getHeight();

  if (!state.sourceFabric) {
    vpt[4] = clamp(vpt[4], -width * 0.45, width * 0.45);
    vpt[5] = clamp(vpt[5], -height * 0.45, height * 0.45);
    return;
  }

  const sceneLeft = Number(state.sourceFabric.left) || 0;
  const sceneTop = Number(state.sourceFabric.top) || 0;
  const sceneWidth = state.sourceFabric.getScaledWidth();
  const sceneHeight = state.sourceFabric.getScaledHeight();
  const sceneRight = sceneLeft + sceneWidth;
  const sceneBottom = sceneTop + sceneHeight;
  const margin = 90;

  if (sceneWidth * zoom + margin * 2 <= width) {
    vpt[4] = (width - sceneWidth * zoom) / 2 - sceneLeft * zoom;
  } else {
    const minX = width - sceneRight * zoom - margin;
    const maxX = margin - sceneLeft * zoom;
    vpt[4] = clamp(vpt[4], minX, maxX);
  }

  if (sceneHeight * zoom + margin * 2 <= height) {
    vpt[5] = (height - sceneHeight * zoom) / 2 - sceneTop * zoom;
  } else {
    const minY = height - sceneBottom * zoom - margin;
    const maxY = margin - sceneTop * zoom;
    vpt[5] = clamp(vpt[5], minY, maxY);
  }
}

function updateViewMeta() {
  const el = document.querySelector("#viewMeta");
  if (!el || !state.canvas) return;
  const zoom = Math.round((state.canvas.getZoom() || 1) * 100);
  el.textContent = `Zoom ${zoom}%`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

async function bootstrap() {
  shell();
  initCanvas();
  bindUI();
  try {
    state.info = await api("Info");
    document.querySelector("#versionLabel").textContent = `v${state.info.version}`;
  } catch {
    // preview no navegador
  }
}

function bindUI() {
  const pick = () => importImage();
  document.querySelector("#importBtn").onclick = pick;
  document.querySelector("#emptyImportBtn").onclick = pick;
  document.querySelector("#autoBtn").onclick = autoDetectObjects;
  document.querySelector("#refineBtn").onclick = () => openMaskEditor(selectedEntry());
  document.querySelector("#refineSelectedSideBtn").onclick = () => openMaskEditor(selectedEntry());
  document.querySelector("#editLayerBtn").onclick = () => openLayerEditor(selectedEntry());
  document.querySelector("#editLayerSideBtn").onclick = () => openLayerEditor(selectedEntry());
  document.querySelector("#duplicateSelectedBtn").onclick = duplicateSelectedLayer;
  document.querySelector("#layerUpBtn").onclick = moveSelectedLayerUp;
  document.querySelector("#layerDownBtn").onclick = moveSelectedLayerDown;
  document.querySelector("#layerFrontBtn").onclick = bringSelectedLayerToFront;
  document.querySelector("#layerBackBtn").onclick = sendSelectedLayerToBack;
  bindContextMenuUI();
  document.querySelector("#copyPngBtn").onclick = copySelectedPNG;
  document.querySelector("#toggleVisibilitySideBtn").onclick = () => toggleEntryVisibility(selectedEntry());
  document.querySelector("#toggleLockSideBtn").onclick = () => toggleEntryLock(selectedEntry());
  document.querySelector("#copyPngSideBtn").onclick = copySelectedPNG;
  document.querySelector("#copySvgBtn").onclick = copySelectedSVG;
  document.querySelector("#copySvgSideBtn").onclick = copySelectedSVG;
  document.querySelector("#exportBtn").onclick = exportSelected;
  document.querySelector("#exportSelectedSideBtn").onclick = exportSelected;
  document.querySelector("#exportAllBtn").onclick = exportAll;
  document.querySelector("#vectorizeSelectedSideBtn").onclick = generateSelectedVectorPaths;
  document.querySelector("#lassoModeBtn").onclick = () => setMode("lasso");
  document.querySelector("#rectModeBtn").onclick = () => setMode("rect");
  document.querySelector("#selectModeBtn").onclick = () => setMode("select");
  document.querySelector("#deleteSelectedBtn").onclick = deleteSelected;
  document.querySelector("#clearEntriesBtn").onclick = clearEntries;

  document.querySelector("#showSourceToggle").onchange = (event) => {
    if (!state.sourceFabric) return;
    state.sourceFabric.visible = event.target.checked;
    syncAllEntryVisuals();
    state.canvas.requestRenderAll();
  };

  document.addEventListener("pointerdown", (event) => {
    const menu = document.querySelector("#entryContextMenu");
    if (menu?.classList.contains("hidden")) return;
    if (!menu.contains(event.target)) hideContextMenu();
  });

  const detail = document.querySelector("#detailRange");
  const threshold = document.querySelector("#thresholdRange");
  const colors = document.querySelector("#colorsRange");
  const detailLabels = ["", "Baixo", "Médio", "Alto", "Muito alto", "Extremo", "Máximo"];
  detail.oninput = () => (document.querySelector("#detailValue").textContent = detailLabels[Number(detail.value)]);
  threshold.oninput = () => (document.querySelector("#thresholdValue").textContent = threshold.value);
  colors.oninput = () => (document.querySelector("#colorsValue").textContent = colors.value);

  document.querySelector("#minBtn").onclick = () => api("Minimise").catch(() => {});
  document.querySelector("#maxBtn").onclick = () => api("ToggleMaximise").catch(() => {});
  document.querySelector("#closeBtn").onclick = () => api("Close").catch(() => {});

  bindMaskEditor();
  bindLayerEditor();

  document.querySelector("#layerOpacityRange").oninput = (event) => {
    const entry = selectedEntry();
    const value = Number(event.target.value) || 0;
    document.querySelector("#layerOpacityValue").textContent = `${value}%`;
    if (!entry) return;
    entry.opacity = clamp(value / 100, 0, 1);
    entry.detached = true;
    syncEntryVisual(entry);
    state.canvas.requestRenderAll();
    refreshLayerList();
    refreshSelectionUI();
  };

  window.addEventListener("keydown", async (event) => {
    if (event.key === "Escape") {
      if (state.maskEditor.visible) {
        closeMaskEditor();
        return;
      }
      if (state.layerEditor.visible) {
        closeLayerEditor();
        return;
      }
      if (state.contextMenu.visible) {
        hideContextMenu();
        return;
      }
      if (state.mode !== "select") setMode("select");
    }

    if (event.key === "Enter" && state.mode === "lasso" && state.manualPoints.length >= 3) {
      finishLasso();
      return;
    }

    if ((event.key === "Delete" || event.key === "Backspace") && !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) {
      deleteSelected();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c" && !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) {
      const entry = selectedEntry();
      if (!entry) return;
      event.preventDefault();
      await copySelectedMixed();
    }
  });
}

function bindMaskEditor() {
  document.querySelector("#cancelMaskBtn").onclick = closeMaskEditor;
  document.querySelector("#brushToolBtn").onclick = () => setMaskTool("brush");
  document.querySelector("#eraserToolBtn").onclick = () => setMaskTool("eraser");
  document.querySelector("#maskBrushSizeRange").oninput = (event) => {
    state.maskEditor.brushSize = Number(event.target.value) || 24;
    document.querySelector("#maskBrushSizeValue").textContent = String(state.maskEditor.brushSize);
  };
  document.querySelector("#saveMaskBtn").onclick = () => saveMaskChanges(false);
  document.querySelector("#saveMaskNewLayerBtn").onclick = () => saveMaskChanges(true);

  const canvas = document.querySelector("#maskEditorCanvas");
  const pointerStart = (event) => {
    if (!state.maskEditor.visible || !state.maskEditor.maskCanvas) return;
    const point = maskPointerToImage(event);
    if (!point) return;
    state.maskEditor.drawing = true;
    state.maskEditor.lastPoint = point;
    applyBrushPoint(point, point);
    event.preventDefault();
  };
  const pointerMove = (event) => {
    if (!state.maskEditor.visible || !state.maskEditor.drawing) return;
    const point = maskPointerToImage(event);
    if (!point) return;
    applyBrushPoint(state.maskEditor.lastPoint || point, point);
    state.maskEditor.lastPoint = point;
    event.preventDefault();
  };
  const pointerStop = () => {
    state.maskEditor.drawing = false;
    state.maskEditor.lastPoint = null;
  };

  canvas.addEventListener("pointerdown", pointerStart);
  canvas.addEventListener("pointermove", pointerMove);
  canvas.addEventListener("pointerup", pointerStop);
  canvas.addEventListener("pointerleave", pointerStop);

  new ResizeObserver(() => {
    if (state.maskEditor.visible) renderMaskEditor();
  }).observe(document.querySelector("#maskCanvasWrap"));
}


function bindLayerEditor() {
  document.querySelector("#cancelLayerBtn").onclick = closeLayerEditor;
  document.querySelector("#layerMoveToolBtn").onclick = () => setLayerTool("move");
  document.querySelector("#layerEraseToolBtn").onclick = () => setLayerTool("erase");
  document.querySelector("#layerRestoreToolBtn").onclick = () => setLayerTool("restore");
  document.querySelector("#layerPaintToolBtn").onclick = () => setLayerTool("paint");
  document.querySelector("#layerCutToolBtn").onclick = () => setLayerTool("cutrect");
  document.querySelector("#layerBlendModeBtn").onclick = toggleLayerBlendMode;
  document.querySelector("#newLayerFromEditorBtn").onclick = createNewLayerFromEditor;
  document.querySelector("#layerPaintColorInput").oninput = (event) => {
    state.layerEditor.paintColor = event.target.value || "#6f73ff";
  };
  document.querySelector("#layerBrushSizeRange").oninput = (event) => {
    state.layerEditor.brushSize = Number(event.target.value) || 32;
    document.querySelector("#layerBrushSizeValue").textContent = String(state.layerEditor.brushSize);
    renderLayerEditor();
  };
  document.querySelector("#layerOpacityModalRange").oninput = (event) => {
    const value = Number(event.target.value) || 0;
    state.layerEditor.opacity = clamp(value / 100, 0, 1);
    state.layerEditor.dirty = true;
    document.querySelector("#layerOpacityModalValue").textContent = `${value}%`;
    const layerPanelOpacityEcho = document.querySelector("#layerPanelOpacityEcho");
    if (layerPanelOpacityEcho) layerPanelOpacityEcho.textContent = `${value}%`;
    renderLayerEditor();
    refreshLayerEditorLayerList();
  };
  document.querySelector("#saveLayerBtn").onclick = () => saveLayerChanges(false);
  document.querySelector("#saveLayerNewBtn").onclick = () => saveLayerChanges(true);

  const canvas = document.querySelector("#layerEditorCanvas");
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  const pointerStart = (event) => {
    if (!state.layerEditor.visible || !state.layerEditor.workingCanvas) return;
    if (event.ctrlKey && event.button === 2 && state.layerEditor.tool !== "move") {
      state.layerEditor.resizingBrush = {
        startX: event.clientX,
        startSize: state.layerEditor.brushSize,
      };
      event.preventDefault();
      return;
    }
    if (isEntryLocked(state.layerEditor.entry)) {
      setStatus("Camada bloqueada. Desbloqueie para editar.", "error");
      return;
    }
    const point = layerPointerToImage(event);
    if (!point) return;
    const sourcePoint = layerPointerToSource(event);
    state.layerEditor.hoverPoint = point;
    state.layerEditor.drawing = true;
    state.layerEditor.lastPoint = point;
    if (state.layerEditor.tool === "move") {
      const current = state.layerEditor.entry;
      state.layerEditor.moveStart = {
        pointer: sourcePoint,
        position: getEntrySourcePosition(current),
      };
      renderLayerEditor();
      event.preventDefault();
      return;
    }
    if (state.layerEditor.tool === "cutrect") {
      state.layerEditor.rectStart = point;
      state.layerEditor.rectEnd = point;
      renderLayerEditor();
      event.preventDefault();
      return;
    }
    applyLayerBrush(point, point);
    event.preventDefault();
  };
  const pointerMove = (event) => {
    if (!state.layerEditor.visible) return;
    const point = layerPointerToImage(event);
    state.layerEditor.hoverPoint = point;
    if (state.layerEditor.resizingBrush) {
      const delta = event.clientX - state.layerEditor.resizingBrush.startX;
      const size = clamp(Math.round(state.layerEditor.resizingBrush.startSize + delta / 3), 4, 140);
      state.layerEditor.brushSize = size;
      document.querySelector("#layerBrushSizeRange").value = String(size);
      document.querySelector("#layerBrushSizeValue").textContent = String(size);
      renderLayerEditor();
      event.preventDefault();
      return;
    }
    if (!state.layerEditor.drawing) {
      renderLayerEditor();
      return;
    }
    if (!point) return;
    if (state.layerEditor.tool === "move") {
      const sourcePoint = layerPointerToSource(event);
      const start = state.layerEditor.moveStart;
      if (!start || !sourcePoint) return;
      const dx = sourcePoint.x - start.pointer.x;
      const dy = sourcePoint.y - start.pointer.y;
      setEntrySourcePosition(state.layerEditor.entry, { x: start.position.x + dx, y: start.position.y + dy });
      state.layerEditor.dirty = true;
      state.canvas.requestRenderAll();
      renderLayerEditor();
      refreshLayerEditorLayerList();
      event.preventDefault();
      return;
    }
    if (state.layerEditor.tool === "cutrect") {
      state.layerEditor.rectEnd = point;
      renderLayerEditor();
      event.preventDefault();
      return;
    }
    applyLayerBrush(state.layerEditor.lastPoint || point, point);
    state.layerEditor.lastPoint = point;
    event.preventDefault();
  };
  const pointerStop = (event) => {
    const point = layerPointerToImage(event);
    state.layerEditor.hoverPoint = point;
    if (state.layerEditor.resizingBrush) {
      state.layerEditor.resizingBrush = null;
      renderLayerEditor();
      return;
    }
    if (state.layerEditor.drawing && state.layerEditor.tool === "cutrect") {
      const startPoint = state.layerEditor.rectStart;
      const endPoint = point || state.layerEditor.rectEnd;
      if (startPoint && endPoint) applyLayerCutRect(startPoint, endPoint);
      state.layerEditor.rectStart = null;
      state.layerEditor.rectEnd = null;
    }
    state.layerEditor.drawing = false;
    state.layerEditor.lastPoint = null;
    state.layerEditor.moveStart = null;
    renderLayerEditor();
  };
  const pointerLeave = () => {
    state.layerEditor.hoverPoint = null;
    if (!state.layerEditor.drawing && !state.layerEditor.resizingBrush) renderLayerEditor();
  };

  canvas.addEventListener("pointerdown", pointerStart);
  canvas.addEventListener("pointermove", pointerMove);
  canvas.addEventListener("pointerup", pointerStop);
  canvas.addEventListener("pointerleave", pointerLeave);

  new ResizeObserver(() => {
    if (state.layerEditor.visible) renderLayerEditor();
  }).observe(document.querySelector("#layerCanvasWrap"));
}

async function importImage() {
  if (state.busy) return;
  try {
    const payload = await api("PickImage");
    if (!payload?.dataUrl) return;
    await loadSource(payload.dataUrl, payload.name || "imagem");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Falha ao importar imagem.", "error");
  }
}

async function loadSource(dataUrl, name) {
  setBusy(true);
  setStatus("Carregando imagem…", "working");
  try {
    const image = await loadImageElement(dataUrl);
    state.source = dataUrl;
    state.sourceName = name.replace(/\.[^.]+$/, "") || "imagem";
    state.sourceImageElement = image;
    state.sourceCanvas = document.createElement("canvas");
    state.sourceCanvas.width = image.naturalWidth || image.width;
    state.sourceCanvas.height = image.naturalHeight || image.height;
    const ctx = state.sourceCanvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(image, 0, 0);

    clearCanvasCompletely();
    state.sourceFabric = new fabric.Image(image, {
      selectable: false,
      evented: false,
      opacity: 1,
      objectCaching: false,
      data: { role: "source" },
    });
    state.canvas.add(state.sourceFabric);
    state.sourceFabric.sendToBack();
    fitSourceToCanvas();
    resetViewport();
    document.querySelector("#emptyCanvas").classList.add("hidden");
    setStatus(`${name} carregada. Pronto para detectar objetos.`, "success");
    refreshLayerList();
  } finally {
    setBusy(false);
  }
}

function clearCanvasCompletely() {
  state.canvas.discardActiveObject();
  state.canvas.getObjects().forEach((object) => state.canvas.remove(object));
  state.entries = [];
  state.detectedBackground = null;
  clearManualOverlay();
  refreshLayerList();
  refreshSelectionUI();
}

function fitSourceToCanvas() {
  if (!state.sourceFabric || !state.sourceImageElement) return;
  const margin = 42;
  const width = state.canvas.getWidth() - margin * 2;
  const height = state.canvas.getHeight() - margin * 2;
  const naturalWidth = state.sourceImageElement.naturalWidth || state.sourceImageElement.width;
  const naturalHeight = state.sourceImageElement.naturalHeight || state.sourceImageElement.height;
  const scale = Math.min(width / naturalWidth, height / naturalHeight, 1.6);
  const displayWidth = naturalWidth * scale;
  const displayHeight = naturalHeight * scale;
  const left = (state.canvas.getWidth() - displayWidth) / 2;
  const top = (state.canvas.getHeight() - displayHeight) / 2;

  state.sourceFabric.set({ left, top, scaleX: scale, scaleY: scale });
  state.sourceFabric.setCoords();

  state.entries.forEach((entry) => {
    if (entry.detached) return;
    entry.object.set({
      left: left + entry.sourceBox.x * scale,
      top: top + entry.sourceBox.y * scale,
      scaleX: scale,
      scaleY: scale,
    });
    entry.object.setCoords();
  });
  syncAllEntryVisuals();
  state.canvas.requestRenderAll();
  constrainViewport();
  updateViewMeta();
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Não foi possível carregar a imagem."));
    image.src = src;
  });
}

function getSettings() {
  return {
    detail: Number(document.querySelector("#detailRange").value) || 4,
    threshold: Number(document.querySelector("#thresholdRange").value) || 20,
    colors: Number(document.querySelector("#colorsRange").value) || 32,
    removeBackground: document.querySelector("#removeBgToggle").checked,
  };
}

async function autoDetectObjects() {
  if (!state.sourceCanvas || state.busy) return;
  setBusy(true);
  clearEntries();
  setStatus("Analisando o layout da imagem…", "working");
  try {
    const settings = getSettings();
    const { boxes, background } = await detectRegionsAsync(state.sourceCanvas, settings);
    if (!boxes.length) throw new Error("Nenhuma região útil foi detectada.");

    state.detectedBackground = background;
    if (state.sourceFabric) state.sourceFabric.set({ opacity: 1 });

    for (let index = 0; index < boxes.length; index++) {
      createEntryFromBox(boxes[index], `Objeto ${index + 1}`, { activate: false, removeBackground: settings.removeBackground, sourceKind: "auto" });
      if (index % 12 === 11) {
        setStatus(`Montando objetos ${index + 1} de ${boxes.length}…`, "working");
        await nextFrame();
      }
    }

    const first = state.entries[0]?.object;
    if (first) state.canvas.setActiveObject(first);
    state.canvas.requestRenderAll();
    refreshLayerList();
    refreshSelectionUI();
    setStatus(`${state.entries.length} objetos detectados. Selecione um para refinar, copiar ou salvar em SVG fiel.`, "success");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Falha na análise da imagem.", "error");
  } finally {
    setBusy(false);
  }
}

async function detectRegionsAsync(sourceCanvas, settings) {
  const maxDimension = 1600;
  const scale = Math.min(1, maxDimension / Math.max(sourceCanvas.width, sourceCanvas.height));
  const width = Math.max(1, Math.round(sourceCanvas.width * scale));
  const height = Math.max(1, Math.round(sourceCanvas.height * scale));
  const analysis = document.createElement("canvas");
  analysis.width = width;
  analysis.height = height;
  const ctx = analysis.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(sourceCanvas, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);

  const worker = new Worker(new URL("./layout-worker.js", import.meta.url), { type: "module" });
  try {
    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("A análise da imagem excedeu o tempo limite.")), 25000);
      worker.onmessage = (event) => {
        const message = event.data || {};
        if (message.type === "progress") {
          setStatus(`${message.label || "Analisando"}…`, "working");
          return;
        }
        clearTimeout(timer);
        if (message.type === "result") resolve(message);
        else reject(new Error(message.message || "Falha ao analisar a imagem."));
      };
      worker.onerror = (event) => {
        clearTimeout(timer);
        reject(new Error(event.message || "Falha no worker de análise."));
      };
      worker.postMessage(
        {
          type: "detect",
          width,
          height,
          settings: {
            detail: settings.detail,
            threshold: settings.threshold,
          },
          buffer: imageData.data.buffer,
        },
        [imageData.data.buffer],
      );
    });

    const ratioX = sourceCanvas.width / width;
    const ratioY = sourceCanvas.height / height;
    return {
      background: result.background || { r: 255, g: 255, b: 255 },
      boxes: (result.boxes || []).map((box) => ({
        x: Math.max(0, Math.floor(box.x * ratioX)),
        y: Math.max(0, Math.floor(box.y * ratioY)),
        width: Math.max(2, Math.min(sourceCanvas.width - Math.floor(box.x * ratioX), Math.ceil(box.width * ratioX))),
        height: Math.max(2, Math.min(sourceCanvas.height - Math.floor(box.y * ratioY), Math.ceil(box.height * ratioY))),
      })),
    };
  } finally {
    worker.terminate();
  }
}

function dominantBorderColor(rgba, width, height) {
  const bins = new Map();
  const step = Math.max(1, Math.round(Math.max(width, height) / 700));
  const border = Math.max(2, Math.round(Math.min(width, height) * 0.018));
  const add = (x, y) => {
    const index = (y * width + x) * 4;
    if (rgba[index + 3] < 20) return;
    const r = rgba[index];
    const g = rgba[index + 1];
    const b = rgba[index + 2];
    const key = `${r >> 4},${g >> 4},${b >> 4}`;
    const entry = bins.get(key) || { count: 0, r: 0, g: 0, b: 0 };
    entry.count++;
    entry.r += r;
    entry.g += g;
    entry.b += b;
    bins.set(key, entry);
  };

  for (let x = 0; x < width; x += step) {
    for (let y = 0; y < border; y += step) add(x, y);
    for (let y = Math.max(0, height - border); y < height; y += step) add(x, y);
  }
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < border; x += step) add(x, y);
    for (let x = Math.max(0, width - border); x < width; x += step) add(x, y);
  }

  let best = null;
  bins.forEach((entry) => {
    if (!best || entry.count > best.count) best = entry;
  });
  if (!best?.count) return { r: 255, g: 255, b: 255 };
  return {
    r: Math.round(best.r / best.count),
    g: Math.round(best.g / best.count),
    b: Math.round(best.b / best.count),
  };
}

function dominantBorderColorFromSource() {
  if (state.detectedBackground) return state.detectedBackground;
  const source = state.sourceCanvas;
  const maxDimension = 1200;
  const scale = Math.min(1, maxDimension / Math.max(source.width, source.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const background = dominantBorderColor(data.data, canvas.width, canvas.height);
  state.detectedBackground = background;
  return background;
}

function createEntryFromBox(box, label, options = {}) {
  const baseSourceBox = normalizeSourceBox(box);
  const removeBackground = options.removeBackground ?? getSettings().removeBackground;
  const baseMaskCanvas = options.maskCanvas
    ? cloneCanvas(options.maskCanvas)
    : options.polygon
      ? buildPolygonMask(baseSourceBox, options.polygon, { removeBackground })
      : buildInitialMask(baseSourceBox, { removeBackground });

  const trimmed = trimMaskedAssets(baseSourceBox, baseMaskCanvas);
  const sourceBox = trimmed.sourceBox;
  const maskCanvas = trimmed.maskCanvas;
  const previewCanvas = trimmed.previewCanvas;
  const display = sourceBoxToDisplay(sourceBox);
  const scale = state.sourceFabric?.scaleX || 1;
  const object = new fabric.Image(previewCanvas, {
    left: display.left,
    top: display.top,
    originX: "left",
    originY: "top",
    width: Math.max(1, sourceBox.width),
    height: Math.max(1, sourceBox.height),
    scaleX: scale,
    scaleY: scale,
    opacity: shouldShowEntryPreview(false) ? 1 : 0.001,
    transparentCorners: false,
    cornerColor: "#7C83FF",
    borderColor: "#7C83FF",
    cornerStyle: "circle",
    objectCaching: false,
    data: {
      role: "entry",
      label,
    },
  });

  state.canvas.add(object);
  object.bringToFront();

  const entry = {
    id: crypto.randomUUID(),
    groupId: options.groupId || crypto.randomUUID(),
    groupLabel: options.groupLabel || label,
    sourceKind: options.sourceKind || "manual",
    label,
    object,
    sourceBox,
    maskCanvas,
    previewCanvas,
    baseCanvas: cloneCanvas(previewCanvas),
    opacity: clamp(options.opacity ?? 1, 0, 1),
    vectorSvg: null,
    detached: !!options.detached,
    visible: options.visible !== false,
    locked: !!options.locked,
  };
  object.set({ opacity: shouldShowEntryPreview(entry.detached) ? entry.opacity : 0.001 });
  state.entries.push(entry);

  if (options.activate !== false) state.canvas.setActiveObject(object);
  state.canvas.requestRenderAll();
  refreshLayerList();
  refreshSelectionUI();
  return entry;
}

function normalizeSourceBox(box) {
  return {
    x: Math.max(0, Math.floor(box.x)),
    y: Math.max(0, Math.floor(box.y)),
    width: Math.max(2, Math.ceil(box.width)),
    height: Math.max(2, Math.ceil(box.height)),
  };
}

function buildInitialMask(box, options = {}) {
  const maskCanvas = createAlphaCanvas(box.width, box.height);
  const maskCtx = maskCanvas.getContext("2d", { willReadFrequently: true });
  const maskImage = maskCtx.createImageData(box.width, box.height);
  const settings = getSettings();
  const threshold = settings.threshold;
  const removeBackground = options.removeBackground ?? settings.removeBackground;
  const bg = dominantBorderColorFromSource();
  const sourceCtx = state.sourceCanvas.getContext("2d", { willReadFrequently: true });
  const crop = sourceCtx.getImageData(box.x, box.y, box.width, box.height);

  for (let index = 0; index < crop.data.length; index += 4) {
    const alpha = crop.data[index + 3];
    const keep = alpha > 20;
    const value = keep ? 255 : 0;
    maskImage.data[index] = 255;
    maskImage.data[index + 1] = 255;
    maskImage.data[index + 2] = 255;
    maskImage.data[index + 3] = value;
  }

  if (removeBackground) {
    removeConnectedBackgroundFromMask(crop.data, maskImage.data, box.width, box.height, bg, threshold);
  }

  maskCtx.putImageData(maskImage, 0, 0);
  return maskCanvas;
}

function buildPolygonMask(box, polygon, options = {}) {
  const maskCanvas = createAlphaCanvas(box.width, box.height);
  const ctx = maskCanvas.getContext("2d", { alpha: true, willReadFrequently: true });
  ctx.clearRect(0, 0, box.width, box.height);
  ctx.fillStyle = "rgba(255,255,255,1)";
  ctx.beginPath();
  polygon.forEach((point, index) => {
    const x = point.x - box.x;
    const y = point.y - box.y;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fill();

  const settings = getSettings();
  const removeBackground = options.removeBackground ?? settings.removeBackground;
  if (removeBackground) {
    const sourceCtx = state.sourceCanvas.getContext("2d", { willReadFrequently: true });
    const crop = sourceCtx.getImageData(box.x, box.y, box.width, box.height);
    const maskData = ctx.getImageData(0, 0, box.width, box.height);
    const bg = dominantBorderColorFromSource();
    const threshold = settings.threshold;
    removeConnectedBackgroundFromMask(crop.data, maskData.data, box.width, box.height, bg, threshold);
    ctx.putImageData(maskData, 0, 0);
  }

  return maskCanvas;
}

function removeConnectedBackgroundFromMask(sourceRGBA, maskRGBA, width, height, background, threshold) {
  const total = width * height;
  const candidate = new Uint8Array(total);
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  const maxDistance = Math.max(6, threshold * 2.2);
  let head = 0;
  let tail = 0;

  for (let index = 0; index < total; index++) {
    const offset = index * 4;
    if (maskRGBA[offset + 3] === 0) continue;
    if (sourceRGBA[offset + 3] <= 20) {
      candidate[index] = 1;
      continue;
    }
    const dist = colorDistance(
      sourceRGBA[offset],
      sourceRGBA[offset + 1],
      sourceRGBA[offset + 2],
      background.r,
      background.g,
      background.b,
    );
    if (dist <= maxDistance) candidate[index] = 1;
  }

  const push = (index) => {
    if (!candidate[index] || visited[index]) return;
    visited[index] = 1;
    queue[tail++] = index;
  };

  for (let x = 0; x < width; x++) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    push(y * width);
    push(y * width + (width - 1));
  }

  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) push(index - 1);
    if (x < width - 1) push(index + 1);
    if (y > 0) push(index - width);
    if (y < height - 1) push(index + width);
  }

  for (let index = 0; index < total; index++) {
    if (!visited[index]) continue;
    maskRGBA[index * 4 + 3] = 0;
  }
}

function createAlphaCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  return canvas;
}

function cloneCanvas(source) {
  const canvas = createAlphaCanvas(source.width, source.height);
  canvas.getContext("2d").drawImage(source, 0, 0);
  return canvas;
}

function renderMaskedCropCanvas(box, maskCanvas) {
  const crop = createAlphaCanvas(box.width, box.height);
  const ctx = crop.getContext("2d", { alpha: true, willReadFrequently: true });
  ctx.drawImage(
    state.sourceCanvas,
    box.x,
    box.y,
    box.width,
    box.height,
    0,
    0,
    box.width,
    box.height,
  );
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(maskCanvas, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  return crop;
}

function findOpaqueBounds(maskCanvas, alphaThreshold = 2) {
  const ctx = maskCanvas.getContext("2d", { willReadFrequently: true });
  const { width, height } = maskCanvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha <= alphaThreshold) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) {
    return { x: 0, y: 0, width, height, empty: true };
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    empty: false,
  };
}

function cropCanvasRegion(sourceCanvas, bounds) {
  const canvas = createAlphaCanvas(bounds.width, bounds.height);
  canvas.getContext("2d").drawImage(
    sourceCanvas,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    0,
    0,
    bounds.width,
    bounds.height,
  );
  return canvas;
}

function trimMaskedAssets(sourceBox, maskCanvas) {
  const bounds = findOpaqueBounds(maskCanvas, 2);
  if (bounds.empty) {
    return {
      sourceBox: { ...sourceBox },
      maskCanvas: cloneCanvas(maskCanvas),
      previewCanvas: renderMaskedCropCanvas(sourceBox, maskCanvas),
      trimOffsetX: 0,
      trimOffsetY: 0,
    };
  }

  const trimmedSourceBox = {
    x: sourceBox.x + bounds.x,
    y: sourceBox.y + bounds.y,
    width: bounds.width,
    height: bounds.height,
  };
  const trimmedMaskCanvas = cropCanvasRegion(maskCanvas, bounds);
  const previewCanvas = renderMaskedCropCanvas(trimmedSourceBox, trimmedMaskCanvas);
  return {
    sourceBox: trimmedSourceBox,
    maskCanvas: trimmedMaskCanvas,
    previewCanvas,
    trimOffsetX: bounds.x,
    trimOffsetY: bounds.y,
  };
}

function sourceBoxToDisplay(box) {
  const scale = state.sourceFabric?.scaleX || 1;
  return {
    left: (state.sourceFabric?.left || 0) + box.x * scale,
    top: (state.sourceFabric?.top || 0) + box.y * scale,
  };
}

function isSourceVisible() {
  return !!state.sourceFabric?.visible;
}

function shouldShowEntryPreview(detached) {
  return detached || !isSourceVisible();
}

function syncEntryVisual(entry) {
  if (!entry?.object) return;
  const opacity = clamp(entry.opacity ?? 1, 0, 1);
  const visible = isEntryVisible(entry);
  entry.object.set({
    opacity: visible ? (shouldShowEntryPreview(entry.detached) ? opacity : 0.001) : 0.001,
    evented: visible && !isEntryLocked(entry),
    selectable: visible && !isEntryLocked(entry),
    hasControls: !isEntryLocked(entry),
    lockMovementX: isEntryLocked(entry),
    lockMovementY: isEntryLocked(entry),
    lockScalingX: isEntryLocked(entry),
    lockScalingY: isEntryLocked(entry),
    lockRotation: isEntryLocked(entry),
  });
  entry.object.dirty = true;
}

function syncAllEntryVisuals() {
  state.entries.forEach(syncEntryVisual);
}

function setMode(mode) {
  if (!state.source && mode !== "select") return;
  state.mode = mode;
  clearManualOverlay();
  state.canvas.selection = mode === "select";
  state.canvas.defaultCursor = mode === "select" ? "default" : "crosshair";
  ["selectModeBtn", "rectModeBtn", "lassoModeBtn"].forEach((id) => document.getElementById(id).classList.remove("active"));
  document.getElementById(mode === "select" ? "selectModeBtn" : mode === "rect" ? "rectModeBtn" : "lassoModeBtn").classList.add("active");
  setStatus(
    mode === "select"
      ? "Modo de seleção."
      : mode === "rect"
        ? "Clique e arraste para criar um novo objeto recortado."
        : "Clique para criar pontos. Pressione Enter para finalizar a máscara.",
  );
}

function handleCanvasMouseDown(event) {
  if (state.maskEditor.visible) return;
  hideContextMenu();
  const nativeEvent = event?.e;
  if (nativeEvent && (nativeEvent.button === 2 || nativeEvent.buttons === 2)) {
    beginPanMode(nativeEvent);
    return;
  }

  if (state.busy || !state.source) return;
  if (state.mode === "lasso") {
    const pointer = state.canvas.getPointer(nativeEvent);
    addLassoPoint(pointer);
    return;
  }
  if (state.mode === "rect") beginRectangleSelection(nativeEvent);
}

function beginRectangleSelection(event) {
  const start = state.canvas.getPointer(event);
  const rect = new fabric.Rect({
    left: start.x,
    top: start.y,
    width: 1,
    height: 1,
    fill: "rgba(124,131,255,0.12)",
    stroke: "#7C83FF",
    strokeWidth: 1,
    strokeDashArray: [7, 5],
    selectable: false,
    evented: false,
    data: { role: "temp" },
  });
  state.canvas.add(rect);

  const move = (opt) => {
    const point = state.canvas.getPointer(opt.e);
    rect.set({
      left: Math.min(start.x, point.x),
      top: Math.min(start.y, point.y),
      width: Math.abs(point.x - start.x),
      height: Math.abs(point.y - start.y),
    });
    state.canvas.requestRenderAll();
  };

  const up = async (opt) => {
    state.canvas.off("mouse:move", move);
    state.canvas.off("mouse:up", up);
    state.canvas.remove(rect);
    const point = state.canvas.getPointer(opt.e);
    const displayBox = {
      left: Math.min(start.x, point.x),
      top: Math.min(start.y, point.y),
      width: Math.abs(point.x - start.x),
      height: Math.abs(point.y - start.y),
    };
    const sourceBox = displayBoxToSource(displayBox);
    setMode("select");
    if (sourceBox.width < 5 || sourceBox.height < 5) return;

    setBusy(true);
    try {
      setStatus("Criando novo objeto da seleção…", "working");
      createEntryFromBox(sourceBox, `Seleção ${state.entries.length + 1}`, { removeBackground: false, sourceKind: "manual" });
      setStatus("Objeto criado. Você pode refinar a máscara com pincel ou borracha.", "success");
    } finally {
      setBusy(false);
    }
  };

  state.canvas.on("mouse:move", move);
  state.canvas.on("mouse:up", up);
}

function displayBoxToSource(box) {
  const scale = state.sourceFabric?.scaleX || 1;
  const left = state.sourceFabric?.left || 0;
  const top = state.sourceFabric?.top || 0;
  const x = Math.max(0, (box.left - left) / scale);
  const y = Math.max(0, (box.top - top) / scale);
  const right = Math.min(state.sourceCanvas.width, (box.left + box.width - left) / scale);
  const bottom = Math.min(state.sourceCanvas.height, (box.top + box.height - top) / scale);
  return {
    x: Math.floor(x),
    y: Math.floor(y),
    width: Math.max(1, Math.ceil(right - x)),
    height: Math.max(1, Math.ceil(bottom - y)),
  };
}

function addLassoPoint(pointer) {
  state.manualPoints.push(pointer);
  const marker = new fabric.Circle({
    left: pointer.x - 4,
    top: pointer.y - 4,
    radius: 4,
    fill: "#7C83FF",
    stroke: "#FFFFFF",
    strokeWidth: 1,
    selectable: false,
    evented: false,
    data: { role: "temp" },
  });
  state.manualMarkers.push(marker);
  state.canvas.add(marker);

  if (state.manualPolyline) state.canvas.remove(state.manualPolyline);
  state.manualPolyline = new fabric.Polyline(state.manualPoints, {
    fill: state.manualPoints.length >= 3 ? "rgba(124,131,255,0.10)" : "transparent",
    stroke: "#7C83FF",
    strokeWidth: 2,
    strokeDashArray: [7, 5],
    selectable: false,
    evented: false,
    data: { role: "temp" },
  });
  state.canvas.add(state.manualPolyline);
  state.manualMarkers.forEach((item) => item.bringToFront());
  state.canvas.requestRenderAll();
}

async function finishLasso() {
  if (state.manualPoints.length < 3) return;
  const points = [...state.manualPoints];
  const scale = state.sourceFabric?.scaleX || 1;
  const left = state.sourceFabric?.left || 0;
  const top = state.sourceFabric?.top || 0;
  const sourcePoints = points.map((point) => ({
    x: Math.max(0, Math.min(state.sourceCanvas.width, (point.x - left) / scale)),
    y: Math.max(0, Math.min(state.sourceCanvas.height, (point.y - top) / scale)),
  }));
  const xs = sourcePoints.map((point) => point.x);
  const ys = sourcePoints.map((point) => point.y);
  const box = {
    x: Math.floor(Math.min(...xs)),
    y: Math.floor(Math.min(...ys)),
    width: Math.max(2, Math.ceil(Math.max(...xs) - Math.min(...xs))),
    height: Math.max(2, Math.ceil(Math.max(...ys) - Math.min(...ys))),
  };
  clearManualOverlay();
  setMode("select");
  setBusy(true);
  try {
    setStatus("Criando objeto com máscara manual…", "working");
    createEntryFromBox(box, `Máscara ${state.entries.length + 1}`, { polygon: sourcePoints, removeBackground: false, sourceKind: "manual" });
    setStatus("Objeto criado com máscara manual. Refine com pincel ou borracha se quiser.", "success");
  } finally {
    setBusy(false);
  }
}

function clearManualOverlay() {
  state.manualMarkers.forEach((item) => state.canvas?.remove(item));
  if (state.manualPolyline) state.canvas?.remove(state.manualPolyline);
  state.manualMarkers = [];
  state.manualPoints = [];
  state.manualPolyline = null;
  state.canvas?.requestRenderAll();
}

function clearEntries() {
  state.canvas?.discardActiveObject();
  for (const entry of state.entries) state.canvas?.remove(entry.object);
  state.entries = [];
  if (state.sourceFabric) state.sourceFabric.set({ opacity: 1 });
  state.canvas?.requestRenderAll();
  refreshLayerList();
  refreshSelectionUI();
}

function deleteEntry(entry, options = {}) {
  if (!entry) return;
  if (isEntryLocked(entry)) { setStatus("Camada bloqueada. Desbloqueie para excluir.", "error"); return; }
  const currentGroup = getEntryGroupEntries(entry, true).filter((item) => item.id !== entry.id);
  const deletingActiveLayerEditor = !!options.fromLayerEditor && state.layerEditor.visible && state.layerEditor.entry?.id === entry.id;
  state.canvas.remove(entry.object);
  state.entries = state.entries.filter((item) => item !== entry);
  state.canvas.discardActiveObject();
  state.canvas.requestRenderAll();
  refreshLayerList();
  refreshSelectionUI();
  if (deletingActiveLayerEditor) {
    if (currentGroup.length) {
      switchLayerEditorEntry(currentGroup[currentGroup.length - 1]);
    } else {
      closeLayerEditor();
      setStatus("Camada excluída.", "done");
    }
  } else if (options.fromLayerEditor && state.layerEditor.visible) {
    renderLayerEditor();
    refreshLayerEditorLayerList();
    setStatus("Camada excluída.", "done");
  }
}

function deleteSelected() {
  const entry = selectedEntry();
  if (!entry) return;
  deleteEntry(entry);
}

function openMaskEditor(entry) {
  if (!entry || state.busy) return;
  if (isEntryLocked(entry)) { setStatus("Camada bloqueada. Desbloqueie para editar a máscara.", "error"); return; }
  state.maskEditor.visible = true;
  state.maskEditor.entry = entry;
  state.maskEditor.box = { ...entry.sourceBox };
  state.maskEditor.maskCanvas = cloneCanvas(entry.maskCanvas);
  state.maskEditor.tool = "brush";
  state.maskEditor.brushSize = Number(document.querySelector("#maskBrushSizeRange").value) || 24;
  state.maskEditor.drawing = false;
  state.maskEditor.lastPoint = null;
  setMaskTool("brush");
  document.querySelector("#maskModal").classList.remove("hidden");
  renderMaskEditor();
  setStatus(`Refinando máscara de ${entry.label}.`, "working");
}

function closeMaskEditor() {
  if (!state.maskEditor.visible) return;
  state.maskEditor.visible = false;
  state.maskEditor.entry = null;
  state.maskEditor.box = null;
  state.maskEditor.maskCanvas = null;
  state.maskEditor.fit = null;
  state.maskEditor.drawing = false;
  state.maskEditor.lastPoint = null;
  document.querySelector("#maskModal").classList.add("hidden");
  refreshSelectionUI();
  setStatus("Edição de máscara encerrada.");
}

function setMaskTool(tool) {
  state.maskEditor.tool = tool;
  document.querySelector("#brushToolBtn").classList.toggle("active", tool === "brush");
  document.querySelector("#eraserToolBtn").classList.toggle("active", tool === "eraser");
}

function renderMaskEditor() {
  if (!state.maskEditor.visible || !state.maskEditor.maskCanvas || !state.maskEditor.box) return;
  const wrap = document.querySelector("#maskCanvasWrap");
  const canvas = document.querySelector("#maskEditorCanvas");
  const ctx = canvas.getContext("2d");
  const box = state.maskEditor.box;
  const width = Math.max(360, wrap.clientWidth - 16);
  const height = Math.max(280, wrap.clientHeight - 16);
  canvas.width = width;
  canvas.height = height;

  const scale = Math.min((width - 24) / box.width, (height - 24) / box.height);
  const drawWidth = Math.max(1, box.width * scale);
  const drawHeight = Math.max(1, box.height * scale);
  const offsetX = (width - drawWidth) / 2;
  const offsetY = (height - drawHeight) / 2;
  state.maskEditor.fit = { scale, offsetX, offsetY, width: drawWidth, height: drawHeight };

  ctx.clearRect(0, 0, width, height);
  drawCheckerboard(ctx, offsetX, offsetY, drawWidth, drawHeight);

  const rawCrop = createAlphaCanvas(box.width, box.height);
  rawCrop.getContext("2d").drawImage(
    state.sourceCanvas,
    box.x,
    box.y,
    box.width,
    box.height,
    0,
    0,
    box.width,
    box.height,
  );
  ctx.globalAlpha = 0.28;
  ctx.drawImage(rawCrop, offsetX, offsetY, drawWidth, drawHeight);
  ctx.globalAlpha = 1;

  const preview = renderMaskedCropCanvas(box, state.maskEditor.maskCanvas);
  ctx.drawImage(preview, offsetX, offsetY, drawWidth, drawHeight);

  const overlay = tintMaskCanvas(state.maskEditor.maskCanvas, "rgba(111,115,255,0.28)");
  ctx.drawImage(overlay, offsetX, offsetY, drawWidth, drawHeight);

  ctx.strokeStyle = "#7C83FF";
  ctx.lineWidth = 1;
  ctx.strokeRect(offsetX + 0.5, offsetY + 0.5, drawWidth - 1, drawHeight - 1);
}

function drawCheckerboard(ctx, x, y, width, height) {
  const size = 14;
  for (let py = 0; py < height; py += size) {
    for (let px = 0; px < width; px += size) {
      const even = ((px / size) + (py / size)) % 2 === 0;
      ctx.fillStyle = even ? "#182031" : "#111827";
      ctx.fillRect(x + px, y + py, Math.min(size, width - px), Math.min(size, height - py));
    }
  }
}

function tintMaskCanvas(maskCanvas, rgba) {
  const tinted = createAlphaCanvas(maskCanvas.width, maskCanvas.height);
  const ctx = tinted.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = rgba;
  ctx.fillRect(0, 0, tinted.width, tinted.height);
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(maskCanvas, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  return tinted;
}

function maskPointerToImage(event) {
  const fit = state.maskEditor.fit;
  const box = state.maskEditor.box;
  if (!fit || !box) return null;
  const canvas = document.querySelector("#maskEditorCanvas");
  const rect = canvas.getBoundingClientRect();
  const clientX = event.clientX ?? event.touches?.[0]?.clientX;
  const clientY = event.clientY ?? event.touches?.[0]?.clientY;
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  if (x < fit.offsetX || y < fit.offsetY || x > fit.offsetX + fit.width || y > fit.offsetY + fit.height) return null;
  return {
    x: Math.max(0, Math.min(box.width - 1, (x - fit.offsetX) / fit.scale)),
    y: Math.max(0, Math.min(box.height - 1, (y - fit.offsetY) / fit.scale)),
  };
}

function applyBrushPoint(from, to) {
  const editor = state.maskEditor;
  if (!editor.maskCanvas) return;
  const ctx = editor.maskCanvas.getContext("2d", { alpha: true, willReadFrequently: true });
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(255,255,255,1)";
  ctx.fillStyle = "rgba(255,255,255,1)";
  ctx.lineWidth = editor.brushSize;
  if (editor.tool === "eraser") ctx.globalCompositeOperation = "destination-out";
  else ctx.globalCompositeOperation = "source-over";

  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(to.x, to.y, editor.brushSize / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  renderMaskEditor();
}

function openLayerEditor(entry, options = {}) {
  if (!entry || state.busy) return;
  if (isEntryLocked(entry)) { setStatus("Camada bloqueada. Desbloqueie para editar.", "error"); return; }
  if (state.layerEditor.visible && state.layerEditor.entry && state.layerEditor.entry.id !== entry.id && !options.skipPersist) {
    persistLayerEditorToEntry(true);
  }
  state.layerEditor.visible = true;
  state.layerEditor.entry = entry;
  state.layerEditor.workingCanvas = cloneCanvas(entry.previewCanvas || renderMaskedCropCanvas(entry.sourceBox, entry.maskCanvas));
  state.layerEditor.baseCanvas = cloneCanvas(entry.baseCanvas || entry.previewCanvas || renderMaskedCropCanvas(entry.sourceBox, entry.maskCanvas));
  state.layerEditor.tool = "erase";
  state.layerEditor.brushSize = Number(document.querySelector("#layerBrushSizeRange").value) || 32;
  state.layerEditor.drawing = false;
  state.layerEditor.lastPoint = null;
  state.layerEditor.fit = null;
  state.layerEditor.opacity = clamp(entry.opacity ?? 1, 0, 1);
  state.layerEditor.dirty = false;
  state.layerEditor.rectStart = null;
  state.layerEditor.rectEnd = null;
  document.querySelector("#layerPaintColorInput").value = state.layerEditor.paintColor || "#6f73ff";
  document.querySelector("#layerBlendModeBtn").classList.toggle("active", !!state.layerEditor.blendMode);
  document.querySelector("#layerOpacityModalRange").value = String(Math.round(state.layerEditor.opacity * 100));
  document.querySelector("#layerOpacityModalValue").textContent = `${Math.round(state.layerEditor.opacity * 100)}%`;
  const layerPanelOpacityEcho = document.querySelector("#layerPanelOpacityEcho");
  if (layerPanelOpacityEcho) layerPanelOpacityEcho.textContent = `${Math.round(state.layerEditor.opacity * 100)}%`;
  document.querySelector("#layerBrushSizeValue").textContent = String(state.layerEditor.brushSize);
  setLayerTool("erase");
  document.querySelector("#layerModal").classList.remove("hidden");
  renderLayerEditor();
  refreshLayerEditorLayerList();
  setStatus(`Editando camada de ${entry.label}.`, "working");
}

function closeLayerEditor() {
  if (!state.layerEditor.visible) return;
  state.layerEditor.visible = false;
  state.layerEditor.entry = null;
  state.layerEditor.workingCanvas = null;
  state.layerEditor.baseCanvas = null;
  state.layerEditor.fit = null;
  state.layerEditor.drawing = false;
  state.layerEditor.lastPoint = null;
  state.layerEditor.hoverPoint = null;
  state.layerEditor.moveStart = null;
  state.layerEditor.rectStart = null;
  state.layerEditor.rectEnd = null;
  state.layerEditor.resizingBrush = null;
  state.layerEditor.dirty = false;
  document.querySelector("#layerModal").classList.add("hidden");
  const list = document.querySelector("#layerEditorLayerList");
  if (list) {
    list.className = "layer-editor-layer-list empty-state";
    list.textContent = "Nenhuma camada para editar.";
  }
  setStatus("Edição de camada encerrada.");
}

function setLayerTool(tool) {
  state.layerEditor.tool = tool;
  state.layerEditor.rectStart = null;
  state.layerEditor.rectEnd = null;
  state.layerEditor.resizingBrush = null;
  document.querySelector("#layerMoveToolBtn").classList.toggle("active", tool === "move");
  document.querySelector("#layerEraseToolBtn").classList.toggle("active", tool === "erase");
  document.querySelector("#layerRestoreToolBtn").classList.toggle("active", tool === "restore");
  document.querySelector("#layerPaintToolBtn").classList.toggle("active", tool === "paint");
  document.querySelector("#layerCutToolBtn").classList.toggle("active", tool === "cutrect");
  document.querySelector("#layerBlendModeBtn").classList.toggle("active", !!state.layerEditor.blendMode);
  const canvas = document.querySelector("#layerEditorCanvas");
  if (canvas) canvas.style.cursor = tool === "move" ? "grab" : "crosshair";
  renderLayerEditor();
}

function toggleLayerBlendMode() {
  state.layerEditor.blendMode = !state.layerEditor.blendMode;
  document.querySelector("#layerBlendModeBtn").classList.toggle("active", !!state.layerEditor.blendMode);
  renderLayerEditor();
}

function getEntrySourcePosition(entry) {
  const scale = state.sourceFabric?.scaleX || 1;
  const left = Number(entry?.object?.left ?? sourceBoxToDisplay(entry?.sourceBox || { x: 0 }).left) || 0;
  const top = Number(entry?.object?.top ?? sourceBoxToDisplay(entry?.sourceBox || { y: 0 }).top) || 0;
  return {
    x: Math.round(((left - (state.sourceFabric?.left || 0)) / scale) * 100) / 100,
    y: Math.round(((top - (state.sourceFabric?.top || 0)) / scale) * 100) / 100,
  };
}

function setEntrySourcePosition(entry, position) {
  if (!entry?.object) return;
  const scale = state.sourceFabric?.scaleX || 1;
  entry.object.set({
    left: (state.sourceFabric?.left || 0) + position.x * scale,
    top: (state.sourceFabric?.top || 0) + position.y * scale,
  });
  entry.object.setCoords();
}

function layerPointerToSource(event) {
  const fit = state.layerEditor.fit;
  const active = state.layerEditor.entry;
  if (!fit || !active) return null;
  const local = layerPointerToImage(event);
  if (!local) return null;
  const activePosition = getEntrySourcePosition(active);
  return {
    x: activePosition.x + local.x,
    y: activePosition.y + local.y,
  };
}

function drawLayerEditorCursor(ctx) {
  const point = state.layerEditor.hoverPoint;
  const fit = state.layerEditor.fit;
  if (!point || !fit || !state.layerEditor.visible) return;
  const radius = Math.max(2, (state.layerEditor.brushSize * fit.scale) / 2);
  const centerX = fit.offsetX + point.x * fit.scale;
  const centerY = fit.offsetY + point.y * fit.scale;
  ctx.save();
  ctx.fillStyle = "rgba(255, 70, 70, 0.16)";
  ctx.strokeStyle = "rgba(255, 110, 110, 0.7)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawLayerEditorRectPreview(ctx) {
  const fit = state.layerEditor.fit;
  const start = state.layerEditor.rectStart;
  const end = state.layerEditor.rectEnd;
  if (!fit || !start || !end) return;
  const left = Math.min(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  ctx.save();
  ctx.fillStyle = "rgba(255, 110, 110, 0.18)";
  ctx.strokeStyle = "rgba(255, 110, 110, 0.85)";
  ctx.lineWidth = 1;
  ctx.fillRect(fit.offsetX + left * fit.scale, fit.offsetY + top * fit.scale, Math.max(1, width * fit.scale), Math.max(1, height * fit.scale));
  ctx.strokeRect(fit.offsetX + left * fit.scale + 0.5, fit.offsetY + top * fit.scale + 0.5, Math.max(1, width * fit.scale), Math.max(1, height * fit.scale));
  ctx.restore();
}

function hexToRgba(hex, alpha = 1) {
  const value = String(hex || "#6f73ff").replace("#", "").trim();
  const normalized = value.length === 3
    ? value.split("").map((x) => x + x).join("")
    : value.padEnd(6, "0").slice(0, 6);
  const num = Number.parseInt(normalized, 16) || 0;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function buildRectMask(width, height, from, to) {
  const mask = createAlphaCanvas(width, height);
  const ctx = mask.getContext("2d", { alpha: true });
  const left = Math.max(0, Math.min(from.x, to.x));
  const top = Math.max(0, Math.min(from.y, to.y));
  const rectWidth = Math.min(width - left, Math.abs(to.x - from.x));
  const rectHeight = Math.min(height - top, Math.abs(to.y - from.y));
  ctx.fillStyle = "rgba(255,255,255,1)";
  ctx.fillRect(left, top, Math.max(1, rectWidth), Math.max(1, rectHeight));
  return mask;
}

function renderLayerEditor() {
  if (!state.layerEditor.visible || !state.layerEditor.workingCanvas || !state.layerEditor.entry) return;
  const wrap = document.querySelector("#layerCanvasWrap");
  const canvas = document.querySelector("#layerEditorCanvas");
  const ctx = canvas.getContext("2d");
  const activeEntry = state.layerEditor.entry;
  const activeCanvas = state.layerEditor.workingCanvas;
  const availableWidth = Math.max(240, wrap.clientWidth - 24);
  const availableHeight = Math.max(220, wrap.clientHeight - 24);
  const scale = Math.min(availableWidth / activeCanvas.width, availableHeight / activeCanvas.height);
  const drawWidth = Math.max(1, activeCanvas.width * scale);
  const drawHeight = Math.max(1, activeCanvas.height * scale);
  canvas.width = Math.ceil(drawWidth + 24);
  canvas.height = Math.ceil(drawHeight + 24);
  const offsetX = (canvas.width - drawWidth) / 2;
  const offsetY = (canvas.height - drawHeight) / 2;
  state.layerEditor.fit = { scale, offsetX, offsetY, width: drawWidth, height: drawHeight };

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawCheckerboard(ctx, offsetX, offsetY, drawWidth, drawHeight);

  const activePos = getEntrySourcePosition(activeEntry);
  getEntryGroupEntries(activeEntry, true).forEach((entry) => {
    if (entry.id !== activeEntry.id && !isEntryVisible(entry)) return;
    const entryCanvas = entry.id === activeEntry.id
      ? activeCanvas
      : (entry.previewCanvas || renderMaskedCropCanvas(entry.sourceBox, entry.maskCanvas));
    if (!entryCanvas) return;
    const entryPos = getEntrySourcePosition(entry);
    const localX = offsetX + (entryPos.x - activePos.x) * scale;
    const localY = offsetY + (entryPos.y - activePos.y) * scale;
    const alpha = entry.id === activeEntry.id
      ? clamp(state.layerEditor.opacity ?? 1, 0, 1)
      : clamp(entry.opacity ?? 1, 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(entryCanvas, localX, localY, entry.sourceBox.width * scale, entry.sourceBox.height * scale);
    ctx.restore();
  });

  ctx.save();
  ctx.strokeStyle = "#7C83FF";
  ctx.lineWidth = 1;
  ctx.strokeRect(offsetX + 0.5, offsetY + 0.5, Math.max(1, drawWidth - 1), Math.max(1, drawHeight - 1));
  ctx.restore();

  if (state.layerEditor.tool === "cutrect" && state.layerEditor.rectStart && state.layerEditor.rectEnd) {
    drawLayerEditorRectPreview(ctx);
  } else if (state.layerEditor.tool !== "move") {
    drawLayerEditorCursor(ctx);
  }
}

function refreshLayerEditorLayerList() {
  const list = document.querySelector("#layerEditorLayerList");
  if (!list) return;
  if (!state.layerEditor.visible || !state.entries.length) {
    list.className = "layer-editor-layer-list empty-state";
    list.textContent = "Nenhuma camada para editar.";
    return;
  }
  syncEntriesOrderFromCanvas();
  const active = state.layerEditor.entry;
  const displayEntries = getEntryGroupEntries(active, false);
  list.className = "layer-editor-layer-list photoshop-layer-list";
  list.innerHTML = displayEntries.map((entry, index) => {
    const thumb = entry.previewCanvas?.toDataURL ? entry.previewCanvas.toDataURL("image/png") : "";
    const opacityValue = Math.round(((entry.id === active?.id ? state.layerEditor.opacity : (entry.opacity ?? 1)) * 100));
    const positionLabel = index === 0 ? "Topo" : index === displayEntries.length - 1 ? "Base" : String(displayEntries.length - index).padStart(2, "0");
    return `
      <div class="ps-layer-row ${active?.id === entry.id ? "active" : ""}" data-layer-editor-entry-id="${entry.id}">
        <button class="ps-layer-visibility" data-layer-action="visibility" data-layer-editor-action-id="${entry.id}" title="${isEntryVisible(entry) ? "Ocultar camada" : "Mostrar camada"}">${isEntryVisible(entry) ? "◉" : "○"}</button>
        <button class="ps-layer-main ${active?.id === entry.id ? "active" : ""}" data-layer-editor-select-id="${entry.id}" title="Selecionar camada">
          <span class="ps-layer-thumb" style="background-image:url('${thumb}');"></span>
          <span class="ps-layer-info">
            <strong>${escapeHtml(entry.label)}</strong>
            <small>${positionLabel} • ${entry.sourceBox.width}×${entry.sourceBox.height}px • ${opacityValue}%${isEntryLocked(entry) ? ' • bloqueada' : ''}${isEntryVisible(entry) ? '' : ' • oculta'}</small>
          </span>
          <span class="ps-layer-lock">${isEntryLocked(entry) ? "🔒" : ""}</span>
        </button>
        <div class="ps-layer-actions">
          <button class="mini-btn icon-mini" data-layer-action="lock" data-layer-editor-action-id="${entry.id}" title="${isEntryLocked(entry) ? "Desbloquear" : "Bloquear"}">${isEntryLocked(entry) ? "🔓" : "🔒"}</button>
          <button class="mini-btn icon-mini" data-layer-action="up" data-layer-editor-action-id="${entry.id}" title="Subir">↑</button>
          <button class="mini-btn icon-mini" data-layer-action="down" data-layer-editor-action-id="${entry.id}" title="Descer">↓</button>
          <button class="mini-btn icon-mini" data-layer-action="front" data-layer-editor-action-id="${entry.id}" title="Trazer para frente">⇧</button>
          <button class="mini-btn icon-mini" data-layer-action="back" data-layer-editor-action-id="${entry.id}" title="Enviar para trás">⇩</button>
          <button class="mini-btn icon-mini danger-mini" data-layer-action="delete" data-layer-editor-action-id="${entry.id}" title="Excluir camada">🗑</button>
        </div>
      </div>
    `;
  }).join("");
  list.querySelectorAll("[data-layer-editor-select-id]").forEach((button) => {
    button.onclick = () => {
      const entry = state.entries.find((item) => item.id === button.dataset.layerEditorSelectId);
      if (!entry) return;
      switchLayerEditorEntry(entry);
    };
  });
  list.querySelectorAll("[data-layer-editor-action-id]").forEach((button) => {
    button.onclick = (event) => {
      event.stopPropagation();
      const entry = state.entries.find((item) => item.id === button.dataset.layerEditorActionId);
      if (!entry) return;
      moveEntryFromEditor(entry, button.dataset.layerAction);
    };
  });
}

function switchLayerEditorEntry(entry) {
  if (!entry) return;
  if (state.layerEditor.visible && state.layerEditor.entry?.id === entry.id) return;
  if (state.layerEditor.visible && state.layerEditor.entry) persistLayerEditorToEntry(true);
  state.canvas.setActiveObject(entry.object);
  state.canvas.requestRenderAll();
  refreshSelectionUI();
  refreshLayerList();
  openLayerEditor(entry, { skipPersist: true });
}

function moveEntryFromEditor(entry, action) {
  if (!entry) return;
  if (action === "visibility") {
    toggleEntryVisibility(entry);
    return;
  }
  if (action === "lock") {
    toggleEntryLock(entry);
    return;
  }
  if (action === "delete") {
    deleteEntry(entry, { fromLayerEditor: true });
    return;
  }
  const groupOrdered = getEntryGroupEntries(entry, true);
  const index = groupOrdered.findIndex((item) => item.id === entry.id);
  if (index < 0) return;
  if (action === "up") moveEntryToGroupOrder(entry, index + 1);
  if (action === "down") moveEntryToGroupOrder(entry, index - 1);
  if (action === "front") moveEntryToGroupOrder(entry, groupOrdered.length - 1);
  if (action === "back") moveEntryToGroupOrder(entry, 0);
  state.canvas.setActiveObject(entry.object);
  state.canvas.requestRenderAll();
  renderLayerEditor();
  refreshLayerEditorLayerList();
}

function layerPointerToImage(event) {
  const fit = state.layerEditor.fit;
  const src = state.layerEditor.workingCanvas;
  if (!fit || !src) return null;
  const canvas = document.querySelector("#layerEditorCanvas");
  const rect = canvas.getBoundingClientRect();
  const clientX = event.clientX ?? event.touches?.[0]?.clientX;
  const clientY = event.clientY ?? event.touches?.[0]?.clientY;
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  if (x < fit.offsetX || y < fit.offsetY || x > fit.offsetX + fit.width || y > fit.offsetY + fit.height) return null;
  return {
    x: Math.max(0, Math.min(src.width - 1, (x - fit.offsetX) / fit.scale)),
    y: Math.max(0, Math.min(src.height - 1, (y - fit.offsetY) / fit.scale)),
  };
}

function buildStrokeMask(width, height, from, to, size) {
  const mask = createAlphaCanvas(width, height);
  const ctx = mask.getContext("2d", { alpha: true });
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(255,255,255,1)";
  ctx.fillStyle = "rgba(255,255,255,1)";
  ctx.lineWidth = size;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(to.x, to.y, size / 2, 0, Math.PI * 2);
  ctx.fill();
  return mask;
}

function applyLayerBrush(from, to) {
  const editor = state.layerEditor;
  if (!editor.workingCanvas) return;
  const width = editor.workingCanvas.width;
  const height = editor.workingCanvas.height;
  const strokeMask = buildStrokeMask(width, height, from, to, editor.brushSize);
  const workingCtx = editor.workingCanvas.getContext("2d", { alpha: true });

  if (editor.tool === "erase") {
    workingCtx.save();
    workingCtx.globalCompositeOperation = "destination-out";
    workingCtx.drawImage(strokeMask, 0, 0);
    workingCtx.restore();
  } else if (editor.tool === "restore") {
    const restoreCanvas = createAlphaCanvas(width, height);
    const restoreCtx = restoreCanvas.getContext("2d", { alpha: true });
    restoreCtx.drawImage(editor.baseCanvas, 0, 0);
    restoreCtx.globalCompositeOperation = "destination-in";
    restoreCtx.drawImage(strokeMask, 0, 0);
    restoreCtx.globalCompositeOperation = "source-over";
    workingCtx.drawImage(restoreCanvas, 0, 0);
  } else if (editor.tool === "paint") {
    const paintCanvas = createAlphaCanvas(width, height);
    const paintCtx = paintCanvas.getContext("2d", { alpha: true });
    paintCtx.fillStyle = hexToRgba(editor.paintColor, 1);
    paintCtx.fillRect(0, 0, width, height);
    paintCtx.globalCompositeOperation = "destination-in";
    paintCtx.drawImage(strokeMask, 0, 0);
    workingCtx.save();
    workingCtx.globalAlpha = editor.blendMode ? 0.45 : 1;
    workingCtx.globalCompositeOperation = "source-over";
    workingCtx.drawImage(paintCanvas, 0, 0);
    workingCtx.restore();
  }

  state.layerEditor.dirty = true;
  renderLayerEditor();
  refreshLayerEditorLayerList();
}

function applyLayerCutRect(from, to) {
  const editor = state.layerEditor;
  if (!editor.workingCanvas) return;
  const width = editor.workingCanvas.width;
  const height = editor.workingCanvas.height;
  const rectMask = buildRectMask(width, height, from, to);
  const workingCtx = editor.workingCanvas.getContext("2d", { alpha: true });
  workingCtx.save();
  workingCtx.globalCompositeOperation = "destination-out";
  workingCtx.drawImage(rectMask, 0, 0);
  workingCtx.restore();
  state.layerEditor.dirty = true;
  renderLayerEditor();
  refreshLayerEditorLayerList();
}

function persistLayerEditorToEntry(updateObject = true) {
  if (!state.layerEditor.visible || !state.layerEditor.workingCanvas || !state.layerEditor.entry) return null;
  const current = state.layerEditor.entry;
  current.previewCanvas = cloneCanvas(state.layerEditor.workingCanvas);
  current.baseCanvas = cloneCanvas(state.layerEditor.workingCanvas);
  current.opacity = clamp(state.layerEditor.opacity ?? 1, 0, 1);
  current.detached = true;
  if (updateObject) replaceEntryObjectFromPreview(current);
  state.layerEditor.dirty = false;
  return current;
}

function createNewLayerFromEditor() {
  if (!state.layerEditor.visible || !state.layerEditor.workingCanvas || !state.layerEditor.entry) return;
  const current = state.layerEditor.entry;
  persistLayerEditorToEntry(true);
  const previewCanvas = cloneCanvas(current.previewCanvas);
  const baseCanvas = cloneCanvas(current.baseCanvas || current.previewCanvas);
  const opacity = clamp(current.opacity ?? 1, 0, 1);
  const newEntry = duplicateEntryAsNewLayer(current, {
    label: `${current.label} nova camada`,
    previewCanvas,
    baseCanvas,
    opacity,
    offsetX: 0,
    offsetY: 0,
  });
  openLayerEditor(newEntry, { skipPersist: true });
  refreshLayerEditorLayerList();
  setStatus("Nova camada criada no editor e aberta para continuar a edição.", "success");
}

function saveLayerChanges(asNewLayer) {
  if (!state.layerEditor.visible || !state.layerEditor.workingCanvas || !state.layerEditor.entry) return;
  const current = state.layerEditor.entry;
  const previewCanvas = cloneCanvas(state.layerEditor.workingCanvas);
  const baseCanvas = cloneCanvas(state.layerEditor.workingCanvas);
  const opacity = clamp(state.layerEditor.opacity ?? 1, 0, 1);

  if (asNewLayer) {
    duplicateEntryAsNewLayer(current, {
      label: `${current.label} editada`,
      previewCanvas,
      baseCanvas,
      opacity,
      offsetX: 0,
      offsetY: 0,
    });
    closeLayerEditor();
    setStatus("Nova camada criada a partir da edição da imagem.", "success");
    return;
  }

  persistLayerEditorToEntry(true);
  closeLayerEditor();
  setStatus("Camada atualizada com a edição da imagem.", "success");
}

function replaceEntryObjectFromPreview(entry) {
  const oldObject = entry.object;
  const oldIndex = getCanvasObjectIndex(oldObject);
  const replacement = new fabric.Image(entry.previewCanvas, {
    left: Number(oldObject.left) || 0,
    top: Number(oldObject.top) || 0,
    originX: oldObject.originX || "left",
    originY: oldObject.originY || "top",
    width: Math.max(1, entry.sourceBox.width),
    height: Math.max(1, entry.sourceBox.height),
    scaleX: Number(oldObject.scaleX) || 1,
    scaleY: Number(oldObject.scaleY) || 1,
    angle: Number(oldObject.angle) || 0,
    opacity: shouldShowEntryPreview(entry.detached) ? clamp(entry.opacity ?? 1, 0, 1) : 0.001,
    transparentCorners: false,
    cornerColor: "#7C83FF",
    borderColor: "#7C83FF",
    cornerStyle: "circle",
    objectCaching: false,
    data: {
      role: "entry",
      label: entry.label,
    },
  });
  state.canvas.remove(oldObject);
  state.canvas.add(replacement);
  if (oldIndex >= 0) moveCanvasObjectTo(replacement, oldIndex);
  else replacement.bringToFront();
  entry.object = replacement;
  syncEntryVisual(entry);
  state.canvas.setActiveObject(replacement);
  state.canvas.requestRenderAll();
  refreshLayerList();
  refreshSelectionUI();
}

function duplicateEntryAsNewLayer(sourceEntry, options = {}) {
  const previewCanvas = cloneCanvas(options.previewCanvas || sourceEntry.previewCanvas);
  const baseCanvas = cloneCanvas(options.baseCanvas || sourceEntry.baseCanvas || sourceEntry.previewCanvas);
  const maskCanvas = cloneCanvas(sourceEntry.maskCanvas);
  const scaleX = Number(sourceEntry.object.scaleX) || 1;
  const scaleY = Number(sourceEntry.object.scaleY) || 1;
  const offsetX = Number(options.offsetX ?? 18);
  const offsetY = Number(options.offsetY ?? 18);
  const newObject = new fabric.Image(previewCanvas, {
    left: (Number(sourceEntry.object.left) || 0) + offsetX,
    top: (Number(sourceEntry.object.top) || 0) + offsetY,
    originX: sourceEntry.object.originX || "left",
    originY: sourceEntry.object.originY || "top",
    width: Math.max(1, sourceEntry.sourceBox.width),
    height: Math.max(1, sourceEntry.sourceBox.height),
    scaleX,
    scaleY,
    angle: Number(sourceEntry.object.angle) || 0,
    opacity: clamp(options.opacity ?? sourceEntry.opacity ?? 1, 0, 1),
    transparentCorners: false,
    cornerColor: "#7C83FF",
    borderColor: "#7C83FF",
    cornerStyle: "circle",
    objectCaching: false,
    data: {
      role: "entry",
      label: options.label || `${sourceEntry.label} cópia`,
    },
  });
  state.canvas.add(newObject);
  newObject.bringToFront();
  const newEntry = {
    id: crypto.randomUUID(),
    groupId: sourceEntry.groupId || sourceEntry.id,
    groupLabel: sourceEntry.groupLabel || sourceEntry.label,
    sourceKind: sourceEntry.sourceKind || "manual",
    label: options.label || `${sourceEntry.label} cópia`,
    object: newObject,
    sourceBox: { ...sourceEntry.sourceBox },
    maskCanvas,
    previewCanvas,
    baseCanvas,
    opacity: clamp(options.opacity ?? sourceEntry.opacity ?? 1, 0, 1),
    vectorSvg: null,
    detached: true,
    visible: options.visible !== false,
    locked: !!options.locked,
  };
  state.entries.push(newEntry);
  syncEntryVisual(newEntry);
  state.canvas.setActiveObject(newObject);
  state.canvas.requestRenderAll();
  refreshLayerList();
  refreshSelectionUI();
  if (state.layerEditor.visible) refreshLayerEditorLayerList();
  return newEntry;
}

function getCanvasObjectIndex(object) {
  return state.canvas?.getObjects().indexOf(object) ?? -1;
}

function orderedEntries(bottomToTop = true) {
  const ordered = state.entries.slice().sort((a, b) => getCanvasObjectIndex(a.object) - getCanvasObjectIndex(b.object));
  return bottomToTop ? ordered : ordered.reverse();
}

function getEntryGroupEntries(entry, bottomToTop = true) {
  if (!entry) return [];
  const groupId = entry.groupId || entry.id;
  const ordered = orderedEntries(bottomToTop);
  return ordered.filter((item) => (item.groupId || item.id) === groupId);
}

function applyOrderedEntriesWithinGroup(groupEntriesInDesiredOrder, groupId) {
  if (!groupId) return;
  const ordered = orderedEntries(true);
  const positions = [];
  ordered.forEach((entry, index) => {
    if ((entry.groupId || entry.id) === groupId) positions.push(index);
  });
  if (!positions.length) return;
  const replacement = groupEntriesInDesiredOrder.slice();
  positions.forEach((position) => {
    ordered[position] = replacement.shift();
  });
  applyOrderedEntries(ordered);
}

function moveEntryToGroupOrder(entry, targetIndex) {
  if (!entry || !state.canvas) return;
  const groupOrdered = getEntryGroupEntries(entry, true);
  const currentIndex = groupOrdered.findIndex((item) => item.id === entry.id);
  if (currentIndex < 0) return;
  const safeIndex = clamp(targetIndex, 0, groupOrdered.length - 1);
  if (currentIndex === safeIndex) return;
  groupOrdered.splice(currentIndex, 1);
  groupOrdered.splice(safeIndex, 0, entry);
  applyOrderedEntriesWithinGroup(groupOrdered, entry.groupId || entry.id);
}

function syncEntriesOrderFromCanvas() {
  state.entries = orderedEntries(true);
}

function moveCanvasObjectTo(object, index) {
  if (!state.canvas || !object) return;
  if (typeof state.canvas.moveTo === "function") {
    state.canvas.moveTo(object, index);
    return;
  }
  if (typeof object.moveTo === "function") {
    object.moveTo(index);
  }
}

function applyOrderedEntries(bottomToTopEntries) {
  const offset = state.sourceFabric ? 1 : 0;
  bottomToTopEntries.forEach((entry, index) => moveCanvasObjectTo(entry.object, index + offset));
  if (state.sourceFabric) state.sourceFabric.sendToBack();
  state.entries = bottomToTopEntries.slice();
  state.canvas.requestRenderAll();
  refreshLayerList();
  refreshSelectionUI();
}

function moveEntryToOrder(entry, targetIndex) {
  if (!entry || !state.canvas) return;
  const ordered = orderedEntries(true);
  const currentIndex = ordered.findIndex((item) => item.id === entry.id);
  if (currentIndex < 0) return;
  const safeIndex = clamp(targetIndex, 0, ordered.length - 1);
  if (currentIndex === safeIndex) return;
  ordered.splice(currentIndex, 1);
  ordered.splice(safeIndex, 0, entry);
  applyOrderedEntries(ordered);
}

function moveSelectedLayerUp() {
  const entry = selectedEntry();
  if (!entry || state.busy) return;
  if (isEntryLocked(entry)) { setStatus("Camada bloqueada.", "error"); return; }
  const ordered = orderedEntries(true);
  const index = ordered.findIndex((item) => item.id === entry.id);
  moveEntryToOrder(entry, index + 1);
  setStatus("Camada movida para cima.", "success");
}

function moveSelectedLayerDown() {
  const entry = selectedEntry();
  if (!entry || state.busy) return;
  if (isEntryLocked(entry)) { setStatus("Camada bloqueada.", "error"); return; }
  const ordered = orderedEntries(true);
  const index = ordered.findIndex((item) => item.id === entry.id);
  moveEntryToOrder(entry, index - 1);
  setStatus("Camada movida para baixo.", "success");
}

function bringSelectedLayerToFront() {
  const entry = selectedEntry();
  if (!entry || state.busy) return;
  if (isEntryLocked(entry)) { setStatus("Camada bloqueada.", "error"); return; }
  moveEntryToOrder(entry, orderedEntries(true).length - 1);
  setStatus("Camada trazida para frente.", "success");
}

function sendSelectedLayerToBack() {
  const entry = selectedEntry();
  if (!entry || state.busy) return;
  if (isEntryLocked(entry)) { setStatus("Camada bloqueada.", "error"); return; }
  moveEntryToOrder(entry, 0);
  setStatus("Camada enviada para trás.", "success");
}

function duplicateSelectedLayer() {
  const entry = selectedEntry();
  if (!entry || state.busy) return;
  if (isEntryLocked(entry)) { setStatus("Camada bloqueada.", "error"); return; }
  duplicateEntryAsNewLayer(entry, { label: `${entry.label} cópia` });
  setStatus("Camada duplicada.", "success");
}

function saveMaskChanges(asNewLayer) {
  if (!state.maskEditor.visible || !state.maskEditor.maskCanvas || !state.maskEditor.entry) return;
  const current = state.maskEditor.entry;
  const sourceBox = { ...state.maskEditor.box };
  const mask = cloneCanvas(state.maskEditor.maskCanvas);

  if (asNewLayer) {
    createEntryFromBox(sourceBox, `${current.label} cópia`, {
      maskCanvas: mask,
      activate: true,
      groupId: current.groupId,
      groupLabel: current.groupLabel || current.label,
      sourceKind: current.sourceKind || "manual",
      removeBackground: false,
    });
    closeMaskEditor();
    setStatus("Nova camada criada a partir da máscara editada.", "success");
    return;
  }

  const trimmed = trimMaskedAssets(sourceBox, mask);
  current.sourceBox = trimmed.sourceBox;
  current.maskCanvas = trimmed.maskCanvas;
  current.previewCanvas = trimmed.previewCanvas;
  current.baseCanvas = cloneCanvas(trimmed.previewCanvas);
  current.opacity = clamp(current.opacity ?? 1, 0, 1);
  current.vectorSvg = null;

  const oldObject = current.object;
  const wasDetached = !!current.detached;
  const scaleX = Number(oldObject.scaleX) || 1;
  const scaleY = Number(oldObject.scaleY) || 1;
  const alignedDisplay = sourceBoxToDisplay(current.sourceBox);
  const left = wasDetached
    ? (Number(oldObject.left) || 0) + trimmed.trimOffsetX * scaleX
    : alignedDisplay.left;
  const top = wasDetached
    ? (Number(oldObject.top) || 0) + trimmed.trimOffsetY * scaleY
    : alignedDisplay.top;
  const replacement = new fabric.Image(current.previewCanvas, {
    left,
    top,
    originX: oldObject.originX || "left",
    originY: oldObject.originY || "top",
    width: Math.max(1, current.sourceBox.width),
    height: Math.max(1, current.sourceBox.height),
    scaleX: wasDetached ? scaleX : (state.sourceFabric?.scaleX || 1),
    scaleY: wasDetached ? scaleY : (state.sourceFabric?.scaleY || 1),
    angle: wasDetached ? (Number(oldObject.angle) || 0) : 0,
    opacity: shouldShowEntryPreview(wasDetached) ? current.opacity : 0.001,
    transparentCorners: false,
    cornerColor: "#7C83FF",
    borderColor: "#7C83FF",
    cornerStyle: "circle",
    objectCaching: false,
    data: {
      role: "entry",
      label: current.label,
    },
  });

  state.canvas.remove(oldObject);
  state.canvas.add(replacement);
  if (oldIndex >= 0) moveCanvasObjectTo(replacement, oldIndex);
  else replacement.bringToFront();
  current.object = replacement;
  current.detached = wasDetached;
  state.canvas.setActiveObject(replacement);
  state.canvas.requestRenderAll();
  refreshLayerList();
  refreshSelectionUI();
  closeMaskEditor();
  setStatus("Máscara atualizada no objeto selecionado.", "success");
}

async function copySelectedPNG() {
  const entry = selectedEntry();
  if (!entry || state.busy) return;
  try {
    await copyEntryToClipboard(entry, { png: true, svg: false });
    setStatus(`${entry.label} copiado para a memória como PNG.`, "success");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Falha ao copiar PNG.", "error");
  }
}

async function copySelectedSVG() {
  const entry = selectedEntry();
  if (!entry || state.busy) return;
  try {
    await copyEntryToClipboard(entry, { png: false, svg: true });
    setStatus(`${entry.label} copiado para a memória como SVG fiel.`, "success");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Falha ao copiar SVG.", "error");
  }
}

async function copySelectedMixed() {
  const entry = selectedEntry();
  if (!entry || state.busy) return;
  try {
    await copyEntryToClipboard(entry, { png: true, svg: true });
    setStatus(`${entry.label} copiado para a memória como imagem; SVG fiel incluído quando suportado.`, "success");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Falha ao copiar o objeto.", "error");
  }
}

async function copyEntryToClipboard(entry, options) {
  const preview = entry.previewCanvas || renderMaskedCropCanvas(entry.sourceBox, entry.maskCanvas);
  const svg = buildFaithfulSVG(entry);

  if (navigator.clipboard?.write && window.ClipboardItem) {
    const pngBlob = options.png ? await canvasToBlob(preview, "image/png") : null;
    const svgBlob = options.svg ? new Blob([svg], { type: "image/svg+xml" }) : null;
    const textBlob = options.svg ? new Blob([svg], { type: "text/plain" }) : null;

    const attempts = [];
    if (pngBlob && svgBlob && textBlob) attempts.push({ "image/png": pngBlob, "image/svg+xml": svgBlob, "text/plain": textBlob });
    if (pngBlob && textBlob) attempts.push({ "image/png": pngBlob, "text/plain": textBlob });
    if (pngBlob) attempts.push({ "image/png": pngBlob });
    if (svgBlob && textBlob) attempts.push({ "image/svg+xml": svgBlob, "text/plain": textBlob });
    if (textBlob) attempts.push({ "text/plain": textBlob });

    for (const attempt of attempts) {
      try {
        await navigator.clipboard.write([new ClipboardItem(attempt)]);
        return;
      } catch {
        // tenta combinações mais simples
      }
    }
  }

  if (options.svg && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(svg);
    return;
  }

  throw new Error("A área de transferência do ambiente não suporta este tipo de cópia.");
}

function canvasToBlob(canvas, type = "image/png", quality = 0.96) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Não foi possível gerar o blob da imagem."));
    }, type, quality);
  });
}

async function exportSelected() {
  const entry = selectedEntry();
  if (!entry || state.busy) return;
  setBusy(true);
  try {
    const svg = buildFaithfulSVG(entry);
    const path = await api("SaveSVG", `${safeName(state.sourceName)}-${safeName(entry.label)}.svg`, svg);
    if (path) setStatus(`SVG fiel salvo em ${path}`, "success");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Falha ao salvar SVG.", "error");
  } finally {
    setBusy(false);
  }
}

async function exportAll() {
  if (!state.entries.length || state.busy) return;
  setBusy(true);
  try {
    const files = state.entries.map((entry, index) => ({
      name: `${String(index + 1).padStart(2, "0")}-${safeName(entry.label)}.svg`,
      content: buildFaithfulSVG(entry),
    }));
    const directory = await api("SaveSVGSet", files);
    if (directory) setStatus(`${files.length} SVGs fiéis exportados para ${directory}`, "success");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Falha ao exportar SVGs.", "error");
  } finally {
    setBusy(false);
  }
}

function buildFaithfulSVG(entry) {
  const canvas = entry.previewCanvas || renderMaskedCropCanvas(entry.sourceBox, entry.maskCanvas);
  const png = canvas.toDataURL("image/png");
  const width = entry.sourceBox.width;
  const height = entry.sourceBox.height;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n  <image width="${width}" height="${height}" href="${png}" xlink:href="${png}" preserveAspectRatio="none"/>\n</svg>`;
}

async function generateSelectedVectorPaths() {
  const entry = selectedEntry();
  if (!entry || state.busy) return;
  setBusy(true);
  try {
    setStatus(`Gerando SVG vetorial em paths para ${entry.label}…`, "working");
    const svg = await vectorizePreviewCanvas(entry.previewCanvas || renderMaskedCropCanvas(entry.sourceBox, entry.maskCanvas));
    entry.vectorSvg = svg;
    await copyTextToClipboard(svg);
    setStatus(`${entry.label} vetorizado em paths. O SVG vetorial foi copiado como texto para a memória.`, "success");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Falha ao gerar SVG vetorial.", "error");
  } finally {
    setBusy(false);
  }
}

function createTraceWorker() {
  return new Worker(new URL("./trace-worker.js", import.meta.url), { type: "module" });
}

async function vectorizePreviewCanvas(previewCanvas) {
  const worker = createTraceWorker();
  try {
    const maxDimension = 1400;
    const scale = Math.min(1, maxDimension / Math.max(previewCanvas.width, previewCanvas.height));
    const render = createAlphaCanvas(Math.max(2, Math.round(previewCanvas.width * scale)), Math.max(2, Math.round(previewCanvas.height * scale)));
    const ctx = render.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(previewCanvas, 0, 0, render.width, render.height);
    return await traceCanvasWithWorker(worker, render);
  } finally {
    worker.terminate();
  }
}

function traceCanvasWithWorker(worker, canvas) {
  const settings = getSettings();
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const id = ++state.traceRequestId;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("A vetorização excedeu o tempo limite."));
    }, 60000);

    const onMessage = (event) => {
      const message = event.data || {};
      if (message.id !== id) return;
      cleanup();
      if (message.type === "result" && message.svg) resolve(message.svg);
      else reject(new Error(message.message || "ImageTracerJS não gerou um SVG válido."));
    };

    const onError = (event) => {
      cleanup();
      reject(new Error(event.message || "Falha no worker de vetorização."));
    };

    const cleanup = () => {
      clearTimeout(timer);
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
    };

    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    worker.postMessage(
      {
        type: "trace",
        id,
        width: canvas.width,
        height: canvas.height,
        settings: {
          threshold: settings.threshold,
          colors: settings.colors,
          removeBackground: false,
          background: { r: 255, g: 255, b: 255 },
        },
        buffer: imageData.data.buffer,
      },
      [imageData.data.buffer],
    );
  });
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  throw new Error("A área de transferência de texto não está disponível.");
}

function safeName(value) {
  return (
    String(value || "objeto")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "objeto"
  );
}

function refreshLayerList() {
  const list = document.querySelector("#layerList");
  const count = document.querySelector("#objectCount");
  syncEntriesOrderFromCanvas();
  count.textContent = String(state.entries.length);
  if (!state.source) {
    list.className = "layer-list empty-state";
    list.textContent = "Importe uma imagem para começar.";
    return;
  }
  if (!state.entries.length) {
    list.className = "layer-list empty-state";
    list.textContent = "Nenhum objeto extraído ainda.";
    return;
  }
  const active = selectedEntry();
  const displayEntries = orderedEntries(false);
  list.className = "layer-list";
  list.innerHTML = displayEntries
    .map(
      (entry, index) => `
      <button class="layer-row ${active?.id === entry.id ? "active" : ""}" data-entry-id="${entry.id}">
        <span class="layer-dot ${entry.vectorSvg ? "vectorized" : "preview"}"></span>
        <span class="layer-copy"><strong>${escapeHtml(entry.label)}</strong><small>Camada ${String(displayEntries.length - index).padStart(2, "0")} • ${entry.sourceBox.width} × ${entry.sourceBox.height}px • opacidade ${Math.round((entry.opacity ?? 1) * 100)}%${entry.detached ? " • editável" : ""}${isEntryVisible(entry) ? "" : " • oculta"}${isEntryLocked(entry) ? " • bloqueada" : ""}</small></span>
        <span class="layer-index">${index === 0 ? "Topo" : index === displayEntries.length - 1 ? "Base" : String(displayEntries.length - index).padStart(2, "0")}</span>
      </button>
    `,
    )
    .join("");
  list.querySelectorAll("[data-entry-id]").forEach((button) => {
    button.onclick = () => {
      const entry = state.entries.find((item) => item.id === button.dataset.entryId);
      if (!entry) return;
      hideContextMenu();
      state.canvas.setActiveObject(entry.object);
      state.canvas.requestRenderAll();
      refreshSelectionUI();
      refreshLayerList();
    };
    button.oncontextmenu = (event) => {
      event.preventDefault();
      const entry = state.entries.find((item) => item.id === button.dataset.entryId);
      if (!entry) return;
      state.canvas.setActiveObject(entry.object);
      state.canvas.requestRenderAll();
      refreshSelectionUI();
      refreshLayerList();
      showContextMenuForEntry(entry, event.clientX, event.clientY);
    };
  });
}

function refreshSelectionUI() {
  const entry = selectedEntry();
  const hasEntries = state.entries.length > 0;
  toggleButton("exportAllBtn", state.busy || !hasEntries);
  toggleButton("clearEntriesBtn", state.busy || !hasEntries);
  toggleButton("autoBtn", state.busy || !state.source);
  toggleButton("rectModeBtn", state.busy || !state.source);
  toggleButton("lassoModeBtn", state.busy || !state.source);

  [
    "refineBtn",
    "editLayerBtn",
    "copyPngBtn",
    "copySvgBtn",
    "exportBtn",
    "refineSelectedSideBtn",
    "editLayerSideBtn",
    "duplicateSelectedBtn",
    "layerUpBtn",
    "layerDownBtn",
    "layerFrontBtn",
    "layerBackBtn",
    "toggleVisibilitySideBtn",
    "toggleLockSideBtn",
    "copyPngSideBtn",
    "copySvgSideBtn",
    "exportSelectedSideBtn",
    "vectorizeSelectedSideBtn",
    "deleteSelectedBtn",
  ].forEach((id) => toggleButton(id, state.busy || !entry));

  const info = document.querySelector("#selectedInfo");
  const opacityRange = document.querySelector("#layerOpacityRange");
  const opacityValue = document.querySelector("#layerOpacityValue");
  if (!entry) {
    info.textContent = "Nenhum objeto selecionado.";
    opacityRange.value = "100";
    opacityValue.textContent = "100%";
    opacityRange.disabled = true;
    const visibilityBtn = document.querySelector("#toggleVisibilitySideBtn");
    const lockBtn = document.querySelector("#toggleLockSideBtn");
    if (visibilityBtn) visibilityBtn.textContent = "Ocultar";
    if (lockBtn) lockBtn.textContent = "Bloquear";
    return;
  }
  const percent = Math.round((entry.opacity ?? 1) * 100);
  const visibilityBtn = document.querySelector("#toggleVisibilitySideBtn");
  const lockBtn = document.querySelector("#toggleLockSideBtn");
  opacityRange.disabled = false;
  opacityRange.value = String(percent);
  opacityValue.textContent = `${percent}%`;
  const topToBottom = orderedEntries(false);
  const stackPos = topToBottom.findIndex((item) => item.id === entry.id);
  const stackLabel = stackPos === 0 ? "Topo" : stackPos === topToBottom.length - 1 ? "Base" : `${stackPos + 1}ª posição`;
  if (visibilityBtn) visibilityBtn.textContent = isEntryVisible(entry) ? "Ocultar" : "Mostrar";
  if (lockBtn) lockBtn.textContent = isEntryLocked(entry) ? "Desbloquear" : "Bloquear";
  info.innerHTML = `
    <strong>${escapeHtml(entry.label)}</strong>
    <span>${entry.sourceBox.width} × ${entry.sourceBox.height}px</span>
    <span>Opacidade atual: ${percent}%</span>
    <span>Ordem da camada: ${stackLabel} de ${topToBottom.length}</span>
    <span>Estado: ${isEntryVisible(entry) ? "visível" : "oculta"} • ${isEntryLocked(entry) ? "bloqueada" : "editável"}</span>
    <span>Saída padrão: SVG fiel à imagem, sem converter em paths.</span>
    <span>${entry.vectorSvg ? "Paths SVG opcionais já gerados." : "Use Máscara para refinar o objeto, Editar camada para apagar/restaurar pixels, Duplicar para criar outra camada e os botões de ordem para reorganizar a pilha."}</span>
  `;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function colorDistance(r1, g1, b1, r2, g2, b2) {
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

bootstrap();
