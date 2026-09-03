const CACHE_NAME = 'gym-tracker-v9';
const APP_SHELL = ['./', './index.html', './manifest.json'];
const OPTIONAL_ASSETS = [
    'https://cdn.tailwindcss.com',
    'https://cdn.jsdelivr.net/npm/chart.js',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;800;900&display=swap'
];

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll(APP_SHELL);
        await Promise.allSettled(OPTIONAL_ASSETS.map((url) => cache.add(url)));
    })());
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;

    if (request.mode === 'navigate') {
        event.respondWith((async () => {
            try {
                const response = await fetch(request);
                if (response && response.ok) {
                    const cache = await caches.open(CACHE_NAME);
                    cache.put('./index.html', response.clone());
                }
                return response;
            } catch (error) {
                return (await caches.match(request)) || (await caches.match('./index.html'));
            }
        })());
        return;
    }

    event.respondWith((async () => {
        const cached = await caches.match(request);
        const network = fetch(request).then(async (response) => {
            if (response && (response.ok || response.type === 'opaque')) {
                const cache = await caches.open(CACHE_NAME);
                await cache.put(request, response.clone());
            }
            return response;
        }).catch(() => null);
        return cached || (await network) || new Response('', { status: 504, statusText: 'Offline' });
    })());
});
