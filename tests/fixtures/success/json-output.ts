const result = {
  success: true,
  data: {
    number: 42,
    string: 'test',
    array: [1, 2, 3],
    object: { key: 'value' },
  },
  timestamp: new Date().toISOString(),
};

console.log(JSON.stringify(result));
