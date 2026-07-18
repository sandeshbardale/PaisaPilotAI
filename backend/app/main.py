import csv
import csv as csv_module
import io
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from contextlib import asynccontextmanager
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
import bcrypt as _bcrypt
from pydantic import BaseModel, EmailStr
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from .models import Base, ChatHistory, Transaction, UploadedStatement, User
from .khatabook_models import KbEntry, KbParty
from .analyzer import (
    build_full_analysis, parse_csv, parse_pdf,
    plan_trip, restaurant_budget_advisor,
)
from .routes import find_routes
from .travel_copilot import (
    get_nearby, get_all_nearby,
    smart_hotel_reco, plan_activities, ai_travel_guide,
    CATEGORY_FILTERS, CATEGORY_LABELS, INTEREST_ACTIVITY_MAP,
)

# ─── Config ──────────────────────────────────────────────────────────────────

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./paisapilot.db")
SECRET = os.getenv("JWT_SECRET", "change-me-before-production")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "10"))

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
)
SessionLocal = sessionmaker(bind=engine)
pwd_hash = lambda p: _bcrypt.hashpw(p.encode(), _bcrypt.gensalt()).decode()
pwd_verify = lambda p, h: _bcrypt.checkpw(p.encode(), h.encode())
bearer = HTTPBearer()

# ─── Lifespan (replaces deprecated @app.on_event) ────────────────────────────

@asynccontextmanager
async def lifespan(application: FastAPI):
    from .khatabook_models import KbParty, KbEntry  # noqa: F401 — registers tables
    Base.metadata.create_all(engine)
    yield


app = FastAPI(title="PaisaPilot AI API", version="2.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Helpers ─────────────────────────────────────────────────────────────────

def get_db():
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()


def make_token(user: User) -> str:
    return jwt.encode(
        {"sub": str(user.id), "exp": datetime.now(timezone.utc) + timedelta(days=7)},
        SECRET,
        algorithm="HS256",
    )


def current_user(
    c: HTTPAuthorizationCredentials = Depends(bearer),
    s: Session = Depends(get_db),
) -> User:
    try:
        uid = int(jwt.decode(c.credentials, SECRET, algorithms=["HS256"])["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(401, "Invalid or expired authentication token")
    user = s.get(User, uid)
    if not user:
        raise HTTPException(401, "User not found")
    return user


def user_response(u: User, token: str) -> dict:
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": u.id,
            "name": u.name,
            "email": u.email,
            "dark_mode": u.dark_mode,
            "created_at": u.created_at.isoformat(),
        },
    }


# ─── Pydantic Schemas ─────────────────────────────────────────────────────────

class RegisterIn(BaseModel):
    email: EmailStr
    name: str
    password: str


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TransactionIn(BaseModel):
    date: datetime
    description: str
    category: str = "Others"
    amount: float
    transaction_type: str
    balance: Optional[float] = None
    notes: Optional[str] = None


class TransactionUpdate(BaseModel):
    date: Optional[datetime] = None
    description: Optional[str] = None
    category: Optional[str] = None
    amount: Optional[float] = None
    transaction_type: Optional[str] = None
    balance: Optional[float] = None
    notes: Optional[str] = None


class ChatIn(BaseModel):
    question: str


class ProfileUpdate(BaseModel):
    name: str


class PasswordUpdate(BaseModel):
    current_password: str
    new_password: str


class ThemeUpdate(BaseModel):
    dark_mode: bool


class TripPlanIn(BaseModel):
    destination: str
    days: int = 5
    budget: float
    from_city: str = "delhi"


class RestaurantIn(BaseModel):
    budget: float
    menu_text: str


class GoalIn(BaseModel):
    name: str
    target_amount: float
    current_saved: float = 0.0
    monthly_saving: float = 0.0


class InvestIn(BaseModel):
    amount: float


class RouteIn(BaseModel):
    origin: str
    destination: str


# ─── NEW: Travel Copilot schemas ──────────────────────────────────────────────

class NearbyIn(BaseModel):
    lat: float
    lon: float
    category: str = "tourist_attractions"
    radius_m: int = 3000


class AllNearbyIn(BaseModel):
    lat: float
    lon: float
    radius_m: int = 2000


class HotelRecoIn(BaseModel):
    lat: float
    lon: float
    budget_per_night: float
    guests: int = 2
    nights: int = 2


class ActivityPlanIn(BaseModel):
    lat: float
    lon: float
    budget: float
    interest: str = "Family"
    days: int = 3


class TravelGuideIn(BaseModel):
    question: str
    lat: Optional[float] = None
    lon: Optional[float] = None
    destination: str = ""
    budget: float = 10000
    days: int = 3
    interest: str = "Family"


# ─── NEW: Khatabook schemas ───────────────────────────────────────────────────

class KbPartyIn(BaseModel):
    name: str
    phone: Optional[str] = None
    note: Optional[str] = None


class KbEntryIn(BaseModel):
    party_id: int
    entry_type: str          # "gave" | "got"
    amount: float
    description: Optional[str] = None
    date: Optional[datetime] = None


# ─── Health ───────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "version": "2.0.0"}


# ─── Auth ────────────────────────────────────────────────────────────────────

@app.post("/auth/register", status_code=201)
def register(data: RegisterIn, s: Session = Depends(get_db)):
    data.name = data.name.strip()
    if not data.name:
        raise HTTPException(422, "Name cannot be empty")
    if len(data.password) < 8:
        raise HTTPException(422, "Password must be at least 8 characters")
    if s.scalar(select(User).where(User.email == data.email)):
        raise HTTPException(409, "An account with this email already exists")
    try:
        u = User(email=data.email, name=data.name, password_hash=pwd_hash(data.password))
        s.add(u)
        s.commit()
        s.refresh(u)
        return user_response(u, make_token(u))
    except Exception:
        s.rollback()
        raise HTTPException(500, "Registration failed. Please try again.")


@app.post("/auth/login")
def login(data: LoginIn, s: Session = Depends(get_db)):
    u = s.scalar(select(User).where(User.email == data.email))
    if not u or not pwd_verify(data.password, u.password_hash):
        raise HTTPException(401, "Incorrect email or password")
    return user_response(u, make_token(u))


@app.get("/auth/me")
def me(user: User = Depends(current_user)):
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "dark_mode": user.dark_mode,
        "created_at": user.created_at.isoformat(),
    }


