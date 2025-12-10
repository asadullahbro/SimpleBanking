# SimpleBanking

A modern, secure banking web app built with **FastAPI** + **Vanilla JavaScript**, wrapped in smooth glassmorphism goodness and backed by real security features. Think mini bank in your browser. Yes, it slaps.

---

## 🚀 Tech Stack

![SimpleBanking](https://img.shields.io/badge/SimpleBanking-Finance-blue?style=for-the-badge)
![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)
![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Security](https://img.shields.io/badge/Security-Enabled-green?style=for-the-badge)

---

## ✨ Features

### 🔐 User Features
- JWT Login and Signup
- Strong password rules
- Optional 2FA (TOTP)
- Check balance
- Deposit / Withdraw / Transfer
- Transaction history
- Change password

---

### ⚙️ Admin Features
- Dashboard with live stats
- Manage users
- Monitor transactions
- Security logs & config
- Admin account management

---

### 🎨 UI Features
- Glassmorphism + gradients
- Responsive
- Smooth modals
- Live updates

---

## 🧩 Project Structure
```
simplebanking/
├── app/
│   ├── main.py
|   ├── requirements.txt
│   ├── simple_banking.db
│   ├── static/
│   │   ├── login.css
│   │   ├── login.js
│   │   ├── signup.js
|   |   ├── signup.css
│   │   ├── index.css
│   │   ├── index.js
│   │   ├── admin-panel.css
│   │   ├── admin-panel.js
│   │   ├── admin-login.css
│   │   └── admin-login.js
│   └── templates/
│       ├── index.html
│       ├── login.html
│       ├── signup.html
│       ├── admin-login.html
│       └── admin-panel.html
├── README.md
└── .env.example
```
### 🔒 Security Features
- **Password Hashing:** bcrypt for secure password storage

- **JWT Tokens:** Secure authentication with expiration (30 minutes)

- **Account Lockout:** Automatic lockout after multiple failed attempts

- **2FA Support:** Optional Time-based One-Time Passwords via authenticator apps

- **SQL Injection Prevention:** Parameterized queries throughout

- **CORS Protection:** Configured for security

- **Input Validation:** Comprehensive data validation on all endpoints

- **Session Management:** Secure token-based sessions

- **Password Complexity:** Enforced strong passwords

- **Admin-only Endpoints:** Protected routes for administrative functions

### 🛠️ API Endpoints
**User Endpoints**

`GET /` - Home page

`GET /login` - Login page

`GET /signup` - Signup page

`POST /signup` - Register new user

`POST /token` - User login

`POST /token_2fa` - 2FA verification

`GET /balance` - Get account balance

`POST /deposit` - Deposit funds

`POST /withdraw` - Withdraw funds

`POST /transfer` - Transfer to another account

`GET /transactions` - View transaction history

`GET /users/me` - Get current user info

`POST /enable_2fa` - Enable 2FA

`POST /setup_2fa` - Complete 2FA setup

`POST /disable_2fa` - Disable 2FA

`POST /change_password` - Change password

`GET /2fa/status` - Check 2FA status

`GET /health` - Health check endpoint

**Admin Endpoints**

`GET /admin/login` - Admin login page

`POST /admin/login` - Admin authentication

`GET /admin/dashboard` - Dashboard statistics

`GET /admin/users` - List all users

`GET /admin/users/recent` - Get recent users

`GET /admin/users/{user_id}` - Get user details

`POST /admin/users/{user_id}/lock` - Lock/unlock user

`POST /admin/users/{user_id}/reset-password` - Reset user password

`GET /admin/transactions` - View all transactions

`GET /admin/transactions/recent` - Get recent transactions

`POST /admin/transactions/{tx_id}/flag` - Flag/unflag transaction

`GET /admin/security/logs` - Security audit logs

`GET /admin/settings` - Get system settings

`POST /admin/settings` - Update system settings

`POST /admin/logs/clear` - Clear old logs

`POST /admin/sessions/lock-all` - Invalidate all sessions

`POST /admin/system/reset-test` - Reset test data

`POST /admin/admin/create` - Create new admin (superadmin only)

`GET /admin/admin/list` - List all admins

### 🐛 Troubleshooting
**Common Issues**
1. Port already in use
   ```bash
   # Kill process on port 8000
   # Windows
   netstat -ano | findstr :8000
   taskkill /PID <PID> /F

   # Mac/Linux
   lsof -ti:8000 | xargs kill -9
2. Database errors
   ```bash
   # Delete and recreate database
   rm simple_banking.db
   python main.py
3. Missing dependencies
   ```bash
   pip install -r requirements.txt --upgrade
4. Environment variables not loading
   ```bash
   # Make sure .env file exists in app/ directory
   # Check file contains valid key-value pairs
## 🙏 Acknowledgments

This project stands on the shoulders of incredible open-source projects and tools. Special thanks to:

### 🐍 **Core Technologies**
- **[FastAPI](https://fastapi.tiangolo.com/)** - For the lightning-fast, modern web framework that made this project possible
- **[Uvicorn](https://www.uvicorn.org/)** - For the ASGI server that powers our async Python backend
- **[SQLite](https://sqlite.org/)** - For the lightweight, file-based database that keeps our data persistent
- **[Python](https://www.python.org/)** - For being the versatile language that ties everything together
### 🔒 **Security & Authentication**
- **[Passlib](https://passlib.readthedocs.io/)** - For secure password hashing with bcrypt
- **[Python-JOSE](https://python-jose.readthedocs.io/)** - For JWT token implementation and validation
- **[PyOTP](https://pyauth.github.io/pyotp/)** - For two-factor authentication implementation
- **[Cryptography](https://cryptography.io/)** - For underlying cryptographic functions

### 🎨 **UI & Design**
- **[Glassmorphism Design](https://glassmorphism.com/)** - For the beautiful UI design inspiration
- **[CSS Animations](https://developer.mozilla.org/en-US/docs/Web/CSS/animation)** - For bringing the interface to life
- **[Font Awesome](https://fontawesome.com/)** - For the beautiful icons used throughout the interface
- **[Google Fonts](https://fonts.google.com/)** - For the Poppins font that gives our app its modern typography

### 🛠️ **Development Tools**
- **[Visual Studio Code](https://code.visualstudio.com/)** - For being the incredible code editor
- **[Git](https://git-scm.com/)** - For version control and collaboration
- **[Postman](https://www.postman.com/)** - For API testing and documentation
- **[Chrome DevTools](https://developer.chrome.com/docs/devtools/)** - For debugging and optimization

### 📖 **Quote of Inspiration**
> *"The only way to learn a new programming language is by writing programs in it."*  
> – Dennis Ritchie, Creator of C

---
Made with ❤️ and ☕ by [Asadullah](https://github.com/asadullahbro)

*"If you want to go fast, go alone. If you want to go far, go together."* – African Proverb
EOF
