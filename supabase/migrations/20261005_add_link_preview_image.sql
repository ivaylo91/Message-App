-- The page's preview image (og:image), absolute. The link-preview
-- function serves an image only if a cached preview points at it, so
-- this column is also what keeps that route from being an open proxy.
alter table public.link_previews add column image_url text;

-- The image route looks previews up by image.
create index link_previews_image_url_idx on public.link_previews (image_url)
  where image_url is not null;
