import { BadRequestException } from "@nestjs/common";

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseChartNoteDate(value?: string): Date {
  if (!value?.trim()) return new Date();
  const trimmed = value.trim();
  const match = DATE_ONLY.exec(trimmed);
  if (match) {
    const date = new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException("Choose a valid date and time");
    }
    return date;
  }
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException("Choose a valid date and time");
  }
  return date;
}
