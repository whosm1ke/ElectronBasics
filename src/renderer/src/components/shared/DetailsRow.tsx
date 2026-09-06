// DetailsRow.tsx — the label/value row DetailsModal.tsx (a snippet's Details
// panel) and GroupDetailsModal.tsx (a group's own equivalent) both use for
// their read-only info list. Pulled out once two modals needed the exact
// same six lines rather than a second copy — see style.css's `.details-row`
// section for the (already fully generic, not snippet-specific) styling.
import type { ReactNode } from 'react';

export function DetailsRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="details-row">
      <div className="details-row-label">{label}</div>
      <div className="details-row-value">{children}</div>
    </div>
  );
}
