// PipelineGateNode.tsx — the 'gate' node type: pauses an INTERACTIVE run
// for a manual Continue/Abort (see useBatchStore.ts's gate row +
// BatchModal.tsx). Auto-treated as "not satisfied" in an unattended
// (scheduled) run — there's nowhere to ask. Purely presentational here,
// same as every other node component.
import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { ShieldQuestion } from 'lucide-react';
import type { GateNode } from '../../../lib/pipelineFlow';

function PipelineGateNodeImpl({ data, selected }: NodeProps<GateNode>) {
  return (
    <div className={'pipeline-mini-node pipeline-mini-node-gate' + (selected ? ' selected' : '')}>
      <Handle type="target" position={Position.Left} id="in" className="pipeline-handle pipeline-handle-in" />
      <ShieldQuestion size={14} />
      <span>{data.label || 'Approval gate'}</span>
      <Handle type="source" position={Position.Right} id="out" className="pipeline-handle pipeline-handle-out" />
    </div>
  );
}

export const PipelineGateNode = memo(PipelineGateNodeImpl);
