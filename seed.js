// Your starting data, copied from the Claude version of Daybook.
// It is written to your account only the first time you sign in.
export const SEED = {
 "settings": {
  "categories": [
   {
    "name": "SQL / Database",
    "tag": "sql"
   },
   {
    "name": "Excel / Reporting",
    "tag": "excel"
   },
   {
    "name": "Python / Automation",
    "tag": "python"
   },
   {
    "name": "Admin / Documentation",
    "tag": "admin"
   }
  ]
 },
 "routine": {
  "r01": {
   "days": [
    1,
    2,
    3,
    4,
    5
   ],
   "kind": "health",
   "label": "Wake up, drink a glass of water",
   "time": "07:00"
  },
  "r02": {
   "days": [
    1,
    2,
    3,
    4,
    5
   ],
   "kind": "meal",
   "label": "Breakfast",
   "time": "07:30"
  },
  "r03": {
   "days": [
    1,
    2,
    3,
    4,
    5
   ],
   "kind": "supplement",
   "label": "Morning supplements",
   "time": "07:45"
  },
  "r04": {
   "days": [
    1,
    2,
    3,
    4,
    5
   ],
   "kind": "work",
   "label": "Start work: review today's tasks",
   "time": "09:00"
  },
  "r05": {
   "days": [
    1,
    2,
    3,
    4,
    5
   ],
   "kind": "break",
   "label": "Toilet break & stretch",
   "time": "10:30"
  },
  "r06": {
   "days": [
    0,
    1,
    2,
    3,
    4,
    5,
    6
   ],
   "kind": "meal",
   "label": "Lunch",
   "time": "12:30"
  },
  "r07": {
   "days": [
    1,
    2,
    3,
    4,
    5
   ],
   "kind": "break",
   "label": "Toilet break, water refill",
   "time": "15:30"
  },
  "r08": {
   "days": [
    1,
    2,
    3,
    4,
    5
   ],
   "kind": "work",
   "label": "Wrap up work, log task progress",
   "time": "18:00"
  },
  "r09": {
   "days": [
    0,
    1,
    2,
    3,
    4,
    5,
    6
   ],
   "kind": "meal",
   "label": "Dinner",
   "time": "19:00"
  },
  "r10": {
   "days": [
    0,
    1,
    2,
    3,
    4,
    5,
    6
   ],
   "kind": "supplement",
   "label": "Evening supplements",
   "time": "19:30"
  },
  "r11": {
   "days": [
    1,
    2,
    3,
    4
   ],
   "kind": "study",
   "label": "Study: Google certificate (1 hour)",
   "time": "20:30"
  },
  "r12": {
   "days": [
    1,
    2,
    3,
    4,
    5
   ],
   "kind": "work",
   "label": "Daily reflection",
   "time": "21:30"
  },
  "r13": {
   "days": [
    0,
    1,
    2,
    3,
    4
   ],
   "kind": "health",
   "label": "Sleep",
   "time": "23:00"
  },
  "r14": {
   "days": [
    6
   ],
   "kind": "class",
   "label": "Swimming class",
   "time": "10:00"
  },
  "r15": {
   "days": [
    0
   ],
   "kind": "study",
   "label": "Study: Google certificate (2 hours)",
   "time": "10:00"
  },
  "w01": {
   "days": [
    0,
    6
   ],
   "kind": "health",
   "label": "Wake up, drink a glass of water",
   "time": "08:00"
  },
  "w02": {
   "days": [
    0,
    6
   ],
   "kind": "meal",
   "label": "Breakfast",
   "time": "08:30"
  },
  "w03": {
   "days": [
    0,
    6
   ],
   "kind": "supplement",
   "label": "Morning supplements",
   "time": "08:45"
  },
  "w04": {
   "days": [
    6
   ],
   "kind": "other",
   "label": "Chores, laundry, groceries",
   "time": "15:00"
  },
  "w05": {
   "days": [
    0
   ],
   "kind": "work",
   "label": "Plan next week: review work tasks & to-dos",
   "time": "20:30"
  },
  "w06": {
   "days": [
    5,
    6
   ],
   "kind": "health",
   "label": "Sleep",
   "time": "23:30"
  }
 },
 "tasks": {
  "example1": {
   "assignedBy": "Supervisor",
   "bottleneck": "Waiting for read access to the production database",
   "category": "sql",
   "createdAt": "2026-10-27T13:00:00.000Z",
   "desc": "Example task to show the layout. Remove duplicate batch IDs from the production table and share the row count with supervisor. Delete this once you add your own tasks.",
   "doneAt": "",
   "due": "2026-10-30",
   "log": [
    {
     "at": "2026-10-27T13:00:00.000Z",
     "note": "Task added"
    },
    {
     "at": "2026-10-27T13:05:00.000Z",
     "note": "Progress 0% → 40%"
    }
   ],
   "progress": 40,
   "status": "doing",
   "title": "(Example) Clean monthly production data",
   "updatedAt": "2026-10-27T13:00:00.000Z",
   "urgency": "high"
  },
  "example2": {
   "assignedBy": "Supervisor",
   "bottleneck": "",
   "category": "excel",
   "createdAt": "2026-10-27T13:00:00.000Z",
   "desc": "Example task. Refresh the pivot table and chart in the weekly scrap report.",
   "doneAt": "",
   "due": "2026-11-02",
   "log": [
    {
     "at": "2026-10-27T13:00:00.000Z",
     "note": "Task added"
    }
   ],
   "progress": 0,
   "status": "todo",
   "title": "(Example) Update weekly scrap rate report",
   "updatedAt": "2026-10-27T13:00:00.000Z",
   "urgency": "medium"
  }
 }
};
