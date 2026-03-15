/* --- CONFIGURATION DU SERVICE WORKER --- */
const CACHE_NAME = 'genealogie-mobile-v2.9.9';

// Liste exhaustive des ressources à mettre en cache
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './historique.css',
  './app.js',
  './map-modules.js',
  './sw.js',
  './tree-modules.js',
  './relation-modules.js',
  './search-modules.js',
  './data.json',
  './logo.png',
  './logo_512.png',
  
  // Icône principale
  //'./icons/apple-touch-icon.png',
  
  // Splash Screens (Ta liste complète d'images .jpg)
  './icons/apple-splash-1668-2388.jpg',
  './icons/apple-splash-2048-1536.jpg',
  './icons/apple-splash-2048-2732.jpg',
  './icons/apple-splash-2224-1668.jpg',
  './icons/apple-splash-2360-1640.jpg',
  './icons/apple-splash-2388-1668.jpg',
  './icons/apple-splash-2732-2048.jpg'
];

/* 1. INSTALLATION : Mise en cache initiale */
self.addEventListener('install', (event) => {
  // Force l'activation immédiate sans attendre la fermeture des onglets
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('SW: Mise en cache des ressources système');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

/* 2. ACTIVATION : Nettoyage des anciens caches */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('SW: Suppression de l\'ancien cache', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  // Prend le contrôle des pages immédiatement
  return self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // On ne traite que le fichier de données
  if (event.request.url.includes('data.json')) {
    event.respondWith(
      // 1. Tenter d'abord le réseau pour avoir les dernières généalogies
      fetch(event.request)
        .then((response) => {
          // Si réseau OK, on met à jour le cache et on renvoie la réponse
          const clonate = response.clone();
          caches.open('genealogie-data-v1').then((cache) => {
            cache.put(event.request, clonate);
          });
          return response;
        })
        .catch(() => {
          // 2. Si réseau KO (ou URL ?v= introuvable), on fouille dans le cache
          // On cherche la correspondance même si l'URL a des paramètres différents
          return caches.match('data.json', { ignoreSearch: true });
        })
    );
  } else {
    // Stratégie standard pour les autres fichiers (HTML, JS, CSS)
    event.respondWith(caches.match(event.request).then(res => res || fetch(event.request)));
  }
});