
        // API Base URL
        const API_BASE = "http://127.0.0.1:8000";
        let adminToken = localStorage.getItem('adminToken');
        
        // Check authentication
        if (!adminToken) {
            window.location.href = '/admin/login';
        }
        
        // Elements
        const adminNameElement = document.getElementById('adminName');
        const logoutBtn = document.getElementById('logoutBtn');
        const navItems = document.querySelectorAll('.nav-item');
        const pages = {
            dashboard: document.getElementById('dashboardPage'),
            users: document.getElementById('usersPage'),
            transactions: document.getElementById('transactionsPage'),
            security: document.getElementById('securityPage'),
            settings: document.getElementById('settingsPage')
        };
        
        // Initialize
        document.addEventListener('DOMContentLoaded', async function() {
            // Set admin name
            adminNameElement.textContent = localStorage.getItem('adminName') || 'Admin';
            
            // Load dashboard data
            await loadDashboardData();
            await loadRecentUsers();
            await loadRecentTransactions();
            
            // Navigation
            navItems.forEach(item => {
                item.addEventListener('click', function(e) {
                    e.preventDefault();
                    
                    // Update active nav
                    navItems.forEach(nav => nav.classList.remove('active'));
                    this.classList.add('active');
                    
                    // Show selected page
                    const pageName = this.getAttribute('data-page');
                    Object.values(pages).forEach(page => page.style.display = 'none');
                    pages[pageName].style.display = 'block';
                    
                    // Load page-specific data
                    if (pageName === 'users') loadAllUsers();
                    if (pageName === 'transactions') loadAllTransactions();
                    if (pageName === 'security') loadSecurityLogs();
                });
            });
            
            // View all links
            document.querySelectorAll('.view-all').forEach(link => {
                link.addEventListener('click', function(e) {
                    e.preventDefault();
                    const page = this.getAttribute('data-page');
                    
                    // Switch to that page
                    navItems.forEach(nav => nav.classList.remove('active'));
                    document.querySelector(`.nav-item[data-page="${page}"]`).classList.add('active');
                    
                    Object.values(pages).forEach(page => page.style.display = 'none');
                    pages[page].style.display = 'block';
                    
                    if (page === 'users') loadAllUsers();
                    if (page === 'transactions') loadAllTransactions();
                });
            });
            
            // Refresh buttons
            document.getElementById('refreshUsers')?.addEventListener('click', loadAllUsers);
            document.getElementById('refreshTransactions')?.addEventListener('click', loadAllTransactions);
            
            // User search
            document.getElementById('userSearch')?.addEventListener('input', function(e) {
                filterUsers(e.target.value);
            });
            
            // Transaction filter
            document.getElementById('transactionFilter')?.addEventListener('change', function(e) {
                loadAllTransactions(e.target.value);
            });
            
            // Settings
            document.getElementById('saveSettings')?.addEventListener('click', saveSettings);
            document.getElementById('clearOldLogs')?.addEventListener('click', clearOldLogs);
            document.getElementById('lockAllSessions')?.addEventListener('click', lockAllSessions);
            document.getElementById('resetSystem')?.addEventListener('click', resetSystem);
            
            // Logout
            logoutBtn.addEventListener('click', function() {
                localStorage.removeItem('adminToken');
                localStorage.removeItem('adminName');
                localStorage.removeItem('adminRole');
                window.location.href = '/admin/login';
            });
            
            // Modal
            document.getElementById('closeModal')?.addEventListener('click', function() {
                document.getElementById('userDetailModal').style.display = 'none';
            });
            
            // Close modal on outside click
            window.addEventListener('click', function(e) {
                if (e.target.classList.contains('modal')) {
                    e.target.style.display = 'none';
                }
            });
        });
        
        // ===== API FUNCTIONS =====
        
        async function makeAdminRequest(endpoint, method = 'GET', body = null) {
            try {
                const options = {
                    method,
                    headers: {
                        'Authorization': `Bearer ${adminToken}`,
                        'Content-Type': 'application/json'
                    }
                };
                
                if (body) {
                    options.body = JSON.stringify(body);
                }
                
                const response = await fetch(`${API_BASE}${endpoint}`, options);
                
                if (response.status === 401) {
                    // Token expired
                    localStorage.removeItem('adminToken');
                    window.location.href = '/admin/login';
                    return null;
                }
                
                return await response.json();
            } catch (error) {
                console.error('Admin API error:', error);
                return null;
            }
        }
        
        async function loadDashboardData() {
            const data = await makeAdminRequest('/admin/dashboard');
            if (data) {
                document.getElementById('totalUsers').textContent = data.total_users || 0;
                document.getElementById('activeSessions').textContent = data.active_sessions || 0;
                document.getElementById('todayTransactions').textContent = data.today_transactions || 0;
                document.getElementById('failedLogins').textContent = data.failed_logins_24h || 0;
                
                // Update trends
                if (data.user_trend) {
                    document.getElementById('userTrend').innerHTML = 
                        `<span>+${data.user_trend} today</span>`;
                }
                
                if (data.session_status) {
                    document.getElementById('sessionStatus').textContent = data.session_status;
                }
                
                if (data.transaction_total) {
                    document.getElementById('transactionTrend').innerHTML = 
                        `<span>$${data.transaction_total.toLocaleString()} total</span>`;
                }
                
                if (data.blocked_attempts) {
                    document.getElementById('securityStatus').innerHTML = 
                        `<span>${data.blocked_attempts} blocked</span>`;
                }
            }
        }
        
        async function loadRecentUsers() {
            const data = await makeAdminRequest('/admin/users/recent?limit=5');
            if (data && data.length > 0) {
                const table = generateUsersTable(data, true);
                document.getElementById('recentUsersTable').innerHTML = table;
                
                // Add click handlers for view buttons
                document.querySelectorAll('.view-user-btn').forEach(btn => {
                    btn.addEventListener('click', function() {
                        const userId = this.getAttribute('data-user-id');
                        showUserModal(userId);
                    });
                });
            } else {
                document.getElementById('recentUsersTable').innerHTML = '<p>No recent users found</p>';
            }
        }
        
        async function loadAllUsers() {
            const data = await makeAdminRequest('/admin/users');
            if (data && data.length > 0) {
                const table = generateUsersTable(data, false);
                document.getElementById('usersTable').innerHTML = table;
                
                // Add click handlers
                document.querySelectorAll('.view-user-btn').forEach(btn => {
                    btn.addEventListener('click', function() {
                        const userId = this.getAttribute('data-user-id');
                        showUserModal(userId);
                    });
                });
                
                document.querySelectorAll('.lock-user-btn').forEach(btn => {
                    btn.addEventListener('click', async function() {
                        const userId = this.getAttribute('data-user-id');
                        const action = this.getAttribute('data-action');
                        await toggleUserLock(userId, action === 'lock');
                    });
                });
                
                document.querySelectorAll('.reset-password-btn').forEach(btn => {
                    btn.addEventListener('click', async function() {
                        const userId = this.getAttribute('data-user-id');
                        await resetUserPassword(userId);
                    });
                });
            } else {
                document.getElementById('usersTable').innerHTML = '<p>No users found</p>';
            }
        }
        
        function generateUsersTable(users, isCompact = false) {
            if (users.length === 0) return '<p>No users found</p>';
            
            let html = `
                <table>
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Username</th>
                            <th>Account #</th>
                            <th>Balance</th>
                            <th>Status</th>
                            ${!isCompact ? '<th>Created</th>' : ''}
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            
            users.forEach(user => {
                const statusClass = user.is_locked ? 'locked' : 'active';
                const statusText = user.is_locked ? 'LOCKED' : 'ACTIVE';
                const created = new Date(user.created_at).toLocaleDateString();
                
                html += `
                    <tr>
                        <td>${user.id}</td>
                        <td><strong>${user.username}</strong></td>
                        <td>${user.account_number || 'N/A'}</td>
                        <td>$${user.balance?.toFixed(2) || '0.00'}</td>
                        <td><span class="status ${statusClass}">${statusText}</span></td>
                        ${!isCompact ? `<td>${created}</td>` : ''}
                        <td class="action-buttons">
                            <button class="btn btn-primary btn-sm view-user-btn" data-user-id="${user.id}">View</button>
                            ${!isCompact ? `
                                <button class="btn ${user.is_locked ? 'btn-warning' : 'btn-danger'} btn-sm lock-user-btn" 
                                        data-user-id="${user.id}" 
                                        data-action="${user.is_locked ? 'unlock' : 'lock'}">
                                    ${user.is_locked ? 'Unlock' : 'Lock'}
                                </button>
                                <button class="btn btn-warning btn-sm reset-password-btn" data-user-id="${user.id}">Reset PW</button>
                            ` : ''}
                        </td>
                    </tr>
                `;
            });
            
            html += '</tbody></table>';
            return html;
        }
        
        async function loadRecentTransactions() {
            const data = await makeAdminRequest('/admin/transactions/recent?limit=5');
            if (data && data.length > 0) {
                const table = generateTransactionsTable(data);
                document.getElementById('recentTransactionsTable').innerHTML = table;
                
                // Add flag/unflag buttons
                document.querySelectorAll('.flag-transaction-btn').forEach(btn => {
                    btn.addEventListener('click', async function() {
                        const txId = this.getAttribute('data-tx-id');
                        const isFlagged = this.getAttribute('data-flagged') === 'true';
                        await flagTransaction(txId, !isFlagged);
                    });
                });
            } else {
                document.getElementById('recentTransactionsTable').innerHTML = '<p>No recent transactions found</p>';
            }
        }
        
        async function loadAllTransactions(filter = 'all') {
            let endpoint = '/admin/transactions';
            if (filter !== 'all') {
                endpoint += `?filter=${filter}`;
            }
            
            const data = await makeAdminRequest(endpoint);
            if (data && data.length > 0) {
                const table = generateTransactionsTable(data);
                document.getElementById('transactionsTable').innerHTML = table;
                
                // Add flag/unflag buttons
                document.querySelectorAll('.flag-transaction-btn').forEach(btn => {
                    btn.addEventListener('click', async function() {
                        const txId = this.getAttribute('data-tx-id');
                        const isFlagged = this.getAttribute('data-flagged') === 'true';
                        await flagTransaction(txId, !isFlagged);
                    });
                });
            } else {
                document.getElementById('transactionsTable').innerHTML = '<p>No transactions found</p>';
            }
        }
        
        function generateTransactionsTable(transactions) {
            if (!transactions || transactions.length === 0) return '<p>No transactions found</p>';
            
            let html = `
                <table>
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>From</th>
                            <th>To</th>
                            <th>Amount</th>
                            <th>Type</th>
                            <th>Status</th>
                            <th>Timestamp</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            
            transactions.forEach(tx => {
                const amountClass = tx.amount >= 0 ? '' : 'text-danger';
                const statusClass = tx.status === 'completed' ? 'active' : 'pending';
                const isFlagged = tx.is_flagged || false;
                
                html += `
                    <tr style="${isFlagged ? 'background: #fff3cd;' : ''}">
                        <td>${tx.id}</td>
                        <td>${tx.from_account || tx.sender_username || 'SYSTEM'}</td>
                        <td>${tx.to_account || tx.recipient_username || 'SYSTEM'}</td>
                        <td class="${amountClass}">$${Math.abs(tx.amount).toFixed(2)}</td>
                        <td>${tx.transaction_type || 'transfer'}</td>
                        <td><span class="status ${statusClass}">${tx.status?.toUpperCase() || 'PENDING'}</span></td>
                        <td>${new Date(tx.timestamp).toLocaleString()}</td>
                        <td>
                            <button class="btn ${isFlagged ? 'btn-warning' : 'btn-primary'} btn-sm flag-transaction-btn" 
                                    data-tx-id="${tx.id}" 
                                    data-flagged="${isFlagged}">
                                ${isFlagged ? 'Unflag' : 'Flag'}
                            </button>
                        </td>
                    </tr>
                `;
            });
            
            html += '</tbody></table>';
            return html;
        }
        
        async function loadSecurityLogs() {
            const data = await makeAdminRequest('/admin/security/logs?limit=50');
            if (data) {
                document.getElementById('securityFailedLogins').textContent = data.length || 0;
                
                // Count locked accounts
                const lockedCount = data.filter(log => log.event_type === 'user_locked').length;
                document.getElementById('lockedAccounts').textContent = lockedCount;
                
                // Count IP blocks
                const ipBlockCount = data.filter(log => log.event_type.includes('ip_block')).length;
                document.getElementById('ipBlocks').textContent = ipBlockCount;
                
                if (data.length > 0) {
                    const table = generateSecurityLogsTable(data);
                    document.getElementById('securityLogsTable').innerHTML = table;
                } else {
                    document.getElementById('securityLogsTable').innerHTML = '<p>No security logs found</p>';
                }
            }
        }
        
        function generateSecurityLogsTable(logs) {
            if (!logs || logs.length === 0) return '<p>No security logs found</p>';
            
            let html = `
                <table>
                    <thead>
                        <tr>
                            <th>Timestamp</th>
                            <th>Event Type</th>
                            <th>User/IP</th>
                            <th>Details</th>
                            <th>Severity</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            
            logs.forEach(log => {
                const severityClass = log.severity === 'high' ? 'locked' : 
                                     log.severity === 'medium' ? 'warning' : 
                                     log.severity === 'low' ? 'info' : 'active';
                
                html += `
                    <tr>
                        <td>${new Date(log.timestamp).toLocaleString()}</td>
                        <td><strong>${log.event_type}</strong></td>
                        <td>${log.username || 'N/A'} (${log.ip_address || 'N/A'})</td>
                        <td>${log.details}</td>
                        <td><span class="status ${severityClass}">${log.severity?.toUpperCase() || 'INFO'}</span></td>
                    </tr>
                `;
            });
            
            html += '</tbody></table>';
            return html;
        }
        
        async function showUserModal(userId) {
            const data = await makeAdminRequest(`/admin/users/${userId}`);
            if (data) {
                document.getElementById('modalTitle').textContent = `User: ${data.username}`;
                
                let html = `
                    <div style="margin-bottom: 20px;">
                        <h4 style="margin-bottom: 10px;">User Information</h4>
                        <p><strong>Username:</strong> ${data.username}</p>
                        <p><strong>Account Number:</strong> ${data.account_number || 'N/A'}</p>
                        <p><strong>Email:</strong> ${data.email || 'Not provided'}</p>
                        <p><strong>Balance:</strong> $${data.balance?.toFixed(2) || '0.00'}</p>
                        <p><strong>Status:</strong> <span class="status ${data.is_locked ? 'locked' : 'active'}">${data.is_locked ? 'LOCKED' : 'ACTIVE'}</span></p>
                        <p><strong>Created:</strong> ${new Date(data.created_at).toLocaleString()}</p>
                        <p><strong>Last Login:</strong> ${data.last_login ? new Date(data.last_login).toLocaleString() : 'Never'}</p>
                    </div>
                    
                    <div style="margin-bottom: 20px;">
                        <h4 style="margin-bottom: 10px;">Security</h4>
                        <p><strong>Failed Login Attempts:</strong> ${data.failed_attempts || 0}</p>
                        <p><strong>2FA Enabled:</strong> ${data.two_factor_enabled ? 'Yes' : 'No'}</p>
                        <p><strong>Last IP:</strong> ${data.last_ip || 'N/A'}</p>
                    </div>
                    
                    <div style="display: flex; gap: 10px; margin-top: 20px;">
                        <button class="btn ${data.is_locked ? 'btn-warning' : 'btn-danger'}" id="modalLockBtn" data-user-id="${data.id}">
                            ${data.is_locked ? 'Unlock Account' : 'Lock Account'}
                        </button>
                        <button class="btn btn-warning" id="modalResetBtn" data-user-id="${data.id}">Reset Password</button>
                    </div>
                `;
                
                document.getElementById('modalContent').innerHTML = html;
                document.getElementById('userDetailModal').style.display = 'flex';
                
                // Add modal button handlers
                document.getElementById('modalLockBtn').addEventListener('click', async function() {
                    const userId = this.getAttribute('data-user-id');
                    const isLocked = data.is_locked;
                    await toggleUserLock(userId, !isLocked);
                    document.getElementById('userDetailModal').style.display = 'none';
                });
                
                document.getElementById('modalResetBtn').addEventListener('click', async function() {
                    const userId = this.getAttribute('data-user-id');
                    await resetUserPassword(userId);
                });
            }
        }
        
        async function toggleUserLock(userId, lock) {
    if (confirm(`Are you sure you want to ${lock ? 'LOCK' : 'UNLOCK'} this account?`)) {
        // Send lock as query parameter, not in body
        const data = await makeAdminRequest(`/admin/users/${userId}/lock?lock=${lock}`, 'POST');
        if (data) {
            alert(data.message || 'User status updated');
            loadAllUsers();
            loadDashboardData();
        }
    }

        }
        
        async function resetUserPassword(userId) {
            if (confirm('Reset this user\'s password? They will need to set a new password on next login.')) {
                const data = await makeAdminRequest(`/admin/users/${userId}/reset-password`, 'POST');
                if (data) {
                    alert(`Password reset. Temporary password: ${data.temp_password || 'Check logs'}`);
                }
            }
        }
        
        async function flagTransaction(txId, flag) {
    if (confirm(`Are you sure you want to ${flag ? 'FLAG' : 'UNFLAG'} this transaction?`)) {
        // Send flag as query parameter in the URL
        const data = await makeAdminRequest(`/admin/transactions/${txId}/flag?flag=${flag}`, 'POST');
        if (data) {
            alert(data.message || 'Transaction flag updated');
            loadAllTransactions(document.getElementById('transactionFilter').value);
        }
    }
}
        
        async function saveSettings() {
            const settings = {
                max_attempts: parseInt(document.getElementById('maxAttempts').value),
                lock_duration: parseInt(document.getElementById('lockDuration').value),
                enable_2fa: document.getElementById('enable2FA').checked
            };
            
            const data = await makeAdminRequest('/admin/settings', 'POST', settings);
            if (data) {
                document.getElementById('settingsMessage').innerHTML = 
                    `<div class="alert alert-success">✓ Settings saved successfully</div>`;
                
                setTimeout(() => {
                    document.getElementById('settingsMessage').innerHTML = '';
                }, 3000);
            }
        }
        
        async function clearOldLogs() {
            if (confirm('Clear all logs older than 30 days? This cannot be undone.')) {
                const data = await makeAdminRequest('/admin/logs/clear', 'POST', { days: 30 });
                if (data) {
                    alert(data.message || 'Logs cleared');
                    loadSecurityLogs();
                }
            }
        }
        
        async function lockAllSessions() {
            if (confirm('Force all users to logout? This will invalidate all active sessions.')) {
                const data = await makeAdminRequest('/admin/sessions/lock-all', 'POST');
                if (data) {
                    alert(data.message || 'All sessions locked');
                }
            }
        }
        
        async function resetSystem() {
            if (confirm('⚠️ WARNING: Reset all test data? This will clear all test transactions and may reset test user balances.')) {
                if (confirm('Are you ABSOLUTELY sure? This action cannot be undone.')) {
                    const data = await makeAdminRequest('/admin/system/reset-test', 'POST');
                    if (data) {
                        alert(data.message || 'Test data reset');
                        location.reload();
                    }
                }
            }
        }
        
        function filterUsers(searchTerm) {
            const rows = document.querySelectorAll('#usersTable tbody tr');
            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                row.style.display = text.includes(searchTerm.toLowerCase()) ? '' : 'none';
            });
        }
        
        // Auto-refresh dashboard every 30 seconds
        setInterval(() => {
            if (pages.dashboard.style.display !== 'none') {
                loadDashboardData();
            }
        }, 30000);
        
        // Check token every 5 minutes
        setInterval(() => {
            if (!localStorage.getItem('adminToken')) {
                window.location.href = '/admin/login';
            }
        }, 300000);
 