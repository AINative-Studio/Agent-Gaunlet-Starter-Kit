import type { ArtifactKind, ArtifactSignal } from './types.js';

const MIME_HINTS: Array<{ pattern: RegExp; kind: ArtifactKind }> = [
  { pattern: /^text\//i, kind: 'text' },
  { pattern: /^application\/(json|.*\+json)$/i, kind: 'json' },
  { pattern: /^image\//i, kind: 'image' },
  { pattern: /^audio\//i, kind: 'audio' },
  { pattern: /^video\//i, kind: 'video' },
  { pattern: /^application\/(octet-stream|pdf|zip)/i, kind: 'binary' }
];

export function classifyMime(mimeType?: string): ArtifactKind {
  if (!mimeType) return 'unknown';
  const hit = MIME_HINTS.find((item) => item.pattern.test(mimeType));
  return hit?.kind ?? 'unknown';
}

export function detectArtifacts(source: string, payload: unknown, uri?: string, mimeType?: string): ArtifactSignal[] {
  const artifacts: ArtifactSignal[] = [];
  const push = (kind: ArtifactKind, preview: string | undefined, confidence: number, detectedMime?: string) => {
    artifacts.push({ kind, source, uri, mimeType: detectedMime ?? mimeType, preview, confidence });
  };

  const walk = (value: unknown) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.startsWith('data:image/')) push('image', trimmed.slice(0, 80), 0.95, trimmed.slice(5, trimmed.indexOf(';')));
      else if (trimmed.startsWith('data:audio/')) push('audio', trimmed.slice(0, 80), 0.95, trimmed.slice(5, trimmed.indexOf(';')));
      else if (trimmed.startsWith('data:video/')) push('video', trimmed.slice(0, 80), 0.95, trimmed.slice(5, trimmed.indexOf(';')));
      else if (/\.(png|jpg|jpeg|gif|webp)$/i.test(trimmed)) push('image', trimmed, 0.7);
      else if (/\.(mp3|wav|m4a|flac)$/i.test(trimmed)) push('audio', trimmed, 0.7);
      else if (/\.(mp4|mov|webm|mkv)$/i.test(trimmed)) push('video', trimmed, 0.7);
      else if (trimmed.startsWith('{') || trimmed.startsWith('[')) push('json', trimmed.slice(0, 120), 0.7, 'application/json');
      else push('text', trimmed.slice(0, 120), trimmed.length > 0 ? 0.55 : 0.2, mimeType);
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }

    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const maybeMime = typeof record.mimeType === 'string' ? String(record.mimeType) : undefined;
      if (maybeMime) {
        push(classifyMime(maybeMime), JSON.stringify(value).slice(0, 120), 0.9, maybeMime);
      }

      const focusedKeys = ['text', 'blob', 'data', 'content', 'contents', 'messages'];
      const focusedValues = focusedKeys
        .filter((key) => key in record)
        .map((key) => record[key]);

      if (focusedValues.length > 0) {
        focusedValues.forEach(walk);
      } else {
        Object.entries(record)
          .filter(([key]) => !['uri', 'mimeType', 'type', 'role'].includes(key))
          .forEach(([, nested]) => walk(nested));
      }
    }
  };

  const fromMime = classifyMime(mimeType);
  if (fromMime !== 'unknown') push(fromMime, undefined, 0.98, mimeType);
  walk(payload);
  return dedupeArtifacts(artifacts);
}

function dedupeArtifacts(items: ArtifactSignal[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = [item.kind, item.source, item.uri, item.mimeType, item.preview].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
