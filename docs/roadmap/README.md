# Gulch App Roadmap

**Source of truth:** Figma board *"GULCH App Info. Architecture"* (`tAidE82Qu1ZQ9tFoFjLpEF`), extracted 2026-06-29.
The board is organized as **versioned columns (v1–v7)**, each with a **mobile track** (top) and an **`admin` track** (bottom). A milestone is **done only when both tracks' epics are done.**

> Visual/UI for any of these comes from Figma **design** files only (this board is information-architecture, not visual design). Nothing visual gets built without a Figma design reference.

---

## Milestone 0 — Foundation (kickoff, this phase — no UI)
Infra + data so every later milestone builds against real data while designs land. Defined in `../kickoff-architecture/`.

## v1 — Events List & Lineup
**Mobile:** Home (your events / coming soon, trending w/ # saves, hotspots now (heatmap), recently viewed events & galleries, internal banner) · Events Browse Calendar · Events Browse List · Event Details · Add Event to Your Lineup · Your Lineup · Export Event to Your Calendar · Newsletter
**Admin:** v1 Events Management · v1 Organizations Management · v1 Locations Management · Home Page Cards (images/links) · Newsletter Tab Link
**Nav bar:** Home · Calendar · Map (placeholder) · Your Lineup · Newsletter

## v2 — Events Maps & Share
**Mobile:** Events Map By Location + Date · Events Attendance Realtime Heatmap · Export Event to Calendar · Share Event · Share Your Location
**Admin:** v2 Events Management · v2 Locations Management
**Nav bar:** Home · Calendar · Map · Your Lineup · Newsletter

## v3 — Marketplace + Featured Payment
**Mobile:** Marketplace Directory List · Marketplace Details · Marketplace Checkout / Payment · Featured Event Payment Flow (Stripe redirect from Google Form)
**Admin:** Marketplace Items Management · Marketplace Payments Management · Featured Events Design & Behavior Management · Featured Events Payment Management
**Nav bar:** Home · Calendar · Your Lineup · Marketplace · Profile

## v4 — Org Directory + Profiles
**Mobile:** Organizations Directory List · Organizations Directory Map · Organization Profile Public View
**Admin:** v2 Organizations Management
**Nav bar:** Home · Map · Your Lineup · Marketplace · Profile

## v5 — User Accounts
**Mobile:** Onboarding + Create New User/Org Profile · Login · Forgot Password · User Profile (Public / Self-Edit) · Organization Profile (Self-Edit) · Settings · Delete Account · Share Your Lineup
**Admin:** v1 User Management
**Nav bar:** Home · Calendar · Your Lineup · Marketplace · Profile

## v6 — Submit Events
**Mobile:** Submit Event Form · Edit Event · Manage Events List
**Admin:** Events Staging for Approval · v2 User Management
**Nav bar:** Home · Calendar · Your Lineup · Marketplace · Profile

## v7 — Membership + Sponsorship Management
**Mobile:** Buy Sponsorship / Membership · Manage Sponsorship / Membership · Mutuals · Events Calendar Swipe to Match
**Admin:** Sponsorship / Membership Mgmt · v4 User Management
**Nav bar:** Home · Calendar · Your Lineup · Marketplace · Profile

## THE FUTURE
Art Fair (end of September).

---

## Notes / dependencies (first-principles)
- **Data dependency:** v1–v2 ride entirely on the **Webflow-sourced Locations/Events/Shows** data — exactly what the kickoff pipeline delivers. v3+ introduce net-new entities (marketplace, orgs, users, payments) **not present in Webflow** → new Supabase tables (anticipated in the v-next schema).
- **Heatmap (v1 Home "hotspots now" + v2)** requires **PostGIS + coordinates** → the kickoff geocoding step is the enabler.
- **Auth (v5)** = Supabase Auth (service-role key already provisioned). Not required until v5, but RLS is designed in from v1.
- **Payments (v3)** = Stripe (per board) — out of kickoff scope.
