/**
 * Port of backend/calculations.py -> TypeScript
 */

type Item = { id: string; name?: string; price: number; quantity?: number };
type Claim = { item_id: string; participant_id: string };

export function calculateSplits(
  items: Item[],
  claims: Claim[],
  tax: number,
  tip: number,
  participants: string[],
  payerParticipantId: string
): Record<string, { subtotal: number; tax_share: number; tip_share: number; total: number }> {
  if (!participants || participants.length === 0) return {};

  const claimsByItem = new Map<string, string[]>();
  for (const c of claims || []) {
    claimsByItem.set(c.item_id, (claimsByItem.get(c.item_id) || []).concat(c.participant_id));
  }

  const subtotalByParticipant = new Map<string, number>();
  let totalSubtotal = 0;

  for (const item of items || []) {
    const price = Number(item.price) || 0;
    const quantity = item.quantity ?? 1;
    const lineTotal = price * quantity;
    totalSubtotal += lineTotal;
    const claimants = claimsByItem.get(item.id) || [];
    if (claimants.length === 0) {
      const share = lineTotal / participants.length;
      for (const p of participants) {
        subtotalByParticipant.set(p, (subtotalByParticipant.get(p) || 0) + share);
      }
    } else {
      const share = lineTotal / claimants.length;
      for (const p of claimants) {
        subtotalByParticipant.set(p, (subtotalByParticipant.get(p) || 0) + share);
      }
    }
  }

  const result: Record<string, { subtotal: number; tax_share: number; tip_share: number; total: number }> = {};

  for (const p of participants) {
    const pSubtotal = subtotalByParticipant.get(p) || 0;
    const proportion = totalSubtotal > 0 ? pSubtotal / totalSubtotal : 1 / participants.length;
    const pTax = tax * proportion;
    const pTip = tip * proportion;
    const pTotal = pSubtotal + pTax + pTip;
    result[p] = {
      subtotal: Math.round(pSubtotal * 100) / 100,
      tax_share: Math.round(pTax * 100) / 100,
      tip_share: Math.round(pTip * 100) / 100,
      total: Math.round(pTotal * 100) / 100,
    };
  }

  const trueTotal = Math.round((totalSubtotal + tax + tip) * 100) / 100;
  const roundedSum = Math.round(Object.values(result).reduce((s, r) => s + r.total, 0) * 100) / 100;
  if (payerParticipantId in result) {
    const diff = Math.round((trueTotal - roundedSum) * 100) / 100;
    result[payerParticipantId].total = Math.round((result[payerParticipantId].total + diff) * 100) / 100;
  }

  return result;
}
