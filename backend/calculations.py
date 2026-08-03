"""
Turns (items + claims + tax/tip) into a final amount owed per participant.

Rules:
  1. An item claimed by N people is split evenly N ways.
  2. An item claimed by nobody is split evenly across ALL participants
     (fallback so the receipt always fully reconciles — no penny left behind).
  3. Tax and tip are allocated proportionally to each person's share of
     the subtotal (fair: heavy orderers pay more tax, not equal split).
  4. Rounding remainder is absorbed by the payer so the payer's total
     always matches the receipt total exactly.
"""
from collections import defaultdict


def calculate_splits(
    items: list[dict],
    claims: list[dict],
    tax: float,
    tip: float,
    participants: list[str],
    payer_participant_id: str,
) -> dict[str, dict]:
    """
    Args:
        items:                 list of {id, name, price, quantity}
        claims:                list of {item_id, participant_id}
        tax:                   total tax from receipt
        tip:                   total tip from receipt
        participants:          list of participant ids in the session
        payer_participant_id:  participant who paid the restaurant

    Returns:
        {participant_id: {subtotal, tax_share, tip_share, total}}
    """
    if not participants:
        return {}

    # Build a map: item_id -> [participant_ids who claimed it]
    claims_by_item: dict[str, list[str]] = defaultdict(list)
    for c in claims:
        claims_by_item[c["item_id"]].append(c["participant_id"])

    subtotal_by_participant: dict[str, float] = defaultdict(float)
    total_subtotal = 0.0

    for item in items:
        price = float(item["price"])
        total_subtotal += price
        claimants = claims_by_item.get(item["id"], [])

        if not claimants:
            # Nobody claimed it — split among everyone (unclaimed fallback)
            share = price / len(participants)
            for p in participants:
                subtotal_by_participant[p] += share
        else:
            share = price / len(claimants)
            for p in claimants:
                subtotal_by_participant[p] += share

    result: dict[str, dict] = {}

    for p in participants:
        p_subtotal = subtotal_by_participant.get(p, 0.0)
        proportion = (p_subtotal / total_subtotal) if total_subtotal > 0 else (1 / len(participants))
        p_tax = tax * proportion
        p_tip = tip * proportion
        p_total = p_subtotal + p_tax + p_tip

        result[p] = {
            "subtotal": round(p_subtotal, 2),
            "tax_share": round(p_tax, 2),
            "tip_share": round(p_tip, 2),
            "total": round(p_total, 2),
        }

    # Fix rounding: diff between receipt total and sum of ROUNDED totals
    # (rounding each total to 2dp can lose/gain a cent — payer absorbs it)
    true_total = round(total_subtotal + tax + tip, 2)
    rounded_sum = round(sum(r["total"] for r in result.values()), 2)
    if payer_participant_id in result:
        diff = round(true_total - rounded_sum, 2)
        result[payer_participant_id]["total"] = round(
            result[payer_participant_id]["total"] + diff, 2
        )

    return result
