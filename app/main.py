from fastapi import FastAPI, Depends, HTTPException, status, Form
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from jose import JWTError, jwt
import hashlib
from passlib.context import CryptContext
from typing import Optional
import json
from datetime import datetime, timedelta
import uuid
import os
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from fastapi import Request
import sqlite3
DB_FILE = "simple_banking.db"
SECRET_KEY = "if_you_use_a_real_secret_key_your_app_will_be_more_secure"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

app = FastAPI()
templates = Jinja2Templates(directory="../templates")
app.mount("/static", StaticFiles(directory="../static"), name="static")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
def get_db_connection():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn
def hash_password(password: str) -> str:
    password_bytes = password.encode('utf-8')
    sha256_hash = hashlib.sha256(password_bytes).digest()
    return pwd_context.hash(sha256_hash)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    password_bytes = plain_password.encode('utf-8')
    sha256_hash = hashlib.sha256(password_bytes).digest()
    return pwd_context.verify(sha256_hash, hashed_password)

def verify_password_complexity(password: str) -> bool:
    if (len(password) < 8 or
        not any(c.islower() for c in password) or
        not any(c.isupper() for c in password) or
        not any(c.isdigit() for c in password) or
        not any(c in "!@#$%^&*()-_=+[]{}|;:'\",.<>?/`~" for c in password)):
        return False
    return True
def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Users table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS users (
        username TEXT PRIMARY KEY,
        hashed_password TEXT NOT NULL,
        balance REAL DEFAULT 0,
        account_number TEXT UNIQUE NOT NULL
    )
    ''')
    
    # Transactions table
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
        FOREIGN KEY(user_id) REFERENCES users(username)
    )
    ''')
    conn.commit()
    conn.close()
init_db()
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme)):
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
    
    users = load_users()
    user = users.get(username)
    if user is None:
        raise credentials_exception
    return user


def generate_transaction_id():
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    unique_id = str(uuid.uuid4())[:8]
    return f"tx_{timestamp}_{unique_id}"

def save_transaction(tx):
    conn = get_db_connection()
    cursor = conn.cursor()
    tx_id = generate_transaction_id()
    cursor.execute('''
        INSERT INTO transactions (id, user_id, type, amount, description, balance_after, related_account)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (
        tx_id,
        tx["user_id"],
        tx["type"],
        tx["amount"],
        tx.get("description"),
        tx.get("balance_after"),
        tx.get("to_account") or tx.get("from_account")
    ))
    conn.commit()
    conn.close()

def get_user_transactions(username):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT * FROM transactions WHERE user_id = ? ORDER BY timestamp DESC
    ''', (username,))
    transactions = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return transactions

def log_deposit(username, amount, balance_after):
    transaction = {
        "user_id": username,
        "type": "deposit",
        "amount": amount,
        "description": f"Deposit: ${amount:.2f}",
        "balance_after": balance_after
    }
    save_transaction(transaction)

def log_withdrawal(username, amount, balance_after):
    transaction = {
        "user_id": username,
        "type": "withdrawal",
        "amount": amount,
        "description": f"Withdrawal: ${amount:.2f}",
        "balance_after": balance_after
    }
    save_transaction(transaction)

def log_transfer_sender(from_user, amount, to_account, balance_after):
    transaction = {
        "user_id": from_user["username"],
        "type": "transfer_sent",
        "amount": amount,
        "description": f"Transfer to {to_account}",
        "to_account": to_account,
        "balance_after": balance_after
    }
    save_transaction(transaction)

def log_transfer_receiver(to_user, amount, from_account, balance_after):
    transaction = {
        "user_id": to_user["username"],
        "type": "transfer_received",
        "amount": amount,
        "description": f"Transfer from {from_account}",
        "from_account": from_account,
        "balance_after": balance_after
    }
    save_transaction(transaction)

def load_users():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users")
    users = {row["username"]: dict(row) for row in cursor.fetchall()}
    conn.close()
    return users

import sqlite3

