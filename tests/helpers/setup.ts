import { mkdtemp, rm, mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

/**
 * Test environment helper for automatic setup and cleanup
 */
export class TestEnvironment {
  public workspaceDir!: string;
  public toolsDir!: string;
  private tempRoot!: string;

  /**
   * Set up temporary directories for testing
   */
  async setup(): Promise<void> {
    // Create temporary root directory
    this.tempRoot = await mkdtemp(join(tmpdir(), 'restexec-test-'));
    this.workspaceDir = join(this.tempRoot, 'workspace');
    this.toolsDir = join(this.tempRoot, 'tools');

    await mkdir(this.workspaceDir);
    await mkdir(this.toolsDir);

    // Create default import_map.json with file:// URL for absolute path
    await this.writeImportMap({
      imports: {
        '@/': `file://${this.toolsDir}/`,
      },
    });
  }

  /**
   * Clean up temporary directories
   */
  async cleanup(): Promise<void> {
    if (this.tempRoot) {
      await rm(this.tempRoot, { recursive: true, force: true });
    }
  }

  /**
   * Write a TypeScript file to workspace
   */
  async writeCode(codeId: string, content: string): Promise<string> {
    const filePath = join(this.workspaceDir, `${codeId}.ts`);
    await writeFile(filePath, content, 'utf-8');
    return filePath;
  }

  /**
   * Write a tool/library file
   */
  async writeTool(relativePath: string, content: string): Promise<string> {
    const filePath = join(this.toolsDir, relativePath);
    const dirPath = join(filePath, '..');
    await mkdir(dirPath, { recursive: true });
    await writeFile(filePath, content, 'utf-8');
    return filePath;
  }

  /**
   * Write import_map.json
   */
  async writeImportMap(importMap: Record<string, unknown>): Promise<void> {
    const filePath = join(this.workspaceDir, 'import_map.json');
    await writeFile(filePath, JSON.stringify(importMap, null, 2), 'utf-8');
  }

  /**
   * Get full path for a code file
   */
  getCodePath(codeId: string): string {
    return join(this.workspaceDir, `${codeId}.ts`);
  }

  /**
   * Get full path for a tool file
   */
  getToolPath(relativePath: string): string {
    return join(this.toolsDir, relativePath);
  }
}

/**
 * Create a test environment instance
 */
export function createTestEnvironment(): TestEnvironment {
  return new TestEnvironment();
}
