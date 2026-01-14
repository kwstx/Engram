import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { RuleManager } from './ruleManager';
import { MistakeFingerprint } from './types';

export class ContextInjector {
    private static instance: ContextInjector;
    private context: vscode.ExtensionContext | null = null;

    // Markers for safe injection
    private readonly START_MARKER = "# --- ENGRAM AUTO-GENERATED RULES (DO NOT EDIT) ---";
    private readonly END_MARKER = "# --- END ENGRAM RULES ---";

    private constructor() { }

    public static getInstance(): ContextInjector {
        if (!ContextInjector.instance) {
            ContextInjector.instance = new ContextInjector();
        }
        return ContextInjector.instance;
    }

    public setContext(context: vscode.ExtensionContext) {
        this.context = context;
    }

    public async updateCursorRules(fingerprints: MistakeFingerprint[]) {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) return;

        const rootPath = workspaceFolders[0].uri.fsPath;

        // Target Files
        const targets = [
            path.join(rootPath, '.cursorrules'),
            path.join(rootPath, 'engram_context.md'),
            path.join(rootPath, '.github', 'copilot-instructions.md')
        ];

        // Generate the new block
        const ruleBlock = RuleManager.getInstance().generateRules(fingerprints);
        if (!ruleBlock) return;

        const injectionContent = `\n\n${this.START_MARKER}\n${ruleBlock}\n${this.END_MARKER}\n`;

        for (const targetPath of targets) {
            await this.injectIntoFile(targetPath, injectionContent);
        }
    }

    private async injectIntoFile(filePath: string, content: string) {
        // Ensure directory exists (e.g. .github)
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            try {
                fs.mkdirSync(dir, { recursive: true });
            } catch (e) {
                console.error(`[ContextInjector] Failed to create directory for ${filePath}`, e);
                return;
            }
        }

        let fileContent = "";
        if (fs.existsSync(filePath)) {
            try {
                fileContent = await fs.promises.readFile(filePath, 'utf8');
            } catch (e) {
                console.error(`[ContextInjector] Failed to read ${filePath}`, e);
                return;
            }
        }

        const startIdx = fileContent.indexOf(this.START_MARKER);
        const endIdx = fileContent.indexOf(this.END_MARKER);

        let newContent = "";

        if (startIdx !== -1 && endIdx !== -1) {
            // Replace existing block
            const before = fileContent.substring(0, startIdx).trimEnd();
            const after = fileContent.substring(endIdx + this.END_MARKER.length).trimStart();
            newContent = `${before}${content}${after}`;
        } else {
            // Append
            newContent = `${fileContent.trimEnd()}${content}`;
        }

        try {
            await fs.promises.writeFile(filePath, newContent, 'utf8');
            console.log(`[ContextInjector] Updated ${path.basename(filePath)}`);
        } catch (e) {
            console.error(`[ContextInjector] Failed to write ${filePath}`, e);
        }
    }
}
