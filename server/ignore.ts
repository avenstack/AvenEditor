import fs from 'node:fs/promises';
import { minimatch } from 'minimatch';

interface IgnoreRule {
  pattern: string;
  isNegation: boolean;
  isDirectoryOnly: boolean;
  minimatchOptions: {
    dot?: boolean;
    nocase?: boolean;
    matchBase?: boolean;
  };
}

export class IgnoreMatcher {
  private rules: IgnoreRule[] = [];

  constructor(content: string) {
    this.parse(content);
  }

  private parse(content: string): void {
    const lines = content.split('\n');
    for (const line of lines) {
      const rule = this.parseRule(line);
      if (rule) {
        this.rules.push(rule);
      }
    }
  }

  private parseRule(line: string): IgnoreRule | null {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      return null;
    }

    // Check for negation
    const isNegation = trimmed.startsWith('!');
    let pattern = isNegation ? trimmed.slice(1).trim() : trimmed;

    // Check if it's directory-only (ends with /)
    const isDirectoryOnly = pattern.endsWith('/');
    pattern = isDirectoryOnly ? pattern.slice(0, -1) : pattern;

    // If pattern ends with /**, remove it for better matching
    if (pattern.endsWith('/**')) {
      pattern = pattern.slice(0, -3);
    }

    // Minimatch options
    const minimatchOptions: {
      dot?: boolean;
      nocase?: boolean;
    } = {
      dot: true, // Match dotfiles by default
      nocase: false,
    };

    // Pattern starting with / is anchored to root
    const anchored = pattern.startsWith('/');
    if (anchored) {
      pattern = pattern.slice(1);
    } else {
      // Non-anchored patterns can match anywhere
      // We'll handle this in the match method
    }

    return {
      pattern,
      isNegation,
      isDirectoryOnly,
      minimatchOptions: { ...minimatchOptions, matchBase: !anchored },
    };
  }

  /**
   * Test if a path should be ignored
   * @param relativePath Path relative to workspace root (e.g., "node_modules/pkg/index.js")
   * @param isDirectory Whether the path is a directory
   * @returns true if the path should be ignored
   */
  matches(relativePath: string, isDirectory: boolean): boolean {
    let result = false;

    for (const rule of this.rules) {
      // Directory-only rules don't match files
      if (rule.isDirectoryOnly && !isDirectory) {
        continue;
      }

      const matches = minimatch(relativePath, rule.pattern, rule.minimatchOptions);
      if (matches) {
        result = !rule.isNegation;
      }
    }

    return result;
  }
}

/**
 * Load ignore file content.
 */
export async function loadIgnoreFile(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Create ignore matcher from environment variables
 * Always merges AVENEDITOR_IGNORE_DIRS and ignore file rules.
 * Order matters: env directory rules first, file rules second (so file rules can override via `!`).
 */
export async function createIgnoreMatcher(
  ignoreFilePath: string | undefined,
  ignoredDirsEnv: string
): Promise<IgnoreMatcher> {
  const entries = ignoredDirsEnv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const hasGlobMeta = (value: string): boolean => /[*?[\]{}]/.test(value);
  const envRules = new Set<string>();

  for (const rawEntry of entries) {
    const entry = rawEntry.replace(/\\/g, '/').trim();
    if (!entry) {
      continue;
    }

    if (hasGlobMeta(entry)) {
      envRules.add(entry);
      continue;
    }

    const normalized = entry.replace(/^\/+/, '');
    if (!normalized) {
      continue;
    }

    // Match directory by name (legacy behavior), and also allow file ignore.
    envRules.add(normalized.endsWith('/') ? normalized : `${normalized}/`);
    envRules.add(normalized.endsWith('/') ? normalized.slice(0, -1) : normalized);
  }

  const envContent = Array.from(envRules).filter(Boolean).join('\n');

  // Then append ignore file rules (if file exists).
  const fileContent = ignoreFilePath ? await loadIgnoreFile(ignoreFilePath) : null;
  const mergedContent = [envContent, fileContent || ''].filter(Boolean).join('\n');

  return new IgnoreMatcher(mergedContent);
}
