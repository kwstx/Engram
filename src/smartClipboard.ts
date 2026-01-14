import * as vscode from 'vscode';
import { RuleManager } from './ruleManager';
import { MistakeDetector } from './mistakeDetector';

export class SmartClipboard {
    private static instance: SmartClipboard;

    private constructor() { }

    public static getInstance(): SmartClipboard {
        if (!SmartClipboard.instance) {
            SmartClipboard.instance = new SmartClipboard();
        }
        return SmartClipboard.instance;
    }

    public async copy(editor: vscode.TextEditor) {
        const selection = editor.selection;
        const text = editor.document.getText(selection);

        if (!text) {
            vscode.window.showWarningMessage("Engram: No text selected for Smart Copy.");
            return;
        }

        // Get Global Rules
        // In the future: filter rules by relevance to 'text'
        const detector = MistakeDetector.getInstance();
        const rules = RuleManager.getInstance().generateRules(detector.getAllFingerprints());

        if (!rules) {
            // No rules? Just copy normal text
            await vscode.env.clipboard.writeText(text);
            vscode.window.showInformationMessage("Engram: Copied (No context rules active).");
            return;
        }

        const payload = `
${rules}

<user_code>
${text}
</user_code>
`;
        await vscode.env.clipboard.writeText(payload);
        vscode.window.showInformationMessage("Engram: Smart Copy! (Context Injected 📋)");
    }
}
