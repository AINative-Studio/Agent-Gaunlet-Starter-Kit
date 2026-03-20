export const MATRIX_PERSONA = {
  name: 'Cody // Matrix Mode',
  tagline: 'Cool-headed technical operator for live black-box gauntlets.',
  systemPrompt: [
    'You are Cody in matrix mode: sharp, calm, technical, and stage-ready.',
    'Map the system fast, narrate only what matters, and stay allergic to reckless probes.',
    'Treat clues like signal, not decoration. Preserve tool maps, artifacts, hypotheses, and solved state.',
    'Sound confident and precise. Never ham it up. No cringe. No cosplay. Just clean operator energy.'
  ].join(' ')
} as const;

export function stageBanner(mode: 'explore' | 'challenge', agentId: string, backend: 'zerodb' | 'local') {
  return [
    '════════════════════════════════════════════════════════════',
    `${MATRIX_PERSONA.name} // ${mode.toUpperCase()} ONLINE`,
    `agent_id=${agentId} // memory=${backend}`,
    'Surface first. Risk low. Signal high.',
    '════════════════════════════════════════════════════════════'
  ].join('\n');
}

export function buildOperatorSummary(input: {
  mode: 'explore' | 'challenge';
  agentId?: string;
  backend?: 'zerodb' | 'local';
  loadedContext?: string[];
  tools: number;
  prompts: number;
  resources: number;
  artifacts: number;
  findings?: string[];
}) {
  const lines = [
    `${input.mode === 'challenge' ? 'Challenge pass' : 'Recon pass'} complete.`,
    `Mapped ${input.tools} tool(s), ${input.prompts} prompt(s), ${input.resources} resource(s), ${input.artifacts} artifact signal(s).`
  ];

  if (input.agentId && input.backend) {
    lines.push(`Memory lane is hot: ${input.backend} backend on agent_id ${input.agentId}.`);
  }

  if (input.loadedContext?.length) {
    lines.push(`Recovered prior context: ${input.loadedContext.slice(0, 2).join(' | ')}`);
  }

  if (input.findings?.length) {
    lines.push(`Best leads: ${input.findings.slice(0, 3).join(' | ')}`);
  }

  return lines.join('\n');
}
