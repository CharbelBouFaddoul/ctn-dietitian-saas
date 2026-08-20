import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from "class-validator";
import { isValidIanaTimeZone, isValidLocale } from "@nutrition-saas/utilities";

@ValidatorConstraint({ name: "ianaTimeZone", async: false })
export class IanaTimeZoneConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === "string" && isValidIanaTimeZone(value);
  }

  defaultMessage(): string {
    return "timezone must be a valid IANA time zone";
  }
}

@ValidatorConstraint({ name: "localeTag", async: false })
export class LocaleConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === "string" && isValidLocale(value);
  }

  defaultMessage(): string {
    return "locale must be a language tag such as en, en-US, or en-LB";
  }
}
