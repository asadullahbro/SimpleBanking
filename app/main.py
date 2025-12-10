from fastapi import FastAPI, Depends, HTTPException, status, Form, APIRouter
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from jose import JWTError, jwt
from passlib.context import CryptContext
from typing import Optional, List
from datetime import datetime, timedelta
import uuid
import os
import sqlite3
import threading
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from fastapi import Request
from pydantic import BaseModel
import pyotp
import secrets
import string

# Configuration
DB_FILE = "simple_banking.db"
SECRET_KEY = os.getenv("SECRET_KEY", "USE_ENV_THATS_MILLIONS_BETTER_WAY_THEN_THIS")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
MAX_ATTEMPTS = 5
ADMIN_PASSWORD = "admin123"
# Thread-local storage for database connections
thread_local = threading.local()

# Security setup
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

app = FastAPI()
router = APIRouter(prefix="/admin", tags=["admin"])

# Templates and static files
templates = Jinja2Templates(directory="../templates")
app.mount("/static", StaticFiles(directory="../static"), name="static")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Admin Models
class AdminLogin(BaseModel):
    username: str
    password: str
    otp: Optional[str] = None

class AdminDashboardStats(BaseModel):
    total_users: int
    active_sessions: int
    today_transactions: int
    failed_logins_24h: int
    user_trend: int
    session_status: str
    transaction_total: float
    blocked_attempts: int

class UserInfo(BaseModel):
    id: int
    username: str
    account_number: Optional[str]
    email: Optional[str]
    balance: Optional[float]
    is_locked: bool
    created_at: datetime
    last_login: Optional[datetime]
    failed_attempts: int
    two_factor_enabled: bool
    last_ip: Optional[str]

class TransactionInfo(BaseModel):
    id: str
    from_account: Optional[str]
    to_account: Optional[str]
    amount: float
    transaction_type: str
    status: str
    timestamp: datetime
    is_flagged: bool

class SecurityLog(BaseModel):
    id: int
    timestamp: datetime
    event_type: str
    username: Optional[str]
    ip_address: Optional[str]
    details: str
    severity: str

class SystemSettings(BaseModel):
    max_attempts: int
    lock_duration: int
    enable_2fa: bool

def get_db_connection():
    """Get database connection with thread-local storage"""
    if not hasattr(thread_local, "conn"):
        try:
            thread_local.conn = sqlite3.connect(DB_FILE, check_same_thread=False)
            thread_local.conn.row_factory = sqlite3.Row
            # Enable WAL mode for better concurrency
            thread_local.conn.execute("PRAGMA journal_mode=WAL;")
            thread_local.conn.execute("PRAGMA busy_timeout = 5000;")
        except sqlite3.Error as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Database connection error: {str(e)}"
            )
    return thread_local.conn

def init_db():
    """Initialize database tables"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Users table
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            hashed_password TEXT NOT NULL,
            balance REAL DEFAULT 0,
            account_number TEXT UNIQUE NOT NULL,
            email TEXT,
            totp_secret TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_login DATETIME,
            locked_until DATETIME,
            last_ip TEXT,
            role TEXT DEFAULT 'user',
            is_active BOOLEAN DEFAULT 1
        )
        ''')
        
        # Admin users table
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            hashed_password TEXT NOT NULL,
            email TEXT,
            role TEXT DEFAULT 'admin',
            totp_secret TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_login DATETIME,
            is_active BOOLEAN DEFAULT 1,
            permissions TEXT DEFAULT 'all'
        )
        ''')
        
        # Transactions table - UPDATED to match existing schema
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS transactions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            type TEXT NOT NULL,
            amount REAL NOT NULL,
            description TEXT,
            balance_after REAL,
            related_account TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_flagged BOOLEAN DEFAULT 0
        )
        ''')
        
        # Login attempts table
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS login_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT,
            ip TEXT,
            success INTEGER NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
        ''')
        
        # Security logs table
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS security_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type TEXT NOT NULL,
            username TEXT,
            ip_address TEXT,
            details TEXT,
            severity TEXT DEFAULT 'info',
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
        ''')
        
        # System settings table
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS system_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            setting_key TEXT UNIQUE NOT NULL,
            setting_value TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
        ''')
        
        # Default system settings
        default_settings = [
            ('max_login_attempts', '5'),
            ('lockout_duration_minutes', '15'),
            ('require_2fa_admins', 'true'),
            ('transaction_limit', '10000'),
            ('session_timeout_minutes', '30')
        ]
        
        for key, value in default_settings:
            cursor.execute('''
                INSERT OR IGNORE INTO system_settings (setting_key, setting_value)
                VALUES (?, ?)
            ''', (key, value))
        
        # Create default admin user if not exists
        cursor.execute("SELECT * FROM admins WHERE username = 'admin'")
        admin_exists = cursor.fetchone()
        if not admin_exists:
            default_admin_password = pwd_context.hash(ADMIN_PASSWORD)
            cursor.execute('''
                INSERT INTO admins (username, hashed_password, email, role)
                VALUES (?, ?, ?, ?)
            ''', ('admin', default_admin_password, 'admin@simplebanking.com', 'superadmin'))
        
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        # Don't close the connection - keep it in thread-local storage
        pass

# Helper functions
def verify_password_complexity(password: str) -> bool:
    """Verify password meets complexity requirements"""
    if len(password) < 8:
        return False
    if not any(c.islower() for c in password):
        return False
    if not any(c.isupper() for c in password):
        return False
    if not any(c.isdigit() for c in password):
        return False
    if not any(c in "!@#$%^&*()-_=+[]{}|;:'\",.<>?/`~" for c in password):
        return False
    return True

def record_login_attempt(username: str, ip: str, success: bool):
    """Record login attempt - FIXED to use thread-local connection"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO login_attempts (username, ip, success) VALUES (?, ?, ?)",
            (username, ip, 1 if success else 0)
        )
        conn.commit()
    except Exception as e:
        # Log error but don't crash
        print(f"Error recording login attempt: {e}")

