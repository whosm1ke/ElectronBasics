// ThemedSelect.tsx — a themed dropdown built on @radix-ui/react-select,
// shared by every componentized <select> in the app (EditorModal's shell
// picker, PipelinesModal's edge-condition picker). Replaces the old
// `.select-wrap` + absolutely-positioned `<svg class="select-chevron">`
// workaround documented in CLAUDE.md's Theming section — that hack existed
// only because a native <select>'s own arrow can't be restyled; Radix's
// trigger is a real element we lay out ourselves, so no overlay trick is
// needed here (the header's plain, non-React sort-mode <select> still uses
// the old .select-wrap pattern — it isn't a React component to begin with,
// so folding it into this one would mean mounting a new React root into a
// static container, a bigger change than a library swap; left as-is).
import * as Select from '@radix-ui/react-select';
import { ChevronDown, Check } from 'lucide-react';

interface ThemedSelectOption<T extends string> {
  value: T;
  label: string;
}

interface ThemedSelectProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: ThemedSelectOption<T>[];
  id?: string;
}

export function ThemedSelect<T extends string>({ value, onChange, options, id }: ThemedSelectProps<T>) {
  return (
    <Select.Root value={value} onValueChange={(v) => onChange(v as T)}>
      <Select.Trigger id={id} className="field-input select-trigger">
        <Select.Value />
        <Select.Icon asChild>
          <ChevronDown size={10} strokeWidth={2.5} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="select-content" position="popper" sideOffset={4}>
          <Select.Viewport className="select-viewport">
            {options.map((o) => (
              <Select.Item key={o.value} value={o.value} className="select-item">
                <Select.ItemText>{o.label}</Select.ItemText>
                <Select.ItemIndicator className="select-item-indicator">
                  <Check size={12} />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
