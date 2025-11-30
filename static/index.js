        // Global variables
        let currentRecipient = null;
        let inactivityTimer;
        
        // Authentication check
        document.addEventListener('DOMContentLoaded', function() {
            const authenticated = localStorage.getItem('access_token') !== null;
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
            localStorage.removeItem('access_token');
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
                        "Authorization": "Bearer " + localStorage.getItem('access_token')
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
            const currentToken = localStorage.getItem('access_token');
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
            const currentToken = localStorage.getItem('access_token');
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
                    "Authorization": "Bearer " + localStorage.getItem('access_token')
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

            const currentToken = localStorage.getItem('access_token');
            
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
                    "Authorization": "Bearer " + localStorage.getItem('access_token')
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
   