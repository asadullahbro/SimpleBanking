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
            // Check 2FA status
            check2FAStatus();
            // Set up inactivity timer
            resetInactivityTimer();
            
            // Add event listeners for user activity
            document.addEventListener('mousemove', resetInactivityTimer);
            document.addEventListener('keypress', resetInactivityTimer);
            document.addEventListener('click', resetInactivityTimer);
        });
        document.addEventListener('DOMContentLoaded', function() {
    // Add Enter key support for password form
    const passwordInputs = ['currentPassword', 'newPassword', 'confirmPassword'];
    passwordInputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    changePassword();
                }
            });
        }
    });
    
    // Initialize 2FA status on load
    initialize2FAStatus();
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
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
    
    // Special handling for settings modal
    if (modalId === 'settingsModal') {
        hidePasswordForm(); // Also hide the password form
    }
    
    // Clear input fields for specific modals
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
let is2FAEnabled =  false;
let pending2FASecret = null; // Store secret temporarily during setup

async function check2FAStatus() {
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`${API_BASE_URL}/2fa/status`, {
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
        // Default to false if error
        is2FAEnabled = false;
        update2FAButton(false);
    }
}
function showSettingsModal() {
    const modal = document.getElementById('settingsModal');
    modal.style.display = 'flex';
    check2FAStatus(); // Update 2FA button status
}
function hidePasswordForm() {
    const form = document.getElementById('passwordForm');
    if (form) {
        form.style.display = 'none';
        // Clear password fields
        document.getElementById('currentPassword').value = '';
        document.getElementById('newPassword').value = '';
        document.getElementById('confirmPassword').value = '';
        document.getElementById('passwordMsg').textContent = '';
    }
}

function showPasswordForm() {
    const form = document.getElementById('passwordForm');
    if (form) {
        form.style.display = 'block';
        document.getElementById('currentPassword').focus();
    }
}

