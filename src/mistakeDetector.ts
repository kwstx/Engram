import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { MistakeFingerprint } from './types';

export class MistakeDetector {
    private static instance: MistakeDetector;
    private disposables: vscode.Disposable[] = [];
    private fingerprints: Map<string, MistakeFingerprint> = new Map();
    private storagePath: string | null = null;
    private initialized: boolean = false;

    private constructor() { }

    public static getInstance(): MistakeDetector {
        if (!MistakeDetector.instance) {
            MistakeDetector.instance = new MistakeDetector();
        }
        return MistakeDetector.instance;
    }

    public init(storagePath: string) {
        if (this.initialized) return;
        this.storagePath = storagePath;
        if (!fs.existsSync(storagePath)) {
            fs.mkdirSync(storagePath, { recursive: true });
        }
        this.loadFingerprints();
        this.initialized = true;
    }

    private getFilePath(): string {
        if (!this.storagePath) throw new Error("Storage path not initialized");
        return path.join(this.storagePath, 'fingerprints.json');
    }

    private async loadFingerprints() {
        try {
            const filePath = this.getFilePath();
            if (fs.existsSync(filePath)) {
                const data = await fs.promises.readFile(filePath, 'utf8');
                const list = JSON.parse(data) as MistakeFingerprint[];
                list.forEach(f => this.fingerprints.set(f.id, f));
                console.log(`[MistakeDetector] Loaded ${list.length} fingerprints.`);
            }
        } catch (e) {
            console.error("[MistakeDetector] Failed to load fingerprints:", e);
        }
    }

    private async saveFingerprints() {
        if (!this.storagePath) return;
        try {
            const list = Array.from(this.fingerprints.values());
            await fs.promises.writeFile(this.getFilePath(), JSON.stringify(list, null, 2), 'utf8');
        } catch (e) {
            console.error("[MistakeDetector] Failed to save fingerprints:", e);
        }
    }

    public startListening(context: vscode.ExtensionContext) {
        // Listen for diagnostic changes
        const diagnosticDisposable = vscode.languages.onDidChangeDiagnostics(e => this.handleDiagnosticsChange(e));
        context.subscriptions.push(diagnosticDisposable);
        this.disposables.push(diagnosticDisposable);
        console.log('[MistakeDetector] Started listening to diagnostics.');
    }

    private async handleDiagnosticsChange(event: vscode.DiagnosticChangeEvent) {
        for (const uri of event.uris) {
            const diagnostics = vscode.languages.getDiagnostics(uri);
            const errors = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Error);

            for (const error of errors) {
                const { hash, normalized, code } = this.fingerprintError(error);

                // Create or Update Fingerprint
                if (this.fingerprints.has(hash)) {
                    const existing = this.fingerprints.get(hash)!;
                    existing.count++;
                    existing.lastSeen = Date.now();
                } else {
                    const newFingerprint: MistakeFingerprint = {
                        id: hash,
                        language: 'unknown', // TODO: detect language from document
                        detectionMethod: 'diagnostic',
                        pattern: normalized,
                        count: 1,
                        lastSeen: Date.now()
                    };
                    this.fingerprints.set(hash, newFingerprint);
                }

                await this.saveFingerprints();
            }
        }
    }

    public fingerprintError(diagnostic: vscode.Diagnostic): { hash: string, normalized: string, code: string } {
        // 1. Normalize
        // Remove quotes around variable names to make it generic? 
        // E.g. "Property 'foo' does not exist" -> "Property '' does not exist"
        // This allows catching the *class* of error.

        let message = diagnostic.message;

        // Simple heuristic: Replace text in single quotes with placeholder
        const normalizedMessage = message.replace(/'[^']*'/g, "'...'").replace(/"[^"]*"/g, '"..."');

        // Include source and code if available (e.g. 'ts(2339)')
        const source = diagnostic.source || '';
        const code = String(diagnostic.code || '');

        const fullSignature = `${source}:${code}:${normalizedMessage}`;

        // 2. Hash
        const hash = crypto.createHash('sha256').update(fullSignature).digest('hex');

        return {
            hash,
            normalized: fullSignature,
            code: String(diagnostic.code || '')
        };
    }

    public dispose() {
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }
}
