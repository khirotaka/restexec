/**
 * Build allowed environment variables for Deno execution.
 *
 * This function creates a whitelist of environment variables by combining
 * system-required variables (PATH, DENO_DIR) with user-defined variables.
 *
 * @param userEnv - Optional user-defined environment variables
 * @returns Record of allowed environment variables
 */
export function buildAllowedEnv(
  userEnv?: Record<string, string>,
): Record<string, string> {
  const allowedEnv: Record<string, string> = {};

  // システム必須の環境変数
  const path = Deno.env.get('PATH');
  const denoDir = Deno.env.get('DENO_DIR');
  if (path) allowedEnv.PATH = path;
  if (denoDir) allowedEnv.DENO_DIR = denoDir;

  // ユーザー定義環境変数をマージ
  if (userEnv) {
    Object.assign(allowedEnv, userEnv);
  }

  return allowedEnv;
}
