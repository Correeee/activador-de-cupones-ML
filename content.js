// content.js — Script que corre en la página de cupones de Mercado Libre

const CUPONES_URL = "https://www.mercadolibre.com.ar/cupones/filter?status=inactive&source_page=int_applied_filters&all=true";

chrome.storage.local.get(['active'], async (res) => {
  if (!res.active) return;

  // Indicador visual flotante en pantalla
  const indicador = document.createElement('div');
  indicador.style.cssText = [
    'position:fixed', 'top:20px', 'left:20px',
    'background:white', 'color:#1c1c1c', 'padding:12px 16px',
    'z-index:100000', 'border:2px solid #FFE600',
    'font-family:sans-serif', 'font-weight:bold',
    'border-radius:10px', 'box-shadow:0 4px 12px rgba(0,0,0,0.15)',
    'font-size:14px', 'min-width:200px'
  ].join(';');
  indicador.innerText = '⏳ Iniciando...';
  document.body.appendChild(indicador);

  const delay = (ms) => new Promise(r => setTimeout(r, ms));

  // Obtener número de página actual para el reporte
  const paginaActual = (() => {
    const params = new URLSearchParams(window.location.search);
    return parseInt(params.get('page') ?? '1', 10);
  })();

  // Enviar progreso al background para que lo guarde y reenvíe al popup
  const reportarProgreso = (applied, total, status) => {
    chrome.runtime.sendMessage({
      action: 'progress',
      applied,
      total,
      page: paginaActual,
      status
    }).catch(() => {});
  };

  const desactivar = async (totalApplied = 0) => {
    await chrome.storage.local.set({ active: false });
    chrome.runtime.sendMessage({ action: 'finish', totalApplied }).catch(() => {});
  };

  try {
    await delay(2000);

    // Selectores con fallback: clase Andes primero, luego texto genérico
    let botones = Array.from(document.querySelectorAll('button.andes-button'))
      .filter(btn => btn.innerText.trim().toUpperCase() === 'APLICAR');

    // Fallback: buscar cualquier botón que diga "Aplicar" si el selector principal falló
    if (botones.length === 0) {
      botones = Array.from(document.querySelectorAll('button'))
        .filter(btn => btn.innerText.trim().toUpperCase() === 'APLICAR' && !btn.disabled);
    }

    const total = botones.length;

    if (total > 0) {
      for (let i = 0; i < botones.length; i++) {
        botones[i].scrollIntoView({ behavior: 'smooth', block: 'center' });
        botones[i].click();
        const aplicados = i + 1;
        indicador.innerText = `✅ Aplicando ${aplicados}/${total}`;
        reportarProgreso(aplicados, total, 'running');
        await delay(600);
      }
    } else {
      indicador.innerText = 'ℹ️ No hay cupones para aplicar';
      reportarProgreso(0, 0, 'empty');
      await delay(1500);
    }

    // Navegación a la siguiente página
    const nextBtn = document.querySelector('.andes-pagination__button--next a');
    const isNextDisabled = document.querySelector('.andes-pagination__button--next.andes-pagination__button--disabled');

    if (nextBtn && !isNextDisabled) {
      indicador.innerText = '➡️ Siguiente página...';
      reportarProgreso(total, total, 'navigating');
      await delay(1000);
      nextBtn.click();
      // No desactivar: el script volverá a correr en la siguiente página
    } else {
      // Leer el total acumulado desde storage antes de desactivar
      const stored = await chrome.storage.local.get(['progress']);
      const acumulado = stored?.progress?.applied ?? total;
      indicador.innerText = `🎉 ¡Listo! ${acumulado} cupones aplicados`;
      await delay(2000);
      await desactivar(acumulado);
    }

  } catch (e) {
    indicador.innerText = '⚠️ Error. Desactivando...';
    reportarProgreso(0, 0, 'error');
    await delay(1500);
    await desactivar(0);
    console.error('[ML Cupones] Error en content script:', e);
  }
});