def count_failed_attempts(username: str, minutes: int = 15, ip: str = None):
    """Count failed login attempts"""
    conn = get_db_connection()
    cursor = conn.cursor()
    since = (datetime.utcnow() - timedelta(minutes=minutes)).strftime("%Y-%m-%d %H:%M:%S")
    if ip:
        cursor.execute(
            "SELECT COUNT(*) FROM login_attempts WHERE username = ? AND ip = ? AND success = 0 AND timestamp >= ?",
            (username, ip, since)
        )
    else:
        cursor.execute(
            "SELECT COUNT(*) FROM login_attempts WHERE username = ? AND success = 0 AND timestamp >= ?",
            (username, since)
        )
    cnt = cursor.fetchone()[0]
    return cnt

def lock_user(username: str, minutes: int):
    """Lock user account - FIXED"""
    locked_until = (datetime.utcnow() + timedelta(minutes=minutes)).isoformat()
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE users SET locked_until = ? WHERE username = ?",
        (locked_until, username)
    )
    conn.commit()

def is_user_locked(user_row):
    """Check if user is locked - FIXED VERSION"""
    locked = user_row.get("locked_until")
    if not locked:
        return False, None
    
    try:
        # Try parsing with timezone
        locked_dt = datetime.fromisoformat(locked)
    except ValueError:
        try:
            # Try without timezone
            locked_dt = datetime.strptime(locked, "%Y-%m-%d %H:%M:%S")
        except Exception:
            # Invalid format, clear it
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("UPDATE users SET locked_until = NULL WHERE username = ?", (user_row["username"],))
            conn.commit()
            return False, None
    
    # Check if lock is expired
    if locked_dt > datetime.utcnow():
        return True, locked_dt
    else:
        # Lock expired, clear it
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE users SET locked_until = NULL WHERE username = ?", (user_row["username"],))
        conn.commit()
        return False, None
def clear_failed_attempts(username: str):
    """Clear failed login attempts"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM login_attempts WHERE username = ? AND success = 0", (username,))
    conn.commit()

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Create JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme)):
    """Get current user from JWT token"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE username = ?", (username,))
    user_row = cursor.fetchone()
    
    if user_row is None:
        raise credentials_exception
    
    return dict(user_row)

def get_user_by_username(username: str):
    """Get user by username"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE username = ?", (username,))
    user_row = cursor.fetchone()
    return dict(user_row) if user_row else None

def generate_account_number(username: str) -> str:
    """Generate unique account number from username"""
    import hashlib
    hash_object = hashlib.sha256(username.encode())
    hex_dig = hash_object.hexdigest()
    raw_number = hex_dig[:16].upper()
    account_number = '-'.join(raw_number[i:i+4] for i in range(0, 16, 4))
    return account_number

def generate_transaction_id():
    """Generate unique transaction ID"""
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    unique_id = str(uuid.uuid4())[:8]
    return f"tx_{timestamp}_{unique_id}"

def save_transaction(transaction: dict):
    """Save transaction to database"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    transaction_id = generate_transaction_id()
    try:
        cursor.execute('''
            INSERT INTO transactions (id, user_id, type, amount, description, balance_after, related_account)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (
            transaction_id,
            transaction["user_id"],
            transaction["type"],
            transaction["amount"],
            transaction.get("description"),
            transaction.get("balance_after"),
            transaction.get("related_account")
        ))
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e

# Admin helper functions
def get_admin_by_username(username: str):
    """Get admin by username"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM admins WHERE username = ?", (username,))
    admin_row = cursor.fetchone()
    return dict(admin_row) if admin_row else None

async def verify_admin(token: str = Depends(oauth2_scheme)):
    """Verify admin JWT token"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate admin credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        role: str = payload.get("role")
        if username is None or role != "admin":
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    admin = get_admin_by_username(username)
    if admin is None:
        raise credentials_exception
    
    return admin

def create_admin_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Create JWT access token for admin"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "role": "admin"})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def log_security_event(event_type: str, username: str = None, 
                       ip_address: str = None, details: str = "", 
                       severity: str = "info"):
    """Log security event to database"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO security_logs (event_type, username, ip_address, details, severity)
        VALUES (?, ?, ?, ?, ?)
    ''', (event_type, username, ip_address, details, severity))
    conn.commit()

