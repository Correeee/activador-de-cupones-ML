# ROADMAP — Auto Activador de Cupones (Mercado Libre)

## v1.4.0 — Corrección de bugs y pruebas

- [x] Corregir selector de botones: la página real usa el texto **"Buscar"**, no "APLICAR".
- [x] Detectar cupones por `.coupon-card` y excluir los ya activados (`.andes-badge--green`).
- [x] Corregir el contador acumulado entre páginas (antes solo reflejaba la última página).
- [x] Aislar errores por click para que un fallo no aborte todo el proceso.
- [x] Agregar pruebas funcionales con Jest + JSDOM.
- [x] Reescribir `README.md` (estaba corrupto en UTF-16).

## v1.5.0 — Robustez (actual)

- [x] Reemplazar `delay` fijo por espera reactiva (`waitFor` con MutationObserver).
- [x] Confirmar la activación real del cupón (badge verde) con reintentos y backoff exponencial.
- [x] Detección de sesión expirada / login requerido (estado `login` en el popup).
- [x] Interrupción inmediata del proceso al presionar "Detener".
- [x] Ampliar la suite de pruebas a 21 tests.

## v1.5.1 — Corrección de navegación indebida (actual)

- [x] Eliminar el clickeo del botón "Buscar" (navegaba a la lista de productos).
- [x] Los cupones se activan solos al cargar la página: solo se cuentan los activados.
- [x] Reescribir la lógica de conteo (`contarTarjetas`, `contarActivados`).
- [x] Actualizar la suite de pruebas (18 tests) con el DOM real de una tarjeta.

## v1.6.0 — Visibilidad y automatización (actual)

- [x] Historial de cupones activados (título, descuento, comercio, fecha) en el popup.
- [x] Barra de progreso real con total de páginas ("Página X de Y").
- [x] Notificación nativa al finalizar (permiso `notifications`).
- [x] Ampliar la suite de pruebas a 26 tests.

## v1.7.0 — Seguridad y robustez técnica (en progreso)

- [x] Reducir permisos (eliminado `tabs` broad en favor de `host_permissions` específicos de Mercado Libre).
- [x] Definir `run_at: document_idle` en el content script.
- [x] Corregir codificación de `README.md` a UTF-8 y alinear versiones del proyecto (1.6.0).
- [x] Aislamiento visual del cartel con Shadow DOM (`crearIndicadorFlotante`) para prevenir colisiones con el CSS de Mercado Libre.
- [x] Detección y limpieza de pestaña cerrada en background (`chrome.tabs.onRemoved`) evitando estados huérfanos.
- [x] Deduplicación en el historial de cupones (`mergeHistorial` y `claveCupon`).
- [x] Click en notificación nativa enfoca automáticamente la pestaña de cupones.
- [x] Ampliar la suite de pruebas a 31 tests.
- [ ] Panel de opciones (`options.html`): delay, modo silencioso, rango de páginas.
- [ ] Tests de integración del flujo completo y de `popup.js`.

## v2.0.0 — Experiencia de usuario

- [ ] Historial de cupones persistente acumulado con filtros por fecha.
- [ ] Opción de modo "silencioso" (sin indicador flotante).
- [ ] Internacionalización y soporte multi-país (es-AR / es-MX / pt-BR / es-CL / es-CO).

*Última actualización: 2026-10-04 (Shadow DOM, limpieza onRemoved, deduplicación en historial y 31 tests pasando)*
