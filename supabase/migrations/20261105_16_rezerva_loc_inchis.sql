-- Se aplică DUPĂ publicarea site-ului care folosește Edge Function `rezerva`:
-- browserul nu mai poate apela direct rezerva_loc (ar ocoli verificarea Turnstile).
revoke execute on function public.rezerva_loc(text, text, text, text) from public, anon, authenticated;