# Initialize database
init_db()

# ===== REGULAR USER ENDPOINTS =====
@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    """Home page"""
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    """Login page"""
    return templates.TemplateResponse("login.html", {"request": request})

@app.get("/admin/login", response_class=HTMLResponse)
async def admin_login_page(request: Request):
    """Admin login page"""
    return templates.TemplateResponse("admin-login.html", {"request": request})

@app.get("/admin-panel", response_class=HTMLResponse)
async def admin_panel(request: Request):
    """Admin panel page"""
    return templates.TemplateResponse("admin-panel.html", {"request": request})

@app.get("/signup", response_class=HTMLResponse)
async def signup_page(request: Request):
    """Signup page"""
    return templates.TemplateResponse("signup.html", {"request": request})

@app.post("/signup")
async def signup(username: str = Form(...), password: str = Form(...)):
    """User registration endpoint"""
    existing_user = get_user_by_username(username)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered"
        )
    
    if not verify_password_complexity(password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters with uppercase, lowercase, number, and special character"
        )
    
    hashed_password = pwd_context.hash(password)
    account_number = generate_account_number(username)
    
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute('''
            INSERT INTO users (username, hashed_password, account_number, balance)
            VALUES (?, ?, ?, ?)
        ''', (username, hashed_password, account_number, 0.0))
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create user: {str(e)}"
        )
    
    return {"message": "User created successfully", "account_number": account_number}

@app.post("/token")
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), request: Request = None):
    client_ip = request.client.host if request else "unknown"
    user = get_user_by_username(form_data.username)
    
    if user:
        locked, until = is_user_locked(user)
        if locked:
            raise HTTPException(
                status_code=403,
                detail=f"Account locked until {until.strftime('%Y-%m-%d %H:%M:%S')} UTC due to multiple failed login attempts"
            )
            
    if not user or not pwd_context.verify(form_data.password, user["hashed_password"]):
        record_login_attempt(form_data.username, client_ip, False)
        fails_15m = count_failed_attempts(form_data.username, minutes=15)
        fails_30m = count_failed_attempts(form_data.username, minutes=30)
        fails_24h = count_failed_attempts(form_data.username, minutes=60*24)

        if fails_15m >= 5 and fails_15m < 10:
            lock_user(form_data.username, minutes=5)
        elif fails_30m >= 10 and fails_30m < 15:
            lock_user(form_data.username, minutes=60)
        elif fails_24h >= 15:
            lock_user(form_data.username, minutes=1440)

        raise HTTPException(
            status_code=401,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    record_login_attempt(form_data.username, client_ip, True)
    clear_failed_attempts(form_data.username)

    if user.get("totp_secret"):
        raise HTTPException(
            status_code=401,
            detail="2FA required"
        )

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE username = ?",
        (user["username"],)
    )
    conn.commit()

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user["username"]},
        expires_delta=access_token_expires
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "username": user["username"],
        "account_number": user["account_number"]
    }

@app.post("/token_2fa")
async def login_2fa(
    form_data: OAuth2PasswordRequestForm = Depends(),
    request: Request = None,
    otp: Optional[str] = Form(None)
):
    client_ip = request.client.host
    user = get_user_by_username(form_data.username)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    locked, until = is_user_locked(user)
    if locked:
        raise HTTPException(
            status_code=403,
            detail=f"Account locked until {until.strftime('%Y-%m-%d %H:%M:%S')} UTC"
        )

    if not pwd_context.verify(form_data.password, user["hashed_password"]):
        record_login_attempt(form_data.username, client_ip, False)
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if user.get("totp_secret"):
        if not otp:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="2FA code required"
            )
    totp = pyotp.TOTP(user["totp_secret"])
    if not totp.verify(otp):
        record_login_attempt(form_data.username, client_ip, False)
        fails_15m = count_failed_attempts(form_data.username, 15)
        fails_30m = count_failed_attempts(form_data.username, 30)
        fails_24h = count_failed_attempts(form_data.username, 60*24)

        if fails_15m >= 5 and fails_15m < 10:
            lock_user(form_data.username, 5)
        elif fails_30m >= 10 and fails_30m < 15:
            lock_user(form_data.username, 60)
        elif fails_24h >= 15:
            lock_user(form_data.username, 1440)

        raise HTTPException(status_code=401, detail="Invalid 2FA code")

    record_login_attempt(form_data.username, client_ip, True)
    clear_failed_attempts(form_data.username)

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE username = ?",
        (user["username"],)
    )
    conn.commit()
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user["username"]},
        expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "username": user["username"],
        "account_number": user["account_number"]
    }

