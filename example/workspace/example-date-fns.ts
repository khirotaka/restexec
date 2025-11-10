/**
 * Example: Using date-fns for date manipulation
 *
 * This example demonstrates how to use date-fns library for date operations.
 * Since the executor uses --cached-only flag, all dependencies must be
 * pre-cached during container build.
 *
 * Setup Requirements:
 * 1. Add to deps.ts:
 *    export * from "https://esm.sh/date-fns@3.0.0";
 *
 * 2. Add to import_map.json (optional):
 *    "date-fns": "https://esm.sh/date-fns@3.0.0"
 *
 * 3. Rebuild container:
 *    docker compose build
 *    docker compose up -d
 */

import { format, addDays, subDays, differenceInDays, startOfMonth, endOfMonth } from "date-fns";

async function main() {
    const today = new Date();
    const tomorrow = addDays(today, 1);
    const yesterday = subDays(today, 1);
    const weekAgo = subDays(today, 7);
    const monthStart = startOfMonth(today);
    const monthEnd = endOfMonth(today);

    const result = {
        success: true,
        dates: {
            today: format(today, 'yyyy-MM-dd'),
            tomorrow: format(tomorrow, 'yyyy-MM-dd'),
            yesterday: format(yesterday, 'yyyy-MM-dd'),
            weekAgo: format(weekAgo, 'yyyy-MM-dd'),
            monthStart: format(monthStart, 'yyyy-MM-dd'),
            monthEnd: format(monthEnd, 'yyyy-MM-dd'),
        },
        calculations: {
            daysSinceWeekAgo: differenceInDays(today, weekAgo),
            daysInMonth: differenceInDays(monthEnd, monthStart) + 1,
        },
        formatted: {
            todayLong: format(today, 'EEEE, MMMM do, yyyy'),
            todayTime: format(today, 'HH:mm:ss'),
            todayISO: format(today, "yyyy-MM-dd'T'HH:mm:ss.SSSxxx"),
        },
        metadata: {
            library: "date-fns@3.0.0",
            cdnUsed: "esm.sh"
        }
    };

    console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
    console.error(JSON.stringify({
        success: false,
        error: error.message,
        stack: error.stack
    }));
    Deno.exit(1);
});
