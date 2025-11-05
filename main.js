/**
 * ==============================================================================
 * Google Calendar Multi-Sync to Primary (v2.4)
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
 * - Assigns a specific Google Calendar Color ID to events from each source.
 * - Includes throttling (`Utilities.sleep`) to avoid "Quota Exceeded" errors.
 * - [v2.4] Includes utility functions to reset tokens or clear all synced events.
 *
 * @author [name_Pepo]
 * @version 2.4
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

  // Pause (in milliseconds) after processing each event *during the first sync*.
  // Helps to avoid "Quota Exceeded" errors. 500ms is a safe value.
  INITIAL_SYNC_THROTTLE: 500,

  // --- Initial Sync Date Range (in days) ---
  // How far back to look for events on the very first sync.
  INITIAL_SYNC_PAST_DAYS: 7,
  
  // How far forward to look. Prevents infinite loops on recurring events.
  // 365 is standard. If you hit a 6-minute timeout, see README.
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
      showDeleted: true,
      singleEvents: true,
      maxResults: 250
    };

    if (syncToken) {
      // --- NORMAL SYNC (Using a Token) ---
      requestParameters.syncToken = syncToken;
      Logger.log(`Sync (Token) starting for [${sourceCalendarName}]...`);
    } else {
      // --- FIRST-TIME SYNC (No Token) ---
      const startTime = new Date(Date.now() - (GLOBAL_CONFIG.INITIAL_SYNC_PAST_DAYS * 24 * 60 * 60 * 1000));
      requestParameters.timeMin = startTime.toISOString();

      const endTime = new Date(Date.now() + (GLOBAL_CONFIG.INITIAL_SYNC_FUTURE_DAYS * 24 * 60 * 60 * 1000));
      requestParameters.timeMax = endTime.toISOString();
      
      Logger.log(`Sync (First Time, ${GLOBAL_CONFIG.INITIAL_SYNC_PAST_DAYS}d back, ${GLOBAL_CONFIG.INITIAL_SYNC_FUTURE_DAYS}d fwd) starting for [${sourceCalendarName}]...`);
    }

    try {
      let eventPages;
      let pageToken;

      do {
        requestParameters.pageToken = pageToken;
        eventPages = Calendar.Events.list(calendarId, requestParameters);

        if (!eventPages.items || eventPages.items.length === 0) {
          Logger.log(`   > No changes found for [${sourceCalendarName}].`);
          break; 
        }

        for (const sourceEvent of eventPages.items) {
          
          if (sourceEvent.status === 'cancelled') {
            deleteTargetEvent(sourceEvent, sourceCalendarName);
          } else {
            createOrUpdateEvent(sourceEvent, primaryCalendar, prefix, colorId, sourceCalendarName);
          }

          // Throttle *only* during the first sync to avoid 6-minute timeout
          if (!syncToken) { 
            Utilities.sleep(GLOBAL_CONFIG.INITIAL_SYNC_THROTTLE);
          }
        }
        
        pageToken = eventPages.nextPageToken;
        
        if (syncToken && !pageToken) {
           break;
        }

      } while (pageToken);

      if (eventPages.nextSyncToken) {
        userProperties.setProperty(tokenPropertyKey, eventPages.nextSyncToken);
        Logger.log(`   > New Sync Token saved for [${sourceCalendarName}].`);
      }

    } catch (e) {
      if (e.message.includes('Sync token is no longer valid') || e.message.includes('410')) {
        Logger.log(`¡Sync Token Expired for [${sourceCalendarName}]! Deleting token to force re-sync.`);
        userProperties.deleteProperty(tokenPropertyKey);
      } else {
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
 * @param {object} sourceEvent - The event object from the source calendar (from Calendar API).
 * @param {Calendar} targetCalendar - The CalendarApp object for the target calendar.
 * @param {string} prefix - The text prefix (e.g., "[Work]") to add to the title.
 * @param {string} sourceColorId - The Google Calendar color ID (1-11) to apply.
 * @param {string} sourceCalendarName - The name of the source calendar (for logging).
 */
