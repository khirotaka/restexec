/**
 * Example: Using zod library for validation
 *
 * This demonstrates how to use the pre-cached zod library
 * in the restexec sandbox environment.
 */
import { z } from 'zod';

async function main() {
  try {
    // Define a user schema
    const UserSchema = z.object({
      name: z.string().min(1, 'Name is required'),
      age: z.number().int().positive('Age must be positive'),
      email: z.string().email('Invalid email format'),
      role: z.enum(['admin', 'user', 'guest']).optional(),
    });

    // Test data
    const validData = {
      name: 'John Doe',
      age: 30,
      email: 'john@example.com',
      role: 'user' as const,
    };

    const invalidData = {
      name: '',
      age: -5,
      email: 'invalid-email',
    };

    // Validate valid data
    const validResult = UserSchema.safeParse(validData);

    // Validate invalid data
    const invalidResult = UserSchema.safeParse(invalidData);

    const result = {
      success: true,
      validations: {
        validData: {
          success: validResult.success,
          data: validResult.success ? validResult.data : null,
        },
        invalidData: {
          success: invalidResult.success,
          errors: invalidResult.success ? null : invalidResult.error.format(),
        },
      },
    };

    console.log(JSON.stringify(result, null, 2));
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
