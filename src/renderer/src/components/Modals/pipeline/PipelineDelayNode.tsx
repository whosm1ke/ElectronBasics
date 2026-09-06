// PipelineDelayNode.tsx — the 'delay' node type: a pure wait, no snippet
// involved. Deliberately much plainer than PipelineStepNode (no avatar/tag
// color — there's no snippet to color it by), same Handle wiring.
import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Clock } from 'lucide-react';
import type { DelayNode } from '../../../lib/pipelineFlow';

function PipelineDelayNodeImpl({ data, selected }: NodeProps<DelayNode>) {
  return (
    <div className={'pipeline-mini-node pipeline-mini-node-delay' + (selected ? ' selected' : '')}>
      <Handle type="target" position={Position.Left} id="in" className="pipeline-handle pipeline-handle-in" />
      <Clock size={14} />
      <span>{data.label || `Wait ${data.delaySeconds}s`}</span>
      <Handle type="source" position={Position.Right} id="out" className="pipeline-handle pipeline-handle-out" />
    </div>
  );
}

export const PipelineDelayNode = memo(PipelineDelayNodeImpl);
