import { GameApp } from './core/GameApp.js';

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    const app = new GameApp();
    app.initialize();
});

// Service Worker registration for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then((registration) => {
                console.log('SW registered: ', registration);
            })
            .catch((registrationError) => {
                console.log('SW registration failed: ', registrationError);
            });
    });
}