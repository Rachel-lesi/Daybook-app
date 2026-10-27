# Daybook: setup guide

About 15 minutes, all free. You need a Google account (for Firebase) and a GitHub account.

## 1. Create a Firebase project
1. Go to https://console.firebase.google.com and click **Create a project**. Name it `daybook`. You can turn Google Analytics off.
2. On the project home page, click the **</>** (Web) icon to add a web app. Nickname: `daybook`. Leave "Firebase Hosting" unticked. Click **Register app**.
3. Firebase shows a block of code containing `const firebaseConfig = { ... }`. Keep this page open; you need it in step 4.

## 2. Turn on email sign-in
Left menu → **Build → Authentication** → **Get started** → **Email/Password** → switch on the first toggle → **Save**.

## 3. Create the database
1. Left menu → **Build → Firestore Database** → **Create database**.
2. Location: **asia-southeast1 (Singapore)**. Start in **production mode**.
3. Open the **Rules** tab, replace everything with the rules below, and click **Publish**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

## 4. Add your Firebase settings to the app
Open `firebase-config.js` in Notepad. Replace the six `PASTE…` values with the ones from step 1 (apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId). Save.

## 5. Put the app online with GitHub Pages
1. Go to https://github.com/new. Repository name: `daybook`. Choose **Public**. Click **Create repository**.
2. Click **uploading an existing file**. Drag in **all the files from this folder** (not the folder itself). Click **Commit changes**.
3. Go to **Settings → Pages**. Under "Branch", choose **main** and **/(root)**, then **Save**.
4. After about a minute, your app is at `https://YOUR-GITHUB-NAME.github.io/daybook/`.

## 6. Allow your web address in Firebase
Firebase → **Authentication → Settings → Authorized domains → Add domain** → enter `YOUR-GITHUB-NAME.github.io`.

## 7. Install it
- **Android (Chrome):** open your app link → menu ⋮ → **Install app** (or **Add to Home screen**).
- **iPhone (Safari):** open the link → Share → **Add to Home Screen**.
- **PC (Chrome or Edge):** open the link → click the install icon at the right end of the address bar.

Open the app and tap **Create account** with your email and a password. Your routine, categories and example tasks load automatically. Use the same email and password on every device.

## Updating the app later
Upload the changed files to the same GitHub repository. Also open `sw.js` and change `daybook-v1` to `daybook-v2` (v3, and so on) so your devices fetch the new version.

## Backups
**Routine tab → Account & backup → Download backup** saves everything as a file. **Restore from backup** loads it back.
