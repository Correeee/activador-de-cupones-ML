const btn = document.getElementById('toggleBtn');
const CUPONES_URL = "https://www.mercadolibre.com.ar/cupones/filter?status=inactive&source_page=int_applied_filters&all=true";

chrome.storage.local.get(['active'], (res) => {
    actualizarBoton(!!res.active);
});

// ESCUCHA EL FIN DEL PROCESO PARA DESACTIVAR
chrome.runtime.onMessage.addListener((request) => {
    if (request.action === "finish") {
        chrome.storage.local.set({ active: false }, () => {
            actualizarBoton(false);
        });
    }
});

btn.addEventListener('click', () => {
    chrome.storage.local.get(['active'], (res) => {
        const nuevoEstado = !res.active;
        
        chrome.storage.local.set({ active: nuevoEstado }, () => {
            actualizarBoton(nuevoEstado);
            
            chrome.tabs.query({}, (tabs) => {
                const tabCupones = tabs.find(t => t.url && t.url.includes("mercadolibre.com.ar/cupones"));

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

function actualizarBoton(active) {
    btn.innerText = active ? 'Aplicando...' : 'Aplicar todos los cupones';
    btn.className = active ? 'on' : 'off';
}