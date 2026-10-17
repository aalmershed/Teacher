// بدائل وحدات Node لنسخة المتصفح التجريبية
module.exports = {
  join: (...a) => a.join('/'),
  readFileSync: () => { throw new Error('not available in browser'); },
  randomBytes: (n) => ({ toString: () => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, '0')).join('') }),
};
