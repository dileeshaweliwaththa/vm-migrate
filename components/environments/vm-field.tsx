'use client';

import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVmOptions } from '@/hooks/vms/useVmOptions';
import type { InlineVmInput } from '@/types/common/project';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export type VmSelection =
  | { mode: 'none' }
  | { mode: 'existing'; vmId: string }
  | { mode: 'new'; newVm: InlineVmInput };

const MODES: { key: VmSelection['mode']; label: string }[] = [
  { key: 'none', label: 'None' },
  { key: 'existing', label: 'Link existing' },
  { key: 'new', label: 'Create new' },
];

// VM picker for the environment form: none / link an existing VM / create a new
// one inline (which the service writes via vmService so it also lands in the
// tracker).
export function VmField({
  value,
  onChange,
}: {
  value: VmSelection;
  onChange: (next: VmSelection) => void;
}) {
  const { data: options } = useVmOptions();
  const [open, setOpen] = useState(false);

  const selectedName =
    value.mode === 'existing' ? options?.find((o) => o.id === value.vmId)?.name : undefined;

  return (
    <div className="space-y-3">
      <Label>Linked VM</Label>
      <div className="flex gap-1">
        {MODES.map((m) => (
          <Button
            key={m.key}
            type="button"
            size="sm"
            variant={value.mode === m.key ? 'default' : 'outline'}
            onClick={() =>
              onChange(
                m.key === 'none'
                  ? { mode: 'none' }
                  : m.key === 'existing'
                    ? { mode: 'existing', vmId: '' }
                    : { mode: 'new', newVm: { name: '' } }
              )
            }
          >
            {m.label}
          </Button>
        ))}
      </div>

      {value.mode === 'existing' ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
              {selectedName ?? 'Select a VM…'}
              <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search VMs…" />
              <CommandList>
                <CommandEmpty>No VMs found.</CommandEmpty>
                <CommandGroup>
                  {(options ?? []).map((o) => (
                    <CommandItem
                      key={o.id}
                      value={o.name}
                      onSelect={() => {
                        onChange({ mode: 'existing', vmId: o.id });
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          value.mode === 'existing' && value.vmId === o.id ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      {o.name || '(unnamed VM)'}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      ) : null}

      {value.mode === 'new' ? (
        <div className="grid grid-cols-2 gap-3 rounded-md border border-border p-3">
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="vm-name" className="text-xs">VM name</Label>
            <Input
              id="vm-name"
              value={value.newVm.name}
              onChange={(e) => onChange({ mode: 'new', newVm: { ...value.newVm, name: e.target.value } })}
              placeholder="prod-web-01"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vm-old" className="text-xs">Old IP</Label>
            <Input
              id="vm-old"
              value={value.newVm.oldIp ?? ''}
              onChange={(e) => onChange({ mode: 'new', newVm: { ...value.newVm, oldIp: e.target.value } })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vm-new" className="text-xs">New IP</Label>
            <Input
              id="vm-new"
              value={value.newVm.newIp ?? ''}
              onChange={(e) => onChange({ mode: 'new', newVm: { ...value.newVm, newIp: e.target.value } })}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
