// Decides what a Reddit post becomes in Discord: uploaded image files, or a link that embeds.

const EMBED_HOST = "vxreddit.com";

const IMAGE_EXT = { "image/jpg": "jpg", "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp" };

function embedLink(permalink) {
  return `https://${EMBED_HOST}${permalink}`;
}

function isRedditHost(url) {
  try {
    const host = new URL(url, "https://www.reddit.com").hostname.toLowerCase();
    return ["reddit.com", "redd.it"].some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return true;
  }
}

function galleryUrls(src) {
  const urls = [];
  for (const item of src.gallery_data?.items ?? []) {
    const media = src.media_metadata?.[item.media_id];
    if (media?.status !== "valid") continue;
    if (media.s?.gif) urls.push(media.s.gif);
    else if (IMAGE_EXT[media.m]) urls.push(`https://i.redd.it/${item.media_id}.${IMAGE_EXT[media.m]}`);
  }
  return urls;
}

function planRedditShare(post) {
  const src = post.crosspost_parent_list?.[0] ?? post;
  const link = { type: "link", url: embedLink(src.permalink) };
  const files = (urls) => ({ type: "files", urls, fallback: link.url });

  if (src.is_gallery) {
    const urls = galleryUrls(src);
    return urls.length ? files(urls) : link;
  }
  if (src.is_video || src.domain === "v.redd.it") return link;
  if (src.domain === "i.redd.it" || src.post_hint === "image") return files([src.url]);
  if (src.is_self) return link;
  if (src.url && !isRedditHost(src.url)) return { type: "link", url: src.url };
  return link;
}

if (typeof module !== "undefined") module.exports = { EMBED_HOST, embedLink, planRedditShare };
