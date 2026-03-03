chrome.storage.local.get(['active'], async (res) => {
  if (!res.active) return; // Si está apagado, no hace nada

  // Indicador visual en pantalla
  const indicador = document.createElement('div');
  indicador.innerHTML = 'Script: ACTIVADO';
  indicador.style = 'position:fixed; top:20px; left:20px; background:white; color:#1c1c1c; padding:15px; z-index:100000; border:2px solid #FFE600; font-family:sans-serif; font-weight:bold; border-radius:8px;';
  document.body.appendChild(indicador);

  const delay = (ms) => new Promise(r => setTimeout(r, ms));
  await delay(2000);

  // Buscamos los botones de aplicar
  let botones = Array.from(document.querySelectorAll('button.andes-button'))
    .filter(btn => btn.innerText.trim().toUpperCase() === 'APLICAR');

  if (botones.length > 0) {
    for (let i = 0; i < botones.length; i++) {
      botones[i].scrollIntoView({ behavior: 'smooth', block: 'center' });
      botones[i].click();
      indicador.innerHTML = `✅ Aplicando ${i + 1}/${botones.length}`;
      await delay(500); // Un poco más de delay para asegurar que el clic se procese
    }
  }

  // Lógica de navegación o finalización
  const nextBtn = document.querySelector('.andes-pagination__button--next a');
  const isNextDisabled = document.querySelector('.andes-pagination__button--next.andes-pagination__button--disabled');

  if (nextBtn && !isNextDisabled) {
    indicador.innerHTML = '➡️ Pasando a la siguiente página...';
    await delay(1000);
    nextBtn.click();
    // No enviamos "finish" porque el script volverá a correr en la siguiente página
  } else {
    // Si no hay más botones Y no hay más páginas, o terminamos la última página
    indicador.innerHTML = 'Fin de la lista. Desactivando...';
    await delay(1500);
    chrome.runtime.sendMessage({ action: "finish" });
  }
});