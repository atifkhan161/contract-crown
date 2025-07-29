/**
 * Registration Page JavaScript
 * Handles registration form submission and UI interactions
 */

import { AuthManager } from '../core/auth.js';

document.addEventListener('DOMContentLoaded', function () {
    const authManager = new AuthManager();
    const registerForm = document.getElementById('register-form');
    const usernameInput = document.getElementById('username');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const termsCheckbox = document.getElementById('terms');
    const registerButton = document.getElementById('register-btn');
    const registerSpinner = document.getElementById('register-spinner');
    const formError = document.getElementById('form-error');
    const strengthFill = document.getElementById('strength-fill');
    const strengthText = document.getElementById('strength-text');

    // Password strength checker
    passwordInput.addEventListener('input', function () {
        const password = passwordInput.value;
        const strength = calculatePasswordStrength(password);
        updatePasswordStrength(strength);
    });

    // Password confirmation validation
    confirmPasswordInput.addEventListener('input', function () {
        validatePasswordMatch();
    });

    // Handle form submission
    registerForm.addEventListener('submit', async function (e) {
        e.preventDefault();

        // Clear previous errors
        formError.textContent = '';
        formError.style.display = 'none';

        // Get form data
        const userData = {
            username: usernameInput.value.trim(),
            email: emailInput.value.trim(),
            password: passwordInput.value
        };

        // Validate inputs
        if (!validateForm(userData)) {
            return;
        }

        // Show loading state
        setLoadingState(true);

        try {
            const result = await authManager.register(userData);

            if (result.success) {
                // Redirect to login page
                window.location.href = 'login.html';
            } else {
                showError(result.message);
            }
        } catch (error) {
            console.error('Registration error:', error);
            showError('An unexpected error occurred. Please try again.');
        } finally {
            setLoadingState(false);
        }
    });

    function validateForm(userData) {
        // Username validation
        if (!userData.username || userData.username.length < 3) {
            showError('Username must be at least 3 characters long');
            return false;
        }

        // Email validation
        if (!userData.email || !isValidEmail(userData.email)) {
            showError('Please enter a valid email address');
            return false;
        }

        // Password validation
        if (!userData.password || userData.password.length < 4) {
            showError('Password must be at least 8 characters long');
            return false;
        }

        // Password confirmation
        if (userData.password !== confirmPasswordInput.value) {
            showError('Passwords do not match');
            return false;
        }

        // Terms acceptance
        if (!termsCheckbox.checked) {
            showError('You must agree to the Terms of Service and Privacy Policy');
            return false;
        }

        return true;
    }

    function validatePasswordMatch() {
        const password = passwordInput.value;
        const confirmPassword = confirmPasswordInput.value;
        const errorElement = document.getElementById('confirmPassword-error');

        if (confirmPassword && password !== confirmPassword) {
            errorElement.textContent = 'Passwords do not match';
            errorElement.style.display = 'block';
        } else {
            errorElement.textContent = '';
            errorElement.style.display = 'none';
        }
    }

    function calculatePasswordStrength(password) {
        let score = 0;

        if (password.length >= 8) score += 1;
        if (password.length >= 12) score += 1;
        if (/[a-z]/.test(password)) score += 1;
        if (/[A-Z]/.test(password)) score += 1;
        if (/[0-9]/.test(password)) score += 1;
        if (/[^A-Za-z0-9]/.test(password)) score += 1;

        return Math.min(score, 4);
    }

    function updatePasswordStrength(strength) {
        const strengthLevels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong'];
        const strengthColors = ['#ff4444', '#ff8800', '#ffaa00', '#88cc00', '#00cc44'];

        const percentage = (strength / 4) * 100;
        strengthFill.style.width = percentage + '%';
        strengthFill.style.backgroundColor = strengthColors[strength] || '#ddd';
        strengthText.textContent = strengthLevels[strength] || 'Password strength';
    }

    function isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    function setLoadingState(loading) {
        if (loading) {
            registerButton.disabled = true;
            registerSpinner.classList.remove('hidden');
            registerButton.querySelector('.btn-text').textContent = 'Creating Account...';
        } else {
            registerButton.disabled = false;
            registerSpinner.classList.add('hidden');
            registerButton.querySelector('.btn-text').textContent = 'Create Account';
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