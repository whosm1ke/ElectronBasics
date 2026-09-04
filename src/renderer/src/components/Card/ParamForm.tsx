// ParamForm.tsx — the inline "fill in {{placeholder}} values" form that
// appears on a card before a parameterized snippet runs. Ported from
// modules/params.js's buildParamForm(), now real React state instead of an
// imperatively-built DOM fragment inserted before the output panel.
import { useEffect, useRef, useState } from 'react';
import { iconSvg } from '../../lib/icons';
// modules/state.js isn't typed (plain JS, see its own header comment) — see
// useLegacyBus.ts's header comment on why components ported ahead of it
// still reach in directly rather than duplicating its data.
import { state } from '../../../modules/state';

interface Variable {
  name: string;
  value: string;
  secret: boolean;
}

interface ParamFormProps {
  names: string[];
  onRun: (values: Record<string, string>) => void;
  onCancel: () => void;
}

export function ParamForm({ names, onRun, onCancel }: ParamFormProps) {
  const variables = state.variables as Variable[];
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    names.forEach((name) => {
      const known = variables.find((v) => v.name === name);
      initial[name] = known ? known.value : '';
    });
    return initial;
  });
  const firstInputRef = useRef<HTMLInputElement>(null);
  const runBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    firstInputRef.current?.focus();
  }, []);

  return (
    <div className="param-form" onClick={(e) => e.stopPropagation()}>
      {names.map((name, i) => {
        const known = variables.find((v) => v.name === name);
        return (
          <div className="param-row" key={name}>
            <label>{name}</label>
            <input
              ref={i === 0 ? firstInputRef : undefined}
              type={known?.secret ? 'password' : 'text'}
              className="param-input"
              placeholder={`Value for ${name}`}
              value={values[name] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
              onKeyDown={(e) => {
                e.stopPropagation(); // never leak into global shortcuts (digits, Ctrl+…)
                if (e.key === 'Enter') {
                  e.preventDefault();
                  runBtnRef.current?.click();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  onCancel();
                }
              }}
            />
          </div>
        );
      })}
      <div className="param-actions">
        <button
          type="button"
          className="btn btn-ghost btn-small"
          onClick={(e) => {
            e.stopPropagation();
            onCancel();
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          ref={runBtnRef}
          className="btn btn-primary btn-small"
          onClick={(e) => {
            e.stopPropagation();
            onRun(values);
          }}
          dangerouslySetInnerHTML={{ __html: `${iconSvg('play')}<span>Run</span>` }}
        />
      </div>
    </div>
  );
}
