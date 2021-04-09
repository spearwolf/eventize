
export const definePublicPropertyRO = (obj, name, value) => {
  Object.defineProperty(obj, name, {
    value,
    configurable: true,
    enumerable: true,
  });
  return obj;
};

export const definePublicPropertiesRO = (obj, attrs) => {
  const keys = Object.keys(attrs);
  const len = keys.length;
  for (let i = 0; i < len; i += 1) {
    definePublicPropertyRO(obj, keys[i], attrs[keys[i]]);
  }
  return obj;
};

export const defineHiddenPropertyRO = (obj, name, value) => {
  Object.defineProperty(obj, name, {
    value,
    configurable: true,
  });
  return obj;
};
