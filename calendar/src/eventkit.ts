import { execFile } from "node:child_process";
import { join } from "node:path";

const BINARY = join(__dirname, "calendar-helper");

function runHelper(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(BINARY, args, { timeout: 30000, maxBuffer: 2 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        // Try to parse JSON error from stdout
        try {
          const parsed = JSON.parse(stdout);
          if (parsed.error) {
            reject(new Error(parsed.error));
            return;
          }
        } catch {}
        reject(new Error(stderr || error.message));
        return;
      }
      resolve(stdout);
    });
  });
}

/**
 * Parse a flexible date string into ISO 8601 format for the Swift helper.
 * Handles: "March 9, 2026", "9 March 2026", "2026-03-09",
 * "March 15, 2025 at 2:00 PM", "Monday, 9 March 2026", etc.
 */
export function dateToISO(input: string): string {
  // Date-only inputs mean midnight on the home Mac, never midnight in UTC.
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const check = new Date(`${input}T00:00:00Z`);
    if (Number.isNaN(check.getTime()) || check.toISOString().slice(0, 10) !== input) throw new Error("Invalid date.");
    return `${input}T00:00:00`;
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(input)) {
    if (Number.isNaN(new Date(input).getTime())) throw new Error("Invalid date.");
    return input;
  }
  // Strip day names like "Monday, "
  const cleaned = input.replace(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s*/i, "");

  // Extract time if present
  let hours = 0, minutes = 0;
  const timeMatch = cleaned.match(/\bat\s+(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (timeMatch) {
    hours = parseInt(timeMatch[1]);
    minutes = parseInt(timeMatch[2]);
    if (timeMatch[3]?.toUpperCase() === "PM" && hours < 12) hours += 12;
    if (timeMatch[3]?.toUpperCase() === "AM" && hours === 12) hours = 0;
  }

  // Remove time portion for date parsing
  const dateOnly = cleaned.replace(/\s*\bat\s+\d{1,2}:\d{2}\s*(AM|PM)?/i, "").trim();

  const parsed = new Date(dateOnly);
  if (isNaN(parsed.getTime())) {
    throw new Error(`Invalid date: "${input}"`);
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");

  return `${year}-${month}-${day}T${hh}:${mm}:00`;
}

export async function listCalendars(): Promise<{ name: string; description: string }[]> {
  const raw = await runHelper(["list-calendars"]);
  return JSON.parse(raw);
}

export async function listAllEvents(
  fromDate: string,
  toDate: string
): Promise<{ summary: string; startDate: string; endDate: string; location: string | null; calendar: string; uid: string }[]> {
  const from = dateToISO(fromDate);
  const to = dateToISO(toDate);
  const raw = await runHelper(["list-events", "--from", from, "--to", to]);
  return JSON.parse(raw);
}

export async function listEvents(
  calendarName: string,
  fromDate: string,
  toDate: string
): Promise<{ summary: string; startDate: string; endDate: string; location: string | null; uid: string }[]> {
  const from = dateToISO(fromDate);
  const to = dateToISO(toDate);
  const raw = await runHelper(["list-events", "--from", from, "--to", to, "--calendar", calendarName]);
  const events: { summary: string; startDate: string; endDate: string; location: string | null; calendar: string; uid: string }[] = JSON.parse(raw);
  // Strip calendar field to match original signature
  return events.map(({ calendar, ...rest }) => rest);
}

export async function getEvent(summary: string, calendarName?: string): Promise<{
  summary: string;
  startDate: string;
  endDate: string;
  location: string | null;
  description: string | null;
  url: string | null;
  uid: string;
  allDay: boolean;
}> {
  const args = ["get-event", "--title", summary];
  if (calendarName) args.push("--calendar", calendarName);
  const raw = await runHelper(args);
  return JSON.parse(raw);
}

export async function searchEvents(
  query: string,
  calendarName?: string
): Promise<{ summary: string; startDate: string; endDate: string; calendar: string; uid: string }[]> {
  const args = ["search-events", "--query", query];
  if (calendarName) args.push("--calendar", calendarName);
  const raw = await runHelper(args);
  return JSON.parse(raw);
}
