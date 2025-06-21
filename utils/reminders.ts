import { run } from "@jxa/run";

// Define types for our reminders
interface ReminderList {
  name: string;
  id: string;
}

interface Reminder {
  name: string;
  id: string;
  body: string;
  completed: boolean;
  dueDate: string | null;
  listName: string;
  completionDate?: string | null;
  creationDate?: string | null;
  modificationDate?: string | null;
  remindMeDate?: string | null;
  priority?: number;
}

/**
 * Get all reminder lists
 * @returns Array of reminder lists with their names and IDs
 */
async function getAllLists(): Promise<ReminderList[]> {
  const lists = await run(() => {
    const Reminders = Application("Reminders");
    const lists = Reminders.lists();

    return lists.map((list: any) => ({
      name: list.name(),
      id: list.id(),
    }));
  });

  return lists as ReminderList[];
}

/**
 * Get reminders from a specific list by ID with customizable properties
 * @param listId ID of the list to get reminders from
 * @param props Array of properties to include (optional)
 * @returns Array of reminders with specified properties
 */
async function getRemindersFromListById(
  listId: string,
  props?: string[]
): Promise<any[]> {
  return await run(
    (args: { id: string; props?: string[] }) => {
      function main() {
        const reminders = Application("Reminders");
        const list = reminders.lists.byId(args.id).reminders;
        const props = args.props || [
          "name",
          "body",
          "id",
          "completed",
          "completionDate",
          "creationDate",
          "dueDate",
          "modificationDate",
          "remindMeDate",
          "priority",
        ];
        // We could traverse all reminders and for each one get the all the props.
        // This is more inefficient than calling '.name()' on the very reminder list. It requires
        // less function calls.
        const propFns: Record<string, any[]> = props.reduce(
          (obj: Record<string, any[]>, prop: string) => {
            obj[prop] = list[prop]();
            return obj;
          },
          {}
        );
        const finalList = [];

        // Flatten the object {name: string[], id: string[]} to an array of form
        // [{name: string, id: string}, ..., {name: string, id: string}] which represents the list
        // of reminders
        for (let i = 0; i < (propFns.name?.length || 0); i++) {
          const reminder = props.reduce(
            (obj: Record<string, any>, prop: string) => {
              obj[prop] = propFns[prop][i];
              return obj;
            },
            {}
          );
          finalList.push(reminder);
        }
        return finalList;
      }
      return main();
    },
    { id: listId, props }
  );
}

/**
 * Get all reminders from a specific list or all lists
 * @param listName Optional list name to filter by
 * @returns Array of reminders
 */
async function getAllReminders(listName?: string): Promise<Reminder[]> {
  const reminders = await run((listName: string | undefined) => {
    const Reminders = Application("Reminders");
    let allReminders: Reminder[] = [];

    if (listName) {
      // Get reminders from a specific list
      const lists = Reminders.lists.whose({ name: listName })();
      if (lists.length > 0) {
        const list = lists[0];
        allReminders = list.reminders().map((reminder: any) => ({
          name: reminder.name(),
          id: reminder.id(),
          body: reminder.body() || "",
          completed: reminder.completed(),
          dueDate: reminder.dueDate() ? reminder.dueDate().toISOString() : null,
          listName: list.name(),
        }));
      }
    } else {
      // Get reminders from all lists
      const lists = Reminders.lists();
      for (const list of lists) {
        const remindersInList = list.reminders().map((reminder: any) => ({
          name: reminder.name(),
          id: reminder.id(),
          body: reminder.body() || "",
          completed: reminder.completed(),
          dueDate: reminder.dueDate() ? reminder.dueDate().toISOString() : null,
          listName: list.name(),
        }));
        allReminders = allReminders.concat(remindersInList);
      }
    }

    return allReminders;
  }, listName);

  return reminders as Reminder[];
}

/**
 * Search for reminders by text
 * @param searchText Text to search for in reminder names or notes
 * @returns Array of matching reminders
 */
async function searchReminders(searchText: string): Promise<Reminder[]> {
  const reminders = await run((searchText: string) => {
    const Reminders = Application("Reminders");
    const lists = Reminders.lists();
    let matchingReminders: Reminder[] = [];

    for (const list of lists) {
      // Search in reminder names and bodies
      const remindersInList = list.reminders.whose({
        _or: [
          { name: { _contains: searchText } },
          { body: { _contains: searchText } },
        ],
      })();

      if (remindersInList.length > 0) {
        const mappedReminders = remindersInList.map((reminder: any) => ({
          name: reminder.name(),
          id: reminder.id(),
          body: reminder.body() || "",
          completed: reminder.completed(),
          dueDate: reminder.dueDate() ? reminder.dueDate().toISOString() : null,
          listName: list.name(),
        }));
        matchingReminders = matchingReminders.concat(mappedReminders);
      }
    }

    return matchingReminders;
  }, searchText);

  return reminders as Reminder[];
}

/**
 * Create a new reminder
 * @param name Name of the reminder
 * @param listName Name of the list to add the reminder to (creates if doesn't exist)
 * @param notes Optional notes for the reminder
 * @param dueDate Optional due date for the reminder (ISO string)
 * @returns The created reminder
 */
async function createReminder(
  name: string,
  listName: string = "Reminders",
  notes?: string,
  dueDate?: string
): Promise<Reminder> {
  const result = await run(
    (
      name: string,
      listName: string,
      notes: string | undefined,
      dueDate: string | undefined
    ) => {
      const Reminders = Application("Reminders");

      // Find or create the list
      let list;
      const existingLists = Reminders.lists.whose({ name: listName })();

      if (existingLists.length > 0) {
        list = existingLists[0];
      } else {
        // Create a new list if it doesn't exist
        list = Reminders.make({
          new: "list",
          withProperties: { name: listName },
        });
      }

      // Create the reminder properties
      const reminderProps: any = {
        name: name,
      };

      if (notes) {
        reminderProps.body = notes;
      }

      if (dueDate) {
        reminderProps.dueDate = new Date(dueDate);
      }

      // Create the reminder at the specified list
      const newReminder = Reminders.make({
        new: "reminder",
        at: list,
        withProperties: reminderProps,
      });

      return {
        name: newReminder.name(),
        id: newReminder.id(),
        body: newReminder.body() || "",
        completed: newReminder.completed(),
        dueDate: newReminder.dueDate()
          ? newReminder.dueDate().toISOString()
          : null,
        listName: list.name(),
      };
    },
    name,
    listName,
    notes,
    dueDate
  );

  return result as Reminder;
}

interface OpenReminderResult {
  success: boolean;
  message: string;
  reminder?: Reminder;
}

/**
 * Open the Reminders app and show a specific reminder
 * @param searchText Text to search for in reminder names or notes
 * @returns Result of the operation
 */
async function openReminder(searchText: string): Promise<OpenReminderResult> {
  // First search for the reminder
  const matchingReminders = await searchReminders(searchText);

  if (matchingReminders.length === 0) {
    return { success: false, message: "No matching reminders found" };
  }

  // Open the first matching reminder
  const reminder = matchingReminders[0];

  await run((reminderId: string) => {
    const Reminders = Application("Reminders");
    Reminders.activate();

    // Try to show the reminder
    // Note: This is a best effort as there's no direct way to show a specific reminder
    // We'll just open the app and return the reminder details

    return true;
  }, reminder.id);

  return {
    success: true,
    message: "Reminders app opened",
    reminder,
  };
}

export default {
  getAllLists,
  getAllReminders,
  searchReminders,
  createReminder,
  openReminder,
  getRemindersFromListById,
};
