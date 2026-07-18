"""
PaisaPilot AI Analysis Engine
Handles: PDF/CSV parsing, transaction extraction, categorization,
         spending insights, savings plans, investment advice,
         trip budgeting, restaurant assistant, goal planning.
"""
from __future__ import annotations

import io
import re
from datetime import datetime
from typing import Optional


# ─── Category keyword map ────────────────────────────────────────────────────

CATEGORY_MAP: dict[str, list[str]] = {
    "Food & Dining": [
        "swiggy", "zomato", "restaurant", "cafe", "food", "pizza", "burger",
        "hotel", "eat", "dining", "biryani", "dhaba", "canteen", "mess",
        "bakery", "dominos", "kfc", "mcdonald", "subway", "barbeque",
    ],
    "Transport": [
        "uber", "ola", "cab", "taxi", "bus", "auto", "metro", "petrol",
        "fuel", "parking", "rapido", "redbus", "irctc", "railway", "flight",
        "indigo", "air india", "spicejet", "toll",
    ],
    "Shopping": [
        "amazon", "flipkart", "myntra", "mall", "shop", "store", "market",
        "ajio", "meesho", "reliance", "big bazaar", "dmart", "supermarket",
        "grofers", "blinkit", "zepto", "instamart",
    ],
    "Subscriptions": [
        "netflix", "spotify", "hotstar", "youtube", "subscription", "prime",
        "disney", "zee5", "sonyliv", "apple", "microsoft", "adobe",
        "linkedin", "coursera",
    ],
    "Utilities": [
        "electricity", "water", "gas", "bill", "recharge", "mobile",
        "internet", "broadband", "jio", "airtel", "vi ", "bsnl", "tata sky",
        "tataplay", "d2h", "postpaid", "prepaid",
    ],
    "Health": [
        "hospital", "pharmacy", "doctor", "medical", "health", "clinic",
        "medicine", "apollo", "fortis", "max hospital", "labs", "diagnostic",
        "netmeds", "1mg", "pharmeasy",
    ],
    "Income": [
        "salary", "neft", "imps", "rtgs", "refund", "cashback", "interest",
        "dividend", "credit", "incentive", "bonus", "freelance", "payment rcvd",
    ],
    "Investments": [
        "mutual fund", "sip", "stocks", "zerodha", "groww", "investment",
        "ppf", "nps", "fd", "fixed deposit", "gold", "coin", "kuvera",
        "etf", "ipo",
    ],
    "Education": [
        "school", "college", "course", "udemy", "books", "education",
        "fees", "tuition", "byju", "unacademy", "vedantu",
    ],
    "Entertainment": [
        "movie", "cinema", "pvr", "inox", "game", "fun", "bookmyshow",
        "concert", "event", "amusement",
    ],
    "Healthcare": [
        "gym", "fitness", "yoga", "cult.fit", "healthify", "protein",
        "supplement", "insurance",
    ],
}


def guess_category(desc: str) -> str:
    d = desc.lower()
    for cat, kws in CATEGORY_MAP.items():
        if any(kw in d for kw in kws):
            return cat
    return "Others"


def guess_type(desc: str, amount_str: str = "") -> str:
    d = desc.lower()
    income_kws = ["salary", "neft cr", "imps cr", "rtgs cr", "credit", "refund",
                  "cashback", "interest", "dividend", "incentive", "bonus",
                  "received", "rcvd", "deposit"]
    if any(kw in d for kw in income_kws):
        return "income"
    return "expense"


# ─── PDF Parser ───────────────────────────────────────────────────────────────

def parse_pdf(content: bytes) -> list[dict]:
    """Extract transactions from a bank statement PDF using pdfplumber."""
    try:
        import pdfplumber
    except ImportError:
        return []

    transactions: list[dict] = []

    with pdfplumber.open(io.BytesIO(content)) as pdf:
        full_text = ""
        all_table_rows: list[list] = []

        for page in pdf.pages:
            # Try table extraction first (most bank PDFs have tables)
            tables = page.extract_tables()
            for table in tables:
                for row in table:
                    if row:
                        all_table_rows.append([str(c or "").strip() for c in row])

            # Also grab raw text for line-by-line parsing
            text = page.extract_text() or ""
            full_text += text + "\n"

    # Try structured table parsing
    if all_table_rows:
        parsed = _parse_table_rows(all_table_rows)
        if parsed:
            return parsed

    # Fallback: line-by-line regex parsing
    return _parse_text_lines(full_text)


