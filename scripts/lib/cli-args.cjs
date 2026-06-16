function consumeValueFlag(argv, index, names) {
  const aliases = Array.isArray(names) ? names : [names];
  const arg = argv[index];

  for (const name of aliases) {
    const flag = `--${name}`;

    if (arg === flag) {
      const value = argv[index + 1];

      if (!value || value === "--" || value.startsWith("--")) {
        throw new Error(`${flag} requires a value.`);
      }

      return {
        matched: true,
        name,
        nextIndex: index + 1,
        value,
      };
    }

    const prefix = `${flag}=`;

    if (arg.startsWith(prefix)) {
      return {
        matched: true,
        name,
        nextIndex: index,
        value: arg.slice(prefix.length),
      };
    }
  }

  return {
    matched: false,
    nextIndex: index,
    value: undefined,
  };
}

module.exports = {
  consumeValueFlag,
};
