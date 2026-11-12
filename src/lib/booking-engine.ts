import crypto from "node:crypto";
import {
  addDays,
  addMinutes,
  addWeeks,
  differenceInMinutes,
  format,
  formatISO,
  isAfter,
  startOfDay,
  subDays,
  subMinutes,
} from "date-fns";
import type {
  AvailabilityFilters,
  CreateBookingInput,
  CreateUserInput,
  UserAccessRequestInput,
} from "@/lib/schemas";
import { db, ensureSeeded, hashPassword } from "@/lib/db";

export type Role = "ADMIN" | "EMPLOYEE";
export type BookingStatus = "BOOKED" | "CHECKED_IN" | "RELEASED" | "CANCELLED";
export type ReleaseReason = "MANUAL" | "NO_SHOW" | "AUTO_ENDED";
export type MeetingMode = "OFFLINE" | "GOOGLE_MEET" | "ZOOM";

const CHECK_IN_GRACE_MINUTES = 10;
const AUTO_RELEASE_PRECHECK_MINUTES = 30;
const BLOCKING_STATUSES: BookingStatus[] = ["BOOKED", "CHECKED_IN"];

export class BookingDomainError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "BookingDomainError";
    this.status = status;
  }
}

type Occurrence = {
  startTime: Date;
  endTime: Date;
  recurrenceIndex: number;
};

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  department: string;
  isBlocked: boolean;
  blockedReason: string | null;
  blockedAt: string | null;
  blockedById: string | null;
};

export type UserAccessRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export type UserAccessRequest = {
  id: string;
  name: string;
  email: string;
  department: string;
  status: UserAccessRequestStatus;
  reviewedById: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type UserAuthRow = User & {
  passwordHash: string;
};

type Room = {
  id: string;
  code: string;
  name: string;
  location: string;
  floor: string;
  capacity: number;
  hasDisplay: boolean;
  hasVideo: boolean;
  hasWhiteboard: boolean;
  isActive: boolean;
};

export type Booking = {
  id: string;
  title: string;
  agenda: string | null;
  startTime: string;
  endTime: string;
  attendeeCount: number;
  status: BookingStatus;
  channel: string;
  meetingMode: MeetingMode;
  meetingLink: string | null;
  summaryText: string | null;
  isRecurring: boolean;
  recurrencePattern: string | null;
  recurrenceIndex: number | null;
  checkedInAt: string | null;
  releasedAt: string | null;
  releaseReason: ReleaseReason | null;
  bookedById: string;
  roomId: string;
  createdAt: string;
  updatedAt: string;
  bookedBy: User;
  room: Room;
};

type JoinedBookingRow = {
  booking_id: string;
  booking_title: string;
  booking_agenda: string | null;
  booking_start_time: string;
  booking_end_time: string;
  booking_attendee_count: number;
  booking_status: BookingStatus;
  booking_channel: string;
  booking_meeting_mode: MeetingMode;
  booking_meeting_link: string | null;
  booking_summary_text: string | null;
  booking_is_recurring: number;
  booking_recurrence_pattern: string | null;
  booking_recurrence_index: number | null;
  booking_checked_in_at: string | null;
  booking_released_at: string | null;
  booking_release_reason: ReleaseReason | null;
  booking_booked_by_id: string;
  booking_room_id: string;
  booking_created_at: string;
  booking_updated_at: string;
  user_id: string;
  user_name: string;
  user_email: string;
  user_role: Role;
  user_department: string;
  room_id: string;
  room_code: string;
  room_name: string;
  room_location: string;
  room_floor: string;
  room_capacity: number;
  room_has_display: number;
  room_has_video: number;
  room_has_whiteboard: number;
  room_is_active: number;
};

function assert(condition: unknown, message: string, status = 400): asserts condition {
  if (!condition) {
    throw new BookingDomainError(message, status);
  }
}

function randomToken(length = 10) {
  return crypto.randomBytes(length).toString("hex").slice(0, length);
}

function generateMeetingLink(mode: MeetingMode): string | null {
  if (mode === "OFFLINE") {
    return null;
  }

  if (mode === "GOOGLE_MEET") {
    return `https://meet.google.com/${randomToken(3)}-${randomToken(4)}-${randomToken(3)}`;
  }

  return `https://zoom.us/j/${Math.floor(1000000000 + Math.random() * 9000000000)}?pwd=${randomToken(8)}`;
}

function mapRoomRow(row: {
  id: string;
  code: string;
  name: string;
  location: string;
  floor: string;
  capacity: number;
  has_display: number;
  has_video: number;
  has_whiteboard: number;
  is_active: number;
}): Room {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    location: row.location,
    floor: row.floor,
    capacity: row.capacity,
    hasDisplay: Boolean(row.has_display),
    hasVideo: Boolean(row.has_video),
    hasWhiteboard: Boolean(row.has_whiteboard),
    isActive: Boolean(row.is_active),
  };
}

function mapUserRow(row: {
  id: string;
  name: string;
  email: string;
  role: Role;
  department: string;
  is_blocked?: number;
  blocked_reason?: string | null;
  blocked_at?: string | null;
  blocked_by_id?: string | null;
}): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    department: row.department,
    isBlocked: Boolean(row.is_blocked),
    blockedReason: row.blocked_reason ?? null,
    blockedAt: row.blocked_at ?? null,
    blockedById: row.blocked_by_id ?? null,
  };
}