def _parse_table_rows(rows: list[list]) -> list[dict]:
    """Parse transactions from table rows extracted by pdfplumber."""
    if not rows:
        return []

    # Find header row
    header_idx = -1
    header = []
    date_col = desc_col = debit_col = credit_col = amount_col = bal_col = -1

    for i, row in enumerate(rows):
        row_lower = [c.lower() for c in row]
        has_date = any("date" in c for c in row_lower)
        has_desc = any(k in c for c in row_lower for k in ["desc", "narr", "partic", "detail", "remark"])
        if has_date and has_desc:
            header_idx = i
            header = row_lower
            break

    if header_idx == -1:
        return []

    for i, h in enumerate(header):
        if "date" in h and date_col == -1:
            date_col = i
        if any(k in h for k in ["desc", "narr", "partic", "detail", "remark", "memo"]) and desc_col == -1:
            desc_col = i
        if any(k in h for k in ["debit", "withdrawal", "dr"]) and debit_col == -1:
            debit_col = i
        if any(k in h for k in ["credit", "deposit", "cr"]) and credit_col == -1:
            credit_col = i
        if any(k in h for k in ["amount", "txn amt"]) and amount_col == -1:
            amount_col = i
        if any(k in h for k in ["balance", "bal"]) and bal_col == -1:
            bal_col = i

    if date_col == -1 or desc_col == -1:
        return []

    transactions = []
    for row in rows[header_idx + 1:]:
        if len(row) <= max(date_col, desc_col):
            continue
        try:
            raw_date = row[date_col].strip()
            desc = row[desc_col].strip()[:255]
            if not raw_date or not desc:
                continue

            parsed_date = _parse_date(raw_date)
            if not parsed_date:
                continue

            amount = 0.0
            tx_type = "expense"

            if debit_col != -1 and credit_col != -1:
                debit_val = _parse_amount(row[debit_col] if debit_col < len(row) else "")
                credit_val = _parse_amount(row[credit_col] if credit_col < len(row) else "")
                if credit_val > 0:
                    amount = credit_val
                    tx_type = "income"
                elif debit_val > 0:
                    amount = debit_val
                    tx_type = "expense"
            elif amount_col != -1:
                raw_amt = row[amount_col] if amount_col < len(row) else "0"
                amount = abs(_parse_amount(raw_amt))
                tx_type = guess_type(desc)

            if amount <= 0:
                continue

            balance = None
            if bal_col != -1 and bal_col < len(row):
                balance = _parse_amount(row[bal_col]) or None

            transactions.append({
                "date": parsed_date,
                "description": desc,
                "category": guess_category(desc),
                "amount": round(amount, 2),
                "transaction_type": tx_type,
                "balance": balance,
                "source": "upload",
            })
        except Exception:
            continue

    return transactions


def _parse_text_lines(text: str) -> list[dict]:
    """Regex-based line parser for unstructured bank statement text."""
    transactions = []
    # Common date patterns: dd/mm/yyyy, dd-mm-yyyy, dd Mon yyyy, yyyy-mm-dd
    date_pattern = re.compile(
        r"\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{2}[\/\-]\d{2}|"
        r"\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})\b",
        re.IGNORECASE,
    )
    # Amount pattern: optional ₹/Rs, digits with optional commas/decimal
    amount_pattern = re.compile(r"(?:₹|Rs\.?\s*)?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)", re.IGNORECASE)

    for line in text.splitlines():
        line = line.strip()
        if len(line) < 10:
            continue

        date_match = date_pattern.search(line)
        if not date_match:
            continue

        parsed_date = _parse_date(date_match.group())
        if not parsed_date:
            continue

        amounts = amount_pattern.findall(line)
        if not amounts:
            continue

        # Take the last amount that looks like a transaction value
        raw_amounts = [float(a.replace(",", "")) for a in amounts if float(a.replace(",", "")) > 0]
        if not raw_amounts:
            continue

        # Heuristic: use the largest amount ≥ 1
        amount = max(raw_amounts)
        if amount < 1:
            continue

        # Description: text between date and amounts (strip date)
        desc_raw = line[date_match.end():].strip()
        desc_raw = amount_pattern.sub("", desc_raw).strip()
        desc_raw = re.sub(r"\s{2,}", " ", desc_raw)[:200]
        if not desc_raw:
            desc_raw = line[:60]

        tx_type = guess_type(line)
        transactions.append({
            "date": parsed_date,
            "description": desc_raw or "Transaction",
            "category": guess_category(desc_raw or line),
            "amount": round(amount, 2),
            "transaction_type": tx_type,
            "balance": None,
            "source": "upload",
        })

    return transactions


