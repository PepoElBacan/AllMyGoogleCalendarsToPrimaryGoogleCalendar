/**
 * ==============================================================================
 * Google Calendar Multi-Sync to Primary (v2.3)
 * ==============================================================================
 *
 * @description This script performs a robust, one-way synchronization from
 * multiple source calendars to a single target calendar (usually 
 * 'primary'). It uses the Advanced Calendar API and Sync Tokens 
 * to handle Creates, Updates, AND Deletes.
 *
 * @features
 * - Handles Event Creates, Updates, and Deletions.
 * - Uses `syncToken` for efficient, stateful synchronization after the first run.
 * - Uses `extendedProperties` to map source events to target events (prevents duplicates).
 * - Handles the "first-time sync" by fetching all events in a defined time range.
 * - Handles infinitely recurring events (like anniversaries) during the first sync.
 * - Adds a visual prefix (e.g., "[Work]") to synced events.
 * - [NEW] Assigns a specific Google Calendar Color ID to events from each source.
 * - Includes throttling (`Utilities.sleep`) to avoid "Quota Exceeded" errors.
 *
 * @author [Tu Nombre/Usuario de Reddit]
 * @version 2.3
 */

/**
 * ==============================================================================
 * CONFIGURATION
 * ==============================================================================
 */

/**
 * --- GLOBAL CONFIGURATION ---
 * Set your main configuration variables here.
 */
const GLOBAL_CONFIG = {
  // The calendar ID to sync TO. 'primary' is the default for your main calendar.
  TARGET_CALENDAR_ID: 'primary',
  
  // The key used to "tag" synced events. Do not change unless you know why.
  SYNC_TAG_KEY: 'sourceEventId',
  
  // Prefix for storing sync tokens. Do not change.
  TOKEN_PROPERTY_PREFIX: 'syncToken_',

  // Pause (in milliseconds) after processing each event during the first sync.
  // Helps to avoid "Quota Exceeded" errors. 500ms is a safe value.
  INITIAL_SYNC_THROTTLE: 500,

  // --- Initial Sync Date Range (in days) ---
  // How far back to look for events on the very first sync.
  INITIAL_SYNC_PAST_DAYS: 7,
  
  // How far forward to look. Prevents infinite loops on recurring events.
  INITIAL_SYNC_FUTURE_DAYS: 365 
};


/**
 * --- SOURCE CALENDARS ---
 *
 * This is the most important part to configure.
 *
 * 1. Find your Calendar ID:
 * Go to Google Calendar > Settings > (Select your calendar) > "Integrate calendar"
 * Copy the "Calendar ID" (it looks like an email address).
 *
 * 2. Find a Color ID:
 * Google Calendar has 11 colors.
 * [ 1: Lavender, 2: Sage, 3: Grape, 4: Flamingo, 5: Banana, 6: Tangerine,
 * 7: Peacock, 8: Graphite, 9: Blueberry, 10: Basil, 11: Tomato ]
 *
 * Add each calendar you want to sync FROM to this array.
 */
const SOURCE_CALENDARS = [
  {
    id: 'your_university_calendar_id@group.calendar.google.com',
    prefix: '[Univ]',
    colorId: '9' // Blueberry
  },
  {
    id: 'your_work_calendar_id@group.calendar.google.com',
    prefix: '[Work]',
    colorId: '5' // Banana
  },
  {
    id: 'another_calendar_id@gmail.com',
    prefix: '[Personal]',
    colorId: '4' // Flamingo
  }
  // Add as many calendars as you want here
];

/**
 * ==============================================================================
 * MAIN SYNC FUNCTION
 * To be run by a time-based trigger (e.g., every 10 minutes).
 * ==============================================================================
 */
