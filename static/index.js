        // Global variables
        let currentRecipient = null;
        let inactivityTimer;
        const API_BASE_URL = "http://127.0.0.1:8000"
        // Authentication check
        document.addEventListener('DOMContentLoaded', function() {
            const authenticated = localStorage.getItem('authToken') !== null;
            if(!authenticated){
                window.location.href = 'login';
                return;
            }

            // Initialize the dashboard
            initializeDashboard();
            
            // Set up inactivity timer
            resetInactivityTimer();
            
            // Add event listeners for user activity
            document.addEventListener('mousemove', resetInactivityTimer);
            document.addEventListener('keypress', resetInactivityTimer);
            document.addEventListener('click', resetInactivityTimer);
        });

        // Initialize dashboard
        function initializeDashboard() {
            // Welcome message
            const welcome = document.querySelector('.welcoming');
            const username = localStorage.getItem('username') || 'User';
            welcome.textContent = `Hello, ${username}! Welcome back to your dashboard.`;

            // Load initial data
            getBalance();
            loadTransactionHistory();
            
            // Set up account number lookup
            const accountNumberInput = document.getElementById('accountNumber');
            if (accountNumberInput) {
                accountNumberInput.addEventListener('input', showRecipientName);
            }
        }

        // Modal functions
        function showDepositModal() {
            document.getElementById('depositModal').style.display = 'flex';
            document.getElementById('depositAmount').focus();
        }
        function showAccDetails() {
            const accountNumber = localStorage.getItem('account_number') || 'N/A';
            const username = localStorage.getItem('username') || 'N/A';
            const accountDetailsContent = document.getElementById('accountDetailsContent');
            accountDetailsContent.innerHTML = `
                <strong>Username:</strong> ${username}<br>
                <strong>Account Number:</strong> ${accountNumber}
            `;
            document.getElementById('showAccDetailsModal').style.display = 'flex';
        }

        function showTransferModal() {
            document.getElementById('transferModal').style.display = 'flex';
            document.getElementById('transferAmount').focus();
        }

        function showWithdrawModal() {
            document.getElementById('withdrawModal').style.display = 'flex';
            document.getElementById('withdrawAmount').focus();
        }

        function hideModal(modalId) {
            document.getElementById(modalId).style.display = 'none';
            // Clear input fields
            const amountInput = document.getElementById(modalId.replace('Modal', 'Amount'));
            if (amountInput) amountInput.value = '';
            
            // Clear recipient info for transfer modal
            if (modalId === 'transferModal') {
                document.getElementById('recipientName').textContent = '';
                document.getElementById('accountNumber').value = '';
                currentRecipient = null;
            }
        }

        // Logout function
        function logout() {
            clearTimeout(inactivityTimer);
            localStorage.removeItem('authToken');
            localStorage.removeItem('username');
            window.location.href = 'login';
        }

        // Inactivity timer
        function resetInactivityTimer() {
            clearTimeout(inactivityTimer);
            inactivityTimer = setTimeout(() => {
                if (confirm('Session expired due to inactivity. Would you like to stay logged in?')) {
                    resetInactivityTimer();
                } else {
                    logout();
                }
            }, 15 * 60 * 1000); // 15 minutes
        }

        // Input validation
        function validateAmount(amount) {
            if (!amount || amount <= 0) {
                showMessage('Please enter a valid amount greater than 0', 'error');
                return false;
            }
            
            if (amount > 1000000) { // Reasonable limit
                showMessage('Amount exceeds maximum limit', 'error');
                return false;
            }
            
            // Check for decimal places
            if ((amount.toString().split('.')[1] || '').length > 2) {
                showMessage('Amount can have at most 2 decimal places', 'error');
                return false;
            }
            
            return true;
        }
let is2FAEnabled = false;
let pending2FASecret = null; // Store secret temporarily during setup

async function check2FAStatus() {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`${API_BASE_URL}/users/me`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const user = await response.json();
            is2FAEnabled = user.has_2fa || false;
            update2FAButton(is2FAEnabled);
        }
    } catch (error) {
        console.error('Error checking 2FA status:', error);
    }
}

