import { defineConfig } from "vite";
function offlineApp() {
  return {
    name: "offline-app",
    generateBundle(_, bundle) {
      const assets = [
        "./",
        "./index.html",
        "./icon.svg",
        "./icon-192.png",
        "./icon-512.png",
        "./manifest.webmanifest",
        ...Object.keys(bundle).map((k) => "./" + k),
      ];
      const version = Date.now();
      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        source: `const CACHE='tcc-studio-${version}';const FILES=${JSON.stringify(assets)};self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES))));self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('tcc-studio-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin)return;if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).catch(()=>caches.match(new URL('./index.html',self.registration.scope))));return;}event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));});self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>list[0]?list[0].focus():clients.openWindow(self.registration.scope)));});`,
      });
    },
  };
}
export default defineConfig({
  base: "./",
  server: { host: "0.0.0.0" },
  preview: { host: "0.0.0.0" },
  plugins: [offlineApp()],
  build: { chunkSizeWarningLimit: 1000 },
});
