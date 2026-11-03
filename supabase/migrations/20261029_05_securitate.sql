-- =====================================================================
-- Pesticid — întărire securitate (după raportul Supabase advisors)
-- =====================================================================

-- catalogul (strat A + B) e public la citire; scrierea rămâne doar service_role (import)
do $$ declare t text; begin
  foreach t in array array['culturi','daunatori','pesticide','produse','substante','produs_substanta','recomandari','cultura_daunator','daunator_pesticid'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_read on public.%I', t, t);
    execute format('create policy %I_read on public.%I for select using (true)', t, t);
  end loop;
end $$;

-- view-ul rulează cu drepturile celui care întreabă (RLS-ul tabelelor de bază se aplică)
alter view public.v_recomandari set (security_invoker = true);

-- funcțiile interne de RLS nu trebuie expuse prin /rest/v1/rpc
revoke execute on function public.este_membru(uuid), public.poate_edita(uuid), public.ferma_owner_membru(), public.refresh_search_index() from anon, authenticated, public;

-- search_path fix pe toate funcțiile noastre
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('f_unaccent','norm_text','slugify','set_updated_at','parse_doza','parse_unitate','parse_moment',
             'parse_mod_aplicare','parse_nr_tratamente','cauta','recomanda','culturi_pentru_tinta','in_sezon','raporteaza_cautare','culturi_ancestori',
             'este_membru','poate_edita','ferma_owner_membru','refresh_search_index','get_product_detail','refresh_recomandari_view',
             'get_all_crops','get_all_pests','get_popular_searches','get_recommendations','get_recommendations_browse','search_crops','search_pests','track_search')
  loop
    execute format('alter function %s set search_path = public, extensions', f.sig);
  end loop;
end $$;

-- search_index rămâne citibil de anon: e catalog public, read-only, consumat de cauta(). Intenționat.
-- raporteaza_cautare rămâne SECURITY DEFINER + anon: e singurul fel în care un vizitator fără cont poate raporta un termen lipsă. Intenționat.