@app.patch("/auth/profile")
def update_profile(data: ProfileUpdate, user: User = Depends(current_user), s: Session = Depends(get_db)):
    name = data.name.strip()
    if not name:
        raise HTTPException(422, "Name cannot be empty")
    try:
        user.name = name
        s.commit()
        s.refresh(user)
        return {"id": user.id, "name": user.name, "email": user.email, "dark_mode": user.dark_mode}
    except Exception:
        s.rollback()
        raise HTTPException(500, "Failed to update profile")


@app.patch("/auth/password")
def change_password(data: PasswordUpdate, user: User = Depends(current_user), s: Session = Depends(get_db)):
    if not pwd_verify(data.current_password, user.password_hash):
        raise HTTPException(401, "Current password is incorrect")
    if len(data.new_password) < 8:
        raise HTTPException(422, "New password must be at least 8 characters")
    try:
        user.password_hash = pwd_hash(data.new_password)
        s.commit()
        return {"message": "Password updated successfully"}
    except Exception:
        s.rollback()
        raise HTTPException(500, "Failed to change password")


@app.patch("/auth/theme")
def update_theme(data: ThemeUpdate, user: User = Depends(current_user), s: Session = Depends(get_db)):
    try:
        user.dark_mode = data.dark_mode
        s.commit()
        return {"dark_mode": user.dark_mode}
    except Exception:
        s.rollback()
        raise HTTPException(500, "Failed to update theme")


@app.delete("/auth/account", status_code=204)
def delete_account(user: User = Depends(current_user), s: Session = Depends(get_db)):
    try:
        s.delete(user)
        s.commit()
    except Exception:
        s.rollback()
        raise HTTPException(500, "Failed to delete account")


# ─── Transactions ─────────────────────────────────────────────────────────────

def tx_to_dict(t: Transaction) -> dict:
    return {
        "id": t.id,
        "user_id": t.user_id,
        "date": t.date.isoformat(),
        "description": t.description,
        "category": t.category,
        "amount": t.amount,
        "transaction_type": t.transaction_type,
        "balance": t.balance,
        "source": t.source,
        "notes": t.notes,
    }


@app.get("/transactions")
def list_transactions(
    user: User = Depends(current_user),
    s: Session = Depends(get_db),
    search: Optional[str] = None,
    category: Optional[str] = None,
    transaction_type: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
):
    q = select(Transaction).where(Transaction.user_id == user.id).order_by(Transaction.date.desc())
    if search:
        q = q.where(Transaction.description.ilike(f"%{search}%"))
    if category:
        q = q.where(Transaction.category == category)
    if transaction_type:
        q = q.where(Transaction.transaction_type == transaction_type)

    all_rows = s.scalars(q).all()
    total = len(all_rows)
    start = (page - 1) * page_size
    rows = all_rows[start : start + page_size]
    return {"total": total, "page": page, "page_size": page_size, "items": [tx_to_dict(t) for t in rows]}


@app.post("/transactions", status_code=201)
def add_transaction(data: TransactionIn, user: User = Depends(current_user), s: Session = Depends(get_db)):
    if data.transaction_type not in ("income", "expense"):
        raise HTTPException(422, "transaction_type must be 'income' or 'expense'")
    if data.amount <= 0:
        raise HTTPException(422, "Amount must be greater than 0")
    try:
        t = Transaction(user_id=user.id, **data.model_dump())
        s.add(t)
        s.commit()
        s.refresh(t)
        return tx_to_dict(t)
    except Exception:
        s.rollback()
        raise HTTPException(500, "Failed to save transaction")


@app.patch("/transactions/{tx_id}")
def update_transaction(
    tx_id: int,
    data: TransactionUpdate,
    user: User = Depends(current_user),
    s: Session = Depends(get_db),
):
    t = s.get(Transaction, tx_id)
    if not t or t.user_id != user.id:
        raise HTTPException(404, "Transaction not found")
    try:
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(t, field, value)
        s.commit()
        s.refresh(t)
        return tx_to_dict(t)
    except Exception:
        s.rollback()
        raise HTTPException(500, "Failed to update transaction")


@app.delete("/transactions/{tx_id}", status_code=204)
def delete_transaction(tx_id: int, user: User = Depends(current_user), s: Session = Depends(get_db)):
    t = s.get(Transaction, tx_id)
    if not t or t.user_id != user.id:
        raise HTTPException(404, "Transaction not found")
    try:
        s.delete(t)
        s.commit()
    except Exception:
        s.rollback()
        raise HTTPException(500, "Failed to delete transaction")


