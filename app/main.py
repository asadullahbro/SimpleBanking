from fastapi import FastAPI, Depends, HTTPException, status, Form
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from jose import JWTError, jwt
from passlib.context import CryptContext
from typing import Optional
from datetime import datetime, timedelta
import uuid
import os
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from fastapi import Request
import sqlite3
import pyotp
import qrcode
import base64
from io import BytesIO

# Configuration
DB_FILE = "simple_banking.db"
SECRET_KEY = os.getenv("SECRET_KEY", "if_you_use_a_real_secret_key_your_app_will_be_more_secure")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

# Security setup
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

app = FastAPI()

# Templates and static files
templates = Jinja2Templates(directory="../templates")
app.mount("/static", StaticFiles(directory="../static"), name="static")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify actual origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_db_connection():
    """Get database connection with proper error handling"""
    try:
        conn = sqlite3.connect(DB_FILE, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        # Enable WAL mode for better concurrency
        conn.execute("PRAGMA journal_mode=WAL;")
        return conn
    except sqlite3.Error as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database connection error: {str(e)}"
        )


def init_db():
    """Initialize database tables"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Users table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS users (
        username TEXT PRIMARY KEY,
        hashed_password TEXT NOT NULL,
        balance REAL DEFAULT 0,
        account_number TEXT UNIQUE NOT NULL,
        totp_secret TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME
    )
    ''')
    
    # Transactions table with proper foreign key constraint
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
        FOREIGN KEY(user_id) REFERENCES users(username) ON DELETE CASCADE
    )
    ''')
    
    # Indexes for performance
    cursor.execute('''
    CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id)
    ''')
    cursor.execute('''
    CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(timestamp)
    ''')
    
    conn.commit()
    conn.close()


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
    conn.close()
    
    if user_row is None:
        raise credentials_exception
    
    return dict(user_row)


def get_user_by_username(username: str):
    """Get user by username"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE username = ?", (username,))
    user_row = cursor.fetchone()
    conn.close()
    return dict(user_row) if user_row else None


def generate_account_number(username: str) -> str:
    """Generate unique account number from username"""
    import hashlib
    hash_object = hashlib.sha256(username.encode())
    hex_dig = hash_object.hexdigest()
    raw_number = hex_dig[:16].upper()
    account_number = '-'.join(raw_number[i:i+4] for i in range(0, 16, 4))
    return account_number

def load_users():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users")
    users = {row["username"]: dict(row) for row in cursor.fetchall()}
    conn.close()
    return users
def generate_transaction_id():
    """Generate unique transaction ID"""
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    unique_id = str(uuid.uuid4())[:8]
    return f"tx_{timestamp}_{unique_id}"


def save_transaction(transaction: dict, conn):
    """Save transaction to database using existing connection"""
    cursor = conn.cursor()
    
    transaction_id = generate_transaction_id()
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

