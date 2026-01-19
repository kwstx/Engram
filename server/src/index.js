#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const zod_1 = require("zod");
const promises_1 = require("fs/promises");
const path_1 = require("path");
// ... (imports)
// Define paths
const HISTORY_DIR = process.env.ENGRAM_HISTORY_DIR || path_1.default.join(process.cwd(), "..", ".engram_history");
// ... (Server initialization)
const server = new index_js_1.Server({
    name: "engram-mcp-server",
    version: "1.1.0",
}, {
    capabilities: {
        tools: {},
        resources: {}, // Enable Resources capability
    },
});
// ... (ensureHistoryDir helper)
async function ensureHistoryDir() {
    try {
        await promises_1.default.access(HISTORY_DIR);
    }
    catch {
        // Only if it doesn't default strictly to an existing dir
        await promises_1.default.mkdir(HISTORY_DIR, { recursive: true });
    }
}
// ----------------------------------------------------------------------------
// RESOURCES (Passive Context)
// ----------------------------------------------------------------------------
server.setRequestHandler(types_js_1.ListResourcesRequestSchema, async () => {
    return {
        resources: [
            {
                uri: "engram://index",
                name: "Engram Rule Index",
                description: "A summary of all coding rules and patterns known to Engram.",
                mimeType: "text/plain",
            }
        ]
    };
});
server.setRequestHandler(types_js_1.ReadResourceRequestSchema, async (request) => {
    await ensureHistoryDir();
    if (request.params.uri === "engram://index") {
        try {
            const files = await promises_1.default.readdir(HISTORY_DIR);
            const rules = [];
            for (const file of files) {
                if (!file.endsWith(".md"))
                    continue;
                // Read first line as title or filename
                const content = await promises_1.default.readFile(path_1.default.join(HISTORY_DIR, file), "utf-8");
                const firstLine = content.split('\n')[0].replace('# ', '').trim();
                rules.push(`- [${file}]: ${firstLine}`);
            }
            const activeRules = rules.join("\n") || "No rules found.";
            return {
                contents: [
                    {
                        uri: "engram://index",
                        mimeType: "text/plain",
                        text: `ENGRAM ACTIVE RULES:\n${activeRules}\n\n(Agent: If user violates these, intervene.)`
                    }
                ]
            };
        }
        catch (error) {
            throw new Error(`Failed to read history: ${error}`);
        }
    }
    throw new Error(`Resource not found: ${request.params.uri}`);
});
// ----------------------------------------------------------------------------
// TOOLS (Active Querying)
// ----------------------------------------------------------------------------
server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => {
    // ... (rest of tool implementation)
    return {
        tools: [
            {
                name: "engram_query",
                description: "Search Engram's local memory for relevant coding rules and past fixes based on a query or error message.",
                inputSchema: {
                    type: "object",
                    properties: {
                        query: {
                            type: "string",
                            description: "The error message, code snippet, or intent to search for.",
                        },
                    },
                    required: ["query"],
                },
            },
            {
                name: "engram_save_rule",
                description: "Save a new coding rule or fix to Engram's local memory.",
                inputSchema: {
                    type: "object",
                    properties: {
                        title: {
                            type: "string",
                            description: "Short title for the rule (e.g. 'Fix Network Timeouts').",
                        },
                        problem: {
                            type: "string",
                            description: "Description of the problem or bad pattern.",
                        },
                        solution: {
                            type: "string",
                            description: "The correct solution or code pattern to use.",
                        },
                    },
                    required: ["title", "problem", "solution"],
                },
            },
        ],
    };
});
server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
    await ensureHistoryDir();
    if (request.params.name === "engram_query") {
        const { query } = zod_1.z
            .object({ query: zod_1.z.string() })
            .parse(request.params.arguments);
        try {
            const files = await promises_1.default.readdir(HISTORY_DIR);
            const results = [];
            for (const file of files) {
                if (!file.endsWith(".md"))
                    continue;
                const content = await promises_1.default.readFile(path_1.default.join(HISTORY_DIR, file), "utf-8");
                // Simple case-insensitive keyword match
                if (content.toLowerCase().includes(query.toLowerCase())) {
                    results.push({
                        file,
                        content,
                    });
                }
            }
            if (results.length === 0) {
                return {
                    content: [
                        {
                            type: "text",
                            text: "No specific rules found in Engram memory for this query.",
                        },
                    ],
                };
            }
            const formattedResults = results
                .map((r) => `--- RULE FOUND: ${r.file} ---\n${r.content}\n----------------`)
                .join("\n\n");
            return {
                content: [
                    {
                        type: "text",
                        text: `Engram Memory Search Results:\n\n${formattedResults}`,
                    },
                ],
            };
        }
        catch (error) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Error querying Engram: ${error instanceof Error ? error.message : String(error)}`,
                    },
                ],
                isError: true,
            };
        }
    }
    if (request.params.name === "engram_save_rule") {
        const { title, problem, solution } = zod_1.z
            .object({
            title: zod_1.z.string(),
            problem: zod_1.z.string(),
            solution: zod_1.z.string()
        })
            .parse(request.params.arguments);
        try {
            const filename = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "_")}.md`;
            const content = `# ${title}\n\n## Problem\n${problem}\n\n## Solution\n${solution}\n\n## Saved\n${new Date().toISOString()}`;
            await promises_1.default.writeFile(path_1.default.join(HISTORY_DIR, filename), content);
            return {
                content: [
                    {
                        type: "text",
                        text: `Successfully saved new rule to Engram memory: ${filename}`,
                    },
                ],
            };
        }
        catch (error) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Error saving rule: ${error instanceof Error ? error.message : String(error)}`,
                    },
                ],
                isError: true,
            };
        }
    }
    throw new Error(`Tool not found: ${request.params.name}`);
});
const transport = new stdio_js_1.StdioServerTransport();
await server.connect(transport);
//# sourceMappingURL=index.js.map