def _parse_date(raw: str) -> Optional[datetime]:
    raw = raw.strip()
    formats = [
        "%d/%m/%Y", "%d/%m/%y", "%Y-%m-%d", "%d-%m-%Y", "%d-%m-%y",
        "%m/%d/%Y", "%d %b %Y", "%d %B %Y", "%d-%b-%Y", "%d-%B-%Y",
        "%d %b %y", "%d-%b-%y",
    ]
    for fmt in formats:
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            continue
    return None


def _parse_amount(raw: str) -> float:
    raw = re.sub(r"[₹Rs\s,]", "", raw or "", flags=re.IGNORECASE).strip()
    try:
        return float(raw)
    except ValueError:
        return 0.0


# ─── CSV Parser ───────────────────────────────────────────────────────────────

def parse_csv(content: bytes) -> list[dict]:
    import csv

    text = content.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    rows = list(reader)
    if not rows:
        return []

    normalised = [{k.lower().strip(): str(v or "").strip() for k, v in row.items()} for row in rows]

    date_keys = ["date", "transaction date", "txn date", "value date", "posting date"]
    desc_keys = ["description", "narration", "particulars", "details", "remarks", "memo", "transaction details"]
    debit_keys = ["debit", "withdrawal", "dr", "debit amount", "withdrawal amount", "debit amt"]
    credit_keys = ["credit", "deposit", "cr", "credit amount", "deposit amount", "credit amt"]
    amount_keys = ["amount", "txn amount", "transaction amount", "net amount"]

    def find_key(row: dict, candidates: list[str]) -> Optional[str]:
        for k in candidates:
            if k in row:
                return k
        return None

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
            parsed_date = _parse_date(raw_date)
            if not parsed_date:
                continue

            desc = row.get(desc_k or "", "Transaction")[:255] or "Transaction"
            amount = 0.0
            tx_type = "expense"

            if debit_k and credit_k:
                debit_val = _parse_amount(row.get(debit_k, ""))
                credit_val = _parse_amount(row.get(credit_k, ""))
                if credit_val > 0:
                    amount = credit_val
                    tx_type = "income"
                elif debit_val > 0:
                    amount = debit_val
                    tx_type = "expense"
            elif amount_k:
                raw = row.get(amount_k, "0")
                val = _parse_amount(raw)
                amount = abs(val)
                tx_type = "income" if val > 0 else "expense"

            if amount <= 0:
                continue

            transactions.append({
                "date": parsed_date,
                "description": desc,
                "category": guess_category(desc),
                "amount": round(amount, 2),
                "transaction_type": tx_type,
                "source": "upload",
            })
        except Exception:
            continue

    return transactions


# ─── AI Analysis Engine ───────────────────────────────────────────────────────

