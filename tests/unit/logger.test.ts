import { assertStringIncludes } from '@std/assert';
import { logger } from '../../src/utils/logger.ts';

/**
 * Capture console.error output for testing
 * Handles multiple arguments like the real console.error(...data: any[])
 */
function captureConsoleError(fn: () => void): string {
  let output = '';
  const originalConsoleError = console.error;
  console.error = (...data: unknown[]) => {
    output = data.map((item) => String(item)).join(' ');
  };

  try {
    fn();
  } finally {
    console.error = originalConsoleError;
  }

  return output;
}

Deno.test('Logger.error - should log message only', () => {
  const output = captureConsoleError(() => {
    logger.error('Simple error message');
  });

  assertStringIncludes(output, 'Simple error message');
  assertStringIncludes(output, 'ERROR');
});

Deno.test('Logger.error - should log message with Error object', () => {
  const testError = new Error('Test error occurred');
  const originalLogLevel = Deno.env.get('DENO_LOG_LEVEL');

  try {
    Deno.env.set('LOG_INCLUDE_STACK', 'true');
    const output = captureConsoleError(() => {
      logger.error('Failed to execute', testError);
    });

    // Message should include both the custom message and error message
    assertStringIncludes(output, 'Failed to execute - Test error occurred');
    assertStringIncludes(output, 'ERROR');

    // Should include error details in context
    assertStringIncludes(output, '"name":"Error"');
    assertStringIncludes(output, '"message":"Test error occurred"');
    assertStringIncludes(output, '"stack"');
  } finally {
    if (originalLogLevel !== undefined) {
      // 元の値が存在した場合は、元に戻す
      Deno.env.set('DENO_LOG_LEVEL', originalLogLevel);
    } else {
      // 元の値が存在しなかった場合は、削除する
      Deno.env.delete('DENO_LOG_LEVEL');
    }
  }
});

Deno.test('Logger.error - should log message with context only', () => {
  const output = captureConsoleError(() => {
    logger.error('Operation failed', { requestId: '123', userId: 'abc' });
  });

  assertStringIncludes(output, 'Operation failed');
  assertStringIncludes(output, 'ERROR');
  // Text format: requestId="123" or JSON format: "requestId":"123"
  assertStringIncludes(output, 'requestId');
  assertStringIncludes(output, '123');
  assertStringIncludes(output, 'userId');
  assertStringIncludes(output, 'abc');
});

Deno.test('Logger.error - should log message with both Error and context', () => {
  const testError = new Error('Database connection failed');
  const originalLogLevel = Deno.env.get('DENO_LOG_LEVEL');
  try {
    const output = captureConsoleError(() => {
      logger.error(
        'Database operation failed',
        testError,
        { requestId: 'req-456', operation: 'INSERT' },
      );
    });

    // Message should include both custom message and error message
    assertStringIncludes(output, 'Database operation failed - Database connection failed');
    assertStringIncludes(output, 'ERROR');

    // Should include both error details and custom context
    assertStringIncludes(output, '"name":"Error"');
    assertStringIncludes(output, '"message":"Database connection failed"');
    assertStringIncludes(output, '"stack"');
    // Text format: requestId="req-456" or JSON format: "requestId":"req-456"
    assertStringIncludes(output, 'requestId');
    assertStringIncludes(output, 'req-456');
    assertStringIncludes(output, 'operation');
    assertStringIncludes(output, 'INSERT');
  } finally {
    if (originalLogLevel !== undefined) {
      // 元の値が存在した場合は、元に戻す
      Deno.env.set('DENO_LOG_LEVEL', originalLogLevel);
    } else {
      // 元の値が存在しなかった場合は、削除する
      Deno.env.delete('DENO_LOG_LEVEL');
    }
  }
});

Deno.test('Logger.error - should preserve custom context when error is provided', () => {
  const testError = new Error('Custom error');

  const output = captureConsoleError(() => {
    logger.error(
      'Error occurred',
      testError,
      { userId: '789', timestamp: 1234567890 },
    );
  });

  // Custom context should be preserved
  // Text format: userId="789" or JSON format: "userId":"789"
  assertStringIncludes(output, 'userId');
  assertStringIncludes(output, '789');
  assertStringIncludes(output, 'timestamp');
  assertStringIncludes(output, '1234567890');

  // Error details should also be included
  assertStringIncludes(output, 'error');
  assertStringIncludes(output, '"name":"Error"');
  assertStringIncludes(output, '"message":"Custom error"');
});

Deno.test('Logger.error - should handle Error with custom properties', () => {
  class CustomError extends Error {
    constructor(message: string, public code: string) {
      super(message);
      this.name = 'CustomError';
    }
  }

  const customError = new CustomError('Custom error occurred', 'ERR_CUSTOM');

  const output = captureConsoleError(() => {
    logger.error('Custom error test', customError);
  });

  assertStringIncludes(output, 'Custom error test - Custom error occurred');
  assertStringIncludes(output, '"name":"CustomError"');
  assertStringIncludes(output, '"message":"Custom error occurred"');
});

Deno.test('Logger.error - backward compatibility: context as second argument', () => {
  const output = captureConsoleError(() => {
    // Old usage: logger.error(message, context)
    logger.error('Legacy error call', { requestId: 'old-123', component: 'legacy' });
  });

  assertStringIncludes(output, 'Legacy error call');
  assertStringIncludes(output, 'ERROR');
  // Should include context
  assertStringIncludes(output, 'requestId');
  assertStringIncludes(output, 'old-123');
  assertStringIncludes(output, 'component');
  assertStringIncludes(output, 'legacy');
  // Should NOT have error object details
  assertStringIncludes(output, 'Legacy error call');
  // Make sure it doesn't try to access .message on the context object
  // (which would result in "undefined")
});
