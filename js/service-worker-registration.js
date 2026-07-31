// Service Worker登録（PWA対応）
if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch((err) => {
          console.warn('Service Worker登録に失敗しました:', err);
        });
      });
    }
