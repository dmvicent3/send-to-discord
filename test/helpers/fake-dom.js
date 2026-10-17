// Minimal element stand-in exposing the DOM properties the pure DOM helpers rely on.
function h(tag, attrs = {}, ...children) {
  const node = {
    tagName: tag.toUpperCase(),
    attrs,
    children,
    parentElement: null,
    get childElementCount() {
      return this.children.length;
    },
    getAttribute(name) {
      return name in this.attrs ? this.attrs[name] : null;
    },
  };
  for (const child of children) child.parentElement = node;
  return node;
}

module.exports = { h };
