// content.js — Script que corre en la página de cupones de Mercado Libre
//
// La URL destino filtra cupones INACTIVOS (status=inactive).
// Cada tarjeta tiene un botón "Aplicar" que hay que presionar para activar el cupón.
// Este script los presiona uno por uno con delays aleatorios para imitar
// el comportamiento humano y evitar detección como bot.
// Luego navega automáticamente a la siguiente página hasta terminar.

const CUPONES_URL = "https://www.mercadolibre.com.ar/cupones/filter?status=inactive&source_page=int_applied_filters&all=true";

// ── Lógica pura y testeable (sin dependencias del DOM global ni de chrome) ────
// Se expone en `window.__ML_CUPONES__` para poder testearla con JSDOM.

/**
 * Cuenta las tarjetas de cupón presentes en el contenedor.
 * @param {Document|Element} root
 * @returns {number}
 */
function contarTarjetas(root) {
  const scope = root || document;
  return scope.querySelectorAll('.coupon-card').length;
}

/**
 * Cuenta las tarjetas de cupón que están activadas (badge verde).
 * @param {Document|Element} root
 * @returns {number}
 */
function contarActivados(root) {
  const scope = root || document;
  return scope.querySelectorAll('.coupon-card .andes-badge--green').length;
}

/**
 * Extrae los datos de un cupón a partir de su tarjeta.
 * @param {Element} card - Elemento `.coupon-card`.
 * @returns {{ titulo: string, descuento: string, comercio: string, fecha: string }}
 */
function extraerDatosCupon(card) {
  const fecha = new Date().toISOString();
  if (!card) return { titulo: '', descuento: '', comercio: '', fecha };

  const tituloEl = card.querySelector('.title, [class*="title"], h2, h3, h4');
  let titulo = (tituloEl?.innerText || tituloEl?.textContent || '').trim();

  // Si no se encontró título con selectores estándar, buscar patrones de descuento en la tarjeta
  if (!titulo) {
    const textoCard = (card.innerText || card.textContent || '').trim();
    const matchDesc = textoCard.match(/(\d+%\s*OFF|\$\s*[\d.,]+\s*OFF)/i);
    titulo = matchDesc ? matchDesc[1].trim() : 'Cupón';
  }

  const descuento = titulo;

  // El comercio suele aparecer en el subtítulo "En productos de X" o elementos descriptivos
  let comercio = '';
  const subtitulos = Array.from(card.querySelectorAll('.subtitle, [class*="subtitle"], p, span'));
  for (const sub of subtitulos) {
    const texto = (sub.innerText || sub.textContent || '').trim();
    const match = texto.match(/En productos de\s+(.+)/i);
    if (match) {
      comercio = match[1].trim();
      break;
    }
  }

  return { titulo, descuento, comercio, fecha };
}

/**
 * Extrae los datos de todos los cupones activados de la página.
 * @param {Document|Element} root
 * @returns {Array<{titulo:string,descuento:string,comercio:string,fecha:string}>}
 */
function extraerCuponesActivados(root) {
  const scope = root || document;
  const tarjetas = Array.from(scope.querySelectorAll('.coupon-card'));
  return tarjetas
    .filter((card) => card.querySelector('.andes-badge--green'))
    .map((card) => extraerDatosCupon(card));
}

/**
 * Obtiene el número total de páginas desde la paginación.
 * Busca todos los botones de paginación y toma el mayor número de página.
 * @param {Document|Element} root
 * @returns {number} Total de páginas (mínimo 1).
 */
function obtenerTotalPaginas(root) {
  const scope = root || document;
  const botones = Array.from(
    scope.querySelectorAll('.andes-pagination__button, .andes-pagination__link')
  );

  let maxPagina = 1;
  for (const btn of botones) {
    // Intentar desde el atributo href (?page=N)
    const href = btn.getAttribute?.('href') || btn.querySelector?.('a')?.getAttribute('href') || '';
    const matchHref = href.match(/[?&]page=(\d+)/);
    if (matchHref) {
      maxPagina = Math.max(maxPagina, parseInt(matchHref[1], 10));
      continue;
    }
    // Intentar desde el texto (número de página)
    const texto = (btn.innerText || btn.textContent || '').trim();
    if (/^\d+$/.test(texto)) {
      maxPagina = Math.max(maxPagina, parseInt(texto, 10));
    }
  }
  return maxPagina;
}

