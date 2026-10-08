// background.js — Service Worker intermediario
// Recibe mensajes del content script y los reenvía al popup si está abierto.
// Si el popup está cerrado, los datos quedan en storage para que el popup los lea al abrirse.
// Al finalizar, dispara una notificación nativa con el total de cupones activados.
// Detecta si la pestaña de trabajo se cierra para limpiar el estado huérfano.

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'progress') {
    // Guardar progreso en storage para que el popup lo lea aunque esté cerrado.
    // `acumulado` persiste el total entre páginas; `applied` es solo de la página actual.
    const progress = {
      applied: request.applied,
      total: request.total,
      page: request.page,
      status: request.status,
      acumulado: request.acumulado ?? request.applied ?? 0,
      totalPaginas: request.totalPaginas ?? 1
    };

    const updates = { progress };
    // Persistir el historial acumulado si viene en el mensaje
    if (Array.isArray(request.historial)) {
      updates.historial = request.historial;
    }

    // Registrar tabId para monitoreo de cierre de pestaña
    if (sender?.tab?.id) {
      updates.targetTabId = sender.tab.id;
    }

    chrome.storage.local.set(updates);

    // Intentar reenviar al popup si está abierto (best-effort)
    chrome.runtime.sendMessage(request).catch(() => { });
  }

  if (request.action === 'finish') {
    const total = request.totalApplied ?? 0;
    const historial = Array.isArray(request.historial) ? request.historial : [];

    chrome.storage.local.set({
      active: false,
      targetTabId: null,
      progress: { status: 'done', applied: total, acumulado: total },
      historial
    });

    chrome.runtime.sendMessage(request).catch(() => { });

    // Notificación nativa al finalizar
    notificarFinalizacion(total);
  }
});

// Detectar si el usuario cierra la pestaña objetivo mientras la extensión está activa
chrome.tabs.onRemoved.addListener((closedTabId) => {
  chrome.storage.local.get(['active', 'targetTabId'], (res) => {
    if (res.active && res.targetTabId === closedTabId) {
      console.warn('[ML Cupones] La pestaña del activador fue cerrada. Deteniendo ejecución.');
      chrome.storage.local.set({
        active: false,
        targetTabId: null,
        progress: { status: 'error', applied: 0, acumulado: 0 }
      });
      chrome.runtime.sendMessage({
        action: 'finish',
        totalApplied: 0,
        cancelled: true,
        reason: 'tab_closed'
      }).catch(() => { });
    }
  });
});

/**
 * Muestra una notificación nativa con el resultado de la corrida.
 * @param {number} total - Total de cupones activados.
 */
function notificarFinalizacion(total) {
  if (!chrome.notifications || !chrome.notifications.create) return;

  const mensaje =
    total > 0
      ? `🎉 ${total} cupones activados`
      : 'ℹ️ No se encontraron cupones para activar';

  chrome.notifications.create(
    `ml-cupones-${Date.now()}`,
    {
      type: 'basic',
      iconUrl: 'icon.png',
      title: 'Activador de Cupones - Mercado Libre',
      message: mensaje,
      priority: 1
    },
    () => {
      // Ignorar errores de creación (p. ej. permiso denegado)
      if (chrome.runtime.lastError) {
        console.warn('[ML Cupones] No se pudo crear la notificación:', chrome.runtime.lastError.message);
      }
    }
  );
}

// Al hacer clic en la notificación nativa, enfocar la pestaña de Mercado Libre
if (chrome.notifications && chrome.notifications.onClicked) {
  chrome.notifications.onClicked.addListener((notificationId) => {
    if (notificationId && notificationId.startsWith('ml-cupones-')) {
      chrome.tabs.query({ url: "*://*.mercadolibre.com.ar/*" }, (tabs) => {
        const mlTab = tabs.find((t) => t.url && t.url.includes('mercadolibre.com.ar/cupones')) || tabs[0];
        if (mlTab?.id) {
          chrome.tabs.update(mlTab.id, { active: true });
          if (mlTab.windowId && chrome.windows?.update) {
            chrome.windows.update(mlTab.windowId, { focused: true });
          }
        }
      });
    }
  });
}