# ─── Dashboard ────────────────────────────────────────────────────────────────

@app.get("/dashboard")
def dashboard(user: User = Depends(current_user), s: Session = Depends(get_db)):
    rows = s.scalars(select(Transaction).where(Transaction.user_id == user.id)).all()
    income = round(sum(t.amount for t in rows if t.transaction_type == "income"), 2)
    expense = round(sum(t.amount for t in rows if t.transaction_type == "expense"), 2)
    savings = round(income - expense, 2)

    categories: dict[str, float] = {}
    monthly: dict[str, dict[str, float]] = {}

    for t in rows:
        month_key = t.date.strftime("%b %Y")
        if month_key not in monthly:
            monthly[month_key] = {"income": 0.0, "expense": 0.0}
        monthly[month_key][t.transaction_type] = round(
            monthly[month_key][t.transaction_type] + t.amount, 2
        )
        if t.transaction_type == "expense":
            categories[t.category] = round(categories.get(t.category, 0) + t.amount, 2)

    recent = s.scalars(
        select(Transaction)
        .where(Transaction.user_id == user.id)
        .order_by(Transaction.date.desc())
        .limit(5)
    ).all()

    uploads = s.scalars(
        select(UploadedStatement)
        .where(UploadedStatement.user_id == user.id)
        .order_by(UploadedStatement.uploaded_at.desc())
        .limit(5)
    ).all()

    savings_rate = round(savings / income * 100, 1) if income > 0 else 0
    health_score = min(100, max(0, int(50 + savings_rate * 0.5)))

    return {
        "income": income,
        "expense": expense,
        "savings": savings,
        "savings_rate": savings_rate,
        "health_score": health_score,
        "categories": categories,
        "monthly_trend": monthly,
        "recent_transactions": [tx_to_dict(t) for t in recent],
        "recent_uploads": [
            {
                "id": u.id,
                "filename": u.filename,
                "transaction_count": u.transaction_count,
                "uploaded_at": u.uploaded_at.isoformat(),
                "status": u.status,
            }
            for u in uploads
        ],
        "insights": _generate_insights(rows),
    }


def _generate_insights(rows: list) -> list[str]:
    if not rows:
        return ["Upload a bank statement or add transactions to get personalised insights."]
    expenses = [t for t in rows if t.transaction_type == "expense"]
    if not expenses:
        return ["No expense data yet. Add some expenses to get insights."]
    by_cat: dict[str, float] = {}
    for t in expenses:
        by_cat[t.category] = by_cat.get(t.category, 0) + t.amount
    top = max(by_cat, key=by_cat.get)
    insights = [f"Your highest spending category is {top} at ₹{by_cat[top]:,.0f}."]
    total_expense = sum(by_cat.values())
    if total_expense > 0:
        pct = round(by_cat[top] / total_expense * 100)
        insights.append(f"{top} accounts for {pct}% of your total expenses.")
    return insights


# ─── Upload Statement ─────────────────────────────────────────────────────────

ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".csv"}


def _parse_csv(content: bytes) -> list[dict]:
    """Best-effort CSV parser. Tries to detect date, description, amount columns."""
    text = content.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    rows = list(reader)
    if not rows:
        return []

    # Normalise column names to lower-case
    normalised = [{k.lower().strip(): v.strip() for k, v in row.items()} for row in rows]

    date_keys = ["date", "transaction date", "txn date", "value date"]
    desc_keys = ["description", "narration", "particulars", "details", "remarks", "memo"]
    debit_keys = ["debit", "withdrawal", "dr", "debit amount", "withdrawal amount"]
    credit_keys = ["credit", "deposit", "cr", "credit amount", "deposit amount"]
    amount_keys = ["amount", "txn amount", "transaction amount"]

    def find_key(row: dict, candidates: list[str]) -> str | None:
        for k in candidates:
            if k in row:
                return k
        return None

    if not normalised:
        return []
    sample = normalised[0]
    date_k = find_key(sample, date_keys)
    desc_k = find_key(sample, desc_keys)
    debit_k = find_key(sample, debit_keys)
    credit_k = find_key(sample, credit_keys)
    amount_k = find_key(sample, amount_keys)

    transactions = []
    for row in normalised:
        try:
            raw_date = row.get(date_k or "", "")
            if not raw_date:
                continue
            for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%m/%d/%Y", "%d %b %Y", "%d-%b-%Y"):
                try:
                    parsed_date = datetime.strptime(raw_date, fmt)
                    break
                except ValueError:
                    continue
            else:
                parsed_date = datetime.utcnow()

            desc = row.get(desc_k or "", "Transaction")[:255] or "Transaction"
            amount = 0.0
            tx_type = "expense"

            if debit_k and credit_k:
                debit_val = row.get(debit_k, "").replace(",", "").strip()
                credit_val = row.get(credit_k, "").replace(",", "").strip()
                if credit_val and float(credit_val or 0) > 0:
                    amount = float(credit_val)
                    tx_type = "income"
                elif debit_val and float(debit_val or 0) > 0:
                    amount = float(debit_val)
                    tx_type = "expense"
            elif amount_k:
                raw = row.get(amount_k, "0").replace(",", "").strip()
                amount = abs(float(raw or 0))
                tx_type = "income" if float(raw or 0) > 0 else "expense"

            if amount <= 0:
                continue

            transactions.append({
                "date": parsed_date,
                "description": desc,
                "category": _guess_category(desc),
                "amount": round(amount, 2),
                "transaction_type": tx_type,
                "source": "upload",
            })
        except (ValueError, KeyError):
            continue
    return transactions