def build_full_analysis(transactions: list) -> dict:
    """
    Given a list of Transaction ORM objects or dicts, build a complete
    AI financial analysis report.
    """
    if not transactions:
        return {"error": "No transactions to analyse"}

    # Normalise to dicts
    def to_dict(t) -> dict:
        if isinstance(t, dict):
            return t
        return {
            "date": t.date.isoformat() if hasattr(t.date, "isoformat") else str(t.date),
            "description": t.description,
            "category": t.category,
            "amount": t.amount,
            "transaction_type": t.transaction_type,
        }

    txs = [to_dict(t) for t in transactions]
    income_txs = [t for t in txs if t["transaction_type"] == "income"]
    expense_txs = [t for t in txs if t["transaction_type"] == "expense"]

    total_income = round(sum(t["amount"] for t in income_txs), 2)
    total_expense = round(sum(t["amount"] for t in expense_txs), 2)
    net_savings = round(total_income - total_expense, 2)
    savings_rate = round(net_savings / total_income * 100, 1) if total_income > 0 else 0.0

    # Category breakdown
    by_cat: dict[str, float] = {}
    for t in expense_txs:
        by_cat[t["category"]] = round(by_cat.get(t["category"], 0) + t["amount"], 2)

    sorted_cats = sorted(by_cat.items(), key=lambda x: -x[1])
    top_cat = sorted_cats[0][0] if sorted_cats else None

    # Monthly breakdown
    monthly: dict[str, dict] = {}
    for t in txs:
        try:
            d = datetime.fromisoformat(t["date"]) if isinstance(t["date"], str) else t["date"]
            key = d.strftime("%b %Y")
        except Exception:
            key = "Unknown"
        if key not in monthly:
            monthly[key] = {"income": 0.0, "expense": 0.0}
        monthly[key][t["transaction_type"]] = round(monthly[key][t["transaction_type"]] + t["amount"], 2)

    # Subscription detection
    subscriptions = [t for t in expense_txs if t["category"] == "Subscriptions"]
    sub_total = round(sum(t["amount"] for t in subscriptions), 2)

    return {
        "summary": {
            "total_income": total_income,
            "total_expense": total_expense,
            "net_savings": net_savings,
            "savings_rate": savings_rate,
            "transaction_count": len(txs),
            "income_count": len(income_txs),
            "expense_count": len(expense_txs),
        },
        "category_breakdown": dict(sorted_cats),
        "monthly_trend": monthly,
        "spending_insights": _spending_insights(by_cat, total_income, total_expense, net_savings, savings_rate, sub_total, subscriptions),
        "savings_plan": _savings_plan(total_income, total_expense, net_savings, savings_rate, by_cat),
        "investment_advice": _investment_advice(net_savings, total_income),
        "subscription_analysis": {
            "detected": [t["description"] for t in subscriptions],
            "total_monthly": sub_total,
            "potential_annual_saving": round(sub_total * 12, 2),
        },
        "health_score": _health_score(savings_rate, by_cat, total_income, total_expense),
    }


def _spending_insights(by_cat, total_income, total_expense, savings, savings_rate, sub_total, subscriptions) -> list[str]:
    insights = []

    if not by_cat:
        return ["No expense data found in the statement."]

    total = total_expense or 1
    sorted_cats = sorted(by_cat.items(), key=lambda x: -x[1])

    # Top category
    if sorted_cats:
        cat, amt = sorted_cats[0]
        pct = round(amt / total * 100)
        insights.append(f"You spent the most on **{cat}** — ₹{amt:,.0f} ({pct}% of total expenses).")
        if total_income > 0:
            inc_pct = round(amt / total_income * 100)
            insights.append(f"**{cat}** spending is {inc_pct}% of your income. {'Consider reducing this.' if inc_pct > 30 else 'This is within normal range.'}")

    # Savings insight
    if savings_rate >= 30:
        insights.append(f"Excellent saving rate of **{savings_rate}%**! You're saving ₹{savings:,.0f} overall.")
    elif savings_rate >= 15:
        insights.append(f"Good saving rate of **{savings_rate}%**. Try to push it to 30% for faster goal achievement.")
    elif savings_rate > 0:
        insights.append(f"Your saving rate is only **{savings_rate}%**. Aim for at least 20% to build financial security.")
    else:
        insights.append(f"⚠️ Your expenses exceed income by ₹{abs(savings):,.0f}. Immediate budget review needed.")

    # Food delivery
    food_amt = by_cat.get("Food & Dining", 0)
    if food_amt > 0 and total_income > 0:
        food_pct = round(food_amt / total_income * 100)
        if food_pct > 20:
            save_20 = round(food_amt * 0.20)
            insights.append(f"Food spending is {food_pct}% of income. Reducing food delivery by 20% could save ₹{save_20:,.0f}/month.")

    # Transport
    transport_amt = by_cat.get("Transport", 0)
    if transport_amt > 0:
        save_transport = round(transport_amt * 0.25)
        insights.append(f"Using public transport twice a week could save approximately ₹{save_transport:,.0f} monthly on transport.")

    # Subscriptions
    if sub_total > 0:
        insights.append(f"You have {len(subscriptions)} subscription(s) totalling ₹{sub_total:,.0f}/month (₹{sub_total * 12:,.0f}/year). Review unused ones.")

    # Shopping
    shopping_amt = by_cat.get("Shopping", 0)
    if shopping_amt > 0 and total_income > 0 and shopping_amt / total_income > 0.15:
        insights.append(f"Shopping is ₹{shopping_amt:,.0f} ({round(shopping_amt/total_income*100)}% of income). A 30-day wish-list rule can reduce impulse buying.")

    return insights