@app.post("/enable_2fa")
async def enable_2fa(current_user: dict = Depends(get_current_user)):
    if current_user.get("totp_secret"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA already enabled"
        )
    
    secret = pyotp.random_base32()
    return {
        "message": "2FA secret generated. Scan QR code and verify with OTP to enable.",
        "secret": secret,
        "username": current_user["username"]
    }

@app.get("/2fa/status")
async def get_2fa_status(current_user: dict = Depends(get_current_user)):
    return {
        "has_2fa": bool(current_user.get("totp_secret")),
        "username": current_user["username"]
    }

@app.post("/setup_2fa")
async def setup_2fa(
    secret: str = Form(...),
    otp: str = Form(...),
    current_user: dict = Depends(get_current_user)
):
    if current_user.get("totp_secret"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA already enabled"
        )
    
    totp = pyotp.TOTP(secret)
    if not totp.verify(otp, valid_window=1):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid OTP code"
        )
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE users SET totp_secret = ? WHERE username = ?",
        (secret, current_user["username"])
    )
    conn.commit()
    
    return {"message": "2FA enabled successfully"}

@app.post("/disable_2fa")
async def disable_2fa(
    otp: str = Form(...),
    current_user: dict = Depends(get_current_user)
):
    if not current_user.get("totp_secret"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA is not enabled for this user"
        )
    
    totp = pyotp.TOTP(current_user["totp_secret"])
    if not totp.verify(otp, valid_window=1):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid OTP code"
        )
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE users SET totp_secret = NULL WHERE username = ?",
        (current_user["username"],)
    )
    conn.commit()
    
    return {"message": "2FA disabled successfully"}

@app.get("/balance")
async def get_balance(current_user: dict = Depends(get_current_user)):
    return {
        "username": current_user["username"],
        "balance": current_user["balance"],
        "account_number": current_user["account_number"]
    }

@app.post("/deposit")
async def make_deposit(
    amount: float = Form(...),
    current_user: dict = Depends(get_current_user)
):
    if amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Amount must be positive"
        )

    conn = get_db_connection()
    try:
        # Get current balance
        cursor = conn.cursor()
        cursor.execute("SELECT balance FROM users WHERE username = ?", (current_user["username"],))
        current_balance = cursor.fetchone()[0]
        new_balance = current_balance + amount
        
        # Update balance
        cursor.execute(
            "UPDATE users SET balance = ? WHERE username = ?",
            (new_balance, current_user["username"])
        )
        
        # Log transaction
        transaction = {
            "user_id": current_user["username"],
            "type": "deposit",
            "amount": amount,
            "description": f"Deposit: ${amount:.2f}",
            "balance_after": new_balance,
            "related_account": current_user["account_number"]
        }
        save_transaction(transaction)

        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Deposit failed: {str(e)}"
        )
    
    return {
        "message": f"Deposited ${amount:.2f} successfully",
        "new_balance": new_balance
    }

@app.post("/withdraw")
async def make_withdrawal(
    amount: float = Form(...),
    current_user: dict = Depends(get_current_user)
):
    if amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Amount must be positive"
        )

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT balance FROM users WHERE username = ?", (current_user["username"],))
    current_balance = cursor.fetchone()[0]
    
    if current_balance < amount:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Insufficient funds"
        )

    try:
        new_balance = current_balance - amount
        
        cursor.execute(
            "UPDATE users SET balance = ? WHERE username = ?",
            (new_balance, current_user["username"])
        )
        
        transaction = {
            "user_id": current_user["username"],
            "type": "withdrawal",
            "amount": -amount,
            "description": f"Withdrawal: ${amount:.2f}",
            "balance_after": new_balance,
            "related_account": current_user["account_number"]
        }
        save_transaction(transaction)

        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Withdrawal failed: {str(e)}"
        )
    
    return {
        "message": f"Withdrew ${amount:.2f} successfully",
        "new_balance": new_balance
    }

