import { MistakeFingerprint } from './types';

/**
 * Responsible for translating raw "Mistake Fingerprints" into natural language rules
 * that an AI (like Cursor or Copilot) can understand.
 */
export class RuleManager {
    private static instance: RuleManager;

    private constructor() { }

    public static getInstance(): RuleManager {
        if (!RuleManager.instance) {
            RuleManager.instance = new RuleManager();
        }
        return RuleManager.instance;
    }

    /**
     * Converts a list of fingerprints into a markdown-formatted rule block.
     * @param fingerprints List of all detected mistakes
     */
    public generateRules(fingerprints: MistakeFingerprint[]): string {
        // 1. Filter for "High Frequency" mistakes (count > 3)
        // or mistakes that are explicitly flagged as strict.
        const significantMistakes = fingerprints
            .filter(f => f.count >= 3 && !f.ignored)
            .sort((a, b) => b.count - a.count)
            .slice(0, 5); // Top 5 most annoying mistakes

        if (significantMistakes.length === 0) {
            return "";
        }

        const rules = significantMistakes.map(f => this.translateToRule(f));

        return [
            "<system_context>",
            "  <!-- ENGRAM MEMORY INJECTION -->",
            "  <!-- The user has a history of making the following mistakes. PREVENT them in your output. -->",
            ...rules.map(r => `  - RULE: ${r}`),
            "</system_context>"
        ].join("\n");
    }

    private translateToRule(fingerprint: MistakeFingerprint): string {
        // Heuristic: Try to extract meaningful keywords from the error pattern
        // The pattern is usually "Source:Code:Message"
        // Example: "ts:2322:Type '...' is not assignable to type '...'"

        const parts = fingerprint.pattern.split(':');
        let message = parts.length > 2 ? parts.slice(2).join(':') : fingerprint.pattern;

        // Clean up common noise
        message = message.replace(/'[^']*'/g, "'...'").replace(/"[^"]*"/g, '"..."');


        // SECURITY: Escape XML characters to prevent injection
        message = message.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // Logic A: If we have captured fixes, use the "Description" if available
        // (Currently our captureFix uses generic descriptions, but in future this could be smarter)

        // Logic B: Generic Fallback
        return `Avoid causing error: "${message}". (User has triggered this ${fingerprint.count} times).`;
    }
}
