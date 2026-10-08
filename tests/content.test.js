// tests/content.test.js
// Pruebas funcionales de la lógica de content.js usando JSDOM.
// Se carga content.js en un entorno con `chrome` mockeado para exponer
// las funciones puras en window.__ML_CUPONES__.

const fs = require('fs');
const path = require('path');

/**
 * Carga content.js dentro del entorno JSDOM actual con un mock de chrome.
 * @param {object} opts
 * @param {boolean} opts.active - Valor inicial de chrome.storage.local 'active'.
 * @param {object} opts.progress - Valor inicial de 'progress'.
 */
function cargarContentScript({ active = false, progress = null } = {}) {
    const store = { active, progress };

    global.chrome = {
        storage: {
            local: {
                get: jest.fn((keys, cb) => {
                    const result = {};
                    (Array.isArray(keys) ? keys : [keys]).forEach((k) => {
                        result[k] = store[k];
                    });
                    if (cb) cb(result);
                    return Promise.resolve(result);
                }),
                set: jest.fn((obj, cb) => {
                    Object.assign(store, obj);
                    if (cb) cb();
                    return Promise.resolve();
                })
            },
            onChanged: { addListener: jest.fn() }
        },
        runtime: {
            sendMessage: jest.fn(() => Promise.resolve()),
            onMessage: { addListener: jest.fn() }
        }
    };

    const code = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
    // eslint-disable-next-line no-eval
    window.eval(code);

    return { store };
}

// ── Fixture: tarjeta real de cupón (simplificada del DOM de ML) ───────────────
// El único botón es "Buscar" (navega). El badge verde indica cupón activado.
function tarjetaCupon({ activado = false } = {}) {
    const badge = activado
        ? '<div class="andes-badge andes-badge--pill andes-badge--green andes-badge--small"><div class="andes-badge__icon"></div></div>'
        : '';
    return `
    <div class="coupon-card">
      <div class="top-row"><div class="badge">${badge}</div></div>
      <div class="info-section"><div class="title">40% OFF</div></div>
      <div class="bottom-row expiration-date">
        <button type="button" class="andes-button andes-button--small andes-button--quiet"
          aria-label="Buscar productos del cupón 40 por ciento OFF">
          <span class="andes-button__content">Buscar</span>
        </button>
      </div>
    </div>`;
}

function htmlConTarjetas({ activadas = 0, pendientes = 0 } = {}) {
    let cards = '';
    for (let i = 0; i < activadas; i++) cards += tarjetaCupon({ activado: true });
    for (let i = 0; i < pendientes; i++) cards += tarjetaCupon({ activado: false });
    return `<div class="coupons-list">${cards}</div>`;
}

describe('content.js — contarTarjetas', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        cargarContentScript();
    });

    test('cuenta todas las tarjetas .coupon-card', () => {
        document.body.innerHTML = htmlConTarjetas({ activadas: 2, pendientes: 3 });
        expect(window.__ML_CUPONES__.contarTarjetas(document)).toBe(5);
    });

    test('devuelve 0 sin tarjetas', () => {
        document.body.innerHTML = '<div></div>';
        expect(window.__ML_CUPONES__.contarTarjetas(document)).toBe(0);
    });
});

describe('content.js — contarActivados', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        cargarContentScript();
    });

    test('cuenta solo las tarjetas con badge verde', () => {
        document.body.innerHTML = htmlConTarjetas({ activadas: 3, pendientes: 2 });
        expect(window.__ML_CUPONES__.contarActivados(document)).toBe(3);
    });

    test('devuelve 0 si ninguna está activada', () => {
        document.body.innerHTML = htmlConTarjetas({ pendientes: 4 });
        expect(window.__ML_CUPONES__.contarActivados(document)).toBe(0);
    });

    test('cuenta todas si todas están activadas', () => {
        document.body.innerHTML = htmlConTarjetas({ activadas: 4 });
        expect(window.__ML_CUPONES__.contarActivados(document)).toBe(4);
    });
});

describe('content.js — obtenerSiguientePagina', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        cargarContentScript();
    });

    test('detecta botón siguiente habilitado', () => {
        document.body.innerHTML = `
      <li class="andes-pagination__button andes-pagination__button--next">
        <a href="?page=3">Siguiente</a>
      </li>`;
        const { nextBtn, disabled } = window.__ML_CUPONES__.obtenerSiguientePagina(document);
        expect(nextBtn).not.toBeNull();
        expect(disabled).toBe(false);
    });

    test('detecta botón siguiente deshabilitado (última página)', () => {
        document.body.innerHTML = `
      <li class="andes-pagination__button andes-pagination__button--next andes-pagination__button--disabled">
        <a>Siguiente</a>
      </li>`;
        const { disabled } = window.__ML_CUPONES__.obtenerSiguientePagina(document);
        expect(disabled).toBe(true);
    });

    test('sin paginación devuelve nextBtn null', () => {
        document.body.innerHTML = '<div></div>';
        const { nextBtn, disabled } = window.__ML_CUPONES__.obtenerSiguientePagina(document);
        expect(nextBtn).toBeNull();
        expect(disabled).toBe(false);
    });
});

