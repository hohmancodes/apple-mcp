import { execFile } from "node:child_process";

export function sanitize(input: string): string {
  return input
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r\n/g, "\\n")
    .replace(/\r/g, "\\n")
    .replace(/\n/g, "\\n");
}

export function runAppleScript(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("osascript", ["-e", script], { timeout: 30000, maxBuffer: 2 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`AppleScript error: ${stderr || error.message}`));
        return;
      }
      resolve(stdout.trimEnd());
    });
  });
}

/**
 * Parse a date string into components, handling various formats:
 * "March 9, 2026", "9 March 2026", "Monday, 9 March 2026",
 * "2026-03-09", "March 15, 2025 at 2:00 PM", etc.
 * Returns locale-independent AppleScript to build the date from components.
 */
export function dateToAppleScript(input: string, varName: string): string {
  // Strip day names like "Monday, " or "Friday, "
  const cleaned = input.replace(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s*/i, "");

  // Extract time if present (e.g. "at 2:00 PM" or "at 14:00")
  let hours = 0, minutes = 0;
  const timeMatch = cleaned.match(/\bat\s+(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (timeMatch) {
    hours = parseInt(timeMatch[1]);
    minutes = parseInt(timeMatch[2]);
    if (timeMatch[3]?.toUpperCase() === "PM" && hours < 12) hours += 12;
    if (timeMatch[3]?.toUpperCase() === "AM" && hours === 12) hours = 0;
  }

  // Remove the time portion for date parsing
  const dateOnly = cleaned.replace(/\s*\bat\s+\d{1,2}:\d{2}\s*(AM|PM)?/i, "").trim();

  // Try to parse with Date constructor
  const parsed = new Date(dateOnly);
  if (isNaN(parsed.getTime())) {
    throw new Error(`Invalid date: "${input}"`);
  }

  const year = parsed.getFullYear();
  const month = parsed.getMonth() + 1; // 1-indexed
  const day = parsed.getDate();

  const months = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

  return `set ${varName} to current date
set year of ${varName} to ${year}
set month of ${varName} to ${months[month - 1]}
set day of ${varName} to ${day}
set hours of ${varName} to ${hours}
set minutes of ${varName} to ${minutes}
set seconds of ${varName} to 0`;
}

export async function createEvent(
  calendarName: string,
  summary: string,
  startDate: string,
  endDate: string,
  options?: { location?: string; description?: string; allDay?: boolean; alertMinutes?: number[] }
): Promise<string> {
  const safeCal = sanitize(calendarName);
  const safeSummary = sanitize(summary);

  const startDateScript = dateToAppleScript(startDate, "eventStart");
  const endDateScript = dateToAppleScript(endDate, "eventEnd");

  let extraProps = "";
  if (options?.location) extraProps += `, location:"${sanitize(options.location)}"`;
  if (options?.description) extraProps += `, description:"${sanitize(options.description)}"`;
  if (options?.allDay !== undefined) extraProps += `, allday event:${options.allDay}`;

  let alarmScript = "";
  if (options?.alertMinutes && options.alertMinutes.length > 0) {
    alarmScript = options.alertMinutes
      .map((m) => `\n  make new display alarm at end of display alarms of theEvent with properties {trigger interval:${-m}}`)
      .join("");
  }

  const script = `
tell application "Calendar"
  set theCal to calendar "${safeCal}"
  ${startDateScript}
  ${endDateScript}
  set theEvent to make new event at end of events of theCal with properties {summary:"${safeSummary}", start date:eventStart, end date:eventEnd${extraProps}}${alarmScript}
  return "Event created: ${safeSummary}"
end tell`;
  return runAppleScript(script);
}

export async function updateEvent(
  summary: string,
  calendarName: string | undefined,
  updates: { newSummary?: string; startDate?: string; endDate?: string; location?: string; description?: string; allDay?: boolean; alertMinutes?: number[] }
): Promise<string> {
  const safeSummary = sanitize(summary);
  let setStatements = "";
  if (updates.newSummary) setStatements += `\n    set summary of e to "${sanitize(updates.newSummary)}"`;
  if (updates.location) setStatements += `\n    set location of e to "${sanitize(updates.location)}"`;
  if (updates.description) setStatements += `\n    set description of e to "${sanitize(updates.description)}"`;
  if (updates.allDay !== undefined) setStatements += `\n    set allday event of e to ${updates.allDay}`;

  // Alert update: only modify if alertMinutes is explicitly provided.
  // Empty array removes all alerts; non-empty replaces all alerts.
  if (updates.alertMinutes !== undefined) {
    setStatements += `\n    repeat (count of display alarms of e) times\n      delete last display alarm of e\n    end repeat`;
    for (const m of updates.alertMinutes) {
      setStatements += `\n    make new display alarm at end of display alarms of e with properties {trigger interval:${-m}}`;
    }
  }

  let dateSetup = "";
  if (updates.startDate && updates.endDate) {
    // Build both date variables first, then set in safe order.
    // Calendar enforces start < end after each individual `set`, so moving
    // an event forward would fail if we blindly set start before end.
    // Read the current end date and branch: if the new start would exceed it,
    // set end first; otherwise set start first.
    dateSetup += `\n    ${dateToAppleScript(updates.startDate, "eventStart")}`;
    dateSetup += `\n    ${dateToAppleScript(updates.endDate, "eventEnd")}`;
    dateSetup += `\n    if eventStart > end date of e then`;
    dateSetup += `\n      set end date of e to eventEnd`;
    dateSetup += `\n      set start date of e to eventStart`;
    dateSetup += `\n    else`;
    dateSetup += `\n      set start date of e to eventStart`;
    dateSetup += `\n      set end date of e to eventEnd`;
    dateSetup += `\n    end if`;
  } else if (updates.startDate) {
    dateSetup += `\n    ${dateToAppleScript(updates.startDate, "eventStart")}`;
    dateSetup += `\n    set start date of e to eventStart`;
  } else if (updates.endDate) {
    dateSetup += `\n    ${dateToAppleScript(updates.endDate, "eventEnd")}`;
    dateSetup += `\n    set end date of e to eventEnd`;
  }

  let script: string;
  if (calendarName) {
    const safeCal = sanitize(calendarName);
    script = `
tell application "Calendar"
  set matchedEvents to (every event of calendar "${safeCal}" whose summary is "${safeSummary}")
  if (count of matchedEvents) is 0 then
    error "Event not found: ${safeSummary}"
  end if
  set e to item 1 of matchedEvents${setStatements}${dateSetup}
  return "Event updated: ${safeSummary}"
end tell`;
  } else {
    script = `
tell application "Calendar"
  repeat with c in calendars
    set matchedEvents to (every event of c whose summary is "${safeSummary}")
    if (count of matchedEvents) > 0 then
      set e to item 1 of matchedEvents${setStatements}${dateSetup}
      return "Event updated: ${safeSummary}"
    end if
  end repeat
  error "Event not found: ${safeSummary}"
end tell`;
  }
  return runAppleScript(script);
}

export async function deleteEvent(summary: string, calendarName?: string): Promise<string> {
  const safeSummary = sanitize(summary);
  let scope: string;
  if (calendarName) {
    const safeCal = sanitize(calendarName);
    scope = `events of calendar "${safeCal}"`;
  } else {
    // Search across all calendars
    scope = "";
  }
  let script: string;
  if (calendarName) {
    script = `
tell application "Calendar"
  set matchedEvents to (${scope} whose summary is "${safeSummary}")
  if (count of matchedEvents) is 0 then
    error "Event not found: ${safeSummary}"
  end if
  delete item 1 of matchedEvents
  return "Event deleted: ${safeSummary}"
end tell`;
  } else {
    script = `
tell application "Calendar"
  repeat with c in calendars
    set matchedEvents to (every event of c whose summary is "${safeSummary}")
    if (count of matchedEvents) > 0 then
      delete item 1 of matchedEvents
      return "Event deleted: ${safeSummary}"
    end if
  end repeat
  error "Event not found: ${safeSummary}"
end tell`;
  }
  return runAppleScript(script);
}