function createOrUpdateEvent(sourceEvent, targetCalendar, prefix, sourceColorId, sourceCalendarName) {
  const sourceEventId = sourceEvent.id;
  
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
     return;
  }
  
  let title = sourceEvent.summary || '(No Title)';
  
  // If the prefix is from a *different* source, or has no prefix, add it.
  // This correctly handles moving an event (e.g., from [Work] to [Univ]).
  const currentPrefixMatch = title.match(/^\[(.*?)\]/);
  if (!currentPrefixMatch || currentPrefixMatch[1] !== sourceCalendarName) {
    if (currentPrefixMatch) {
      // Remove the old prefix
      title = title.substring(currentPrefixMatch[0].length).trim();
    }
    title = `${prefix} ${title}`;
  }

  const eventStart = sourceEvent.start.date ? { date: sourceEvent.start.date } : { dateTime: sourceEvent.start.dateTime };
  const eventEnd = sourceEvent.end.date ? { date: sourceEvent.end.date } : { dateTime: sourceEvent.end.dateTime };

  const targetEventPayload = {
    summary: title,
    description: sourceEvent.description || '',
    location: sourceEvent.location || '',
    start: eventStart,
    end: eventEnd,
    recurrence: sourceEvent.recurrence || null,
    colorId: sourceColorId,
    extendedProperties: {
      private: {
        [GLOBAL_CONFIG.SYNC_TAG_KEY]: sourceEventId
      }
    }
  };

  try {
    if (existingTargetEvent) {
      Calendar.Events.update(targetEventPayload, GLOBAL_CONFIG.TARGET_CALENDAR_ID, existingTargetEvent.id);
      Logger.log(`Event updated: [${title}]`);
    } else {
      Calendar.Events.insert(targetEventPayload, GLOBAL_CONFIG.TARGET_CALENDAR_ID);
      Logger.log(`Event created: [${title}]`);
    }
  } catch (e) {
    Logger.log(`Error inserting/updating event [${title}]: ${e}`);
  }
}


/**
 * Deletes an event from the target calendar.
 * @param {object} sourceEvent - The event object (status: 'cancelled') from the API.
 * @param {string} sourceCalendarName - The name of the source calendar (for logging).
 */
function deleteTargetEvent(sourceEvent, sourceCalendarName) {
  const sourceEventId = sourceEvent.id;
  Logger.log(`Processing DELETE for source ID: ${sourceEventId} (from [${sourceCalendarName}])`);

  const searchParameters = {
    privateExtendedProperty: `${GLOBAL_CONFIG.SYNC_TAG_KEY}=${sourceEventId}`
  };

  try {
    const foundEvents = Calendar.Events.list(GLOBAL_CONFIG.TARGET_CALENDAR_ID, searchParameters);

    if (foundEvents.items && foundEvents.items.length > 0) {
      const targetEvent = foundEvents.items[0];
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
 * UTILITY FUNCTIONS (Run Manually from Editor)
 * ==============================================================================
 */

/**
 * Run this function manually to reset all sync tokens.
 * This will force a full, clean re-sync of all calendars.
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

/**
 * [v2.4] DANGER! Run this function manually to delete ALL events
 * in your Primary calendar that were created by this script.
 * Useful for cleaning "orphan" events if the state becomes corrupted.
 */
function deleteAllSyncedEventsFromPrimary() {
  Logger.log('WARNING! Starting cleanup of ALL synced events from Primary calendar...');
  const primaryCalAPI = Calendar.Events;
  let pageToken;
  let deletedCount = 0;

  do {
    try {
      // Use 'q' parameter to find all events that HAVE our sync tag
      const events = primaryCalAPI.list(GLOBAL_CONFIG.TARGET_CALENDAR_ID, {
        q: `extendedProperty:${GLOBAL_CONFIG.SYNC_TAG_KEY}`, // <-- Find events with this tag
        maxResults: 250,
        pageToken: pageToken
      });

      if (!events.items || events.items.length === 0) {
        Logger.log('No more synced events found to delete.');
        break;
      }

      for (const event of events.items) {
        try {
          primaryCalAPI.remove(GLOBAL_CONFIG.TARGET_CALENDAR_ID, event.id);
          Logger.log(`   > Deleted [${event.summary}] (ID: ${event.id})`);
          deletedCount++;
        } catch (e) {
          Logger.log(`Error deleting [${event.summary}]: ${e}`);
        }
        // Brief pause to avoid 'remove' quota errors
        Utilities.sleep(300); 
      }
      pageToken = events.nextPageToken;

    } catch (e) {
      Logger.log(`Error searching for events to delete: ${e}`);
      break;
    }
  } while (pageToken);

  Logger.log(`Cleanup complete. Deleted ${deletedCount} events.`);
}
