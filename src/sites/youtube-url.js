// Reduces any YouTube video URL to the bare watch link: no timestamp, playlist or tracking parameters.

const WATCH_HOSTS = ["youtube.com", "www.youtube.com", "m.youtube.com"];
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

function youtubeLink(href) {
  let url;
  try {
    url = new URL(href, "https://www.youtube.com");
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  let id = null;
  if (WATCH_HOSTS.includes(host) && url.pathname === "/watch") id = url.searchParams.get("v");
  else if (host === "youtu.be") id = url.pathname.split("/")[1];
  return id && VIDEO_ID.test(id) ? `https://www.youtube.com/watch?v=${id}` : null;
}

if (typeof module !== "undefined") module.exports = { youtubeLink };