function update2FAButton(isEnabled) {
    const btn = document.querySelector('.settings') || document.getElementById('twoFABtn');
    if (btn) {
        if (isEnabled) {
            btn.textContent = 'Disable 2FA';
            btn.style.background = '#ef4444'; // Red color
            btn.style.color = 'white';
        } else {
            btn.textContent = 'Enable 2FA';
            btn.style.background = ''; // Reset to default
            btn.style.color = '';
        }
    }
}

async function toggle2FA() {
    if (is2FAEnabled) {
        // Show confirmation modal for disabling 2FA
        showDisable2FAModal();
    } else {
        // Enable 2FA - show QR code modal
        show2FAModal();
    }
}

function show2FAModal() {
    const modal = document.getElementById('twoFAModal');
    if (modal) {
        modal.style.display = 'flex';
        // Clear any previous secret
        pending2FASecret = null;
        generate2FAQRCode();
    }
}

async function generate2FAQRCode() {
    try {
        const token = localStorage.getItem('authToken');
        const qrImg = document.getElementById('qrCode2FA');
        const msgElement = document.getElementById('msg2FA');
        const username = localStorage.getItem('username');
        
        // Clear any previous messages
        if (msgElement) {
            msgElement.textContent = '';
            msgElement.style.color = 'green';
        }
        
        // Show loading state on QR image
        if (qrImg) {
            qrImg.alt = 'Generating QR code...';
            qrImg.style.border = '2px dashed #e5e7eb';
            qrImg.style.padding = '10px';
            qrImg.style.background = '#f8fafc';
            qrImg.style.width = '200px';
            qrImg.style.height = '200px';
            qrImg.style.display = 'block';
            qrImg.style.margin = '15px auto';
        }

        // Get the 2FA secret from backend (doesn't enable it yet)
        const response = await fetch(`${API_BASE_URL}/enable_2fa`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            const secret = data.secret;
            
            if (secret) {
                // Store secret temporarily (don't save to sessionStorage yet)
                pending2FASecret = secret;
                
                // Create the TOTP URI format
                const totpUri = `otpauth://totp/SimpleBanking:${encodeURIComponent(username)}?secret=${secret}&issuer=SimpleBanking`;
                
                // Use QuickChart.io for QR code
                const qrUrl = `https://quickchart.io/qr?text=${encodeURIComponent(totpUri)}&size=200&margin=1`;
                
                // Set the QR code image
                if (qrImg) {
                    qrImg.onload = function() {
                        qrImg.alt = 'Scan this QR code with your authenticator app';
                        qrImg.style.border = 'none';
                        qrImg.style.padding = '0';
                        qrImg.style.background = 'none';
                        
                        // Show success message
                        if (msgElement) {
                            msgElement.textContent = '✓ QR code generated! Scan it and enter the 6-digit code to enable 2FA.';
                        }
                    };
                    
                    qrImg.onerror = function() {
                        qrImg.alt = 'Failed to load QR code. Please use manual entry.';
                        qrImg.style.border = '2px solid #ef4444';
                        if (msgElement) {
                            msgElement.textContent = '❌ Failed to load QR code. Please use manual entry.';
                            msgElement.style.color = '#ef4444';
                        }
                    };
                    
                    qrImg.src = qrUrl;
                }
                
                
            }
        } else {
            const error = await response.json();
            if (qrImg) {
                qrImg.alt = 'Failed to generate QR code';
                qrImg.style.border = '2px solid #ef4444';
            }
            if (msgElement) {
                msgElement.textContent = `❌ ${error.detail || 'Failed to generate QR code'}`;
                msgElement.style.color = '#ef4444';
            }
        }
    } catch (error) {
        console.error('Error generating 2FA QR code:', error);
        const qrImg = document.getElementById('qrCode2FA');
        const msgElement = document.getElementById('msg2FA');
        
        if (qrImg) {
            qrImg.alt = 'Network error. Please try again.';
            qrImg.style.border = '2px solid #ef4444';
        }
        if (msgElement) {
            msgElement.textContent = '❌ Network error. Please check your connection.';
            msgElement.style.color = '#ef4444';
        }
    }
}

