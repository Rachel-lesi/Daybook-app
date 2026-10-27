# Daybook: planned features

Saved 28 Oct 2026. To do after upgrading Firebase to the Blaze (pay-as-you-go) plan, planned for November 2026.

## When upgrading
- Upgrading needs a card. Google places a temporary RM120 hold to check the card, released within about a week. It isn't a charge.
- Expected running cost for you and a friend: RM0 to a few sen a month. Set a budget alert of RM5.
- Can be cancelled any time: delete the functions, then switch back to the Spark plan.

## Features to add
1. **Push notifications for routine alarms.** Already built as update 9; ask Claude for a fresh copy. Setup: upgrade to Blaze → generate a web push key → add it to firebase-config.js → `firebase deploy --only functions,firestore` → turn on notifications on each device and press Send test.
2. **Deadline push notifications for work tasks.** "Due tomorrow" and "Due today" notifications, at 9:00 by default, with times adjustable in the app. Optional nudge for overdue tasks.
3. **In-app deadline alerts.** Banner at the top of Today ("2 tasks due tomorrow · 1 overdue") and a red count on the Work tab. Free, so this can be added any time without upgrading.
4. **File uploads in Study.** Attach PDFs, slides and photos directly to notes and assignments (Firebase Storage needs Blaze). Until then, save files in Google Drive or OneDrive and paste the link.
5. **Turn off the Claude reminders** once push notifications work, to avoid double alerts.

## Until then
- Reminders come from the Claude app (scheduled by Claude).
- Calendar alarms in the Routine tab are free and work now: switch alarms on, then Sync to calendar.

## Open questions
- Remove the "Claude reminders" note from the Routine tab?
