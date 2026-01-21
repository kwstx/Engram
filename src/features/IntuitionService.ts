
import * as vscode from 'vscode';
import { OllamaService } from '../llm';

export class ShadowIntuition implements vscode.InlineCompletionItemProvider {
    private static instance: ShadowIntuition;
    private lastBroadcastContent: string | null = null; // Caching for deduplication
    private statusBarItem: vscode.StatusBarItem;

    // Dynamic Physics (Defaults)
    private readonly DEFAULT_DELAY = 1200;

    private constructor() {
        // Initialize Status Bar
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.statusBarItem.command = 'engram.toggleIntuition';
        this.updateStatusBar();
    }

    public static getInstance(): ShadowIntuition {
        if (!ShadowIntuition.instance) {
            ShadowIntuition.instance = new ShadowIntuition();
        }
        return ShadowIntuition.instance;
    }

    // Register the provider
    public startListening(context: vscode.ExtensionContext) {
        const provider = vscode.languages.registerInlineCompletionItemProvider(
            { pattern: '**' }, // All files
            this
        );

        // Register Toggle Command
        const toggleCommand = vscode.commands.registerCommand('engram.toggleIntuition', async () => {
            const config = vscode.workspace.getConfiguration('engram');
            const currentValue = config.get<boolean>('predictiveIntuition', true);

            // Quick Pick Menu
            const selection = await vscode.window.showQuickPick([
                { label: currentValue ? '$(circle-filled) Disable Intuition' : '$(circle-outline) Enable Intuition', description: 'Toggle AI ghost text' },
                { label: '$(settings) Adjust Delay', description: `Current: ${config.get('intuitionDelay')}ms` },
                { label: '$(output) View Telepathy Log', description: 'Show what the AI is thinking' }
            ], { placeHolder: 'Manage Predictive Intuition (Pre-Cog)' });

            if (!selection) return;

            if (selection.label.includes('Disable') || selection.label.includes('Enable')) {
                await config.update('predictiveIntuition', !currentValue, vscode.ConfigurationTarget.Global);
                this.updateStatusBar();
            } else if (selection.label.includes('Adjust Delay')) {
                const input = await vscode.window.showInputBox({
                    prompt: 'Enter delay in milliseconds (e.g. 1200)',
                    value: String(config.get('intuitionDelay'))
                });
                if (input && !isNaN(Number(input))) {
                    await config.update('intuitionDelay', Number(input), vscode.ConfigurationTarget.Global);
                }
            } else if (selection.label.includes('View Telepathy Log')) {
                this.openTelepathyLog();
            }
        });

        // Listen for config changes to update status bar
        const configListener = vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('engram.predictiveIntuition')) {
                this.updateStatusBar();
            }
        });

        context.subscriptions.push(provider, toggleCommand, this.statusBarItem, configListener);
        this.statusBarItem.show();
    }

    private updateStatusBar() {
        const config = vscode.workspace.getConfiguration('engram');
        const enabled = config.get<boolean>('predictiveIntuition', true);
        if (enabled) {
            this.statusBarItem.text = '$(telescope) Intuition: On';
            this.statusBarItem.tooltip = 'Predictive Intuition is Active (Click to configure)';
            this.statusBarItem.backgroundColor = undefined;
        } else {
            this.statusBarItem.text = '$(telescope) Intuition: Off';
            this.statusBarItem.tooltip = 'Predictive Intuition is Disabled';
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        }
    }

    private async openTelepathyLog() {
        if (!vscode.workspace.workspaceFolders) return;
        const uri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, '.engram', 'intuition.md');
        try {
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc);
        } catch (e) {
            vscode.window.showInformationMessage("No Telepathy Log found yet. Start typing!");
        }
    }

    // Native API Method
    public async provideInlineCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.InlineCompletionContext,
        token: vscode.CancellationToken
    ): Promise<vscode.InlineCompletionItem[] | vscode.InlineCompletionList | null> {

        // 1. Feature Flag Check
        const config = vscode.workspace.getConfiguration('engram');
        if (!config.get<boolean>('predictiveIntuition', true)) {
            return null;
        }

        // 2. Debounce
        const delay = config.get<number>('intuitionDelay', this.DEFAULT_DELAY);
        await new Promise(resolve => setTimeout(resolve, delay));
        if (token.isCancellationRequested) return null;


        // 3. FIM Context Gathering
        const offset = document.offsetAt(position);
        const text = document.getText();

        // Prefix: Last 2000 chars
        const start = Math.max(0, offset - 2000);
        const prefix = text.substring(start, offset);

        // Suffix: Next 1000 chars
        const end = Math.min(text.length, offset + 1000);
        const suffix = text.substring(offset, end);

        // 4. Prompt Director
        const lineText = document.lineAt(position.line).text.trim();
        const isComment = lineText.startsWith('//');
        const isEmpty = lineText === '';

        let isDirecting = false;
        if (isEmpty || isComment) {
            isDirecting = true;
        }

        // 5. Construct Prompt
        let prompt = `You are a code completion engine.
        Goal: Complete the code at the cursor (between PREFIX and SUFFIX).
        Rules:
        1. Output ONLY the code to insert.
        2. Do NOT repeat the suffix.
        3. Do NOT output markdown.
        ${isDirecting ? '4. If the context implies a new task (e.g. empty line or comment), you may suggest a natural language prompt starting with "✨ Ask AI: ".' : ''}
        
        PREFIX:
        ${prefix}

        SUFFIX:
        ${suffix}
        `;

        try {
            // Call LLM
            const response = await fetch('http://localhost:11434/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'qwen2.5:0.5b',
                    prompt: prompt,
                    stream: false,
                    options: {
                        num_predict: 50,
                        temperature: 0.1,
                        stop: ["SUFFIX:", "<|endoftext|>"]
                    }
                })
            });

            if (token.isCancellationRequested) return null;

            if (response.ok) {
                const data = await response.json() as { response: string };
                let prediction = data.response.trim();

                // Cleanup
                prediction = prediction.replace(/```typescript/g, '').replace(/```/g, '').trim();

                if (prediction) {
                    // Telepathy Broadcast
                    this.broadcastPrediction(document, prediction);

                    // Return native item
                    return [new vscode.InlineCompletionItem(prediction, new vscode.Range(position, position))];
                }
            }
        } catch (e) {
            console.error("Intuition failed:", e);
            this.statusBarItem.text = '$(warning) Intuition Error';
            this.statusBarItem.tooltip = 'Check if Ollama is running.';
        }

        this.clearBroadcast();
        return null;
    }

    private async broadcastPrediction(document: vscode.TextDocument, prediction: string) {
        if (!vscode.workspace.workspaceFolders) return;

        try {
            const root = vscode.workspace.workspaceFolders[0].uri;
            const engramDir = vscode.Uri.joinPath(root, '.engram');
            const intuitionFile = vscode.Uri.joinPath(engramDir, 'intuition.md');

            const content = `# Engram Psychic Link
> **Timestamp:** ${new Date().toISOString()}
> **File:** ${vscode.workspace.asRelativePath(document.uri)}
> **State:** 🔮 PREDICTING
> **Status:** Active (Core Feature)
> **Disable:** Click 'Intuition: On' in Status Bar

## Prediction
\`\`\`typescript
${prediction}
\`\`\`
`;
            if (this.lastBroadcastContent === content) return;
            this.lastBroadcastContent = content;

            await vscode.workspace.fs.createDirectory(engramDir);
            await vscode.workspace.fs.writeFile(intuitionFile, new TextEncoder().encode(content));
        } catch (e) {
            console.error("[ShadowIntuition] Broadcast failed:", e);
        }
    }

    private async clearBroadcast() {
        if (!vscode.workspace.workspaceFolders) return;
        if (this.lastBroadcastContent === 'IDLE') return;

        try {
            const root = vscode.workspace.workspaceFolders[0].uri;
            const intuitionFile = vscode.Uri.joinPath(root, '.engram', 'intuition.md');
            const content = `# Engram Psychic Link
> **Timestamp:** ${new Date().toISOString()}
> **State:** 💤 IDLE
> **Stop Me:** Ask your AI agent to set \`"engram.experimental.predictiveIntuition": false\` in .vscode/settings.json
`;
            this.lastBroadcastContent = 'IDLE';
            await vscode.workspace.fs.writeFile(intuitionFile, new TextEncoder().encode(content));
        } catch (e) { }
    }
}
