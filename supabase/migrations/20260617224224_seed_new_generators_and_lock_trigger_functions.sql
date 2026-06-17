insert into public.brands (key, name, path, enabled, entitlement_scope)
values
  ('print', 'Forget About Print', 'print', true, 'brand'),
  ('paint', 'Forget About Paint', 'paint', true, 'brand'),
  ('stitch', 'Forget About Stitch', 'stitch', true, 'brand')
on conflict (key) do update set
  name = excluded.name,
  path = excluded.path,
  enabled = excluded.enabled,
  entitlement_scope = excluded.entitlement_scope;

insert into public.generator_definitions (type, name, current_version, parameter_catalogue_type, enabled)
values
  ('uploaded_print', 'Uploaded STL print', 1, 'uploaded_stl', true),
  ('paint_station', 'Paint station', 1, 'paint_bottles', true),
  ('stitch_organizer', 'Stitch organizer', 1, 'thread_references', true)
on conflict (type) do update set
  name = excluded.name,
  current_version = excluded.current_version,
  parameter_catalogue_type = excluded.parameter_catalogue_type,
  enabled = excluded.enabled;

insert into public.brand_generators (brand_key, generator_type, enabled)
values
  ('print', 'uploaded_print', true),
  ('paint', 'paint_station', true),
  ('stitch', 'stitch_organizer', true)
on conflict (brand_key, generator_type) do update set enabled = excluded.enabled;

revoke execute on function public.enforce_print_job_financial_state() from anon, authenticated, public;
revoke execute on function public.enforce_provider_transfer_completion() from anon, authenticated, public;
revoke execute on function public.handle_new_user() from anon, authenticated, public;