@app.post("/transfer")
async def transfer_money(
    to_account_number: str = Form(...),
    amount: float = Form(...),
    current_user: dict = Depends(get_current_user)
):
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    
    if current_user["account_number"] == to_account_number:
        raise HTTPException(status_code=400, detail="Cannot transfer to yourself")

    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # 1. Find recipient
        cursor.execute(
            "SELECT * FROM users WHERE account_number = ?",
            (to_account_number,)
        )
        recipient_row = cursor.fetchone()
        if recipient_row is None:
            raise HTTPException(status_code=404, detail="Recipient account not found")
        recipient = dict(recipient_row)
        
        # 2. Check sender balance
        cursor.execute("SELECT balance FROM users WHERE username = ?", (current_user["username"],))
        sender_balance = cursor.fetchone()[0]
        if sender_balance < amount:
            raise HTTPException(status_code=400, detail="Insufficient funds")

        # 3. Update balances
        new_sender_balance = sender_balance - amount
        new_recipient_balance = recipient["balance"] + amount
        
        cursor.execute(
            "UPDATE users SET balance = ? WHERE username = ?",
            (new_sender_balance, current_user["username"])
        )
        
        cursor.execute(
            "UPDATE users SET balance = ? WHERE username = ?",
            (new_recipient_balance, recipient["username"])
        )

        # 4. Log transactions
        sender_tx = {
            "user_id": current_user["username"],
            "type": "transfer_sent",
            "amount": -amount,
            "description": f"Transfer to {to_account_number}",
            "balance_after": new_sender_balance,
            "related_account": to_account_number
        }
        save_transaction(sender_tx)
        
        recipient_tx = {
            "user_id": recipient["username"],
            "type": "transfer_received",
            "amount": amount,
            "description": f"Transfer from {current_user['account_number']}",
            "balance_after": new_recipient_balance,
            "related_account": current_user["account_number"]
        }
        save_transaction(recipient_tx)
        
        conn.commit()
        
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Transfer failed: {str(e)}")
    
    return {
        "message": f"Transferred ${amount:.2f} to account {to_account_number}",
        "new_balance": new_sender_balance
    }