def _guess_category(desc: str) -> str:
    desc_lower = desc.lower()
    mapping = {
        "Food & Dining": ["swiggy", "zomato", "restaurant", "cafe", "food", "pizza", "burger", "hotel", "eat"],
        "Transport": ["uber", "ola", "cab", "taxi", "bus", "auto", "metro", "petrol", "fuel", "parking"],
        "Shopping": ["amazon", "flipkart", "myntra", "mall", "shop", "store", "market"],
        "Subscriptions": ["netflix", "spotify", "hotstar", "youtube", "subscription", "prime"],
        "Utilities": ["electricity", "water", "gas", "bill", "recharge", "mobile", "internet", "broadband"],
        "Health": ["hospital", "pharmacy", "doctor", "medical", "health", "clinic", "medicine"],
        "Income": ["salary", "credit", "neft", "imps", "rtgs", "refund", "cashback", "interest"],
        "Investments": ["mutual fund", "sip", "stocks", "zerodha", "groww", "investment"],
        "Education": ["school", "college", "course", "udemy", "books", "education"],
        "Entertainment": ["movie", "cinema", "pvr", "inox", "game", "fun"],
    }
    for category, keywords in mapping.items():
        if any(kw in desc_lower for kw in keywords):
            return category
    return "Others"


@app.post("/uploads/statement")
async def upload_statement(
    file: UploadFile = File(...),
    user: User = Depends(current_user),
    s: Session = Depends(get_db),
):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(415, f"Unsupported file type '{ext}'. Please upload PDF, CSV, or image.")

    data = await file.read()
    if not data:
        raise HTTPException(422, "File is empty")
    max_bytes = MAX_UPLOAD_MB * 1024 * 1024
    if len(data) > max_bytes:
        raise HTTPException(413, f"File exceeds {MAX_UPLOAD_MB} MB limit")

    tx_count = 0
    analysis = {}

    if ext == ".csv":
        try:
            transactions = parse_csv(data)
            for tx_data in transactions:
                s.add(Transaction(user_id=user.id, **tx_data))
            s.flush()
            tx_count = len(transactions)
            # Build AI analysis from extracted transactions
            if transactions:
                analysis = build_full_analysis(transactions)
        except Exception as e:
            s.rollback()
            raise HTTPException(422, f"Failed to parse CSV: {str(e)}")

    elif ext == ".pdf":
        try:
            transactions = parse_pdf(data)
            for tx_data in transactions:
                s.add(Transaction(user_id=user.id, **tx_data))
            s.flush()
            tx_count = len(transactions)
            if transactions:
                analysis = build_full_analysis(transactions)
        except Exception as e:
            s.rollback()
            raise HTTPException(422, f"Failed to parse PDF: {str(e)}")

    elif ext in {".png", ".jpg", ".jpeg"}:
        # OCR via pytesseract if available
        try:
            from PIL import Image
            import pytesseract
            img = Image.open(io.BytesIO(data))
            ocr_text = pytesseract.image_to_string(img)
            from .analyzer import _parse_text_lines
            transactions = _parse_text_lines(ocr_text)
            for tx_data in transactions:
                s.add(Transaction(user_id=user.id, **tx_data))
            s.flush()
            tx_count = len(transactions)
            if transactions:
                analysis = build_full_analysis(transactions)
        except ImportError:
            pass  # pytesseract/tesseract not installed — accept upload without parsing
        except Exception:
            pass

    stmt_record = UploadedStatement(
        user_id=user.id,
        filename=file.filename or "unknown",
        file_size=len(data),
        file_type=ext.lstrip("."),
        status="processed" if tx_count > 0 else "pending_ocr",
        transaction_count=tx_count,
    )
    s.add(stmt_record)
    try:
        s.commit()
    except Exception:
        s.rollback()
        raise HTTPException(500, "Failed to save upload record")

    return {
        "filename": file.filename,
        "file_size": len(data),
        "status": "processed" if tx_count > 0 else "pending_ocr",
        "transaction_count": tx_count,
        "analysis": analysis,
        "message": (
            f"Successfully extracted {tx_count} transactions with AI analysis."
            if tx_count > 0
            else "File uploaded. No transactions could be extracted automatically. Try a CSV export from your bank."
        ),
    }


# ─── Chat ────────────────────────────────────────────────────────────────────