def update_user_balance(username: str, new_balance: float):
    """Update user balance in database"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE users SET balance = ? WHERE username = ?",
        (new_balance, username)
    )
    conn.commit()
    conn.close()


# Initialize database on startup
init_db()


# Routes
@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    """Home page"""
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    """Login page"""
    return templates.TemplateResponse("login.html", {"request": request})


@app.get("/signup", response_class=HTMLResponse)
async def signup_page(request: Request):
    """Signup page"""
    return templates.TemplateResponse("signup.html", {"request": request})


@app.post("/signup")
async def signup(username: str = Form(...), password: str = Form(...)):
    """User registration endpoint"""
    # Check if user exists
    existing_user = get_user_by_username(username)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered"
        )
    
    # Validate password complexity
    if not verify_password_complexity(password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters with uppercase, lowercase, number, and special character"
        )
    
    # Hash password and create user
    hashed_password = pwd_context.hash(password)
    account_number = generate_account_number(username)
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO users (username, hashed_password, account_number, balance)
        VALUES (?, ?, ?, ?)
    ''', (username, hashed_password, account_number, 0.0))
    
    conn.commit()
    conn.close()
    
    return {"message": "User created successfully", "account_number": account_number}


@app.post("/token")
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    user = get_user_by_username(form_data.username)

    # Wrong credentials
    if not user or not pwd_context.verify(form_data.password, user["hashed_password"]):
        raise HTTPException(
            status_code=401,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # If user has 2FA enabled, block normal login
    if user.get("totp_secret"):
        raise HTTPException(
            status_code=401,
            detail="2FA required"
        )

    # Update last login time
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE username = ?",
        (user["username"],)
    )
    conn.commit()
    conn.close()

    # Issue normal access token
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
async def login_with_2fa(
    form_data: OAuth2PasswordRequestForm = Depends(),
    otp: Optional[str] = Form(None)
):
    """Login endpoint with 2FA support"""
    user = get_user_by_username(form_data.username)
    
    if not user or not pwd_context.verify(form_data.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Check if 2FA is enabled
    if user.get("totp_secret"):
        if not otp:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="2FA code required"
            )
        
        totp = pyotp.TOTP(user["totp_secret"])
        if not totp.verify(otp):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid 2FA code"
            )
    
    # Update last login time
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE username = ?",
        (user["username"],)
    )
    conn.commit()
    conn.close()
    
    # Create access token
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
    """Generate and return 2FA secret (but don't enable it yet)"""
    if current_user.get("totp_secret"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA already enabled"
        )
    
    # Generate new secret but DON'T save it to database yet
    secret = pyotp.random_base32()
    
    # Return the secret to frontend
    return {
        "message": "2FA secret generated. Scan QR code and verify with OTP to enable.",
        "secret": secret,
        "username": current_user["username"]
    }



@app.get("/2fa/status")
async def get_2fa_status(current_user: dict = Depends(get_current_user)):
    """Get 2FA status for current user"""
    return {
        "has_2fa": bool(current_user.get("totp_secret")),
        "username": current_user["username"]
    }


@app.post("/verify_2fa")
async def verify_2fa(
    otp: str = Form(...),
    current_user: dict = Depends(get_current_user)
):
    """Verify OTP and enable 2FA"""
    # Get the secret from frontend (should be stored in session or passed)
    # Since we're not storing it in DB yet, the frontend needs to send it back
    # OR we can store it temporarily in session
    
    # For simplicity, let's assume frontend sends both secret and OTP
    # But actually, we need to store the secret temporarily
    
    # Better approach: Store secret in user's session/temp storage
    # Since we're using JWT, we need another way
    
    # Alternative: Frontend sends the secret along with OTP
    # Let's modify this endpoint to accept secret as well
    
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Need to implement proper 2FA verification flow"
    )
@app.post("/setup_2fa")
async def setup_2fa(
    secret: str = Form(...),
    otp: str = Form(...),
    current_user: dict = Depends(get_current_user)
):
    """Complete 2FA setup: verify OTP and save secret to database"""
    
    # Check if 2FA already enabled
    if current_user.get("totp_secret"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA already enabled"
        )
    
    # Verify OTP
    totp = pyotp.TOTP(secret)
    if not totp.verify(otp, valid_window=1):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid OTP code"
        )
    
    # Save secret to database (now we enable 2FA)
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE users SET totp_secret = ? WHERE username = ?",
        (secret, current_user["username"])
    )
    conn.commit()
    conn.close()
    
    return {"message": "2FA enabled successfully"}

    
    return {"message": "2FA verified successfully"}
@app.post("/disable_2fa")
async def disable_2fa(
    otp: str = Form(...),  # Require OTP to disable
    current_user: dict = Depends(get_current_user)
):
    """Disable 2FA for current user (requires OTP verification)"""
    if not current_user.get("totp_secret"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA is not enabled for this user"
        )
    
    # Verify OTP before disabling
    totp = pyotp.TOTP(current_user["totp_secret"])
    if not totp.verify(otp, valid_window=1):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid OTP code"
        )
    
    # Clear the TOTP secret from database
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE users SET totp_secret = NULL WHERE username = ?",
        (current_user["username"],)
    )
    conn.commit()
    conn.close()
    
    return {"message": "2FA disabled successfully"}


