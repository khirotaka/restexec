/**
 * Example: Using date-fns library for date operations
 *
 * This demonstrates how to use the pre-cached date-fns library
 * in the restexec sandbox environment.
 */
import { addDays, format, subDays, differenceInDays } from 'date-fns';

async function main() {
  try {
    const today = new Date();
    const tomorrow = addDays(today, 1);
    const yesterday = subDays(today, 1);
    const nextWeek = addDays(today, 7);
    const lastWeek = subDays(today, 7);

    const result = {
      success: true,
      data: {
        today: format(today, 'yyyy-MM-dd HH:mm:ss'),
        tomorrow: format(tomorrow, 'yyyy-MM-dd'),
        yesterday: format(yesterday, 'yyyy-MM-dd'),
        nextWeek: format(nextWeek, 'yyyy-MM-dd'),
        lastWeek: format(lastWeek, 'yyyy-MM-dd'),
        daysDifference: differenceInDays(nextWeek, lastWeek),
      },
    };

    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
    );
    Deno.exit(1);
  }
}

main();