def _savings_plan(total_income, total_expense, net_savings, savings_rate, by_cat) -> dict:
    if total_income <= 0:
        return {"message": "Add income transactions to get a personalised savings plan."}

    # 50/30/20 rule targets
    needs_budget = round(total_income * 0.50)
    wants_budget = round(total_income * 0.30)
    savings_target = round(total_income * 0.20)

    current_needs = sum(v for k, v in by_cat.items()
                        if k in ("Utilities", "Health", "Healthcare", "Education", "Transport"))
    current_wants = sum(v for k, v in by_cat.items()
                        if k in ("Food & Dining", "Shopping", "Entertainment", "Subscriptions"))

    emergency_fund_target = round(total_expense * 6)
    monthly_emergency = round(emergency_fund_target / 12)

    reductions = []
    for cat, amt in sorted(by_cat.items(), key=lambda x: -x[1])[:3]:
        target_cut = round(amt * 0.15)
        reductions.append({"category": cat, "current": amt, "suggested_cut": target_cut, "potential_saving": target_cut})

    total_potential = sum(r["potential_saving"] for r in reductions)

    return {
        "current_savings": net_savings,
        "savings_rate": savings_rate,
        "target_savings": savings_target,
        "gap": round(savings_target - net_savings, 2),
        "emergency_fund_target": emergency_fund_target,
        "monthly_emergency_contribution": monthly_emergency,
        "annual_projection": round(net_savings * 12, 2),
        "annual_target": round(savings_target * 12, 2),
        "budget_rule_50_30_20": {
            "needs_budget": needs_budget,
            "wants_budget": wants_budget,
            "savings_budget": savings_target,
            "current_needs": current_needs,
            "current_wants": current_wants,
        },
        "reduction_opportunities": reductions,
        "potential_additional_savings": total_potential,
        "tips": [
            "Automate savings on salary day — pay yourself first.",
            "Use the 50/30/20 rule: 50% needs, 30% wants, 20% savings.",
            f"Cutting top 3 categories by 15% saves ₹{total_potential:,.0f}/month.",
            "Build a 6-month emergency fund before investing.",
            "Review and cancel unused subscriptions every quarter.",
        ],
    }


