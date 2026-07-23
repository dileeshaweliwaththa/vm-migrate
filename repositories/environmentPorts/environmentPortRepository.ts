import { createClient } from '@/lib/supabase/server';
import type { EnvironmentPortRow } from '@/types/supabase/response/environmentPorts';

// Repository layer: pure Supabase data access for `environment_ports`.

export type EnvironmentPortWriteColumns = Partial<{
  environment_id: string;
  port: string;
  protocol: string;
  description: string;
  source: string;
  position: number;
}>;

export const insertPort = async (
  values: EnvironmentPortWriteColumns
): Promise<EnvironmentPortRow> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('environment_ports')
    .insert(values)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as EnvironmentPortRow;
};

export const updatePort = async (
  id: string,
  values: EnvironmentPortWriteColumns
): Promise<EnvironmentPortRow> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('environment_ports')
    .update(values)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as EnvironmentPortRow;
};

export const deletePort = async (id: string): Promise<void> => {
  const supabase = await createClient();
  const { error } = await supabase.from('environment_ports').delete().eq('id', id);
  if (error) throw new Error(error.message);
};
