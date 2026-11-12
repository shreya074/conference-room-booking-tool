import crypto from "node:crypto";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "conference-booking.db");

type GlobalWithDb = typeof globalThis & {
  __orientbellDb?: Database.Database;
  __orientbellSeeded?: boolean;
};

function ensureDirectory() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
}

function nowIso() {
  return new Date().toISOString();
}

export function hashPassword(password: string) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function hasColumn(db: Database.Database, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
}

function addColumnIfMissing(
  db: Database.Database,
  table: string,
  column: string,
  columnSql: string,
) {
  if (!hasColumn(db, table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnSql}`);
  }
}

function upgradeSchema(db: Database.Database) {
  addColumnIfMissing(db, "users", "password_hash", "password_hash TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, "users", "is_blocked", "is_blocked INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(db, "users", "blocked_reason", "blocked_reason TEXT");
  addColumnIfMissing(db, "users", "blocked_at", "blocked_at TEXT");
  addColumnIfMissing(db, "users", "blocked_by_id", "blocked_by_id TEXT");

  addColumnIfMissing(db, "bookings", "meeting_mode", "meeting_mode TEXT NOT NULL DEFAULT 'OFFLINE'");
  addColumnIfMissing(db, "bookings", "meeting_link", "meeting_link TEXT");
  addColumnIfMissing(db, "bookings", "summary_text", "summary_text TEXT");

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_access_requests (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      department TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED')),
      reviewed_by_id TEXT,
      reviewed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(reviewed_by_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_user_access_requests_status
      ON user_access_requests(status, created_at);
  `);
}

function applyFancyRoomNames(db: Database.Database) {
  const roomMap: Record<string, string> = {
    "HQ-A1": "Indraprastha Darbar",
    "HQ-B2": "Maharaja Sabha",
    "PLT-C1": "Kohinoor Kendra",
    "PLT-D4": "Surya Mahal",
    "HQ-C3": "Rajwada Chamber",
  };

  const update = db.prepare("UPDATE rooms SET name = @name, updated_at = @updatedAt WHERE code = @code");
  const updatedAt = nowIso();

  const transaction = db.transaction(() => {
    for (const [code, name] of Object.entries(roomMap)) {
      update.run({ code, name, updatedAt });
    }
  });

  transaction();
}

function applyCredentialDefaults(db: Database.Database) {
  const canonicalUsers = [
    {
      id: "usr_admin_aditi",
      name: "Navneeth",
      email: "navneeth@gmail.com",
      role: "ADMIN",
      department: "Facilities",
      password: "Admin@99899",
    },
    {
      id: "usr_rahul_sales",
      name: "Gnana chaitanya ture",
      email: "gnanachaitanyature@gmail.com",
      role: "EMPLOYEE",
      department: "Sales",
      password: "User@99899",
    },
    {
      id: "usr_nisha_ops",
      name: "Raza",
      email: "raza@gmail.com",
      role: "EMPLOYEE",
      department: "Plant Operations",
      password: "User@99738",
    },
  ] as const;

  const insertUser = db.prepare(`
    INSERT INTO users (id, name, email, role, department, password_hash, created_at, updated_at)
    VALUES (@id, @name, @email, @role, @department, @passwordHash, @createdAt, @updatedAt)
  `);

  const existsById = db.prepare("SELECT id FROM users WHERE id = ? LIMIT 1");
  const existsByEmail = db.prepare("SELECT id FROM users WHERE lower(email) = lower(?) LIMIT 1");
  const updatedAt = nowIso();

  const transaction = db.transaction(() => {
    for (const user of canonicalUsers) {
      const idExists = existsById.get(user.id);
      const emailExists = existsByEmail.get(user.email);
      if (idExists || emailExists) {
        continue;
      }

      insertUser.run({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        passwordHash: hashPassword(user.password),
        createdAt: updatedAt,
        updatedAt,
      });
    }
  });

  transaction();
}

function applyMeetingModeDefaults(db: Database.Database) {
  db.prepare(
    `
    UPDATE bookings
    SET meeting_mode = 'OFFLINE'
    WHERE meeting_mode IS NULL OR meeting_mode = ''
  `,
  ).run();
}

function removeLegacyDemoData(db: Database.Database) {
  const demoBookingIds = [
    "bk_dispatch_sync",
    "bk_retail_qbr",
    "bk_safety_committee",
    "bk_no_show_demo",
    "bk_design_huddle",
  ];

  const placeholders = demoBookingIds.map(() => "?").join(",");
  db.prepare(`DELETE FROM bookings WHERE id IN (${placeholders})`).run(...demoBookingIds);

  db.prepare("DELETE FROM users WHERE id = ?").run("usr_arjun_marketing");
}

