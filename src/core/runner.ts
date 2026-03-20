import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { remember, type MemoryContext } from './memory.js';
import type { ChallengeReport } from './types.js';
import { exploreServer } from './explorer.js';

export async function runChallenge(
  client: Client,
  connection: ChallengeReport['connection'],
  goal: string,
  memory?: MemoryContext
): Promise<ChallengeReport> {
  const base = await exploreServer(client, connection, memory);
  const findings: string[] = [];
  const recommendedNextActions: string[] = [];

  const interestingTools = base.capabilityMap.tools.filter((tool) => tool.name.match(/find|search|list|get|read|hint|challenge|solve|flag|secret|pass/i));
  const lowRiskTools = interestingTools.length > 0 ? interestingTools : base.capabilityMap.tools.filter((tool) => tool.safeProbe !== null).slice(0, 3);

  for (const tool of lowRiskTools) {
    try {
      const result: any = await client.callTool({ name: tool.name, arguments: tool.safeProbe ?? {} });
      const text = JSON.stringify(result.content ?? result);
      findings.push(`Tool ${tool.name}: ${text.slice(0, 240)}`);
      if (looksLikeChallengePayload(text)) {
        findings.push(`Potential challenge payload found in tool ${tool.name}.`);
      }
    } catch (error) {
      findings.push(`Tool ${tool.name} failed during challenge run: ${String(error)}`);
    }
  }

  for (const probe of base.probes) {
    if (probe.ok && /artifact/i.test(probe.summary)) {
      findings.push(`${probe.type} ${probe.name} exposed multimodal clues.`);
    }
  }

  if (base.capabilityMap.artifacts.length > 0) {
    const artifactSummary = Array.from(new Set(base.capabilityMap.artifacts.map((a) => a.kind))).join(', ');
    findings.push(`Artifact classes detected: ${artifactSummary}.`);
  }

  const solved = findings.some((line) => /potential challenge payload found|solved|passphrase|flag|secret|answer|code/i.test(line));

  recommendedNextActions.push('Start with list/read/get/search style tools before mutating tools.');
  recommendedNextActions.push('Scan resource URIs and prompt arguments for hidden IDs, paths, or passphrase hints.');
  recommendedNextActions.push('If an image/audio/video artifact appears, export or inspect it immediately instead of ignoring it.');
  recommendedNextActions.push(`Goal tracked for operator: ${goal}`);

  if (memory) {
    await remember(memory, [
      {
        category: 'attempt',
        text: `Challenge attempt for goal: ${goal}`,
        metadata: { goal, findings, recommendedNextActions, connection, prioritizedTools: lowRiskTools.map((tool) => tool.name) }
      },
      {
        category: 'hypothesis',
        text: `Hypothesis: prioritize tools ${lowRiskTools.map((tool) => tool.name).join(', ') || 'none'} for goal ${goal}`,
        metadata: { goal, tools: lowRiskTools.map((tool) => tool.name) }
      },
      {
        category: 'challenge-state',
        text: solved ? `Solved state likely reached for goal ${goal}` : `Goal ${goal} remains unsolved after current pass`,
        metadata: { goal, solved, findings }
      }
    ]);
  }

  return {
    ...base,
    goal,
    findings,
    recommendedNextActions
  };
}

function looksLikeChallengePayload(text: string) {
  return /(passphrase|passhrase|flag|secret|answer|code)\s*[:=]/i.test(text)
    || /flag\s*\{/i.test(text)
    || /(passphrase|passhrase)\s+[A-Z0-9_-]{4,}/i.test(text);
}