/**
 * Determina si existe una página siguiente navegable.
 * @param {Document|Element} root
 * @returns {{ nextBtn: Element|null, disabled: boolean }}
 */
function obtenerSiguientePagina(root) {
  const scope = root || document;
  const nextBtn = scope.querySelector('.andes-pagination__button--next a');
  const disabled = !!scope.querySelector(
    '.andes-pagination__button--next.andes-pagination__button--disabled'
  );
  return { nextBtn, disabled };
}

/**
 * Calcula el total acumulado sumando lo previo en storage con lo nuevo.
 * @param {number} previo - Valor acumulado guardado previamente.
 * @param {number} ahora - Cupones contados en la página actual.
 * @returns {number}
 */
function calcularAcumulado(previo, ahora) {
  const base = Number.isFinite(previo) ? previo : 0;
  const actual = Number.isFinite(ahora) ? ahora : 0;
  return base + actual;
}

/**
 * Detecta si la página actual es una pantalla de login / sesión expirada.
 * @param {Document|Element} root
 * @param {string} url - URL actual.
 * @returns {boolean}
 */
function esPaginaDeLogin(root, url) {
  const scope = root || document;
  const href = url || (typeof window !== 'undefined' ? window.location.href : '');

  if (/\/login|\/jms\/login|iniciar-sesion/i.test(href)) return true;

  const tieneFormLogin = !!scope.querySelector(
    'form[action*="login"], input[name="password"], #login_form, .login-form'
  );
  return tieneFormLogin;
}

/**
 * Espera a que se cumpla una condición sobre el DOM, de forma reactiva.
 * Usa MutationObserver y resuelve apenas la condición se cumple, o por timeout.
 *
 * @param {Function} condicion - Devuelve true cuando se cumple.
 * @param {object} [opts]
 * @param {number} [opts.timeout=8000] - Tiempo máximo de espera en ms.
 * @param {number} [opts.interval=200] - Intervalo de sondeo de respaldo.
 * @param {Document|Element} [opts.root=document] - Raíz a observar.
 * @returns {Promise<boolean>} true si se cumplió, false si expiró.
 */
function waitFor(condicion, opts = {}) {
  const { timeout = 8000, interval = 200, root = document } = opts;

  return new Promise((resolve) => {
    let resuelto = false;
    let observer = null;
    let intervalId = null;
    let timeoutId = null;

    const limpiar = () => {
      if (observer) observer.disconnect();
      if (intervalId) clearInterval(intervalId);
      if (timeoutId) clearTimeout(timeoutId);
    };

    const finalizar = (valor) => {
      if (resuelto) return;
      resuelto = true;
      limpiar();
      resolve(valor);
    };

    try {
      if (condicion()) return finalizar(true);
    } catch (_) {
      /* ignorar */
    }

    if (typeof MutationObserver !== 'undefined') {
      observer = new MutationObserver(() => {
        try {
          if (condicion()) finalizar(true);
        } catch (_) {
          /* ignorar */
        }
      });
      observer.observe(root, { childList: true, subtree: true, attributes: true });
    }

    intervalId = setInterval(() => {
      try {
        if (condicion()) finalizar(true);
      } catch (_) {
        /* ignorar */
      }
    }, interval);

    timeoutId = setTimeout(() => finalizar(false), timeout);
  });
}

/**
 * Genera una clave identificadora única para un cupón a partir de su título y comercio.
 * @param {{ titulo?: string, comercio?: string, descuento?: string }} cupon
 * @returns {string}
 */
function claveCupon(cupon) {
  if (!cupon) return '';
  const titulo = (cupon.titulo || cupon.descuento || '').trim().toLowerCase();
  const comercio = (cupon.comercio || '').trim().toLowerCase();
  return `${titulo}__${comercio}`;
}

/**
 * Combina un historial previo con nuevos cupones sin duplicar entradas.
 * @param {Array<object>} previo
 * @param {Array<object>} nuevos
 * @returns {Array<object>}
 */
function mergeHistorial(previo = [], nuevos = []) {
  const listaPrevia = Array.isArray(previo) ? previo : [];
  const listaNuevos = Array.isArray(nuevos) ? nuevos : [];
  const vistos = new Set();
  const resultado = [];

  for (const c of listaPrevia) {
    const key = claveCupon(c);
    if (key && !vistos.has(key)) {
      vistos.add(key);
      resultado.push(c);
    }
  }

  for (const c of listaNuevos) {
    const key = claveCupon(c);
    if (key && !vistos.has(key)) {
      vistos.add(key);
      resultado.push(c);
    }
  }

  return resultado;
}

