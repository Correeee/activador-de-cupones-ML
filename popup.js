// popup.js

const CUPONES_URL = "https://www.mercadolibre.com.ar/cupones/filter?status=inactive&source_page=int_applied_filters&all=true";

const btn = document.getElementById('toggleBtn');
const statusEl = document.getElementById('statusMsg');
const progressWrap = document.getElementById('progressWrap');
const progressText = document.getElementById('progressText');
const progressPct = document.getElementById('progressPct');
const progressFill = document.getElementById('progressFill');
const historyWrap = document.getElementById('historyWrap');
const historyCount = document.getElementById('historyCount');
const historyList = document.getElementById('historyList');

// ── Inicialización: leer estado, progreso e historial guardado ────────────────
chrome.storage.local.get(['active', 'progress', 'historial'], (res) => {
  actualizarBoton(!!res.active);
  if (res.progress) mostrarProgreso(res.progress);
  renderHistorial(res.historial);
});

// ── Reflejar cambios de estado mientras el popup está abierto ─────────────────
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.active) actualizarBoton(!!changes.active.newValue);
  if (changes.progress) mostrarProgreso(changes.progress.newValue);
  if (changes.historial) renderHistorial(changes.historial.newValue);
});

// ── Escuchar mensajes del background (content → background → popup) ───────────
chrome.runtime.onMessage.addListener((request) => {
  if (request.action === 'progress') {
    mostrarProgreso(request);
    if (Array.isArray(request.historial)) renderHistorial(request.historial);
  }
  if (request.action === 'finish') {
    actualizarBoton(false);
    mostrarProgreso({ status: 'done', applied: request.totalApplied ?? 0 });
    if (Array.isArray(request.historial)) renderHistorial(request.historial);
  }
});

// ── Click del botón ───────────────────────────────────────────────────────────
btn.addEventListener('click', () => {
  chrome.storage.local.get(['active'], (res) => {
    const nuevoEstado = !res.active;

    // Al iniciar, limpiar el progreso y el historial anteriores
    const updates = { active: nuevoEstado };
    if (nuevoEstado) {
      updates.progress = null;
      updates.historial = [];
    } else {
      updates.targetTabId = null;
    }

    chrome.storage.local.set(updates, () => {
      actualizarBoton(nuevoEstado);
      if (nuevoEstado) {
        mostrarProgreso(null);
        renderHistorial([]);
      }

      chrome.tabs.query({ url: "*://*.mercadolibre.com.ar/*" }, (tabs) => {
        const tabCupones = tabs.find(t => t.url && t.url.includes('mercadolibre.com.ar/cupones'));

        if (nuevoEstado) {
          if (tabCupones) {
            chrome.tabs.update(tabCupones.id, { url: CUPONES_URL, active: true }, (tab) => {
              const tId = tab?.id || tabCupones.id;
              if (tId) chrome.storage.local.set({ targetTabId: tId });
            });
          } else {
            chrome.tabs.create({ url: CUPONES_URL }, (tab) => {
              if (tab?.id) chrome.storage.local.set({ targetTabId: tab.id });
            });
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
    ocultarBarra();
    return;
  }

  const { status, applied = 0, total = 0, page = 1, acumulado, totalPaginas = 1 } = data;
  const totalAcumulado = acumulado ?? applied;

  switch (status) {
    case 'running':
      statusEl.textContent = `✅ ${totalAcumulado} activados (pág. ${page}: ${applied}/${total})`;
      statusEl.className = 'status-msg running';
      mostrarBarra(page, totalPaginas);
      break;
    case 'navigating':
      statusEl.textContent = `➡️ ${totalAcumulado} activados — yendo a pág. ${page + 1}...`;
      statusEl.className = 'status-msg running';
      mostrarBarra(page, totalPaginas);
      break;
    case 'empty':
      statusEl.textContent = `ℹ️ Sin cupones en pág. ${page} (acumulado: ${totalAcumulado})`;
      statusEl.className = 'status-msg info';
      mostrarBarra(page, totalPaginas);
      break;
    case 'done':
      statusEl.textContent = `🎉 ¡Listo! ${totalAcumulado} cupones activados`;
      statusEl.className = 'status-msg done';
      mostrarBarra(totalPaginas, totalPaginas);
      break;
    case 'login':
      statusEl.textContent = '🔒 Sesión expirada. Iniciá sesión en Mercado Libre.';
      statusEl.className = 'status-msg error';
      ocultarBarra();
      break;
    case 'error':
      statusEl.textContent = '⚠️ Ocurrió un error. Reintentá.';
      statusEl.className = 'status-msg error';
      ocultarBarra();
      break;
    default:
      statusEl.textContent = '';
      ocultarBarra();
  }
}

/**
 * Muestra y actualiza la barra de progreso.
 * @param {number} page - Página actual.
 * @param {number} totalPaginas - Total de páginas.
 */
function mostrarBarra(page, totalPaginas) {
  const total = Math.max(1, totalPaginas || 1);
  const actual = Math.min(Math.max(1, page || 1), total);
  const pct = Math.round((actual / total) * 100);

  progressWrap.classList.add('visible');
  progressText.textContent = `Página ${actual} de ${total}`;
  progressPct.textContent = `${pct}%`;
  progressFill.style.width = `${pct}%`;
}

function ocultarBarra() {
  progressWrap.classList.remove('visible');
}

/**
 * Renderiza la lista del historial de cupones.
 * @param {Array<{titulo:string,descuento:string,comercio:string,fecha:string}>} historial
 */
function renderHistorial(historial) {
  const lista = Array.isArray(historial) ? historial : [];

  historyCount.textContent = String(lista.length);

  if (lista.length === 0) {
    historyList.innerHTML = '<div class="history-empty">Los cupones detectados aparecerán aquí</div>';
    return;
  }

  historyList.innerHTML = lista
    .map((c) => {
      const descuento = escapeHtml(c.descuento || c.titulo || 'Cupón');
      const comercio = c.comercio ? escapeHtml(c.comercio) : '';
      const fecha = c.fecha ? formatearFecha(c.fecha) : '';
      return `
        <div class="history-item">
          <div class="hi-descuento">${descuento}</div>
          ${comercio ? `<div class="hi-comercio">${comercio}</div>` : ''}
          ${fecha ? `<div class="hi-fecha">${fecha}</div>` : ''}
        </div>`;
    })
    .join('');
}

/**
 * Formatea una fecha ISO a formato local corto.
 * @param {string} iso
 * @returns {string}
 */
function formatearFecha(iso) {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (_) {
    return '';
  }
}

/**
 * Escapa HTML para evitar inyección en el historial.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  const AMP = String.fromCharCode(38) + 'amp;';
  const LT = String.fromCharCode(38) + 'lt;';
  const GT = String.fromCharCode(38) + 'gt;';
  const QUOT = String.fromCharCode(38) + 'quot;';
  const APOS = String.fromCharCode(38) + '#39;';
  return String(str)
    .replace(/&/g, AMP)
    .replace(/</g, LT)
    .replace(/>/g, GT)
    .replace(/"/g, QUOT)
    .replace(/'/g, APOS);
}
