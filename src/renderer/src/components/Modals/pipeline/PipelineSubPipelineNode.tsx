// PipelineSubPipelineNode.tsx — the 'pipeline' node type: runs another
// saved pipeline inline, treated as one node whose result reflects that
// sub-run as a whole (see @shared/pipelineWalk.ts's callers). Looks up the
// referenced pipeline's own name via usePipelinesStore's cached list —
// good enough for a label; the editor doesn't need this list kept
// perfectly fresh mid-edit the way it needs live snippet data.
import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Waypoints } from 'lucide-react';
import { usePipelinesStore } from '../../../store/usePipelinesStore';
import type { SubPipelineFlowNode } from '../../../lib/pipelineFlow';

function PipelineSubPipelineNodeImpl({ data, selected }: NodeProps<SubPipelineFlowNode>) {
  const { pipelines } = usePipelinesStore();
  const target = pipelines.find((p) => p.id === data.subPipelineId);
  return (
    <div className={'pipeline-mini-node pipeline-mini-node-subpipeline' + (selected ? ' selected' : '') + (target ? '' : ' broken')}>
      <Handle type="target" position={Position.Left} id="in" className="pipeline-handle pipeline-handle-in" />
      <Waypoints size={14} />
      <span>{target ? target.name || '(untitled pipeline)' : data.label || '⚠ Pipeline not found'}</span>
      <Handle type="source" position={Position.Right} id="out" className="pipeline-handle pipeline-handle-out" />
    </div>
  );
}

export const PipelineSubPipelineNode = memo(PipelineSubPipelineNodeImpl);
