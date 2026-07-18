"""
Khatabook SQLAlchemy models.
Tables: kb_parties, kb_entries
Added as new tables — existing tables untouched.
"""
from datetime import datetime
from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .models import Base


class KbParty(Base):
    """A person / business you have a credit/debit relationship with."""
    __tablename__ = "kb_parties"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    entries: Mapped[list["KbEntry"]] = relationship(
        back_populates="party", cascade="all, delete-orphan"
    )


class KbEntry(Base):
    """A single credit/debit entry in the khatabook ledger."""
    __tablename__ = "kb_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    party_id: Mapped[int] = mapped_column(ForeignKey("kb_parties.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    # "gave"  = you gave money  (debit — they owe you)
    # "got"   = you received    (credit — you owe them)
    entry_type: Mapped[str] = mapped_column(String(10))   # "gave" | "got"
    amount: Mapped[float] = mapped_column(Float)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    date: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    settled: Mapped[int] = mapped_column(Integer, default=0)   # 0=pending 1=settled

    party: Mapped["KbParty"] = relationship(back_populates="entries")