/**
 * Crea un indicador visual flotante aislado mediante Shadow DOM
 * para evitar colisiones con el CSS de Mercado Libre.
 * @param {Document} rootDoc
 * @returns {{ setText: (t: string) => void, remover: () => void, el: HTMLElement }}
 */
function crearIndicadorFlotante(rootDoc = document) {
  const host = rootDoc.createElement('div');
  host.id = 'ml-cupones-indicador-host';

  let container;
  if (host.attachShadow) {
    const shadow = host.attachShadow({ mode: 'open' });
    const style = rootDoc.createElement('style');
    style.textContent = `
      :host {
        all: initial;
        position: fixed;
        top: 20px;
        left: 20px;
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      }
      .badge {
        background: #ffffff;
        color: #1c1c1c;
        padding: 12px 16px;
        border: 2px solid #FFE600;
        border-radius: 10px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        font-size: 14px;
        font-weight: bold;
        min-width: 200px;
        display: inline-block;
        line-height: 1.4;
      }
    `;
    container = rootDoc.createElement('div');
    container.className = 'badge';
    container.textContent = '⏳ Iniciando...';
    shadow.appendChild(style);
    shadow.appendChild(container);
  } else {
    host.style.cssText = 'position:fixed;top:20px;left:20px;background:white;color:#1c1c1c;padding:12px 16px;z-index:2147483647;border:2px solid #FFE600;font-family:sans-serif;font-weight:bold;border-radius:10px;box-shadow:0 4px 12px rgba(0,0,0,0.15);font-size:14px;min-width:200px;';
    container = host;
    container.textContent = '⏳ Iniciando...';
  }

  rootDoc.body.appendChild(host);

  return {
    setText: (texto) => {
      container.textContent = texto;
    },
    remover: () => {
      if (host.parentNode) host.parentNode.removeChild(host);
    },
    el: host
  };
}

// Exponer para tests (JSDOM). En el navegador real no molesta.
if (typeof window !== 'undefined') {
  window.__ML_CUPONES__ = {
    contarTarjetas,
    contarActivados,
    extraerDatosCupon,
    extraerCuponesActivados,
    obtenerTotalPaginas,
    obtenerSiguientePagina,
    calcularAcumulado,
    esPaginaDeLogin,
    waitFor,
    claveCupon,
    mergeHistorial,
    crearIndicadorFlotante
  };
}

