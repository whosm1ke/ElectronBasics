// PipelineConditionEdge.tsx — the custom React Flow edge type ('condition')
// for the pipeline canvas: a bezier path (BaseEdge) plus a floating pill
// label (EdgeLabelRenderer) showing the branch condition, colored the same
// way the old hand-drawn `.pipeline-edge-label.condition-*` classes were.
// Clicking the label selects the edge (drives the Inspector); the label
// itself carries the click handler since BaseEdge's path is thin and
// `interactionWidth` alone makes clicking the *line* forgiving, not the
// label text.
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';
import { pipelineConditionLabel } from '../../../lib/utils';
import type { ConditionEdge } from '../../../lib/pipelineFlow';

export function PipelineConditionEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected, markerEnd }: EdgeProps<ConditionEdge>) {
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} interactionWidth={20} className={'pipeline-edge-path' + (selected ? ' selected' : '')} />
      <EdgeLabelRenderer>
        <button
          type="button"
          className={`pipeline-edge-label condition-${data?.condition}` + (selected ? ' selected' : '')}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          title="Click to edit · right-click to remove"
          onClick={(e) => {
            e.stopPropagation();
            data?.onSelect();
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            data?.onRemove();
          }}
        >
          {data ? pipelineConditionLabel(data) : ''}
        </button>
      </EdgeLabelRenderer>
    </>
  );
}
