export type InstallPrompt = Event & {prompt(): Promise<void>; userChoice: Promise<{outcome: 'accepted' | 'dismissed'}>};
type InstallState = {installed: boolean; prompt?: InstallPrompt};
const display = window.matchMedia('(display-mode: standalone)');
let state: InstallState = {installed: display.matches || !!(navigator as Navigator & {standalone?: boolean}).standalone};
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());
export const installSnapshot = () => state;
export function subscribeInstall(listener: () => void) {listeners.add(listener); return () => {listeners.delete(listener);};}
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault(); if (!state.installed) {state = {...state, prompt: event as InstallPrompt}; notify();}
});
window.addEventListener('appinstalled', () => {state = {installed: true}; notify();});
display.addEventListener('change', () => {state = {...state, installed: display.matches || !!(navigator as Navigator & {standalone?: boolean}).standalone}; notify();});
export async function requestInstall() {
  const prompt = state.prompt; if (!prompt) return;
  state = {...state, prompt: undefined}; notify();
  await prompt.prompt(); await prompt.userChoice;
}
export function installInstructions() {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  if (ios) return {title: 'iPhone / iPad’e yükle', steps: ['Safari’de Test Arena’yı aç.', 'Paylaş düğmesine dokun.', 'Ana Ekrana Ekle → Ekle adımlarını izle.'], note: 'Yeni iOS sürümlerinde diğer tarayıcıların Paylaş menüsünde de Ana Ekrana Ekle bulunabilir. Görünmüyorsa Safari kullan.'};
  if (/Android/.test(ua)) return {title: 'Android’e yükle', steps: ['Test Arena’yı Chrome’da aç.', 'Tarayıcı menüsünden Uygulamayı yükle veya Ana ekrana ekle seçeneğini kontrol et.'], note: 'Kurulum seçeneğini tarayıcı belirler. Seçenek görünmüyorsa güvenli bağlantıda tekrar dene.'};
  if (/Chrome|Chromium|Edg\//.test(ua)) return {title: 'Bilgisayara yükle', steps: ['Chrome veya Edge adres çubuğundaki yükleme simgesini ya da tarayıcı menüsündeki uygulama yükleme seçeneğini kontrol et.'], note: 'Zaten yüklüyse mevcut Test Arena uygulamasını açabilirsin. Kurulum penceresi hazır olduğunda bu düğme doğrudan açar.'};
  if (/Macintosh/.test(ua) && /Safari/.test(ua)) return {title: 'Mac’e yükle', steps: ['Destekleyen Safari sürümünde Dosya → Dock’a Ekle seçeneğini kullan.'], note: 'Seçenek yoksa Chrome veya Edge’de aç.'};
  return {title: 'Tarayıcında kurulum', steps: ['Bu tarayıcıda otomatik kurulum seçeneği bulunmuyor. Test Arena’yı Chrome veya Edge’de aç.'], note: 'Web sürümünü bu tarayıcıda kullanmaya devam edebilirsin.'};
}
