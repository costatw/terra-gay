// Firebase CLI 15 encaminha ate chamadas de emuladores pelo proxy externo.
// Requisicoes locais devem ir ao proprio emulador; destinos externos continuam
// com o dispatcher/proxy original e com verificacao TLS intacta.
function localFetch(originalFetch) { return function (input, options) {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && options?.dispatcher) {
    const { dispatcher, ...localOptions } = options;
    return originalFetch(input, localOptions);
  }
  return originalFetch(input, options);
}; }
globalThis.fetch = localFetch(globalThis.fetch);
// O CLI importa fetch do undici em vez do fetch global em algumas rotas.
const { createRequire } = require('node:module');
const { realpathSync } = require('node:fs');
try {
  const cliRequire = createRequire(realpathSync(process.argv[1]));
  const undici = cliRequire('undici');
  undici.fetch = localFetch(undici.fetch);
  undici.request = localFetch(undici.request);
} catch { /* Outros processos usam apenas o fetch nativo. */ }