describe('content.js — calcularAcumulado', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        cargarContentScript();
    });

    test('suma acumulado previo + actual', () => {
        expect(window.__ML_CUPONES__.calcularAcumulado(5, 3)).toBe(8);
    });

    test('maneja valores no numéricos como 0', () => {
        expect(window.__ML_CUPONES__.calcularAcumulado(undefined, 4)).toBe(4);
        expect(window.__ML_CUPONES__.calcularAcumulado(2, null)).toBe(2);
        expect(window.__ML_CUPONES__.calcularAcumulado(NaN, NaN)).toBe(0);
    });

    test('acumula correctamente a lo largo de varias páginas', () => {
        let total = 0;
        total = window.__ML_CUPONES__.calcularAcumulado(total, 3); // pág 1
        total = window.__ML_CUPONES__.calcularAcumulado(total, 2); // pág 2
        total = window.__ML_CUPONES__.calcularAcumulado(total, 4); // pág 3
        expect(total).toBe(9);
    });
});

describe('content.js — esPaginaDeLogin', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        cargarContentScript();
    });

    test('detecta login por URL', () => {
        expect(
            window.__ML_CUPONES__.esPaginaDeLogin(document, 'https://www.mercadolibre.com.ar/jms/login')
        ).toBe(true);
        expect(
            window.__ML_CUPONES__.esPaginaDeLogin(document, 'https://www.mercadolibre.com.ar/login')
        ).toBe(true);
    });

    test('detecta login por formulario en el DOM', () => {
        document.body.innerHTML = '<form action="/login"><input name="password"></form>';
        expect(
            window.__ML_CUPONES__.esPaginaDeLogin(document, 'https://www.mercadolibre.com.ar/cupones')
        ).toBe(true);
    });

    test('devuelve false en la página de cupones normal', () => {
        document.body.innerHTML = htmlConTarjetas({ activadas: 2 });
        expect(
            window.__ML_CUPONES__.esPaginaDeLogin(document, 'https://www.mercadolibre.com.ar/cupones/filter?page=2')
        ).toBe(false);
    });
});

describe('content.js — waitFor', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        cargarContentScript();
    });

    test('resuelve true inmediatamente si la condición ya se cumple', async () => {
        document.body.innerHTML = htmlConTarjetas({ activadas: 1 });
        const ok = await window.__ML_CUPONES__.waitFor(
            () => window.__ML_CUPONES__.contarTarjetas(document) > 0,
            { timeout: 1000 }
        );
        expect(ok).toBe(true);
    });

    test('resuelve true cuando el DOM cambia (reactivo)', async () => {
        const promesa = window.__ML_CUPONES__.waitFor(
            () => window.__ML_CUPONES__.contarTarjetas(document) > 0,
            { timeout: 2000 }
        );
        setTimeout(() => {
            document.body.innerHTML = htmlConTarjetas({ activadas: 1 });
        }, 50);
        const ok = await promesa;
        expect(ok).toBe(true);
    });

    test('resuelve false al expirar el timeout', async () => {
        const ok = await window.__ML_CUPONES__.waitFor(() => false, { timeout: 300 });
        expect(ok).toBe(false);
    });
});

describe('content.js — flujo de conteo por página', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        cargarContentScript();
    });

    test('simula 3 páginas y acumula los activados correctamente', () => {
        const { calcularAcumulado, contarActivados } = window.__ML_CUPONES__;
        let acumulado = 0;

        // Página 1: 4 activados
        document.body.innerHTML = htmlConTarjetas({ activadas: 4, pendientes: 1 });
        acumulado = calcularAcumulado(acumulado, contarActivados(document));

        // Página 2: 3 activados
        document.body.innerHTML = htmlConTarjetas({ activadas: 3, pendientes: 2 });
        acumulado = calcularAcumulado(acumulado, contarActivados(document));

        // Página 3: 2 activados
        document.body.innerHTML = htmlConTarjetas({ activadas: 2 });
        acumulado = calcularAcumulado(acumulado, contarActivados(document));

        expect(acumulado).toBe(9);
    });
});

describe('content.js — extraerDatosCupon', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        cargarContentScript();
    });

    test('extrae título, descuento y comercio de una tarjeta', () => {
        document.body.innerHTML = `
      <div class="coupon-card">
        <div class="info-section">
          <div class="title"><span>40% OFF</span></div>
          <div class="subtitles">
            <span class="subtitle">En productos de Azulpavon</span>
          </div>
        </div>
      </div>`;
        const card = document.querySelector('.coupon-card');
        const datos = window.__ML_CUPONES__.extraerDatosCupon(card);
        expect(datos.titulo).toBe('40% OFF');
        expect(datos.descuento).toBe('40% OFF');
        expect(datos.comercio).toBe('Azulpavon');
        expect(typeof datos.fecha).toBe('string');
        expect(datos.fecha.length).toBeGreaterThan(0);
    });

    test('maneja tarjeta sin comercio', () => {
        document.body.innerHTML = `
      <div class="coupon-card">
        <div class="title">15% OFF</div>
      </div>`;
        const card = document.querySelector('.coupon-card');
        const datos = window.__ML_CUPONES__.extraerDatosCupon(card);
        expect(datos.titulo).toBe('15% OFF');
        expect(datos.comercio).toBe('');
    });

    test('devuelve objeto vacío si la tarjeta es null', () => {
        const datos = window.__ML_CUPONES__.extraerDatosCupon(null);
        expect(datos.titulo).toBe('');
        expect(datos.comercio).toBe('');
    });
});

