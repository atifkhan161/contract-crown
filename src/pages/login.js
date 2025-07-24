/**
 * Login Page JavaScript
 * Handles login form submission and UI interactions
 */

document.addEventListener('DOMContentLoaded', function() {
    const authManager = new window.AuthManager();
    const loginForm = document.getElementById('login-form');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const rememberMeCheckbox = document.getElementById('remember-me');
    const loginButton = document.getElementById('login-btn');
    const loginSpinner = document.getElementById('login-spinner');
    const formError = document.getElementById('form-error');

    // Handle form submission
    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        // Clear previous messages
        formError.textContent = '';
        formError.style.display = 'none';
        formError.style.color = '#f44336'; // Reset to error color
        
        // Get form data
        const credentials = {
            username: usernameInput.value.trim(),
            password: passwordInput.value
        };
        const rememberMe = rememberMeCheckbox.checked;

        // Validate inputs
        if (!credentials.username || !credentials.password) {
            showError('Please fill in all fields');
            return;
        }

        // Show loading state
        setLoadingState(true);

        try {
            const result = await authManager.login(credentials, rememberMe);
            
            if (result.success) {
                console.log('[Login] Login successful:', result);
                
                // Store username if remember me is checked
                if (rememberMe) {
                    localStorage.setItem('contract_crown_last_username', credentials.username);
                } else {
                    localStorage.removeItem('contract_crown_last_username');
                }
                
                // Verify authentication state after login
                const isAuth = authManager.isAuthenticated();
                const token = authManager.getToken();
                const user = authManager.getCurrentUser();
                
                console.log('[Login] Post-login auth state:', {
                    isAuthenticated: isAuth,
                    hasToken: !!token,
                    token: token?.substring(0, 20) + '...',
                    hasUser: !!user,
                    user: user?.username
                });
                
                // Show success message briefly before redirect
                formError.style.color = '#4CAF50';
                formError.textContent = 'Login successful! Redirecting...';
                formError.style.display = 'block';
                
                // Redirect to dashboard after brief delay
                setTimeout(() => {
                    console.log('[Login] Redirecting to dashboard...');
                    window.location.href = 'dashboard.html';
                }, 500);
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
        formError.style.color = '#f44336'; // Red color for errors
        formError.textContent = message;
        formError.style.display = 'block';
    }

    // Check if already authenticated
    if (authManager.isAuthenticated()) {
        window.location.href = 'dashboard.html';
        return;
    }
    
    // Load remember me preference and pre-fill if available
    if (authManager.getRememberMe()) {
        rememberMeCheckbox.checked = true;
        // Pre-fill username if stored
        const lastUsername = localStorage.getItem('contract_crown_last_username');
        if (lastUsername) {
            usernameInput.value = lastUsername;
            // Focus on password field if username is pre-filled
            passwordInput.focus();
        }
    }
    
    // Handle remember me checkbox changes
    rememberMeCheckbox.addEventListener('change', function() {
        if (!this.checked) {
            // If unchecking remember me, remove stored username
            localStorage.removeItem('contract_crown_last_username');
        }
    });
});