@app.get("/chat/history")
def chat_history(user: User = Depends(current_user), s: Session = Depends(get_db)):
    rows = s.scalars(
        select(ChatHistory)
        .where(ChatHistory.user_id == user.id)
        .order_by(ChatHistory.created_at.asc())
    ).all()
    return [
        {
            "id": r.id,
            "question": r.question,
            "answer": r.answer,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]


@app.post("/chat")
def chat(data: ChatIn, user: User = Depends(current_user), s: Session = Depends(get_db)):
    if not data.question.strip():
        raise HTTPException(422, "Question cannot be empty")

    transactions = s.scalars(
        select(Transaction).where(Transaction.user_id == user.id)
    ).all()

    answer = _build_chat_answer(data.question, transactions)

    try:
        s.add(ChatHistory(user_id=user.id, question=data.question, answer=answer))
        s.commit()
    except Exception:
        s.rollback()

    return {
        "answer": answer,
        "grounded_transaction_count": len(transactions),
    }


def _build_chat_answer(question: str, transactions: list) -> str:
    """Rule-based AI that analyses real transaction data."""
    if OPENAI_API_KEY:
        try:
            return _openai_answer(question, transactions)
        except Exception:
            pass  # Fall back to rule-based

    q = question.lower()
    expenses = [t for t in transactions if t.transaction_type == "expense"]
    incomes = [t for t in transactions if t.transaction_type == "income"]

    if not transactions:
        return (
            "I don't have any transaction data to analyse yet. "
            "Upload a bank statement or add transactions manually, "
            "and I'll be able to give you personalised insights."
        )

    total_income = sum(t.amount for t in incomes)
    total_expense = sum(t.amount for t in expenses)
    savings = total_income - total_expense
    savings_rate = round(savings / total_income * 100, 1) if total_income > 0 else 0

    by_cat: dict[str, float] = {}
    for t in expenses:
        by_cat[t.category] = by_cat.get(t.category, 0) + t.amount

    top_cat = max(by_cat, key=by_cat.get) if by_cat else None

    if any(w in q for w in ["save", "saving", "budget"]):
        if savings >= 0:
            quality = "great" if savings_rate >= 20 else "a good start"
            return (
                f"You're saving ₹{savings:,.0f} ({savings_rate}% of income) — that's {quality}. "
                + (f"Your biggest expense is **{top_cat}** at ₹{by_cat[top_cat]:,.0f}. Reducing it by 10% could free up ₹{by_cat[top_cat]*0.1:,.0f} more per month." if top_cat else "")
                + " This is educational guidance, not financial advice."
            )
        return (
            f"Your expenses (₹{total_expense:,.0f}) exceed income (₹{total_income:,.0f}) by ₹{abs(savings):,.0f}. "
            "Focus on cutting your top spending category first. This is educational guidance."
        )

    if any(w in q for w in ["spend", "expense", "cost", "where", "leak"]):
        breakdown = ", ".join(f"**{k}** ₹{v:,.0f}" for k, v in sorted(by_cat.items(), key=lambda x: -x[1])[:5])
        return (
            f"Your top spending areas: {breakdown}. "
            + (f"**{top_cat}** is your largest category at {round(by_cat[top_cat]/total_expense*100)}% of total expenses." if top_cat else "")
            + " This is educational guidance, not financial advice."
        )

    if any(w in q for w in ["income", "earn", "salary"]):
        return (
            f"Your total recorded income is ₹{total_income:,.0f} across {len(incomes)} transaction(s). "
            f"After expenses of ₹{total_expense:,.0f}, you have ₹{savings:,.0f} remaining. "
            "This is educational guidance, not financial advice."
        )

    # Default summary
    return (
        f"Based on your {len(transactions)} transactions: "
        f"Income ₹{total_income:,.0f}, Expenses ₹{total_expense:,.0f}, Savings ₹{savings:,.0f} ({savings_rate}%). "
        + (f"Top spending: **{top_cat}** at ₹{by_cat[top_cat]:,.0f}." if top_cat else "")
        + " This is educational guidance, not financial advice."
    )


def _openai_answer(question: str, transactions: list) -> str:
    """Use OpenAI if API key is available."""
    import openai  # type: ignore

    client = openai.OpenAI(api_key=OPENAI_API_KEY)
    expenses = [t for t in transactions if t.transaction_type == "expense"]
    by_cat: dict[str, float] = {}
    for t in expenses:
        by_cat[t.category] = by_cat.get(t.category, 0) + t.amount

    context = f"User has {len(transactions)} transactions. "
    if by_cat:
        context += "Spending by category: " + ", ".join(f"{k}: ₹{v:,.0f}" for k, v in by_cat.items()) + ". "

    from ai.prompts import SYSTEM_PROMPT
    response = client.chat.completions.create(
        model="gpt-3.5-turbo",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT + "\n\nTransaction context: " + context},
            {"role": "user", "content": question},
        ],
        max_tokens=300,
        temperature=0.5,
    )
    return response.choices[0].message.content or "I could not generate an answer."


# ─── Reports ─────────────────────────────────────────────────────────────────

@app.post("/reports/monthly")
def monthly_report(user: User = Depends(current_user), s: Session = Depends(get_db)):
    d = dashboard(user, s)
    return {
        "title": "Monthly Financial Report",
        "financial_score": d["health_score"],
        "income": d["income"],
        "expense": d["expense"],
        "savings": d["savings"],
        "savings_rate": d["savings_rate"],
        "top_categories": d["categories"],
        "recommendation": (
            "Keep your essential spending stable and automate a portion of monthly savings."
            if d["savings"] >= 0
            else "Your expenses exceed income. Review your top spending categories immediately."
        ),
    }


# ─── AI Analysis endpoints ────────────────────────────────────────────────────

@app.get("/analysis/full")
def full_analysis(user: User = Depends(current_user), s: Session = Depends(get_db)):
    """Run complete AI analysis on all user transactions."""
    transactions = s.scalars(
        select(Transaction).where(Transaction.user_id == user.id)
    ).all()
    if not transactions:
        return {"message": "No transactions found. Upload a bank statement or add transactions to get analysis."}
    return build_full_analysis(transactions)


