# Class Attendance Monitor (Firebase)

React + Vite + Tailwind frontend. Backend: **Firebase Authentication + Cloud Firestore** (free Spark plan, no Cloud Functions).
Roles are enforced by `firestore.rules` on Google's servers, not by hiding buttons.

## Setup
1. console.firebase.google.com -> **Add project**.
2. **Build -> Authentication -> Get started -> Email/Password -> Enable.**
3. **Build -> Firestore Database -> Create database** (production mode, any nearby region).
4. Firestore -> **Rules** tab -> replace everything with the contents of `firestore.rules` -> **Publish**.
5. Project settings (gear) -> **Your apps -> Web (</>)** -> register -> copy the config values.
6. In `frontend`: copy `.env.example` to `.env` and fill in the four values.
7. `cd frontend`, `npm install`, `npm run dev`.

## First administrator
1. In the app click **Create one** and register your own account.
2. Firebase console -> Firestore -> `users` -> your document (ID = your UID, shown in Authentication -> Users).
3. Change `role` to `admin` and `status` to `active`, then sign in.
4. Settings -> **Load sample data** (optional), then Setup -> assign teachers to classes.

## Roles
| | Administrator | Teacher |
|---|---|---|
| Accounts (create, approve, deactivate) | yes | no |
| Sections, subjects, classes, schedules, settings | yes | no |
| Students | all | only their sections (add/edit, no delete) |
| Attendance | all classes | only their classes |
| Reports | system-wide | own classes |

No student accounts exist. Students are records only.

## Good to know
- Deleting an account removes its access, but its login stays in Firebase Authentication until you delete it there (the browser cannot delete other logins without Cloud Functions).
- Student ID uniqueness is checked by the app. Attendance rules limit teachers to their own classes.
- The old MySQL data is not transferred. The Laravel `api` folder and MySQL are no longer needed.
- Firebase web config values are public by design. The rules are what protect the data.
