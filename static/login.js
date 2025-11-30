
        document.querySelector('form').addEventListener('submit', async function(event) {
            event.preventDefault();
            
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            
            try {
                const res = await fetch("http://127.0.0.1:8000/token", {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: new URLSearchParams({
                        'username': username,
                        'password': password,
                    })
                })
                if (res.ok) {
                    const data = await res.json();
                    localStorage.setItem('access_token', data.access_token);
                    const userRes = await fetch(`http://127.0.0.1:8000/users/me`, {
                        headers: {
                            'Authorization': `Bearer ${data.access_token}`
                        }
                    });
                const userData = await userRes.json();
                    localStorage.setItem('username', userData.username);
                    localStorage.setItem('account_number', userData.account_number);
                    window.location.href = '/';
                } else {
                    alert('Login failed. Please check your username and password.');
                }
            } catch (error) {
                console.error('Error during login:', error);
                alert('An error occurred. Please try again later.');
                return;
            }
        });