@app.post("/analysis/trip")
def trip_planner(data: TripPlanIn, user: User = Depends(current_user)):
    """AI trip budget planner."""
    if data.days < 1 or data.days > 30:
        raise HTTPException(422, "Days must be between 1 and 30")
    if data.budget <= 0:
        raise HTTPException(422, "Budget must be greater than 0")
    return plan_trip(data.destination, data.days, data.budget, data.from_city)


@app.post("/analysis/restaurant")
def restaurant_advisor(data: RestaurantIn, user: User = Depends(current_user)):
    """AI restaurant budget advisor."""
    if data.budget <= 0:
        raise HTTPException(422, "Budget must be greater than 0")
    if not data.menu_text.strip():
        raise HTTPException(422, "Menu text cannot be empty")
    return restaurant_budget_advisor(data.budget, data.menu_text)


@app.post("/analysis/invest")
def investment_advisor(data: InvestIn, user: User = Depends(current_user)):
    """AI investment advice for a given amount."""
    if data.amount <= 0:
        raise HTTPException(422, "Amount must be greater than 0")
    from .analyzer import _investment_advice
    return _investment_advice(data.amount, data.amount)


@app.post("/analysis/goal")
def goal_planner(data: GoalIn, user: User = Depends(current_user)):
    """Calculate how long to achieve a financial goal."""
    if data.target_amount <= 0:
        raise HTTPException(422, "Target amount must be greater than 0")
    remaining = max(data.target_amount - data.current_saved, 0)

    if data.monthly_saving <= 0:
        return {
            "goal": data.name,
            "target": data.target_amount,
            "current_saved": data.current_saved,
            "remaining": remaining,
            "message": "Set a monthly saving amount to calculate your goal timeline.",
        }

    months_needed = round(remaining / data.monthly_saving)
    years = months_needed // 12
    months = months_needed % 12

    timeline = f"{years} year(s) and {months} month(s)" if years > 0 else f"{months} month(s)"

    # Suggestions to reach faster
    faster_10 = round(remaining / (data.monthly_saving * 1.10))
    faster_20 = round(remaining / (data.monthly_saving * 1.20))

    return {
        "goal": data.name,
        "target": data.target_amount,
        "current_saved": data.current_saved,
        "remaining": remaining,
        "monthly_saving": data.monthly_saving,
        "months_needed": months_needed,
        "timeline": timeline,
        "completion_month": (
            datetime.utcnow().replace(day=1).isoformat()[:7]
        ),
        "faster_options": [
            {
                "increase_by": "10%",
                "new_monthly": round(data.monthly_saving * 1.10),
                "months_saved": months_needed - faster_10,
                "new_timeline_months": faster_10,
            },
            {
                "increase_by": "20%",
                "new_monthly": round(data.monthly_saving * 1.20),
                "months_saved": months_needed - faster_20,
                "new_timeline_months": faster_20,
            },
        ],
        "tips": [
            f"Save ₹{round(data.monthly_saving * 1.10):,}/month to reach your goal {months_needed - faster_10} months sooner.",
            "Invest your savings in a liquid mutual fund to earn 5-7% and reach your goal faster.",
            "Set up an automatic transfer on salary day to stay consistent.",
        ],
    }


# ─── Route Finder ─────────────────────────────────────────────────────────────

@app.post("/analysis/routes")
def route_finder(data: RouteIn, user: User = Depends(current_user)):
    """Find real road distance + all transport options between two places."""
    origin = data.origin.strip()
    destination = data.destination.strip()
    if not origin or not destination:
        raise HTTPException(422, "Both origin and destination are required")
    if origin.lower() == destination.lower():
        raise HTTPException(422, "Origin and destination cannot be the same")
    result = find_routes(origin, destination)
    if "error" in result:
        raise HTTPException(404, result["error"])
    return result


# ─── Menu OCR ─────────────────────────────────────────────────────────────────

@app.post("/analysis/menu-ocr")
async def menu_ocr(
    file: UploadFile = File(...),
    user: User = Depends(current_user),
):
    """Extract menu items from a photo using OCR."""
    ext = Path(file.filename or "").suffix.lower()
    if ext not in {".png", ".jpg", ".jpeg", ".webp"}:
        raise HTTPException(415, "Please upload a JPG or PNG image of the menu")

    data = await file.read()
    if not data:
        raise HTTPException(422, "Empty file")
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(413, "File exceeds 10 MB")

    # Try pytesseract OCR
    try:
        from PIL import Image, ImageFilter, ImageEnhance
        import pytesseract

        img = Image.open(io.BytesIO(data)).convert("RGB")

        # Pre-process: enhance contrast + sharpen for better OCR
        img = ImageEnhance.Contrast(img).enhance(1.8)
        img = ImageEnhance.Sharpness(img).enhance(2.0)
        img = img.filter(ImageFilter.SHARPEN)

        # Use PSM 6 = assume a uniform block of text
        ocr_text = pytesseract.image_to_string(img, config="--psm 6")

        from .analyzer import _parse_menu
        items = _parse_menu(ocr_text)

        return {
            "raw_text": ocr_text,
            "items_found": len(items),
            "menu_items": items,
            "message": (
                f"Extracted {len(items)} menu items from image."
                if items
                else "OCR completed but no price-labelled items found. Ensure the image is clear and prices are visible."
            ),
        }

    except ImportError:
        # pytesseract / tesseract not installed — return instructions
        return {
            "raw_text": "",
            "items_found": 0,
            "menu_items": [],
            "message": (
                "Tesseract OCR is not installed on the server. "
                "Please type the menu items manually in the text box below."
            ),
        }
    except Exception as e:
        raise HTTPException(422, f"OCR failed: {str(e)}")


