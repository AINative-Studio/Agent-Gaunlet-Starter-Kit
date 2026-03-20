import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { ConnectionOptions } from './types.js';

export async function connectToServer(connection: ConnectionOptions) {
  const client = new Client(
    { name: 'gtc-gauntlet-scout', version: '0.1.0' },
    { capabilities: {} }
  );

  const transport = connection.mode === 'stdio'
    ? new StdioClientTransport({ command: connection.command, args: connection.args, cwd: connection.cwd, stderr: 'inherit' })
    : new StreamableHTTPClientTransport(new URL(connection.url));

  await client.connect(transport);
  return { client, transport };
}
