// Elements
const loginForm = document.getElementById('loginForm');
const loginBtn = document.getElementById('loginBtn');
const twoFAModal = document.getElementById('twoFAModal');
const verify2FABtn = document.getElementById('verify2FA');
const cancel2FABtn = document.getElementById('cancel2FA');
const twoFACodeInput = document.getElementById('twoFACode');
const twoFAMessage = document.getElementById('twoFAMessage');

let cachedUsername = '';
let cachedPassword = '';

// Login form submission
loginForm.addEventListener('submit', async function(event) {
    event.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    cachedUsername = username;
    cachedPassword = password;
    
    try {
        // Show loading state
        loginBtn.classList.add('loading');
        loginBtn.disabled = true;
        
        const res = await fetch("http://127.0.0.1:8000/token", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                'username': username,
                'password': password,
            })
        });
        
        if (res.status === 401) {
            const data = await res.json();
            if (data.detail === '2FA required') {
                // Show 2FA modal (this hides the login form behind it)
                twoFAModal.style.display = 'block';
                twoFACodeInput.focus();
            } else {
                alert('Login failed: ' + (data.detail));
            }
        } else if (res.ok) {
            // No 2FA required - login complete
            const data = await res.json();
            await completeLogin(data.access_token);
        } else if (!res.ok) {
            const data = await res.json();
            alert('Login failed: ' + (data.detail || 'Invalid credentials'));
        }
    } catch (error) {
        console.error('Error during login:', error);
        alert('An error occurred. Please try again later.');
    } finally {
        // Reset button state
        loginBtn.classList.remove('loading');
        loginBtn.disabled = false;
    }
});

// Verify 2FA
verify2FABtn.addEventListener('click', async function() {
    const otp = twoFACodeInput.value.trim();
    
    // Validate code
    if (!otp || otp.length !== 6 || !/^\d{6}$/.test(otp)) {
        showMessage('Please enter a valid 6-digit code', 'error');
        return;
    }
    
    try {
        // Show loading state
        verify2FABtn.classList.add('loading');
        verify2FABtn.disabled = true;
        cancel2FABtn.disabled = true;
        
        const res = await fetch("http://127.0.0.1:8000/token_2fa", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                'username': cachedUsername,
                'password': cachedPassword,
                'otp': otp
            })
        });
        
        if (res.ok) {
            const data = await res.json();
            showMessage('✓ Verification successful!', 'success');
            
            // Close modal and complete login
            setTimeout(() => {
                twoFAModal.style.display = 'none';
                completeLogin(data.access_token);
            }, 1000);
        } else {
            const data = await res.json();
            showMessage(data.detail || 'Invalid code. Please try again.', 'error');
            twoFACodeInput.value = '';
            twoFACodeInput.focus();
        }
    } catch (error) {
        console.error('Error during 2FA verification:', error);
        showMessage('Verification failed. Please try again.', 'error');
    } finally {
        // Reset button states
        verify2FABtn.classList.remove('loading');
        verify2FABtn.disabled = false;
        cancel2FABtn.disabled = false;
    }
});

// Cancel 2FA
cancel2FABtn.addEventListener('click', function() {
    twoFAModal.style.display = 'none';
    twoFACodeInput.value = '';
    twoFAMessage.textContent = '';
    cachedUsername = '';
    cachedPassword = '';
});

// Press Enter in 2FA code input
twoFACodeInput.addEventListener('keypress', function(event) {
    if (event.key === 'Enter') {
        verify2FABtn.click();
    }
});

// Close modal when clicking outside
window.addEventListener('click', function(event) {
    if (event.target === twoFAModal) {
        twoFAModal.style.display = 'none';
        twoFACodeInput.value = '';
        twoFAMessage.textContent = '';
        cachedUsername = '';
        cachedPassword = '';
    }
});

// Helper functions
async function completeLogin(token) {
    try {
        localStorage.setItem('authToken', token);
        
        // Fetch user data
        const userRes = await fetch(`http://127.0.0.1:8000/users/me`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (userRes.ok) {
            const userData = await userRes.json();
            localStorage.setItem('username', userData.username);
            localStorage.setItem('account_number', userData.account_number);
            window.location.href = '/';
        } else {
            // Token is valid but couldn't fetch user data
            window.location.href = '/';
        }
    } catch (error) {
        console.error('Error completing login:', error);
        window.location.href = '/';
    }
}

function showMessage(text, type) {
    twoFAMessage.textContent = text;
    twoFAMessage.className = `message ${type}`;
}