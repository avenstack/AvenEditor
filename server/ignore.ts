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
 * Load ignore rules from a file
 */
export async function loadIgnoreFile(filePath: string): Promise<IgnoreMatcher | null> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return new IgnoreMatcher(content);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Create ignore matcher from environment variables
 * Falls back to AVENEDITOR_IGNORE_DIRS if no ignore file is specified
 */
export async function createIgnoreMatcher(
  ignoreFilePath: string | undefined,
  ignoredDirsEnv: string
): Promise<IgnoreMatcher> {
  // Try to load from ignore file first
  if (ignoreFilePath) {
    const matcher = await loadIgnoreFile(ignoreFilePath);
    if (matcher) {
      return matcher;
    }
  }

  // Fallback to comma-separated directory list
  const dirs = ignoredDirsEnv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  // Convert to .gitignore format
  const content = dirs.map((dir) => `${dir}/`).join('\n');
  return new IgnoreMatcher(content);
}