function mainSyncFunction() {
  const userProperties = PropertiesService.getUserProperties();
  const primaryCalendar = CalendarApp.getCalendarById(GLOBAL_CONFIG.TARGET_CALENDAR_ID);

  if (!primaryCalendar) {
    Logger.log(`Error: Target calendar (${GLOBAL_CONFIG.TARGET_CALENDAR_ID}) not found.`);
    return;
  }

  // Iterate over each source calendar to sync it.
  for (const source of SOURCE_CALENDARS) {
    const { id: calendarId, prefix, colorId } = source;
    const sourceCalendarName = CalendarApp.getCalendarById(calendarId).getName();
    const tokenPropertyKey = GLOBAL_CONFIG.TOKEN_PROPERTY_PREFIX + calendarId;
    let syncToken = userProperties.getProperty(tokenPropertyKey);

    let requestParameters = {
      showDeleted: true,  // <-- This is CRITICAL for catching deletions.
      singleEvents: true, // Expands recurring events into single instances.
      maxResults: 250     // Max changes per page.
    };

    if (syncToken) {
      // --- NORMAL SYNC (Using a Token) ---
      // We have a token, so we only ask for changes since the last sync.
      requestParameters.syncToken = syncToken;
      Logger.log(`Sync (Token) starting for [${sourceCalendarName}]...`);
    } else {
      // --- FIRST-TIME SYNC (No Token) ---
      // This is the first run for this calendar. We must "bootstrap" it
      // by fetching all events in a specified date range.
      
      // (V2.1 Fix) Get events based on *when they occur*, not when they were *updated*.
      const startTime = new Date(Date.now() - (GLOBAL_CONFIG.INITIAL_SYNC_PAST_DAYS * 24 * 60 * 60 * 1000));
      requestParameters.timeMin = startTime.toISOString();

      // (V2.2 Fix) Add a 'timeMax' to prevent infinite loops on infinitely recurring events.
      const endTime = new Date(Date.now() + (GLOBAL_CONFIG.INITIAL_SYNC_FUTURE_DAYS * 24 * 60 * 60 * 1000));
      requestParameters.timeMax = endTime.toISOString();
      
      Logger.log(`Sync (First Time, ${GLOBAL_CONFIG.INITIAL_SYNC_PAST_DAYS}d back, ${GLOBAL_CONFIG.INITIAL_SYNC_FUTURE_DAYS}d fwd) starting for [${sourceCalendarName}]...`);
    }

    try {
      let eventPages;
      let pageToken;

      // --- PAGINATION LOOP ---
      // Loop through all pages of results (if there are many changes)
      do {
        requestParameters.pageToken = pageToken;
        
        // Use the Advanced Calendar API
        eventPages = Calendar.Events.list(calendarId, requestParameters);

        if (!eventPages.items || eventPages.items.length === 0) {
          Logger.log(`   > No changes found for [${sourceCalendarName}].`);
          break; 
        }

        // --- PROCESS CHANGES ---
        for (const sourceEvent of eventPages.items) {
          
          if (sourceEvent.status === 'cancelled') {
            // This event was DELETED.
            deleteTargetEvent(sourceEvent);
          } else {
            // This event was CREATED or UPDATED.
            createOrUpdateEvent(sourceEvent, primaryCalendar, prefix, colorId);
          }

          // (V1.1 Fix) Throttle the script during the first sync to avoid Quota errors
          if (!syncToken) { 
            Utilities.sleep(GLOBAL_CONFIG.INITIAL_SYNC_THROTTLE);
          }
        }
        
        pageToken = eventPages.nextPageToken;
        
        // If we are on a normal sync (with token), we don't need to manually
        // page. The nextSyncToken handles this for the *next* run.
        if (syncToken && !pageToken) {
           break;
        }

      } while (pageToken);

      // --- ¡IMPORTANT! Save the new token for the next run. ---
      if (eventPages.nextSyncToken) {
        userProperties.setProperty(tokenPropertyKey, eventPages.nextSyncToken);
        Logger.log(`   > New Sync Token saved for [${sourceCalendarName}].`);
      }

    } catch (e) {
      if (e.message.includes('Sync token is no longer valid') || e.message.includes('410')) {
        // This is a common, non-fatal error. The token expired (e.g., script
        // was off for > 7 days). We delete the token to force a 
        // full re-sync on the next run.
        Logger.log(`¡Sync Token Expired for [${sourceCalendarName}]! Deleting token to force re-sync.`);
        userProperties.deleteProperty(tokenPropertyKey);
      } else {
        // A different error occurred (e.g., Quota).
        Logger.log(`Error syncing [${sourceCalendarName}]: ${e}`);
      }
    }
  } // End of main calendar loop
}


/**
 * ==============================================================================
 * HELPER FUNCTIONS
 * ==============================================================================
 */

/**
 * Creates or Updates an event in the target calendar.
 */
