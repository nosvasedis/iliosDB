import type { ConsignmentLine, ConsignmentSettlement } from '../../types';

const cents = (amount: number) => Math.round((amount + Number.EPSILON) * 100);

/** Mirrors the server's cumulative allocation, including reversals and cent remainders. */
export function consignmentSaleTotal(line: ConsignmentLine, quantity: number, settlements: ConsignmentSettlement[] = []): number {
  if (quantity <= 0) return 0;
  if (line.offer_line_total == null) return cents(quantity * Number(line.locked_unit_price)) / 100;
  const recorded = settlements.filter(s => s.consignment_line_id === line.id && s.status !== 'reversed')
    .reduce((sum, s) => sum + cents(Number(s.total_amount)), 0);
  const target = Math.round(cents(Number(line.offer_line_total)) * (Number(line.sold_quantity) + quantity) / Number(line.offer_quantity ?? line.quantity));
  return Math.max(0, target - recorded) / 100;
}

export function consignmentUnitPrice(line: ConsignmentLine): number {
  return line.offer_line_total == null ? Number(line.locked_unit_price) : Number(line.offer_line_total) / Number(line.offer_quantity ?? line.quantity);
}
