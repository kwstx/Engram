import * as vscode from 'vscode';
import { LabsController } from './LabsController';

export class ParasocialHypeMan {
    private static statusBarItem: vscode.StatusBarItem;

    public static async trigger(userPrompt: string) {
        if (!this.statusBarItem) {
            this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000);
        }

        const controller = LabsController.getInstance();
        const model = controller.getSecondaryModel();

        // Don't await this! Fire and forget.
        this.generateHype(userPrompt, model);
    }

    private static async generateHype(userPrompt: string, model: string) {
        try {
            this.statusBarItem.text = "$(loading~spin) Brainstorming...";
            this.statusBarItem.show();

            const prompt = `You are an excited, supportive pair programmer. 
            The user just asked this: "${userPrompt.substring(0, 100)}..."
            
            Write a SHORT, ONE-SENTENCE compliment about how good this idea is. 
            Be hyped but professional. 
            Example: "Ooh, that's a smart optimization, let's cook!"
            Response:`;

            const response = await fetch('http://localhost:11434/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: model,
                    prompt: prompt,
                    stream: false
                })
            });

            if (response.ok) {
                const data = await response.json() as { response: string };
                const hype = data.response.trim().replace(/^["']|["']$/g, '');

                this.statusBarItem.text = `$(heart) ${hype}`;

                // Keep it visible for 5 seconds
                setTimeout(() => {
                    this.statusBarItem.hide();
                }, 5000);
            }
        } catch (e) {
            // Silently fail, it's just a hype man
            this.statusBarItem.hide();
        }
    }
}
