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

export type DiscountType = "PERCENT" | "FIXED";

export function computeInvoiceTotals(input: {
  subtotal: Decimal;
  discountType?: DiscountType | null;
  discountValue?: number | string | Decimal | null;
  taxRatePercent?: number | string | Decimal | null;
}): {
  discountAmount: Decimal;
  taxAmount: Decimal;
  total: Decimal;
} {
  let discountAmount = money(0);
  const discountValue = input.discountValue == null ? null : money(input.discountValue);
  if (input.discountType && discountValue && discountValue.gt(0)) {
    if (input.discountType === "PERCENT") {
      discountAmount = input.subtotal
        .mul(discountValue)
        .div(100)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    } else {
      discountAmount = discountValue.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    }
    if (discountAmount.gt(input.subtotal)) {
      discountAmount = input.subtotal;
    }
  }

  const taxable = input.subtotal.sub(discountAmount);
  const taxRate = input.taxRatePercent == null ? money(0) : money(input.taxRatePercent);
  const taxAmount = taxRate.gt(0)
    ? taxable.mul(taxRate).div(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    : money(0);
  const total = taxable.add(taxAmount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  return { discountAmount, taxAmount, total };
}
