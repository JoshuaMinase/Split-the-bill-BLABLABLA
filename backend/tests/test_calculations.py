"""
Unit tests for calculations.py — the core split math.

Tests cover:
  - Even split among all claimants
  - Unclaimed items split among all participants
  - Proportional tax & tip allocation
  - Rounding remainder absorbed by payer
  - Edge cases: no participants, no items, single person, zero tax/tip
  - Shared items with multiple claimants
  - Mix of claimed and unclaimed items
"""
import sys
import os
import pytest

# Add backend/ to path so we can import calculations directly
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from calculations import calculate_splits


# ─── Helpers ──────────────────────────────────────────────────────────────────

def make_item(id: str, name: str, price: float, quantity: int = 1) -> dict:
    return {"id": id, "name": name, "price": price, "quantity": quantity}


def make_claim(item_id: str, participant_id: str) -> dict:
    return {"item_id": item_id, "participant_id": participant_id}


def total_of(results: dict) -> float:
    """Sum all participant totals."""
    return round(sum(r["total"] for r in results.values()), 2)


# ─── Basic splits ─────────────────────────────────────────────────────────────

class TestBasicSplits:

    def test_two_people_each_claim_own_item(self):
        """Alice claims burger, Bob claims salad. Each pays for their own item."""
        items = [make_item("i1", "Burger", 10.00), make_item("i2", "Salad", 8.00)]
        claims = [make_claim("i1", "alice"), make_claim("i2", "bob")]

        result = calculate_splits(
            items=items, claims=claims,
            tax=0, tip=0,
            participants=["alice", "bob"],
            payer_participant_id="alice",
        )

        assert result["alice"]["subtotal"] == 10.00
        assert result["bob"]["subtotal"] == 8.00
        assert result["alice"]["total"] == 10.00
        assert result["bob"]["total"] == 8.00

    def test_single_item_shared_by_two(self):
        """One pizza shared equally by two people."""
        items = [make_item("i1", "Pizza", 20.00)]
        claims = [make_claim("i1", "alice"), make_claim("i1", "bob")]

        result = calculate_splits(
            items=items, claims=claims,
            tax=0, tip=0,
            participants=["alice", "bob"],
            payer_participant_id="alice",
        )

        assert result["alice"]["subtotal"] == 10.00
        assert result["bob"]["subtotal"] == 10.00

    def test_single_item_shared_by_three(self):
        """$30 item split three ways = $10 each."""
        items = [make_item("i1", "Platter", 30.00)]
        claims = [
            make_claim("i1", "alice"),
            make_claim("i1", "bob"),
            make_claim("i1", "carol"),
        ]

        result = calculate_splits(
            items=items, claims=claims,
            tax=0, tip=0,
            participants=["alice", "bob", "carol"],
            payer_participant_id="alice",
        )

        assert result["alice"]["subtotal"] == 10.00
        assert result["bob"]["subtotal"] == 10.00
        assert result["carol"]["subtotal"] == 10.00

    def test_single_person_pays_everything(self):
        """Only one participant — they owe the full total."""
        items = [make_item("i1", "Steak", 50.00)]
        claims = [make_claim("i1", "alice")]

        result = calculate_splits(
            items=items, claims=claims,
            tax=5.00, tip=7.50,
            participants=["alice"],
            payer_participant_id="alice",
        )

        assert result["alice"]["subtotal"] == 50.00
        assert result["alice"]["tax_share"] == 5.00
        assert result["alice"]["tip_share"] == 7.50
        assert result["alice"]["total"] == 62.50


# ─── Unclaimed items ──────────────────────────────────────────────────────────

