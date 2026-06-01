-- Public bucket for cached competitor post thumbnails.
-- The app proxies/caches competitor thumbnails here so they survive Instagram CDN expiry.

insert into storage.buckets (id, name, public)
values ('competitor-thumbnails', 'competitor-thumbnails', true)
on conflict (id) do nothing;

-- Anyone can read thumbnails; only the service role (server routes) writes them.
create policy "public read competitor thumbnails"
  on storage.objects for select
  using (bucket_id = 'competitor-thumbnails');

create policy "service role writes competitor thumbnails"
  on storage.objects for all to service_role
  using (bucket_id = 'competitor-thumbnails')
  with check (bucket_id = 'competitor-thumbnails');
