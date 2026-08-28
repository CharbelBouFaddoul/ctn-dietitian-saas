import { CLIENT_NAME_FRIENDLY, type AutomationRecipientChoice } from "./automation-rule-form";

export type AutomationTemplate = {
  id: string;
  title: string;
  description: string;
  triggerType: string;
  actionType: string;
  timingValue: number | null;
  recipient: AutomationRecipientChoice;
  name: string;
  taskTitle: string;
  notificationTitle: string;
  notificationBody: string;
};

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    id: "appointment-reminder",
    title: "Appointment reminder",
    description: "Message the client 1 day before a visit.",
    triggerType: "APPOINTMENT_UPCOMING",
    actionType: "SEND_MESSAGE",
    timingValue: 1,
    recipient: "CLIENT",
    name: "Appointment reminder",
    taskTitle: `Follow up with ${CLIENT_NAME_FRIENDLY}`,
    notificationTitle: "Upcoming appointment",
    notificationBody: `Hi ${CLIENT_NAME_FRIENDLY}, a reminder that you have [Appointment_title] on [Appointment_date] at [Appointment_time].`,
  },
  {
    id: "missed-appointment",
    title: "Missed appointment",
    description: "Create a clinic task after a missed visit.",
    triggerType: "APPOINTMENT_MISSED",
    actionType: "CREATE_TASK",
    timingValue: 1,
    recipient: "ASSIGNED_DIETITIAN",
    name: "Missed appointment follow-up",
    taskTitle: `Follow up after missed appointment — ${CLIENT_NAME_FRIENDLY} ([Appointment_date])`,
    notificationTitle: "Missed appointment",
    notificationBody: `Follow up with ${CLIENT_NAME_FRIENDLY} after a missed appointment.`,
  },
  {
    id: "inactive-7d",
    title: "Inactive client",
    description: "Notify you when a client has not logged for 7 days.",
    triggerType: "CLIENT_INACTIVE",
    actionType: "SEND_IN_APP_NOTIFICATION",
    timingValue: 7,
    recipient: "ASSIGNED_DIETITIAN",
    name: "Inactive client alert",
    taskTitle: `Check in with ${CLIENT_NAME_FRIENDLY}`,
    notificationTitle: "Client inactive",
    notificationBody: `${CLIENT_NAME_FRIENDLY} has not logged since [Last_activity_date].`,
  },
  {
    id: "invoice-overdue",
    title: "Overdue invoice",
    description: "Notify the client when an invoice is overdue.",
    triggerType: "INVOICE_OVERDUE",
    actionType: "SEND_IN_APP_NOTIFICATION",
    timingValue: null,
    recipient: "CLIENT",
    name: "Overdue invoice notice",
    taskTitle: `Follow up on overdue invoice — ${CLIENT_NAME_FRIENDLY}`,
    notificationTitle: "Invoice overdue",
    notificationBody: `Hi ${CLIENT_NAME_FRIENDLY}, invoice [Invoice_number] for [Invoice_amount] was due on [Invoice_due_date]. Please review it in the portal.`,
  },
  {
    id: "task-due",
    title: "Task due today",
    description: "Notify you when a clinic task is due.",
    triggerType: "TASK_DUE",
    actionType: "SEND_IN_APP_NOTIFICATION",
    timingValue: null,
    recipient: "ASSIGNED_DIETITIAN",
    name: "Task due today",
    taskTitle: `Task due for ${CLIENT_NAME_FRIENDLY}`,
    notificationTitle: "Task due today",
    notificationBody: `Task “[Task_title]” is due [Task_due_date].`,
  },
  {
    id: "meal-plan-ending",
    title: "Meal plan ending",
    description: "Create a task 3 days before a meal plan ends.",
    triggerType: "MEAL_PLAN_ENDING",
    actionType: "CREATE_TASK",
    timingValue: 3,
    recipient: "ASSIGNED_DIETITIAN",
    name: "Meal plan ending",
    taskTitle: `Renew meal plan for ${CLIENT_NAME_FRIENDLY} — ends [Meal_plan_end_date]`,
    notificationTitle: "Meal plan ending soon",
    notificationBody: `${CLIENT_NAME_FRIENDLY}'s meal plan “[Meal_plan_name]” ends on [Meal_plan_end_date] (last updated [Meal_plan_last_update_date]).`,
  },
  {
    id: "weekly-checkin",
    title: "Weekly check-in",
    description: "Remind the client when a check-in is due.",
    triggerType: "CLIENT_CHECKIN_DUE",
    actionType: "SEND_IN_APP_NOTIFICATION",
    timingValue: 7,
    recipient: "CLIENT",
    name: "Weekly check-in",
    taskTitle: `Check-in with ${CLIENT_NAME_FRIENDLY}`,
    notificationTitle: "Time to check in",
    notificationBody: `Hi ${CLIENT_NAME_FRIENDLY}, it is time for your weekly check-in.`,
  },
];