// ── Ejecución en la página (solo si estamos en un navegador con chrome API) ───
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
  chrome.storage.local.get(['active'], async (res) => {
    if (!res.active) return;

    // Indicador visual flotante aislado en Shadow DOM
    const indicador = crearIndicadorFlotante(document);

    const delay = (ms) => new Promise((r) => setTimeout(r, ms));

    // Retardo con variación aleatoria (jitter) para imitar el ritmo humano
    // y evitar que Mercado Libre lo detecte como bot.
    const delayHumano = (min, max) => {
      const ms = Math.floor(min + Math.random() * (max - min));
      return delay(ms);
    };

    const paginaActual = (() => {
      const params = new URLSearchParams(window.location.search);
      return parseInt(params.get('page') ?? '1', 10);
    })();

    const reportarProgreso = (applied, total, status, acumulado, extra = {}) => {
      chrome.runtime
        .sendMessage({
          action: 'progress',
          applied,
          total,
          page: paginaActual,
          status,
          acumulado,
          ...extra
        })
        .catch(() => { });
    };

    const desactivar = async (totalApplied = 0, historial = []) => {
      await chrome.storage.local.set({ active: false });
      chrome.runtime
        .sendMessage({ action: 'finish', totalApplied, historial })
        .catch(() => { });
    };

    const estaActivo = async () => {
      const s = await chrome.storage.local.get(['active']);
      return !!s.active;
    };

    // Devuelve todos los botones "Aplicar" presentes en la página
    const obtenerBotonesAplicar = () =>
      Array.from(document.querySelectorAll('button, a')).filter((el) => {
        const texto = (el.innerText || el.textContent || '').trim().toLowerCase();
        return texto === 'aplicar';
      });

    try {
      // 1) Espera reactiva: aguardar a que aparezcan tarjetas o el login
      indicador.setText('⏳ Esperando cupones...');
      await waitFor(
        () =>
          contarTarjetas(document) > 0 ||
          esPaginaDeLogin(document, window.location.href),
        { timeout: 10000 }
      );

      // 2) Detección de sesión expirada / login
      if (esPaginaDeLogin(document, window.location.href)) {
        indicador.setText('🔒 Sesión expirada. Iniciá sesión en Mercado Libre.');
        reportarProgreso(0, 0, 'login', 0);
        await delay(2500);
        await desactivar(0, []);
        return;
      }

      // 3) La página filtra cupones INACTIVOS (status=inactive).
      //    Cada tarjeta tiene un botón "Aplicar" que hay que presionar.
      const totalPaginas = obtenerTotalPaginas(document);

      const stored = await chrome.storage.local.get(['progress', 'historial']);
      const acumuladoPrevio = stored?.progress?.acumulado ?? 0;
      const historialPrevio = Array.isArray(stored?.historial) ? stored.historial : [];

      // Esperar a que aparezcan los botones "Aplicar" (pueden cargarse dinámicamente)
      await waitFor(() => obtenerBotonesAplicar().length > 0, { timeout: 8000 });

      const botonesAplicar = obtenerBotonesAplicar();
      const totalBotones = botonesAplicar.length;
      let activadosEnPagina = 0;

      if (totalBotones === 0) {
        indicador.setText('ℹ️ Sin cupones para aplicar en esta página');
        reportarProgreso(0, 0, 'empty', acumuladoPrevio, { totalPaginas });
      } else {
        indicador.setText(`🖱️ Aplicando ${totalBotones} cupones (pág. ${paginaActual}/${totalPaginas})...`);
        reportarProgreso(0, totalBotones, 'running', acumuladoPrevio, { totalPaginas });

        // Hacer click en cada botón "Aplicar" con delay humano entre clicks.
        // Re-obtenemos la lista en cada iteración porque el DOM puede cambiar.
        for (let i = 0; i < totalBotones; i++) {
          if (!(await estaActivo())) {
            indicador.setText('⏹ Detenido por el usuario');
            return;
          }

          // Tomar siempre el primer botón "Aplicar" disponible
          const btns = obtenerBotonesAplicar();
          if (btns.length === 0) break;
          const btn = btns[0];

          // Scroll suave para simular lectura humana
          btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await delayHumano(500, 1000);

          try {
            btn.click();
            activadosEnPagina++;

            const acumulado = calcularAcumulado(acumuladoPrevio, activadosEnPagina);
            indicador.setText(`✅ ${acumulado} aplicados — ${activadosEnPagina}/${totalBotones} en pág. ${paginaActual}`);
            reportarProgreso(activadosEnPagina, totalBotones, 'running', acumulado, { totalPaginas });
          } catch (err) {
            console.warn('[ML Cupones] No se pudo hacer click en botón Aplicar:', err);
          }

          // Esperar a que ML procese el cupón antes del siguiente click
          await delayHumano(500, 800);
        }
      }

      // 4) Extraer cupones activados en esta página para el historial
      await delayHumano(800, 1500);
      const cuponesPagina = extraerCuponesActivados(document);
      const historial = mergeHistorial(historialPrevio, cuponesPagina);
      const acumuladoFinal = calcularAcumulado(acumuladoPrevio, activadosEnPagina);

      // 5) Interrupción si el usuario detuvo
      if (!(await estaActivo())) {
        indicador.setText('⏹ Detenido por el usuario');
        return;
      }

      // 6) Navegación a la siguiente página
      const { nextBtn, disabled } = obtenerSiguientePagina(document);

      if (nextBtn && !disabled) {
        indicador.setText('➡️ Siguiente página...');
        reportarProgreso(activadosEnPagina, totalBotones || 0, 'navigating', acumuladoFinal, {
          totalPaginas,
          historial
        });
        await delayHumano(3000, 6000);
        nextBtn.click();
        // No desactivar: el script volverá a correr en la siguiente página
      } else {
        indicador.setText(`🎉 ¡Listo! ${acumuladoFinal} cupones aplicados`);
        await delayHumano(2000, 3000);
        await desactivar(acumuladoFinal, historial);
      }
    } catch (e) {
      indicador.setText('⚠️ Error. Desactivando...');
      reportarProgreso(0, 0, 'error', 0);
      await delay(1500);
      await desactivar(0, []);
      console.error('[ML Cupones] Error en content script:', e);
    }
  });
}

