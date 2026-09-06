// PipelineGroupNode.tsx — the 'group' node type: runs every member of a
// saved Group inline (each its own row, not collapsed into one the way a
// sub-pipeline is), treated as one node whose result reflects the whole
// group run (see lib/pipelineEngine.ts + main/pipelineRunner.ts's own
// 'group' case). Reads the referenced group's own name straight off
// modules/state.ts — groups are preloaded at app boot (unlike pipelines,
// which PipelineSubPipelineNode.tsx has to get from usePipelinesStore's own
// cached list instead), so no store subscription is needed here.
import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Layers } from 'lucide-react';
import type { Group } from '@shared/types';
import { state } from '../../../../modules/state';
import type { GroupFlowNode } from '../../../lib/pipelineFlow';

function PipelineGroupNodeImpl({ data, selected }: NodeProps<GroupFlowNode>) {
  const target = (state.groups as Group[]).find((g) => g.id === data.groupId);
  return (
    <div className={'pipeline-mini-node pipeline-mini-node-group' + (selected ? ' selected' : '') + (target ? '' : ' broken')}>
      <Handle type="target" position={Position.Left} id="in" className="pipeline-handle pipeline-handle-in" />
      <Layers size={14} />
      <span>{target ? target.name || '(untitled group)' : data.label || '⚠ Group not found'}</span>
      <Handle type="source" position={Position.Right} id="out" className="pipeline-handle pipeline-handle-out" />
    </div>
  );
}

export const PipelineGroupNode = memo(PipelineGroupNodeImpl);