# ═══════════════════════════════════════════════════════════════════════════════
# TRAVEL COPILOT ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@app.post("/travel/nearby")
def nearby_places(data: NearbyIn, user: User = Depends(current_user)):
    """Return real nearby places for a category using OpenStreetMap Overpass."""
    if not (-90 <= data.lat <= 90) or not (-180 <= data.lon <= 180):
        raise HTTPException(422, "Invalid coordinates")
    if data.radius_m < 100 or data.radius_m > 20000:
        raise HTTPException(422, "radius_m must be between 100 and 20000")
    result = get_nearby(data.lat, data.lon, data.category, data.radius_m)
    if "error" in result:
        raise HTTPException(422, result["error"])
    return result


@app.post("/travel/nearby/all")
def all_nearby_places(data: AllNearbyIn, user: User = Depends(current_user)):
    """Return tourist, hotels, restaurants, hospitals, ATMs and activities in one call."""
    if not (-90 <= data.lat <= 90) or not (-180 <= data.lon <= 180):
        raise HTTPException(422, "Invalid coordinates")
    return get_all_nearby(data.lat, data.lon, data.radius_m)


@app.post("/travel/hotels")
def hotel_recommendations(data: HotelRecoIn, user: User = Depends(current_user)):
    """Smart hotel recommendations based on budget + real OSM hotels."""
    if data.budget_per_night <= 0:
        raise HTTPException(422, "budget_per_night must be > 0")
    return smart_hotel_reco(data.lat, data.lon, data.budget_per_night, data.guests, data.nights)


@app.post("/travel/activities")
def activity_planner(data: ActivityPlanIn, user: User = Depends(current_user)):
    """Recommend activities based on interest, budget and real nearby venues."""
    if data.interest not in INTEREST_ACTIVITY_MAP:
        raise HTTPException(422, f"interest must be one of: {list(INTEREST_ACTIVITY_MAP.keys())}")
    return plan_activities(data.lat, data.lon, data.budget, data.interest, data.days)


@app.post("/travel/guide")
def travel_guide(data: TravelGuideIn, user: User = Depends(current_user)):
    """ChatGPT-like travel guide. Ask anything about travel."""
    if not data.question.strip():
        raise HTTPException(422, "Question cannot be empty")
    return ai_travel_guide(
        question=data.question,
        lat=data.lat,
        lon=data.lon,
        destination=data.destination,
        budget=data.budget,
        days=data.days,
        interest=data.interest,
    )


@app.get("/travel/categories")
def travel_categories(user: User = Depends(current_user)):
    """List all available nearby place categories."""
    from .travel_copilot import CATEGORY_ICONS
    return [
        {"id": k, "label": CATEGORY_LABELS[k], "icon": CATEGORY_ICONS[k]}
        for k in CATEGORY_LABELS
    ]


# ═══════════════════════════════════════════════════════════════════════════════
# KHATABOOK ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

def _party_dict(p: KbParty, balance: float) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "phone": p.phone,
        "note": p.note,
        "balance": round(balance, 2),
        "balance_label": (
            f"₹{abs(balance):,.0f} to receive" if balance > 0
            else f"₹{abs(balance):,.0f} to pay" if balance < 0
            else "Settled"
        ),
        "balance_type": "receivable" if balance > 0 else "payable" if balance < 0 else "settled",
        "created_at": p.created_at.isoformat(),
    }


def _entry_dict(e: KbEntry) -> dict:
    return {
        "id": e.id,
        "party_id": e.party_id,
        "entry_type": e.entry_type,
        "amount": e.amount,
        "description": e.description,
        "date": e.date.isoformat(),
        "settled": bool(e.settled),
    }


def _calc_balance(entries: list[KbEntry]) -> float:
    """
    Positive balance = others owe you (you gave, not settled).
    Negative balance = you owe others (you got, not settled).
    """
    total = 0.0
    for e in entries:
        if e.settled:
            continue
        if e.entry_type == "gave":
            total += e.amount
        else:
            total -= e.amount
    return total


# ── Parties ──────────────────────────────────────────────────────────────────

@app.get("/khatabook/parties")
def kb_list_parties(user: User = Depends(current_user), s: Session = Depends(get_db)):
    parties = s.scalars(
        select(KbParty).where(KbParty.user_id == user.id).order_by(KbParty.name)
    ).all()
    result = []
    for p in parties:
        entries = s.scalars(select(KbEntry).where(KbEntry.party_id == p.id)).all()
        balance = _calc_balance(list(entries))
        result.append(_party_dict(p, balance))
    # Summary
    total_receivable = sum(r["balance"] for r in result if r["balance"] > 0)
    total_payable = abs(sum(r["balance"] for r in result if r["balance"] < 0))
    return {
        "parties": result,
        "summary": {
            "total_parties": len(result),
            "total_receivable": round(total_receivable, 2),
            "total_payable": round(total_payable, 2),
            "net": round(total_receivable - total_payable, 2),
        },
    }


