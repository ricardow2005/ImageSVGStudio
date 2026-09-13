import "./updater.css";

const UPDATE_BOOT_TIMEOUT_MS = 12000;
const UPDATE_CHECK_TIMEOUT_MS = 15000;

let updateInfo = null;
let checking = false;
let ui = null;

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForApplication() {
  const startedAt = Date.now();

  while (Date.now() - startedAt < UPDATE_BOOT_TIMEOUT_MS) {
    const app = window.go?.app?.App;
    const windowControls = document.querySelector(".window-controls");
    if (app?.CheckForUpdates && app?.Info && windowControls) {
      return app;
    }
    await sleep(80);
  }

  return null;
}

function createUpdaterUI() {
  const windowControls = document.querySelector(".window-controls");
  if (!windowControls || document.querySelector("#settingsUpdateBtn")) {
    return null;
  }

  const settingsButton = document.createElement("button");
  settingsButton.id = "settingsUpdateBtn";
  settingsButton.className = "updater-settings-button";
  settingsButton.type = "button";
  settingsButton.title = "Configurações";
  settingsButton.setAttribute("aria-label", "Configurações");
  settingsButton.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19.14 12.94a7.8 7.8 0 0 0 .05-.94 7.8 7.8 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7.3 7.3 0 0 0-1.63-.94L14.38 2.8a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.52c-.58.24-1.13.55-1.64.94L5.16 5.3a.5.5 0 0 0-.61.22L2.63 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.8 7.8 0 0 0-.05.94c0 .32.02.63.05.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .61.22l2.38-.96c.51.39 1.06.7 1.64.94l.36 2.52a.5.5 0 0 0 .5.42h3.84a.5.5 0 0 0 .5-.42l.36-2.52c.58-.24 1.13-.55 1.63-.94l2.39.96a.5.5 0 0 0 .61-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z"/>
    </svg>
    <span class="updater-dot" aria-hidden="true"></span>
  `;
  windowControls.prepend(settingsButton);

  const overlay = document.createElement("div");
  overlay.id = "updaterOverlay";
  overlay.className = "updater-overlay hidden";
  overlay.innerHTML = `
    <section class="updater-dialog" role="dialog" aria-modal="true" aria-labelledby="updaterDialogTitle">
      <header class="updater-header">
        <div>
          <strong id="updaterDialogTitle">Configurações</strong>
          <span>Preferências e informações do Image SVG Studio</span>
        </div>
        <button id="closeUpdaterBtn" class="updater-close" type="button" title="Fechar" aria-label="Fechar">×</button>
      </header>

      <div class="updater-content">
        <section class="updater-card">
          <div class="updater-section-title">
            <div class="updater-section-icon" aria-hidden="true">↻</div>
            <div>
              <strong>Atualizações</strong>
              <span>Verifique novas versões publicadas no GitHub.</span>
            </div>
          </div>

          <div class="updater-version-row">
            <div>
              <span class="updater-label">Versão instalada</span>
              <strong id="updaterCurrentVersion">—</strong>
            </div>
            <button id="checkUpdateBtn" class="updater-button" type="button">Verificar atualização</button>
          </div>

          <div id="updaterStatus" class="updater-status muted">
            A verificação também é feita automaticamente ao abrir o aplicativo.
          </div>
        </section>

        <section id="updaterRelease" class="updater-card updater-release hidden">
          <div class="updater-release-heading">
            <div>
              <span class="updater-eyebrow">Nova versão disponível</span>
              <strong id="updaterReleaseName">Image SVG Studio</strong>
            </div>
            <span id="updaterLatestVersion" class="updater-version-pill">—</span>
          </div>

          <div id="updaterPublishedAt" class="updater-published"></div>

          <div class="updater-changelog-title">O que mudou</div>
          <div id="updaterChangelog" class="updater-changelog"></div>

          <div class="updater-actions">
            <button id="openReleaseBtn" class="updater-button primary" type="button">
              Abrir página para download
            </button>
          </div>
        </section>
      </div>
    </section>
  `;
  document.body.appendChild(overlay);

  const elements = {
    settingsButton,
    dot: settingsButton.querySelector(".updater-dot"),
    overlay,
    closeButton: overlay.querySelector("#closeUpdaterBtn"),
    checkButton: overlay.querySelector("#checkUpdateBtn"),
    openReleaseButton: overlay.querySelector("#openReleaseBtn"),
    currentVersion: overlay.querySelector("#updaterCurrentVersion"),
    status: overlay.querySelector("#updaterStatus"),
    release: overlay.querySelector("#updaterRelease"),
    releaseName: overlay.querySelector("#updaterReleaseName"),
    latestVersion: overlay.querySelector("#updaterLatestVersion"),
    publishedAt: overlay.querySelector("#updaterPublishedAt"),
    changelog: overlay.querySelector("#updaterChangelog"),
  };

  settingsButton.addEventListener("click", () => openSettings());
  elements.closeButton.addEventListener("click", closeSettings);
  elements.checkButton.addEventListener("click", () => checkForUpdates(true));
  elements.openReleaseButton.addEventListener("click", openReleasePage);
  overlay.addEventListener("mousedown", (event) => {
    if (event.target === overlay) closeSettings();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !overlay.classList.contains("hidden")) {
      closeSettings();
    }
  });

  return elements;
}

function openSettings() {
  if (!ui) return;
  ui.overlay.classList.remove("hidden");
}

function closeSettings() {
  if (!ui) return;
  ui.overlay.classList.add("hidden");
}

function setStatus(message, kind = "muted") {
  if (!ui) return;
  ui.status.textContent = message;
  ui.status.className = `updater-status ${kind}`;
}

function setChecking(value) {
  checking = value;
  if (!ui) return;
  ui.checkButton.disabled = value;
  ui.checkButton.textContent = value ? "Verificando…" : "Verificar atualização";
}

function formatPublishedDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return `Publicada em ${new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(date)}`;
}

function showRelease(info) {
  if (!ui) return;

  ui.release.classList.remove("hidden");
  ui.dot.classList.add("visible");
  ui.releaseName.textContent = info.releaseName || "Image SVG Studio";
  ui.latestVersion.textContent = `v${info.latestVersion}`;
  ui.publishedAt.textContent = formatPublishedDate(info.publishedAt);
  ui.changelog.textContent = info.changelog || "Sem notas de versão disponíveis.";
}

function hideRelease() {
  if (!ui) return;
  ui.release.classList.add("hidden");
  ui.dot.classList.remove("visible");
}

async function withTimeout(promise, timeoutMs) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error("Tempo limite ao consultar atualizações.")), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function checkForUpdates(manual = false) {
  if (checking) return;

  const app = window.go?.app?.App;
  if (!app?.CheckForUpdates) {
    if (manual) {
      openSettings();
      setStatus("O serviço de atualização ainda não está disponível.", "error");
    }
    return;
  }

  setChecking(true);
  if (manual) {
    openSettings();
    setStatus("Consultando a versão mais recente no GitHub…", "working");
  }

  try {
    const info = await withTimeout(app.CheckForUpdates(), UPDATE_CHECK_TIMEOUT_MS);
    updateInfo = info;

    if (ui) {
      ui.currentVersion.textContent = `v${info.currentVersion || "—"}`;
    }

    if (info.updateAvailable) {
      showRelease(info);
      setStatus(`A versão v${info.latestVersion} está disponível.`, "success");
      if (!manual) openSettings();
    } else {
      hideRelease();
      if (manual) {
        setStatus("Você já está usando a versão mais recente.", "success");
      } else {
        setStatus("Aplicativo atualizado.", "muted");
      }
    }
  } catch (error) {
    if (manual) {
      setStatus(error?.message || "Não foi possível verificar atualizações.", "error");
    }
  } finally {
    setChecking(false);
  }
}

async function openReleasePage() {
  if (!updateInfo?.releaseUrl) return;

  try {
    await window.go.app.App.OpenReleasePage(updateInfo.releaseUrl);
  } catch (error) {
    setStatus(error?.message || "Não foi possível abrir a página da versão.", "error");
  }
}

async function initialiseUpdater() {
  const app = await waitForApplication();
  if (!app) return;

  ui = createUpdaterUI();
  if (!ui) return;

  try {
    const info = await app.Info();
    ui.currentVersion.textContent = `v${info?.version || "—"}`;
  } catch {
    ui.currentVersion.textContent = "—";
  }

  await checkForUpdates(false);
}

initialiseUpdater();
