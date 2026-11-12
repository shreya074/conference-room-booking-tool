# Orientbell Conference Room Booking Tool

A simplified hackathon-ready conference room system with separate admin and user portals.

## Main URLs

- `/` Home (choose portal)
- `/user/login` Employee login
- `/admin/login` Admin login
- `/user` User dashboard
- `/admin` Admin dashboard

## Default Credentials

- User 1: `gnanachaitanyature@gmail.com` / `User@99899`
- User 2: `raza@gmail.com` / `User@99738`
- Admin: `navneeth@gmail.com` / `Admin@99899`

## Features Implemented

- Separate authentication for users and admins
- Password login flow for admin
- Session-protected backend APIs
- Admin can see all user bookings/work
- Meet/Zoom/Offline scheduling with auto-generated links
- Reminder section (upcoming meetings in next 60 mins)
- AI help/chatbot section
- Meeting summary generation per booking
- Admin export to Excel-friendly CSV (`/api/admin/export`)
- Indian fancy hall names:
  - Indraprastha Darbar
  - Maharaja Sabha
  - Kohinoor Kendra
  - Surya Mahal
  - Rajwada Chamber

## Quick Start

1. `npm install`
2. `npm run dev`
3. Open `http://localhost:3000`

## Reset Database

If you want fresh seed data:

1. `npm run db:reset`
2. `npm run dev`

## Notes

- The app uses SQLite (`data/conference-booking.db`) with automatic schema upgrades.
- CSV export opens directly in Excel/Google Sheets.