async function verify2FA() {
    const otpInput = document.getElementById('otp2FA');
    const otp = otpInput ? otpInput.value : '';
    const msgElement = document.getElementById('msg2FA');
    const button = document.querySelector('#twoFAModal button[onclick="verify2FA()"]');
    
    if (!otp || !/^\d{6}$/.test(otp)) {
        if (msgElement) {
            msgElement.textContent = '❌ Please enter a valid 6-digit code';
            msgElement.style.color = '#ef4444';
        }
        return;
    }
    
    if (!pending2FASecret) {
        if (msgElement) {
            msgElement.textContent = '❌ No 2FA secret found. Please generate a new QR code.';
            msgElement.style.color = '#ef4444';
        }
        return;
    }

    // Show loading state
    if (button) {
        button.disabled = true;
        button.innerHTML = '<div class="loading-spinner"></div> Verifying...';
    }

    try {
        const token = localStorage.getItem('authToken');
        
        // Send secret and OTP to backend to complete setup
        const formData = new FormData();
        formData.append("secret", pending2FASecret);
        formData.append("otp", otp);

        const response = await fetch(`${API_BASE_URL}/setup_2fa`, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        if (response.ok) {
            if (msgElement) {
                msgElement.textContent = '✅ 2FA enabled successfully!';
                msgElement.style.color = '#10b981';
            }
            
            // Clear OTP input
            if (otpInput) otpInput.value = '';
            
            // Update 2FA button state
            is2FAEnabled = true;
            update2FAButton(true);
            
            // Clear temporary secret
            pending2FASecret = null;
            
            // Auto-close modal after 2 seconds
            setTimeout(() => {
                hideModal('twoFAModal');
                showMessage('2FA enabled successfully!', 'success');
            }, 2000);
            
        } else {
            const error = await response.json();
            if (msgElement) {
                msgElement.textContent = `❌ ${error.detail || 'Invalid OTP'}`;
                msgElement.style.color = '#ef4444';
            }
        }
    } catch (err) {
        console.error('Error verifying 2FA:', err);
        if (msgElement) {
            msgElement.textContent = '❌ Network error. Please try again.';
            msgElement.style.color = '#ef4444';
        }
    } finally {
        // Reset button
        if (button) {
            button.disabled = false;
            button.textContent = 'Verify & Enable';
        }
    }
}

function showDisable2FAModal() {
    // Create or show disable confirmation modal
    let modal = document.getElementById('disable2FAModal');
    
    if (!modal) {
        // Create modal element
        modal = document.createElement('div');
        modal.id = 'disable2FAModal';
        modal.className = 'modal';
        
        // Create modal content
        modal.innerHTML = `
            <div class="modal-content">
                <h3>Disable Two-Factor Authentication</h3>
                <p>Enter your 6-digit OTP code from your authenticator app:</p>
                
                <div class="form-group">
                    <input type="text" 
                           id="disableOtpInput" 
                           placeholder="123456" 
                           maxlength="6" 
                           autocomplete="off"
                           autofocus
                           style="
                               width: 100%;
                               padding: 20px;
                               margin-bottom: 15px;
                               background: rgba(255, 255, 255, 0.15);
                               border: 1px solid rgba(255, 255, 255, 0.2);
                               border-radius: 12px;
                               color: white;
                               font-size: 24px;
                               font-weight: 600;
                               text-align: center;
                               letter-spacing: 8px;
                               font-family: 'Poppins', sans-serif;
                               transition: all 0.3s ease;
                           ">
                    <div id="disable2FAMessage" class="message"></div>
                </div>
                
                <div class="modal-buttons">
                    <button id="cancelDisable2FA">Cancel</button>
                    <button id="confirmDisable2FA" style="background: #ef4444; color: white;">
                        Disable 2FA
                    </button>
                </div>
            </div>
        `;
        
        // Add modal to body
        document.body.appendChild(modal);
        
        // Get elements
        const otpInput = document.getElementById('disableOtpInput');
        const cancelBtn = document.getElementById('cancelDisable2FA');
        const confirmBtn = document.getElementById('confirmDisable2FA');
        const messageEl = document.getElementById('disable2FAMessage');
        
        // Event listener for Cancel button
        if (cancelBtn) {
            cancelBtn.addEventListener('click', function() {
                modal.style.display = 'none';
                if (otpInput) otpInput.value = '';
                if (messageEl) messageEl.textContent = '';
            });
        }
        
        // Event listener for Disable button
        if (confirmBtn) {
            confirmBtn.addEventListener('click', function() {
                confirmDisable2FA();
            });
        }
        
        // Event listener for Enter key
        if (otpInput) {
            otpInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    confirmDisable2FA();
                }
            });
            
            // Only allow numbers
            otpInput.addEventListener('input', function(e) {
                // Remove any non-digit characters
                this.value = this.value.replace(/[^0-9]/g, '');
                
                // Limit to 6 digits
                if (this.value.length > 6) {
                    this.value = this.value.slice(0, 6);
                }
            });
            
            // Add focus styling
            otpInput.addEventListener('focus', function() {
                this.style.background = 'rgba(255, 255, 255, 0.25)';
                this.style.borderColor = 'rgba(255, 255, 255, 0.4)';
                this.style.boxShadow = '0 0 0 3px rgba(255, 255, 255, 0.1)';
                this.style.transform = 'translateY(-2px)';
            });
            
            otpInput.addEventListener('blur', function() {
                this.style.background = 'rgba(255, 255, 255, 0.15)';
                this.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                this.style.boxShadow = 'none';
                this.style.transform = 'translateY(0)';
            });
        }
        
        // Close modal when clicking outside
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                modal.style.display = 'none';
                if (otpInput) otpInput.value = '';
                if (messageEl) messageEl.textContent = '';
            }
        });
    }
    
    // Reset modal state
    const otpInput = document.getElementById('disableOtpInput');
    const messageEl = document.getElementById('disable2FAMessage');
    
    if (otpInput) {
        otpInput.value = '';
        otpInput.style.color = 'white';
        otpInput.style.letterSpacing = '8px';
        otpInput.style.fontSize = '24px';
        otpInput.style.fontWeight = '600';
    }
    
    if (messageEl) {
        messageEl.textContent = '';
        messageEl.className = 'message';
        messageEl.style.color = '';
    }
    
    // Show modal
    modal.style.display = 'flex';
    
    // Focus on input after a short delay
    setTimeout(() => {
        if (otpInput) {
            otpInput.focus();
            otpInput.select();
        }
    }, 100);
}