class TestUnclaimedItems:

    def test_unclaimed_item_split_among_all(self):
        """Nobody claimed the bread basket — split evenly among all 2 participants."""
        items = [
            make_item("i1", "Burger", 10.00),
            make_item("i2", "Bread Basket", 4.00),  # unclaimed
        ]
        claims = [make_claim("i1", "alice")]

        result = calculate_splits(
            items=items, claims=claims,
            tax=0, tip=0,
            participants=["alice", "bob"],
            payer_participant_id="alice",
        )

        # Alice: burger (10) + half bread (2) = 12
        # Bob: half bread (2) = 2
        assert result["alice"]["subtotal"] == 12.00
        assert result["bob"]["subtotal"] == 2.00

    def test_all_items_unclaimed_equal_split(self):
        """No claims at all — everything split evenly."""
        items = [make_item("i1", "Item A", 12.00), make_item("i2", "Item B", 8.00)]
        claims = []

        result = calculate_splits(
            items=items, claims=claims,
            tax=0, tip=0,
            participants=["alice", "bob"],
            payer_participant_id="alice",
        )

        # Total = 20, split 2 ways = 10 each
        assert result["alice"]["subtotal"] == 10.00
        assert result["bob"]["subtotal"] == 10.00


# ─── Tax & tip ────────────────────────────────────────────────────────────────

class TestTaxAndTip:

    def test_proportional_tax_allocation(self):
        """Heavy orderer pays more tax proportionally."""
        items = [
            make_item("i1", "Steak", 30.00),   # alice
            make_item("i2", "Salad", 10.00),   # bob
        ]
        claims = [make_claim("i1", "alice"), make_claim("i2", "bob")]

        result = calculate_splits(
            items=items, claims=claims,
            tax=8.00, tip=0,
            participants=["alice", "bob"],
            payer_participant_id="alice",
        )

        # Subtotal = 40. Alice = 30/40 = 75%, Bob = 10/40 = 25%
        assert result["alice"]["tax_share"] == round(8.00 * 0.75, 2)  # 6.00
        assert result["bob"]["tax_share"] == round(8.00 * 0.25, 2)    # 2.00

    def test_tip_allocation(self):
        """Tip is proportional to subtotal share."""
        items = [
            make_item("i1", "Dish A", 20.00),
            make_item("i2", "Dish B", 20.00),
        ]
        claims = [make_claim("i1", "alice"), make_claim("i2", "bob")]

        result = calculate_splits(
            items=items, claims=claims,
            tax=0, tip=10.00,
            participants=["alice", "bob"],
            payer_participant_id="alice",
        )

        # Equal subtotals → equal tip
        assert result["alice"]["tip_share"] == 5.00
        assert result["bob"]["tip_share"] == 5.00

    def test_zero_tax_zero_tip(self):
        """Zero tax and zero tip — totals equal subtotals."""
        items = [make_item("i1", "Coffee", 3.50)]
        claims = [make_claim("i1", "alice")]

        result = calculate_splits(
            items=items, claims=claims,
            tax=0.0, tip=0.0,
            participants=["alice"],
            payer_participant_id="alice",
        )

        assert result["alice"]["tax_share"] == 0.00
        assert result["alice"]["tip_share"] == 0.00
        assert result["alice"]["total"] == 3.50


# ─── Rounding ─────────────────────────────────────────────────────────────────

class TestRounding:

    def test_totals_sum_to_receipt_total(self):
        """All participant totals must sum exactly to the receipt total (tax+tip included)."""
        items = [
            make_item("i1", "A", 12.33),
            make_item("i2", "B", 7.77),
            make_item("i3", "C", 5.55),
        ]
        claims = [
            make_claim("i1", "alice"),
            make_claim("i2", "bob"),
            make_claim("i3", "carol"),
        ]
        tax = 2.57
        tip = 3.11

        result = calculate_splits(
            items=items, claims=claims,
            tax=tax, tip=tip,
            participants=["alice", "bob", "carol"],
            payer_participant_id="alice",
        )

        receipt_total = round(12.33 + 7.77 + 5.55 + tax + tip, 2)
        assert total_of(result) == receipt_total

    def test_rounding_remainder_on_payer(self):
        """$10 split 3 ways: 3.33 + 3.33 + 3.34 — payer absorbs the extra cent."""
        items = [make_item("i1", "Shared", 10.00)]
        claims = [
            make_claim("i1", "alice"),
            make_claim("i1", "bob"),
            make_claim("i1", "carol"),
        ]

        result = calculate_splits(
            items=items, claims=claims,
            tax=0, tip=0,
            participants=["alice", "bob", "carol"],
            payer_participant_id="alice",
        )

        # Sum must equal 10.00 exactly
        assert total_of(result) == 10.00

    def test_messy_amounts_reconcile(self):
        """Arbitrary messy numbers must still reconcile to the penny."""
        items = [
            make_item("i1", "X", 11.11),
            make_item("i2", "Y", 22.22),
            make_item("i3", "Z", 33.33),
        ]
        claims = [
            make_claim("i1", "alice"),
            make_claim("i1", "bob"),    # i1 shared
            make_claim("i2", "bob"),
            make_claim("i3", "carol"),
        ]
        tax = 5.99
        tip = 8.01

        result = calculate_splits(
            items=items, claims=claims,
            tax=tax, tip=tip,
            participants=["alice", "bob", "carol"],
            payer_participant_id="bob",
        )

        receipt_total = round(11.11 + 22.22 + 33.33 + tax + tip, 2)
        assert total_of(result) == receipt_total


