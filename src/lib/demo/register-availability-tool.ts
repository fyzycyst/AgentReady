/**
 * Imperative WebMCP tool for the /demo page; abort the registration signal to
 * unregister.
 *
 * Idempotent by design: the component calls this both at mount (native
 * `document.modelContext` may already exist when the WebMCP flag is on) and
 * from the polyfill's onLoad — under native both paths fire, and a second
 * registerTool throws InvalidStateError "Duplicate tool name". Skip when the
 * tool is already listed, and treat a duplicate-name race as success.
 */
export async function registerAvailabilityTool(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;

  const mc = document.modelContext;
  if (!mc?.registerTool) return;

  try {
    const tools = (await mc.getTools?.()) ?? [];
    if (tools.some((t) => t.name === "check_availability")) return;
  } catch {
    // getTools unavailable or failed — fall through and let registerTool decide.
  }

  await mc.registerTool(
    {
      name: "check_availability",
      description: "Check whether Le Petit Bistro has open tables for a given date, time, and party size.",
      title: "Check table availability",
      inputSchema: {
        type: "object",
        properties: {
          date: { type: "string", description: "Reservation date (YYYY-MM-DD)" },
          time: { type: "string", description: "Preferred time (HH:MM, 24-hour)" },
          party_size: { type: "integer", description: "Number of guests", minimum: 1, maximum: 12 },
        },
        required: ["date", "time", "party_size"],
      },
      annotations: { readOnlyHint: true },
      execute: async (input: Record<string, unknown>) => {
        const date = String(input.date ?? "");
        const time = String(input.time ?? "");
        const size = Number(input.party_size ?? 0);
        if (!date || !time || size < 1) return "Please provide date, time, and party size.";
        const slots = ["18:00", "18:30", "19:00", "19:30", "20:00", "20:30"];
        const open = slots.includes(time) && size <= 8;
        return open
          ? `Tables available for ${size} on ${date} at ${time}.`
          : `No tables for ${size} on ${date} at ${time}. Try 19:00 or 20:00.`;
      },
    },
    { signal },
  );
}