async function confirmDisable2FA() {
    const otpInput = document.getElementById('disableOtpInput');
    const otp = otpInput?.value;
    const messageElement = document.getElementById('disable2FAMessage');
    const button = document.querySelector('#disable2FAModal button[onclick="confirmDisable2FA()"]');
    
    if (!otp || !/^\d{6}$/.test(otp)) {
        if (messageElement) {
            messageElement.textContent = '❌ Please enter a valid 6-digit code';
            messageElement.style.color = '#ef4444';
        }
        return;
    }
    
    // Show loading state
    if (button) {
        button.disabled = true;
        button.innerHTML = '<div class="loading-spinner"></div> Verifying...';
    }
    
    try {
        const token = localStorage.getItem('authToken');
        
        // Send OTP to backend to disable 2FA
        const formData = new FormData();
        formData.append("otp", otp);

        const response = await fetch(`${API_BASE_URL}/disable_2fa`, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        if (response.ok) {
            // Success
            if (messageElement) {
                messageElement.textContent = '✅ 2FA disabled successfully!';
                messageElement.style.color = '#10b981';
            }
            
            // Update UI
            is2FAEnabled = false;
            update2FAButton(false);
            
            // Close modal after delay
            setTimeout(() => {
                hideModal('disable2FAModal');
                showMessage('2FA has been disabled', 'success');
            }, 1500);
            
        } else {
            const error = await response.json();
            if (messageElement) {
                messageElement.textContent = `❌ ${error.detail || 'Invalid OTP code'}`;
                messageElement.style.color = '#ef4444';
            }
        }
    } catch (error) {
        console.error('Error disabling 2FA:', error);
        if (messageElement) {
            messageElement.textContent = '❌ Network error. Please try again.';
            messageElement.style.color = '#ef4444';
        }
    } finally {
        // Reset button
        if (button) {
            button.disabled = false;
            button.textContent = 'Disable 2FA';
        }
    }
}
        // API call handler with error management
        async function handleApiCall(apiCall) {
            try {
                const response = await apiCall();
                if (response && response.status === 401) {
                    // Token expired
                    showMessage('Session expired. Please log in again.', 'error');
                    setTimeout(() => {
                        logout();
                    }, 2000);
                    return null;
                }
                return response;
            } catch (error) {
                console.error('API call failed:', error);
                showMessage('Network error. Please check your connection.', 'error');
                return null;
            }
        }

        // Loading state management
        function setLoading(button, isLoading) {
            if (!button) return;
            
            if (isLoading) {
                button.disabled = true;
                button.dataset.originalText = button.textContent;
                button.innerHTML = '<div class="loading-spinner"></div> Processing...';
            } else {
                button.disabled = false;
                button.textContent = button.dataset.originalText || 'Button';
            }
        }

        // Banking functions
        async function getBalance() {
            const button = document.querySelector('.view_balance');
            setLoading(button, true);
            
            const response = await handleApiCall(async () => {
                return await fetch('http://127.0.0.1:8000/balance', {
                    headers: {
                        "Authorization": "Bearer " + localStorage.getItem('authToken')
                    }
                });
            });
            
            setLoading(button, false);
            
            if (response && response.ok) {
                const data = await response.json();
                document.querySelector('.balance-amount').textContent = '$' + data.balance;
                showMessage('Balance updated successfully!', 'success');
            } else if (response) {
                showMessage('Failed to retrieve balance. Please try again.', 'error');
            }
        }

        async function processDeposit() {
            const amount = parseFloat(document.getElementById('depositAmount').value);
            const currentToken = localStorage.getItem('authToken');
            const button = document.querySelector('#depositModal button[onclick="processDeposit()"]');
            
            if (!validateAmount(amount)) return;
            
            setLoading(button, true);
            
            const response = await handleApiCall(async () => {
                const form = new FormData();
                form.append('amount', amount);
                
                return await fetch('http://127.0.0.1:8000/deposit', {
                    method: 'POST',
                    headers: {
                        'Authorization': 'Bearer ' + currentToken
                    },
                    body: form
                });
            });
            
            setLoading(button, false);
            
            if (response && response.ok) {
                const data = await response.json();
                hideModal('depositModal');
                showMessage(`Deposit successful! New balance: $${data.new_balance}`, 'success');
                // Refresh balance display and transactions
                getBalance();
                loadTransactionHistory();
            } else if (response) {
                showMessage('Deposit failed. Please try again.', 'error');
            }
        }

        async function processWithdraw() {
            const amount = parseFloat(document.getElementById('withdrawAmount').value);
            const currentToken = localStorage.getItem('authToken');
            const button = document.querySelector('#withdrawModal button[onclick="processWithdraw()"]');
            
            if (!validateAmount(amount)) return;
            
            setLoading(button, true);
            
            const response = await handleApiCall(async () => {
                const form = new FormData();
                form.append('amount', amount);
                
                return await fetch('http://127.0.0.1:8000/withdraw', {
                    method: 'POST',
                    headers: {
                        "Authorization": 'Bearer ' + currentToken
                    },
                    body: form
                });
            });
            
            setLoading(button, false);
            
            if (response && response.ok) {
                const data = await response.json();
                hideModal('withdrawModal');
                showMessage(`Withdrawal successful! New balance: $${data.new_balance}`, 'success');
                // Refresh balance display and transactions
                getBalance();
                loadTransactionHistory();
            } else if (response) {
                showMessage('Withdrawal failed. Please try again.', 'error');
            }
        }

        // Transfer functions
        async function showRecipientName() {
    const accNum = document.getElementById('accountNumber').value.trim();
    const display = document.getElementById('recipientName');
    currentRecipient = null;

    if (!accNum) {
        display.textContent = '';
        return;
    }

    // Normalize account number (remove dashes)
    const normalizedAccNum = accNum.replace(/-/g, '').toUpperCase();
    
    if (normalizedAccNum.length < 5) {
        display.textContent = 'Account number too short';
        return;
    }

    // Show loading
    display.textContent = 'Searching...';
    display.style.color = 'white';

    try {
        // Use the dedicated user lookup endpoint
        const response = await handleApiCall(async () => {
            return await fetch(`http://127.0.0.1:8000/users/${normalizedAccNum}`, {
                headers: {
                    "Authorization": "Bearer " + localStorage.getItem('authToken')
                }
            });
        });

        if (response && response.ok) {
            const user = await response.json();
            console.log('Found user:', user);
            
            display.textContent = `Recipient: ${user.username}`;
            display.style.color = '#4ade80';
            currentRecipient = user;
            
        } else if (response && response.status === 404) {
            display.textContent = 'Recipient not found';
            display.style.color = '#f87171';
            currentRecipient = null;
        } else {
            display.textContent = 'Error searching for user';
            display.style.color = '#f87171';
        }
    } catch (err) {
        console.error('Error in showRecipientName:', err);
        display.textContent = 'Search failed';
        display.style.color = '#f87171';
    }
}

        async function processTransfer() {
            const amount = parseFloat(document.getElementById('transferAmount').value);
            const accNum = document.getElementById('accountNumber').value.trim();
            const button = document.querySelector('#transferModal button[onclick="processTransfer()"]');
            const currentuser = localStorage.getItem('account_number');
            if (!currentRecipient) {
                showMessage('Please enter a valid recipient account number', 'error');
                return;
            }
            if (accNum === currentuser) {
                showMessage('You cannot transfer funds to your own account', 'error');
                return;
            }

            
            // Show confirmation modal
            const modal = document.getElementById('confirmTransferModal');
            const message = document.getElementById('confirmMessage');
            message.textContent = `Are you sure you want to transfer $${amount.toFixed(2)} to ${currentRecipient.username}?`;
            
            modal.dataset.amount = amount;
            modal.dataset.accountNumber = accNum;
            
            hideModal('transferModal');
            modal.style.display = 'flex';
        }

        async function confirmTransfer() {
            const modal = document.getElementById('confirmTransferModal');
            const amount = modal.dataset.amount;
            const accountNumber = modal.dataset.accountNumber;
            const button = document.querySelector('#confirmTransferModal button[onclick="confirmTransfer()"]');

            const currentToken = localStorage.getItem('authToken');
            
            setLoading(button, true);
            
            try {
                const response = await handleApiCall(async () => {
                    const form = new FormData();
                    form.append('amount', amount);
                    form.append('to_account_number', accountNumber);

                    return await fetch('http://127.0.0.1:8000/transfer', {
                        method: 'POST',
                        headers: { "Authorization": 'Bearer ' + currentToken },
                        body: form
                    });
                });

                setLoading(button, false);
                
                if (response && response.ok) {
                    const data = await response.json();
                    hideModal('confirmTransferModal');
                    showMessage(`Transfer successful! New balance: $${data.new_balance}`, 'success');
                    // Refresh balance display and transactions
                    getBalance();
                    loadTransactionHistory();
                } else if (response) {
                    const err = await response.json();
                    showMessage(err.detail || 'Transfer failed. Please try again.', 'error');
                }
            } catch (error) {
                setLoading(button, false);
                console.error('Error during transfer:', error);
                showMessage('An error occurred. Please try again later.', 'error');
            }
        }

        // Transaction history
        // Transaction history
async function loadTransactionHistory() {
    try {
        const response = await handleApiCall(async () => {
            return await fetch('http://127.0.0.1:8000/transactions', {
                headers: {
                    "Authorization": "Bearer " + localStorage.getItem('authToken')
                }
            });
        });
        
        if (response && response.ok) {
            const data = await response.json();
            console.log('Transactions data:', data); // Debug log
            displayTransactions(data.transactions || []);
        } else {
            console.error('Failed to load transactions');
            displayTransactions([]);
        }
    } catch (error) {
        console.error('Error loading transactions:', error);
        displayTransactions([]);
    }
}

/*function displayTransactions(transactions) {
    const container = document.getElementById('transactions-list');
    if (!container) return;
    
    // Ensure transactions is an array
    if (!Array.isArray(transactions)) {
        console.error('Transactions is not an array:', transactions);
        transactions = [];
    }
    
    if (transactions.length === 0) {
        container.innerHTML = '<div class="transaction-item">No recent transactions</div>';
        return;
    }
    
    // Sort transactions by date (newest first)
    const sortedTransactions = transactions.sort((a, b) => {
        const dateA = new Date(a.timestamp || a.created_at || 0);
        const dateB = new Date(b.timestamp || b.created_at || 0);
        return dateB - dateA;
    });
    
    // Take only the last 5 transactions
    const recentTransactions = sortedTransactions.slice(0, 5);
    
    container.innerHTML = recentTransactions.map(transaction => {
        const amount = transaction.amount || 0;
        const description = transaction.description || 'Transaction';
        const date = transaction.timestamp || transaction.created_at || new Date().toISOString();
        const isPositive = amount >= 0;
        
        return `
            <div class="transaction-item">
                <div class="transaction-details">
                    <div class="transaction-description">${description}</div>
                    <div class="transaction-date">${formatDate(date)}</div>
                </div>
                <div class="transaction-amount ${isPositive ? 'positive' : 'negative'}">
                    ${isPositive ? '+' : '-'}$${Math.abs(amount).toFixed(2)}
                </div>
            </div>
        `;
    }).join('');
}*/

function formatDate(dateString) {
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    } catch (e) {
        return 'Invalid date';
    }
}
        function displayTransactions(transactions) {
            const container = document.getElementById('transactions-list');
            if (!container) return;
            
            if (!transactions || transactions.length === 0) {
                container.innerHTML = '<div class="transaction-item">No recent transactions</div>';
                return;
            }
            
            // Sort transactions by date (newest first) and take the last 5
            const recentTransactions = transactions
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .slice(0, 5);
            
            container.innerHTML = recentTransactions.map(transaction => `
                <div class="transaction-item">
                    <div class="transaction-details">
                        <div class="transaction-description">${transaction.description || 'Transaction'}</div>
                        <div class="transaction-date">${formatDate(transaction.date)}</div>
                    </div>
                    <div class="transaction-amount ${transaction.amount >= 0 ? 'positive' : 'negative'}">
                        ${transaction.amount >= 0 ? '+' : '-'}$${Math.abs(transaction.amount).toFixed(2)}
                    </div>
                </div>
            `).join('');
        }

        function formatDate(dateString) {
            const date = new Date(dateString);
            return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        }

        // Utility function to show messages
        function showMessage(message, type) {
            // Remove existing toasts
            const existingToasts = document.querySelectorAll('.toast-message');
            existingToasts.forEach(toast => toast.remove());
            
            // Create toast notification
            const toast = document.createElement('div');
            toast.textContent = message;
            toast.className = 'toast-message';
            toast.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 15px 20px;
                border-radius: 10px;
                color: white;
                font-weight: 500;
                z-index: 10000;
                animation: fadeIn 0.3s ease-out;
                background: ${type === 'success' ? 'rgba(74, 222, 128, 0.9)' : 'rgba(248, 113, 113, 0.9)'};
                backdrop-filter: blur(10px);
                max-width: 300px;
                word-wrap: break-word;
            `;
            
            document.body.appendChild(toast);
            
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.style.animation = 'fadeIn 0.3s ease-out reverse';
                    setTimeout(() => toast.remove(), 300);
                }
            }, 4000);
        }
   