def _investment_advice(net_savings: float, total_income: float) -> dict:
    investable = max(round(net_savings * 0.6), 0)

    suggestions = []

    if investable <= 0:
        return {
            "investable_amount": 0,
            "message": "Focus on reducing expenses and building savings before investing.",
            "suggestions": [],
        }

    if investable < 2000:
        suggestions = [
            {"option": "Recurring Deposit (RD)", "allocation_pct": 60, "amount": round(investable * 0.60),
             "expected_return": "6-7% p.a.", "risk": "Very Low", "duration": "1-3 years",
             "description": "Safe, bank-backed instrument. Good for short-term goals."},
            {"option": "Digital Gold", "allocation_pct": 40, "amount": round(investable * 0.40),
             "expected_return": "8-12% long-term", "risk": "Low-Medium", "duration": "3+ years",
             "description": "Buy 24K gold digitally in small amounts. Good hedge against inflation."},
        ]
    elif investable < 10000:
        suggestions = [
            {"option": "SIP – Index Fund (Nifty 50)", "allocation_pct": 40, "amount": round(investable * 0.40),
             "expected_return": "10-12% p.a.", "risk": "Medium", "duration": "5+ years",
             "description": "Low-cost index fund tracking top 50 companies. Best long-term wealth creator."},
            {"option": "Liquid Mutual Fund", "allocation_pct": 30, "amount": round(investable * 0.30),
             "expected_return": "5-7% p.a.", "risk": "Very Low", "duration": "Anytime",
             "description": "Better than savings account. Instant redemption. Park emergency fund here."},
            {"option": "Digital Gold / Gold ETF", "allocation_pct": 20, "amount": round(investable * 0.20),
             "expected_return": "8-10% long-term", "risk": "Low", "duration": "3+ years",
             "description": "Portfolio diversification and inflation hedge."},
            {"option": "Fixed Deposit", "allocation_pct": 10, "amount": round(investable * 0.10),
             "expected_return": "6.5-7.5% p.a.", "risk": "Very Low", "duration": "1-5 years",
             "description": "Safe, guaranteed returns. Good for capital preservation."},
        ]
    else:
        suggestions = [
            {"option": "SIP – Large Cap / Index Fund", "allocation_pct": 35, "amount": round(investable * 0.35),
             "expected_return": "10-13% p.a.", "risk": "Medium", "duration": "7+ years",
             "description": "Core portfolio holding. Broad market exposure with low cost."},
            {"option": "SIP – Mid Cap Fund", "allocation_pct": 20, "amount": round(investable * 0.20),
             "expected_return": "13-16% p.a.", "risk": "Medium-High", "duration": "7+ years",
             "description": "Higher growth potential. Suitable for investors with 7+ year horizon."},
            {"option": "PPF (Public Provident Fund)", "allocation_pct": 20, "amount": round(investable * 0.20),
             "expected_return": "7.1% p.a. (tax-free)", "risk": "Very Low", "duration": "15 years",
             "description": "Tax-free returns, government-backed. Great for retirement corpus."},
            {"option": "Government Bonds / SGBs", "allocation_pct": 15, "amount": round(investable * 0.15),
             "expected_return": "7-8% + gold appreciation", "risk": "Low", "duration": "5-8 years",
             "description": "Sovereign Gold Bonds — earn interest + gold price gain. Zero risk."},
            {"option": "Liquid / Emergency Fund", "allocation_pct": 10, "amount": round(investable * 0.10),
             "expected_return": "5-7% p.a.", "risk": "Very Low", "duration": "Flexible",
             "description": "Keep 3-6 months expenses in a liquid fund for emergencies."},
        ]

    # Project wealth at 12% CAGR over 10 years
    projected_10y = round(investable * ((1.01) ** 120 - 1) / 0.01)  # monthly SIP formula approx

    return {
        "investable_amount": investable,
        "suggestions": suggestions,
        "projected_10_year_wealth": projected_10y,
        "disclaimer": "These are educational suggestions only, not regulated financial advice. Consult a SEBI-registered advisor before investing.",
    }


def _health_score(savings_rate: float, by_cat: dict, income: float, expense: float) -> dict:
    score = 50
    breakdown = {}

    # Savings rate (max 25 pts)
    if savings_rate >= 30:
        s = 25
    elif savings_rate >= 20:
        s = 20
    elif savings_rate >= 10:
        s = 12
    elif savings_rate > 0:
        s = 5
    else:
        s = 0
    score += s
    breakdown["savings_rate"] = {"score": s, "max": 25, "label": f"{savings_rate}% savings rate"}

    # Expense diversity (max 10 pts) — penalise if one category > 50% of spending
    top_share = max(by_cat.values()) / expense if expense > 0 and by_cat else 0
    d = 10 if top_share < 0.4 else 5 if top_share < 0.6 else 0
    score += d
    breakdown["expense_diversity"] = {"score": d, "max": 10, "label": f"Top category is {round(top_share*100)}% of expenses"}

    # Has investments (max 10 pts)
    inv = by_cat.get("Investments", 0)
    i = 10 if inv > 0 else 0
    score += i
    breakdown["investments"] = {"score": i, "max": 10, "label": "Has investment transactions" if inv > 0 else "No investments found"}

    # Low subscriptions (max 5 pts)
    subs = by_cat.get("Subscriptions", 0)
    sub_pts = 5 if income == 0 or subs / income < 0.05 else 2 if subs / income < 0.10 else 0
    score += sub_pts
    breakdown["subscriptions"] = {"score": sub_pts, "max": 5, "label": f"Subscriptions: ₹{subs:,.0f}"}

    score = min(100, max(0, score))
    rating = "Excellent" if score >= 80 else "Good" if score >= 60 else "Fair" if score >= 40 else "Needs Attention"

    return {"score": score, "rating": rating, "breakdown": breakdown}


# ─── Trip Planner ─────────────────────────────────────────────────────────────

