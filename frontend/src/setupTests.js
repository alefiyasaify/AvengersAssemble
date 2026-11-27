// Loaded automatically by react-scripts before every test file.
import "@testing-library/jest-dom";

import { TextDecoder, TextEncoder } from "util";

// React Router 7 needs these; CRA's jsdom does not provide them.
if (!global.TextEncoder) global.TextEncoder = TextEncoder;
if (!global.TextDecoder) global.TextDecoder = TextDecoder;

// antd relies on these browser APIs, which jsdom does not provide.
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  });
}
if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

afterEach(() => {
  window.localStorage.clear();
});