// Password update
// Password update function (you already have this, but ensure it works with new form)
async function changePassword() {
    const current = document.getElementById('currentPassword').value;
    const newPass = document.getElementById('newPassword').value;
    const confirm = document.getElementById('confirmPassword').value;
    const msg = document.getElementById('passwordMsg');

    msg.textContent = '';
    msg.style.color = '';

    if (!current || !newPass || !confirm) {
        msg.textContent = 'All fields are required';
        msg.style.color = '#f87171';
        return;
    }

    if (newPass !== confirm) {
        msg.textContent = 'New passwords do not match';
        msg.style.color = '#f87171';
        return;
    }

    // Optional: Add password strength validation
    if (newPass.length < 8) {
        msg.textContent = 'Password must be at least 8 characters';
        msg.style.color = '#f87171';
        return;
    }

    try {
        const token = localStorage.getItem('authToken');
        const formData = new FormData();
        formData.append('current_password', current);
        formData.append('new_password', newPass);

        const response = await fetch(`${API_BASE_URL}/change_password`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });

        const data = await response.json();
        if (response.ok) {
            msg.textContent = 'Password updated successfully!';
            msg.style.color = '#4ade80';
            // Clear form after successful update
            setTimeout(() => {
                hidePasswordForm();
            }, 2000);
        } else {
            msg.textContent = data.detail || 'Failed to update password';
            msg.style.color = '#f87171';
        }
    } catch (err) {
        console.error('Password change error:', err);
        msg.textContent = 'Network error. Please try again.';
        msg.style.color = '#f87171';
    }
}
async function initialize2FAStatus() {
    await check2FAStatus();
}
function update2FAButton(isEnabled) {
    const toggleContainer = document.getElementById('twoFAToggle');
    const statusText = document.getElementById('twoFAStatusText');
    
    if (toggleContainer && statusText) {
        if (isEnabled) {
            toggleContainer.classList.add('active');
            statusText.textContent = 'On';
            statusText.style.color = '#4ade80';
        } else {
            toggleContainer.classList.remove('active');
            statusText.textContent = 'Off';
            statusText.style.color = '#f87171';
        }
    }
}
async function toggle2FA() {
    if (is2FAEnabled) {
        showDisable2FAModal();
    } else {
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
// Transaction History Functions
let allTransactions = [];
let currentPage = 1;
const transactionsPerPage = 10;

function showTransactionHistory() {
    document.getElementById('transactionHistoryModal').style.display = 'flex';
    loadFullTransactionHistory();
}

async function loadFullTransactionHistory() {
    try {
        const container = document.getElementById('fullTransactionsList');
        container.innerHTML = '<div class="loading-history">Loading transactions...</div>';
        
        const response = await fetch(`${API_BASE_URL}/transactions`, {
            headers: {
                "Authorization": "Bearer " + localStorage.getItem('authToken')
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            allTransactions = data.transactions || [];
            
            // Sort by date (newest first)
            allTransactions.sort((a, b) => new Date(b.timestamp || b.date || b.created_at) - new Date(a.timestamp || a.date || a.created_at));
            
            displayFullTransactionHistory();
            updateTransactionStats();
        } else {
            container.innerHTML = '<div class="no-transactions">Failed to load transactions</div>';
        }
    } catch (error) {
        console.error('Error loading transaction history:', error);
        document.getElementById('fullTransactionsList').innerHTML = '<div class="no-transactions">Error loading transactions</div>';
    }
}

function displayFullTransactionHistory() {
    const container = document.getElementById('fullTransactionsList');
    const filteredTransactions = filterTransactionList(allTransactions);
    
    if (!filteredTransactions || filteredTransactions.length === 0) {
        container.innerHTML = '<div class="no-transactions">No transactions found</div>';
        return;
    }
    
    // Calculate pagination
    const totalPages = Math.ceil(filteredTransactions.length / transactionsPerPage);
    const startIndex = (currentPage - 1) * transactionsPerPage;
    const endIndex = startIndex + transactionsPerPage;
    const pageTransactions = filteredTransactions.slice(startIndex, endIndex);
    
    // Display transactions
    container.innerHTML = pageTransactions.map(transaction => {
        const type = getTransactionType(transaction);
        const displayAmount = getTransactionAmountDisplay(transaction);
        const description = transaction.description || 
                           (type === 'transfer-out' ? `Transfer to ${transaction.to_account_number || 'user'}` :
                            type === 'transfer-in' ? `Transfer from ${transaction.from_account_number || 'user'}` :
                            'Transaction');
        const date = transaction.timestamp || transaction.date || transaction.created_at;
        const isPositive = displayAmount >= 0;
        
        return `
            <div class="transaction-row">
                <div class="transaction-info">
                    <div class="transaction-type ${type}">
                        ${type === 'transfer-out' ? 'Transfer Sent' :
                          type === 'transfer-in' ? 'Transfer Received' :
                          type.charAt(0).toUpperCase() + type.slice(1)}
                    </div>
                    <div class="transaction-desc">${description}</div>
                    <div class="transaction-date">${formatDate(date)}</div>
                </div>
                <div class="transaction-amount ${isPositive ? 'amount-positive' : 'amount-negative'}">
                    ${isPositive ? '+' : '-'}$${Math.abs(displayAmount).toFixed(2)}
                </div>
            </div>
        `;
    }).join('');
    
    // Update pagination
    updatePaginationControls(totalPages);
}

function getTransactionType(transaction) {
    const currentUserAcc = localStorage.getItem('account_number');
    let type = transaction.type ? transaction.type.toLowerCase() : '';

    // Prioritize detecting transfer direction
    if (transaction.to_account_number && transaction.from_account_number) {
        // FIX: Convert transaction accounts to String() to ensure '===' works
        // even if the API returns numbers.
        const fromAcc = String(transaction.from_account_number).replace(/-/g, '').trim();
        const toAcc = String(transaction.to_account_number).replace(/-/g, '').trim();

        if (fromAcc === currentUserAcc) {
            return 'transfer-out';
        } else if (toAcc === currentUserAcc) {
            return 'transfer-in';
        }
    }

    if (type) return type;

    // Fallbacks
    const amount = parseFloat(transaction.amount) || 0;
    const desc = (transaction.description || '').toLowerCase();
    
    if (desc.includes('deposit') || amount > 0) {
        return 'deposit';
    } else if (desc.includes('withdraw') || desc.includes('withdrawal') || amount < 0) {
        return 'withdraw';
    }
    
    return amount >= 0 ? 'deposit' : 'withdraw';
}
function getTransactionAmountDisplay(transaction) {
    const amount = parseFloat(transaction.amount) || 0;
    const type = getTransactionType(transaction);
    
    // Determine if amount should be positive or negative
    switch(type) {
        case 'deposit':
        case 'transfer-in':
            return Math.abs(amount); // Positive for incoming money
        case 'withdraw':
        case 'transfer-out':
            return -Math.abs(amount); // Negative for outgoing money
        default:
            return amount;
    }
}

function filterTransactionList(transactions) {
    const filter = document.getElementById('historyFilter').value;
    const period = document.getElementById('historyPeriod').value;
    const search = document.getElementById('historySearch').value.toLowerCase();
    
    let filtered = transactions;
    
    // Filter by type
    if (filter !== 'all') {
        filtered = filtered.filter(t => getTransactionType(t) === filter);
    }
    
    // Filter by period
    if (period !== 'all') {
        const daysAgo = parseInt(period);
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysAgo);
        
        filtered = filtered.filter(t => {
            const transactionDate = new Date(t.timestamp || t.date || t.created_at);
            return transactionDate >= cutoffDate;
        });
    }
    
    // Filter by search
    if (search) {
        filtered = filtered.filter(t => {
            const desc = t.description || '';
            const amount = t.amount ? t.amount.toString() : '';
            return desc.toLowerCase().includes(search) || 
                   amount.includes(search);
        });
    }
    
    return filtered;
}

function filterTransactions() {
    currentPage = 1; // Reset to first page when filtering
    displayFullTransactionHistory();
    updateTransactionStats();
}

function updateTransactionStats() {
    const filteredTransactions = filterTransactionList(allTransactions);
    
    let totalDeposits = 0;
    let totalWithdrawals = 0;
    let totalTransfersOut = 0;
    let totalTransfersIn = 0;
    
    filteredTransactions.forEach(t => {
        const type = getTransactionType(t);
        const amount = Math.abs(parseFloat(t.amount) || 0);
        
        switch(type) {
            case 'deposit':
                totalDeposits += amount;
                break;
            case 'withdraw':
                totalWithdrawals += amount;
                break;
            case 'transfer-out':
                totalTransfersOut += amount;
                break;
            case 'transfer-in':
                totalTransfersIn += amount;
                break;
        }
    });
    
    const totalTransfers = totalTransfersOut + totalTransfersIn;
    const netChange = totalDeposits + totalTransfersIn - totalWithdrawals - totalTransfersOut;
    
    document.getElementById('totalDeposits').textContent = `$${totalDeposits.toFixed(2)}`;
    document.getElementById('totalWithdrawals').textContent = `$${totalWithdrawals.toFixed(2)}`;
    document.getElementById('totalTransfers').textContent = `$${totalTransfers.toFixed(2)}`;
    document.getElementById('netChange').textContent = `${netChange >= 0 ? '+' : ''}$${netChange.toFixed(2)}`;
    document.getElementById('netChange').style.color = netChange >= 0 ? '#4ade80' : '#f87171';
}

function updatePaginationControls(totalPages) {
    const container = document.getElementById('historyPagination');
    
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }
    
    let paginationHTML = `
        <button class="page-btn" onclick="changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>
            ← Previous
        </button>
    `;
    
    // Show page numbers
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
            paginationHTML += `
                <button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="changePage(${i})">
                    ${i}
                </button>
            `;
        } else if (i === currentPage - 3 || i === currentPage + 3) {
            paginationHTML += `<span class="page-dots">...</span>`;
        }
    }
    
    paginationHTML += `
        <button class="page-btn" onclick="changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>
            Next →
        </button>
    `;
    
    container.innerHTML = paginationHTML;
}

