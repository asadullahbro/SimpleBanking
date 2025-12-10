
        const adminLoginForm = document.getElementById('adminLoginForm');
        const adminLoginBtn = document.getElementById('adminLoginBtn');
        const adminLoginError = document.getElementById('adminLoginError');
        
        adminLoginForm.addEventListener('submit', async function(event) {
            event.preventDefault();
            
            const username = document.getElementById('adminUsername').value;
            const password = document.getElementById('adminPassword').value;
            const otp = document.getElementById('admin2FA').value;
            
            try {
                // Show loading
                adminLoginBtn.classList.add('loading');
                adminLoginBtn.disabled = true;
                adminLoginError.style.display = 'none';
                
                const response = await fetch("/admin/login", {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        username: username,
                        password: password,
                        otp: otp || null
                    })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    // Store admin token separately
                    localStorage.setItem('adminToken', data.access_token);
                    localStorage.setItem('adminName', data.username);
                    localStorage.setItem('adminRole', data.role);
                    
                    // Clear regular user tokens
                    localStorage.removeItem('authToken');
                    localStorage.removeItem('username');
                    
                    // Redirect to admin dashboard
                    window.location.href = '/admin-panel';
                } else {
                    showAdminError(data.detail || 'Access denied. Invalid credentials.');
                }
            } catch (error) {
                console.error('Admin login error:', error);
                showAdminError('Connection error. Please try again.');
            } finally {
                adminLoginBtn.classList.remove('loading');
                adminLoginBtn.disabled = false;
            }
        });
        
        function showAdminError(message) {
            adminLoginError.textContent = message;
            adminLoginError.style.display = 'block';
        }