# ─── Edge cases ───────────────────────────────────────────────────────────────

class TestEdgeCases:

    def test_no_participants_returns_empty(self):
        """No participants → empty result dict, no crash."""
        items = [make_item("i1", "Burger", 10.00)]
        result = calculate_splits(
            items=items, claims=[],
            tax=1.0, tip=1.0,
            participants=[],
            payer_participant_id="nobody",
        )
        assert result == {}

    def test_no_items_returns_zeroes(self):
        """No items → all participants have 0 totals."""
        result = calculate_splits(
            items=[], claims=[],
            tax=0, tip=0,
            participants=["alice", "bob"],
            payer_participant_id="alice",
        )
        assert result["alice"]["total"] == 0.00
        assert result["bob"]["total"] == 0.00

    def test_participant_who_claimed_nothing_but_has_unclaimed_share(self):
        """Bob claimed nothing, but there's an unclaimed item — he still pays his share."""
        items = [
            make_item("i1", "Alice Food", 10.00),
            make_item("i2", "Table Bread", 4.00),  # unclaimed
        ]
        claims = [make_claim("i1", "alice")]

        result = calculate_splits(
            items=items, claims=claims,
            tax=0, tip=0,
            participants=["alice", "bob"],
            payer_participant_id="alice",
        )

        assert result["bob"]["subtotal"] == 2.00  # half of unclaimed bread
        assert result["bob"]["total"] == 2.00

    def test_same_item_claimed_by_all_participants(self):
        """All 4 people claim the same item — each pays 25%."""
        items = [make_item("i1", "Shared Platter", 40.00)]
        participants = ["a", "b", "c", "d"]
        claims = [make_claim("i1", p) for p in participants]

        result = calculate_splits(
            items=items, claims=claims,
            tax=0, tip=0,
            participants=participants,
            payer_participant_id="a",
        )

        for p in participants:
            assert result[p]["subtotal"] == 10.00

    def test_payer_not_in_results_no_crash(self):
        """If payer_participant_id is not in participants, no crash — just no rounding adjustment."""
        items = [make_item("i1", "Food", 10.00)]
        claims = [make_claim("i1", "alice")]

        # "ghost" is the payer but not in participants list
        result = calculate_splits(
            items=items, claims=claims,
            tax=0, tip=0,
            participants=["alice"],
            payer_participant_id="ghost",
        )
        # Should still return alice's result without crashing
        assert "alice" in result

    def test_result_fields_are_rounded_to_cents(self):
        """All money fields in the result must be rounded to 2 decimal places."""
        items = [make_item("i1", "Item", 10.00)]
        claims = [
            make_claim("i1", "alice"),
            make_claim("i1", "bob"),
            make_claim("i1", "carol"),
        ]

        result = calculate_splits(
            items=items, claims=claims,
            tax=1.00, tip=1.00,
            participants=["alice", "bob", "carol"],
            payer_participant_id="alice",
        )

        for p, r in result.items():
            for field in ("subtotal", "tax_share", "tip_share", "total"):
                val = r[field]
                assert val == round(val, 2), f"{p}.{field} = {val} is not rounded to 2dp"
