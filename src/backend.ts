export type ReadOperation = "notes_list" | "notes_search" | "notes_get" | "mail_list" | "mail_search" | "mail_get" | "calendar_list" | "messages_read" | "messages_search";
export type Arguments = Record<string, unknown>;
export interface Backend {
  read(operation: ReadOperation, args: Arguments): Promise<unknown>;
}

export function createMockBackend(): Backend {
  const note = { id: "demo-note", title: "Demo note", body: "Synthetic note. No Apple data was read.", creationDate: "2026-10-02T12:00:00Z", modificationDate: "2026-10-02T12:00:00Z" };
  const email = { id: 1, subject: "Demo email", sender: "demo@example.invalid", body: "Synthetic email. No Apple data was read.", date: "2026-10-02T12:00:00Z", isRead: false };
  const message = { rowid: 1, text: "Synthetic message. No Apple data was read.", is_from_me: false, date: "2026-10-02T12:00:00Z", sender: "demo@example.invalid" };
  return {
    async read(operation, args) {
      const matches = (value: unknown) => JSON.stringify(value).toLowerCase().includes(String(args.query ?? "").toLowerCase());
      switch (operation) {
        case "notes_list": return [{ id: note.id, title: note.title, creationDate: note.creationDate, modificationDate: note.modificationDate }];
        case "notes_search": return matches(note) ? [note] : [];
        case "notes_get": if (args.note_id !== note.id) throw new Error("Demo note not found."); return note;
        case "mail_list": return [{ id: email.id, subject: email.subject, sender: email.sender, date: email.date, isRead: email.isRead }];
        case "mail_search": return matches(email) ? [email] : [];
        case "mail_get": if (args.message_id !== email.id) throw new Error("Demo email not found."); return email;
        case "calendar_list": return [{ summary: "Demo event", startDate: `${args.from_date}T12:00:00`, endDate: `${args.from_date}T12:30:00`, location: null, uid: "demo-event" }];
        case "messages_read": return [message];
        case "messages_search": return matches(message) ? [message] : [];
      }
    },
  };
}

export function createAppleBackend(): Backend {
  // Fixed read functions only. There is no generic script, shell, file, or write tool.
  return {
    async read(operation, args) {
      const limit = Number(args.limit);
      switch (operation) {
        case "notes_list": {
          const notes = await import("../notes/src/applescript.js");
          return notes.listNotes(String(args.folder), limit, String(args.account));
        }
        case "notes_search": {
          const notes = await import("../notes/src/applescript.js");
          return notes.searchNotes(String(args.query), String(args.folder), limit, String(args.account));
        }
        case "notes_get": {
          const notes = await import("../notes/src/applescript.js");
          return notes.getNoteById(String(args.note_id), String(args.folder), String(args.account));
        }
        case "mail_list": {
          const mail = await import("../mail/src/applescript.js");
          return mail.listMessages(String(args.mailbox), String(args.account), limit, Boolean(args.unread_only));
        }
        case "mail_search": {
          const mail = await import("../mail/src/applescript.js");
          return mail.searchMessages(String(args.query), String(args.mailbox), String(args.account), limit, args.search_field as "subject" | "sender");
        }
        case "mail_get": {
          const mail = await import("../mail/src/applescript.js");
          return mail.getMessage(String(args.mailbox), String(args.account), Number(args.message_id));
        }
        case "calendar_list": {
          const calendar = await import("../calendar/src/eventkit.js");
          return (await calendar.listEvents(String(args.calendar), String(args.from_date), String(args.to_date))).slice(0, limit);
        }
        case "messages_read": {
          const messages = await import("../messages/src/database.js");
          return messages.getChatMessages(String(args.chat_id), limit, String(args.from_date), String(args.to_date));
        }
        case "messages_search": {
          const messages = await import("../messages/src/database.js");
          return messages.searchMessages(String(args.query), String(args.chat_id), limit);
        }
      }
    },
  };
}
