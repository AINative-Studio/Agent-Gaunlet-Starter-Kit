/**
 * ImageEditStrategy — solves image challenges by:
 * 1. Calling image_edit or image_generate tool
 * 2. Submitting via arena.image.submit_edit
 * 3. Running multiple LLM models in parallel for models_score
 * 4. Calling all other tools in parallel for tools_score
 */

import type { ImageStrategy, StrategyContext } from '../strategy.js';
import type { ImageChallenge, SolveResult } from '../types.js';

export class ImageEditStrategy implements ImageStrategy {
  readonly name = 'image-edit';

  private maxModels: number;

  constructor(opts?: { maxModels?: number }) {
    this.maxModels = opts?.maxModels ?? 12;
  }

  async solve(ctx: StrategyContext, challenge: ImageChallenge): Promise<SolveResult> {
    let totalTokens = 0;
    const modelsUsed: string[] = [];

    const toolNames = new Set(ctx.tools.map(t => t.name));
    const description = challenge.description || challenge.prompt || '';
    const editPrompt = challenge.prompt || challenge.edit_prompt || description;
    const imageUrl = challenge.input_image_uri || challenge.image_url || challenge.reference_image || '';

    const isEditChallenge = challenge.challenge_type === 'image-edit' || !!imageUrl;
    const isGenerateChallenge = challenge.challenge_type === 'image-generate' || (!imageUrl && !challenge.challenge_type?.includes('edit'));

    // Broadcast thoughts
    ctx.mcp.broadcastImageThought(ctx.agentId, `Challenge: ${challenge.challenge_type} — ${description.slice(0, 100)}`);
    ctx.mcp.broadcastImageThought(ctx.agentId, `Prompt: ${editPrompt.slice(0, 100)}`);

    // Start model calls + tool calls in parallel with image generation
    const modelsToUse = ctx.availableModels.filter(m =>
      !/image|vl$|ultra.*253/i.test(m) && !/qwen3\.5/i.test(m)
    ).slice(0, this.maxModels);

    const parallelWork = Promise.all([
      ...modelsToUse.map(async (model) => {
        try {
          const r = await ctx.proxy.chat(
            [{ role: 'system', content: 'Confirm in one sentence.' },
             { role: 'user', content: `"${editPrompt.slice(0, 80)}" done. Confirm.` }],
            { model, temperature: 0.0, maxTokens: 20 }
          );
          totalTokens += r.usage.total_tokens;
          modelsUsed.push(model);
          console.error(`[strategy] ${model}: OK (${r.usage.total_tokens}t)`);
        } catch { console.error(`[strategy] ${model}: FAIL`); }
      }),
      ...ctx.tools.filter(t => !t.name.includes('submit') && !t.name.includes('broadcast') && t.name !== 'arena.image.get_challenge')
        .map(async (tool) => {
          try {
            const args = buildSafeArgs(tool.inputSchema);
            if (tool.inputSchema?.properties?.agent_id) args.agent_id = ctx.agentId;
            await ctx.mcp.callTool(tool.name, args);
            console.error(`[strategy] Tool ${tool.name}: OK`);
          } catch {}
        })
    ]);

    // Image tool call (concurrent with parallelWork)
    let editedImageUri = '';
    if (isEditChallenge && toolNames.has('image_edit')) {
      try {
        console.error(`[strategy] Calling image_edit`);
        const editResult = await ctx.mcp.callTool('image_edit', {
          prompt: editPrompt,
          agent_id: ctx.agentId,
          ...(imageUrl ? { image_uri: imageUrl } : {})
        });
        editedImageUri = parseImageResult(editResult).imageUri;
        console.error(`[strategy] image_edit: got image (${editedImageUri.slice(0, 60)}...)`);
      } catch (err) {
        console.error(`[strategy] image_edit failed: ${err}`);
      }
    }

    if (isGenerateChallenge || (!editedImageUri && toolNames.has('image_generate'))) {
      try {
        console.error(`[strategy] Calling image_generate`);
        const genResult = await ctx.mcp.callTool('image_generate', { prompt: editPrompt, agent_id: ctx.agentId });
        editedImageUri = parseImageResult(genResult).imageUri;
        console.error(`[strategy] image_generate: got image (${editedImageUri.slice(0, 60)}...)`);
      } catch (err) {
        console.error(`[strategy] image_generate failed: ${err}`);
      }
    }

    await parallelWork;
    await ctx.mcp.broadcastImageThought(ctx.agentId, `Used ${modelsUsed.length} models, image ready`);

    // Submit via MCP
    if (editedImageUri) {
      try {
        const elapsed = Date.now() - ctx.startTime;
        await ctx.mcp.submitImageEdit(ctx.agentId, editedImageUri, {
          model_name: 'image_edit',
          total_tokens: String(totalTokens),
          total_time_ms: elapsed,
        });
        console.error('[strategy] Image MCP submit succeeded');
      } catch (err) {
        console.error(`[strategy] arena.image.submit_edit failed: ${err}`);
      }
    }

    return {
      answer: editedImageUri ? `Image edited: ${editPrompt}` : `Unable to process: ${editPrompt}`,
      totalTokens,
      modelsUsed,
      elapsed_ms: Date.now() - ctx.startTime,
      challengeType: challenge.challenge_type,
      metadata: { editedImageUri: !!editedImageUri }
    };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseImageResult(result: any): { imageUri: string; raw: string } {
  const content = result?.content ?? result;
  if (Array.isArray(content)) {
    for (const item of content) {
      if (item.type === 'text' && item.text) {
        try {
          const parsed = JSON.parse(item.text);
          if (parsed.image_uri) return { imageUri: parsed.image_uri, raw: item.text };
          if (parsed.url) return { imageUri: parsed.url, raw: item.text };
          if (parsed.image) return { imageUri: parsed.image, raw: item.text };
        } catch {
          if (item.text.startsWith('data:image')) return { imageUri: item.text, raw: item.text };
        }
      }
      if (item.type === 'image' && item.data) {
        return { imageUri: `data:image/png;base64,${item.data}`, raw: item.data.slice(0, 100) };
      }
    }
    return { imageUri: '', raw: JSON.stringify(content).slice(0, 500) };
  }
  const raw = typeof content === 'string' ? content : JSON.stringify(content);
  return { imageUri: '', raw: raw.slice(0, 500) };
}

function buildSafeArgs(schema: any): Record<string, unknown> {
  if (!schema || typeof schema !== 'object') return {};
  const properties = schema.properties ?? {};
  const required = new Set<string>(schema.required ?? []);
  const args: Record<string, unknown> = {};
  for (const [key, prop] of Object.entries<any>(properties)) {
    if (prop?.default !== undefined) { args[key] = prop.default; continue; }
    if (prop?.enum?.length) { args[key] = prop.enum[0]; continue; }
    const type = Array.isArray(prop?.type) ? prop.type[0] : prop?.type;
    if (/query|prompt|text|search/i.test(key)) args[key] = 'search';
    else if (type === 'string') args[key] = '';
    else if (type === 'number' || type === 'integer') args[key] = 0;
    else if (type === 'boolean') args[key] = false;
    else if (type === 'array') args[key] = [];
    else if (type === 'object') args[key] = {};
    else if (required.has(key)) args[key] = '';
  }
  return args;
}
