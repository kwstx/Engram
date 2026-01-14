const assert = require('assert');
const crypto = require('crypto');

// --- MOCKS ---
const vscode = {
    DiagnosticSeverity: { Error: 0, Warning: 1 },
    Diagnostic: class { constructor(range, message, severity) { this.range = range; this.message = message; this.severity = severity || 0; } },
    Range: class { constructor(sl, sc, el, ec) { this.start = { line: sl, character: sc }; this.end = { line: el, character: ec }; } },
    EventEmitter: class { fire() { } event() { } },
    workspace: {
        getConfiguration: () => ({
            get: (key, def) => {
                if (key === 'sensitivity') return global.sensitivity || def;
                return def;
            }
        })
    },
    Uri: { parse: (s) => ({ fsPath: s, toString: () => s }) }
};

// --- LOGIC ADAPTED FROM MISTAKE DETECTOR ---
class MistakeDetector {
    constructor() { this.fingerprints = new Map(); }
    fingerprintError(diag) {
        if (!diag || !diag.message) return { hash: 'invalid' };
        const hash = crypto.createHash('sha256').update(diag.message).digest('hex');
        return { hash };
    }
    processError(diag) {
        const { hash } = this.fingerprintError(diag);
        if (hash === 'invalid') return "IGNORED";

        let fp = this.fingerprints.get(hash);
        if (fp) {
            fp.count++;
            const config = vscode.workspace.getConfiguration('engram');
            const sensitivity = config.get('sensitivity', 'breeze');
            const threshold = sensitivity === 'strict' ? 1 : 2;

            if (fp.count > threshold) return "WARNING_TRIGGERED";
        } else {
            fp = { id: hash, count: 1, fixes: [] };
            this.fingerprints.set(hash, fp);
        }
        return "LOGGED";
    }
    addFix(hash, description, diff) {
        const fp = this.fingerprints.get(hash);
        if (fp) fp.fixes.push({ id: 'fix-1', description, diff });
    }
    getMemoryCard(diag) {
        const { hash } = this.fingerprintError(diag);
        const fp = this.fingerprints.get(hash);
        if (!fp) return null;
        let analysis;
        if (fp.fixes && fp.fixes.length > 0) {
            const f = fp.fixes[0];
            analysis = `This resembles a previous change caused by **${f.description.split(' in ')[0]}**. \n\nYou previously resolved this by modifying ${f.diff.length} characters.`;
        }
        return { frequency: fp.count, analysis: analysis };
    }
}

class SecurityScanner {
    scanText(text) {
        const issues = [];
        if (text.includes('AWS_ACCESS_KEY')) issues.push({ rule: { id: 'no-secrets', risk: 'Critical Security Risk' } });
        if (text.includes('console.log')) issues.push({ rule: { id: 'no-console', risk: 'Low Severity' } });
        return issues;
    }
}

// --- SIMULATION SCRIPT ---
async function runSimulation() {
    const detector = new MistakeDetector();
    const scanner = new SecurityScanner();
    global.sensitivity = 'breeze'; // Default mode

    console.log(`
╔══════════════════════════════════════════════╗
║        ENGRAM EXTENSION SIMULATION           ║
╚══════════════════════════════════════════════╝
`);

    // SCENARIO 1: The "Repeated Mistake"
    // User types code, makes an error, fixes it, then makes it again.

    console.log("\n--- SCENARIO 1: The Recurring Bug ---");
    console.log("USER: *Typing typescript code...*");
    console.log("USER: let x: string = 123; // Error!");

    let diag = new vscode.Diagnostic({}, "Type 'number' is not assignable to type 'string'");
    let result = detector.processError(diag);
    console.log(`ENGRAM: [${result}] First time seeing this error. Indexing...`);

    console.log("USER: *Fixes the bug* (let x: number = 123)");
    // Simulate finding a "fix" in history
    const hash = detector.fingerprintError(diag).hash;
    detector.addFix(hash, "Type mismatch fix", "Changed string to number");

    console.log("USER: *One week later...*");
    console.log("USER: let y: string = 456; // Same error again!");
    result = detector.processError(diag); // Second time
    console.log(`ENGRAM: [${result}] I remember this error from before.`);

    console.log("USER: *Determined to make the mistake again...*");
    console.log("USER: let z: string = 789; // Third time!");
    result = detector.processError(diag); // Third time (Threshold > 2 for Breeze)

    if (result === "WARNING_TRIGGERED") {
        console.log(`ENGRAM: 🛡️ MISTAKE SHIELD ACTIVATED!`);
        const card = detector.getMemoryCard(diag);
        console.log(`        Displaying Memory Card:`);
        console.log(`        "You've made this mistake ${card.frequency} times."`);
        console.log(`        AI Analysis: ${card.analysis}`);
    }

    // SCENARIO 2: Security Check
    console.log("\n--- SCENARIO 2: The Secret ---");
    console.log("USER: *Pastes code block*");
    const riskyCode = "const key = 'AWS_ACCESS_KEY_ID=AKIA...';";
    console.log(`USER: ${riskyCode}`);

    const issues = scanner.scanText(riskyCode);
    if (issues.length > 0) {
        issues.forEach(issue => {
            if (issue.rule.risk.includes('Critical')) {
                console.log(`ENGRAM: 🚨 SECURITY VIBE CHECK FAILED`);
                console.log(`        Detected: ${issue.rule.id} (${issue.rule.risk})`);
                console.log(`        Preventing execution/commit.`);
            }
        });
    }

    console.log("\n--- SIMULATION COMPLETE ---");
}

runSimulation();
