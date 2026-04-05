import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

const QUERY_KEY = ['tag_color_overrides'];

async function fetchOverrides(): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('tag_color_overrides')
    .select('tag_name, palette_index');
  if (error) throw error;
  const result: Record<string, number> = {};
  for (const row of data ?? []) {
    result[row.tag_name] = row.palette_index;
  }
  return result;
}

async function upsertOverride(tag: string, paletteIndex: number): Promise<void> {
  const { error } = await supabase
    .from('tag_color_overrides')
    .upsert({ tag_name: tag, palette_index: paletteIndex, updated_at: new Date().toISOString() }, { onConflict: 'tag_name' });
  if (error) throw error;
}

export function useTagColorOverrides() {
  const queryClient = useQueryClient();

  const { data: overrides = {} } = useQuery<Record<string, number>>({
    queryKey: QUERY_KEY,
    queryFn: fetchOverrides,
    staleTime: 5 * 60 * 1000,
  });

  const mutation = useMutation({
    mutationFn: ({ tag, paletteIndex }: { tag: string; paletteIndex: number }) =>
      upsertOverride(tag, paletteIndex),
    onMutate: async ({ tag, paletteIndex }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<Record<string, number>>(QUERY_KEY);
      queryClient.setQueryData<Record<string, number>>(QUERY_KEY, old => ({
        ...(old ?? {}),
        [tag]: paletteIndex,
      }));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(QUERY_KEY, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const changeTagColor = (tag: string, paletteIndex: number) =>
    mutation.mutate({ tag, paletteIndex });

  return { overrides, changeTagColor };
}
