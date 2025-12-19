# Changelog

## Unreleased
- Improve mobile compose UX: hide FAB while composing, remove redundant close control, add split-send menu (send now / schedule / draft), add attachments picker with chips, and tune datetime picker styling.
- Add minimized compose draft behavior (tap outside to minimize), a mobile compose dock with “Draft: 1”, and a cancel confirmation dialog (save draft / discard / continue).
- Add compose WYSIWYG editor with font family/size controls and inline image support (paste, drop, insert).
- Simplify compose toolbar: keep font/size/undo visible and move other actions into a single “More” sheet.
- Rename “Mailboxes” to “Folders” and add a nested folder tree with expand/collapse plus quick filtering for fast browsing in large folder hierarchies.
- Add local Stalwart mail server via Docker Compose (SMTP/Submission/IMAP/JMAP + admin/API) with self-signed TLS for development.
- Sync active profile display across tabs/windows (react to `localStorage` changes).
- Integrate Stalwart JMAP for login (Basic Auth, in-memory session) with Vite dev proxy; add auth context and JMAP client utilities.
- Fix JMAP login by requesting `/jmap/session` directly (avoid `/.well-known/jmap` redirect edge cases) and show clearer local-dev credential hints.
- Load real folder list from JMAP (`Mailbox/get`) and render it in the folder tree + picker with loading/error states.
