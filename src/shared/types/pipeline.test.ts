// Covers PipelineSchema's handling of the 'group' node kind — added
// alongside step/delay/gate/pipeline to let a pipeline node run every
// member of a saved Group inline. Pins down the same "backfill, don't
// reject" contract every other node kind gets (CLAUDE.md), and specifically
// the "a node with nothing to run is dead weight" filter now covers an
// empty groupId the same way it already covered an empty snippetId.
import { describe, it, expect } from 'vitest';
import { PipelineSchema } from './pipeline';

function basePipeline(nodes: unknown[]) {
  return { name: 'Test', nodes, edges: [] };
}

describe('PipelineSchema — group node kind', () => {
  it('keeps a group node with a groupId set', () => {
    const p = PipelineSchema.parse(basePipeline([{ id: 'n1', kind: 'group', groupId: 'grp-1', x: 0, y: 0 }]));
    expect(p.nodes).toHaveLength(1);
    expect(p.nodes[0].kind).toBe('group');
    expect(p.nodes[0].groupId).toBe('grp-1');
  });

  it('drops a group node with no groupId, same as an empty-snippetId step', () => {
    const p = PipelineSchema.parse(
      basePipeline([
        { id: 'n1', kind: 'group', groupId: '', x: 0, y: 0 },
        { id: 'n2', kind: 'step', snippetId: '', x: 0, y: 0 },
      ])
    );
    expect(p.nodes).toHaveLength(0);
  });

  it('backfills groupId to an empty string for every non-group node kind', () => {
    const p = PipelineSchema.parse(basePipeline([{ id: 'n1', kind: 'delay', delaySeconds: 5, x: 0, y: 0 }]));
    expect(p.nodes[0].groupId).toBe('');
  });

  it('drops an edge pointing at a group node that got filtered out', () => {
    const p = PipelineSchema.parse({
      name: 'Test',
      nodes: [
        { id: 'n1', kind: 'step', snippetId: 's1', x: 0, y: 0 },
        { id: 'n2', kind: 'group', groupId: '', x: 0, y: 0 },
      ],
      edges: [{ id: 'e1', from: 'n1', to: 'n2', condition: 'success' }],
    });
    expect(p.nodes).toHaveLength(1);
    expect(p.edges).toHaveLength(0);
  });
});