def save_user(user: dict):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO users (username, hashed_password, balance, account_number)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(username) DO UPDATE SET
            hashed_password = excluded.hashed_password,
            balance = excluded.balance,
            account_number = excluded.account_number
    """, (
        user["username"],
        user["hashed_password"],
        user["balance"],
        user["account_number"]
    ))

    conn.commit()
    conn.close()
def authenticate_user(username: str, password: str):
    users = load_users()
    user = users.get(username)
    if not user:
        return False
    if not verify_password(password, user["hashed_password"]):
        return False
    return user

def deposit(username: str, amount: float):
    users = load_users()
    if username in users:
        users[username]["balance"] += amount
        save_user(users[username])
        log_deposit(username, amount, users[username]["balance"])
    else:
        raise HTTPException(status_code=404, detail="User not found")

def withdraw(username: str, amount: float):
    users = load_users()
    if username in users:
        if users[username]["balance"] >= amount:
            old_balance = users[username]["balance"]
            users[username]["balance"] -= amount
            save_user(users[username])
            log_withdrawal(username, amount, users[username]["balance"])
        else:
            raise HTTPException(status_code=400, detail="Insufficient funds")
    else:
        raise HTTPException(status_code=404, detail="User not found")

def check_balance(username: str) -> float:
    users = load_users()
    if username in users:
        return users[username]["balance"]
    else:
        raise HTTPException(status_code=404, detail="User not found")

def make_account_number(username: str) -> str:
    hash_object = hashlib.sha256(username.encode())
    hex_dig = hash_object.hexdigest()
    raw_number = hex_dig[:16].upper()
    account_number = '-'.join(raw_number[i:i+4] for i in range(0, 16, 4))
    return account_number
@app.post("/signup")
def signup(username: str = Form(...), password: str = Form(...)):
    users = load_users()
    if username in users:
        raise HTTPException(status_code=400, detail="Username already registered")
    if not verify_password_complexity(password):
        raise HTTPException(status_code=400, detail="Password does not meet complexity requirements")
    hashed_password = hash_password(password)
    new_user = {"username": username, "hashed_password": hashed_password, "balance": 0.0, "account_number": make_account_number(username)}
    save_user(new_user)
    return {"msg": "User created successfully"}

@app.post("/token")
def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    user = authenticate_user(form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user["username"]}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/balance")
def get_balance(current_user: dict = Depends(get_current_user)):
    return {"username": current_user["username"], "balance": current_user["balance"]}

@app.post("/deposit")
def make_deposit(amount: float = Form(...), current_user: dict = Depends(get_current_user)):
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    
    old_balance = current_user["balance"]
    deposit(current_user["username"], amount)
    updated_users = load_users()
    new_balance = updated_users[current_user["username"]]["balance"]
    
    return {"msg": f"Deposited {amount} successfully", "new_balance": new_balance}

@app.post("/withdraw")
def make_withdrawal(amount: float = Form(...), current_user: dict = Depends(get_current_user)):
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    
    old_balance = current_user["balance"]
    withdraw(current_user["username"], amount)
    updated_users = load_users()
    new_balance = updated_users[current_user["username"]]["balance"]
    
    return {"msg": f"Withdrew {amount} successfully", "new_balance": new_balance}

@app.post("/transfer")
def transfer_money(to_account_number: str = Form(...), amount: float = Form(...), current_user: dict = Depends(get_current_user)):
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    
    users = load_users()
    from_user = current_user
    to_user = None
    for user in users.values():
        if user["account_number"] == to_account_number:
            to_user = user
            break
    if to_user is None:
        raise HTTPException(status_code=404, detail="Recipient account not found")
    
    if from_user["balance"] < amount:
        raise HTTPException(status_code=400, detail="Insufficient funds")
    
    withdraw(from_user["username"], amount)
    deposit(to_user["username"], amount)

    updated_users = load_users()
    from_balance_after = updated_users[from_user["username"]]["balance"]
    to_balance_after = updated_users[to_user["username"]]["balance"]
    
    log_transfer_sender(from_user, amount, to_account_number, from_balance_after)
    log_transfer_receiver(to_user, amount, from_user["account_number"], to_balance_after)

    return {"msg": f"Transferred {amount} to account {to_account_number} successfully", "new_balance": from_balance_after}

@app.get("/users/me")
async def read_users_me(current_user: dict = Depends(get_current_user)):
    return current_user
    

@app.get("/users")
async def get_all_users(current_user: dict = Depends(get_current_user)):
    users = load_users()
    return [{"username": current_user["username"], "account_number": current_user["account_number"]} for user in users.values()]

@app.get("/transactions")
def get_transactions(current_user: dict = Depends(get_current_user)):
    transactions = get_user_transactions(current_user["username"])
    return {"transactions": transactions}
@app.get("/users/{account_number}")
async def get_user_by_account_number(account_number: str, current_user: dict = Depends(get_current_user)):
    users = load_users()
    normalized_target = account_number.replace('-', '').upper()
    for user in users.values():
        normalized_user_acc = user["account_number"].replace('-', '').upper()
        if normalized_user_acc == normalized_target:
            return {
                "username": user["username"],
                "account_number": user["account_number"]
            }
    
    raise HTTPException(status_code=404, detail="User not found")
@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    return templates.TemplateResponse("login.html", {"request": request})

@app.get("/signup", response_class=HTMLResponse)
async def signup_page(request: Request):
    return templates.TemplateResponse("signup.html", {"request": request})

