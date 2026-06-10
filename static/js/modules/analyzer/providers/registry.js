const providers = new Map();
let activeId = 'gemini';

export function register(provider) { providers.set(provider.id, provider); }
export function setActive(id) { activeId = id; }
export function getActive() {
  if (new URLSearchParams(location.search).get('analyzer') === 'mock' && providers.has('mock')) {
    return providers.get('mock');
  }
  return providers.get(activeId) || null;
}