@app.get("/transactions")
async def get_transactions(current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT * FROM transactions 
        WHERE user_id = ?
        ORDER BY timestamp DESC
        LIMIT 100
    ''', (current_user["username"],))
    
    transactions = [dict(row) for row in cursor.fetchall()]
    
    return {"transactions": transactions}

@app.get("/users/me")
async def read_users_me(current_user: dict = Depends(get_current_user)):
    return {
        "username": current_user["username"],
        "account_number": current_user["account_number"],
        "balance": current_user["balance"],
        "has_2fa": bool(current_user.get("totp_secret")),
        "created_at": current_user.get("created_at"),
        "last_login": current_user.get("last_login")
    }

@app.get("/users/{account_number}")
async def get_user_by_account_number(
    account_number: str,
    current_user: dict = Depends(get_current_user)
):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT username, account_number, created_at FROM users WHERE REPLACE(account_number,'-','') = ?",
        (account_number.replace("-", ""),)
    )
    
    user_row = cursor.fetchone()
    
    if user_row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    return dict(user_row)

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        conn = get_db_connection()
        conn.execute("SELECT 1")
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        return {"status": "unhealthy", "database": "disconnected", "error": str(e)}

@app.post("/change_password")
async def change_password(
    current_password: str = Form(...),
    new_password: str = Form(...),
    current_user: dict = Depends(get_current_user)
):
    if not pwd_context.verify(current_password, current_user["hashed_password"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    if not verify_password_complexity(new_password):
        raise HTTPException(
            status_code=400,
            detail="Password must be at least 8 characters with uppercase, lowercase, number, and special character"
        )
    if current_password == new_password:
        raise HTTPException(
            status_code=400,
            detail="New password must be different from current password"
        )
    
    hashed_new = pwd_context.hash(new_password)
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE users SET hashed_password = ? WHERE username = ?",
        (hashed_new, current_user["username"])
    )
    conn.commit()
    
    return {"message": "Password updated successfully"}

# ===== ADMIN ENDPOINTS =====
@router.post("/login")
async def admin_login(login: AdminLogin, request: Request):
    """Admin login endpoint"""
    client_ip = request.client.host
    
    admin = get_admin_by_username(login.username)
    if not admin:
        log_security_event("failed_admin_login", login.username, client_ip, 
                          "Invalid username", "high")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )
    
    if not admin.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin account is disabled"
        )
    
    if not pwd_context.verify(login.password, admin["hashed_password"]):
        log_security_event("failed_admin_login", login.username, client_ip,
                          "Invalid password", "high")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )
    
    if admin.get("totp_secret") and admin.get("totp_secret") != "disabled":
        if not login.otp:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="2FA code required"
            )
        
        totp = pyotp.TOTP(admin["totp_secret"])
        if not totp.verify(login.otp):
            log_security_event("failed_admin_2fa", login.username, client_ip,
                              "Invalid 2FA code", "high")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid 2FA code"
            )
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE admins SET last_login = CURRENT_TIMESTAMP WHERE username = ?",
        (admin["username"],)
    )
    conn.commit()
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_admin_access_token(
        data={"sub": admin["username"]},
        expires_delta=access_token_expires
    )
    
    log_security_event("admin_login_success", login.username, client_ip,
                      "Admin logged in successfully", "info")
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "username": admin["username"],
        "role": admin["role"],
        "permissions": admin.get("permissions", "all")
    }

@router.get("/dashboard", response_model=AdminDashboardStats)
async def get_dashboard_stats(admin: dict = Depends(verify_admin)):
    """Get admin dashboard statistics"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT COUNT(*) FROM users")
    total_users = cursor.fetchone()[0]
    
    cursor.execute("""
        SELECT COUNT(*) FROM users 
        WHERE last_login >= datetime('now', '-30 minutes')
    """)
    active_sessions = cursor.fetchone()[0]
    
    cursor.execute("""
        SELECT COUNT(*) FROM transactions 
        WHERE DATE(timestamp) = DATE('now')
    """)
    today_transactions = cursor.fetchone()[0]
    
    cursor.execute("""
        SELECT COALESCE(SUM(amount), 0) FROM transactions 
        WHERE DATE(timestamp) = DATE('now')
    """)
    transaction_total = cursor.fetchone()[0] or 0
    
    cursor.execute("""
        SELECT COUNT(*) FROM login_attempts 
        WHERE success = 0 AND timestamp >= datetime('now', '-24 hours')
    """)
    failed_logins_24h = cursor.fetchone()[0]
    
    cursor.execute("""
        SELECT COUNT(*) FROM users 
        WHERE DATE(created_at) = DATE('now')
    """)
    user_trend = cursor.fetchone()[0]
    
    cursor.execute("""
        SELECT COUNT(*) FROM users 
        WHERE locked_until IS NOT NULL AND locked_until > datetime('now')
    """)
    blocked_attempts = cursor.fetchone()[0]
    
    session_status = "Normal"
    if active_sessions > 100:
        session_status = "High"
    elif active_sessions > 50:
        session_status = "Medium"
    
    return AdminDashboardStats(
        total_users=total_users,
        active_sessions=active_sessions,
        today_transactions=today_transactions,
        failed_logins_24h=failed_logins_24h,
        user_trend=user_trend,
        session_status=session_status,
        transaction_total=transaction_total,
        blocked_attempts=blocked_attempts
    )

@router.get("/users", response_model=List[UserInfo])
async def get_all_users(admin: dict = Depends(verify_admin)):
    """Get all users"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT 
            id, username, account_number, email, balance, 
            CASE WHEN locked_until > datetime('now') THEN 1 ELSE 0 END as is_locked,
            created_at, last_login, 
            (SELECT COUNT(*) FROM login_attempts 
             WHERE username = users.username AND success = 0 
             AND timestamp >= datetime('now', '-24 hours')) as failed_attempts,
            CASE WHEN totp_secret IS NOT NULL THEN 1 ELSE 0 END as two_factor_enabled,
            last_ip
        FROM users
        ORDER BY id DESC
    """)
    
    users = []
    for row in cursor.fetchall():
        user = dict(row)
        user["is_locked"] = bool(user.get("is_locked", 0))
        user["two_factor_enabled"] = bool(user.get("two_factor_enabled", 0))
        users.append(user)
    
    return users

@router.get("/users/recent", response_model=List[UserInfo])
async def get_recent_users(limit: int = 5, admin: dict = Depends(verify_admin)):
    """Get recent users"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT 
            id, username, account_number, email, balance, 
            CASE WHEN locked_until > datetime('now') THEN 1 ELSE 0 END as is_locked,
            created_at, last_login, 
            (SELECT COUNT(*) FROM login_attempts 
             WHERE username = users.username AND success = 0 
             AND timestamp >= datetime('now', '-24 hours')) as failed_attempts,
            CASE WHEN totp_secret IS NOT NULL THEN 1 ELSE 0 END as two_factor_enabled,
            last_ip
        FROM users
        ORDER BY created_at DESC
        LIMIT ?
    """, (limit,))
    
    users = []
    for row in cursor.fetchall():
        user = dict(row)
        user["is_locked"] = bool(user.get("is_locked", 0))
        user["two_factor_enabled"] = bool(user.get("two_factor_enabled", 0))
        users.append(user)
    
    return users

@router.get("/users/{user_id}", response_model=UserInfo)
async def get_user_details(user_id: int, admin: dict = Depends(verify_admin)):
    """Get specific user details"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT 
            id, username, account_number, email, balance, 
            CASE WHEN locked_until > datetime('now') THEN 1 ELSE 0 END as is_locked,
            created_at, last_login, 
            (SELECT COUNT(*) FROM login_attempts 
             WHERE username = users.username AND success = 0 
             AND timestamp >= datetime('now', '-24 hours')) as failed_attempts,
            CASE WHEN totp_secret IS NOT NULL THEN 1 ELSE 0 END as two_factor_enabled,
            last_ip
        FROM users
        WHERE id = ?
    """, (user_id,))
    
    user_row = cursor.fetchone()
    
    if not user_row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    user = dict(user_row)
    user["is_locked"] = bool(user.get("is_locked", 0))
    user["two_factor_enabled"] = bool(user.get("two_factor_enabled", 0))
    
    return user

@router.post("/users/{user_id}/lock")
async def lock_user_endpoint(
    user_id: int, 
    lock: bool = True, 
    admin: dict = Depends(verify_admin)
):
    """Lock or unlock user account"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT username FROM users WHERE id = ?", (user_id,))
    user = cursor.fetchone()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    username = user["username"]
    
    if lock:
        lock_until = (datetime.utcnow() + timedelta(minutes=15)).strftime("%Y-%m-%d %H:%M:%S")
        cursor.execute(
            "UPDATE users SET locked_until = ? WHERE id = ?",
            (lock_until, user_id)
        )
        message = f"User {username} locked until {lock_until} UTC"
        log_security_event("user_locked", username, None, 
                          f"Locked by admin {admin['username']}", "medium")
    else:
        cursor.execute(
            "UPDATE users SET locked_until = NULL WHERE id = ?",
            (user_id,)
        )
        message = f"User {username} unlocked"
        log_security_event("user_unlocked", username, None,
                          f"Unlocked by admin {admin['username']}", "low")
    
    conn.commit()
    
    return {"message": message}

@router.post("/users/{user_id}/reset-password")
async def reset_user_password(
    user_id: int, 
    admin: dict = Depends(verify_admin)
):
    """Reset user password (generate temporary password)"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT username FROM users WHERE id = ?", (user_id,))
    user = cursor.fetchone()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    username = user["username"]
    
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    temp_password = ''.join(secrets.choice(alphabet) for i in range(12))
    hashed_password = pwd_context.hash(temp_password)
    
    cursor.execute(
        "UPDATE users SET hashed_password = ?, locked_until = NULL WHERE id = ?",
        (hashed_password, user_id)
    )
    
    conn.commit()
    
    log_security_event("password_reset", username, None,
                      f"Password reset by admin {admin['username']}", "high")
    
    return {
        "message": f"Password reset for user {username}",
        "temp_password": temp_password,
        "note": "User should change this password immediately on next login"
    }

@router.get("/transactions", response_model=List[TransactionInfo])
async def get_all_transactions(
    filter: Optional[str] = None,
    limit: int = 100,
    admin: dict = Depends(verify_admin)
):
    """Get all transactions with optional filter"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = """
        SELECT 
            t.id, 
            t.user_id as from_account,
            t.related_account as to_account,
            t.amount, 
            t.type as transaction_type,
            'completed' as status,
            t.timestamp,
            t.is_flagged,
            u.username as from_username,
            u2.username as to_username
        FROM transactions t
        LEFT JOIN users u ON t.user_id = u.username
        LEFT JOIN users u2 ON t.related_account = u2.account_number
        WHERE 1=1
    """
    
    params = []
    
    if filter == "today":
        query += " AND DATE(t.timestamp) = DATE('now')"
    elif filter == "suspicious":
        query += " AND t.is_flagged = 1"
    elif filter == "large":
        query += " AND ABS(t.amount) > 10000"
    
    query += " ORDER BY t.timestamp DESC LIMIT ?"
    params.append(limit)
    
    cursor.execute(query, params)
    
    transactions = []
    for row in cursor.fetchall():
        tx = dict(row)
        tx["from_account"] = tx.get("from_username") or tx.get("from_account")
        tx["to_account"] = tx.get("to_username") or tx.get("to_account")
        tx["is_flagged"] = bool(tx.get("is_flagged", 0))
        transactions.append(tx)
    
    return transactions

@router.get("/transactions/recent", response_model=List[TransactionInfo])
async def get_recent_transactions(
    limit: int = 5, 
    admin: dict = Depends(verify_admin)
):
    """Get recent transactions"""
    return await get_all_transactions(None, limit, admin)

@router.post("/transactions/{tx_id}/flag")
async def flag_transaction(
    tx_id: str, 
    flag: bool = True,
    admin: dict = Depends(verify_admin)
):
    """Flag or unflag transaction"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM transactions WHERE id = ?", (tx_id,))
    transaction = cursor.fetchone()
    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found"
        )
    
    cursor.execute(
        "UPDATE transactions SET is_flagged = ? WHERE id = ?",
        (1 if flag else 0, tx_id)
    )
    
    conn.commit()
    
    action = "flagged" if flag else "unflagged"
    log_security_event("transaction_" + action, None, None,
                      f"Transaction {tx_id} {action} by admin {admin['username']}",
                      "medium" if flag else "low")
    
    return {"message": f"Transaction {tx_id} {action} successfully"}

@router.get("/security/logs", response_model=List[SecurityLog])
async def get_security_logs(
    limit: int = 100,
    admin: dict = Depends(verify_admin)
):
    """Get security logs"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT * FROM security_logs 
        ORDER BY timestamp DESC 
        LIMIT ?
    """, (limit,))
    
    logs = [dict(row) for row in cursor.fetchall()]
    return logs

@router.get("/settings", response_model=SystemSettings)
async def get_system_settings(admin: dict = Depends(verify_admin)):
    """Get current system settings"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT setting_key, setting_value FROM system_settings")
    
    settings_dict = {}
    for row in cursor.fetchall():
        settings_dict[row["setting_key"]] = row["setting_value"]
    
    return SystemSettings(
        max_attempts=int(settings_dict.get("max_login_attempts", 5)),
        lock_duration=int(settings_dict.get("lockout_duration_minutes", 15)),
        enable_2fa=settings_dict.get("require_2fa_admins", "true").lower() == "true"
    )

@router.post("/settings")
async def update_system_settings(
    settings: SystemSettings,
    admin: dict = Depends(verify_admin)
):
    """Update system settings"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
        INSERT OR REPLACE INTO system_settings (setting_key, setting_value)
        VALUES (?, ?)
    """, ("max_login_attempts", str(settings.max_attempts)))
    
    cursor.execute("""
        INSERT OR REPLACE INTO system_settings (setting_key, setting_value)
        VALUES (?, ?)
    """, ("lockout_duration_minutes", str(settings.lock_duration)))
    
    cursor.execute("""
        INSERT OR REPLACE INTO system_settings (setting_key, setting_value)
        VALUES (?, ?)
    """, ("require_2fa_admins", "true" if settings.enable_2fa else "false"))
    
    conn.commit()
    
    log_security_event("settings_updated", admin["username"], None,
                      "System settings updated", "info")
    
    return {"message": "Settings updated successfully"}

@router.post("/logs/clear")
async def clear_old_logs(
    days: int = 30,
    admin: dict = Depends(verify_admin)
):
    """Clear logs older than specified days"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
        DELETE FROM security_logs 
        WHERE timestamp < datetime('now', ?)
    """, (f'-{days} days',))
    security_deleted = cursor.rowcount
    
    cursor.execute("""
        DELETE FROM login_attempts 
        WHERE timestamp < datetime('now', ?)
    """, (f'-{days} days',))
    login_deleted = cursor.rowcount
    
    conn.commit()
    
    log_security_event("logs_cleared", admin["username"], None,
                      f"Cleared {security_deleted} security logs and {login_deleted} login attempts",
                      "info")
    
    return {
        "message": f"Cleared logs older than {days} days",
        "security_logs_deleted": security_deleted,
        "login_attempts_deleted": login_deleted
    }

@router.post("/sessions/lock-all")
async def lock_all_sessions(admin: dict = Depends(verify_admin)):
    """Invalidate all user sessions (clear all JWT tokens)"""
    log_security_event("all_sessions_locked", admin["username"], None,
                      "All user sessions invalidated by admin", "high")
    
    return {
        "message": "All sessions marked for invalidation. Users will need to re-login.",
        "note": "In a production system, implement JWT blacklisting or reduce token expiry."
    }

@router.post("/system/reset-test")
async def reset_test_data(admin: dict = Depends(verify_admin)):
    """Reset test data (DANGEROUS - for development only)"""
    if admin.get("role") != "superadmin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only superadmin can reset test data"
        )
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("UPDATE users SET balance = 1000 WHERE role != 'admin'")
    cursor.execute("DELETE FROM transactions WHERE type != 'system'")
    cursor.execute("DELETE FROM login_attempts")
    cursor.execute("DELETE FROM security_logs")
    
    conn.commit()
    
    log_security_event("system_reset", admin["username"], None,
                      "Test data reset by admin", "critical")
    
    return {"message": "Test data reset completed"}

@router.post("/admin/create")
async def create_admin_user(
    username: str,
    password: str,
    email: str = None,
    role: str = "admin",
    current_admin: dict = Depends(verify_admin)
):
    """Create new admin user (only superadmin can do this)"""
    if current_admin.get("role") != "superadmin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only superadmin can create new admins"
        )
    
    existing_admin = get_admin_by_username(username)
    if existing_admin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admin username already exists"
        )
    
    if not verify_password_complexity(password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters with uppercase, lowercase, number, and special character"
        )
    
    hashed_password = pwd_context.hash(password)
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO admins (username, hashed_password, email, role)
        VALUES (?, ?, ?, ?)
    ''', (username, hashed_password, email, role))
    
    conn.commit()
    
    log_security_event("admin_created", current_admin["username"], None,
                      f"Created new admin: {username} with role: {role}", "high")
    
    return {"message": f"Admin user {username} created successfully"}

@router.get("/admin/list")
async def list_admins(current_admin: dict = Depends(verify_admin)):
    """List all admin users"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, email, role, created_at, last_login, is_active FROM admins")
    
    admins = [dict(row) for row in cursor.fetchall()]
    return admins

# Mount the admin router
app.include_router(router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)