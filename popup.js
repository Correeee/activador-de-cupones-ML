// popup.js

const CUPONES_URL = "https://www.mercadolibre.com.ar/cupones/filter?status=inactive&source_page=int_applied_filters&all=true";

const btn = document.getElementById('toggleBtn');
const statusEl = document.getElementById('statusMsg');

// ── Inicialización: leer estado y progreso guardado ──────────────────────────
chrome.storage.local.get(['active', 'progress'], (res) => {
  actualizarBoton(!!res.active);
  if (res.progress) mostrarProgreso(res.progress);
});

// ── Reflejar cambios de estado mientras el popup está abierto ─────────────────
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.active) actualizarBoton(!!changes.active.newValue);
  if (changes.progress) mostrarProgreso(changes.progress.newValue);
});

// ── Escuchar mensajes del background (content → background → popup) ───────────
chrome.runtime.onMessage.addListener((request) => {
  if (request.action === 'progress') mostrarProgreso(request);
  if (request.action === 'finish') {
    actualizarBoton(false);
    mostrarProgreso({ status: 'done', applied: request.totalApplied ?? 0 });
  }
});

// ── Click del botón ───────────────────────────────────────────────────────────
btn.addEventListener('click', () => {
  chrome.storage.local.get(['active'], (res) => {
    const nuevoEstado = !res.active;

    // Al iniciar, limpiar el progreso anterior
    const updates = { active: nuevoEstado };
    if (nuevoEstado) updates.progress = null;

    chrome.storage.local.set(updates, () => {
      actualizarBoton(nuevoEstado);
      if (nuevoEstado) mostrarProgreso(null);

      chrome.tabs.query({}, (tabs) => {
        const tabCupones = tabs.find(t => t.url && t.url.includes('mercadolibre.com.ar/cupones'));

        if (nuevoEstado) {
          if (tabCupones) {
            chrome.tabs.update(tabCupones.id, { url: CUPONES_URL, active: true });
          } else {
            chrome.tabs.create({ url: CUPONES_URL });
          }
        } else if (tabCupones) {
          chrome.tabs.reload(tabCupones.id);
        }
      });
    });
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function actualizarBoton(active) {
  btn.textContent = active ? '⏹ Detener' : 'Aplicar todos los cupones';
  btn.className = active ? 'on' : 'off';
}

function mostrarProgreso(data) {
  if (!data || !data.status) {
    statusEl.textContent = '';
    statusEl.className = 'status-msg';
    return;
  }

  const { status, applied = 0, total = 0, page = 1 } = data;

  switch (status) {
    case 'running':
      statusEl.textContent = `✅ Aplicando ${applied}/${total} — pág. ${page}`;
      statusEl.className = 'status-msg running';
      break;
    case 'navigating':
      statusEl.textContent = `➡️ Navegando a la pág. ${page + 1}...`;
      statusEl.className = 'status-msg running';
      break;
    case 'empty':
      statusEl.textContent = `ℹ️ Sin cupones en pág. ${page}`;
      statusEl.className = 'status-msg info';
      break;
    case 'done':
      statusEl.textContent = `🎉 ¡Listo! ${applied} cupones aplicados`;
      statusEl.className = 'status-msg done';
      break;
    case 'error':
      statusEl.textContent = '⚠️ Ocurrió un error. Reintentá.';
      statusEl.className = 'status-msg error';
      break;
    default:
      statusEl.textContent = '';
  }
}