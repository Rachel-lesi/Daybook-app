# How the code is organised

Daybook has no build step: GitHub Pages serves these files as they are.

## Files

| Path | What it holds |
|---|---|
| `index.html` | The page markup only: screens, dialogs and forms. |
| `css/base.css` | Layout, typography, cards, lists and forms. |
| `css/components.css` | Buttons, tasks, alarms, opening screen, wide-screen layout. |
| `css/themes.css` | All colour themes, light and dark. |
| `css/shell.css` | Header banner, floating dock, background, logo, theme picker, edit dialog. |
| `css/pages.css` | Styles for each tab: Today, calendar, journal, health, money, study. |
| `css/details.css` | Smaller refinements added later (pop-ups, insights, time, courses). |
| `app.js` | Entry point. Loads every file in `js/` in order. |
| `js/opening-cards.js` | Opening screen cards. Plain script so it shows before the app loads. |
| `js/core.js` | Shared state (`S`), helpers, date fields, data saving, icons and themes. |
| `js/registry.js` | `hub`: a shared object for things a file needs from a file that loads later. |
| `js/nav.js`, `js/quick-add.js` | Tabs and routing; the quick-add bar. |
| `js/today.js`, `js/tasks.js`, `js/timers.js` | Today page, work task editor, stopwatch and focus timer. |
| `js/overview.js`, `js/time.js` | Insights tiles, sleep and where time went. |
| `js/courses.js`, `js/study.js`, `js/study-notes.js`, `js/study-calendar.js` | Self-study, units and assignments, notes and portfolio, study calendar. |
| `js/health.js`, `js/money.js` | Health tab and money tab. |
| `js/reflection.js`, `js/archive.js`, `js/reports.js` | Journal: daily reflection, archive, weekly reports. |
| `js/calendar.js`, `js/schedule.js`, `js/alarms.js` | Work calendar, schedule grid, alarms and push. |
| `js/routine.js`, `js/log-time.js`, `js/edit.js`, `js/search.js` | Routine editor, log time and edit to-dos, edit dialog, search. |
| `js/boot.js`, `js/opening.js` | Firebase connection, live data, backup, sign-in and start-up. |

## Conventions

- Each file imports what it uses from files that load **before** it.
- If a file needs something from a file that loads **after** it, it uses `hub.name` instead. The owning file lists those names at its top in `Object.defineProperties(hub, …)`.
- When you change files, bump the number in `app.js?v=` in `index.html` and `VERSION` in `sw.js` so phones fetch the new copy.
