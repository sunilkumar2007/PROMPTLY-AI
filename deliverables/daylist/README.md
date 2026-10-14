# Daylist

Daylist is a small, responsive To-Do app. Add and edit tasks, mark them done, search by task or category, filter by status, sort by due date or priority, and keep your list between visits.

## Run it

Requirements: Node.js 20 or newer. No third-party packages or API keys are used.

```sh
npm ci
npm test
npm run build
npm start
```

Open `http://127.0.0.1:4173`. You can also open `index.html` directly in a modern browser. Task data is stored in that browser's local storage and is not sent to a server.

## Included

- Add, edit, delete, and complete tasks
- Required title and validated date, priority, and category fields
- Search task names and categories
- All, To do, Done, and Overdue filters
- Sort by newest, due date, or priority
- Responsive desktop and mobile layout, keyboard-friendly forms, and reduced-motion support
- Browser storage persistence and safe recovery from malformed saved data
- Node test coverage for task logic and a dependency-free static build

## Privacy and limits

This is a browser-only app. Data stays in local storage on the device and does not sync between browsers or devices. Clearing browser data removes the task list. There is no account, cloud sync, notification service, or external AI integration.