@app.post("/khatabook/parties", status_code=201)
def kb_add_party(data: KbPartyIn, user: User = Depends(current_user), s: Session = Depends(get_db)):
    name = data.name.strip()
    if not name:
        raise HTTPException(422, "Name cannot be empty")
    # Check duplicate
    existing = s.scalar(
        select(KbParty).where(KbParty.user_id == user.id, KbParty.name == name)
    )
    if existing:
        raise HTTPException(409, f"Party '{name}' already exists")
    try:
        p = KbParty(user_id=user.id, name=name, phone=data.phone, note=data.note)
        s.add(p)
        s.commit()
        s.refresh(p)
        return _party_dict(p, 0.0)
    except Exception:
        s.rollback()
        raise HTTPException(500, "Failed to add party")


@app.patch("/khatabook/parties/{party_id}")
def kb_update_party(
    party_id: int, data: KbPartyIn,
    user: User = Depends(current_user), s: Session = Depends(get_db)
):
    p = s.get(KbParty, party_id)
    if not p or p.user_id != user.id:
        raise HTTPException(404, "Party not found")
    try:
        if data.name.strip():
            p.name = data.name.strip()
        if data.phone is not None:
            p.phone = data.phone
        if data.note is not None:
            p.note = data.note
        s.commit()
        s.refresh(p)
        entries = s.scalars(select(KbEntry).where(KbEntry.party_id == p.id)).all()
        return _party_dict(p, _calc_balance(list(entries)))
    except Exception:
        s.rollback()
        raise HTTPException(500, "Failed to update party")


@app.delete("/khatabook/parties/{party_id}", status_code=204)
def kb_delete_party(party_id: int, user: User = Depends(current_user), s: Session = Depends(get_db)):
    p = s.get(KbParty, party_id)
    if not p or p.user_id != user.id:
        raise HTTPException(404, "Party not found")
    try:
        s.delete(p)
        s.commit()
    except Exception:
        s.rollback()
        raise HTTPException(500, "Failed to delete party")


# ── Entries ───────────────────────────────────────────────────────────────────

@app.get("/khatabook/parties/{party_id}/entries")
def kb_entries(party_id: int, user: User = Depends(current_user), s: Session = Depends(get_db)):
    p = s.get(KbParty, party_id)
    if not p or p.user_id != user.id:
        raise HTTPException(404, "Party not found")
    entries = s.scalars(
        select(KbEntry).where(KbEntry.party_id == party_id).order_by(KbEntry.date.desc())
    ).all()
    balance = _calc_balance(list(entries))
    return {
        "party": _party_dict(p, balance),
        "entries": [_entry_dict(e) for e in entries],
        "balance": round(balance, 2),
    }


@app.post("/khatabook/entries", status_code=201)
def kb_add_entry(data: KbEntryIn, user: User = Depends(current_user), s: Session = Depends(get_db)):
    if data.entry_type not in ("gave", "got"):
        raise HTTPException(422, "entry_type must be 'gave' or 'got'")
    if data.amount <= 0:
        raise HTTPException(422, "Amount must be > 0")
    p = s.get(KbParty, data.party_id)
    if not p or p.user_id != user.id:
        raise HTTPException(404, "Party not found")
    try:
        e = KbEntry(
            party_id=data.party_id,
            user_id=user.id,
            entry_type=data.entry_type,
            amount=data.amount,
            description=data.description,
            date=data.date or datetime.utcnow(),
        )
        s.add(e)
        s.commit()
        s.refresh(e)
        return _entry_dict(e)
    except Exception:
        s.rollback()
        raise HTTPException(500, "Failed to add entry")


@app.patch("/khatabook/entries/{entry_id}/settle", status_code=200)
def kb_settle_entry(entry_id: int, user: User = Depends(current_user), s: Session = Depends(get_db)):
    e = s.get(KbEntry, entry_id)
    if not e or e.user_id != user.id:
        raise HTTPException(404, "Entry not found")
    try:
        e.settled = 1
        s.commit()
        return _entry_dict(e)
    except Exception:
        s.rollback()
        raise HTTPException(500, "Failed to settle entry")


@app.delete("/khatabook/entries/{entry_id}", status_code=204)
def kb_delete_entry(entry_id: int, user: User = Depends(current_user), s: Session = Depends(get_db)):
    e = s.get(KbEntry, entry_id)
    if not e or e.user_id != user.id:
        raise HTTPException(404, "Entry not found")
    try:
        s.delete(e)
        s.commit()
    except Exception:
        s.rollback()
        raise HTTPException(500, "Failed to delete entry")


@app.patch("/khatabook/parties/{party_id}/settle-all", status_code=200)
def kb_settle_all(party_id: int, user: User = Depends(current_user), s: Session = Depends(get_db)):
    p = s.get(KbParty, party_id)
    if not p or p.user_id != user.id:
        raise HTTPException(404, "Party not found")
    try:
        entries = s.scalars(
            select(KbEntry).where(KbEntry.party_id == party_id, KbEntry.settled == 0)
        ).all()
        for e in entries:
            e.settled = 1
        s.commit()
        return {"settled_count": len(entries), "message": f"All {len(entries)} entries settled"}
    except Exception:
        s.rollback()
        raise HTTPException(500, "Failed to settle all entries")
