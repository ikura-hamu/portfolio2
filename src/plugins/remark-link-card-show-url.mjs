/**
 * Adds a visible, clickable URL after every standalone URL paragraph.
 * remark-link-card-plus then replaces the original paragraph with a card.
 */
export default function remarkLinkCardShowURL() {
  return (tree) => {
    for (let index = 0; index < tree.children.length; index += 1) {
      const url = getStandaloneURL(tree.children[index]);
      if (!url) {
        continue;
      }

      tree.children.splice(index + 1, 0, createURLNode(url));
      index += 1;
    }
  };
}

function getStandaloneURL(node) {
  if (node.type !== "paragraph" || node.children.length !== 1) {
    return undefined;
  }

  const child = node.children[0];
  if (child.type === "text") {
    return normalizeHTTPURL(child.value);
  }

  if (
    child.type === "link" &&
    child.children.length === 1 &&
    child.children[0].type === "text"
  ) {
    const url = normalizeHTTPURL(child.url);
    const labelURL = normalizeHTTPURL(child.children[0].value);
    return url === labelURL ? url : undefined;
  }

  return undefined;
}

function normalizeHTTPURL(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function createURLNode(url) {
  const escapedURL = escapeHTML(url);
  return {
    type: "html",
    value: `<p class="remark-link-card-plus__source-url"><a href="${escapedURL}" target="_blank" rel="noreferrer noopener">${escapedURL}</a></p>`,
  };
}

function escapeHTML(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
