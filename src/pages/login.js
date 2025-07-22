/**
 * Login Page JavaScript
 * Handles login form submission and UI interactions
 */

document.addEventListener('DOMContentLoaded', function() {
    const authManager = new AuthManager();
    const loginForm = document.getElementById('login-form');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const loginButton = document.getElementById('login-btn');
    const loginSpinner = document.getElementById('login-spinner');
    const formError = document.getElementById('form-error');

    // Handle form submission
    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        // Clear previous errors
        formError.textContent = '';
        formError.style.display = 'none';
        
        // Get form data
        const credentials = {
            username: usernameInput.value.trim(),
            password: passwordInput.value
        };

        // Validate inputs
        if (!credentials.username || !credentials.password) {
            showError('Please fill in all fields');
            return;
        }

        // Show loading state
        setLoadingState(true);

        try {
            const result = await authManager.login(credentials);
            
            if (result.success) {
                // Redirect to main app
                window.location.href = 'index.html';
            } else {
                showError(result.message);
            }
        } catch (error) {
            console.error('Login error:', error);
            showError('An unexpected error occurred. Please try again.');
        } finally {
            setLoadingState(false);
        }
    });

    function setLoadingState(loading) {
        if (loading) {
            loginButton.disabled = true;
            loginSpinner.classList.remove('hidden');
            loginButton.querySelector('.btn-text').textContent = 'Signing In...';
        } else {
            loginButton.disabled = false;
            loginSpinner.classList.add('hidden');
            loginButton.querySelector('.btn-text').textContent = 'Sign In';
        }
    }

    function showError(message) {
        formError.textContent = message;
        formError.style.display = 'block';
    }

    // Check if already authenticated
    if (authManager.isAuthenticated()) {
        window.location.href = 'index.html';
    }
});