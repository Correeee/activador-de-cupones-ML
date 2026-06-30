// background.js — Service Worker intermediario
// Recibe mensajes del content script y los reenvía al popup si está abierto.
// Si el popup está cerrado, los datos quedan en storage para que el popup los lea al abrirse.

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'progress') {
    // Guardar progreso en storage para que el popup lo lea aunque esté cerrado
    chrome.storage.local.set({
      progress: {
        applied: request.applied,
        total: request.total,
        page: request.page,
        status: request.status
      }
    });
    // Intentar reenviar al popup si está abierto (best-effort)
    chrome.runtime.sendMessage(request).catch(() => {});
  }

  if (request.action === 'finish') {
    chrome.storage.local.set({
      active: false,
      progress: { status: 'done', applied: request.totalApplied ?? 0 }
    });
    chrome.runtime.sendMessage(request).catch(() => {});
  }
});
