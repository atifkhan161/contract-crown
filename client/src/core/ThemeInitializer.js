// Theme Initializer - Ensures theme is applied on page load
class ThemeInitializer {
  static init() {
    const savedTheme = localStorage.getItem('theme') || 'earth';
    document.documentElement.setAttribute('data-theme', savedTheme);
  }
}

// Auto-initialize theme on script load
ThemeInitializer.init();

export default ThemeInitializer;