TRIP_DATA: dict[str, dict] = {
    "goa": {
        "flight_from_delhi": 4500, "flight_from_mumbai": 2200, "flight_from_bangalore": 3000,
        "train_from_delhi": 1800, "train_from_mumbai": 900,
        "hotel_budget": 1200, "hotel_mid": 2500, "hotel_luxury": 6000,
        "food_per_day": 800, "local_transport_per_day": 400,
        "activities": ["Calangute Beach", "Fort Aguada", "Dudhsagar Falls", "Old Goa Churches", "Anjuna Flea Market"],
        "best_season": "November to February",
    },
    "manali": {
        "flight_from_delhi": 5000, "train_from_delhi": 700,
        "hotel_budget": 800, "hotel_mid": 1800, "hotel_luxury": 4500,
        "food_per_day": 600, "local_transport_per_day": 500,
        "activities": ["Rohtang Pass", "Solang Valley", "Old Manali", "Hadimba Temple", "Mall Road"],
        "best_season": "October to June (avoid monsoon)",
    },
    "kerala": {
        "flight_from_delhi": 5500, "flight_from_mumbai": 3500,
        "hotel_budget": 1500, "hotel_mid": 3000, "hotel_luxury": 7000,
        "food_per_day": 700, "local_transport_per_day": 350,
        "activities": ["Alleppey Backwaters", "Munnar Tea Gardens", "Wayanad", "Fort Kochi", "Thekkady"],
        "best_season": "September to March",
    },
    "rajasthan": {
        "flight_from_delhi": 3500, "train_from_delhi": 600,
        "hotel_budget": 1000, "hotel_mid": 2500, "hotel_luxury": 8000,
        "food_per_day": 600, "local_transport_per_day": 400,
        "activities": ["Amber Fort", "City Palace", "Hawa Mahal", "Sam Sand Dunes", "Mehrangarh Fort"],
        "best_season": "October to March",
    },
    "himachal": {
        "flight_from_delhi": 4000, "train_from_delhi": 500,
        "hotel_budget": 700, "hotel_mid": 1500, "hotel_luxury": 4000,
        "food_per_day": 550, "local_transport_per_day": 400,
        "activities": ["Shimla Mall Road", "Kullu Valley", "Spiti Valley", "Dalhousie", "Kasol"],
        "best_season": "March to June, September to November",
    },
}


def plan_trip(destination: str, days: int, budget: float, from_city: str = "delhi") -> dict:
    dest_key = destination.lower().strip()
    data = None
    for key, val in TRIP_DATA.items():
        if key in dest_key or dest_key in key:
            data = val
            dest_key = key
            break

    if not data:
        # Generic estimate
        data = {
            "hotel_budget": 1000, "hotel_mid": 2500, "hotel_luxury": 6000,
            "food_per_day": 700, "local_transport_per_day": 400,
            "activities": ["Explore local attractions", "Try local cuisine"],
            "best_season": "Check local weather",
        }

    from_key = f"flight_from_{from_city.lower()}"
    train_key = f"train_from_{from_city.lower()}"
    flight_cost = data.get(from_key, data.get("flight_from_delhi", 5000))
    train_cost = data.get(train_key, data.get("train_from_delhi", 1200))

    hotel_budget = data["hotel_budget"] * days
    hotel_mid = data["hotel_mid"] * days
    food_total = data["food_per_day"] * days
    local_transport = data["local_transport_per_day"] * days
    misc = round((food_total + local_transport) * 0.10)

    budget_plan = {
        "flight": flight_cost, "hotel": hotel_budget,
        "food": food_total, "transport": local_transport, "misc": misc,
        "total": flight_cost + hotel_budget + food_total + local_transport + misc,
        "label": "Budget Plan",
    }
    mid_plan = {
        "flight": flight_cost, "hotel": hotel_mid,
        "food": round(food_total * 1.3), "transport": local_transport, "misc": round(misc * 1.3),
        "total": flight_cost + hotel_mid + round(food_total * 1.3) + local_transport + round(misc * 1.3),
        "label": "Comfort Plan",
    }

    # Day-wise budget
    daily_budget = round((budget - flight_cost) / days) if budget > flight_cost else round(data["hotel_budget"] + data["food_per_day"] + data["local_transport_per_day"])

    day_plan = []
    for i in range(1, min(days + 1, 8)):
        activity = data["activities"][(i - 1) % len(data["activities"])]
        day_plan.append({
            "day": i,
            "activity": activity,
            "estimated_cost": round(data["hotel_budget"] + data["food_per_day"] + data["local_transport_per_day"] + 200),
        })

    feasible = budget >= budget_plan["total"]
    shortfall = round(budget_plan["total"] - budget) if not feasible else 0

    return {
        "destination": destination.title(),
        "days": days,
        "from_city": from_city.title(),
        "best_season": data.get("best_season", "Year-round"),
        "travel_options": {
            "flight": {"cost": flight_cost, "recommendation": "Fastest option"},
            "train": {"cost": train_cost, "recommendation": f"Save ₹{flight_cost - train_cost:,.0f} vs flight. Scenic journey."},
        },
        "budget_plan": budget_plan,
        "comfort_plan": mid_plan,
        "daily_budget": daily_budget,
        "day_wise_plan": day_plan,
        "places_to_visit": data["activities"],
        "feasibility": {
            "feasible": feasible,
            "your_budget": budget,
            "minimum_needed": budget_plan["total"],
            "shortfall": shortfall,
            "message": (
                f"✅ Your budget of ₹{budget:,.0f} is sufficient! You'll have ₹{budget - budget_plan['total']:,.0f} as buffer."
                if feasible
                else f"⚠️ You need ₹{shortfall:,.0f} more for a budget trip. Save ₹{round(shortfall/3):,.0f}/month for 3 months to make it happen."
            ),
        },
        "money_saving_tips": [
            f"Book train tickets ({train_cost:,.0f}) instead of flight to save ₹{flight_cost - train_cost:,.0f}.",
            "Cook breakfast at your hotel/hostel to save ₹150-200/day on food.",
            "Rent a scooty locally (₹300-400/day) instead of using cabs.",
            "Travel in offseason for 30-40% cheaper hotels.",
            "Book stays on Zostel or Airbnb for budget options.",
        ],
    }


