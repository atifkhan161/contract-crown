// Theme Switcher - Contract Crown PWA
class ThemeSwitcher {
  constructor() {
    this.currentTheme = localStorage.getItem('theme') || 'primevideo';
    this.applyTheme(this.currentTheme);
  }

  applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    this.currentTheme = theme;
  }

  switchTheme(theme) {
    this.applyTheme(theme);
  }

  getAvailableThemes() {
    return ['netflix', 'primevideo', 'crunchyroll', 'hulu', 'golden', 'citrus', 'deco', 'earthy', 'pastel', 'perplexity', 'kindle', 'kiro'];
  }

  getCurrentTheme() {
    return this.currentTheme;
  }
}

export default ThemeSwitcher;