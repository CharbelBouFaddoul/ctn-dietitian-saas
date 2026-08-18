import { Decimal } from "@prisma/client/runtime/library";

export function money(value: string | number | Decimal): Decimal {
  return new Decimal(value);
}

export function computeLineTotal(quantity: Decimal, unitPrice: Decimal): Decimal {
  return quantity.mul(unitPrice).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function sumMoney(values: Decimal[]): Decimal {
  return values.reduce((acc, value) => acc.add(value), new Decimal(0)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function decimalToNumber(value: Decimal): number {
  return Number(value.toFixed(2));
}