function seedDatabase(db: Database.Database) {
  const userCount = db
    .prepare("SELECT COUNT(*) as count FROM users")
    .get() as { count: number };

  if (userCount.count > 0) {
    applyFancyRoomNames(db);
    applyCredentialDefaults(db);
    applyMeetingModeDefaults(db);
    removeLegacyDemoData(db);
    return;
  }

  const users = [
    {
      id: "usr_admin_aditi",
      name: "Navneeth",
      email: "navneeth@gmail.com",
      role: "ADMIN",
      department: "Facilities",
      passwordHash: hashPassword("Admin@99899"),
    },
    {
      id: "usr_rahul_sales",
      name: "Gnana chaitanya ture",
      email: "gnanachaitanyature@gmail.com",
      role: "EMPLOYEE",
      department: "Sales",
      passwordHash: hashPassword("User@99899"),
    },
    {
      id: "usr_nisha_ops",
      name: "Raza",
      email: "raza@gmail.com",
      role: "EMPLOYEE",
      department: "Plant Operations",
      passwordHash: hashPassword("User@99738"),
    },
  ];

  const rooms = [
    {
      id: "room_atlas",
      code: "HQ-A1",
      name: "Indraprastha Darbar",
      location: "Corporate HQ",
      floor: "1st Floor",
      capacity: 6,
      hasDisplay: 1,
      hasVideo: 1,
      hasWhiteboard: 1,
    },
    {
      id: "room_terra",
      code: "HQ-B2",
      name: "Maharaja Sabha",
      location: "Corporate HQ",
      floor: "2nd Floor",
      capacity: 10,
      hasDisplay: 1,
      hasVideo: 1,
      hasWhiteboard: 1,
    },
    {
      id: "room_kiln",
      code: "PLT-C1",
      name: "Kohinoor Kendra",
      location: "Sikandrabad Plant",
      floor: "Admin Block",
      capacity: 12,
      hasDisplay: 1,
      hasVideo: 0,
      hasWhiteboard: 1,
    },
    {
      id: "room_mosaic",
      code: "PLT-D4",
      name: "Surya Mahal",
      location: "Sikandrabad Plant",
      floor: "Admin Block",
      capacity: 20,
      hasDisplay: 1,
      hasVideo: 1,
      hasWhiteboard: 0,
    },
    {
      id: "room_granite",
      code: "HQ-C3",
      name: "Rajwada Chamber",
      location: "Corporate HQ",
      floor: "3rd Floor",
      capacity: 8,
      hasDisplay: 1,
      hasVideo: 0,
      hasWhiteboard: 1,
    },
  ];

  const insertUser = db.prepare(`
    INSERT INTO users (id, name, email, role, department, password_hash, created_at, updated_at)
    VALUES (@id, @name, @email, @role, @department, @passwordHash, @createdAt, @updatedAt)
  `);

  const insertRoom = db.prepare(`
    INSERT INTO rooms (
      id, code, name, location, floor, capacity, has_display,
      has_video, has_whiteboard, is_active, created_at, updated_at
    )
    VALUES (
      @id, @code, @name, @location, @floor, @capacity, @hasDisplay,
      @hasVideo, @hasWhiteboard, 1, @createdAt, @updatedAt
    )
  `);

  const transaction = db.transaction(() => {
    const timestamp = nowIso();
    for (const user of users) {
      insertUser.run({ ...user, createdAt: timestamp, updatedAt: timestamp });
    }
    for (const room of rooms) {
      insertRoom.run({ ...room, createdAt: timestamp, updatedAt: timestamp });
    }
  });

  transaction();
}

function createDb() {
  ensureDirectory();

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL CHECK(role IN ('ADMIN', 'EMPLOYEE')),
      department TEXT NOT NULL,
      password_hash TEXT NOT NULL DEFAULT '',
      is_blocked INTEGER NOT NULL DEFAULT 0,
      blocked_reason TEXT,
      blocked_at TEXT,
      blocked_by_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(blocked_by_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      location TEXT NOT NULL,
      floor TEXT NOT NULL,
      capacity INTEGER NOT NULL,
      has_display INTEGER NOT NULL DEFAULT 1,
      has_video INTEGER NOT NULL DEFAULT 0,
      has_whiteboard INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      agenda TEXT,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      attendee_count INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('BOOKED', 'CHECKED_IN', 'RELEASED', 'CANCELLED')),
      channel TEXT NOT NULL CHECK(channel IN ('WEB', 'MOBILE', 'KIOSK', 'OUTLOOK')),
      is_recurring INTEGER NOT NULL DEFAULT 0,
      recurrence_pattern TEXT,
      recurrence_index INTEGER,
      checked_in_at TEXT,
      released_at TEXT,
      release_reason TEXT CHECK(release_reason IN ('MANUAL', 'NO_SHOW', 'AUTO_ENDED')),
      meeting_mode TEXT NOT NULL DEFAULT 'OFFLINE',
      meeting_link TEXT,
      summary_text TEXT,
      booked_by_id TEXT NOT NULL,
      room_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(booked_by_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(room_id) REFERENCES rooms(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_access_requests (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      department TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED')),
      reviewed_by_id TEXT,
      reviewed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(reviewed_by_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_bookings_room_time ON bookings(room_id, start_time, end_time);
    CREATE INDEX IF NOT EXISTS idx_bookings_user_time ON bookings(booked_by_id, start_time);
    CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
    CREATE INDEX IF NOT EXISTS idx_user_access_requests_status ON user_access_requests(status, created_at);
  `);

  upgradeSchema(db);
  return db;
}

const globalWithDb = globalThis as GlobalWithDb;
export const db = globalWithDb.__orientbellDb ?? createDb();

if (process.env.NODE_ENV !== "production") {
  globalWithDb.__orientbellDb = db;
}

export function ensureSeeded() {
  if (globalWithDb.__orientbellSeeded) {
    return;
  }

  seedDatabase(db);
  globalWithDb.__orientbellSeeded = true;
}

export const dbPath = DB_PATH;