# ─── Restaurant Assistant ─────────────────────────────────────────────────────

def restaurant_budget_advisor(budget: float, menu_text: str) -> dict:
    """
    Given a budget and menu text (OCR'd or typed), suggest best combinations.
    """
    items = _parse_menu(menu_text)

    if not items:
        return {
            "budget": budget,
            "message": "Could not parse menu items. Please ensure items are in format: 'Item Name - ₹Price' or 'Item Name Rs.Price'.",
            "suggestions": [],
            "best_combo": None,
        }

    # Filter affordable items
    affordable = [item for item in items if item["price"] <= budget]

    if not affordable:
        cheapest = min(items, key=lambda x: x["price"])
        return {
            "budget": budget,
            "message": f"No single item fits your budget of ₹{budget:,.0f}. The cheapest item is {cheapest['name']} at ₹{cheapest['price']:,.0f}.",
            "suggestions": affordable,
            "best_combo": None,
        }

    # Find best combination (greedy by value)
    best_combo = _find_best_combo(affordable, budget)

    total_cost = sum(item["price"] for item in best_combo)
    remaining = round(budget - total_cost)

    return {
        "budget": budget,
        "affordable_items": affordable,
        "best_combo": {
            "items": best_combo,
            "total": total_cost,
            "remaining": remaining,
            "message": (
                f"With ₹{budget:,.0f}, you can order: " +
                ", ".join(f"{i['name']} (₹{i['price']:.0f})" for i in best_combo) +
                f" for ₹{total_cost:,.0f}, leaving ₹{remaining:,.0f} remaining."
            ),
        },
        "tips": [
            "Ask for water instead of a paid beverage to save ₹50-100.",
            "Sharing a main course can save 30-40% of your food budget.",
            "Look for combo meals or set menus — often 15-20% cheaper.",
        ],
    }


def _parse_menu(text: str) -> list[dict]:
    """Parse menu items from text. Handles common formats."""
    items = []
    price_pattern = re.compile(
        r"(.+?)\s*[-–|:]\s*(?:₹|Rs\.?\s*|INR\s*)(\d+(?:\.\d{1,2})?)",
        re.IGNORECASE,
    )
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        m = price_pattern.search(line)
        if m:
            name = m.group(1).strip()[:80]
            price = float(m.group(2))
            if 10 <= price <= 5000 and name:
                items.append({"name": name, "price": price})
    return items


def _find_best_combo(items: list[dict], budget: float) -> list[dict]:
    """Greedy: pick highest-value items that fit within budget."""
    # Sort by price descending (maximize value)
    sorted_items = sorted(items, key=lambda x: -x["price"])
    combo = []
    remaining = budget
    for item in sorted_items:
        if item["price"] <= remaining:
            combo.append(item)
            remaining -= item["price"]
    return combo
