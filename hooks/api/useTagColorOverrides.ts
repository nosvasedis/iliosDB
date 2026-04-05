import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

const QUERY_KEY = ['tag_color_overrides'];
const LS_KEY = 'orders-tag-color-overrides';

function readFromLocalStorage(): Record<string, number> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeToLocalStorage(overrides: Record<string, number>) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(overrides));
  } catch { /* ignore quota errors */ }
}

async function fetchOverrides(): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('tag_color_overrides')
    .select('tag_name, palette_index');
  if (error) throw error;
  const result: Record<string, number> = {};
  for (const row of data ?? []) {
    result[row.tag_name] = row.palette_index;
  }
  // Keep localStorage in sync with the authoritative Supabase data
  writeToLocalStorage(result);
  return result;
}

async function upsertOverride(tag: string, paletteIndex: number): Promise<void> {
  const { error } = await supabase
    .from('tag_color_overrides')
    .upsert(
      { tag_name: tag, palette_index: paletteIndex, updated_at: new Date().toISOString() },
      { onConflict: 'tag_name' }
    );
  if (error) throw error;
}

export function useTagColorOverrides() {
  const queryClient = useQueryClient();

  const { data: overrides = {} } = useQuery<Record<string, number>>({
    queryKey: QUERY_KEY,
    queryFn: fetchOverrides,
    staleTime: 5 * 60 * 1000,
    // Seed the cache from localStorage so the very first render uses the
    // correct colors instead of showing the deterministic fallback.
    initialData: readFromLocalStorage,
  });

  const mutation = useMutation({
    mutationFn: ({ tag, paletteIndex }: { tag: string; paletteIndex: number }) =>
      upsertOverride(tag, paletteIndex),
    onMutate: async ({ tag, paletteIndex }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<Record<string, number>>(QUERY_KEY);
      const next = { ...(previous ?? {}), [tag]: paletteIndex };
      queryClient.setQueryData<Record<string, number>>(QUERY_KEY, next);
      // Persist immediately so the next navigation also sees it instantly
      writeToLocalStorage(next);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(QUERY_KEY, context.previous);
        writeToLocalStorage(context.previous);
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
