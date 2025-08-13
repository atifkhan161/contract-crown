// Theme Switcher - Contract Crown PWA
class ThemeSwitcher {
  constructor() {
    this.currentTheme = localStorage.getItem('theme') || 'forest';
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
    return ['tropical', 'blue', 'forest', 'ocean', 'deepSea'];
  }

  getCurrentTheme() {
    return this.currentTheme;
  }
}

export default ThemeSwitcher;