// Theme Switcher - Contract Crown PWA
class ThemeSwitcher {
  constructor() {
    this.currentTheme = localStorage.getItem('theme') || 'deepSea';
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
    return ['deepSea', 'earth', 'blue', 'forest', 'pastel', ];
  }

  getCurrentTheme() {
    return this.currentTheme;
  }
}

export default ThemeSwitcher;