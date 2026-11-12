import fs from "node:fs";
import path from "node:path";

const dbPath = path.join(process.cwd(), "data", "conference-booking.db");

if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
  console.log(`Deleted ${dbPath}`);
} else {
  console.log(`No DB file found at ${dbPath}`);
}

console.log("Database will be recreated and seeded on next app start/API call.");