function changePage(page) {
    const filteredTransactions = filterTransactionList(allTransactions);
    const totalPages = Math.ceil(filteredTransactions.length / transactionsPerPage);
    
    if (page >= 1 && page <= totalPages) {
        currentPage = page;
        displayFullTransactionHistory();
    }
}

function exportTransactions() {
    const filteredTransactions = filterTransactionList(allTransactions);
    
    if (filteredTransactions.length === 0) {
        showMessage('No transactions to export', 'error');
        return;
    }
    
    // Convert to CSV
    const csv = convertToCSV(filteredTransactions);
    
    // Create download link
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    showMessage('Transactions exported successfully!', 'success');
}

function convertToCSV(transactions) {
    const headers = ['Date', 'Type', 'Description', 'Amount', 'Balance'];
    
    const rows = transactions.map(t => {
        const date = new Date(t.timestamp || t.date || t.created_at).toLocaleDateString();
        const type = getTransactionType(t).toUpperCase();
        const description = t.description || '';
        const amount = parseFloat(t.amount) || 0;
        const balance = t.balance_after || t.new_balance || '';
        
        return [
            `"${date}"`,
            `"${type}"`,
            `"${description.replace(/"/g, '""')}"`,
            amount.toFixed(2),
            balance ? balance.toFixed(2) : ''
        ].join(',');
    });
    
    return [headers.join(','), ...rows].join('\n');
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


function formatDate(dateString) {
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    } catch (e) {
        return 'Invalid date';
    }
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
   