import * as vscode from 'vscode';
import { SessionStore } from '../sessionStore';
import { VibeSession } from '../types';

export class TimelineProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'engram.promptTimeline';
    private _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _sessionStore: SessionStore
    ) { }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'refresh': {
                    this.refresh();
                    break;
                }
                case 'getDiff': {
                    const diff = this._sessionStore.getPromptDiff(data.sessionId, data.versionId);
                    webviewView.webview.postMessage({ type: 'showDiff', diff: diff, versionId: data.versionId });
                    break;
                }
                case 'restore': {
                    const session = this._sessionStore.getSession(data.sessionId);
                    const version = session?.prompts.find(p => p.id === data.versionId);
                    if (version) {
                        const editor = vscode.window.activeTextEditor;
                        if (editor) {
                            editor.edit(editBuilder => {
                                editBuilder.insert(editor.selection.active, version.content);
                            });
                            vscode.window.showInformationMessage('Prompt inserted into editor.');
                        } else {
                            await vscode.env.clipboard.writeText(version.content);
                            vscode.window.showInformationMessage('Prompt copied to clipboard (No active editor).');
                        }
                    }
                    break;
                }
            }
        });
    }

    public refresh(sessionId?: string) {
        if (this._view) {
            this._view.webview.html = this._getHtmlForWebview(this._view.webview, sessionId);
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview, sessionId?: string) {
        // For demonstration, let's grab the first available session if none provided
        // In reality, we'd want to track the "active" session.
        // But SessionStore doesn't expose a list yet.
        // Let's assume we pass a session object or ID.

        let session: VibeSession | undefined;
        if (sessionId) {
            session = this._sessionStore.getSession(sessionId);
        }

        // TODO: Need a way to list sessions if no ID provided.
        // For now, if no session, show empty state or instructions.

        const promptList = session?.prompts.map(p => `
            <div class="prompt-item">
                <div onclick="selectVersion('${p.id}')">
                    <span class="timestamp">${new Date(p.timestamp).toLocaleTimeString()}</span>
                    <div class="preview">${p.content.substring(0, 50)}...</div>
                    <div class="id-badge">#${p.hash.substring(0, 6)}</div>
                </div>
                <div class="actions">
                    <button class="btn btn-sm" onclick="restoreVersion('${p.id}')" title="Insert into Editor">Restore</button>
                    <button class="btn btn-sm" onclick="copyVersion('${p.id}')" title="Copy to Clipboard">Copy</button>
                </div>
            </div>
            <div id="diff-${p.id}" class="diff-container" style="display:none;">Loading diff...</div>
            <div id="content-${p.id}" class="content-container" style="display:none;">
                <pre>${p.content}</pre>
            </div>
        `).join('') || '<p>No active session selected.</p>';

        const statusColor = session?.status === 'failed' ? 'red' : (session?.status === 'success' ? 'green' : 'inherit');
        const statusHeader = session ? `<div style="margin-bottom: 10px; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 5px;">
            <strong>Session:</strong> ${session.id.substring(0, 8)}... <br>
            <strong>Status:</strong> <span style="color: ${statusColor}">${session.status.toUpperCase()}</span>
        </div>` : '';

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Prompt Timeline</title>
            <style>
                body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 10px; }
                .prompt-item { 
                    padding: 8px; 
                    border-bottom: 1px solid var(--vscode-panel-border); 
                    /* cursor: pointer; removed from parent, moved to div */
                }
                .prompt-item:hover { background: var(--vscode-list-hoverBackground); }
                .timestamp { font-size: 0.8em; opacity: 0.7; }
                .preview { margin-top: 4px; font-weight: 500; cursor: pointer; }
                .id-badge { font-size: 0.7em; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); display: inline-block; padding: 2px 4px; border-radius: 3px; margin-top: 4px;}
                
                .actions { margin-top: 8px; display: flex; gap: 5px; }
                .btn { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 4px 8px; cursor: pointer; border-radius: 2px; font-size: 0.85em; }
                .btn:hover { background: var(--vscode-button-hoverBackground); }

                .diff-container, .content-container {
                    background: var(--vscode-editor-inactiveSelectionBackground);
                    padding: 10px;
                    margin-top: 5px;
                    border-radius: 4px;
                    font-family: monospace;
                    white-space: pre-wrap;
                    font-size: 0.9em;
                }
                
                .diff-added { color: var(--vscode-gitDecoration-addedResourceForeground); }
                .diff-removed { color: var(--vscode-gitDecoration-deletedResourceForeground); text-decoration: line-through; }
            </style>
        </head>
        <body>
            <h3>Prompt Timeline</h3>
            ${statusHeader}
            <div id="timeline">
                ${promptList}
            </div>
            <script>
                const vscode = acquireVsCodeApi();
                const sessionId = '${sessionId || ''}';

                function selectVersion(versionId) {
                    const contentEl = document.getElementById('content-' + versionId);
                    const diffEl = document.getElementById('diff-' + versionId);
                    
                    if (contentEl.style.display === 'none') {
                        contentEl.style.display = 'block';
                        diffEl.style.display = 'block';
                        vscode.postMessage({ type: 'getDiff', sessionId: sessionId, versionId: versionId });
                    } else {
                        contentEl.style.display = 'none';
                        diffEl.style.display = 'none';
                    }
                }

                function restoreVersion(versionId) {
                    vscode.postMessage({ type: 'restore', sessionId: sessionId, versionId: versionId });
                }

                function copyVersion(versionId) {
                     vscode.postMessage({ type: 'restore', sessionId: sessionId, versionId: versionId });
                }

                window.addEventListener('message', event => {
                    const message = event.data;
                    switch (message.type) {
                        case 'showDiff':
                            const diffEl = document.getElementById('diff-' + message.versionId);
                            if (diffEl && message.diff) {
                                let html = '';
                                message.diff.forEach(part => {
                                    const cls = part.added ? 'diff-added' : (part.removed ? 'diff-removed' : '');
                                    html += '<span class="' + cls + '">' + part.value + '</span>';
                                });
                                diffEl.innerHTML = html;
                            } else {
                                diffEl.innerHTML = 'No previous version to diff against.';
                            }
                            break;
                    }
                });
            </script>
        </body>
        </html>`;
    }
}
