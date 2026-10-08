// Stable packages within one curriculum scope. Package names are never topic IDs.
export function testPacks(questionIds: string[], size = 10) {
  const ids = [...new Set(questionIds)].sort();
  return Array.from({ length: Math.ceil(ids.length / size) }, (_, index) => ({
    id: 'pack-' + (index + 1), name: 'Test ' + (index + 1),
    questionIds: ids.slice(index * size, (index + 1) * size)
  }));
}
