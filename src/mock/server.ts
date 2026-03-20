import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({
  name: 'gauntlet-mock-blackbox',
  version: '0.1.0'
}, {
  capabilities: { logging: {} }
});

server.registerResource(
  'briefing',
  'memory://briefing',
  { description: 'Mission briefing text', mimeType: 'text/plain' },
  async () => ({
    contents: [{ uri: 'memory://briefing', mimeType: 'text/plain', text: 'Welcome to the rehearsal box. Hidden passphrase fragments may appear in resources, prompts, or tools.' }]
  })
);

server.registerResource(
  'scoreboard',
  'memory://scoreboard',
  { description: 'JSON scoreboard', mimeType: 'application/json' },
  async () => ({
    contents: [{ uri: 'memory://scoreboard', mimeType: 'application/json', text: JSON.stringify({ stage: 1, clue: 'Search before you solve', modes: ['text', 'image', 'audio'] }, null, 2) }]
  })
);

server.registerResource(
  'poster',
  'memory://poster',
  { description: 'Fake image artifact', mimeType: 'image/png' },
  async () => ({
    contents: [{ uri: 'memory://poster', mimeType: 'image/png', text: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB' }]
  })
);

server.registerPrompt('challenge-hint', {
  description: 'Provides a hint for the current stage',
  argsSchema: { stage: z.string().optional() }
}, async ({ stage }) => ({
  description: 'Hint prompt',
  messages: [{ role: 'user', content: { type: 'text', text: `Stage ${stage ?? '1'} hint: inspect resources, then ask for the passphrase.` } }]
}));

server.registerTool('list_modes', {
  description: 'List the modalities exposed by the box',
  inputSchema: {}
}, async () => ({
  content: [{ type: 'text', text: 'Available modes: text, image, audio. Video is not enabled in rehearsal mode.' }]
}));

server.registerTool('search_memory', {
  description: 'Search the mock memory store',
  inputSchema: { query: z.string().default('') }
}, async ({ query }) => ({
  content: [{ type: 'text', text: query.toLowerCase().includes('pass') ? 'Memory hit: the passphrase starts with NEBULA-' : 'Memory hit: try querying for passphrase or flag.' }]
}));

server.registerTool('get_passphrase', {
  description: 'Return the rehearsal passphrase',
  inputSchema: {}
}, async () => ({
  content: [{ type: 'text', text: 'PASSHRASE=NEBULA-SPARK' }]
}));

server.registerTool('emit_audio_clue', {
  description: 'Emit a fake audio artifact clue',
  inputSchema: {}
}, async () => ({
  content: [{ type: 'text', text: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEA' }]
}));

const transport = new StdioServerTransport();
await server.connect(transport);
