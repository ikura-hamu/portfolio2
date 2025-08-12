const urlRegex =
  /http(s)?:\/\/([a-zA-Z0-9-_]+\.)+[a-zA-Z]+(\/[a-zA-Z0-9-_]+)*(\/#[.\S]+)*/g;

const replaceURL = (content: String) => {
  return content.replaceAll(urlRegex, (url) => {
    return `<a href="${url}" target="_blank">${url}</a>`;
  });
};

export { replaceURL };