function createOrUpdateEvent(sourceEvent, targetCalendar, prefix, sourceColorId) {
  const sourceEventId = sourceEvent.id;
  
  // 1. Check if this event (from this source) already exists in the target calendar.
  // We use our 'SYNC_TAG_KEY' stored in extendedProperties to find it.
  const searchParameters = {
    privateExtendedProperty: `${GLOBAL_CONFIG.SYNC_TAG_KEY}=${sourceEventId}`
  };

  let existingTargetEvent = null;
  try {
    const foundEvents = Calendar.Events.list(GLOBAL_CONFIG.TARGET_CALENDAR_ID, searchParameters);
    
    if (foundEvents.items && foundEvents.items.length > 0) {
      existingTargetEvent = foundEvents.items[0];
    }
  } catch (e) {
     Logger.log(`Error searching for duplicate event: ${e}`);
     return; // Skip this event
  }
  
  // 2. Prepare the event details (payload) for the target calendar.
  let title = sourceEvent.summary || '(No Title)';
  if (prefix && !title.startsWith(prefix)) {
      title = `${prefix} ${title}`;
  }

  // Handle all-day events vs. specific-time events
  const eventStart = sourceEvent.start.date ? 
    { date: sourceEvent.start.date } : 
    { dateTime: sourceEvent.start.dateTime };
    
  const eventEnd = sourceEvent.end.date ? 
    { date: sourceEvent.end.date } : 
    { dateTime: sourceEvent.end.dateTime };

  const targetEventPayload = {
    summary: title,
    description: sourceEvent.description || '',
    location: sourceEvent.location || '',
    start: eventStart,
    end: eventEnd,
    recurrence: sourceEvent.recurrence || null,
    colorId: sourceColorId, // <-- [NEW] Set the specific color
    
    // This "tag" is the most important part.
    // It links this copied event back to its source event.
    extendedProperties: {
      private: {
        [GLOBAL_CONFIG.SYNC_TAG_KEY]: sourceEventId
      }
    }
  };

  // 3. Execute the Create or Update operation.
  try {
    if (existingTargetEvent) {
      // --- UPDATE ---
      Calendar.Events.update(targetEventPayload, GLOBAL_CONFIG.TARGET_CALENDAR_ID, existingTargetEvent.id);
      Logger.log(`Event updated: [${title}]`);
    } else {
      // --- CREATE ---
      Calendar.Events.insert(targetEventPayload, GLOBAL_CONFIG.TARGET_CALENDAR_ID);
      Logger.log(`Event created: [${title}]`);
    }
  } catch (e) {
    Logger.log(`Error inserting/updating event [${title}]: ${e}`);
  }
}


/**
 * Deletes an event from the target calendar.
 */
function deleteTargetEvent(sourceEvent) {
  const sourceEventId = sourceEvent.id;
  Logger.log(`Processing DELETE for source ID: ${sourceEventId}`);

  // 1. Find the event in the target calendar using our tag.
  const searchParameters = {
    privateExtendedProperty: `${GLOBAL_CONFIG.SYNC_TAG_KEY}=${sourceEventId}`
  };

  try {
    const foundEvents = Calendar.Events.list(GLOBAL_CONFIG.TARGET_CALENDAR_ID, searchParameters);

    if (foundEvents.items && foundEvents.items.length > 0) {
      const targetEvent = foundEvents.items[0];
      
      // 2. Found it! Now delete it.
      Calendar.Events.remove(GLOBAL_CONFIG.TARGET_CALENDAR_ID, targetEvent.id);
      Logger.log(`   > Deleted [${targetEvent.summary}] from target calendar.`);
      
    } else {
      Logger.log(`   > Event (ID: ${sourceEventId}) not found in target. Already deleted.`);
    }
  } catch (e) {
    Logger.log(`Error trying to delete event (ID: ${sourceEventId}): ${e}`);
  }
}

/**
 * ==============================================================================
 * UTILITY FUNCTION (Run Manually)
 * ==============================================================================
 */

/**
 * Run this function manually from the Apps Script editor to reset all
 * sync tokens. This will force a full, clean re-sync of all calendars
 * on the next run.
 *
 * Useful if you change the date ranges or something gets stuck.
 */
function resetAllSyncTokens() {
  const userProperties = PropertiesService.getUserProperties();
  Logger.log('Resetting all stored Sync Tokens...');
  
  for (const source of SOURCE_CALENDARS) {
    const propertyKey = GLOBAL_CONFIG.TOKEN_PROPERTY_PREFIX + source.id;
    userProperties.deleteProperty(propertyKey);
    Logger.log(`   > Token for ${source.id} deleted.`);
  }
  
  Logger.log('Reset complete! The next run will be a First-Time Sync for all calendars.');
}