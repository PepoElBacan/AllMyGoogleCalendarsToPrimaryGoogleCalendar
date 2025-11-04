# Google Calendar Multi-Sync Script

This Google Apps Script provides a robust, one-way synchronization from multiple "source" Google Calendars to a single "target" calendar (usually your `primary` one).

It's designed to be a "set it and forget it" solution that properly handles **Creations, Updates, and Deletions** using Google's Advanced Calendar API and `syncTokens`.



## 🌟 Features

* **Full CRUD Sync:** Handles event **C**reates, **U**pdates, and **D**eletes.
* **Stateful Syncing:** Uses `syncToken` to ask "what's changed?" instead of re-scanning all events every time. This is extremely efficient.
* **Duplicate Prevention:** Uses `extendedProperties` to "tag" synced events, linking them to their source. This prevents duplicate copies and allows for updates.
* **Visual Organization:** Automatically adds a `[Prefix]` (e.g., `[Work]`) and assigns a **unique color** to events from each source calendar.
* **Robust First-Time Sync:** When run for the first time, it "bootstraps" the calendar by fetching all existing events within a safe, configurable time window (e.g., 7 days in the past, 365 in the future).
* **Handles Infinite Recurrence:** The `timeMax` on the first sync prevents the script from getting stuck on infinitely recurring events (like anniversaries).
* **Quota Management:** Includes a built-in throttle (`Utilities.sleep`) during the first sync to avoid "Quota Exceeded" errors.

## 🛠️ How to Set Up

### Step 1: Create the Script

1.  Go to [script.google.com](https://script.google.com/) and create a new project.
2.  Give it a name (e.g., "Calendar Sync").
3.  Delete the default `Code.gs` content and **paste the entire script** from this repository.

### Step 2: Enable the Advanced Calendar API

1.  In the script editor, look at the left-hand sidebar.
2.  Click the **+** icon next to "Services".
3.  Find **"Google Calendar API"** in the list.
4.  Click **"Add"**. (This enables the `Calendar.` object, which is different from `CalendarApp.`).

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
    * Go to "Executions" on the left to watch the logs. It may take several minutes.

> **Note:** If this first sync times out (runs for more than 6 minutes), just run `mainSyncFunction` again. It will pick up where it left off.

### Step 5: Set the Trigger

Once the first manual run is complete, you need to automate it.

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

## ⚠️ Important Notes & Caveats

* **One-Way Sync:** This is a **Source -> Target** sync. If you manually edit a *synced* event in your `Primary` calendar, those changes **will be overwritten** the next time the script runs. You must edit the original event in its source calendar.
* **Quota Limits:** This script is designed to be very respectful of Google's quotas. However, if you have 20 calendars or thousands of events, you *might* see a quota error. The script is designed to fail gracefully and try again on the next run.
* **All-Day Events:** All-day events are supported and will be synced correctly.
