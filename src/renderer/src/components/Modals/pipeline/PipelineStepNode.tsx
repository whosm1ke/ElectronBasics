// PipelineStepNode.tsx — the custom React Flow node type ('step') for the
// pipeline canvas: a richer, prettier stand-in for the old bare
// `.pipeline-node` div (name + tiny tag string only). Reuses the exact same
// tag-color-swatch language Card.tsx uses so a step reads as "the same
// snippet" wherever it appears in the app. Purely presentational — all
// interaction (drag, select, connect, delete) is React Flow's own, wired
// from PipelineCanvas.tsx's props on <ReactFlow>.
import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { Snippet } from '@shared/types';
import { snippetIcon, tagColors, SHELL_LABELS } from '../../../lib/utils';
import { state } from '../../../../modules/state';
import type { StepNode } from '../../../lib/pipelineFlow';

function PipelineStepNodeImpl({ data, selected }: NodeProps<StepNode>) {
  const snippet = (state.snippets as Snippet[]).find((s) => s.id === data.snippetId);
  const colors = snippet ? tagColors(snippet.tag) : null;

  return (
    <div className={'pipeline-step-node' + (selected ? ' selected' : '') + (snippet ? '' : ' broken')}>
      <Handle type="target" position={Position.Left} id="in" className="pipeline-handle pipeline-handle-in" />
      {snippet ? (
        <>
          <div className="pipeline-step-node-avatar" style={{ background: colors!.bg }}>
            {snippetIcon(snippet)}
          </div>
          <div className="pipeline-step-node-body">
            <div className="pipeline-step-node-name">{snippet.name}</div>
            <div className="pipeline-step-node-meta">
              {SHELL_LABELS[snippet.shell] || snippet.shell} · {snippet.tag}
            </div>
          </div>
        </>
      ) : (
        <div className="pipeline-step-node-body">
          <div className="pipeline-step-node-name">⚠ Deleted snippet</div>
          <div className="pipeline-step-node-meta">This step has nothing to run — reassign or delete it</div>
        </div>
      )}
      <Handle type="source" position={Position.Right} id="out" className="pipeline-handle pipeline-handle-out" />
    </div>
  );
}

export const PipelineStepNode = memo(PipelineStepNodeImpl);
