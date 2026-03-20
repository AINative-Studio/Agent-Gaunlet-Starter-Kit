import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { detectArtifacts } from './artifacts.js';
import { remember, type MemoryContext } from './memory.js';
import type { CapabilityMap, ExploreReport } from './types.js';
import { short } from './utils.js';

export async function exploreServer(
  client: Client,
  connection: ExploreReport['connection'],
  memory?: MemoryContext
): Promise<ExploreReport> {
  const notes: string[] = [];
  const probes: ExploreReport['probes'] = [];

  const init = client.getServerVersion();
  const capabilityMap: CapabilityMap = {
    server: {
      name: init?.name,
      version: init?.version,
      protocolVersion: undefined,
      instructions: client.getInstructions()
    },
    tools: [],
    prompts: [],
    resources: [],
    resourceTemplates: [],
    artifacts: [],
    notes
  };

  if (memory?.loadedContext?.length) {
    notes.push(`Recovered ${memory.loadedContext.length} prior memory item(s) for agent ${memory.agentId}.`);
  }

  try {
    const toolsResult = await client.listTools();
    capabilityMap.tools = (toolsResult.tools ?? []).map((tool: any) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: tool.annotations,
      safeProbe: buildSafeProbe(tool.inputSchema)
    }));
    notes.push(`Discovered ${capabilityMap.tools.length} tool(s).`);
  } catch (error) {
    notes.push(`Tool discovery failed: ${String(error)}`);
  }

  try {
    const promptsResult = await client.listPrompts();
    capabilityMap.prompts = (promptsResult.prompts ?? []).map((prompt: any) => ({
      name: prompt.name,
      description: prompt.description,
      arguments: prompt.arguments
    }));
    notes.push(`Discovered ${capabilityMap.prompts.length} prompt(s).`);
  } catch (error) {
    notes.push(`Prompt discovery failed: ${String(error)}`);
  }

  try {
    const resourcesResult = await client.listResources();
    capabilityMap.resources = (resourcesResult.resources ?? []).map((resource: any) => ({
      name: resource.name,
      uri: resource.uri,
      description: resource.description,
      mimeType: resource.mimeType
    }));
    const templatesResult = await client.listResourceTemplates();
    capabilityMap.resourceTemplates = (templatesResult.resourceTemplates ?? []).map((resource: any) => ({
      name: resource.name,
      uriTemplate: resource.uriTemplate,
      description: resource.description,
      mimeType: resource.mimeType
    }));
    notes.push(`Discovered ${capabilityMap.resources.length} fixed resource(s) and ${capabilityMap.resourceTemplates.length} template(s).`);
  } catch (error) {
    notes.push(`Resource discovery failed: ${String(error)}`);
  }

  for (const resource of capabilityMap.resources.slice(0, 8)) {
    try {
      const result: any = await client.readResource({ uri: resource.uri });
      const contents = result.contents ?? [];
      const artifacts = detectArtifacts(`resource:${resource.uri}`, contents, resource.uri, resource.mimeType);
      capabilityMap.artifacts.push(...artifacts);
      probes.push({
        type: 'resource',
        name: resource.uri,
        ok: true,
        summary: `Read ${contents.length} content item(s); ${artifacts.length} artifact signal(s).`,
        detail: summarizeContents(contents)
      });
    } catch (error) {
      probes.push({ type: 'resource', name: resource.uri, ok: false, summary: `Read failed: ${String(error)}` });
    }
  }

  for (const prompt of capabilityMap.prompts.slice(0, 5)) {
    try {
      const args = buildPromptArgs(prompt.arguments);
      const result: any = await client.getPrompt({ name: prompt.name, arguments: args });
      const artifacts = detectArtifacts(`prompt:${prompt.name}`, result.messages ?? []);
      capabilityMap.artifacts.push(...artifacts);
      probes.push({
        type: 'prompt',
        name: prompt.name,
        ok: true,
        summary: `Fetched prompt with ${result.messages?.length ?? 0} message(s).`,
        detail: { args, description: short(result.description ?? '') }
      });
    } catch (error) {
      probes.push({ type: 'prompt', name: prompt.name, ok: false, summary: `Fetch failed: ${String(error)}` });
    }
  }

  for (const tool of capabilityMap.tools.slice(0, 6)) {
    if (tool.safeProbe === null) {
      probes.push({ type: 'tool', name: tool.name, ok: false, summary: 'Skipped: no safe probe inferred.' });
      continue;
    }
    try {
      const result: any = await client.callTool({ name: tool.name, arguments: tool.safeProbe });
      const artifacts = detectArtifacts(`tool:${tool.name}`, result.content ?? result);
      capabilityMap.artifacts.push(...artifacts);
      probes.push({
        type: 'tool',
        name: tool.name,
        ok: !result.isError,
        summary: result.isError ? `Tool returned error: ${short(result.content)}` : `Tool executed with ${artifacts.length} artifact signal(s).`,
        detail: { args: tool.safeProbe, content: summarizeContents(result.content ?? []) }
      });
    } catch (error) {
      probes.push({ type: 'tool', name: tool.name, ok: false, summary: `Call failed: ${String(error)}` });
    }
  }

  capabilityMap.artifacts = dedupe(capabilityMap.artifacts);

  if (memory) {
    await remember(memory, [
      {
        category: 'discovery',
        text: `Discovery snapshot for ${capabilityMap.server.name ?? 'unknown-server'}: ${capabilityMap.tools.length} tools, ${capabilityMap.prompts.length} prompts, ${capabilityMap.resources.length} resources, ${capabilityMap.artifacts.length} artifact signals.`,
        metadata: { connection, notes, probes }
      },
      ...capabilityMap.tools.map((tool) => ({
        category: 'schema' as const,
        text: `Tool schema ${tool.name}: ${JSON.stringify(tool.inputSchema ?? {})}`,
        metadata: { type: 'tool', name: tool.name, schema: tool.inputSchema, safeProbe: tool.safeProbe, annotations: tool.annotations }
      })),
      ...capabilityMap.resources.map((resource) => ({
        category: 'schema' as const,
        text: `Resource ${resource.uri}: mime=${resource.mimeType ?? 'unknown'} description=${resource.description ?? ''}`,
        metadata: { type: 'resource', ...resource }
      })),
      ...capabilityMap.prompts.map((prompt) => ({
        category: 'schema' as const,
        text: `Prompt ${prompt.name}: args=${JSON.stringify(prompt.arguments ?? [])}`,
        metadata: { type: 'prompt', ...prompt }
      })),
      ...capabilityMap.artifacts.map((artifact) => ({
        category: 'artifact' as const,
        text: `Artifact ${artifact.kind} from ${artifact.source}${artifact.uri ? ` at ${artifact.uri}` : ''}`,
        metadata: artifact as unknown as Record<string, unknown>
      }))
    ]);
  }

  return {
    timestamp: new Date().toISOString(),
    connection,
    memory: memory ? { agentId: memory.agentId, backend: memory.backend, loadedContext: memory.loadedContext } : undefined,
    capabilityMap,
    probes
  };
}

