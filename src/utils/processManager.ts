import { logger } from './logger.ts';

/**
 * Process Manager - Tracks active code execution processes
 *
 * This singleton class maintains a count of currently running
 * executeCode operations to enable:
 * - Load monitoring via /health endpoint
 * - DoS attack detection through activity metrics
 * - Operational visibility in logs
 */
class ProcessManager {
  private activeProcessCount = 0;

  /**
   * Increment the active process count
   * Called when a new code execution begins
   */
  increment(): void {
    this.activeProcessCount++;
    logger.debug(`Process started. Active processes: ${this.activeProcessCount}`);
  }

  /**
   * Decrement the active process count
   * Called when a code execution completes (success or failure)
   */
  decrement(): void {
    if (this.activeProcessCount > 0) {
      this.activeProcessCount--;
      logger.debug(`Process completed. Active processes: ${this.activeProcessCount}`);
    } else {
      logger.warn('Attempted to decrement process count when already at 0');
    }
  }

  /**
   * Get the current number of active processes
   * Used by /health endpoint and logging
   */
  getActiveCount(): number {
    return this.activeProcessCount;
  }

  /**
   * Reset the process count (primarily for testing)
   */
  reset(): void {
    logger.debug('Resetting process count');
    this.activeProcessCount = 0;
  }
}

// Export singleton instance
export const processManager = new ProcessManager();