describe('content.js — extraerCuponesActivados', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        cargarContentScript();
    });

    test('devuelve solo los cupones con badge verde', () => {
        document.body.innerHTML = htmlConTarjetas({ activadas: 2, pendientes: 3 });
        const cupones = window.__ML_CUPONES__.extraerCuponesActivados(document);
        expect(cupones).toHaveLength(2);
        cupones.forEach((c) => {
            expect(c.descuento).toBe('40% OFF');
        });
    });

    test('devuelve array vacío si no hay activados', () => {
        document.body.innerHTML = htmlConTarjetas({ pendientes: 3 });
        const cupones = window.__ML_CUPONES__.extraerCuponesActivados(document);
        expect(cupones).toHaveLength(0);
    });
});

describe('content.js — obtenerTotalPaginas', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        cargarContentScript();
    });

    test('detecta el total desde los hrefs de paginación', () => {
        document.body.innerHTML = `
      <ul class="andes-pagination">
        <li class="andes-pagination__button"><a href="?page=1">1</a></li>
        <li class="andes-pagination__button"><a href="?page=2">2</a></li>
        <li class="andes-pagination__button"><a href="?page=18">18</a></li>
      </ul>`;
        expect(window.__ML_CUPONES__.obtenerTotalPaginas(document)).toBe(18);
    });

    test('detecta el total desde el texto de los botones', () => {
        document.body.innerHTML = `
      <ul class="andes-pagination">
        <li class="andes-pagination__button">1</li>
        <li class="andes-pagination__button">2</li>
        <li class="andes-pagination__button">5</li>
      </ul>`;
        expect(window.__ML_CUPONES__.obtenerTotalPaginas(document)).toBe(5);
    });

    test('devuelve 1 si no hay paginación', () => {
        document.body.innerHTML = '<div></div>';
        expect(window.__ML_CUPONES__.obtenerTotalPaginas(document)).toBe(1);
    });
});

describe('content.js — claveCupon y mergeHistorial', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        cargarContentScript();
    });

    test('claveCupon normaliza título y comercio ignorando mayúsculas y espacios', () => {
        const c1 = { titulo: ' 20% OFF ', comercio: 'Tienda Oficial' };
        const c2 = { titulo: '20% off', comercio: 'tienda oficial' };
        expect(window.__ML_CUPONES__.claveCupon(c1)).toBe('20% off__tienda oficial');
        expect(window.__ML_CUPONES__.claveCupon(c1)).toBe(window.__ML_CUPONES__.claveCupon(c2));
    });

    test('claveCupon devuelve string vacío si el cupón es null o indefinido', () => {
        expect(window.__ML_CUPONES__.claveCupon(null)).toBe('');
        expect(window.__ML_CUPONES__.claveCupon({})).toBe('__');
    });

    test('mergeHistorial combina cupones nuevos sin duplicar existentes', () => {
        const previos = [
            { titulo: '10% OFF', comercio: 'Nike', fecha: '2026-01-01' },
            { titulo: '20% OFF', comercio: 'Adidas', fecha: '2026-01-01' }
        ];
        const nuevos = [
            { titulo: '20% OFF', comercio: 'Adidas', fecha: '2026-01-02' }, // repetido
            { titulo: '30% OFF', comercio: 'Puma', fecha: '2026-01-02' }
        ];
        const combinado = window.__ML_CUPONES__.mergeHistorial(previos, nuevos);
        expect(combinado).toHaveLength(3);
        expect(combinado.map((c) => c.comercio)).toEqual(['Nike', 'Adidas', 'Puma']);
    });

    test('mergeHistorial maneja valores nulos o vacíos', () => {
        expect(window.__ML_CUPONES__.mergeHistorial(null, null)).toEqual([]);
        expect(window.__ML_CUPONES__.mergeHistorial([], null)).toEqual([]);
    });
});

describe('content.js — crearIndicadorFlotante (Shadow DOM)', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        cargarContentScript();
    });

    test('crea el host en el DOM y permite actualizar el texto y removerse', () => {
        const indicador = window.__ML_CUPONES__.crearIndicadorFlotante(document);
        const host = document.getElementById('ml-cupones-indicador-host');
        expect(host).not.toBeNull();

        indicador.setText('Probando indicador...');
        const container = host.shadowRoot ? host.shadowRoot.querySelector('.badge') : host;
        expect(container.textContent).toBe('Probando indicador...');

        indicador.remover();
        expect(document.getElementById('ml-cupones-indicador-host')).toBeNull();
    });
});

