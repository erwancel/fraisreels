/* ===========================================================
   sw.js — fonctionnement hors ligne
   Change CACHE_VERSION à chaque déploiement pour forcer la mise à jour.
   =========================================================== */

const CACHE_VERSION = 'frais-reels-v25';

// Coquille de l'application : mise en cache dès l'installation.
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './store.js',
  './exports.js',
  './import.js',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/apple-touch-icon-152.png',
  './icons/apple-touch-icon-120.png',
  './icons/favicon.ico',
  './icons/favicon-16.png',
  './icons/favicon-32.png',
  './icons/favicon-48.png'
];

// Ressources externes : mises en cache aussi, pour que les exports PDF et ZIP
// restent utilisables en vol, sans réseau.
const EXTERNAL = [
  'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
  'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js',
  'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    await cache.addAll(SHELL);
    // Les ressources externes ne doivent pas faire échouer l'installation.
    await Promise.allSettled(EXTERNAL.map(url =>
      fetch(url, { mode: 'cors' }).then(r => r.ok && cache.put(url, r))
    ));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Navigation : le réseau d'abord, le cache en secours.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_VERSION);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch {
        return (await caches.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  // Polices et bibliothèques : le cache d'abord, puis mise à jour en arrière-plan.
  const isExternal = url.origin !== location.origin;

  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) {
      if (!isExternal) {
        fetch(req).then(async (fresh) => {
          if (fresh.ok) (await caches.open(CACHE_VERSION)).put(req, fresh);
        }).catch(() => {});
      }
      return cached;
    }
    try {
      const fresh = await fetch(req);
      if (fresh.ok && (url.origin === location.origin || url.hostname.includes('jsdelivr') || url.hostname.includes('gstatic') || url.hostname.includes('googleapis'))) {
        (await caches.open(CACHE_VERSION)).put(req, fresh.clone());
      }
      return fresh;
    } catch {
      return cached || Response.error();
    }
  })());
});
