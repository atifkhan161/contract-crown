// Theme Selector Component
import ThemeSwitcher from '../core/ThemeSwitcher.js';

class ThemeSelector {
  constructor(container) {
    this.container = container;
    this.themeSwitcher = new ThemeSwitcher();
    this.render();
  }

  render() {
    const themes = this.themeSwitcher.getAvailableThemes();
    const currentTheme = this.themeSwitcher.getCurrentTheme();

    this.container.innerHTML = `
      <div class="theme-selector">
        <label>Theme:</label>
        <select id="theme-select">
          ${themes.map(theme => 
            `<option value="${theme}" ${theme === currentTheme ? 'selected' : ''}>${theme.charAt(0).toUpperCase() + theme.slice(1)}</option>`
          ).join('')}
        </select>
      </div>
    `;

    this.container.querySelector('#theme-select').addEventListener('change', (e) => {
      this.themeSwitcher.switchTheme(e.target.value);
    });
  }
}

export default ThemeSelector;