function buildSafeProbe(schema: any): Record<string, unknown> | null {
  if (!schema || typeof schema !== 'object') return {};
  const properties = schema.properties ?? {};
  const required = new Set<string>(schema.required ?? []);
  const args: Record<string, unknown> = {};

  for (const [key, prop] of Object.entries<any>(properties)) {
    const sample = sampleValueForSchema(prop, key);
    if (sample !== undefined) args[key] = sample;
    else if (required.has(key)) return null;
  }

  return args;
}

function sampleValueForSchema(schema: any, key: string): unknown {
  const type = Array.isArray(schema?.type) ? schema.type[0] : schema?.type;
  if (schema?.default !== undefined) return schema.default;
  if (schema?.enum?.length) return schema.enum[0];
  if (/id|uuid|token|secret|password/i.test(key)) return undefined;
  if (/url|uri/i.test(key)) return 'https://example.com';
  if (/path|file/i.test(key)) return '/tmp/demo';
  if (/query|prompt|message|text|goal|topic|name/i.test(key)) return 'demo';
  if (type === 'string') return '';
  if (type === 'number' || type === 'integer') return 0;
  if (type === 'boolean') return false;
  if (type === 'array') return [];
  if (type === 'object') return {};
  return undefined;
}

function buildPromptArgs(argsSchema: any): Record<string, string> {
  const args: Record<string, string> = {};
  for (const arg of argsSchema ?? []) {
    args[arg.name] = /url|uri/i.test(arg.name) ? 'https://example.com' : 'demo';
  }
  return args;
}

function summarizeContents(contents: any[]) {
  return contents.map((item) => {
    if (item?.type === 'text') return { type: 'text', text: short(item.text) };
    if (item?.mimeType) return { type: item.type ?? 'blob', mimeType: item.mimeType, uri: item.uri, text: short(item.text ?? item.blob ?? '') };
    return item;
  });
}

function dedupe<T>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = JSON.stringify(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
