import { Injectable } from "@nestjs/common";
import { TEMPLATE_VAR_PATTERN } from "./automation-catalog";

export interface TemplateContext {
  client?: {
    firstName: string;
    lastName: string;
    displayName: string;
    lastActivityDate?: string;
  };
  dietitian?: { name: string };
  appointment?: { date: string; time: string; title?: string };
  organization?: { name: string };
  invoice?: { number: string; amount?: string; dueDate?: string };
  task?: { title: string; dueDate?: string };
  mealPlan?: { name: string; endDate?: string; lastUpdateDate?: string };
  rule?: { name: string };
  run?: { date: string };
}

@Injectable()
export class AutomationTemplateService {
  render(template: string, context: TemplateContext): string {
    return template.replace(TEMPLATE_VAR_PATTERN, (_match, key: string) => {
      const value = this.resolve(key, context);
      return value ?? "";
    });
  }

  private resolve(key: string, context: TemplateContext): string | undefined {
    const parts = key.split(".");
    if (parts.length !== 2) return undefined;
    const [group, field] = parts;
    if (!group || !field) return undefined;
    const record = context[group as keyof TemplateContext];
    if (!record || typeof record !== "object") return undefined;
    const value = (record as Record<string, string>)[field];
    return value;
  }
}