@app.get("/balance")
async def get_balance(current_user: dict = Depends(get_current_user)):
    """Get current user's balance"""
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
        new_balance = current_user["balance"] + amount
        
        # Update balance
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE users SET balance = ? WHERE username = ?",
            (new_balance, current_user["username"])
        )
        
        # Log transaction using same connection
        transaction = {
            "user_id": current_user["username"],
            "type": "deposit",
            "amount": amount,
            "description": f"Deposit: ${amount:.2f}",
            "balance_after": new_balance,
            "related_account": current_user["account_number"]
        }
        save_transaction(transaction, conn)

        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Deposit failed: {str(e)}"
        )
    finally:
        conn.close()

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

    if current_user["balance"] < amount:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Insufficient funds"
        )

    conn = get_db_connection()
    try:
        new_balance = current_user["balance"] - amount
        
        # Update balance
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE users SET balance = ? WHERE username = ?",
            (new_balance, current_user["username"])
        )
        
        # Log transaction using same connection
        transaction = {
            "user_id": current_user["username"],
            "type": "withdrawal",
            "amount": amount,
            "description": f"Withdrawal: ${amount:.2f}",
            "balance_after": new_balance,
            "related_account": current_user["account_number"]
        }
        save_transaction(transaction, conn)

        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Withdrawal failed: {str(e)}"
        )
    finally:
        conn.close()

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
    
    if current_user["balance"] < amount:
        raise HTTPException(status_code=400, detail="Insufficient funds")
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Find recipient
        cursor.execute(
            "SELECT * FROM users WHERE account_number = ?",
            (to_account_number,)
        )
        recipient_row = cursor.fetchone()
        if recipient_row is None:
            raise HTTPException(status_code=404, detail="Recipient account not found")
        recipient = dict(recipient_row)
        
        if current_user["account_number"] == to_account_number:
            raise HTTPException(status_code=400, detail="Cannot transfer to yourself")
        
        # Update balances
        sender_new_balance = current_user["balance"] - amount
        recipient_new_balance = recipient["balance"] + amount
        cursor.execute(
            "UPDATE users SET balance = ? WHERE username = ?",
            (sender_new_balance, current_user["username"])
        )
        cursor.execute(
            "UPDATE users SET balance = ? WHERE username = ?",
            (recipient_new_balance, recipient["username"])
        )
        
        # Log transactions using same connection
        sender_tx = {
            "user_id": current_user["username"],
            "type": "transfer_sent",
            "amount": amount,
            "description": f"Transfer to {to_account_number}",
            "balance_after": sender_new_balance,
            "related_account": to_account_number
        }
        save_transaction(sender_tx, conn)
        
        recipient_tx = {
            "user_id": recipient["username"],
            "type": "transfer_received",
            "amount": amount,
            "description": f"Transfer from {current_user['account_number']}",
            "balance_after": recipient_new_balance,
            "related_account": current_user["account_number"]
        }
        save_transaction(recipient_tx, conn)
        
        # Commit everything together
        conn.commit()
        
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Transfer failed: {str(e)}")
    finally:
        conn.close()
    
    return {
        "message": f"Transferred ${amount:.2f} to account {to_account_number}",
        "new_balance": sender_new_balance
    }


@app.get("/transactions")
async def get_transactions(current_user: dict = Depends(get_current_user)):
    """Get user's transaction history"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT * FROM transactions 
        WHERE user_id = ? 
        ORDER BY timestamp DESC
        LIMIT 100
    ''', (current_user["username"],))
    
    transactions = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    return {"transactions": transactions}


@app.get("/users/me")
async def read_users_me(current_user: dict = Depends(get_current_user)):
    """Get current user information"""
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
    """Get user information by account number"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT username, account_number, created_at FROM users WHERE REPLACE(account_number,'-','') = ?",
        (account_number.replace("-", ""),)
    )
    
    user_row = cursor.fetchone()
    conn.close()
    
    if user_row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    return dict(user_row)


# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        conn = get_db_connection()
        conn.execute("SELECT 1")
        conn.close()
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        return {"status": "unhealthy", "database": "disconnected", "error": str(e)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)