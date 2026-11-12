import { z } from "zod";
import { BOOKING_CHANNELS, MEETING_MODES } from "@/lib/constants";

const recurrenceSchema = z.enum(["NONE", "DAILY", "WEEKLY"]);

export const createBookingSchema = z
  .object({
    userId: z.string().min(1),
    roomId: z.string().min(1),
    title: z.string().min(3).max(120),
    agenda: z.string().max(500).optional().or(z.literal("")),
    startTime: z.coerce.date(),
    endTime: z.coerce.date(),
    attendeeCount: z.number().int().min(1).max(200),
    channel: z.enum(BOOKING_CHANNELS),
    meetingMode: z.enum(MEETING_MODES).default("OFFLINE"),
    recurrence: recurrenceSchema.default("NONE"),
    recurrenceCount: z.number().int().min(1).max(10).default(1),
  })
  .refine((value) => value.endTime > value.startTime, {
    message: "End time must be after start time",
    path: ["endTime"],
  });

export const bookingActionSchema = z.object({
  userId: z.string().min(1),
});

const passwordSchema = z
  .string()
  .min(8)
  .max(120)
  .regex(/[A-Z]/, "Password must include at least one uppercase letter")
  .regex(/[a-z]/, "Password must include at least one lowercase letter")
  .regex(/[0-9]/, "Password must include at least one number")
  .regex(/[^A-Za-z0-9]/, "Password must include at least one special character");

export const createUserSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  department: z.string().min(2).max(120),
  role: z.enum(["ADMIN", "EMPLOYEE"]).default("EMPLOYEE"),
  password: passwordSchema,
});

export const userAccessRequestSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  department: z.string().min(2).max(120),
  password: passwordSchema,
});

export const reviewUserRequestSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  role: z.enum(["ADMIN", "EMPLOYEE"]).optional(),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type BookingActionInput = z.infer<typeof bookingActionSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UserAccessRequestInput = z.infer<typeof userAccessRequestSchema>;
export type ReviewUserRequestInput = z.infer<typeof reviewUserRequestSchema>;

export type AvailabilityFilters = {
  start: Date;
  end: Date;
  capacity?: number;
  needsVideo?: boolean;
  needsDisplay?: boolean;
  needsWhiteboard?: boolean;
};

export function parseBoolean(value: string | null): boolean | undefined {
  if (value === null) {
    return undefined;
  }

  if (value.toLowerCase() === "true") {
    return true;
  }

  if (value.toLowerCase() === "false") {
    return false;
  }

  return undefined;
}
