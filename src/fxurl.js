// Rewrites an X/Twitter post link to fxtwitter.com so Discord renders a full embed.

const X_HOSTS = /^(?:www\.|mobile\.)?(?:x|twitter)\.com$/;
const STATUS_PATH = /^\/(\w{1,15}|i\/web)\/status\/(\d+)(?:\/|$)/;

function toFxUrl(href) {
  let url;
  try {
    url = new URL(href, "https://x.com");
  } catch {
    return null;
  }
  if (!X_HOSTS.test(url.hostname)) return null;
  const match = STATUS_PATH.exec(url.pathname);
  if (!match) return null;
  const user = match[1] === "i/web" ? "i" : match[1];
  return `https://fxtwitter.com/${user}/status/${match[2]}`;
}

if (typeof module !== "undefined") module.exports = { toFxUrl };
