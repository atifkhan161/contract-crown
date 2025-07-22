/**
 * Main application class that manages the overall game state and navigation
 */
export class GameApp {
    constructor() {
        this.currentView = null;
        this.appElement = document.getElementById('app');
    }

    /**
     * Initialize the application
     */
    initialize() {
        this.hideLoading();
        this.showMainMenu();
    }

    /**
     * Hide the loading screen
     */
    hideLoading() {
        const loading = document.getElementById('loading');
        if (loading) {
            loading.classList.add('hidden');
        }
    }

    /**
     * Show the main menu view
     */
    showMainMenu() {
        this.appElement.innerHTML = `
            <div class="container">
                <h1>Contract Crown</h1>
                <p>Welcome to Contract Crown - Coming Soon!</p>
            </div>
        `;
    }
}