function mapUserAccessRequestRow(row: {
  id: string;
  name: string;
  email: string;
  department: string;
  status: UserAccessRequestStatus;
  reviewed_by_id: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}): UserAccessRequest {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    department: row.department,
    status: row.status,
    reviewedById: row.reviewed_by_id,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapBookingRow(row: JoinedBookingRow): Booking {
  return {
    id: row.booking_id,
    title: row.booking_title,
    agenda: row.booking_agenda,
    startTime: row.booking_start_time,
    endTime: row.booking_end_time,
    attendeeCount: row.booking_attendee_count,
    status: row.booking_status,
    channel: row.booking_channel,
    meetingMode: row.booking_meeting_mode,
    meetingLink: row.booking_meeting_link,
    summaryText: row.booking_summary_text,
    isRecurring: Boolean(row.booking_is_recurring),
    recurrencePattern: row.booking_recurrence_pattern,
    recurrenceIndex: row.booking_recurrence_index,
    checkedInAt: row.booking_checked_in_at,
    releasedAt: row.booking_released_at,
    releaseReason: row.booking_release_reason,
    bookedById: row.booking_booked_by_id,
    roomId: row.booking_room_id,
    createdAt: row.booking_created_at,
    updatedAt: row.booking_updated_at,
    bookedBy: {
      id: row.user_id,
      name: row.user_name,
      email: row.user_email,
      role: row.user_role,
      department: row.user_department,
      isBlocked: false,
      blockedReason: null,
      blockedAt: null,
      blockedById: null,
    },
    room: {
      id: row.room_id,
      code: row.room_code,
      name: row.room_name,
      location: row.room_location,
      floor: row.room_floor,
      capacity: row.room_capacity,
      hasDisplay: Boolean(row.room_has_display),
      hasVideo: Boolean(row.room_has_video),
      hasWhiteboard: Boolean(row.room_has_whiteboard),
      isActive: Boolean(row.room_is_active),
    },
  };
}

function fetchJoinedBookings(whereSql = "", params: unknown[] = []): Booking[] {
  const rows = db
    .prepare(
      `
      SELECT
        b.id as booking_id,
        b.title as booking_title,
        b.agenda as booking_agenda,
        b.start_time as booking_start_time,
        b.end_time as booking_end_time,
        b.attendee_count as booking_attendee_count,
        b.status as booking_status,
        b.channel as booking_channel,
        b.meeting_mode as booking_meeting_mode,
        b.meeting_link as booking_meeting_link,
        b.summary_text as booking_summary_text,
        b.is_recurring as booking_is_recurring,
        b.recurrence_pattern as booking_recurrence_pattern,
        b.recurrence_index as booking_recurrence_index,
        b.checked_in_at as booking_checked_in_at,
        b.released_at as booking_released_at,
        b.release_reason as booking_release_reason,
        b.booked_by_id as booking_booked_by_id,
        b.room_id as booking_room_id,
        b.created_at as booking_created_at,
        b.updated_at as booking_updated_at,

        u.id as user_id,
        u.name as user_name,
        u.email as user_email,
        u.role as user_role,
        u.department as user_department,

        r.id as room_id,
        r.code as room_code,
        r.name as room_name,
        r.location as room_location,
        r.floor as room_floor,
        r.capacity as room_capacity,
        r.has_display as room_has_display,
        r.has_video as room_has_video,
        r.has_whiteboard as room_has_whiteboard,
        r.is_active as room_is_active
      FROM bookings b
      JOIN users u ON u.id = b.booked_by_id
      JOIN rooms r ON r.id = b.room_id
      ${whereSql}
    `,
    )
    .all(...params) as JoinedBookingRow[];

  return rows.map(mapBookingRow);
}

function getUserById(userId: string): User | null {
  ensureSeeded();

  const row = db
    .prepare(
      `
      SELECT
        id, name, email, role, department,
        is_blocked, blocked_reason, blocked_at, blocked_by_id
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
    )
    .get(userId) as
    | {
        id: string;
        name: string;
        email: string;
        role: Role;
        department: string;
        is_blocked: number;
        blocked_reason: string | null;
        blocked_at: string | null;
        blocked_by_id: string | null;
      }
    | undefined;

  return row ? mapUserRow(row) : null;
}

function ensureAdminUser(userId: string): User {
  const user = getUserById(userId);

  if (!user) {
    throw new BookingDomainError("User not found", 404);
  }

  if (user.role !== "ADMIN") {
    throw new BookingDomainError("Only admin can perform this action", 403);
  }

  return user;
}

function getUserByEmail(email: string): UserAuthRow | null {
  ensureSeeded();

  const row = db
    .prepare(
      `
      SELECT
        id, name, email, role, department, password_hash,
        is_blocked, blocked_reason, blocked_at, blocked_by_id
      FROM users
      WHERE lower(email) = lower(?)
      LIMIT 1
    `,
    )
    .get(email) as
    | {
        id: string;
        name: string;
        email: string;
        role: Role;
        department: string;
        password_hash: string;
        is_blocked: number;
        blocked_reason: string | null;
        blocked_at: string | null;
        blocked_by_id: string | null;
      }
    | undefined;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    department: row.department,
    passwordHash: row.password_hash,
    isBlocked: Boolean(row.is_blocked),
    blockedReason: row.blocked_reason,
    blockedAt: row.blocked_at,
    blockedById: row.blocked_by_id,
  };
}

function assertNoConflict(roomId: string, startIso: string, endIso: string): void {
  const conflict = db
    .prepare(
      `
      SELECT title, start_time, end_time
      FROM bookings
      WHERE room_id = ?
        AND status IN ('BOOKED', 'CHECKED_IN')
        AND start_time < ?
        AND end_time > ?
      LIMIT 1
    `,
    )
    .get(roomId, endIso, startIso) as
    | {
        title: string;
        start_time: string;
        end_time: string;
      }
    | undefined;

  if (conflict) {
    throw new BookingDomainError(
      `Room already booked (${conflict.title}) from ${conflict.start_time} to ${conflict.end_time}.`,
      409,
    );
  }
}

function buildOccurrences(
  startTime: Date,
  endTime: Date,
  recurrence: "NONE" | "DAILY" | "WEEKLY",
  recurrenceCount: number,
): Occurrence[] {
  const count = recurrence === "NONE" ? 1 : Math.max(1, recurrenceCount);

  return Array.from({ length: count }, (_, index) => {
    if (recurrence === "DAILY") {
      return {
        startTime: addDays(startTime, index),
        endTime: addDays(endTime, index),
        recurrenceIndex: index,
      };
    }

    if (recurrence === "WEEKLY") {
      return {
        startTime: addWeeks(startTime, index),
        endTime: addWeeks(endTime, index),
        recurrenceIndex: index,
      };
    }

    return { startTime, endTime, recurrenceIndex: index };
  });
}

export async function authenticateUser(
  email: string,
  password: string,
  requiredRole?: Role,
): Promise<User> {
  const user = getUserByEmail(email);

  if (!user) {
    throw new BookingDomainError("Invalid email or password", 401);
  }

  if (hashPassword(password) !== user.passwordHash) {
    throw new BookingDomainError("Invalid email or password", 401);
  }

  if (requiredRole && user.role !== requiredRole) {
    throw new BookingDomainError("This account cannot access this portal", 403);
  }

  if (user.isBlocked) {
    throw new BookingDomainError(
      `Your account is blocked by admin. Reason: ${user.blockedReason ?? "No reason provided"}`,
      403,
    );
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    department: user.department,
  };
}

export async function getUserByIdOrThrow(userId: string): Promise<User> {
  const user = getUserById(userId);
  if (!user) {
    throw new BookingDomainError("User not found", 404);
  }
  return user;
}

export async function getUsers() {
  ensureSeeded();

  const rows = db
    .prepare(
      `
      SELECT
        id, name, email, role, department,
        is_blocked, blocked_reason, blocked_at, blocked_by_id
      FROM users
      ORDER BY role ASC, name ASC
    `,
    )
    .all() as {
    id: string;
    name: string;
    email: string;
    role: Role;
    department: string;
    is_blocked: number;
    blocked_reason: string | null;
    blocked_at: string | null;
    blocked_by_id: string | null;
  }[];

  return rows.map(mapUserRow);
}

export async function createUserByAdmin(adminId: string, input: CreateUserInput): Promise<User> {
  ensureSeeded();
  ensureAdminUser(adminId);

  const existing = db
    .prepare(`SELECT id FROM users WHERE lower(email) = lower(?) LIMIT 1`)
    .get(input.email) as { id: string } | undefined;

  if (existing) {
    throw new BookingDomainError("A user with this email already exists", 409);
  }

  const nowIso = new Date().toISOString();
  const userId = `usr_${crypto.randomUUID()}`;

  db.prepare(
    `
    INSERT INTO users (id, name, email, role, department, password_hash, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    userId,
    input.name.trim(),
    input.email.trim().toLowerCase(),
    input.role,
    input.department.trim(),
    hashPassword(input.password),
    nowIso,
    nowIso,
  );

  const created = getUserById(userId);
  if (!created) {
    throw new BookingDomainError("Unable to create user", 500);
  }

  return created;
}

export async function blockUserByAdmin(
  adminId: string,
  targetUserId: string,
  reason: string,
): Promise<User> {
  ensureSeeded();
  ensureAdminUser(adminId);

  const normalizedReason = reason.trim();
  assert(normalizedReason.length >= 3, "Blocking reason must be at least 3 characters", 400);
  assert(targetUserId !== adminId, "You cannot block your own admin account", 409);

  const target = getUserById(targetUserId);
  if (!target) {
    throw new BookingDomainError("User not found", 404);
  }

  assert(target.role !== "ADMIN", "Blocking admin accounts is disabled from this portal", 409);

  const nowIso = new Date().toISOString();
  db.prepare(
    `
    UPDATE users
    SET is_blocked = 1, blocked_reason = ?, blocked_at = ?, blocked_by_id = ?, updated_at = ?
    WHERE id = ?
  `,
  ).run(normalizedReason, nowIso, adminId, nowIso, targetUserId);

  const updated = getUserById(targetUserId);
  if (!updated) {
    throw new BookingDomainError("Unable to update user block status", 500);
  }

  return updated;
}

export async function unblockUserByAdmin(adminId: string, targetUserId: string): Promise<User> {
  ensureSeeded();
  ensureAdminUser(adminId);
  assert(targetUserId !== adminId, "You cannot change your own admin block status here", 409);

  const target = getUserById(targetUserId);
  if (!target) {
    throw new BookingDomainError("User not found", 404);
  }

  const nowIso = new Date().toISOString();
  db.prepare(
    `
    UPDATE users
    SET is_blocked = 0, blocked_reason = NULL, blocked_at = NULL, blocked_by_id = NULL, updated_at = ?
    WHERE id = ?
  `,
  ).run(nowIso, targetUserId);

  const updated = getUserById(targetUserId);
  if (!updated) {
    throw new BookingDomainError("Unable to update user block status", 500);
  }

  return updated;
}

export async function removeUserByAdmin(adminId: string, targetUserId: string): Promise<void> {
  ensureSeeded();
  ensureAdminUser(adminId);

  assert(targetUserId !== adminId, "You cannot remove your own admin account", 409);

  const target = getUserById(targetUserId);
  if (!target) {
    throw new BookingDomainError("User not found", 404);
  }

  assert(target.role !== "ADMIN", "Removing admin accounts is disabled from this portal", 409);

  const bookingCountRow = db
    .prepare(`SELECT COUNT(*) as count FROM bookings WHERE booked_by_id = ?`)
    .get(targetUserId) as { count: number };

  if (bookingCountRow.count > 0) {
    throw new BookingDomainError(
      "User has booking history. Please block the account instead of removing it.",
      409,
    );
  }

  db.prepare(`DELETE FROM users WHERE id = ?`).run(targetUserId);
}

export async function submitUserAccessRequest(
  input: UserAccessRequestInput,
): Promise<UserAccessRequest> {
  ensureSeeded();

  const normalizedEmail = input.email.trim().toLowerCase();
  const existingUser = db
    .prepare(`SELECT id FROM users WHERE lower(email) = lower(?) LIMIT 1`)
    .get(normalizedEmail) as { id: string } | undefined;

  if (existingUser) {
    throw new BookingDomainError("An account already exists for this email", 409);
  }

  const existingPending = db
    .prepare(
      `
      SELECT id
      FROM user_access_requests
      WHERE lower(email) = lower(?)
        AND status = 'PENDING'
      LIMIT 1
    `,
    )
    .get(normalizedEmail) as { id: string } | undefined;

  if (existingPending) {
    throw new BookingDomainError("A pending access request already exists for this email", 409);
  }

  const nowIso = new Date().toISOString();
  const requestId = `req_${crypto.randomUUID()}`;

  db.prepare(
    `
    INSERT INTO user_access_requests (
      id, name, email, department, password_hash, status,
      reviewed_by_id, reviewed_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'PENDING', NULL, NULL, ?, ?)
  `,
  ).run(
    requestId,
    input.name.trim(),
    normalizedEmail,
    input.department.trim(),
    hashPassword(input.password),
    nowIso,
    nowIso,
  );

  const row = db
    .prepare(
      `
      SELECT id, name, email, department, status, reviewed_by_id, reviewed_at, created_at, updated_at
      FROM user_access_requests
      WHERE id = ?
      LIMIT 1
    `,
    )
    .get(requestId) as
    | {
        id: string;
        name: string;
        email: string;
        department: string;
        status: UserAccessRequestStatus;
        reviewed_by_id: string | null;
        reviewed_at: string | null;
        created_at: string;
        updated_at: string;
      }
    | undefined;

  if (!row) {
    throw new BookingDomainError("Unable to submit access request", 500);
  }

  return mapUserAccessRequestRow(row);
}

export async function getUserAccessRequests(adminId: string): Promise<UserAccessRequest[]> {
  ensureSeeded();
  ensureAdminUser(adminId);

  const rows = db
    .prepare(
      `
      SELECT id, name, email, department, status, reviewed_by_id, reviewed_at, created_at, updated_at
      FROM user_access_requests
      ORDER BY
        CASE status
          WHEN 'PENDING' THEN 0
          WHEN 'APPROVED' THEN 1
          ELSE 2
        END ASC,
        created_at DESC
    `,
    )
    .all() as Array<{
    id: string;
    name: string;
    email: string;
    department: string;
    status: UserAccessRequestStatus;
    reviewed_by_id: string | null;
    reviewed_at: string | null;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map(mapUserAccessRequestRow);
}

export async function reviewUserAccessRequest(
  adminId: string,
  requestId: string,
  decision: "APPROVE" | "REJECT",
  role: Role = "EMPLOYEE",
): Promise<UserAccessRequest> {
  ensureSeeded();
  ensureAdminUser(adminId);

  const request = db
    .prepare(
      `
      SELECT id, name, email, department, password_hash, status
      FROM user_access_requests
      WHERE id = ?
      LIMIT 1
    `,
    )
    .get(requestId) as
    | {
        id: string;
        name: string;
        email: string;
        department: string;
        password_hash: string;
        status: UserAccessRequestStatus;
      }
    | undefined;

  if (!request) {
    throw new BookingDomainError("Access request not found", 404);
  }

  if (request.status !== "PENDING") {
    throw new BookingDomainError("This request has already been reviewed", 409);
  }

  const nowIso = new Date().toISOString();

  if (decision === "APPROVE") {
    const existingUser = db
      .prepare(`SELECT id FROM users WHERE lower(email) = lower(?) LIMIT 1`)
      .get(request.email) as { id: string } | undefined;

    if (existingUser) {
      throw new BookingDomainError("A user with this email already exists", 409);
    }

    db.prepare(
      `
      INSERT INTO users (id, name, email, role, department, password_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      `usr_${crypto.randomUUID()}`,
      request.name,
      request.email,
      role,
      request.department,
      request.password_hash,
      nowIso,
      nowIso,
    );
  }

  db.prepare(
    `
    UPDATE user_access_requests
    SET status = ?, reviewed_by_id = ?, reviewed_at = ?, updated_at = ?
    WHERE id = ?
  `,
  ).run(decision === "APPROVE" ? "APPROVED" : "REJECTED", adminId, nowIso, nowIso, requestId);

  const row = db
    .prepare(
      `
      SELECT id, name, email, department, status, reviewed_by_id, reviewed_at, created_at, updated_at
      FROM user_access_requests
      WHERE id = ?
      LIMIT 1
    `,
    )
    .get(requestId) as
    | {
        id: string;
        name: string;
        email: string;
        department: string;
        status: UserAccessRequestStatus;
        reviewed_by_id: string | null;
        reviewed_at: string | null;
        created_at: string;
        updated_at: string;
      }
    | undefined;

  if (!row) {
    throw new BookingDomainError("Unable to fetch updated request", 500);
  }

  return mapUserAccessRequestRow(row);
}

export async function applyBookingLifecycle(now = new Date()): Promise<void> {
  ensureSeeded();

  const nowIso = now.toISOString();
  const noShowCutoff = subMinutes(now, CHECK_IN_GRACE_MINUTES).toISOString();

  const transaction = db.transaction(() => {
    db.prepare(
      `
      UPDATE bookings
      SET
        status = 'RELEASED',
        released_at = @releasedAt,
        release_reason = 'NO_SHOW',
        updated_at = @updatedAt
      WHERE status = 'BOOKED'
        AND start_time <= @noShowCutoff
    `,
    ).run({
      releasedAt: nowIso,
      updatedAt: nowIso,
      noShowCutoff,
    });

    db.prepare(
      `
      UPDATE bookings
      SET
        status = 'RELEASED',
        released_at = @releasedAt,
        release_reason = 'AUTO_ENDED',
        updated_at = @updatedAt
      WHERE status = 'CHECKED_IN'
        AND end_time <= @nowIso
    `,
    ).run({
      releasedAt: nowIso,
      updatedAt: nowIso,
      nowIso,
    });
  });

  transaction();
}

export async function getAvailability(filters: AvailabilityFilters) {
  const { start, end, capacity, needsDisplay, needsVideo, needsWhiteboard } = filters;

  assert(isAfter(end, start), "Invalid time range");

  await applyBookingLifecycle();

  const roomWhere: string[] = ["is_active = 1"];
  const roomParams: unknown[] = [];

  if (capacity !== undefined) {
    roomWhere.push("capacity >= ?");
    roomParams.push(capacity);
  }

  if (needsDisplay !== undefined) {
    roomWhere.push("has_display = ?");
    roomParams.push(needsDisplay ? 1 : 0);
  }

  if (needsVideo !== undefined) {
    roomWhere.push("has_video = ?");
    roomParams.push(needsVideo ? 1 : 0);
  }

  if (needsWhiteboard !== undefined) {
    roomWhere.push("has_whiteboard = ?");
    roomParams.push(needsWhiteboard ? 1 : 0);
  }

  const rooms = db
    .prepare(
      `
      SELECT id, code, name, location, floor, capacity,
             has_display, has_video, has_whiteboard, is_active
      FROM rooms
      WHERE ${roomWhere.join(" AND ")}
      ORDER BY capacity ASC, name ASC
    `,
    )
    .all(...roomParams) as {
    id: string;
    code: string;
    name: string;
    location: string;
    floor: string;
    capacity: number;
    has_display: number;
    has_video: number;
    has_whiteboard: number;
    is_active: number;
  }[];

  const startIso = start.toISOString();
  const endIso = end.toISOString();

  return rooms.map((row) => {
    const room = mapRoomRow(row);

    const conflict = db
      .prepare(
        `
        SELECT b.title, b.start_time, b.end_time, u.name as booked_by
        FROM bookings b
        JOIN users u ON u.id = b.booked_by_id
        WHERE b.room_id = ?
          AND b.status IN ('BOOKED', 'CHECKED_IN')
          AND b.start_time < ?
          AND b.end_time > ?
        ORDER BY b.start_time ASC
        LIMIT 1
      `,
      )
      .get(room.id, endIso, startIso) as
      | {
          title: string;
          start_time: string;
          end_time: string;
          booked_by: string;
        }
      | undefined;

    return {
      ...room,
      isAvailable: !conflict,
      conflict: conflict
        ? {
            title: conflict.title,
            startTime: conflict.start_time,
            endTime: conflict.end_time,
            bookedBy: conflict.booked_by,
          }
        : null,
    };
  });
}

export async function createBooking(input: CreateBookingInput) {
  const now = new Date();
  assert(input.startTime > now, "Start time must be in the future");

  const user = getUserById(input.userId);
  if (!user) {
    throw new BookingDomainError("User not found", 404);
  }

  const roomRow = db
    .prepare(
      `
      SELECT id, code, name, location, floor, capacity,
             has_display, has_video, has_whiteboard, is_active
      FROM rooms
      WHERE id = ?
      LIMIT 1
    `,
    )
    .get(input.roomId) as
    | {
        id: string;
        code: string;
        name: string;
        location: string;
        floor: string;
        capacity: number;
        has_display: number;
        has_video: number;
        has_whiteboard: number;
        is_active: number;
      }
    | undefined;

  if (!roomRow) {
    throw new BookingDomainError("Room not found", 404);
  }
  assert(Boolean(roomRow.is_active), "Room is not active", 409);
  assert(roomRow.capacity >= input.attendeeCount, "Room capacity is insufficient", 409);

  const occurrences = buildOccurrences(
    input.startTime,
    input.endTime,
    input.recurrence,
    input.recurrenceCount,
  );

  const insertBooking = db.prepare(`
    INSERT INTO bookings (
      id, title, agenda, start_time, end_time, attendee_count, status, channel,
      meeting_mode, meeting_link, summary_text,
      is_recurring, recurrence_pattern, recurrence_index, checked_in_at,
      released_at, release_reason, booked_by_id, room_id, created_at, updated_at
    ) VALUES (
      @id, @title, @agenda, @startTime, @endTime, @attendeeCount, 'BOOKED', @channel,
      @meetingMode, @meetingLink, NULL,
      @isRecurring, @recurrencePattern, @recurrenceIndex, NULL,
      NULL, NULL, @bookedById, @roomId, @createdAt, @updatedAt
    )
  `);

  const createTransaction = db.transaction((slots: Occurrence[]) => {
    const createdIds: string[] = [];

    for (const slot of slots) {
      const startIso = slot.startTime.toISOString();
      const endIso = slot.endTime.toISOString();
      assertNoConflict(input.roomId, startIso, endIso);

      const bookingId = `bk_${crypto.randomUUID()}`;
      const timestamp = new Date().toISOString();
      const meetingLink = generateMeetingLink(input.meetingMode);

      insertBooking.run({
        id: bookingId,
        title: input.title,
        agenda: input.agenda || null,
        startTime: startIso,
        endTime: endIso,
        attendeeCount: input.attendeeCount,
        channel: input.channel,
        meetingMode: input.meetingMode,
        meetingLink,
        isRecurring: input.recurrence === "NONE" ? 0 : 1,
        recurrencePattern: input.recurrence === "NONE" ? null : input.recurrence,
        recurrenceIndex: input.recurrence === "NONE" ? null : slot.recurrenceIndex,
        bookedById: input.userId,
        roomId: input.roomId,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      createdIds.push(bookingId);
    }

    return createdIds;
  });

  const createdIds = createTransaction(occurrences);

  const placeholders = createdIds.map(() => "?").join(",");
  return fetchJoinedBookings(
    `WHERE b.id IN (${placeholders}) ORDER BY b.start_time ASC`,
    createdIds,
  );
}

export async function getBookings(userId: string) {
  await applyBookingLifecycle();

  const user = getUserById(userId);
  if (!user) {
    throw new BookingDomainError("User not found", 404);
  }

  if (user.role === "ADMIN") {
    return fetchJoinedBookings(`ORDER BY b.start_time ASC, b.created_at DESC LIMIT 200`, []);
  }

  return fetchJoinedBookings(
    `WHERE b.booked_by_id = ? ORDER BY b.start_time ASC, b.created_at DESC LIMIT 200`,
    [userId],
  );
}

export async function getDashboard(userId: string) {
  await applyBookingLifecycle();

  const user = getUserById(userId);
  if (!user) {
    throw new BookingDomainError("User not found", 404);
  }

  const users = await getUsers();
  const now = new Date();
  const nowIso = now.toISOString();
  const todayStartIso = startOfDay(now).toISOString();

  const todayBookings =
    user.role === "ADMIN"
      ? fetchJoinedBookings(`WHERE b.start_time >= ? ORDER BY b.start_time ASC LIMIT 40`, [todayStartIso])
      : fetchJoinedBookings(
          `WHERE b.booked_by_id = ? AND b.start_time >= ? ORDER BY b.start_time ASC LIMIT 40`,
          [userId, todayStartIso],
        );

  const activeMeetings = fetchJoinedBookings(
    `
      WHERE b.status IN ('BOOKED', 'CHECKED_IN')
        AND b.start_time <= ?
        AND b.end_time >= ?
      ORDER BY r.name ASC
    `,
    [nowIso, nowIso],
  );

  const roomRows = db
    .prepare(
      `
      SELECT id, code, name, location, floor, capacity,
             has_display, has_video, has_whiteboard, is_active
      FROM rooms
      WHERE is_active = 1
      ORDER BY floor ASC, name ASC
    `,
    )
    .all() as {
    id: string;
    code: string;
    name: string;
    location: string;
    floor: string;
    capacity: number;
    has_display: number;
    has_video: number;
    has_whiteboard: number;
    is_active: number;
  }[];

  const rooms = roomRows.map(mapRoomRow);
  const activeByRoom = new Map(activeMeetings.map((booking) => [booking.room.id, booking]));

  const roomBoard = rooms.map((room) => {
    const activeBooking = activeByRoom.get(room.id) ?? null;

    return {
      ...room,
      isAvailableNow: !activeBooking,
      activeBooking,
    };
  });

  return {
    now: nowIso,
    user,
    users,
    roomBoard,
    todayBookings,
    stats: {
      totalRooms: rooms.length,
      activeMeetings: activeMeetings.length,
      availableRooms: roomBoard.filter((room) => room.isAvailableNow).length,
      todayBookings: todayBookings.length,
    },
  };
}

function getBookingById(bookingId: string): Booking | null {
  const bookings = fetchJoinedBookings(`WHERE b.id = ? LIMIT 1`, [bookingId]);
  return bookings[0] ?? null;
}

function ensureCanManageBooking(bookingId: string, userId: string) {
  const booking = getBookingById(bookingId);
  if (!booking) {
    throw new BookingDomainError("Booking not found", 404);
  }

  const actor = getUserById(userId);
  if (!actor) {
    throw new BookingDomainError("User not found", 404);
  }

  const isOwner = booking.bookedById === userId;
  const isAdmin = actor.role === "ADMIN";

  assert(isOwner || isAdmin, "You are not allowed to modify this booking", 403);

  return booking;
}

export async function checkInBooking(bookingId: string, userId: string) {
  await applyBookingLifecycle();

  const booking = ensureCanManageBooking(bookingId, userId);
  assert(booking.status === "BOOKED", "Only booked meetings can be checked in", 409);

  const now = new Date();
  const startTime = new Date(booking.startTime);
  const earliestCheckIn = subMinutes(startTime, AUTO_RELEASE_PRECHECK_MINUTES);
  const latestCheckIn = addMinutes(startTime, CHECK_IN_GRACE_MINUTES);

  assert(
    now >= earliestCheckIn && now <= latestCheckIn,
    `Check-in allowed from ${formatISO(earliestCheckIn)} to ${formatISO(latestCheckIn)}.`,
    409,
  );

  const nowIso = now.toISOString();

  db.prepare(
    `
    UPDATE bookings
    SET status = 'CHECKED_IN', checked_in_at = ?, updated_at = ?
    WHERE id = ?
  `,
  ).run(nowIso, nowIso, bookingId);

  return getBookingById(bookingId);
}

export async function releaseBooking(bookingId: string, userId: string) {
  await applyBookingLifecycle();

  const booking = ensureCanManageBooking(bookingId, userId);

  assert(
    BLOCKING_STATUSES.includes(booking.status),
    "Only active bookings can be released",
    409,
  );

  const nowIso = new Date().toISOString();

  db.prepare(
    `
    UPDATE bookings
    SET status = 'RELEASED', released_at = ?, release_reason = 'MANUAL', updated_at = ?
    WHERE id = ?
  `,
  ).run(nowIso, nowIso, bookingId);

  return getBookingById(bookingId);
}

export async function cancelBooking(bookingId: string, userId: string) {
  await applyBookingLifecycle();

  const booking = ensureCanManageBooking(bookingId, userId);
  assert(booking.status === "BOOKED", "Only upcoming booked meetings can be cancelled", 409);

  const nowIso = new Date().toISOString();

  db.prepare(
    `
    UPDATE bookings
    SET status = 'CANCELLED', updated_at = ?
    WHERE id = ?
  `,
  ).run(nowIso, bookingId);

  return getBookingById(bookingId);
}

export async function generateBookingSummary(bookingId: string, userId: string) {
  await applyBookingLifecycle();

  const booking = ensureCanManageBooking(bookingId, userId);
  const start = new Date(booking.startTime);
  const end = new Date(booking.endTime);
  const duration = differenceInMinutes(end, start);

  const summary = [
    `Meeting: ${booking.title}`,
    `Date: ${format(start, "dd MMM yyyy, hh:mm a")} - ${format(end, "hh:mm a")}`,
    `Room: ${booking.room.name} (${booking.room.floor})`,
    `Mode: ${booking.meetingMode}${booking.meetingLink ? ` | Link: ${booking.meetingLink}` : ""}`,
    `Planned participants: ${booking.attendeeCount}`,
    `Agenda: ${booking.agenda ?? "General discussion"}`,
    `Duration: ${duration} minutes`,
    `Status: ${booking.status}`,
    "Action items:",
    "1. Share key decisions with stakeholders.",
    "2. Track pending tasks before next meeting.",
    "3. Confirm next checkpoint schedule.",
  ].join("\n");

  db.prepare(
    `
    UPDATE bookings
    SET summary_text = ?, updated_at = ?
    WHERE id = ?
  `,
  ).run(summary, new Date().toISOString(), bookingId);

  return getBookingById(bookingId);
}

export async function getReminders(userId: string) {
  await applyBookingLifecycle();

  const user = await getUserByIdOrThrow(userId);
  const now = new Date();
  const nowIso = now.toISOString();
  const nextHourIso = addMinutes(now, 60).toISOString();

  const reminders =
    user.role === "ADMIN"
      ? fetchJoinedBookings(
          `
          WHERE b.status = 'BOOKED'
            AND b.start_time >= ?
            AND b.start_time <= ?
          ORDER BY b.start_time ASC
        `,
          [nowIso, nextHourIso],
        )
      : fetchJoinedBookings(
          `
          WHERE b.status = 'BOOKED'
            AND b.booked_by_id = ?
            AND b.start_time >= ?
            AND b.start_time <= ?
          ORDER BY b.start_time ASC
        `,
          [userId, nowIso, nextHourIso],
        );

  return reminders.map((booking) => ({
    booking,
    minutesToStart: Math.max(0, differenceInMinutes(new Date(booking.startTime), now)),
  }));
}

function getBookingDurationMinutes(booking: {
  startTime: string;
  endTime: string;
  status: BookingStatus;
  releasedAt: string | null;
  releaseReason: ReleaseReason | null;
}) {
  if (booking.status === "CANCELLED") {
    return 0;
  }

  if (booking.releaseReason === "NO_SHOW") {
    return 0;
  }

  const start = new Date(booking.startTime);
  const originalEnd = new Date(booking.endTime);
  const releasedEnd = booking.releasedAt ? new Date(booking.releasedAt) : null;

  const effectiveEnd =
    booking.status === "RELEASED" && releasedEnd && releasedEnd < originalEnd
      ? releasedEnd
      : originalEnd;

  return Math.max(0, differenceInMinutes(effectiveEnd, start));
}

export async function getAnalytics(userId: string) {
  const actor = getUserById(userId);
  if (!actor) {
    throw new BookingDomainError("User not found", 404);
  }
  assert(actor.role === "ADMIN", "Analytics is available only to admins", 403);

  await applyBookingLifecycle();

  const now = new Date();
  const sinceIso = subDays(now, 30).toISOString();

  const roomRows = db
    .prepare(
      `
      SELECT id, code, name, location, floor, capacity,
             has_display, has_video, has_whiteboard, is_active
      FROM rooms
      WHERE is_active = 1
      ORDER BY name ASC
    `,
    )
    .all() as {
    id: string;
    code: string;
    name: string;
    location: string;
    floor: string;
    capacity: number;
    has_display: number;
    has_video: number;
    has_whiteboard: number;
    is_active: number;
  }[];

  const rooms = roomRows.map(mapRoomRow);

  const bookings = fetchJoinedBookings(`WHERE b.start_time >= ? ORDER BY b.start_time ASC`, [sinceIso]);

  const totalBookings = bookings.length;
  const checkedInCount = bookings.filter((booking) => booking.checkedInAt !== null).length;
  const noShowCount = bookings.filter((booking) => booking.releaseReason === "NO_SHOW").length;
  const totalBookedMinutes = bookings.reduce(
    (acc, booking) => acc + getBookingDurationMinutes(booking),
    0,
  );

  const avgDuration = totalBookings ? Math.round(totalBookedMinutes / totalBookings) : 0;

  const statuses: BookingStatus[] = ["BOOKED", "CHECKED_IN", "RELEASED", "CANCELLED"];

  const statusBreakdown: Array<{ status: BookingStatus; count: number }> = statuses.map((status) => ({
    status,
    count: bookings.filter((booking) => booking.status === status).length,
  }));

  const dailyMap = new Map<string, number>();
  for (let dayOffset = 6; dayOffset >= 0; dayOffset -= 1) {
    const day = subDays(now, dayOffset);
    const key = day.toISOString().slice(0, 10);
    dailyMap.set(key, 0);
  }

  bookings.forEach((booking) => {
    const key = booking.startTime.slice(0, 10);
    if (dailyMap.has(key)) {
      dailyMap.set(key, (dailyMap.get(key) ?? 0) + 1);
    }
  });

  const roomUtilization = rooms.map((room) => {
    const roomBookings = bookings.filter((booking) => booking.roomId === room.id);
    const roomMinutes = roomBookings.reduce(
      (acc, booking) => acc + getBookingDurationMinutes(booking),
      0,
    );

    const utilization = totalBookedMinutes
      ? Number(((roomMinutes / totalBookedMinutes) * 100).toFixed(2))
      : 0;

    return {
      roomId: room.id,
      roomName: room.name,
      floor: room.floor,
      meetings: roomBookings.length,
      bookedMinutes: roomMinutes,
      utilization,
    };
  });

  return {
    windowDays: 30,
    kpis: {
      totalBookings,
      checkedInRate: totalBookings
        ? Number(((checkedInCount / totalBookings) * 100).toFixed(2))
        : 0,
      noShowRate: totalBookings ? Number(((noShowCount / totalBookings) * 100).toFixed(2)) : 0,
      averageDurationMinutes: avgDuration,
    },
    statusBreakdown,
    dailyBookings: Array.from(dailyMap.entries()).map(([date, count]) => ({
      date,
      count,
    })),
    roomUtilization: roomUtilization.sort((a, b) => b.utilization - a.utilization),
  };
}

export type ChatTurn = {
  role: "user" | "bot";
  text: string;
};

type ChatIntent =
  | "availability"
  | "specific_availability"
  | "hall_details"
  | "reminders"
  | "my_schedule"
  | "meeting_links"
  | "booking_help"
  | "checkin_rules"
  | "summary_help"
  | "export_help"
  | "analytics"
  | "recommendation"
  | "greeting"
  | "fallback";

export type ChatbotResponse = {
  answer: string;
  intent: ChatIntent;
  confidence: number;
  suggestions: string[];
};

function normalizeText(text: string) {
  return text.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

function scoreIntent(text: string, keywords: string[]) {
  return keywords.reduce((score, keyword) => {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = keyword.includes(" ")
      ? new RegExp(`\\b${escaped.replace(/\s+/g, "\\s+")}\\b`, "i")
      : new RegExp(`\\b${escaped}\\b`, "i");
    return score + (pattern.test(text) ? 1 : 0);
  }, 0);
}

function detectIntent(text: string, history: ChatTurn[]): { intent: ChatIntent; score: number } {
  const normalized = normalizeText(text);

  const keywordMap: Record<Exclude<ChatIntent, "fallback">, string[]> = {
    availability: ["free", "available", "vacant", "hall", "room", "empty"],
    specific_availability: [
      "tomorrow",
      "today",
      "from",
      "to",
      "pm",
      "am",
      "capacity",
      "people",
      "attendees",
      "seats",
    ],
    hall_details: ["who booked", "hall status", "about hall", "details of", "occupied"],
    reminders: ["reminder", "upcoming", "next meeting", "notify", "alert"],
    my_schedule: ["my meetings", "my schedule", "today", "calendar", "bookings"],
    meeting_links: ["zoom", "meet", "meeting link", "online", "video call"],
    booking_help: ["book", "booking", "reserve", "how to book", "schedule meeting"],
    checkin_rules: ["check in", "checkin", "no show", "release rule", "late"],
    summary_help: ["summary", "minutes", "mom", "action items", "recap"],
    export_help: ["export", "excel", "csv", "download report"],
    analytics: ["analytics", "insights", "utilization", "kpi", "trend"],
    recommendation: ["recommend", "best", "suggest", "ideal hall"],
    greeting: ["hi", "hello", "hey", "good morning", "good evening"],
  };

  const ranked = Object.entries(keywordMap)
    .map(([intent, keywords]) => ({
      intent: intent as ChatIntent,
      score: scoreIntent(normalized, keywords),
    }))
    .sort((a, b) => b.score - a.score);

  const top = ranked[0];

  // Follow-up context: short user message inherits previous probable intent.
  if (top.score === 0 && normalized.split(" ").length <= 4) {
    const previousUser = [...history].reverse().find((turn) => turn.role === "user");
    if (previousUser) {
      const previousTop = detectIntent(previousUser.text, []);
      if (previousTop.intent !== "fallback") {
        return { intent: previousTop.intent, score: 1 };
      }
    }
  }

  if (!top || top.score === 0) {
    return { intent: "fallback", score: 0 };
  }

  return top;
}

function intentConfidence(score: number) {
  if (score <= 0) {
    return 0.35;
  }
  if (score === 1) {
    return 0.62;
  }
  if (score === 2) {
    return 0.79;
  }
  return 0.9;
}

function buildSuggestions(intent: ChatIntent, isAdmin: boolean): string[] {
  const common = [
    "Which halls are free now?",
    "Show my upcoming reminders",
    "How do I create Zoom meeting booking?",
  ];

  const byIntent: Record<ChatIntent, string[]> = {
    availability: ["Show halls free now", "Which hall has video support?", "Find free hall for today"],
    specific_availability: ["Find hall tomorrow at 3 pm", "Need hall for 10 people today at 5 pm", "Which hall is free from 2 pm to 4 pm?"],
    hall_details: ["Who booked Maharaja Sabha now?", "Show status of Rajwada Chamber", "Which hall is occupied right now?"],
    reminders: ["Any reminders in next 1 hour?", "Show today's meetings", "Can I get my next meeting?"],
    my_schedule: ["Show my meetings today", "Show upcoming bookings", "Any cancelled meetings?"],
    meeting_links: ["How to create Google Meet booking?", "How to create Zoom booking?", "Where can I open meeting link?"],
    booking_help: ["How to book hall quickly?", "How to avoid conflict?", "How to cancel a booking?"],
    checkin_rules: ["What is check-in time window?", "What is no-show rule?", "How to release hall manually?"],
    summary_help: ["How to generate summary?", "Where is meeting summary shown?", "Can admin generate summaries?"],
    export_help: ["How to download excel csv?", "What export includes?", "Where is admin export button?"],
    analytics: ["Show utilization insight", "How to reduce no-show rate?", "Which halls are underused?"],
    recommendation: ["Recommend best hall for 8 people", "Best hall for online meeting now?", "Suggest hall with whiteboard"],
    greeting: common,
    fallback: common,
  };

  const merged = [...byIntent[intent], ...(isAdmin ? ["How to export all bookings?"] : [])];
  return merged.slice(0, 4);
}

function getFreeRoomsNow(nowIso: string) {
  return db
    .prepare(
      `
      SELECT r.name
      FROM rooms r
      WHERE r.is_active = 1
        AND NOT EXISTS (
          SELECT 1
          FROM bookings b
          WHERE b.room_id = r.id
            AND b.status IN ('BOOKED', 'CHECKED_IN')
            AND b.start_time <= ?
            AND b.end_time >= ?
        )
      ORDER BY r.name ASC
    `,
    )
    .all(nowIso, nowIso) as Array<{ name: string }>;
}

function getTodayBookingsForUser(userId: string, role: Role) {
  const todayStartIso = startOfDay(new Date()).toISOString();

  if (role === "ADMIN") {
    return fetchJoinedBookings(
      `WHERE b.start_time >= ? ORDER BY b.start_time ASC LIMIT 10`,
      [todayStartIso],
    );
  }

  return fetchJoinedBookings(
    `WHERE b.booked_by_id = ? AND b.start_time >= ? ORDER BY b.start_time ASC LIMIT 10`,
    [userId, todayStartIso],
  );
}

function parseTimePoint(token: string, base: Date): Date | null {
  const match = token.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!match) {
    return null;
  }

  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const meridiem = match[3]?.toLowerCase();

  if (meridiem === "pm" && hour < 12) {
    hour += 12;
  }
  if (meridiem === "am" && hour === 12) {
    hour = 0;
  }
  if (!meridiem && hour >= 1 && hour <= 7) {
    hour += 12;
  }

  const value = new Date(base);
  value.setHours(hour, minute, 0, 0);
  return value;
}

function parseAvailabilityQuery(
  originalMessage: string,
): { start: Date; end: Date; capacity?: number } {
  const message = originalMessage.toLowerCase();
  const base = new Date();

  if (message.includes("tomorrow")) {
    base.setDate(base.getDate() + 1);
  }
  base.setSeconds(0, 0);

  let start = new Date(base);
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);

  let end = new Date(start.getTime() + 60 * 60 * 1000);

  const rangeMatch = message.match(
    /from\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:to|-)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
  );

  if (rangeMatch) {
    const parsedStart = parseTimePoint(rangeMatch[1], base);
    const parsedEnd = parseTimePoint(rangeMatch[2], base);
    if (parsedStart && parsedEnd && parsedEnd > parsedStart) {
      start = parsedStart;
      end = parsedEnd;
    }
  } else {
    const atMatch = message.match(/(?:at|around)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
    if (atMatch) {
      const parsed = parseTimePoint(atMatch[1], base);
      if (parsed) {
        start = parsed;
        end = new Date(start.getTime() + 60 * 60 * 1000);
      }
    }
  }

  const capacityMatch =
    message.match(/\bfor\s+(\d{1,3})\s*(?:people|persons|attendees|members)?\b/i) ??
    message.match(/\b(\d{1,3})\s*(?:people|persons|attendees|members|seats)\b/i);
  const capacity = capacityMatch ? Number(capacityMatch[1]) : undefined;

  return { start, end, capacity };
}

function findHallMention(text: string): Room | null {
  const normalizedText = normalizeText(text);
  const rooms = db
    .prepare(
      `
      SELECT id, code, name, location, floor, capacity, has_display, has_video, has_whiteboard, is_active
      FROM rooms
      WHERE is_active = 1
    `,
    )
    .all() as Array<{
    id: string;
    code: string;
    name: string;
    location: string;
    floor: string;
    capacity: number;
    has_display: number;
    has_video: number;
    has_whiteboard: number;
    is_active: number;
  }>;

  for (const row of rooms) {
    const room = mapRoomRow(row);
    if (normalizedText.includes(normalizeText(room.name))) {
      return room;
    }
  }

  return null;
}

function getActiveBookingForRoom(roomId: string, nowIso: string): Booking | null {
  const rows = fetchJoinedBookings(
    `
      WHERE b.room_id = ?
        AND b.status IN ('BOOKED', 'CHECKED_IN')
        AND b.start_time <= ?
        AND b.end_time >= ?
      ORDER BY b.start_time ASC
      LIMIT 1
    `,
    [roomId, nowIso, nowIso],
  );

  return rows[0] ?? null;
}

export async function chatbotReply(
  userId: string,
  message: string,
  history: ChatTurn[] = [],
): Promise<ChatbotResponse> {
  const user = await getUserByIdOrThrow(userId);
  const now = new Date();
  const nowIso = now.toISOString();
  const text = normalizeText(message);
  const { intent, score } = detectIntent(text, history);
  const confidence = intentConfidence(score);

  if (intent === "greeting") {
    return {
      intent,
      confidence,
      answer: `Hi ${user.name.split(" ")[0]}! I can help with halls, bookings, reminders, links, summaries, and ${
        user.role === "ADMIN" ? "analytics/export." : "check-in rules."
      }`,
      suggestions: buildSuggestions(intent, user.role === "ADMIN"),
    };
  }

  if (intent === "specific_availability") {
    const query = parseAvailabilityQuery(message);
    const rooms = await getAvailability({
      start: query.start,
      end: query.end,
      capacity: query.capacity,
    });

    const available = rooms.filter((room) => room.isAvailable);
    const timeLabel = `${format(query.start, "dd MMM HH:mm")} - ${format(query.end, "HH:mm")}`;

    return {
      intent,
      confidence,
      answer:
        available.length === 0
          ? `No hall is available for ${timeLabel}${query.capacity ? ` (capacity ${query.capacity})` : ""}.`
          : `For ${timeLabel}${query.capacity ? ` and capacity ${query.capacity}` : ""}, available halls: ${available
              .slice(0, 5)
              .map((room) => `${room.name} (cap ${room.capacity})`)
              .join(", ")}.`,
      suggestions: buildSuggestions(intent, user.role === "ADMIN"),
    };
  }

  if (intent === "hall_details") {
    const hall = findHallMention(message);
    if (!hall) {
      return {
        intent,
        confidence: Math.max(0.45, confidence - 0.2),
        answer:
          "Please include the hall name (for example: 'Who booked Maharaja Sabha right now?').",
        suggestions: [
          "Who booked Maharaja Sabha now?",
          "Show status of Rajwada Chamber",
          "Which hall is occupied right now?",
        ],
      };
    }

    const activeBooking = getActiveBookingForRoom(hall.id, nowIso);
    return {
      intent,
      confidence,
      answer: activeBooking
        ? `${hall.name} is currently occupied by ${activeBooking.bookedBy.name} for "${activeBooking.title}" until ${format(new Date(activeBooking.endTime), "HH:mm")}.`
        : `${hall.name} is currently available. Capacity ${hall.capacity}, floor ${hall.floor}, video ${hall.hasVideo ? "enabled" : "not available"}.`,
      suggestions: buildSuggestions(intent, user.role === "ADMIN"),
    };
  }

  if (intent === "availability") {
    const freeRooms = getFreeRoomsNow(nowIso);
    return {
      intent,
      confidence,
      answer:
        freeRooms.length === 0
          ? "No hall is free right now. Try checking availability for a later slot."
          : `Right now, free halls are: ${freeRooms.map((room) => room.name).join(", ")}.`,
      suggestions: buildSuggestions(intent, user.role === "ADMIN"),
    };
  }

  if (intent === "reminders") {
    const reminders = await getReminders(userId);

    return {
      intent,
      confidence,
      answer:
        reminders.length === 0
          ? "No reminder in next 60 minutes."
          : `Upcoming reminders: ${reminders
              .slice(0, 3)
              .map(
                (item) =>
                  `${item.booking.title} in ${item.minutesToStart} min at ${item.booking.room.name}`,
              )
              .join(" | ")}`,
      suggestions: buildSuggestions(intent, user.role === "ADMIN"),
    };
  }

  if (intent === "my_schedule") {
    const todayBookings = getTodayBookingsForUser(userId, user.role);

    return {
      intent,
      confidence,
      answer:
        todayBookings.length === 0
          ? "You have no meetings scheduled for today."
          : `Today's schedule: ${todayBookings
              .slice(0, 5)
              .map(
                (booking) =>
                  `${format(new Date(booking.startTime), "HH:mm")} ${booking.title} (${booking.room.name})`,
              )
              .join(" | ")}`,
      suggestions: buildSuggestions(intent, user.role === "ADMIN"),
    };
  }

  if (intent === "meeting_links") {
    return {
      intent,
      confidence,
      answer:
        "When creating booking, select Meeting Mode as Google Meet or Zoom. The link is generated automatically and appears in booking card as 'Open meeting link'.",
      suggestions: buildSuggestions(intent, user.role === "ADMIN"),
    };
  }

  if (intent === "booking_help") {
    return {
      intent,
      confidence,
      answer:
        "Quick flow: 1) Fill title/date/time/attendees 2) Click 'Find Halls' 3) Select available hall 4) Click 'Book Now'. If a hall conflicts, it is shown as busy.",
      suggestions: buildSuggestions(intent, user.role === "ADMIN"),
    };
  }

  if (intent === "recommendation") {
    const query = parseAvailabilityQuery(message);
    const rooms = await getAvailability({
      start: query.start,
      end: query.end,
      capacity: query.capacity,
    });
    const available = rooms.filter((room) => room.isAvailable);

    const ranked = available
      .map((room) => ({
        room,
        score:
          room.capacity * 0.2 +
          (room.hasVideo ? 12 : 0) +
          (room.hasWhiteboard ? 6 : 0) +
          (room.hasDisplay ? 4 : 0),
      }))
      .sort((a, b) => b.score - a.score);

    const best = ranked[0]?.room;

    return {
      intent,
      confidence,
      answer: best
        ? `Best recommendation: ${best.name} (cap ${best.capacity}, ${best.hasVideo ? "video-enabled" : "offline-focused"}, floor ${best.floor}).`
        : "No suitable hall found for that slot. Try changing time or attendee count.",
      suggestions: buildSuggestions(intent, user.role === "ADMIN"),
    };
  }

  if (intent === "checkin_rules") {
    return {
      intent,
      confidence,
      answer:
        "Check-in is allowed from 30 minutes before start until 10 minutes after start. If no check-in happens in this window, booking auto-releases as NO_SHOW.",
      suggestions: buildSuggestions(intent, user.role === "ADMIN"),
    };
  }

  if (intent === "summary_help") {
    return {
      intent,
      confidence,
      answer:
        "For released/cancelled meetings, click 'Generate Summary'. The summary is saved and displayed under that booking with decisions and action items.",
      suggestions: buildSuggestions(intent, user.role === "ADMIN"),
    };
  }

  if (intent === "export_help") {
    return {
      intent,
      confidence,
      answer:
        user.role === "ADMIN"
          ? "Click 'Excel/CSV Export' in admin portal. It downloads all booking data (owner, hall, time, status, meeting mode, link, summary)."
          : "Export is available for admin only. Ask admin to download from Admin Portal > Excel/CSV Export.",
      suggestions: buildSuggestions(intent, user.role === "ADMIN"),
    };
  }

  if (intent === "analytics") {
    if (user.role !== "ADMIN") {
      return {
        intent,
        confidence,
        answer: "Analytics is available in admin portal only.",
        suggestions: buildSuggestions(intent, false),
      };
    }

    const analytics = await getAnalytics(userId);
    const topRoom = analytics.roomUtilization[0];

    return {
      intent,
      confidence,
      answer: `Last 30 days: total bookings ${analytics.kpis.totalBookings}, check-in rate ${analytics.kpis.checkedInRate}%, no-show ${analytics.kpis.noShowRate}%. Most utilized hall: ${topRoom?.roomName ?? "N/A"} (${topRoom?.utilization ?? 0}%).`,
      suggestions: buildSuggestions(intent, true),
    };
  }

  return {
    intent: "fallback",
    confidence,
    answer:
      "I didn't fully get that. I can help with hall availability, today's schedule, reminders, Meet/Zoom setup, check-in rules, summaries, analytics, and export.",
    suggestions: buildSuggestions("fallback", user.role === "ADMIN"),
  };
}

function escapeCsv(value: string | number | null) {
  if (value === null) {
    return "";
  }

  const stringValue = String(value);
  if (
    stringValue.includes(",") ||
    stringValue.includes("\n") ||
    stringValue.includes('"')
  ) {
    return `"${stringValue.replaceAll('"', '""')}"`;
  }

  return stringValue;
}

export async function getBookingsCsv(userId: string): Promise<string> {
  const user = await getUserByIdOrThrow(userId);
  assert(user.role === "ADMIN", "Export is available only to admins", 403);

  const bookings = fetchJoinedBookings(`ORDER BY b.start_time DESC`, []);

  const header = [
    "Booking ID",
    "Title",
    "Hall",
    "Floor",
    "Booked By",
    "Start",
    "End",
    "Status",
    "Meeting Mode",
    "Meeting Link",
    "Summary",
  ];

  const rows = bookings.map((booking) => [
    booking.id,
    booking.title,
    booking.room.name,
    booking.room.floor,
    booking.bookedBy.name,
    booking.startTime,
    booking.endTime,
    booking.status,
    booking.meetingMode,
    booking.meetingLink,
    booking.summaryText,
  ]);

  return [header, ...rows]
    .map((row) => row.map((cell) => escapeCsv(cell ?? null)).join(","))
    .join("\n");
}
