const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// --- MOCKS ---
const vscode = {
    DiagnosticSeverity: { Error: 0, Warning: 1 },
    Diagnostic: class { constructor(range, message, severity) { this.range = range; this.message = message; this.severity = severity || 0; } },
    Range: class { constructor(sl, sc, el, ec) { this.start = { line: sl, character: sc }; this.end = { line: el, character: ec }; } },
    EventEmitter: class {
        constructor() { this.listeners = []; }
        fire(e) { this.listeners.forEach(l => l(e)); }
        event(listener) { this.listeners.push(listener); return { dispose: () => { } }; }
    },
    workspace: {
        workspaceFolders: [{ uri: { fsPath: './test_storage' } }],
        getConfiguration: () => ({
            get: (key, def) => {
                if (key === 'sensitivity') return global.sensitivity || def;
                return def;
            }
        })
    },
    Uri: { parse: (s) => ({ fsPath: s, toString: () => s }) },
    ExtensionContext: class { },
    window: {
        showInformationMessage: (msg) => console.log(`[MOCK UI] Info: ${msg}`),
        showWarningMessage: (msg) => console.log(`[MOCK UI] Warn: ${msg}`)
    },
    env: {
        clipboard: {
            text: "",
            writeText: async (t) => { vscode.env.clipboard.text = t; }
        }
    }
};

// --- 2. Load Compiled Modules (Safe Require with Mock)
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function (path) {
    if (path === 'vscode') return vscode;
    return originalRequire.apply(this, arguments);
};

let RuleManager, ContextInjector, MistakeDetector, SmartClipboard;
try {
    RuleManager = require('./out/ruleManager').RuleManager;
    ContextInjector = require('./out/contextInjector').ContextInjector;
    MistakeDetector = require('./out/mistakeDetector').MistakeDetector;
    SmartClipboard = require('./out/smartClipboard').SmartClipboard;
} catch (e) {
    console.error("❌ Failed to load compiled modules. Did you run 'npm run compile'?", e);
    process.exit(1);
}

// --- TEST SUITE ---
async function runTests() {
    console.log("Running Universal AI Whisperer Verification...");

    // 1. Setup Mock Workspace
    const testDir = './test_storage';
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir);

    // 2. Test RuleManager (Base)
    console.log("[Test 1] RuleManager Translation");
    const rm = RuleManager.getInstance();
    const mockFingerprints = [
        { id: '1', count: 5, pattern: 'ts:2322:Type mismatch', ignored: false }
    ];
    const rules = rm.generateRules(mockFingerprints);
    assert.ok(rules.includes("Type mismatch"));
    console.log("✔ RuleManager verified");

    // 3. Test Universal Context Injector
    console.log("[Test 2] Universal File Injection");
    const injector = ContextInjector.getInstance();

    // Targets
    const copilotPath = path.join(testDir, '.github', 'copilot-instructions.md');
    const universalPath = path.join(testDir, 'engram_context.md');

    // Clean start
    if (fs.existsSync(path.dirname(copilotPath))) fs.rmSync(path.dirname(copilotPath), { recursive: true, force: true });
    if (fs.existsSync(universalPath)) fs.unlinkSync(universalPath);

    await injector.updateCursorRules(mockFingerprints);

    assert.ok(fs.existsSync(copilotPath), "Copilot instructions created");
    assert.ok(fs.existsSync(universalPath), "Universal context created");

    const copilotContent = fs.readFileSync(copilotPath, 'utf8');
    assert.ok(copilotContent.includes("ENGRAM AUTO-GENERATED"), "Copilot content injected");
    console.log("   [Files] .github/copilot-instructions.md: content verified ✅");

    const universalContent = fs.readFileSync(universalPath, 'utf8');
    assert.ok(universalContent.includes("ENGRAM AUTO-GENERATED"), "Universal content injected");
    console.log("   [Files] engram_context.md: content verified ✅");

    console.log("   Preview of engram_context.md:\n" + universalContent.split('\n').slice(0, 5).map(l => '   > ' + l).join('\n'));
    console.log("✔ Universal File Injection verified");

    // 4. Test Smart Clipboard
    console.log("[Test 3] Smart Clipboard");
    const clipboard = SmartClipboard.getInstance();

    // Mock Editor
    const mockEditor = {
        selection: {},
        document: { getText: () => "const dangerous = true;" }
    };

    // Need to populate MistakeDetector with mock fingerprints for the global search
    const detector = MistakeDetector.getInstance();
    // Reset private map via 'any' access
    const map = new Map();
    map.set('1', mockFingerprints[0]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Object.defineProperty(detector, 'fingerprints', { value: map });

    await clipboard.copy(mockEditor);

    const clipboardText = vscode.env.clipboard.text;
    console.log("   Clipboard Content Preview:\n" + clipboardText.substring(0, 100) + "...");

    assert.ok(clipboardText.includes("<user_code>"), "Clipboard wrapped code");
    assert.ok(clipboardText.includes("Type mismatch"), "Clipboard included rules");
    console.log("✔ Smart Clipboard verified");

    console.log("\nALL SYSTEMS (Universal AI) READY 🚀");
}

runTests().catch(e => { console.error(e); process.exit(1); });
