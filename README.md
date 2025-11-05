# Google Calendar Multi-Sync Script (v2.4)

This Google Apps Script provides a robust, one-way synchronization from multiple "source" Google Calendars to a single "target" calendar (usually your `primary` one).

It's designed to be a "set it and forget it" solution that properly handles **Creations, Updates, and Deletions** using Google's Advanced Calendar API and `syncTokens`.



## 🌟 Features

* **Full CRUD Sync:** Handles event **C**reates, **U**pdates, and **D**eletes.
* **Stateful Syncing:** Uses `syncToken` to ask "what's changed?" instead of re-scanning all events every time. This is extremely efficient.
* **Duplicate Prevention:** Uses `extendedProperties` to "tag" synced events, linking them to their source. This prevents duplicate copies and allows for updates.
* **Visual Organization:** Automatically adds a `[Prefix]` (e.g., `[Work]`) and assigns a **unique color** to events from each source calendar.
* **Robust First-Time Sync:** When run for the first time, it "bootstraps" the calendar by fetching all existing events within a safe, configurable time window (e.g., 7 days in the past, 365 in the future).
* **Handles Infinite Recurrence:** The `timeMax` on the first sync prevents the script from getting stuck on infinitely recurring events.
* **Quota Management:** Includes a built-in throttle (`Utilities.sleep`) *during the first sync* to avoid "Quota Exceeded" errors.

## 🛠️ How to Set Up

### Step 1: Create the Script

1.  Go to [script.google.com](https://script.google.com/) and create a new project.
2.  Give it a name (e.g., "Calendar Sync").
3.  Delete the default `Code.gs` content and **paste the entire script** from this repository.
4.  (Optional) Create an `appsscript.json` file in your repo and paste the manifest content (see below).

### Step 2: Enable the Advanced Calendar API

1.  In the script editor, look at the left-hand sidebar.
2.  Click the **+** icon next to "Services".
3.  Find **"Google Calendar API"** in the list.
4.  Click **"Add"**. (This enables the `Calendar.` object).

### Step 3: Configure Your Calendars

1.  Open the `Code.gs` file you just pasted.
2.  Scroll down to the **`SOURCE_CALENDARS`** array (around line 60).
3.  **Find your Calendar IDs:** Go to your Google Calendar settings, select a calendar, and find the "Calendar ID" under the "Integrate calendar" section.
4.  **Edit the array:**
    * `id`: Paste your Calendar ID.
    * `prefix`: Set a short prefix you want (e.g., `[Univ]`).
    * `colorId`: Choose a number from 1-11.
5.  Add an object `{...}` for *every single calendar* you want to sync *from*.
6.  (Optional) Check `GLOBAL_CONFIG` to make sure `TARGET_CALENDAR_ID` is set to `'primary'`.

### Step 4: First-Time Run (The Bootstrap)

1.  **Save** the project.
2.  From the function dropdown at the top, select **`resetAllSyncTokens`**.
3.  Click **"Run"**.
    * A popup will appear asking for permissions. **You must authorize it** to allow it to read/write to your calendars.
4.  Next, select the **`mainSyncFunction`**.
5.  Click **"Run"**.
    * This is the "First-Time Sync." It will be **very slow** (this is on purpose!). It's fetching all your events and pausing (`Utilities.sleep`) to avoid quota errors.
    * Go to "Executions" on the left to watch the logs.
    * **WARNING:** This first run may fail if you have thousands of events. See "Troubleshooting" below.

### Step 5: Set the Trigger

Once the first manual run is complete for ALL calendars, you need to automate it.

1.  On the left, click **"Triggers"** (the ⏰ icon).
2.  Click **"+ Add Trigger"** in the bottom right.
3.  Set it up as follows:
    * **Function to run:** `mainSyncFunction`
    * **Deployment:** `Head`
    * **Event source:** `Time-driven`
    * **Type:** `Minutes timer`
    * **Interval:** `Every 10 minutes` (or 5, or 15)
4.  Click **"Save"**.

**That's it!** Your calendars will now stay in perfect sync automatically.

## ⚠️ Troubleshooting & Utilities

### "Exceeded maximum execution time" (6-Minute Timeout)

This is a common error during the **First-Time Sync** if you have a very large calendar (e.g., a university calendar with thousands of events). The `Utilities.sleep()` (which prevents quota errors) makes the script so slow that it hits Google's 6-minute execution limit before it can finish and save its `syncToken`.

**This creates an infinite loop:** The next run starts from scratch and times out again.

**The Fix (How to "Tame" a Large Calendar):**

1.  **Reset:** Run `resetAllSyncTokens()` manually.
2.  **Isolate:** In `Code.gs`, **comment out all calendars** in the `SOURCE_CALENDARS` array *except* the one large, problematic calendar.
3.  **Reduce Scope:** In `GLOBAL_CONFIG`, find this line:
    `INITIAL_SYNC_FUTURE_DAYS: 365`
    ...and **temporarily change 365 to 60** (or even 30).
4.  **Run:** Run `mainSyncFunction()` manually. It will now only sync 2 months of data, which should finish in under 6 minutes. You will see a `New Sync Token saved...` log when it succeeds.
5.  **Restore:** Change the `60` back to `365`.
6.  **Run Again:** Descomenta all your *other* calendars and run `mainSyncFunction()` manually. It will use the token for the big calendar (running instantly) and do the first-time sync for your other calendars.
7.  **Repeat:** You may still hit the 6-minute timeout if your *other* calendars are also large. Just keep re-running `mainSyncFunction()` manually. It's "resumable" and will pick up where it left off (or grab the next calendar) until all calendars have a `syncToken`.
8.  **Activate Trigger:** Once all calendars have finished their first sync, activate your trigger.

### Utility Functions

(Run these manually from the script editor)

* `resetAllSyncTokens()`: Deletes all saved `syncToken`s. This forces the script to perform a "First-Time Sync" on all calendars at the next execution.
* `deleteAllSyncedEventsFromPrimary()`: **DANGER!** This will find and delete *every* event in your `TARGET_CALENDAR_ID` that has a `SYNC_TAG_KEY` property. This is your "nuke" button. Use it if your state becomes hopelessly corrupted with "orphan" events that the script can't find or delete.